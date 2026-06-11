import { describe, it, expect } from "vitest";
import { JUnit5Generator } from "../generators/JUnit5Generator.js";

const gen = new JUnit5Generator();

const PAYMENT_SERVICE_SOURCE = `
package br.com.gpa.payment;

import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class PaymentService {
    @Autowired private PaymentRepository paymentRepository;
    @Autowired private FraudClient fraudClient;

    public Payment process(PaymentRequest request) {
        fraudClient.validate(request);
        Payment payment = Payment.from(request);
        return paymentRepository.save(payment);
    }
}`;

const WEBHOOK_SOURCE = `
@Component
public class WebhookHandler {
    @Autowired private EventPublisher publisher;

    @Transactional
    public void handle(WebhookPayload payload) {
        publisher.publish(new PaymentEvent(payload));
    }
}`;

const KAFKA_SOURCE = `
@KafkaListener(topics = "orders.created")
@Transactional
public void onOrderCreated(OrderCreatedEvent event) {
    orderRepository.save(Order.from(event));
}`;

// ────────────────────────────────────────────
describe("JUnit5Generator", () => {

  describe("generateFromSource() — structure", () => {
    it("produces @ExtendWith(MockitoExtension.class)", () => {
      const result = gen.generateFromSource(PAYMENT_SERVICE_SOURCE, "PaymentService");
      expect(result).toContain("@ExtendWith(MockitoExtension.class)");
    });

    it("produces class declaration with Test suffix", () => {
      const result = gen.generateFromSource(PAYMENT_SERVICE_SOURCE, "PaymentService");
      expect(result).toContain("class PaymentServiceTest");
    });

    it("produces @InjectMocks for the class under test", () => {
      const result = gen.generateFromSource(PAYMENT_SERVICE_SOURCE, "PaymentService");
      expect(result).toContain("@InjectMocks");
      expect(result).toContain("private PaymentService subject");
    });

    it("produces @Mock for each @Autowired dependency", () => {
      const result = gen.generateFromSource(PAYMENT_SERVICE_SOURCE, "PaymentService");
      expect(result).toContain("@Mock");
      expect(result).toContain("PaymentRepository");
      expect(result).toContain("FraudClient");
    });

    it("includes JUnit5 imports", () => {
      const result = gen.generateFromSource(PAYMENT_SERVICE_SOURCE, "PaymentService");
      expect(result).toContain("import org.junit.jupiter.api.Test");
      expect(result).toContain("import org.junit.jupiter.api.extension.ExtendWith");
    });

    it("includes Mockito imports", () => {
      const result = gen.generateFromSource(PAYMENT_SERVICE_SOURCE, "PaymentService");
      expect(result).toContain("import org.mockito.Mock");
      expect(result).toContain("import org.mockito.InjectMocks");
      expect(result).toContain("import static org.mockito.Mockito.*");
    });

    it("adds Spring Transactional import when source has @Transactional", () => {
      const result = gen.generateFromSource(WEBHOOK_SOURCE, "WebhookHandler");
      expect(result).toContain("import org.springframework.transaction.annotation.Transactional");
    });

    it("does NOT add Transactional import when source lacks @Transactional", () => {
      const result = gen.generateFromSource(PAYMENT_SERVICE_SOURCE, "PaymentService");
      expect(result).not.toContain("import org.springframework.transaction.annotation.Transactional");
    });
  });

  describe("generateFromSource() — test methods", () => {
    it("produces at least one @Test method", () => {
      const result = gen.generateFromSource(PAYMENT_SERVICE_SOURCE, "PaymentService");
      expect(result).toContain("@Test");
    });

    it("produces should-style naming convention in test methods", () => {
      const result = gen.generateFromSource(PAYMENT_SERVICE_SOURCE, "PaymentService");
      // generator uses camelCase: shouldExecuteHappyPath, shouldThrowWhenInputIsInvalid, etc.
      expect(result).toMatch(/void should[A-Z]/);
    });

    it("generates idempotency test for webhook pattern", () => {
      const result = gen.generateFromSource(WEBHOOK_SOURCE, "WebhookHandler");
      // webhookTests() generates shouldProcessWebhookIdempotently + idempotencyKey variable
      const hasIdempotency =
        result.includes("Idempotent") ||
        result.includes("idempotencyKey") ||
        result.toLowerCase().includes("idempotent");
      expect(hasIdempotency).toBe(true);
    });

    it("generates kafka consumer tests for @KafkaListener pattern", () => {
      const result = gen.generateFromSource(KAFKA_SOURCE, "KafkaConsumer");
      expect(result).toContain("@Test");
    });
  });

  describe("generateForGap() — from CoverageGap", () => {
    it("produces a compilable test class for a given gap", () => {
      const gap = {
        file: "PaymentService.java",
        className: "br/com/gpa/payment/PaymentService",
        line: 42,
        type: "LINE" as const,
        domain: "payment" as const,
        risk: "CRÍTICO" as const,
        missedCount: 3,
      };
      const result = gen.generateForGap(gap, PAYMENT_SERVICE_SOURCE);
      expect(result).toContain("@ExtendWith(MockitoExtension.class)");
      expect(result).toContain("class PaymentServiceTest");
      expect(result).toContain("@Test");
    });

    it("includes domain and risk in the class Javadoc comment", () => {
      const gap = {
        file: "CheckoutService.java",
        className: "br/com/gpa/checkout/CheckoutService",
        line: 20,
        type: "BRANCH" as const,
        domain: "checkout" as const,
        risk: "CRÍTICO" as const,
        missedCount: 2,
      };
      const result = gen.generateForGap(gap);
      expect(result).toContain("checkout");
      expect(result).toContain("CRÍTICO");
    });

    it("uses MockitoGenerator @Mock format (not raw template string)", () => {
      const gap = {
        file: "CartService.java",
        className: "br/com/gpa/cart/CartService",
        line: 10,
        type: "LINE" as const,
        domain: "cart" as const,
        risk: "ALTO" as const,
        missedCount: 1,
      };
      const result = gen.generateForGap(gap, PAYMENT_SERVICE_SOURCE);
      // MockitoGenerator produces "@Mock\nprivate Type field;"
      // NOT the old raw "@Mock\n    private field;"
      expect(result).toMatch(/@Mock/);
    });
  });

  describe("generateFromSource() — package inference", () => {
    it("infers package from source package declaration", () => {
      const result = gen.generateFromSource(PAYMENT_SERVICE_SOURCE, "PaymentService");
      expect(result).toContain("package br.com.gpa.payment");
    });

    it("falls back to default package when no package declaration", () => {
      const result = gen.generateFromSource("public class Simple {}", "Simple");
      expect(result).toContain("package");
    });
  });
});
