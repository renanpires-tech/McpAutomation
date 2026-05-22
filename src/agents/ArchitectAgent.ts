import { EventEmitter } from "events";
import type {
  PatternDetection, ArchitectValidation, ServiceMapEdge, ServiceMapNode,
  Domain, Risk,
} from "./types.js";

// ─────────────────────────────────────────────
//  ArchitectAgent
// ─────────────────────────────────────────────

export class ArchitectAgent {
  constructor(private emitter: EventEmitter) {}

  validate(code: string, detections: PatternDetection[], tests: string): ArchitectValidation {
    const missing: string[] = [];
    const spofAlerts: string[] = [];
    const edges: ServiceMapEdge[] = [];
    const nodes: ServiceMapNode[] = [];

    const primary = detections[0];

    // ── Check test completeness ─────────────────

    if (primary.pattern === "feign_client" || primary.pattern === "webhook_handler") {
      if (!tests.toLowerCase().includes("timeout")) {
        missing.push("Teste de timeout para chamada externa");
      }
      if (!tests.toLowerCase().includes("fallback") && !tests.toLowerCase().includes("circuit")) {
        missing.push("Teste de fallback / circuit breaker");
      }
    }

    if (primary.pattern === "feign_client") {
      if (!tests.toLowerCase().includes("5xx") && !tests.toLowerCase().includes("unavailable")) {
        missing.push("Teste de comportamento com serviço downstream indisponível");
      }
    }

    if (primary.pattern === "kafka_consumer") {
      if (!tests.toLowerCase().includes("idempotent") && !tests.toLowerCase().includes("idempoten")) {
        missing.push("Teste de idempotência para eventos duplicados");
      }
    }

    // ── Extract service dependencies ────────────

    const serviceEdge = this.extractServiceEdge(code, primary.domain);
    if (serviceEdge) {
      edges.push(serviceEdge);
      nodes.push(
        { id: "current", name: "CurrentService", tech: "Spring Boot", domain: primary.domain, risk: primary.risk },
        { id: serviceEdge.to, name: serviceEdge.to, tech: "external", domain: "unknown" as Domain, risk: "ALTO" as Risk },
      );
    }

    // ── SPOF detection ──────────────────────────

    if (primary.pattern === "feign_client") {
      if (!code.includes("timeout") && !code.includes("connectTimeout")) {
        spofAlerts.push("🚨 Chamada externa SEM timeout — risco de thread starvation");
      }
      if (!code.includes("@CircuitBreaker") && !code.includes("Resilience4j") && !code.includes("hystrix")) {
        spofAlerts.push("🚨 Sem circuit breaker — falha em cascata possível");
      }
    }

    if (primary.pattern === "webhook_handler" && primary.domain === "payment") {
      if (!code.includes("timeout") && !code.includes("connectTimeout")) {
        spofAlerts.push("🚨 Chamada síncrona para pagamento SEM timeout");
      }
    }

    if (primary.pattern === "kafka_consumer") {
      if (!code.includes("retry") && !code.includes("RetryConfig")) {
        spofAlerts.push("⚠️ Consumer Kafka sem retry configurado");
      }
    }

    const approved = missing.length === 0;

    if (approved) {
      this.emitter.emit("test_approved", {
        type: "test_approved",
        source: "ARCHITECT",
        payload: { pattern: primary.pattern },
      });
    } else {
      this.emitter.emit("test_needs_refinement", {
        type: "test_needs_refinement",
        source: "ARCHITECT",
        payload: { missing, pattern: primary.pattern },
      });
    }

    for (const alert of spofAlerts) {
      this.emitter.emit("spof_detected", {
        type: "spof_detected",
        source: "ARCHITECT",
        payload: { alert },
      });
    }

    return { approved, missing_coverage: missing, spof_alerts: spofAlerts, service_edges: edges, service_nodes: nodes };
  }

  buildArchitectureNotes(validation: ArchitectValidation): string[] {
    const notes: string[] = [];

    for (const alert of validation.spof_alerts) {
      notes.push(alert);
    }

    if (validation.service_edges.length > 0) {
      for (const edge of validation.service_edges) {
        const badges = [
          edge.has_timeout ? "✅ timeout" : "❌ sem timeout",
          edge.has_retry ? "✅ retry" : "❌ sem retry",
          edge.has_circuit_breaker ? "✅ circuit breaker" : "❌ sem circuit breaker",
        ];
        notes.push(`Dependência mapeada: ${edge.from} → ${edge.to} [${edge.type}] | ${badges.join(" | ")}`);
      }
    }

    return notes;
  }

  private extractServiceEdge(code: string, domain: Domain): ServiceMapEdge | null {
    const feignMatch = code.match(/@FeignClient\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/);
    const urlMatch = code.match(/(?:url|baseUrl)\s*=\s*["']([^"']+)["']/);

    const target = feignMatch?.[1] ?? urlMatch?.[1] ?? null;
    if (!target) return null;

    return {
      from: domain,
      to: target,
      type: "REST",
      has_timeout: code.includes("timeout") || code.includes("connectTimeout"),
      has_retry: code.includes("retry") || code.includes("@Retryable"),
      has_circuit_breaker: code.includes("@CircuitBreaker") || code.includes("Resilience4j"),
      occurrences: 1,
    };
  }
}
