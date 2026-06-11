import { describe, it, expect } from "vitest";
import { classifyRisk, riskScore, riskEmoji } from "../domain/risk-classifier.js";

// ────────────────────────────────────────────
describe("risk-classifier", () => {

  describe("classifyRisk()", () => {
    it("classifies text with 'payment' as CRÍTICO domain payment", () => {
      const r = classifyRisk("PaymentService processes PIX payment transactions");
      expect(r.domain).toBe("payment");
      expect(r.risk).toBe("CRÍTICO");
      expect(r.coverageTarget).toBe(95);
    });

    it("classifies text with 'checkout' as CRÍTICO domain checkout", () => {
      const r = classifyRisk("CheckoutService finalizar pedido carrinho");
      expect(r.domain).toBe("checkout");
      expect(r.risk).toBe("CRÍTICO");
      expect(r.coverageTarget).toBe(90);
    });

    it("classifies text with 'order' as ALTO domain order", () => {
      const r = classifyRisk("OrderService fulfillment cancelamento entrega");
      expect(r.domain).toBe("order");
      expect(r.risk).toBe("ALTO");
      expect(r.coverageTarget).toBe(85);
    });

    it("classifies text with 'cart' as ALTO domain cart", () => {
      const r = classifyRisk("CartService basket item wishlist");
      expect(r.domain).toBe("cart");
      expect(r.risk).toBe("ALTO");
    });

    it("classifies text with 'catalog' as MÉDIO domain catalog", () => {
      const r = classifyRisk("CatalogService produto SKU categoria preco");
      expect(r.domain).toBe("catalog");
      expect(r.risk).toBe("MÉDIO");
      expect(r.coverageTarget).toBe(80);
    });

    it("classifies text with 'customer' as MÉDIO domain customer", () => {
      const r = classifyRisk("CustomerService cliente usuario CPF endereco perfil");
      expect(r.domain).toBe("customer");
      expect(r.risk).toBe("MÉDIO");
    });

    it("falls back to general/BAIXO for text with no keywords", () => {
      const r = classifyRisk("SomeRandomUtilHelper doSomething xyzAbc");
      expect(r.domain).toBe("general");
      expect(r.risk).toBe("BAIXO");
    });

    it("matches pix keyword to payment domain", () => {
      const r = classifyRisk("processar pix boleto gateway adyen cielo");
      expect(r.domain).toBe("payment");
    });

    it("prioritizes first matched domain (payment vs order)", () => {
      // "payment" keyword should dominate
      const r = classifyRisk("br.com.gpa.payment.PaymentService");
      expect(r.domain).toBe("payment");
    });

    it("returns coverageTarget > 0 for all domains", () => {
      const texts = [
        "checkout service",
        "payment gateway",
        "order fulfillment",
        "cart basket",
        "catalog product",
        "customer profile",
        "util helper config",
      ];
      for (const text of texts) {
        const r = classifyRisk(text);
        expect(r.coverageTarget).toBeGreaterThan(0);
      }
    });
  });

  describe("riskScore()", () => {
    it("CRÍTICO has score 4", () => {
      expect(riskScore("CRÍTICO")).toBe(4);
    });

    it("ALTO has score 3", () => {
      expect(riskScore("ALTO")).toBe(3);
    });

    it("MÉDIO has score 2", () => {
      expect(riskScore("MÉDIO")).toBe(2);
    });

    it("BAIXO has score 1", () => {
      expect(riskScore("BAIXO")).toBe(1);
    });

    it("scores are ordered CRÍTICO > ALTO > MÉDIO > BAIXO", () => {
      expect(riskScore("CRÍTICO")).toBeGreaterThan(riskScore("ALTO"));
      expect(riskScore("ALTO")).toBeGreaterThan(riskScore("MÉDIO"));
      expect(riskScore("MÉDIO")).toBeGreaterThan(riskScore("BAIXO"));
    });
  });

  describe("riskEmoji()", () => {
    it("CRÍTICO maps to 🔴", () => {
      expect(riskEmoji("CRÍTICO")).toBe("🔴");
    });

    it("ALTO maps to 🟠", () => {
      expect(riskEmoji("ALTO")).toBe("🟠");
    });

    it("MÉDIO maps to 🟡", () => {
      expect(riskEmoji("MÉDIO")).toBe("🟡");
    });

    it("BAIXO maps to 🟢", () => {
      expect(riskEmoji("BAIXO")).toBe("🟢");
    });
  });
});
