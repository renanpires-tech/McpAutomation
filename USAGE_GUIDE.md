# GPA Backend Test Analyst MCP — Guia de Uso Completo

> Versão 4.0.0 · Pipeline real: parsers → generators → multi-agent KB  
> Todas as ferramentas abaixo executam código real — nenhuma retorna apenas prompts.

---

## Pré-requisitos

```bash
cd C:\Users\Renan Pires\McpAutomation
npm run build   # tsc → dist/
npm start       # node dist/gpa-mcp-server.js
```

O servidor sobe via **stdio**. Configure no seu cliente MCP (ex: Cursor, Claude Desktop):

```json
{
  "mcpServers": {
    "gpa-analyst": {
      "command": "node",
      "args": ["C:/Users/Renan Pires/McpAutomation/dist/gpa-mcp-server.js"]
    }
  }
}
```

---

## Índice de Ferramentas

| # | Tool | Pipeline real | Input mínimo |
|---|------|:---:|---|
| 1 | `analyze_test_coverage` | ✅ JaCoCoParser / LcovParser | `service_name` + relatório |
| 2 | `reverse_engineer_module` | ✅ OrchestratorAgent | `code_snippet` + `language` |
| 3 | `map_decentralized_architecture` | ✅ ArchitectAgent | `service_list` + `entry_point` |
| 4 | `generate_test_suite` | ✅ JUnit5Generator | `code_snippet` + `framework` |
| 5 | `diagnose_test_failure` | ✅ StackTraceParser | `test_name` + `error_log` |
| 6 | `generate_documentation` | ✅ JavadocGenerator | `code_snippet` + `doc_type` |
| 7 | `generate_cicd_pipeline` | ✅ YAML builder | `service_name` |
| 8 | `multi_agent_analyze` | ✅ 5 agentes + KB | `input` |
| 9 | `query_knowledge_base` | ✅ SemanticMatcher | `query` |
| 10 | `task_analyze_full_coverage` | ✅ (alias síncrono) | `service_name` + relatório |
| 11 | `task_reverse_engineer` | ✅ OrchestratorAgent | `code_snippet` + `language` |
| 12 | `task_generate_test_suite` | ✅ JUnit5Generator | `code_snippet` + `framework` |
| 13 | `analyze` (v4) | ✅ TaskExecutor direto | `task_id` + input |
| 14–19 | `*_async` tasks | ✅ + polling | mesmos do síncrono |

---

## 1. `analyze_test_coverage`

Analisa cobertura JaCoCo XML **ou** LCOV. Detecta o formato automaticamente.

### JaCoCo XML

```json
{
  "service_name": "payment-service",
  "coverage_report": "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"yes\"?><!DOCTYPE report PUBLIC \"-//JACOCO//DTD Report 1.1//EN\" \"report.dtd\"><report name=\"payment-service\"><package name=\"br/com/gpa/payment\"><class name=\"br/com/gpa/payment/PaymentService\" sourcefilename=\"PaymentService.java\"><method name=\"processPayment\" desc=\"(Ljava/lang/String;)Z\" line=\"25\"><counter type=\"INSTRUCTION\" missed=\"4\" covered=\"18\"/><counter type=\"BRANCH\" missed=\"2\" covered=\"2\"/><counter type=\"LINE\" missed=\"2\" covered=\"8\"/><counter type=\"METHOD\" missed=\"0\" covered=\"1\"/></method><counter type=\"INSTRUCTION\" missed=\"4\" covered=\"18\"/><counter type=\"BRANCH\" missed=\"2\" covered=\"2\"/><counter type=\"LINE\" missed=\"2\" covered=\"8\"/><counter type=\"METHOD\" missed=\"0\" covered=\"1\"/></class><counter type=\"LINE\" missed=\"2\" covered=\"8\"/><counter type=\"BRANCH\" missed=\"2\" covered=\"2\"/></package><counter type=\"LINE\" missed=\"2\" covered=\"8\"/><counter type=\"BRANCH\" missed=\"2\" covered=\"2\"/><counter type=\"METHOD\" missed=\"0\" covered=\"1\"/></report>",
  "target_coverage": 100
}
```

**Saída esperada:** tabela de métricas (Geral/Linhas/Branches/Métodos), cobertura por domínio GPA, top-5 gaps com risco crítico.

---

### LCOV (alternativa ao JaCoCo)

```json
{
  "service_name": "checkout-service",
  "coverage_report": "SF:src/main/java/br/com/gpa/checkout/CheckoutService.java\nFN:12,processCheckout\nFN:45,applyDiscount\nFNDA:5,processCheckout\nFNDA:0,applyDiscount\nDA:12,5\nDA:13,5\nDA:14,3\nDA:45,0\nDA:46,0\nDA:47,0\nLF:6\nLH:4\nBRF:4\nBRH:2\nFNF:2\nFNH:1\nend_of_record\nSF:src/main/java/br/com/gpa/payment/PaymentProcessor.java\nFN:8,charge\nFNDA:10,charge\nDA:8,10\nDA:9,10\nDA:10,10\nLF:3\nLH:3\nBRF:2\nBRH:2\nFNF:1\nFNH:1\nend_of_record",
  "target_coverage": 80
}
```

**Saída esperada:** tabela por arquivo com %, emoji de risco por domínio, lista de arquivos abaixo de 80%.

---

## 2. `reverse_engineer_module`

Engenharia reversa via OrchestratorAgent (ANALYST → TESTER → ARCHITECT).

```json
{
  "code_snippet": "public class PaymentWebhookHandler {\n    @Autowired private PaymentRepository repository;\n    @Autowired private EventPublisher publisher;\n\n    @Transactional\n    public void handle(WebhookPayload payload) {\n        if (repository.existsByExternalId(payload.getExternalId())) return;\n        Payment payment = Payment.from(payload);\n        repository.save(payment);\n        publisher.publish(new PaymentConfirmedEvent(payment));\n    }\n}",
  "language": "java",
  "context": "Webhook de confirmação de pagamento do gateway Cielo"
}
```

**Saída esperada:** padrão detectado (`webhook_handler`), contratos de entrada/saída, dependências, 3–5 casos de teste prioritários gerados pelo TesterAgent.

---

## 3. `map_decentralized_architecture`

Mapeia grafo de dependências, SPOFs e estratégia de testes por camada.

```json
{
  "service_list": ["checkout-service", "payment-service", "inventory-service", "notification-service", "fraud-service"],
  "entry_point": "checkout-service",
  "interaction_logs": "2026-05-29 checkout-service → payment-service POST /payments 200 145ms\n2026-05-29 checkout-service → inventory-service GET /reserve 200 32ms\n2026-05-29 payment-service → fraud-service POST /analyze 200 89ms\n2026-05-29 payment-service → notification-service kafka:payment.confirmed"
}
```

**Saída esperada:** diagrama Mermaid, lista de SPOFs, separação síncrono/assíncrono, estratégia unitário/integração/E2E, recomendações de circuit breaker.

---

## 4. `generate_test_suite`

Gera classe JUnit5 compilável com MockitoGenerator integrado.

```json
{
  "code_snippet": "@Service\npublic class CartService {\n    private final CartRepository cartRepository;\n    private final PricingService pricingService;\n    private final CouponService couponService;\n\n    public CartService(CartRepository cartRepository, PricingService pricingService, CouponService couponService) {\n        this.cartRepository = cartRepository;\n        this.pricingService = pricingService;\n        this.couponService = couponService;\n    }\n\n    public Cart addItem(String cartId, CartItem item) {\n        Cart cart = cartRepository.findById(cartId).orElseThrow(() -> new CartNotFoundException(cartId));\n        cart.addItem(item);\n        BigDecimal total = pricingService.calculateTotal(cart);\n        cart.setTotal(total);\n        return cartRepository.save(cart);\n    }\n\n    public Cart applyCoupon(String cartId, String couponCode) {\n        Cart cart = cartRepository.findById(cartId).orElseThrow(() -> new CartNotFoundException(cartId));\n        Coupon coupon = couponService.validate(couponCode);\n        cart.applyCoupon(coupon);\n        return cartRepository.save(cart);\n    }\n}",
  "framework": "junit5",
  "coverage_gaps": ["CartService.java:34 - branch: coupon already applied", "CartService.java:22 - branch: item quantity > max"],
  "mock_strategy": "mockito"
}
```

**Saída esperada:** `CartServiceTest.java` completo com `@ExtendWith(MockitoExtension.class)`, `@Mock` para cada dependência via `MockitoGenerator`, `@InjectMocks CartService subject`, testes nomeados `should_[result]_when_[condition]`.

> Para frameworks diferentes de `junit5` (jest, pytest, spock, testng), o pipeline gera JUnit5 e exibe aviso de conversão necessária.

---

## 5. `diagnose_test_failure`

Analisa stack trace via `StackTraceParser` + `classifyRisk`.

```json
{
  "test_name": "CartServiceTest#should_apply_coupon_when_valid_code",
  "error_log": "org.opentest4j.AssertionFailedError: expected: <200.00> but was: <250.00>\n\tat org.junit.jupiter.api.AssertionUtils.fail(AssertionUtils.java:55)\n\tat org.junit.jupiter.api.Assertions.assertEquals(Assertions.java:196)\n\tat br.com.gpa.cart.CartServiceTest.should_apply_coupon_when_valid_code(CartServiceTest.java:89)\n\tat java.base/jdk.internal.reflect.NativeMethodAccessorImpl.invoke(NativeMethodAccessorImpl.java:62)\nCaused by: java.lang.NullPointerException\n\tat br.com.gpa.cart.CartService.applyCoupon(CartService.java:34)",
  "test_code": "@Test\nvoid should_apply_coupon_when_valid_code() {\n    when(couponService.validate(\"GPA10\")).thenReturn(new Coupon(\"GPA10\", 10));\n    Cart result = cartService.applyCoupon(\"CART-001\", \"GPA10\");\n    assertEquals(new BigDecimal(\"200.00\"), result.getTotal());\n}",
  "production_code": "public Cart applyCoupon(String cartId, String couponCode) {\n    Cart cart = cartRepository.findById(cartId).orElseThrow(() -> new CartNotFoundException(cartId));\n    Coupon coupon = couponService.validate(couponCode);\n    cart.applyCoupon(coupon);\n    return cartRepository.save(cart);\n}"
}
```

**Saída esperada:** cabeçalho `## 🔍 Diagnóstico: 'CartServiceTest#...'`, exceção identificada, domínio (`cart`) + risco (`ALTO`), causa raiz (NPE em linha 34), patch compilável, teste regressivo.

---

## 6. `generate_documentation`

Gera Javadoc/KDoc via `JavadocGenerator`.

```json
{
  "code_snippet": "@Component\npublic class FraudAnalyzer {\n    private static final double AUTO_APPROVE_THRESHOLD = 0.3;\n    private static final double MANUAL_REVIEW_THRESHOLD = 0.7;\n\n    private final MLModelClient mlClient;\n    private final FraudRepository fraudRepository;\n\n    public FraudScore analyze(Order order) {\n        double score = mlClient.predict(order.toFeatureVector());\n        FraudScore result = new FraudScore(order.getId(), score);\n        if (score < AUTO_APPROVE_THRESHOLD) {\n            result.setDecision(Decision.APPROVED);\n        } else if (score >= MANUAL_REVIEW_THRESHOLD) {\n            result.setDecision(Decision.MANUAL_REVIEW);\n        } else {\n            result.setDecision(Decision.PENDING);\n        }\n        return fraudRepository.save(result);\n    }\n}",
  "doc_type": "javadoc",
  "service_context": "fraud detection service"
}
```

> Para `doc_type` = `openapi`, `adr`, `readme` ou `wiki`, o pipeline gera Javadoc/KDoc e exibe aviso de que conversão adicional é necessária.

---

## 7. `generate_cicd_pipeline`

Gera workflow GitHub Actions com análise JaCoCo e bloqueio de merge.

```json
{
  "service_name": "payment-service",
  "target_coverage": 90,
  "java_version": 21,
  "build_tool": "maven"
}
```

**Saída esperada:** YAML completo com steps de checkout, setup-java, build/test, geração de relatório JaCoCo, comentário automático no PR e bloqueio se cobertura < meta.

---

## 8. `multi_agent_analyze`

Pipeline completo: `ANALYST → TESTER → ARCHITECT → DOC → MEMORY`. Resultado persiste no Knowledge Base em `knowledge/`.

```json
{
  "input": "Analisa esse Kafka consumer de pedidos e gera testes críticos",
  "code_snippet": "@KafkaListener(topics = \"orders.created\", groupId = \"fulfillment-service\")\n@Transactional\npublic void onOrderCreated(OrderCreatedEvent event) {\n    if (fulfillmentRepository.existsByOrderId(event.getOrderId())) {\n        log.warn(\"Duplicate event ignored: {}\", event.getOrderId());\n        return;\n    }\n    Fulfillment fulfillment = Fulfillment.create(event);\n    fulfillmentRepository.save(fulfillment);\n    warehouseService.reserveStock(fulfillment);\n    publisher.publish(new FulfillmentCreatedEvent(fulfillment));\n}"
}
```

**Saída esperada:** análise de padrão (`kafka_consumer`), riscos detectados, suite de testes JUnit5, Javadoc, item persistido no KB.

### Variações de `input` por caso de uso

| Intenção | Exemplo de `input` |
|---|---|
| Analisar cobertura | `"Identifica os gaps de cobertura mais críticos para o payment-service"` |
| Gerar testes | `"Gera testes completos para esse webhook handler de pagamento"` |
| Diagnosticar falha | `"Diagnostica por que esse teste de idempotência está falhando"` |
| Documentar | `"Gera Javadoc completo para esse serviço de fraude"` |
| Arquitetura | `"Mapeia os riscos de SPOF no fluxo de checkout"` |

---

## 9. `query_knowledge_base`

Consulta o KB acumulado pelas execuções de `multi_agent_analyze`.

```json
{
  "query": "webhook payment idempotencia retry",
  "top_n": 3
}
```

**Saída esperada:** até 3 soluções similares com `confidence`, `reuse_count`, padrão e resumo da solução.

> **Nota:** o KB só retorna resultados após pelo menos uma execução de `multi_agent_analyze` que persista aprendizado.

---

## 10–12. Task Tools (síncronas)

Aliases diretos para o pipeline real. Use quando quiser resultado imediato sem polling.

### `task_analyze_full_coverage`

```json
{
  "service_name": "order-service",
  "coverage_report": "SF:src/main/java/br/com/gpa/order/OrderService.java\nDA:10,5\nDA:11,5\nDA:12,0\nDA:13,0\nLF:4\nLH:2\nBRF:2\nBRH:1\nFNF:1\nFNH:1\nend_of_record",
  "target_coverage": 100
}
```

### `task_reverse_engineer`

```json
{
  "code_snippet": "@FeignClient(name = \"inventory-service\")\npublic interface InventoryClient {\n    @GetMapping(\"/api/v1/products/{sku}/availability\")\n    InventoryResponse checkAvailability(@PathVariable String sku, @RequestParam int quantity);\n}",
  "language": "java",
  "context": "Feign client para consulta de disponibilidade de estoque"
}
```

### `task_generate_test_suite`

```json
{
  "code_snippet": "@Service\npublic class PricingService {\n    public BigDecimal calculateTotal(Cart cart) {\n        return cart.getItems().stream()\n            .map(i -> i.getPrice().multiply(BigDecimal.valueOf(i.getQuantity())))\n            .reduce(BigDecimal.ZERO, BigDecimal::add);\n    }\n}",
  "framework": "junit5",
  "mock_strategy": "mockito"
}
```

---

## 13. `analyze` (v4 — TaskExecutor direto)

Acesso direto ao TaskExecutor sem passar pelos handlers do servidor.

```json
{
  "task_id": "analyze_coverage",
  "service_name": "checkout-service",
  "jacoco_xml": "<report name=\"checkout-service\"><package name=\"br/com/gpa/checkout\"><class name=\"br/com/gpa/checkout/CheckoutService\"><counter type=\"LINE\" missed=\"5\" covered=\"45\"/><counter type=\"BRANCH\" missed=\"3\" covered=\"9\"/></class></package></report>"
}
```

**task_id disponíveis:**

| `task_id` | Inputs obrigatórios | Opcional |
|---|---|---|
| `analyze_coverage` | `service_name` | `jacoco_xml` **ou** `lcov_report` |
| `generate_tests` | `source_code`, `class_name` | — |
| `diagnose_failure` | `stack_trace` | `test_code` |
| `generate_docs` | `source_code`, `class_name` | — |
| `full_analysis` | `source_code`, `class_name` | `service_name` |

---

## 14–19. Tasks Assíncronas (polling)

Mesmos inputs das síncronas, mas o servidor cria uma tarefa com `taskId` e você faz polling via `getTask`.

```json
// task_orchestrate_async — ex:
{
  "input": "Analisa o risco de cobertura no fluxo de checkout completo",
  "code_snippet": "// código do serviço"
}
```

```json
// task_analyze_coverage_async
{
  "service_name": "fraud-service",
  "coverage_report": "SF:src/FraudAnalyzer.java\nDA:10,3\nDA:11,3\nDA:12,0\nLF:3\nLH:2\nend_of_record",
  "target_coverage": 100
}
```

```json
// task_diagnose_failure_async
{
  "error_log": "java.lang.NullPointerException\n\tat br.com.gpa.payment.PaymentService.processPayment(PaymentService.java:52)",
  "test_code": "@Test void should_process_payment() { ... }",
  "service_context": "payment-service"
}
```

```json
// task_map_architecture_async
{
  "code_or_config": "checkout-service: depends-on: [payment-service, inventory-service, fraud-service]\npayment-service: depends-on: [fraud-service, notification-service]",
  "service_names": "checkout-service, payment-service, inventory-service, fraud-service, notification-service"
}
```

---

## Fluxo de Teste Completo (passo a passo)

```
1. analyze_test_coverage  →  detecta gaps por domínio + risco
2. generate_test_suite    →  gera JUnit5 para cada gap crítico
3. multi_agent_analyze    →  pipeline completo + KB persistido
4. query_knowledge_base   →  reutiliza soluções de execuções anteriores
5. diagnose_test_failure  →  quando um teste novo falhar no CI
6. generate_documentation →  Javadoc para classes com risco CRÍTICO
7. generate_cicd_pipeline →  automatiza o fluxo no PR
```

---

## Domínios e Níveis de Risco GPA

| Domínio | Risco | Emoji |
|---|---|---|
| `checkout`, `payment` | CRÍTICO | 🔴 |
| `order`, `cart` | ALTO | 🟠 |
| `catalog`, `customer` | MÉDIO | 🟡 |
| `general`, `util`, `config` | BAIXO | 🟢 |

---

## Troubleshooting

| Problema | Causa provável | Solução |
|---|---|---|
| `❌ Forneça jacoco_xml ou lcov_report` | Nenhum relatório enviado | Passe `jacoco_xml` **ou** `lcov_report` |
| `❌ source_code é obrigatório` | Campo vazio no `generate_tests` | Envie o código-fonte completo |
| `❌ stack_trace é obrigatório` | `diagnose_test_failure` sem log | Passe o stack trace em `error_log` |
| KB vazio (`query_knowledge_base`) | Nenhuma execução persistiu | Execute `multi_agent_analyze` ao menos uma vez |
| JUnit5 gerado para framework diferente | Pipeline sempre gera JUnit5 | Adapte o código gerado para o framework alvo |
| Build falha | `tsc` com erro | Execute `npm run build` e corrija os erros TypeScript |
