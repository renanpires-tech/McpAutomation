import { EventEmitter } from "node:events";
import type { PatternDetection, PatternName } from "./types.js";

// ─────────────────────────────────────────────
//  Test Templates per Pattern
// ─────────────────────────────────────────────

const TEST_TEMPLATES: Record<PatternName, (className: string, refinement: string[]) => string> = {
  webhook_handler: (cls, refinement) => `
// ─── ${cls} — Webhook Handler Tests ───────────────────────────────────────
@ExtendWith(MockitoExtension.class)
class ${cls}Test {

    @InjectMocks private ${cls} handler;
    @Mock private PaymentService paymentService;
    @Mock private WebhookValidator webhookValidator;

    @Test
    void should_return_200_when_valid_payload() {
        // GIVEN
        var payload = buildValidPayload();
        given(webhookValidator.validate(payload)).willReturn(true);
        given(paymentService.process(payload)).willReturn(ProcessResult.OK);
        // WHEN
        var response = handler.handle(payload, VALID_SIGNATURE);
        // THEN
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        verify(paymentService).process(payload);
    }

    @Test
    void should_return_400_when_payload_is_malformed() {
        // GIVEN
        var badPayload = "{invalid json}";
        // WHEN / THEN
        assertThatThrownBy(() -> handler.handle(badPayload, VALID_SIGNATURE))
            .isInstanceOf(MalformedPayloadException.class);
        verifyNoInteractions(paymentService);
    }

    @Test
    void should_return_400_when_payload_is_null() {
        // GIVEN / WHEN / THEN
        assertThatThrownBy(() -> handler.handle(null, VALID_SIGNATURE))
            .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void should_be_idempotent_when_same_payload_sent_twice() {
        // GIVEN
        var payload = buildValidPayload();
        given(paymentService.process(payload)).willReturn(ProcessResult.OK);
        // WHEN
        handler.handle(payload, VALID_SIGNATURE);
        handler.handle(payload, VALID_SIGNATURE); // segunda chamada
        // THEN — processamento ocorre apenas uma vez
        verify(paymentService, times(1)).process(payload);
    }

    @Test
    void should_return_401_when_signature_is_invalid() {
        // GIVEN
        given(webhookValidator.validate(any())).willReturn(false);
        // WHEN / THEN
        assertThatThrownBy(() -> handler.handle(buildValidPayload(), "invalid-sig"))
            .isInstanceOf(InvalidSignatureException.class);
    }

    @Test
    void should_handle_processing_exception_gracefully() {
        // GIVEN
        var payload = buildValidPayload();
        given(webhookValidator.validate(payload)).willReturn(true);
        given(paymentService.process(payload)).willThrow(new RuntimeException("payment gateway down"));
        // WHEN
        var response = handler.handle(payload, VALID_SIGNATURE);
        // THEN
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
        verify(paymentService).process(payload); // chamada foi tentada
    }
${refinement.length > 0 ? "\n    // ─── Testes adicionados após revisão ARCHITECT ───\n" + refinement.map(r => `    // TODO: ${r}`).join("\n") : ""}
    // ─── Helper ───
    private String buildValidPayload() {
        return """{"eventId":"evt_001","amount":100.00,"currency":"BRL"}""";
    }
    private static final String VALID_SIGNATURE = "sha256=abc123";
}`,

  kafka_consumer: (cls, refinement) => `
// ─── ${cls} — Kafka Consumer Tests ────────────────────────────────────────
@ExtendWith(MockitoExtension.class)
class ${cls}Test {

    @InjectMocks private ${cls} consumer;
    @Mock private OrderService orderService;
    @Mock private DeadLetterQueueService dlqService;

    @Test
    void should_process_message_when_valid_event_received() {
        // GIVEN
        var record = buildConsumerRecord("""{"orderId":"ord_001","status":"CREATED"}""");
        // WHEN
        consumer.consume(record);
        // THEN
        verify(orderService).process(argThat(e -> "ord_001".equals(e.getOrderId())));
    }

    @Test
    void should_send_to_dlq_when_processing_throws_exception() {
        // GIVEN
        var record = buildConsumerRecord("""{"orderId":"ord_002","status":"CREATED"}""");
        doThrow(new RuntimeException("DB timeout")).when(orderService).process(any());
        // WHEN
        consumer.consume(record);
        // THEN
        verify(dlqService).send(eq(record), any(RuntimeException.class));
        verify(orderService).process(any());
    }

    @Test
    void should_be_idempotent_when_duplicate_event_received() {
        // GIVEN — mesmo evento enviado duas vezes
        var record = buildConsumerRecord("""{"orderId":"ord_003","status":"CREATED"}""");
        // WHEN
        consumer.consume(record);
        consumer.consume(record);
        // THEN — processamento ocorre apenas uma vez
        verify(orderService, times(1)).process(any());
    }

    @Test
    void should_log_error_when_deserialization_fails() {
        // GIVEN — JSON inválido
        var record = buildConsumerRecord("NOT_VALID_JSON");
        // WHEN
        consumer.consume(record);
        // THEN — não deve propagar exceção, deve logar e enviar para DLQ
        verify(dlqService).sendRaw(eq(record), any(DeserializationException.class));
        verifyNoInteractions(orderService);
    }
${refinement.length > 0 ? "\n    // ─── Testes adicionados após revisão ARCHITECT ───\n" + refinement.map(r => `    // TODO: ${r}`).join("\n") : ""}
    private ConsumerRecord<String, String> buildConsumerRecord(String value) {
        return new ConsumerRecord<>("orders", 0, 0L, "key", value);
    }
}`,

  transactional_service: (cls, refinement) => `
// ─── ${cls} — Transactional Service Tests ─────────────────────────────────
@ExtendWith(MockitoExtension.class)
class ${cls}Test {

    @InjectMocks private ${cls} service;
    @Mock private OrderRepository orderRepository;
    @Mock private StockRepository stockRepository;
    @Mock private AuditRepository auditRepository;

    @Test
    void should_commit_when_all_operations_succeed() {
        // GIVEN
        var cmd = buildValidCommand();
        given(orderRepository.save(any())).willReturn(buildOrder());
        given(stockRepository.reserve(any(), anyInt())).willReturn(true);
        // WHEN
        var result = service.execute(cmd);
        // THEN
        assertThat(result).isNotNull();
        verify(orderRepository).save(any());
        verify(stockRepository).reserve(any(), anyInt());
        verify(auditRepository).log(any());
    }

    @Test
    void should_rollback_when_repository_throws_exception() {
        // GIVEN
        var cmd = buildValidCommand();
        given(orderRepository.save(any())).willReturn(buildOrder());
        doThrow(new DataAccessException("DB error") {}).when(stockRepository).reserve(any(), anyInt());
        // WHEN / THEN
        assertThatThrownBy(() -> service.execute(cmd))
            .isInstanceOf(DataAccessException.class);
        // verify rollback via @Transactional — auditRepository não deve ter sido comitado
        verify(auditRepository, never()).log(any());
    }

    @Test
    void should_not_persist_partial_state_on_failure() {
        // GIVEN
        var cmd = buildValidCommand();
        given(orderRepository.save(any())).willReturn(buildOrder());
        doThrow(new RuntimeException("stock service down")).when(stockRepository).reserve(any(), anyInt());
        // WHEN
        assertThatThrownBy(() -> service.execute(cmd)).isInstanceOf(RuntimeException.class);
        // THEN — order não deve estar no banco (rollback)
        verify(orderRepository, never()).flush();
    }

    @Test
    void should_throw_original_exception_after_rollback() {
        // GIVEN
        var cmd = buildValidCommand();
        var originalEx = new BusinessException("insufficient stock");
        doThrow(originalEx).when(stockRepository).reserve(any(), anyInt());
        // WHEN / THEN
        assertThatThrownBy(() -> service.execute(cmd))
            .isInstanceOf(BusinessException.class)
            .hasMessage("insufficient stock");
    }
${refinement.length > 0 ? "\n    // ─── Testes adicionados após revisão ARCHITECT ───\n" + refinement.map(r => `    // TODO: ${r}`).join("\n") : ""}
}`,

  feign_client: (cls, refinement) => `
// ─── ${cls} — Feign/HTTP Client Tests ─────────────────────────────────────
@ExtendWith(MockitoExtension.class)
class ${cls}Test {

    @InjectMocks private ${cls} client;
    @Mock private FeignClientDelegate delegate;

    @Test
    void should_return_response_when_downstream_is_healthy() {
        // GIVEN
        given(delegate.call(any())).willReturn(buildSuccessResponse());
        // WHEN
        var result = client.execute(buildRequest());
        // THEN
        assertThat(result).isNotNull();
        assertThat(result.isSuccess()).isTrue();
    }

    @Test
    void should_throw_when_downstream_returns_5xx() {
        // GIVEN
        given(delegate.call(any())).willThrow(new FeignException.InternalServerError("", buildRequest(), null, null));
        // WHEN / THEN
        assertThatThrownBy(() -> client.execute(buildRequest()))
            .isInstanceOf(ServiceUnavailableException.class);
    }

    @Test
    void should_timeout_when_downstream_is_slow() {
        // GIVEN
        given(delegate.call(any())).willAnswer(inv -> { Thread.sleep(5000); return null; });
        // WHEN / THEN — deve lançar timeout antes de 5s
        assertThatThrownBy(() -> client.execute(buildRequest()))
            .isInstanceOf(RetryableException.class);
    }

    @Test
    void should_use_fallback_when_circuit_breaker_is_open() {
        // GIVEN — circuit breaker aberto
        given(delegate.call(any())).willThrow(new CircuitBreakerOpenException("payment-service"));
        // WHEN
        var result = client.execute(buildRequest());
        // THEN — fallback retorna resposta padrão, não propaga exceção
        assertThat(result.isFallback()).isTrue();
    }
${refinement.length > 0 ? "\n    // ─── Testes adicionados após revisão ARCHITECT ───\n" + refinement.map(r => `    // TODO: ${r}`).join("\n") : ""}
}`,

  unknown: (cls, _) => `
// ─── ${cls} — Generic Tests ────────────────────────────────────────────────
@ExtendWith(MockitoExtension.class)
class ${cls}Test {

    @InjectMocks private ${cls} subject;

    @Test
    void should_return_expected_result_when_valid_input_provided() {
        // GIVEN
        // TODO: configure mocks
        // WHEN
        // var result = subject.execute(input);
        // THEN
        // assertThat(result).isNotNull();
        fail("Implementar teste com base no padrão identificado");
    }
}`,
};

// ─────────────────────────────────────────────
//  TesterAgent
// ─────────────────────────────────────────────

export class TesterAgent {
  constructor(private readonly emitter: EventEmitter) {}

  generateTests(detections: PatternDetection[], className: string, refinementFeedback: string[]): string {
    if (detections.length === 0) return "";

    const primary = detections[0];
    const template = TEST_TEMPLATES[primary.pattern] ?? TEST_TEMPLATES.unknown;
    const tests = template(className, refinementFeedback);

    this.emitter.emit("test_generated", {
      type: "test_generated",
      source: "TESTER",
      payload: { pattern: primary.pattern, className, tests },
    });

    return tests.trim();
  }

  extractClassName(code: string): string {
    const match = /(?:class|interface|enum)\s+(\w+)/.exec(code);
    return match?.[1] ?? "UnknownClass";
  }
}
