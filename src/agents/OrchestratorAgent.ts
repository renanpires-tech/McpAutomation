import { EventEmitter } from "node:events";
import { MemoryAgent } from "./MemoryAgent.js";
import { AnalystAgent } from "./AnalystAgent.js";
import { TesterAgent } from "./TesterAgent.js";
import { ArchitectAgent } from "./ArchitectAgent.js";
import { DocAgent } from "./DocAgent.js";
import type { KnowledgeBase } from "../memory/KnowledgeBase.js";
import type {
  Intent, Domain, Risk,
  OrchestrationResult, KBHit, PatternDetection,
} from "./types.js";

// ─────────────────────────────────────────────
//  Intent Classifier
// ─────────────────────────────────────────────

const INTENT_KEYWORDS: Record<Intent, string[]> = {
  coverage_analysis:  ["cobertura", "coverage", "jacoco", "lcov", "linha", "branch", "%", "percentual"],
  test_generation:    ["gerar", "criar", "teste", "suite", "implementar", "generate", "test"],
  failure_diagnosis:  ["falhou", "erro", "exception", "stack trace", "failed", "error", "broke"],
  reverse_engineer:   ["sem doc", "legado", "o que faz", "entender", "legacy", "undocumented", "reverse"],
  architecture_map:   ["serviço", "dependência", "fluxo", "kafka", "integração", "service", "dependency"],
};

function classifyIntent(input: string, historicalRate: Record<Intent, number>): Intent {
  const lower = input.toLowerCase();
  const scores = Object.entries(INTENT_KEYWORDS).map(([intent, keywords]) => {
    const keyScore = keywords.filter(k => lower.includes(k)).length;
    const histBonus = (historicalRate[intent as Intent] ?? 0) * 0.3;
    return { intent: intent as Intent, score: keyScore + histBonus };
  });

  scores.sort((a, b) => b.score - a.score);
  return scores[0]?.score > 0 ? scores[0].intent : "reverse_engineer";
}

const TEAM_MAP: Record<Intent, string[]> = {
  coverage_analysis:  ["ANALYST", "TESTER", "MEMORY"],
  test_generation:    ["TESTER", "ANALYST", "MEMORY"],
  failure_diagnosis:  ["ANALYST", "TESTER", "ARCHITECT", "MEMORY"],
  reverse_engineer:   ["ANALYST", "DOC", "ARCHITECT", "MEMORY"],
  architecture_map:   ["ARCHITECT", "ANALYST", "MEMORY"],
};

// ─────────────────────────────────────────────
//  OrchestratorAgent
// ─────────────────────────────────────────────

export class OrchestratorAgent {
  private readonly emitter: EventEmitter;
  private readonly memory: MemoryAgent;
  private readonly analyst: AnalystAgent;
  private readonly tester: TesterAgent;
  private readonly architect: ArchitectAgent;
  private readonly doc: DocAgent;

  constructor(private readonly kb?: KnowledgeBase) {
    this.emitter   = new EventEmitter();
    this.memory    = new MemoryAgent(this.emitter);
    this.analyst   = new AnalystAgent(this.emitter);
    this.tester    = new TesterAgent(this.emitter);
    this.architect = new ArchitectAgent(this.emitter);
    this.doc       = new DocAgent(this.emitter);
  }

  /** process() — convenience wrapper used by TaskExecutor */
  async process(input: string, code?: string): Promise<{ content: string; qualityScore: number }> {
    const result = await this.run(input, code);
    const content = formatOutput(result);
    if (this.kb) await this.kb.recordQualityScore(result.quality_score);
    return { content, qualityScore: result.quality_score };
  }

  async run(input: string, code?: string): Promise<OrchestrationResult> {
    // ─── STEP 1: Query KB ───────────────────────
    const kbHits = await this.memory.findSimilarSolutions(input + (code ?? ""));
    const bestHit: KBHit | undefined = kbHits.find(h => h.solution.quality_score > 0.85);

    // ─── STEP 2: Classify Intent ─────────────────
    const metrics = await this.memory.getMetrics();
    const historicalRate: Record<Intent, number> = {
      coverage_analysis:  metrics.agents_performance.analyst.avg_confidence,
      test_generation:    metrics.agents_performance.tester.avg_coverage,
      failure_diagnosis:  0,
      reverse_engineer:   0,
      architecture_map:   0,
    };
    const intent = classifyIntent(input + (code ?? ""), historicalRate);
    const team = TEAM_MAP[intent];

    // ─── STEP 3: Analyze (ANALYST) ───────────────
    const codeToAnalyze = code ?? input;
    const detections = this.analyst.analyze(codeToAnalyze);
    const primary = detections[0];
    const diagnosis = this.analyst.buildDiagnosis(detections, codeToAnalyze);

    // ─── STEP 4: Generate Tests (TESTER) ─────────
    const className = this.tester.extractClassName(codeToAnalyze);
    let tests = this.tester.generateTests(detections, className, []);

    // ─── STEP 5: Validate (ARCHITECT) ────────────
    const validation = this.architect.validate(codeToAnalyze, detections, tests);
    const archNotes = this.architect.buildArchitectureNotes(validation);

    // If refinement needed — regenerate tests with feedback
    if (!validation.approved && validation.missing_coverage.length > 0) {
      tests = this.tester.generateTests(detections, className, validation.missing_coverage);
    }

    // ─── STEP 6: Generate Docs (DOC) ─────────────
    const documentation = this.doc.generateDoc(codeToAnalyze, detections);

    // ─── STEP 7: Build solution ───────────────────
    const solution = this.buildSolution(primary, detections, archNotes, bestHit);

    // ─── STEP 8: Validation command ──────────────
    const validationCmd = this.buildValidationCommand(primary, intent);

    // ─── STEP 9: Learn ───────────────────────────
    const qualityScore = this.computeQualityScore(detections, validation, tests);
    const solutionKey = `${intent}::${primary.pattern}::${primary.domain}`;

    const learningSummary = await this.memory.consolidateLearning({
      signature: primary.signature,
      pattern: primary.pattern,
      domain: primary.domain as Domain,
      risk: primary.risk as Risk,
      tests: [tests.substring(0, 200)],
      solutionKey,
      solutionEntry: {
        intent,
        input_pattern: (input + (code ?? "")).substring(0, 200),
        solution_summary: solution,
        agents_used: team,
        quality_score: qualityScore,
        domain: primary.domain as Domain,
      },
      serviceMapUpdate: {
        edges: validation.service_edges,
        nodes: validation.service_nodes,
      },
      qualityScore,
      agentsUsed: team,
    });

    if (bestHit) {
      await this.memory.incrementReuse(bestHit.key);
    }

    // ─── STEP 10: Build knowledge header ─────────
    const knowledgeHeader = {
      similar_interactions: kbHits.length,
      confidence: primary.confidence,
      agents_used: team,
      pattern_identified: primary.pattern,
      kb_hit: !!bestHit,
    };

    return {
      knowledge_header: knowledgeHeader,
      diagnosis,
      solution,
      tests,
      documentation,
      validation: validationCmd,
      learning_registered: learningSummary,
      quality_score: qualityScore,
    };
  }

  private buildSolution(
    primary: PatternDetection,
    _detections: PatternDetection[],
    archNotes: string[],
    kbHit?: KBHit,
  ): string {
    const lines: string[] = [];

    if (kbHit) {
      lines.push(`📖 **Solução baseada em ${kbHit.solution.reused_count + 1} uso(s) anteriores do KB** (score ${(kbHit.score * 100).toFixed(0)}%)\n`);
    }

    lines.push(
      `### Padrão \`${primary.pattern}\` — Domínio: ${primary.domain}`,
      `**Risco:** ${primary.risk}\n`,
    );

    if (primary.pattern === "webhook_handler") {
      lines.push(
        "**Checklist de implementação:**",
        "- [ ] Validar assinatura HMAC/RSA antes de qualquer processamento",
        "- [ ] Implementar idempotência via `idempotency_key` no banco",
        "- [ ] Retornar `200 OK` imediatamente, processar em background",
        "- [ ] Audit log obrigatório para cada webhook recebido",
        "- [ ] Configurar `timeout: 30s` no handler",
      );
    } else if (primary.pattern === "kafka_consumer") {
      lines.push(
        "**Checklist de implementação:**",
        "- [ ] Configurar `@RetryableTopic` com backoff exponencial",
        "- [ ] Implementar DLQ (Dead Letter Queue) com alertas",
        "- [ ] Garantir idempotência: verificar `eventId` processado antes de agir",
        "- [ ] Nunca propagar excessão no método `@KafkaListener` sem DLQ configurado",
      );
    } else if (primary.pattern === "transactional_service") {
      lines.push(
        "**Checklist de implementação:**",
        "- [ ] `@Transactional(rollbackFor = Exception.class)` — incluir checked exceptions",
        "- [ ] Não capturar exceptions dentro do método transacional sem relaçar",
        "- [ ] Audit log fora da transação (não vai junto no rollback)",
        "- [ ] Eventos de domínio publicados APÓS commit",
      );
    } else if (primary.pattern === "feign_client") {
      lines.push(
        "**Checklist de implementação:**",
        "- [ ] Configurar `connectTimeout` e `readTimeout` no `FeignClient`",
        "- [ ] Implementar `@CircuitBreaker` com Resilience4j",
        "- [ ] Fallback method para serviço indisponível",
        "- [ ] Retry apenas para erros 5xx, nunca para 4xx",
      );
    }

    if (archNotes.length > 0) {
      lines.push("\n**⚠️ Notas ARCHITECT:**");
      for (const note of archNotes) lines.push(`- ${note}`);
    }

    return lines.join("\n");
  }

  private buildValidationCommand(primary: PatternDetection, intent: Intent): string {
    const cmds: string[] = [];

    if (intent === "test_generation" || intent === "coverage_analysis") {
      cmds.push(
        "```bash",
        "# Executar testes e verificar cobertura JaCoCo",
        "mvn test jacoco:report",
        "# Verificar relatório em: target/site/jacoco/index.html",
        "# Meta: 100% cobertura para domínio " + primary.domain,
        "```",
      );
    } else if (intent === "failure_diagnosis") {
      cmds.push(
        "```bash",
        "# Reproduzir falha em isolamento",
        `mvn test -Dtest=${this.tester.extractClassName("") + "Test"} -pl . -am`,
        String.raw`# Verificar logs: grep 'ERROR\|WARN' target/surefire-reports/*.txt`,
        "```",
      );
    } else {
      cmds.push(
        "```bash",
        "# Compilar e verificar",
        "mvn compile -q && echo '✅ Compilação OK'",
        "```",
      );
    }

    return cmds.join("\n");
  }

  private computeQualityScore(
    detections: PatternDetection[],
    validation: { approved: boolean; missing_coverage: string[] },
    tests: string,
  ): number {
    let score = 0.5;

    if (detections[0].pattern !== "unknown") score += 0.2;
    if (detections[0].confidence > 0.8) score += 0.1;
    if (validation.approved) score += 0.15;
    if (tests.length > 500) score += 0.05;

    return Math.min(score, 1);
  }
}

// ─────────────────────────────────────────────
//  Format final output (RULE #8)
// ─────────────────────────────────────────────

export function formatOutput(result: OrchestrationResult): string {
  const kh = result.knowledge_header;

  return `┌─────────────────────────────────────────────────────────┐
│ 🧠 KNOWLEDGE HEADER                                     │
│ > Baseado em: ${String(kh.similar_interactions)} interações anteriores similares
│ > Confidence: ${(kh.confidence * 100).toFixed(0)}% | Agentes: ${kh.agents_used.join(" + ")}
│ > Padrão identificado: ${kh.pattern_identified}${kh.kb_hit ? " [KB HIT ✅]" : ""}
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│ 🔍 DIAGNÓSTICO CIRÚRGICO                                │
└─────────────────────────────────────────────────────────┘

${result.diagnosis}

┌─────────────────────────────────────────────────────────┐
│ 🛠️ SOLUÇÃO COMPLETA                                     │
└─────────────────────────────────────────────────────────┘

${result.solution}

┌─────────────────────────────────────────────────────────┐
│ 🧪 TESTES GERADOS                                       │
└─────────────────────────────────────────────────────────┘

\`\`\`java
${result.tests}
\`\`\`

┌─────────────────────────────────────────────────────────┐
│ 📚 DOCUMENTAÇÃO GERADA                                  │
└─────────────────────────────────────────────────────────┘

\`\`\`java
${result.documentation}
\`\`\`

┌─────────────────────────────────────────────────────────┐
│ ✅ VALIDAÇÃO                                            │
└─────────────────────────────────────────────────────────┘

${result.validation}

┌─────────────────────────────────────────────────────────┐
│ 💾 APRENDIZADO REGISTRADO                               │
│ > ${result.learning_registered}
│ > Quality score: ${(result.quality_score * 100).toFixed(0)}%
└─────────────────────────────────────────────────────────┘`;
}
