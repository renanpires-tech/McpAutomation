import type { KnowledgeBase } from "../memory/KnowledgeBase.js";
import type { OrchestratorAgent } from "../agents/OrchestratorAgent.js";
import { JaCoCoParser } from "../parsers/JaCoCoParser.js";
import { StackTraceParser } from "../parsers/StackTraceParser.js";
import { JUnit5Generator } from "../generators/JUnit5Generator.js";
import { JavadocGenerator } from "../generators/JavadocGenerator.js";
import { detectDomain } from "../domain/gpa-context.js";

export interface TaskResult {
  content: string;
  metadata?: Record<string, unknown>;
}

export class TaskExecutor {
  private readonly jacocoParser   = new JaCoCoParser();
  private readonly stackParser    = new StackTraceParser();
  private readonly jUnit5Gen      = new JUnit5Generator();
  private readonly javadocGen     = new JavadocGenerator();

  constructor(
    private readonly orchestrator: OrchestratorAgent,
    private readonly kb: KnowledgeBase,
  ) {}

  async execute(params: { id: string; input?: Record<string, unknown> }): Promise<TaskResult> {
    const input = params.input ?? {};
    await this.kb.incrementMetric("tasks", "calls");

    switch (params.id) {
      case "analyze_coverage":   return this.analyzeCoverage(input);
      case "generate_tests":     return this.generateTests(input);
      case "diagnose_failure":   return this.diagnoseFailure(input);
      case "generate_docs":      return this.generateDocs(input);
      case "full_analysis":      return this.fullAnalysis(input);
      default:
        return { content: `❌ Task '${params.id}' não encontrada.` };
    }
  }

  // ──────────────────────────────────────────────────────
  //  Task implementations
  // ──────────────────────────────────────────────────────

  private analyzeCoverage(input: Record<string, unknown>): TaskResult {
    const xml     = String(input["jacoco_xml"] ?? "");
    const service = String(input["service_name"] ?? "unknown-service");

    if (!xml.trim()) return { content: "❌ jacoco_xml é obrigatório." };

    const report = this.jacocoParser.parse(xml, service);
    const topGaps = report.gaps.slice(0, 5);

    const lines: string[] = [
      `## 📊 Cobertura — ${service}`,
      "",
      `| Métrica      | Valor |`,
      `|:-------------|------:|`,
      `| Geral        | ${report.overallCoverage}% |`,
      `| Linhas       | ${report.lineCoverage}% |`,
      `| Branches     | ${report.branchCoverage}% |`,
      `| Métodos      | ${report.methodCoverage}% |`,
      "",
    ];

    if (Object.keys(report.byDomain).length > 0) {
      lines.push("### Por domínio");
      for (const [domain, pct] of Object.entries(report.byDomain)) {
        const emoji = pct >= 80 ? "🟢" : pct >= 60 ? "🟡" : "🔴";
        lines.push(`- ${emoji} **${domain}**: ${pct}%`);
      }
      lines.push("");
    }

    if (topGaps.length > 0) {
      lines.push("### 🎯 Top gaps (por risco)");
      for (const gap of topGaps) {
        lines.push(`- **${gap.risk}** \`${gap.className}\` — ${gap.missedCount} linhas não cobertas (linha ${gap.line})`);
      }
    } else {
      lines.push("✅ Nenhum gap crítico encontrado!");
    }

    return { content: lines.join("\n"), metadata: { overallCoverage: report.overallCoverage, gaps: report.gaps.length } };
  }

  private generateTests(input: Record<string, unknown>): TaskResult {
    const source    = String(input["source_code"] ?? "");
    const className = String(input["class_name"] ?? "UnknownClass");

    if (!source.trim()) return { content: "❌ source_code é obrigatório." };

    const testCode = this.jUnit5Gen.generateFromSource(source, className);

    return {
      content: [
        `## 🧪 Testes gerados — \`${className}Test.java\``,
        "",
        "```java",
        testCode,
        "```",
        "",
        "### ▶️ Como executar",
        "```bash",
        `mvn test -Dtest=${className}Test -pl . -am`,
        "```",
      ].join("\n"),
    };
  }

  private diagnoseFailure(input: Record<string, unknown>): TaskResult {
    const stackTrace = String(input["stack_trace"] ?? "");
    const testCode   = String(input["test_code"] ?? "");

    if (!stackTrace.trim()) return { content: "❌ stack_trace é obrigatório." };

    const parsed  = this.stackParser.parse(stackTrace);
    const domain  = parsed.rootCause?.domain ?? detectDomain(stackTrace);

    const lines: string[] = [
      `## 🔍 Diagnóstico de Falha`,
      "",
      `**Exceção:** \`${parsed.exceptionClass}\``,
      `**Mensagem:** ${parsed.message || "(sem mensagem)"}`,
      `**Domínio detectado:** ${domain}`,
      "",
      `### 📍 Frame raiz (GPA)`,
      parsed.rootCause
        ? `\`${parsed.rootCause.className}.${parsed.rootCause.method}()\` — linha ${parsed.rootCause.line}`
        : "Nenhum frame GPA encontrado no stack trace.",
      "",
      "### 🛠️ Ações recomendadas",
    ];

    if (parsed.exceptionClass.includes("NullPointer")) {
      lines.push("1. Verifique campos `@NotNull` e validações de entrada no serviço");
      lines.push("2. Adicione `Objects.requireNonNull()` nos parâmetros do método");
      lines.push("3. Revise o mock: `when(mock.method()).thenReturn(null)` pode ser a causa");
    } else if (parsed.exceptionClass.includes("Timeout") || parsed.message.includes("timeout")) {
      lines.push("1. Verifique configuração de `connectTimeout` e `readTimeout`");
      lines.push("2. Confirme que o mock de `externalService` está configurado corretamente");
      lines.push("3. Use `doThrow(SocketTimeoutException.class)` no teste para simular timeout");
    } else if (parsed.exceptionClass.includes("Transaction") || parsed.exceptionClass.includes("Rollback")) {
      lines.push("1. Verifique `@Transactional(rollbackFor = Exception.class)`");
      lines.push("2. Confirme que a exception é propagada sem `try/catch` silencioso");
      lines.push("3. Separe audit log da transação principal");
    } else {
      lines.push("1. Revise os mocks do teste para cobrir o caminho que falhou");
      lines.push("2. Adicione `@BeforeEach` com setup correto do estado inicial");
      lines.push("3. Verifique se a exceção é a esperada com `assertThrows(...)`");
    }

    if (testCode) {
      lines.push("", "### 🔧 Sugestão de correção no teste", "```java");
      lines.push(`// Linha provável da falha: ${parsed.rootCause?.line ?? "??"}`);
      lines.push("// Adicione este stub antes da chamada:");
      lines.push(`when(mock.method(any())).thenReturn(/* valor esperado */);`);
      lines.push("```");
    }

    return { content: lines.join("\n"), metadata: { exception: parsed.exceptionClass, domain } };
  }

  private generateDocs(input: Record<string, unknown>): TaskResult {
    const source    = String(input["source_code"] ?? "");
    const className = String(input["class_name"] ?? "UnknownClass");
    const domain    = detectDomain(source + " " + className);

    const docs = this.javadocGen.generateForSource(source, className, domain);

    return {
      content: [
        `## 📝 Documentação gerada — \`${className}\``,
        "",
        "```java",
        docs,
        "```",
      ].join("\n"),
    };
  }

  private async fullAnalysis(input: Record<string, unknown>): Promise<TaskResult> {
    const source    = String(input["source_code"] ?? "");
    const className = String(input["class_name"] ?? "UnknownClass");
    const jacocoXml = String(input["jacoco_xml"] ?? "");

    const result = await this.orchestrator.process(
      `Analise completo para ${className}:\n\n${source}`,
    );

    const sections: string[] = [
      `# 🚀 Análise Completa — \`${className}\``,
      "",
      result.content,
    ];

    if (jacocoXml.trim()) {
      const coverage = this.analyzeCoverage({ jacoco_xml: jacocoXml, service_name: className });
      sections.push("", "---", "", coverage.content);
    }

    await this.kb.recordQualityScore(result.qualityScore ?? 0.8);

    return { content: sections.join("\n") };
  }
}
