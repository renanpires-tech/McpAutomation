# GPA Backend Test Analyst MCP

Servidor MCP especializado em análise de qualidade de testes backend para o e-commerce do **Grupo Pão de Açúcar (GPA)**.

Atua como um Engenheiro Sênior de Backend na sustentação de microsserviços, cobrindo análise de cobertura, engenharia reversa de módulos sem documentação, mapeamento de arquiteturas descentralizadas e geração de suites de testes completas.

---

## Índice

- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Como rodar](#como-rodar)
- [Integração com VS Code](#integração-com-vs-code)
- [Tools disponíveis](#tools-disponíveis)
- [Resources disponíveis](#resources-disponíveis)
- [Prompt Templates](#prompt-templates)
- [Exemplos de uso](#exemplos-de-uso)
- [Métricas de qualidade](#métricas-de-qualidade)

---

## Pré-requisitos

- [Node.js](https://nodejs.org/) >= 18
- [VS Code](https://code.visualstudio.com/) com extensão **GitHub Copilot Chat**

---

## Instalação

```bash
git clone <url-do-repositorio>
cd McpAutomation
npm install
npm run build
```

---

## Como rodar

### Modo desenvolvimento (sem build)

```bash
npm run dev
```

### Modo produção

```bash
npm run build
npm start
```

### Testar visualmente com o MCP Inspector

```bash
npx @modelcontextprotocol/inspector node dist/gpa-mcp-server.js
```

Acesse **http://localhost:6274** para explorar todas as tools, resources e prompts com uma interface gráfica.

---

## Integração com VS Code

O arquivo `.vscode/mcp.json` já está configurado. Com o build gerado (`dist/gpa-mcp-server.js`), o servidor é detectado automaticamente pelo VS Code.

1. Abra o **GitHub Copilot Chat** (`Ctrl+Alt+I`)
2. Selecione o modo **Agent**
3. O servidor `gpa-backend-test-analyst` estará disponível

### Configuração manual (outros clientes MCP)

```json
{
  "mcpServers": {
    "gpa-backend-test-analyst": {
      "command": "node",
      "args": ["caminho/para/dist/gpa-mcp-server.js"],
      "env": {
        "GPA_ENVIRONMENT": "sustentacao",
        "TARGET_COVERAGE": "100"
      }
    }
  }
}
```

---

## Tools disponíveis

### `analyze_test_coverage`
Analisa o relatório de cobertura de um serviço. Identifica gaps, classifica riscos de negócio por criticidade e sugere casos de teste para fechar os gaps.

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `service_name` | string | ✅ | Nome do microsserviço ou módulo |
| `coverage_report` | string | ✅ | Relatório em formato LCOV, JSON ou XML (Istanbul/JaCoCo) |
| `target_coverage` | number | ❌ | Meta de cobertura em % (padrão: 100) |

---

### `reverse_engineer_module`
Analisa código sem documentação e gera descrição funcional, contratos de entrada/saída, dependências identificadas e documentação pronta (Javadoc/JSDoc).

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `code_snippet` | string | ✅ | Trecho de código a analisar |
| `language` | enum | ✅ | `java`, `kotlin`, `node`, `python`, `go` |
| `context` | string | ❌ | Contexto do módulo (ex: `checkout service`) |

---

### `map_decentralized_architecture`
Mapeia dependências entre microsserviços, identifica Single Points of Failure (SPOFs), fluxos síncronos/assíncronos e gera estratégia de testes por camada com diagrama Mermaid.

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `service_list` | string[] | ✅ | Lista dos serviços envolvidos |
| `entry_point` | string | ✅ | Serviço de entrada da análise |
| `interaction_logs` | string | ❌ | Logs de chamadas entre serviços |

---

### `generate_test_suite`
Gera suite de testes completa com 100% de cobertura de branches: happy path, edge cases, cenários de erro, testes de contrato e mocks configurados.

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `code_snippet` | string | ✅ | Código-fonte do método/classe a testar |
| `framework` | enum | ✅ | `junit5`, `jest`, `pytest`, `testng`, `spock` |
| `coverage_gaps` | string[] | ❌ | Linhas/branches sem cobertura identificados |
| `mock_strategy` | enum | ❌ | `mockito`, `jest-mock`, `wiremock`, `testcontainers` |

---

### `diagnose_test_failure`
Diagnostica falhas em testes existentes: identifica causa raiz, classifica o tipo (flaky, regression, environment, test bug, production bug) e gera o código corrigido.

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `test_name` | string | ✅ | Nome completo do teste que falhou |
| `error_log` | string | ✅ | Stack trace ou log de erro completo |
| `test_code` | string | ❌ | Código-fonte do teste |
| `production_code` | string | ❌ | Código de produção relacionado |

---

### `generate_documentation`
Gera documentação técnica a partir do código nos formatos JSDoc, Javadoc, OpenAPI 3.0, ADR, README ou Wiki.

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `code_snippet` | string | ✅ | Código-fonte para documentar |
| `doc_type` | enum | ✅ | `jsdoc`, `javadoc`, `openapi`, `adr`, `readme`, `wiki` |
| `service_context` | string | ❌ | Contexto do serviço |

---

## Resources disponíveis

| URI | Nome | Descrição |
|---|---|---|
| `gpa://architecture/service-map` | Mapa de Arquitetura GPA | Todos os microsserviços por domínio com integrações e padrões |
| `gpa://tests/coverage-baseline` | Baseline de Cobertura | Cobertura atual por serviço com status e prioridade de melhoria |
| `gpa://tests/flaky-registry` | Registro de Testes Flaky | Testes instáveis conhecidos com causa suspeita e status de investigação |

---

## Prompt Templates

| Nome | Parâmetros | Descrição |
|---|---|---|
| `coverage-analysis` | `service_name`, `target_coverage` | Análise completa de cobertura com gaps e estimativa de esforço |
| `reverse-engineer-module` | `service_name` | Engenharia reversa com contrato, dependências e documentação |
| `architecture-mapping` | `service_list`, `entry_point` | Mapeamento de arquitetura com diagrama Mermaid e estratégia de testes |
| `generate-test-suite` | `framework`, `mock_strategy` | Geração de suite com 100% de cobertura e nomenclatura padrão |

---

## Exemplos de uso

### Analisar cobertura de um serviço

```
Analise a cobertura do checkout-service com meta de 100%.
[cole o relatório LCOV aqui]
```

### Fazer engenharia reversa de um método

```
Analise esse código Java do payment-service sem documentação e gere o Javadoc completo.
[cole o código aqui]
```

### Mapear dependências de um fluxo de compra

```
Mapeie os serviços: cart-service, checkout-service, payment-service, order-service
Ponto de entrada: checkout-service
```

### Diagnosticar um teste falhando na pipeline

```
O teste should_complete_order_when_payment_approved está falhando com esse erro:
[cole o stack trace aqui]
```

---

## Métricas de qualidade

| Métrica | Meta |
|---|---|
| Line Coverage | ≥ 100% |
| Branch Coverage | ≥ 100% |
| Mutation Score | ≥ 85% |
| Flaky Test Rate | < 1% |
| Tempo de execução (unit) | < 5 min |
| Tempo de execução (integration) | < 15 min |

---

## Domínios cobertos

`catalog` · `cart` · `checkout` · `payment` · `order` · `fulfillment` · `customer`

Integrações: gateways de pagamento · ERPs · WMS · CDN · Kafka · RabbitMQ · Antifraude

Padrões: REST · gRPC · Event-driven · BFF · CQRS · Saga
