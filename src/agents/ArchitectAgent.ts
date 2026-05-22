import { EventEmitter } from "node:events";
import type {
  PatternDetection, ArchitectValidation, ServiceMapEdge, ServiceMapNode,
  Domain, Risk,
} from "./types.js";

// ─────────────────────────────────────────────
//  ArchitectAgent
// ─────────────────────────────────────────────

export class ArchitectAgent {
  constructor(private readonly emitter: EventEmitter) {}

  validate(code: string, detections: PatternDetection[], tests: string): ArchitectValidation {
    const primary = detections[0];
    const missing = this.checkTestCompleteness(primary.pattern, tests);
    const spofAlerts = this.checkSpof(code, primary.pattern, primary.domain);
    const { edges, nodes } = this.extractDependencies(code, primary);
    const approved = missing.length === 0;

    if (approved) {
      this.emitter.emit("test_approved", { type: "test_approved", source: "ARCHITECT", payload: { pattern: primary.pattern } });
    } else {
      this.emitter.emit("test_needs_refinement", { type: "test_needs_refinement", source: "ARCHITECT", payload: { missing, pattern: primary.pattern } });
    }
    for (const alert of spofAlerts) {
      this.emitter.emit("spof_detected", { type: "spof_detected", source: "ARCHITECT", payload: { alert } });
    }

    return { approved, missing_coverage: missing, spof_alerts: spofAlerts, service_edges: edges, service_nodes: nodes };
  }

  private checkTestCompleteness(pattern: string, tests: string): string[] {
    const missing: string[] = [];
    const t = tests.toLowerCase();

    if (pattern === "feign_client" || pattern === "webhook_handler") {
      if (!t.includes("timeout")) missing.push("Teste de timeout para chamada externa");
      if (!t.includes("fallback") && !t.includes("circuit")) missing.push("Teste de fallback / circuit breaker");
    }
    if (pattern === "feign_client" && !t.includes("5xx") && !t.includes("unavailable")) {
      missing.push("Teste de comportamento com serviço downstream indisponível");
    }
    if (pattern === "kafka_consumer" && !t.includes("idempotent") && !t.includes("idempoten")) {
      missing.push("Teste de idempotência para eventos duplicados");
    }

    return missing;
  }

  private checkSpof(code: string, pattern: string, domain: string): string[] {
    const alerts: string[] = [];

    if (pattern === "feign_client") {
      if (!code.includes("timeout") && !code.includes("connectTimeout")) {
        alerts.push("🚨 Chamada externa SEM timeout — risco de thread starvation");
      }
      if (!code.includes("@CircuitBreaker") && !code.includes("Resilience4j") && !code.includes("hystrix")) {
        alerts.push("🚨 Sem circuit breaker — falha em cascata possível");
      }
    }
    if (pattern === "webhook_handler" && domain === "payment" && !code.includes("timeout") && !code.includes("connectTimeout")) {
      alerts.push("🚨 Chamada síncrona para pagamento SEM timeout");
    }
    if (pattern === "kafka_consumer" && !code.includes("retry") && !code.includes("RetryConfig")) {
      alerts.push("⚠️ Consumer Kafka sem retry configurado");
    }

    return alerts;
  }

  private extractDependencies(code: string, primary: PatternDetection): { edges: ServiceMapEdge[]; nodes: ServiceMapNode[] } {
    const edges: ServiceMapEdge[] = [];
    const nodes: ServiceMapNode[] = [];
    const serviceEdge = this.extractServiceEdge(code, primary.domain);

    if (serviceEdge) {
      edges.push(serviceEdge);
      nodes.push(
        { id: "current", name: "CurrentService", tech: "Spring Boot", domain: primary.domain, risk: primary.risk },
        { id: serviceEdge.to, name: serviceEdge.to, tech: "external", domain: "unknown" as Domain, risk: "ALTO" as Risk },
      );
    }

    return { edges, nodes };
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
    const feignMatch = /@FeignClient\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/.exec(code);
    const urlMatch = /(?:url|baseUrl)\s*=\s*["']([^"']+)["']/.exec(code);

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
