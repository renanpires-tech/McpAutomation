import { describe, it, expect } from "vitest";
import { MockitoGenerator } from "../generators/MockitoGenerator.js";

const gen = new MockitoGenerator();

// ────────────────────────────────────────────
describe("MockitoGenerator", () => {

  describe("generateMock()", () => {
    it("produces @Mock annotation with correct type and field name", () => {
      const result = gen.generateMock("PaymentService", "paymentService");
      expect(result).toBe("@Mock\nprivate PaymentService paymentService;");
    });

    it("works with repository types", () => {
      const result = gen.generateMock("CartRepository", "cartRepository");
      expect(result).toContain("@Mock");
      expect(result).toContain("CartRepository cartRepository");
    });

    it("works with generic types (e.g. interface names)", () => {
      const result = gen.generateMock("EventPublisher", "publisher");
      expect(result).toContain("EventPublisher publisher");
    });
  });

  describe("generateStub()", () => {
    it("generates when().thenReturn() with default any() matcher", () => {
      const result = gen.generateStub("paymentRepo", "findById", "Optional.of(payment)");
      expect(result).toBe("when(paymentRepo.findById(any())).thenReturn(Optional.of(payment));");
    });

    it("uses custom argMatchers when provided", () => {
      const result = gen.generateStub("repo", "findByOrderId", "order", "eq(\"ORD-001\")");
      expect(result).toContain("eq(\"ORD-001\")");
      expect(result).toContain(".thenReturn(order)");
    });
  });

  describe("generateThrowStub()", () => {
    it("generates when().thenThrow() with exception and message", () => {
      const result = gen.generateThrowStub("gatewayClient", "charge", "PaymentException", "gateway timeout");
      expect(result).toContain("when(gatewayClient.charge(any())).thenThrow");
      expect(result).toContain("PaymentException");
      expect(result).toContain("gateway timeout");
    });

    it("uses default message when not provided", () => {
      const result = gen.generateThrowStub("repo", "save", "RuntimeException");
      expect(result).toContain("simulated error");
    });
  });

  describe("generateVoidThrowStub()", () => {
    it("generates doThrow().when().method() pattern for void methods", () => {
      const result = gen.generateVoidThrowStub("publisher", "publish", "EventException", "publish failed");
      expect(result).toContain("doThrow(new EventException(\"publish failed\"))");
      expect(result).toContain(".when(publisher).publish(any())");
    });

    it("uses default message when not provided", () => {
      const result = gen.generateVoidThrowStub("svc", "process", "IllegalStateException");
      expect(result).toContain("simulated error");
    });
  });

  describe("generateVerify()", () => {
    it("generates verify(mock).method() for times=1 (default)", () => {
      const result = gen.generateVerify("paymentRepo", "save");
      expect(result).toBe("verify(paymentRepo).save(any());");
    });

    it("generates verify(mock, never()) for times=0", () => {
      const result = gen.generateVerify("fraudService", "analyze", 0);
      expect(result).toBe("verify(fraudService, never()).analyze(any());");
    });

    it("generates verify(mock, times(3)) for times=3", () => {
      const result = gen.generateVerify("retryClient", "call", 3);
      expect(result).toBe("verify(retryClient, times(3)).call(any());");
    });

    it("accepts custom argMatchers", () => {
      const result = gen.generateVerify("repo", "findById", 1, "eq(\"ID-001\")");
      expect(result).toContain("eq(\"ID-001\")");
    });
  });

  describe("generateSetupBlock()", () => {
    it("includes @ExtendWith(MockitoExtension.class)", () => {
      const result = gen.generateSetupBlock("PaymentService", []);
      expect(result).toContain("@ExtendWith(MockitoExtension.class)");
    });

    it("includes @Mock for each dependency", () => {
      const deps = [
        { type: "PaymentRepository", field: "paymentRepository" },
        { type: "FraudClient", field: "fraudClient" },
      ];
      const result = gen.generateSetupBlock("PaymentService", deps);
      expect(result).toContain("PaymentRepository paymentRepository");
      expect(result).toContain("FraudClient fraudClient");
    });

    it("includes @InjectMocks with service name", () => {
      const result = gen.generateSetupBlock("CartService", []);
      expect(result).toContain("@InjectMocks");
      expect(result).toContain("private CartService subject");
    });

    it("includes @BeforeEach void setUp()", () => {
      const result = gen.generateSetupBlock("OrderService", []);
      expect(result).toContain("@BeforeEach");
      expect(result).toContain("void setUp()");
    });

    it("generates class declaration line", () => {
      const result = gen.generateSetupBlock("FraudAnalyzer", []);
      expect(result).toContain("class FraudAnalyzerTest {");
    });
  });

  describe("generateCaptor()", () => {
    it("generates ArgumentCaptor declaration", () => {
      const result = gen.generateCaptor("Order", "order");
      expect(result).toContain("ArgumentCaptor<Order> orderCaptor = ArgumentCaptor.forClass(Order.class)");
    });

    it("includes capture() call in verify", () => {
      const result = gen.generateCaptor("Payment", "payment");
      expect(result).toContain("paymentCaptor.capture()");
    });

    it("includes getValue() to retrieve captured value", () => {
      const result = gen.generateCaptor("Cart", "cart");
      expect(result).toContain("cartCaptor.getValue()");
    });
  });
});
