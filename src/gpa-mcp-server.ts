import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// ─────────────────────────────────────────────
//  Server Bootstrap
// ─────────────────────────────────────────────
const server = new McpServer({
  name: "gpa-backend-test-analyst",
  version: "1.0.0",
  description:
    "MCP especializado em análise de testes backend para o e-commerce GPA (Grupo Pão de Açúcar).",
  capabilities: {
    tools: {},
    prompts: {},
    resources: {},
    tasks: {},
  },
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
    const prompt = `
Você é um Engenheiro Sênior de Backend especializado em qualidade de software no e-commerce do GPA.

Analise o relatório de cobertura do serviço **${service_name}**.
Meta: **${target_coverage}%** de cobertura.

## Relatório recebido:
\`\`\`
${coverage_report}
\`\`\`

Retorne a análise completa com:
1. ✅ **Cobertura atual** por arquivo/classe (tabela com %, linhas cobertas/total)
2. 🔴 **Gaps críticos** — branches e linhas não cobertas, ordenados por criticidade de negócio
3. ⚠️ **Riscos de negócio** associados a cada gap (impacto em checkout, pagamento, pedidos, etc.)
4. 🧪 **Casos de teste sugeridos** para fechar cada gap (com nomenclatura \`should_[resultado]_when_[condição]\`)
5. 📊 **Estimativa de esforço** para atingir ${target_coverage}% de cobertura (story points ou horas)
6. 🏆 **Prioridade de execução** — quais testes implementar primeiro com base em risco/esforço

Domínios críticos GPA: catalog, cart, checkout, payment, order, fulfillment, customer.
Classifique cada gap como: 🔴 CRÍTICO | 🟡 MODERADO | 🟢 BAIXO.
`;

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
    const prompt = `
Você é um Engenheiro Sênior de Backend especializado em engenharia reversa e qualidade de software.

Analise o código abaixo (linguagem: **${language}**${context ? `, contexto: **${context}**` : ""}) sem assumir documentação prévia.

## Código a analisar:
\`\`\`${language}
${code_snippet}
\`\`\`

Gere uma análise completa:

1. 📝 **Descrição funcional** — o que esse módulo faz em linguagem de negócio (sem jargão técnico)
2. 📥 **Contrato de entrada** — parâmetros, tipos, validações esperadas, valores aceitos/rejeitados
3. 📤 **Contrato de saída** — formato de retorno, tipos, cenários de erro retornados
4. 🔗 **Dependências identificadas** — serviços externos, bancos de dados, filas (Kafka/RabbitMQ), APIs
5. ⚠️ **Riscos e code smells** — problemas de design, possíveis NPEs, race conditions, violações SOLID
6. 🧪 **Estratégia de teste recomendada** — quais tipos de teste aplicar e por quê
7. 📄 **Documentação gerada** — ${language === "java" || language === "kotlin" ? "Javadoc" : "JSDoc/docstring"} pronto para inserir no código

Contexto de domínio GPA: catalog, cart, checkout, payment, order, fulfillment, customer.
Integrações comuns: gateways de pagamento, ERPs, WMS, CDN, Kafka, RabbitMQ.
`;

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
        ? `\n## Gaps de cobertura identificados:\n${coverage_gaps.map((g) => "- " + g).join("\n")}`
        : "";

    const prompt = `
Você é um Engenheiro Sênior de Qualidade especializado em testes de backend no e-commerce GPA.

Gere uma **suite de testes completa** para o código abaixo.
Framework: **${framework}** | Mock: **${mock_strategy ?? "padrão do framework"}**
${gapsInfo}

## Código a testar:
\`\`\`
${code_snippet}
\`\`\`

## Requisitos obrigatórios da suite:

1. ✅ **100% de cobertura de branches** — todos os if/else/switch/try-catch cobertos
2. ✅ **Happy path** — fluxo principal com dados válidos e esperados
3. ✅ **Edge cases e boundary values** — valores nulos, vazios, limites mínimos/máximos, tipos inválidos
4. ✅ **Cenários de erro e exceção** — falhas de rede, timeouts, dados corrompidos, serviço indisponível
5. ✅ **Testes de contrato** — se houver integração externa, gere consumer-driven contract tests
6. ✅ **Nomenclatura padrão**: \`should_[resultado]_when_[condição]\`
7. ✅ **Comentários** explicando a intenção de cada teste (arrange/act/assert)
8. ✅ **Setup e teardown** — beforeEach/afterEach configurados corretamente
9. ✅ **Mocks e stubs** corretamente configurados com ${mock_strategy ?? "a estratégia padrão do framework"}

Gere o código completo dos testes, pronto para executar, sem placeholders.
Após o código, adicione um resumo: total de testes gerados, cobertura estimada e gaps restantes (se houver).
`;

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
    const prompt = `
Você é um Engenheiro Sênior de Backend especializado em diagnóstico de falhas de teste no e-commerce GPA.

Diagnostique a falha no teste: **${test_name}**

## Stack trace / Log de erro:
\`\`\`
${error_log}
\`\`\`
${test_code ? `\n## Código do teste:\n\`\`\`\n${test_code}\n\`\`\`` : ""}
${production_code ? `\n## Código de produção relacionado:\n\`\`\`\n${production_code}\n\`\`\`` : ""}

Retorne o diagnóstico completo:

1. 🔍 **Causa raiz** — explicação técnica precisa do motivo da falha
2. 🏷️ **Classificação da falha**:
   - 🌊 **Flaky** — falha intermitente por condição de corrida, timing, dados compartilhados
   - 🔄 **Regression** — mudança no código de produção quebrou comportamento existente
   - 🌍 **Environment** — problema de configuração, dependência externa, dados de ambiente
   - 🐛 **Test Bug** — o próprio teste está incorreto (assertion errada, mock mal configurado)
   - 💥 **Production Bug** — bug real no código de produção detectado pelo teste
3. 🩹 **Fix recomendado** — código corrigido (teste e/ou produção, conforme necessário)
4. 🛡️ **Como evitar recorrência** — ajustes de design, padrões de teste ou CI/CD
5. 🔎 **Impacto** — outros testes ou serviços que podem ser afetados pelo mesmo problema

Seja preciso e gere o código corrigido completo, não apenas pseudocódigo.
`;

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
      openapi:
        "OpenAPI 3.0 spec em YAML com paths, schemas, responses e security",
      adr: "Architecture Decision Record (ADR) com contexto, decisão, consequências e alternativas consideradas",
      readme:
        "README.md completo com visão geral, instalação, uso, variáveis de ambiente e exemplos",
      wiki: "Página de wiki técnica com arquitetura, fluxos, integrações e runbook operacional",
    };

    const prompt = `
Você é um Arquiteto Sênior de Software especializado em documentação técnica para o e-commerce GPA.

Gere documentação no formato **${doc_type.toUpperCase()}** para o código abaixo.
${service_context ? `Contexto do serviço: **${service_context}**` : ""}

## Código:
\`\`\`
${code_snippet}
\`\`\`

## Especificação do formato ${doc_type}:
${docGuide[doc_type]}

## Requisitos da documentação:

1. 📝 **Precisão técnica** — derive 100% do contexto do próprio código, sem inventar comportamentos
2. 🏢 **Linguagem de negócio** — explique o propósito em termos de domínio GPA (checkout, pedidos, pagamento, etc.)
3. 🔗 **Dependências e integrações** — mencione serviços externos, bancos, filas identificados
4. ⚠️ **Casos de erro** — documente todas as exceções e códigos de erro
5. 💡 **Exemplos práticos** — inclua exemplos de uso reais com dados do domínio GPA
6. 🔒 **Segurança** — se aplicável, documente autenticação, autorização e dados sensíveis

Gere a documentação completa, pronta para uso, sem placeholders.
`;

    return {
      content: [{ type: "text", text: prompt }],
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
  async ({ service_name, coverage_report, target_coverage }, { sendProgress }) => {
    await sendProgress({ progress: 10, total: 100, message: "Parsing do relatório de cobertura..." });
    await sleep(500);
    await sendProgress({ progress: 30, total: 100, message: "Identificando branches não cobertas..." });
    await sleep(500);
    await sendProgress({ progress: 55, total: 100, message: "Classificando riscos de negócio..." });
    await sleep(500);
    await sendProgress({ progress: 80, total: 100, message: "Gerando sugestões de testes..." });
    await sleep(500);
    await sendProgress({ progress: 100, total: 100, message: "Análise concluída!" });
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
  async ({ code_snippet: _code, language, context }, { sendProgress }) => {
    await sendProgress({ progress: 20, total: 100, message: "Analisando estrutura do código..." });
    await sleep(400);
    await sendProgress({ progress: 50, total: 100, message: "Mapeando dependências e contratos..." });
    await sleep(400);
    await sendProgress({ progress: 75, total: 100, message: "Detectando code smells e riscos..." });
    await sleep(400);
    await sendProgress({ progress: 100, total: 100, message: "Documentação gerada!" });
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
  async ({ code_snippet: _code, framework, mock_strategy }, { sendProgress }) => {
    await sendProgress({ progress: 15, total: 100, message: "Analisando código-fonte..." });
    await sleep(300);
    await sendProgress({ progress: 40, total: 100, message: "Gerando happy path tests..." });
    await sleep(300);
    await sendProgress({ progress: 65, total: 100, message: "Gerando edge cases e boundary tests..." });
    await sleep(300);
    await sendProgress({ progress: 85, total: 100, message: "Gerando testes de erro e exceção..." });
    await sleep(300);
    await sendProgress({ progress: 100, total: 100, message: "Suite de testes pronta!" });
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
