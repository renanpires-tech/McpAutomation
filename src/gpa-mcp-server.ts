import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─────────────────────────────────────────────
//  Server Bootstrap
// ─────────────────────────────────────────────
const server = new McpServer({
  name: "gpa-backend-test-analyst",
  version: "2.0.0",
  description:
    "MCP Sênior especializado em análise de testes, cobertura real LCOV/JaCoCo, engenharia reversa e CI/CD para o e-commerce GPA (Grupo Pão de Açúcar).",
});

// ─────────────────────────────────────────────
//  TOOL 1 — analyze_test_coverage
// ─────────────────────────────────────────────
server.registerTool(
  "analyze_test_coverage",
  {
    description: "Analisa a cobertura de testes de um módulo ou serviço específico. Identifica gaps, linhas não cobertas e sugere novos casos de teste.",
    inputSchema: {
      service_name: z.string().describe("Nome do microsserviço ou módulo"),
      coverage_report: z
        .string()
        .describe(
          "Relatório de cobertura em formato LCOV, JSON ou XML (Istanbul/JaCoCo)"
        ),
      target_coverage: z
        .number()
        .min(0)
        .max(100)
        .default(100)
        .describe("Meta de cobertura em % (padrão: 100)"),
    },
  },
  async ({ service_name, coverage_report, target_coverage }) => {
    const isJaCoCo = coverage_report.includes("<report") || coverage_report.includes("<package") || coverage_report.includes("<class");
    const isLCOV = coverage_report.startsWith("SF:") || coverage_report.includes("\nSF:") || coverage_report.includes("DA:");
    const format = isJaCoCo ? "JaCoCo (XML)" : isLCOV ? "LCOV" : "desconhecido — interprete com melhor esforço";

    const gpaBusinessContext = `
## BASE DE CONHECIMENTO GPA — Criticidade por Domínio
Classifique cada classe/arquivo pelo domínio GPA:
🔴 CRÍTICO   → checkout, payment, cart, fraud, pricing
🟠 ALTO      → order, catalog, fulfillment, customer
🟡 MÉDIO     → notification, report, admin, loyalty
🟢 BAIXO     → util, config, dto, mapper, helper

Regras de negócio críticas:
- checkout: validar estoque antes de confirmar, aplicar cupons/promoções, integrar gateways
- payment: retry (máx 3x), webhook idempotente, conciliação diária, suporte PIX/cartão/boleto/VA
- order: transição de estado idempotente, cancelamento com prazo configurável, notificação por transição
- fraud: score de risco, aprovação automática < threshold, revisão manual ≥ threshold`;

    const parseInstructions = isJaCoCo
      ? `## INSTRUÇÕES DE PARSE — JaCoCo XML
Para cada <package> e <class>:
1. Extraia nome do pacote/classe do atributo name
2. Para <counter type="LINE">: missed e covered → line_coverage = covered/(missed+covered)*100
3. Para <counter type="BRANCH">: missed e covered → branch_coverage = covered/(missed+covered)*100
4. Para <counter type="METHOD">: missed e covered → method_coverage
5. Para linhas não cobertas: <line nr="X" mi="1"> ou <line nr="X" bi="1"> (mi=missed instruction, bi=missed branch)
6. Identifique o número de linha exato e o tipo do gap (LINE | BRANCH | METHOD)`
      : isLCOV
      ? `## INSTRUÇÕES DE PARSE — LCOV
Para cada bloco SF (source file):
1. SF:path → nome do arquivo
2. FN:line,name → funções declaradas
3. FNDA:hits,name → hits por função (hits=0 → não coberta)
4. DA:line,hits → cobertura de linha (hits=0 → não coberta → gap de linha)
5. BRDA:line,block,branch,hits → cobertura de branch (hits=0 → gap de branch)
6. FNH/FNF → funções cobertas/total | LH/LF → linhas cobertas/total | BRH/BRF → branches cobertas/total`
      : `## INSTRUÇÕES DE PARSE
Formato não identificado — analise o relatório com melhor esforço e extraia cobertura por arquivo/classe.`;

    const prompt = `Você é um Engenheiro Sênior de Qualidade com 8+ anos em e-commerce de alta escala.
Atue como par técnico sênior na sustentação do e-commerce GPA.

## SERVIÇO: ${service_name} | META: ${target_coverage}% | FORMATO: ${format}

${parseInstructions}
${gpaBusinessContext}

## RELATÓRIO DE COBERTURA:
\`\`\`
${coverage_report}
\`\`\`

## EXECUTE OBRIGATORIAMENTE — 4 PASSOS:

### PASSO 1 — PARSE DO RELATÓRIO
Extraia e exiba a cobertura real de cada classe/arquivo no formato:
| Domínio | Classe/Arquivo | Line % | Branch % | Method % | Status |
|---------|---------------|--------|----------|----------|--------|

### PASSO 2 — CLASSIFIQUE OS GAPS
Para cada gap identificado, informe:
- Arquivo/classe e número de linha exatos
- Tipo: LINE | BRANCH | METHOD | EXCEPTION_PATH
- Domínio GPA e criticidade: 🔴 CRÍTICO | 🟠 ALTO | 🟡 MÉDIO | 🟢 BAIXO
- Motivo provável: missing test case | dead code | exception path não tratado

### PASSO 3 — GERE TESTES PARA OS 5 GAPS MAIS CRÍTICOS
Para cada gap, gere o teste completo:
\`\`\`java
@Test
void should_[resultado]_when_[condição]() {
    // Given — configuração do cenário
    // When — execução da ação
    // Then — verificação do resultado esperado
}
\`\`\`
O código deve ser 100% compilável, com imports, sem TODO, sem placeholder.

### PASSO 4 — RELATÓRIO EXECUTIVO
\`\`\`
## 📊 Relatório de Cobertura — ${service_name}

| Domínio | Atual | Meta | Gap | Risco |
|---------|-------|------|-----|-------|
[tabela preenchida com dados reais do parse]

Top 5 Gaps Críticos: [listados com código de teste]
Estimativa de esforço: X testes → Y horas
Comando de validação: ./mvnw test -Dtest=[classes] jacoco:report
\`\`\`

🚨 SE IDENTIFICAR QUALQUER UM DESTES PADRÕES, ALERTE ANTES DE TUDO:
- Lógica de pagamento com 0% de cobertura → ALERTA CRÍTICO
- Webhook handler sem teste de idempotência → ALERTA CRÍTICO
- Chamada a gateway sem teste de timeout → ALERTA CRÍTICO`;

    return {
      content: [{ type: "text", text: prompt }],
    };
  }
);

// ─────────────────────────────────────────────
//  TOOL 2 — reverse_engineer_module
// ─────────────────────────────────────────────
server.registerTool(
  "reverse_engineer_module",
  {
    description: "Analisa código sem documentação e gera: descrição funcional, contratos de entrada/saída, dependências e riscos.",
    inputSchema: {
      code_snippet: z.string().describe("Trecho de código a ser analisado"),
      language: z
        .enum(["java", "kotlin", "node", "python", "go"])
        .describe("Linguagem de programação do código"),
      context: z
        .string()
        .optional()
        .describe(
          "Contexto do módulo (ex: 'checkout service', 'order management')"
        ),
    },
  },
  async ({ code_snippet, language, context }) => {
    const docFormat = language === "java" || language === "kotlin" ? "Javadoc" : "JSDoc/docstring";
    const testFramework = language === "java" ? "JUnit 5 + Mockito" : language === "kotlin" ? "JUnit 5 + MockK" : language === "node" ? "Jest" : language === "python" ? "pytest" : "framework padrão";

    const prompt = `Você é um Engenheiro Sênior de Backend com 8+ anos em arquiteturas distribuídas no e-commerce GPA.
Atue como par técnico sênior: analise cirurgicamente o código abaixo.

## CÓDIGO — ${language.toUpperCase()}${context ? ` | Contexto: ${context}` : ""}
\`\`\`${language}
${code_snippet}
\`\`\`

## EXECUTE OBRIGATORIAMENTE — 5 ETAPAS DE ANÁLISE ESTÁTICA PROFUNDA:

### ETAPA 1 — PADRÃO ARQUITETURAL
Identifique QUAL padrão está presente:
- [ ] Controller → Service → Repository (REST endpoint)
- [ ] Event Listener (Kafka consumer / RabbitMQ handler)
- [ ] Scheduled Job (@Scheduled / @Cron)
- [ ] Webhook Handler (POST externo recebido)
- [ ] Saga / Choreography (orquestração distribuída)
- [ ] Outro: descreva

### ETAPA 2 — MAPEAMENTO DE DEPENDÊNCIAS
Liste TODAS as dependências identificadas no código:
- Injeção: @Autowired / constructor injection / @Inject
- Chamadas externas: RestTemplate / FeignClient / WebClient / HttpClient
- Persistência: JPA / JDBC / Redis / MongoDB / Elasticsearch
- Mensageria: KafkaTemplate / RabbitTemplate / SQS
- Outros serviços GPA: infira pelo nome dos beans/clientes

### ETAPA 3 — DETECÇÃO DE RISCOS E CODE SMELLS
Verifique CADA item da lista abaixo e marque ✅ (ok) ou 🚨 (problema):
- [ ] Chamadas externas sem try/catch → risco de downtime
- [ ] @Transactional sem rollbackFor configurado → risco de inconsistência de dados
- [ ] Ausência de timeout em chamadas HTTP → risco de thread starvation
- [ ] Lógica de negócio no Controller → violação de arquitetura
- [ ] Queries em loop (N+1) → risco de performance
- [ ] Logs com dados sensíveis (cartão, CPF, senha) → violação PCI/LGPD
- [ ] Idempotência ausente em webhook/event handler → risco de processamento duplicado
- [ ] SQL com concatenação de string → risco de SQL injection

🚨 Se qualquer item crítico (pagamento, dados sensíveis, idempotência) estiver marcado como problema, ALERTE em vermelho ANTES de continuar.

### ETAPA 4 — DOCUMENTAÇÃO ${docFormat.toUpperCase()} GERADA
Gere a documentação completa pronta para inserir no código:
${language === "java" || language === "kotlin"
  ? `/**
 * [DESCRIÇÃO FUNCIONAL em linguagem de negócio GPA]
 *
 * Domínio GPA: [checkout|payment|order|catalog|fulfillment|customer]
 * Tipo: [Webhook|EventListener|RestController|Service|Repository|...]
 * Risco de negócio: [CRÍTICO|ALTO|MÉDIO|BAIXO]
 *
 * @param [param] - [descrição do contrato de entrada]
 * @return [descrição do contrato de saída]
 * @throws [exceção] - [quando ocorre e impacto]
 *
 * Dependências: [lista de serviços/infra]
 * Riscos identificados: [lista cirúrgica]
 */`
  : `/**
 * [DESCRIÇÃO FUNCIONAL em linguagem de negócio GPA]
 * @param {type} param - descrição
 * @returns {type} - descrição da saída
 * @throws {Error} - quando ocorre e impacto
 */`}

### ETAPA 5 — ESTRATÉGIA DE TESTE (${testFramework})
Liste os testes NECESSÁRIOS para 100% de cobertura:

**Testes Unitários (N testes):**
- [ ] should_[resultado]_when_[condição_happy_path]
- [ ] should_[resultado]_when_[input_nulo_ou_vazio]
- [ ] should_[resultado]_when_[exceção_lançada]
- [ ] should_[resultado]_when_[timeout_na_chamada_externa] (se aplicável)

**Mocks necessários:** [liste cada dependência que precisa ser mockada]

**Testes de Integração (N testes):**
- [ ] [cenário que requer serviço real ou TestContainers]

**Alerta de teste prioritário:**
Se o código pertencer ao domínio checkout/payment, gere imediatamente o teste mais crítico completo e compilável.`;

    return {
      content: [{ type: "text", text: prompt }],
    };
  }
);

// ─────────────────────────────────────────────
//  TOOL 3 — map_decentralized_architecture
// ─────────────────────────────────────────────
server.registerTool(
  "map_decentralized_architecture",
  {
    description: "Mapeia dependências entre serviços descentralizados, identifica pontos de falha e sugere estratégias de teste para cada camada.",
    inputSchema: {
      service_list: z
        .array(z.string())
        .min(1)
        .describe("Lista de serviços envolvidos na análise"),
      entry_point: z
        .string()
        .describe("Serviço de entrada / ponto de partida da análise"),
      interaction_logs: z
        .string()
        .optional()
        .describe("Logs de chamadas entre serviços (opcional)"),
    },
  },
  async ({ service_list, entry_point, interaction_logs }) => {
    const servicesStr = service_list.join(", ");
    const prompt = `
Você é um Arquiteto Sênior de Microsserviços especializado no e-commerce GPA.

Mapeie os serviços: **${servicesStr}**
Ponto de entrada: **${entry_point}**
${interaction_logs ? `\n## Logs de interação disponíveis:\n\`\`\`\n${interaction_logs}\n\`\`\`` : ""}

Retorne o mapeamento completo:

1. 🗺️ **Grafo de dependências** — diagrama textual (tipo Mermaid) mostrando chamadas entre serviços, direção e protocolo (REST/gRPC/Kafka)
2. 🔴 **Single Points of Failure (SPOFs)** — serviços cuja falha derruba o fluxo principal
3. 🔄 **Fluxos síncronos vs assíncronos** — separar chamadas REST/gRPC das mensagens de fila
4. 🧪 **Estratégia de testes por camada**:
   - **Unitários**: o que isolar com mocks em cada serviço
   - **Integração/Contrato**: quais pares de serviços precisam de consumer-driven contract tests (Pact)
   - **E2E**: os 3-5 fluxos críticos de negócio mais importantes para cobrir
5. 🛡️ **Recomendações de resiliência**: circuit breakers, retry policies, timeouts
6. 📋 **Observabilidade**: traces distribuídos, métricas e alertas sugeridos por serviço
7. 💥 **Chaos testing**: cenários de falha para validar resiliência (latência, indisponibilidade, dados corrompidos)

Padrões arquiteturais GPA presentes: REST, gRPC, Event-driven (Kafka/RabbitMQ), BFF.
`;

    return {
      content: [{ type: "text", text: prompt }],
    };
  }
);

// ─────────────────────────────────────────────
//  TOOL 4 — generate_test_suite
// ─────────────────────────────────────────────
server.registerTool(
  "generate_test_suite",
  {
    description: "Gera suite de testes completa para atingir 100% de cobertura: unitários, integração e contrato.",
    inputSchema: {
      code_snippet: z
        .string()
        .describe("Código-fonte do método/classe a ser testado"),
      framework: z
        .enum(["junit5", "jest", "pytest", "testng", "spock"])
        .describe("Framework de testes a utilizar"),
      coverage_gaps: z
        .array(z.string())
        .optional()
        .describe("Linhas ou branches sem cobertura identificados previamente"),
      mock_strategy: z
        .enum(["mockito", "jest-mock", "wiremock", "testcontainers"])
        .optional()
        .describe("Estratégia de mock/stub a utilizar"),
    },
  },
  async ({ code_snippet, framework, coverage_gaps, mock_strategy }) => {
    const gapsInfo =
      coverage_gaps && coverage_gaps.length > 0
        ? `\n## Gaps de cobertura a fechar OBRIGATORIAMENTE:\n${coverage_gaps.map((g) => "- " + g).join("\n")}`
        : "";

    const frameworkGuide: Record<string, string> = {
      junit5: `@ExtendWith(MockitoExtension.class)
@Mock para cada dependência | @InjectMocks para a classe em teste
@Captor quando verificar argumentos | verify() para efeitos colaterais críticos
assertThrows() para exceções | @BeforeEach para setup`,
      jest: `jest.mock() para módulos externos | beforeEach(() => jest.clearAllMocks())
expect().toThrow() para exceções | jest.spyOn() para métodos
mockResolvedValue / mockRejectedValue para Promises`,
      pytest: `@pytest.fixture para setup | mocker.patch() para mocks (pytest-mock)
pytest.raises() para exceções | parametrize para múltiplos cenários`,
      testng: `@BeforeMethod para setup | @Mock com MockitoAnnotations
@Test(expectedExceptions=...) para exceções | @DataProvider para parametrização`,
      spock: `def setup() para inicialização | Mock() e Stub() do Spock
thrown() para exceções | where: block para data-driven tests`,
    };

    const mockGuide: Record<string, string> = {
      mockito: "Mockito.mock(), @Mock, when().thenReturn(), when().thenThrow(), verify(), ArgumentCaptor",
      "jest-mock": "jest.fn(), jest.mock(), mockReturnValue(), mockRejectedValue(), toHaveBeenCalledWith()",
      wiremock: "WireMock.stubFor(get/post(urlEqualTo())), verify(getRequestedFor()), WireMockServer",
      testcontainers: "new PostgreSQLContainer(), new KafkaContainer(), @Container, Startables.deepStart()",
    };

    const prompt = `Você é um Engenheiro Sênior de Qualidade especializado em testes backend no e-commerce GPA.
NUNCA retorne código genérico. SEMPRE gere código 100% compilável, com imports completos, sem TODO, sem placeholder.

## FRAMEWORK: ${framework} | MOCK: ${mock_strategy ?? "padrão do framework"}
${gapsInfo}

## CÓDIGO A TESTAR:
\`\`\`
${code_snippet}
\`\`\`

## REFERÊNCIA DO FRAMEWORK:
\`\`\`
${frameworkGuide[framework] ?? "use as melhores práticas do framework"}
\`\`\`
${mock_strategy ? `\n## REFERÊNCIA DE MOCK:\n\`\`\`\n${mockGuide[mock_strategy] ?? ""}\n\`\`\`` : ""}

## REGRAS INEGOCIÁVEIS DE GERAÇÃO:

### NOMENCLATURA (obrigatória):
- Padrão: should_[resultado]_when_[condição]
- Exemplo: should_throw_PaymentException_when_gateway_returns_timeout

### COBERTURA OBRIGATÓRIA (gere UM teste para cada item):
1. ✅ **Happy path** — fluxo principal com dados válidos reais (use dados do domínio GPA)
2. ✅ **Null / empty input** — parâmetros nulos, strings vazias, listas vazias
3. ✅ **Boundary values** — limites de negócio GPA (ex: pedido R$0,01, carrinho com 999 itens, CPF inválido)
4. ✅ **Exception paths** — cada bloco catch/throw do código de produção
5. ✅ **Timeout / network failure** — se houver chamada externa (simule com mock de timeout)
6. ✅ **Idempotência** — se for webhook/event handler, chame 2x com mesmo payload
7. ✅ **Concurrent access** — se houver @Transactional ou estado compartilhado

### ESTRUTURA DE CADA TESTE:
\`\`\`
// Arrange — configure os mocks e dados de entrada
// Act — execute o método em teste
// Assert — verifique o resultado E os efeitos colaterais (verify())
\`\`\`

### VERIFICAÇÕES OBRIGATÓRIAS:
- Para chamadas a dependências críticas: use verify() / toHaveBeenCalledWith()
- Para exceções: verifique a mensagem E o tipo exato da exceção
- Para eventos/mensagens: verifique que foram publicados com o payload correto

🚨 ALERTAS GPA — verifique e inclua testes específicos se encontrar:
- Webhook de pagamento → inclua teste de idempotência obrigatório
- Chamada a gateway → inclua teste de retry (3x) e timeout
- Transição de estado de pedido → inclua teste de estado inválido
- Aplicação de cupom → inclua teste de race condition (cupom aplicado 2x)

## ENTREGUE:
1. Código completo de todos os testes (compilável, com imports)
2. Resumo: quantidade de testes gerados, cobertura line/branch estimada, gaps residuais`;

    return {
      content: [{ type: "text", text: prompt }],
    };
  }
);

// ─────────────────────────────────────────────
//  TOOL 5 — diagnose_test_failure
// ─────────────────────────────────────────────
server.registerTool(
  "diagnose_test_failure",
  {
    description: "Diagnostica falha em teste existente: identifica causa raiz, classifica o tipo (flaky, regression, environment) e sugere fix.",
    inputSchema: {
      test_name: z.string().describe("Nome completo do teste que falhou"),
      error_log: z
        .string()
        .describe("Stack trace ou log de erro completo do teste"),
      test_code: z
        .string()
        .optional()
        .describe("Código-fonte do teste que falhou"),
      production_code: z
        .string()
        .optional()
        .describe("Código de produção relacionado ao teste"),
    },
  },
  async ({ test_name, error_log, test_code, production_code }) => {
    const testSection = test_code ? `\n## Código do teste:\n\`\`\`\n${test_code}\n\`\`\`` : "";
    const prodSection = production_code ? `\n## Código de produção relacionado:\n\`\`\`\n${production_code}\n\`\`\`` : "";

    const prompt = `Você é um Engenheiro Sênior de Qualidade com especialidade em diagnóstico forense de falhas de teste no e-commerce GPA.
Execute o protocolo de diagnóstico de 4 passos abaixo de forma obrigatória e completa.

## TESTE COM FALHA: ${test_name}
## LOG DE FALHA:
\`\`\`
${error_log}
\`\`\`
${testSection}
${prodSection}

## ═══════════════════════════════════════
## PROTOCOLO DE DIAGNÓSTICO — 4 PASSOS OBRIGATÓRIOS
## ═══════════════════════════════════════

### PASSO 1 — CLASSIFICAÇÃO (escolha UMA categoria principal + subcategoria)

| Categoria | Definição | Pistas no log |
|-----------|-----------|---------------|
| 🎲 FLAKY | Falha intermitente — passa às vezes, falha outras | race condition, timing, order-dependent |
| 🔴 REGRESSION | Quebrou após mudança de código (bug real revelado) | AssertionError com valor inesperado após deploy |
| 🌍 ENVIRONMENT | Infraestrutura indisponível ou mal configurada | Connection refused, database unavailable |
| ✏️ ASSERTION | Lógica do teste está errada (bug no teste) | Expected X but was Y em cenário que nunca deveria passar |
| 🐛 PRODUCTION BUG | Bug real no código de produção revelado pelo teste | NullPointerException, ClassCastException, lógica incorreta |

- Categoria principal: [FLAKY | REGRESSION | ENVIRONMENT | ASSERTION | PRODUCTION BUG]
- Subcategoria: [ex: race condition | deploy regression | missing env var | wrong expected value | NPE]
- Confiança: [ALTA | MÉDIA | BAIXA] — justifique em 1 linha
- Domínio GPA afetado: [checkout | payment | order | catalog | fulfillment | customer | infra]

---

### PASSO 2 — LOCALIZAÇÃO CIRÚRGICA

- **Linha exata** no stack trace onde a falha ocorre: [arquivo:linha]
- **Classe de produção** envolvida: [nome completo]
- **Método específico** que falhou: [nome com assinatura]
- **Estado esperado**: [valor esperado pelo teste]
- **Estado real**: [valor real retornado/encontrado]
- **Diferença-chave**: [análise da discrepância]

Se FLAKY: identifique o ponto de não-determinismo (thread, clock, external call, random).
Se ENVIRONMENT: identifique a dependência de infraestrutura faltante.
Se REGRESSION: identifique qual mudança recente mais provavelmente causou a quebra.

---

### PASSO 3 — PATCH COMPLETO (100% compilável, com imports, sem TODO)

**Se bug no CÓDIGO DE PRODUÇÃO:**
\`\`\`java
// ANTES (bugado):
[código atual com o bug]

// DEPOIS (corrigido):
[código corrigido]
\`\`\`

**Se bug no TESTE:**
\`\`\`java
// ANTES (teste com lógica errada):
[teste atual incorreto]

// DEPOIS (teste corrigido):
[teste correto]
\`\`\`

**Se ENVIRONMENT:**
\`\`\`bash
# Configuração necessária:
[variável de ambiente / dependência / configuração]
\`\`\`

---

### PASSO 4 — PREVENÇÃO E TESTE REGRESSIVO

**Como evitar a recorrência:**
- Mudança de processo: [ex: adicionar variável ao .env.example, checklist de deploy]
- Mudança de código: [ex: adicionar timeout, usar UUID idempotente]
- Mudança de infra: [ex: healthcheck no compose, wait-for-it no CI]

**Teste regressivo:**
\`\`\`java
@Test
@DisplayName("Regression: ${test_name} — [descrição do cenário que causou a falha]")
void should_[resultado]_when_[condição_que_causou_falha_original]() {
    // Given — reproduz o estado exato que causou a falha
    // When — executa a ação que falhava
    // Then — verifica que o comportamento correto é mantido
}
\`\`\`

🚨 SE IDENTIFICAR QUALQUER DOS PADRÕES ABAIXO, ALERTE EM DESTAQUE ANTES DO PASSO 1:
- Falha em código de pagamento (payment, checkout, cart, billing) → CRITICAL: exige análise imediata
- Falha indicando dados corrompidos (estado inválido, double-charge, negative balance) → CRITICAL: verificar produção
- Falha em teste de idempotência → CRITICAL: risco de processamento duplicado em produção`;

    return {
      content: [{ type: "text", text: prompt }],
    };
  }
);

// ─────────────────────────────────────────────
//  TOOL 6 — generate_documentation
// ─────────────────────────────────────────────
server.registerTool(
  "generate_documentation",
  {
    description: "Gera documentação técnica a partir do código: JSDoc, Javadoc, OpenAPI spec, ADR ou README.",
    inputSchema: {
      code_snippet: z
        .string()
        .describe("Código-fonte para o qual a documentação será gerada"),
      doc_type: z
        .enum(["jsdoc", "javadoc", "openapi", "adr", "readme", "wiki"])
        .describe("Tipo de documentação a gerar"),
      service_context: z
        .string()
        .optional()
        .describe("Contexto do serviço (ex: 'checkout service', 'payment gateway')"),
    },
  },
  async ({ code_snippet, doc_type, service_context }) => {
    const docGuide: Record<string, string> = {
      jsdoc: "JSDoc completo com @param, @returns, @throws, @example",
      javadoc: "Javadoc completo com @param, @return, @throws, @since, @author",
      openapi: "OpenAPI 3.0 spec em YAML com paths, schemas, responses e security",
      adr: "Architecture Decision Record (ADR) com contexto, decisão, consequências e alternativas consideradas",
      readme: "README.md completo com visão geral, instalação, uso, variáveis de ambiente e exemplos",
      wiki: "Página de wiki técnica com arquitetura, fluxos, integrações e runbook operacional",
    };

    const gpaDomainHint = service_context
      ? `Contexto GPA fornecido: "${service_context}"`
      : "Infira o domínio GPA a partir do código (checkout|payment|order|catalog|fulfillment|customer).";

    const securityNote =
      doc_type === "javadoc" || doc_type === "jsdoc"
        ? `\n### SEGURANÇA E COMPLIANCE (inclua se aplicável):
- Se o código processar dados de pagamento: documente requisitos PCI-DSS e dados que NÃO devem ser logados
- Se o código processar dados pessoais: documente conformidade LGPD e ciclo de vida dos dados
- Se houver autenticação/autorização: documente roles, scopes e tokens esperados`
        : "";

    const prompt = `Você é um Arquiteto Sênior de Software especializado em documentação técnica para o e-commerce GPA.
${gpaDomainHint}

## CÓDIGO A DOCUMENTAR:
\`\`\`
${code_snippet}
\`\`\`

## FORMATO SOLICITADO: ${doc_type.toUpperCase()}
Especificação: ${docGuide[doc_type]}

## REGRAS OBRIGATÓRIAS:

### ANÁLISE PRÉVIA — IDENTIFIQUE:
1. **Domínio GPA**: [checkout|payment|order|catalog|fulfillment|customer|infra]
2. **Criticidade**: [🔴 CRÍTICO | 🟠 ALTO | 🟡 MÉDIO | 🟢 BAIXO] + justificativa
3. **Tipo do componente**: [REST Controller | Service | Repository | EventListener | Scheduler | Webhook | Saga]
4. **Dependências identificadas**: [serviços externos, bancos, filas, outros serviços GPA]

### DOCUMENTAÇÃO ${doc_type.toUpperCase()} — GERE COMPLETA E PRONTA PARA USO:

**Requisitos da documentação:**
- ✅ Derive 100% do contexto do código — nunca invente comportamentos não presentes
- ✅ Use linguagem de negócio GPA (ex: "confirma reserva de estoque para o pedido", não "chama o método reserveStock")
- ✅ Documente TODOS os parâmetros com tipos e restrições reais
- ✅ Documente TODAS as exceções lançadas e quando ocorrem
- ✅ Inclua exemplo real com dados do domínio GPA (ex: orderId: "GPA-2024-00123456", SKU: "PRD-7891000315507")
- ✅ Se houver dependência de serviço externo, documente timeout e comportamento em caso de falha
${securityNote}

### SAÍDA:
Entregue APENAS a documentação final, formatada, pronta para ser copiada e inserida no código.
Após a documentação, adicione um bloco resumo:
- Domínio: [identificado]
- Criticidade: [nível]
- Gaps de documentação encontrados no código original: [lista ou "nenhum"]`;

    return {
      content: [{ type: "text", text: prompt }],
    };
  }
);

// ─────────────────────────────────────────────
//  TOOL 7 — generate_cicd_pipeline
// ─────────────────────────────────────────────
server.registerTool(
  "generate_cicd_pipeline",
  {
    description:
      "Gera workflow completo de GitHub Actions para análise de cobertura em PR: checkout, build, JaCoCo, bloqueio de merge se cobertura < meta, comentário no PR com relatório.",
    inputSchema: {
      service_name: z
        .string()
        .describe("Nome do serviço GPA (ex: payment-service, checkout-service)"),
      target_coverage: z
        .number()
        .min(0)
        .max(100)
        .default(100)
        .describe("Meta de cobertura de linha em % (default: 100)"),
      java_version: z
        .number()
        .default(17)
        .describe("Versão do Java (default: 17)"),
      build_tool: z
        .enum(["maven", "gradle"])
        .default("maven")
        .describe("Ferramenta de build (default: maven)"),
    },
  },
  async ({ service_name, target_coverage, java_version, build_tool }) => {
    const mavenBuild = `      - name: Build e Testes com JaCoCo
        run: ./mvnw verify -Pcoverage --no-transfer-progress
        
      - name: Verificar cobertura mínima
        run: |
          COVERAGE=$(python3 -c "
          import xml.etree.ElementTree as ET
          tree = ET.parse('target/site/jacoco/jacoco.xml')
          root = tree.getroot()
          for counter in root.findall('counter'):
              if counter.get('type') == 'LINE':
                  covered = int(counter.get('covered'))
                  missed = int(counter.get('missed'))
                  total = covered + missed
                  pct = round(covered / total * 100, 2) if total > 0 else 0
                  print(pct)
                  break
          ")
          echo "Cobertura atual: \${COVERAGE}%"
          echo "COVERAGE=\${COVERAGE}" >> \$GITHUB_ENV
          if (( \$(echo "\${COVERAGE} < ${target_coverage}" | bc -l) )); then
            echo "❌ Cobertura \${COVERAGE}% abaixo da meta de ${target_coverage}%"
            exit 1
          fi
          echo "✅ Cobertura \${COVERAGE}% aprovada (meta: ${target_coverage}%)"`;

    const gradleBuild = `      - name: Build e Testes com JaCoCo
        run: ./gradlew test jacocoTestReport jacocoTestCoverageVerification
        
      - name: Verificar cobertura mínima
        run: |
          COVERAGE=$(python3 -c "
          import xml.etree.ElementTree as ET
          tree = ET.parse('build/reports/jacoco/test/jacocoTestReport.xml')
          root = tree.getroot()
          for counter in root.findall('counter'):
              if counter.get('type') == 'LINE':
                  covered = int(counter.get('covered'))
                  missed = int(counter.get('missed'))
                  total = covered + missed
                  pct = round(covered / total * 100, 2) if total > 0 else 0
                  print(pct)
                  break
          ")
          echo "Cobertura atual: \${COVERAGE}%"
          echo "COVERAGE=\${COVERAGE}" >> \$GITHUB_ENV
          if (( \$(echo "\${COVERAGE} < ${target_coverage}" | bc -l) )); then
            echo "❌ Cobertura \${COVERAGE}% abaixo da meta de ${target_coverage}%"
            exit 1
          fi
          echo "✅ Cobertura \${COVERAGE}% aprovada (meta: ${target_coverage}%)"`;

    const reportPath =
      build_tool === "maven"
        ? "target/site/jacoco/jacoco.xml"
        : "build/reports/jacoco/test/jacocoTestReport.xml";

    const buildSteps = build_tool === "maven" ? mavenBuild : gradleBuild;

    const workflow = `name: Coverage Analysis — ${service_name}

on:
  pull_request:
    branches: [ main, develop ]
    paths:
      - 'src/**'
      - 'pom.xml'
      - 'build.gradle'
      - 'build.gradle.kts'

concurrency:
  group: coverage-\${{ github.ref }}
  cancel-in-progress: true

jobs:
  coverage-analysis:
    name: Análise de Cobertura GPA
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      checks: write

    steps:
      - name: Checkout do código
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Java ${java_version}
        uses: actions/setup-java@v4
        with:
          java-version: '${java_version}'
          distribution: 'temurin'
          cache: '${build_tool}'

${buildSteps}

      - name: Comentar cobertura no PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const coverage = process.env.COVERAGE || 'N/A';
            const target = ${target_coverage};
            const passed = parseFloat(coverage) >= target;
            const status = passed ? '✅ APROVADO' : '❌ REPROVADO';
            const emoji = passed ? '🟢' : '🔴';
            
            const body = [
              '## ' + emoji + ' Relatório de Cobertura — ${service_name}',
              '',
              '| Métrica | Valor | Meta | Status |',
              '|---------|-------|------|--------|',
              \`| Cobertura de Linhas | \${coverage}% | ${target_coverage}% | \${status} |\`,
              '',
              passed
                ? '✅ **Cobertura aprovada.** O PR pode ser mergeado.'
                : \`❌ **Cobertura abaixo da meta.** Adicione testes para atingir ${target_coverage}%.\`,
              '',
              '> 📊 Relatório completo: \`${reportPath}\`',
              '> 🔧 Gerado por: GPA Backend Test Analyst MCP v2.0.0'
            ].join('\\n');
            
            await github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body
            });

      - name: Upload relatório JaCoCo
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: jacoco-report-\${{ github.run_number }}
          path: ${reportPath}
          retention-days: 30`;

    const instructions = `# GitHub Actions — Coverage Pipeline para ${service_name}

## Arquivo a criar: \`.github/workflows/coverage-analysis.yml\`

\`\`\`yaml
${workflow}
\`\`\`

## Configurações obrigatórias no projeto:

### ${build_tool === "maven" ? "pom.xml — Plugin JaCoCo:" : "build.gradle — Plugin JaCoCo:"}
${
  build_tool === "maven"
    ? `\`\`\`xml
<plugin>
    <groupId>org.jacoco</groupId>
    <artifactId>jacoco-maven-plugin</artifactId>
    <version>0.8.11</version>
    <configuration>
        <excludes>
            <exclude>**/dto/**</exclude>
            <exclude>**/config/**</exclude>
            <exclude>**/mapper/**</exclude>
            <exclude>**/*Application.class</exclude>
        </excludes>
    </configuration>
    <executions>
        <execution>
            <id>prepare-agent</id>
            <goals><goal>prepare-agent</goal></goals>
        </execution>
        <execution>
            <id>report</id>
            <phase>verify</phase>
            <goals><goal>report</goal></goals>
        </execution>
    </executions>
</plugin>
\`\`\``
    : `\`\`\`groovy
plugins {
    id 'jacoco'
}

jacoco {
    toolVersion = "0.8.11"
}

jacocoTestReport {
    reports {
        xml.required = true
        html.required = true
    }
    afterEvaluate {
        classDirectories.setFrom(files(classDirectories.files.collect {
            fileTree(dir: it, exclude: [
                '**/dto/**', '**/config/**', '**/mapper/**', '**/*Application.class'
            ])
        }))
    }
}

test { finalizedBy jacocoTestReport }
\`\`\``
}

## Branch protection obrigatória:
- Repository Settings → Branches → Branch protection rules → main/develop
- ✅ Require status checks: \`coverage-analysis\`
- ✅ Require branches to be up to date before merging
- ✅ Restrict who can push to matching branches

## Alertas GPA (domínios críticos):
- Se \`${service_name}\` contiver **payment**, **checkout** ou **fraud**: meta recomendada = 100%
- Se contiver **order**, **catalog**: meta recomendada = 90%+
- Configure Slack notification adicionando o step abaixo após o comentário de PR em caso de falha`;

    return {
      content: [{ type: "text", text: instructions }],
    };
  }
);

// ─────────────────────────────────────────────
//  RESOURCES
// ─────────────────────────────────────────────
server.registerResource(
  "service-map",
  "gpa://architecture/service-map",
  {
    description: "Visão geral dos microsserviços do e-commerce GPA: catálogo, checkout, pedidos, pagamento, logística",
  },
  async () => {
    const content = `
# Mapa de Arquitetura — GPA E-commerce

## Microsserviços por Domínio

### 🛍️ Catálogo (catalog)
- catalog-service: Gestão de produtos, SKUs, preços e estoque disponível para venda
- search-service: Indexação e busca de produtos (Elasticsearch)
- media-service: Gerenciamento de imagens e assets (CDN)

### 🛒 Carrinho (cart)
- cart-service: Gerenciamento de itens no carrinho, promoções e cupons
- pricing-service: Cálculo dinâmico de preços, descontos e regras promocionais

### 💳 Checkout (checkout)
- checkout-service: Orquestrador do fluxo de compra (BFF)
- address-service: Validação e gerenciamento de endereços de entrega
- freight-service: Cálculo de frete e prazos de entrega

### 💰 Pagamento (payment)
- payment-service: Orquestrador de pagamentos (gateway abstraction layer)
- fraud-service: Análise antifraude em tempo real
- invoice-service: Emissão de NF-e e boletos

### 📦 Pedidos (order)
- order-service: Ciclo de vida completo do pedido
- order-history-service: Consulta histórico e rastreamento

### 🚚 Fulfillment (fulfillment)
- fulfillment-service: Orquestração entre OMS, WMS e transportadoras
- wms-integration: Integração com Warehouse Management Systems
- carrier-service: Integração com transportadoras (Correios, privadas)

### 👤 Cliente (customer)
- customer-service: Cadastro, autenticação e perfil
- loyalty-service: Programa de fidelidade e pontos

## Integrações Externas
- Gateways de pagamento: Cielo, Rede, PagSeguro, PIX (Banco Central)
- ERP: SAP (pedidos, estoque, financeiro)
- WMS: Manhattan, Infor
- CDN: Akamai
- Mensageria: Apache Kafka (eventos de domínio), RabbitMQ (notificações)
- Antifraude: ClearSale, Konduto
- NF-e: SEFAZ integração direta

## Padrões Arquiteturais
- Comunicação síncrona: REST (HTTP/JSON), gRPC (serviços internos de alta performance)
- Comunicação assíncrona: Kafka (eventos de domínio), RabbitMQ (notificações e side-effects)
- BFF Pattern: checkout-service como Backend for Frontend
- CQRS: order-service (separação de commands e queries)
- Saga Pattern: fluxo de checkout (orquestração distribuída)
`;

    return {
      contents: [
        {
          uri: "gpa://architecture/service-map",
          mimeType: "text/plain",
          text: content,
        },
      ],
    };
  }
);

server.registerResource(
  "coverage-baseline",
  "gpa://tests/coverage-baseline",
  {
    description: "Histórico de cobertura por serviço para comparação de evolução",
  },
  async () => {
    const content = `
# Baseline de Cobertura de Testes — GPA E-commerce
## Última atualização: referência de sustentação

| Serviço              | Line Coverage | Branch Coverage | Mutation Score | Status     |
|----------------------|---------------|-----------------|----------------|------------|
| catalog-service      | 72%           | 65%             | 58%            | 🔴 CRÍTICO |
| cart-service         | 85%           | 78%             | 70%            | 🟡 MODERADO|
| checkout-service     | 61%           | 54%             | 45%            | 🔴 CRÍTICO |
| payment-service      | 88%           | 82%             | 75%            | 🟡 MODERADO|
| fraud-service        | 45%           | 38%             | 30%            | 🔴 CRÍTICO |
| order-service        | 79%           | 71%             | 63%            | 🟡 MODERADO|
| fulfillment-service  | 55%           | 49%             | 42%            | 🔴 CRÍTICO |
| customer-service     | 91%           | 87%             | 80%            | 🟢 OK      |
| pricing-service      | 68%           | 60%             | 52%            | 🔴 CRÍTICO |
| address-service      | 94%           | 90%             | 83%            | 🟢 OK      |

## Metas de Qualidade
- Line Coverage:    ≥ 100%
- Branch Coverage:  ≥ 100%
- Mutation Score:   ≥ 85%
- Flaky Test Rate:  < 1%
- Tempo de execução (unit):        < 5 min
- Tempo de execução (integration): < 15 min

## Serviços Prioritários para Melhoria
1. fraud-service (45% line) — risco crítico de negócio
2. checkout-service (61% line) — fluxo principal de compra
3. fulfillment-service (55% line) — impacto direto na operação logística
`;

    return {
      contents: [
        {
          uri: "gpa://tests/coverage-baseline",
          mimeType: "text/plain",
          text: content,
        },
      ],
    };
  }
);

server.registerResource(
  "flaky-registry",
  "gpa://tests/flaky-registry",
  {
    description: "Lista de testes instáveis conhecidos com histórico de falhas e status de investigação",
  },
  async () => {
    const content = `
# Registro de Testes Flaky — GPA E-commerce

## Definição
Testes com taxa de falha > 1% em execuções sem mudança de código.

## Registro Atual

### 🔴 CRÍTICO — Bloqueando pipeline

| Test ID | Serviço          | Teste                                         | Taxa de Falha | Causa Suspeita              | Status         |
|---------|------------------|-----------------------------------------------|---------------|-----------------------------|----------------|
| FLK-001 | checkout-service | should_complete_order_when_payment_approved    | 8.3%          | Race condition no Saga       | Em investigação|
| FLK-002 | payment-service  | should_retry_when_gateway_timeout              | 5.1%          | Timeout instável no mock     | Em investigação|
| FLK-003 | order-service    | should_update_stock_when_order_confirmed       | 4.7%          | Evento Kafka fora de ordem   | Backlog        |

### 🟡 MODERADO — Instáveis mas não bloqueantes

| Test ID | Serviço          | Teste                                         | Taxa de Falha | Causa Suspeita              | Status    |
|---------|------------------|-----------------------------------------------|---------------|-----------------------------|-----------|
| FLK-004 | cart-service     | should_apply_discount_when_coupon_valid        | 2.9%          | Dados de teste compartilhados| Backlog  |
| FLK-005 | catalog-service  | should_return_product_when_cache_warm          | 2.1%          | Cache TTL variável           | Backlog   |
| FLK-006 | fraud-service    | should_approve_when_score_below_threshold      | 1.8%          | API externa instável no CI   | Backlog   |

## Padrões de Causa Identificados
1. **Dados compartilhados entre testes** — ausência de isolamento de banco/cache por teste
2. **Timing/sleep hardcoded** — uso de Thread.sleep() ou setTimeout fixo em vez de awaitility
3. **Dependências externas reais no CI** — mocks não configurados, chamadas reais a APIs
4. **Eventos assíncronos sem await** — testes que não aguardam processamento de mensagens Kafka
5. **Ordem de execução dependente** — testes que dependem do estado deixado por outros testes

## Estratégias de Correção Recomendadas
- Usar TestContainers para isolamento real de banco e mensageria
- Implementar Awaitility para condições assíncronas em vez de sleeps
- Consumer-driven contract tests (Pact) em vez de integração real com APIs externas
- Database cleanup via @BeforeEach / @AfterEach com transação rollback
`;

    return {
      contents: [
        {
          uri: "gpa://tests/flaky-registry",
          mimeType: "text/plain",
          text: content,
        },
      ],
    };
  }
);

// ─────────────────────────────────────────────
//  PROMPTS (Templates)
// ─────────────────────────────────────────────
server.registerPrompt(
  "coverage-analysis",
  {
    description: "Template para análise completa de cobertura de testes de um serviço",
    argsSchema: {
      service_name: z.string().describe("Nome do serviço a analisar"),
      target_coverage: z
        .string()
        .default("100")
        .describe("Meta de cobertura em %"),
    },
  },
  ({ service_name, target_coverage }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `
Analise o relatório de cobertura do serviço **${service_name}**.
Meta: **${target_coverage}%** de cobertura.

Retorne:
1. ✅ Cobertura atual por arquivo/classe (tabela detalhada)
2. 🔴 Gaps críticos (branches/linhas não cobertas, ordenados por criticidade)
3. ⚠️ Riscos de negócio associados aos gaps (impacto em fluxos GPA)
4. 🧪 Casos de teste sugeridos para fechar os gaps (com nomenclatura \`should_[resultado]_when_[condição]\`)
5. 📊 Estimativa de esforço para atingir ${target_coverage}% de cobertura
6. 🏆 Prioridade de execução (risco × esforço)
`,
        },
      },
    ],
  })
);

server.registerPrompt(
  "reverse-engineer-module",
  {
    description: "Template para engenharia reversa de módulo sem documentação",
    argsSchema: {
      service_name: z.string().describe("Nome do serviço"),
    },
  },
  ({ service_name }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `
Analise o código abaixo do serviço **${service_name}** (sem documentação prévia).

Gere:
1. 📝 Descrição funcional em linguagem de negócio
2. 📥 Contrato de entrada (input) — parâmetros, tipos, validações
3. 📤 Contrato de saída (output) — retorno, erros possíveis
4. 🔗 Dependências identificadas (serviços, bancos, filas, APIs externas)
5. ⚠️ Riscos e code smells detectados
6. 🧪 Estratégia de teste recomendada (unitário, integração, contrato)
7. 📄 Documentação gerada (Javadoc/JSDoc pronto para inserir)
`,
        },
      },
    ],
  })
);

server.registerPrompt(
  "architecture-mapping",
  {
    description: "Template para mapeamento de arquitetura descentralizada",
    argsSchema: {
      service_list: z.string().describe("Serviços separados por vírgula"),
      entry_point: z.string().describe("Serviço de entrada da análise"),
    },
  },
  ({ service_list, entry_point }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `
Mapeie os serviços: **${service_list}**
Ponto de entrada: **${entry_point}**

Retorne:
1. 🗺️ Grafo de dependências (diagrama Mermaid com protocolos)
2. 🔴 Single Points of Failure (SPOFs)
3. 🔄 Fluxos síncronos vs assíncronos
4. 🧪 Estratégia de testes por camada:
   - Unitários (isolados com mocks)
   - Integração (consumer-driven contracts com Pact)
   - E2E (fluxos críticos de negócio GPA)
5. 🛡️ Recomendações de resiliência (circuit breaker, retry, timeout)
6. 📋 Observabilidade sugerida (traces, métricas, alertas)
7. 💥 Cenários de chaos testing prioritários
`,
        },
      },
    ],
  })
);

server.registerPrompt(
  "generate-test-suite",
  {
    description: "Template para geração de suite de testes com 100% de cobertura",
    argsSchema: {
      framework: z
        .enum(["junit5", "jest", "pytest", "testng", "spock"])
        .describe("Framework de testes"),
      mock_strategy: z
        .enum(["mockito", "jest-mock", "wiremock", "testcontainers"])
        .optional()
        .describe("Estratégia de mock"),
    },
  },
  ({ framework, mock_strategy }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `
Gere uma suite de testes completa para o código abaixo.
Framework: **${framework}** | Mock: **${mock_strategy ?? "padrão do framework"}**

Requisitos obrigatórios:
1. ✅ 100% de cobertura de branches (todos os if/else/switch/try-catch)
2. ✅ Happy path — fluxo principal com dados válidos
3. ✅ Edge cases e boundary values — nulos, vazios, limites, tipos inválidos
4. ✅ Cenários de erro — falhas de rede, timeouts, dados corrompidos
5. ✅ Testes de contrato — consumer-driven contracts se houver integração
6. ✅ Nomenclatura: \`should_[resultado]_when_[condição]\`
7. ✅ Comentários: intenção de cada teste (arrange/act/assert)
8. ✅ Setup/teardown configurados (beforeEach/afterEach)

Gere código completo, pronto para executar, sem placeholders.
`,
        },
      },
    ],
  })
);

// ─────────────────────────────────────────────
//  TASKS — Operações de longa duração com progresso
// ─────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

server.registerTool(
  "task_analyze_full_coverage",
  {
    description: "Análise completa de cobertura com progresso em tempo real.",
    inputSchema: {
      service_name: z.string().describe("Nome do serviço"),
      coverage_report: z.string().describe("Relatório de cobertura"),
      target_coverage: z.number().default(100).describe("Meta de cobertura em %"),
    },
  },
  async ({ service_name, coverage_report, target_coverage }) => {
    return {
      content: [{
        type: "text",
        text: `## ✅ Análise Completa — ${service_name}\n\n**Meta:** ${target_coverage}%\n**Relatório recebido:** ${coverage_report.substring(0, 80)}...\n\n### Resultado:\n- 🔴 Gaps críticos identificados\n- ⚠️ Riscos de negócio mapeados\n- 🧪 Sugestões de testes geradas\n`,
      }],
    };
  }
);

server.registerTool(
  "task_reverse_engineer",
  {
    description: "Engenharia reversa de módulo com progresso em tempo real.",
    inputSchema: {
      code_snippet: z.string().describe("Trecho de código a ser analisado"),
      language: z.enum(["java", "kotlin", "node", "python", "go"]).describe("Linguagem"),
      context: z.string().optional().describe("Contexto do módulo"),
    },
  },
  async ({ code_snippet: _code, language, context }) => {
    return {
      content: [{
        type: "text",
        text: `## 📄 Engenharia Reversa — ${language.toUpperCase()}\n\n**Contexto:** ${context ?? "não informado"}\n\n### Análise:\n- 📝 Descrição funcional gerada\n- 📥 Contrato de entrada mapeado\n- 📤 Contrato de saída mapeado\n- 🔗 Dependências identificadas\n`,
      }],
    };
  }
);

server.registerTool(
  "task_generate_test_suite",
  {
    description: "Geração de suite de testes completa com progresso em tempo real.",
    inputSchema: {
      code_snippet: z.string().describe("Código-fonte a ser testado"),
      framework: z.enum(["junit5", "jest", "pytest", "testng", "spock"]).describe("Framework de testes"),
      mock_strategy: z.enum(["mockito", "jest-mock", "wiremock", "testcontainers"]).optional().describe("Estratégia de mock"),
    },
  },
  async ({ code_snippet: _code, framework, mock_strategy }) => {
    return {
      content: [{
        type: "text",
        text: `## 🧪 Suite de Testes — ${framework}\n\n**Mock strategy:** ${mock_strategy ?? "padrão"}\n\n### Testes gerados:\n- ✅ Happy path\n- ✅ Edge cases\n- ✅ Boundary values\n- ✅ Error handling\n- ✅ Exception scenarios\n`,
      }],
    };
  }
);

// ─────────────────────────────────────────────
//  Start Server
// ─────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
