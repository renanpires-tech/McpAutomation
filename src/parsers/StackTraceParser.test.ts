import { describe, it, expect } from "vitest";
import { StackTraceParser } from "../parsers/StackTraceParser.js";

const parser = new StackTraceParser();

// ────────────────────────────────────────────
describe("StackTraceParser", () => {

  describe("parse() — empty / trivial input", () => {
    it("returns UnknownException for empty string", () => {
      const r = parser.parse("");
      expect(r.exceptionClass).toBe("UnknownException");
      expect(r.frames).toHaveLength(0);
      expect(r.gpaFrames).toHaveLength(0);
      expect(r.rootCause).toBeUndefined();
    });

    it("returns UnknownException for whitespace-only input", () => {
      const r = parser.parse("   \n   ");
      expect(r.exceptionClass).toBe("UnknownException");
    });
  });

  describe("parse() — exception header", () => {
    it("extracts NullPointerException class and message", () => {
      const trace = "java.lang.NullPointerException: payment id cannot be null\n\tat java.util.Objects.requireNonNull(Objects.java:221)";
      const r = parser.parse(trace);
      expect(r.exceptionClass).toBe("java.lang.NullPointerException");
      expect(r.message).toBe("payment id cannot be null");
    });

    it("handles exception without message", () => {
      const trace = "java.lang.IllegalStateException\n\tat com.example.Foo.bar(Foo.java:10)";
      const r = parser.parse(trace);
      expect(r.exceptionClass).toBe("java.lang.IllegalStateException");
      expect(r.message).toBe("");
    });

    it("handles custom exception class names", () => {
      const trace = "br.com.gpa.payment.PaymentProcessingException: gateway timeout\n\tat br.com.gpa.payment.PaymentService.charge(PaymentService.java:55)";
      const r = parser.parse(trace);
      expect(r.exceptionClass).toBe("br.com.gpa.payment.PaymentProcessingException");
      expect(r.message).toBe("gateway timeout");
    });
  });

  describe("parse() — frame parsing", () => {
    it("parses a single non-GPA stack frame", () => {
      const trace = [
        "java.lang.NullPointerException: test",
        "\tat java.util.Collections.emptyList(Collections.java:100)",
      ].join("\n");
      const r = parser.parse(trace);
      expect(r.frames).toHaveLength(1);
      expect(r.frames[0].className).toBe("java.util.Collections");
      expect(r.frames[0].method).toBe("emptyList");
      expect(r.frames[0].line).toBe(100);
      expect(r.frames[0].isGpa).toBe(false);
    });

    it("marks GPA br.com.gpa frames as isGpa=true", () => {
      const trace = [
        "java.lang.RuntimeException: error",
        "\tat br.com.gpa.payment.PaymentService.charge(PaymentService.java:42)",
      ].join("\n");
      const r = parser.parse(trace);
      expect(r.frames[0].isGpa).toBe(true);
    });

    it("marks com.grupopao frames as isGpa=true", () => {
      const trace = [
        "java.lang.RuntimeException: error",
        "\tat com.grupopao.checkout.CheckoutService.process(CheckoutService.java:88)",
      ].join("\n");
      const r = parser.parse(trace);
      expect(r.frames[0].isGpa).toBe(true);
    });

    it("parses multiple frames and identifies all", () => {
      const trace = [
        "java.lang.NullPointerException: oops",
        "\tat br.com.gpa.payment.PaymentService.charge(PaymentService.java:55)",
        "\tat br.com.gpa.order.OrderService.confirm(OrderService.java:78)",
        "\tat java.util.concurrent.ThreadPoolExecutor.runWorker(ThreadPoolExecutor.java:1149)",
      ].join("\n");
      const r = parser.parse(trace);
      expect(r.frames).toHaveLength(3);
      expect(r.gpaFrames).toHaveLength(2);
    });
  });

  describe("parse() — rootCause", () => {
    it("sets rootCause to first GPA frame with line > 0", () => {
      const trace = [
        "java.lang.NullPointerException: null ref",
        "\tat java.util.Objects.requireNonNull(Objects.java:10)",
        "\tat br.com.gpa.payment.PaymentService.process(PaymentService.java:42)",
      ].join("\n");
      const r = parser.parse(trace);
      expect(r.rootCause).toBeDefined();
      expect(r.rootCause?.className).toBe("br.com.gpa.payment.PaymentService");
      expect(r.rootCause?.line).toBe(42);
    });

    it("sets rootCause to undefined when no GPA frames exist", () => {
      const trace = [
        "java.lang.NullPointerException: error",
        "\tat java.util.Collections.emptyList(Collections.java:100)",
        "\tat org.springframework.web.servlet.DispatcherServlet.doDispatch(DispatcherServlet.java:1075)",
      ].join("\n");
      const r = parser.parse(trace);
      expect(r.rootCause).toBeUndefined();
    });
  });

  describe("parse() — domain detection", () => {
    it("detects payment domain from GPA frame", () => {
      const trace = [
        "java.lang.RuntimeException: error",
        "\tat br.com.gpa.payment.PaymentService.charge(PaymentService.java:30)",
      ].join("\n");
      const r = parser.parse(trace);
      const paymentFrames = r.frames.filter(f => f.domain === "payment");
      expect(paymentFrames.length).toBeGreaterThan(0);
    });

    it("detects checkout domain from class name", () => {
      const trace = [
        "java.lang.RuntimeException: error",
        "\tat br.com.gpa.checkout.CheckoutService.finalizar(CheckoutService.java:99)",
      ].join("\n");
      const r = parser.parse(trace);
      const checkoutFrames = r.frames.filter(f => f.domain === "checkout");
      expect(checkoutFrames.length).toBeGreaterThan(0);
    });
  });

  describe("parse() — summary", () => {
    it("produces summary with GPA rootCause info", () => {
      const trace = [
        "java.lang.NullPointerException: oops",
        "\tat br.com.gpa.payment.PaymentService.charge(PaymentService.java:55)",
      ].join("\n");
      const r = parser.parse(trace);
      expect(r.summary).toContain("PaymentService");
      expect(r.summary).toContain("55");
    });

    it("falls back to exception+message in summary when no GPA frames", () => {
      const trace = "java.lang.IllegalArgumentException: bad input\n\tat java.util.Objects.check(Objects.java:1)";
      const r = parser.parse(trace);
      expect(r.summary).toContain("IllegalArgumentException");
    });
  });
});
