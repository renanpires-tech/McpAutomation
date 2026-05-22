import { EventEmitter } from "node:events";
import type { PatternDetection, PatternName, Domain, Risk } from "./types.js";

// ─────────────────────────────────────────────
//  Pattern Definitions
// ─────────────────────────────────────────────

interface PatternRule {
  name: PatternName;
  domain: Domain;
  risk: Risk;
  triggers: string[];
  baseConfidence: number;
  testerMessage: string;
  architectMessage?: string;
}

const PATTERNS: PatternRule[] = [
  {
    name: "webhook_handler",
    domain: "payment",
    risk: "CRÍTICO",
    triggers: ["@PostMapping", "handleWebhook", "@RequestBody", "webhook", "X-Signature"],
    baseConfidence: 0.85,
    testerMessage: "precisa de 6 testes específicos: payload válido, malformed, null, idempotência, assinatura inválida, exceção",
    architectMessage: "verificar: timeout no processamento, validação de assinatura HMAC/RSA, idempotência via deduplica",
  },
  {
    name: "kafka_consumer",
    domain: "order",
    risk: "ALTO",
    triggers: ["@KafkaListener", "ConsumerRecord", "@EventListener", "kafkaTemplate", "MessageListener"],
    baseConfidence: 0.8,
    testerMessage: "precisa de 4 testes: evento válido, DLQ em exceção, idempotência, falha de deserialização",
    architectMessage: "nova dependência de mensageria encontrada — verificar consumer group + retry config",
  },
  {
    name: "transactional_service",
    domain: "checkout",
    risk: "CRÍTICO",
    triggers: ["@Transactional", "@Service", "transactionManager", "rollbackFor", "PlatformTransactionManager"],
    baseConfidence: 0.75,
    testerMessage: "precisa de 4 testes: commit sucesso, rollback em exceção, sem estado parcial, exceção original após rollback",
    architectMessage: "verificar se rollbackFor está configurado para todas as checked exceptions",
  },
  {
    name: "feign_client",
    domain: "unknown",
    risk: "ALTO",
    triggers: ["@FeignClient", "RestTemplate", "WebClient", "HttpClient", "feign.Client"],
    baseConfidence: 0.75,
    testerMessage: "precisa de testes de timeout, retry e fallback para serviço externo indisponível",
    architectMessage: "nova dependência inter-serviço — verificar circuit breaker + timeout configurado",
  },
];

// ─────────────────────────────────────────────
//  AnalystAgent
// ─────────────────────────────────────────────

export class AnalystAgent {
  constructor(private readonly emitter: EventEmitter) {}

  analyze(code: string): PatternDetection[] {
    const detections: PatternDetection[] = [];

    for (const rule of PATTERNS) {
      const found = rule.triggers.filter(t =>
        code.includes(t) || code.toLowerCase().includes(t.toLowerCase()),
      );

      if (found.length === 0) continue;

      // Confidence boosted by number of matching triggers
      const confidence = Math.min(rule.baseConfidence + found.length * 0.03, 1);
      const signature = `${rule.name}::${rule.domain}`;

      const detection: PatternDetection = {
        pattern: rule.name,
        domain: rule.domain,
        risk: rule.risk,
        triggers: found,
        confidence,
        signature,
      };

      detections.push(detection);

      // Emit for TESTER
      this.emitter.emit("pattern_found", {
        type: "pattern_found",
        source: "ANALYST",
        payload: { detection, testerMessage: rule.testerMessage },
      });

      // Emit for ARCHITECT (if applicable)
      if (rule.architectMessage) {
        this.emitter.emit("pattern_found", {
          type: "pattern_found",
          source: "ANALYST",
          payload: { detection, architectMessage: rule.architectMessage },
        });
      }

      // Emit for MEMORY
      this.emitter.emit("pattern_found", {
        type: "pattern_found",
        source: "ANALYST",
        payload: { detection, forMemory: true },
      });
    }

    // If no patterns matched
    if (detections.length === 0) {
      const generic: PatternDetection = {
        pattern: "unknown",
        domain: "unknown",
        risk: "BAIXO",
        triggers: [],
        confidence: 0.5,
        signature: "unknown::unknown",
      };
      detections.push(generic);
    }

    return detections;
  }

  buildDiagnosis(detections: PatternDetection[], code: string): string {
    const primary = detections[0];
    const lines: string[] = [];

    lines.push(
      `**Padrão identificado:** \`${primary.pattern}\``,
      `**Domínio GPA:** ${primary.domain} | **Risco:** ${primary.risk}`,
      `**Triggers encontrados:** ${primary.triggers.join(", ") || "análise genérica"}`,
      `**Confidence:** ${(primary.confidence * 100).toFixed(0)}%`,
    );

    if (primary.risk === "CRÍTICO") {
      lines.push(`\n⚠️ **ATENÇÃO:** Componente de domínio crítico — cobertura de 100% obrigatória.`);
    }

    // Smell detection
    const smells: string[] = [];
    if (code.includes("catch (Exception e)") || code.includes("catch(Exception e)")) {
      smells.push("🔴 `catch (Exception)` genérico — pode esconder bugs silenciosos");
    }
    if (!code.includes("timeout") && !code.includes("connectTimeout") && primary.pattern === "feign_client") {
      smells.push("🔴 Sem timeout configurado — risco de thread starvation");
    }
    if (primary.pattern === "transactional_service" && !code.includes("rollbackFor")) {
      smells.push("🟠 `@Transactional` sem `rollbackFor` — checked exceptions não fazem rollback");
    }

    if (smells.length > 0) {
      const smellList = smells.map(s => `- ${s}`).join("\n");
      lines.push(`\n**Code Smells detectados:**\n${smellList}`);
    }

    return lines.join("\n");
  }
}
