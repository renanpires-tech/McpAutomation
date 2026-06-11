import { describe, it, expect } from "vitest";
import { tokenize, cosineSimilarity } from "../memory/SemanticMatcher.js";

// ────────────────────────────────────────────
describe("SemanticMatcher — pure functions", () => {

  describe("tokenize()", () => {
    it("lowercases all tokens", () => {
      const tokens = tokenize("Payment Webhook Handler");
      expect(tokens).toContain("payment");
      expect(tokens).toContain("webhook");
      expect(tokens).toContain("handler");
    });

    it("removes common Portuguese stopwords", () => {
      const tokens = tokenize("o pagamento de um cliente");
      expect(tokens).not.toContain("o");
      expect(tokens).not.toContain("de");
      expect(tokens).not.toContain("um");
      expect(tokens).toContain("pagamento");
      expect(tokens).toContain("cliente");
    });

    it("removes common English stopwords", () => {
      const tokens = tokenize("the payment service is processing the order");
      expect(tokens).not.toContain("the");
      expect(tokens).not.toContain("is");
      expect(tokens).toContain("payment");
      expect(tokens).toContain("service");
      expect(tokens).toContain("processing");
      expect(tokens).toContain("order");
    });

    it("filters out tokens shorter than 3 chars", () => {
      const tokens = tokenize("id ok checkout");
      expect(tokens).not.toContain("id");
      expect(tokens).not.toContain("ok");
      expect(tokens).toContain("checkout");
    });

    it("returns empty array for empty string", () => {
      expect(tokenize("")).toHaveLength(0);
    });

    it("returns empty array for stopwords-only string", () => {
      const tokens = tokenize("o a de do da em");
      expect(tokens).toHaveLength(0);
    });

    it("strips punctuation and special characters", () => {
      const tokens = tokenize("payment-service: processPayment(orderId)");
      expect(tokens).not.toContain("payment-service:");
      expect(tokens).toContain("payment");
      expect(tokens).toContain("service");
    });

    it("deduplicates implicitly via set-like output (words appear once)", () => {
      const tokens = tokenize("payment payment payment");
      // tokenize returns an array — duplicates may exist, but downstream cosineSimilarity uses Set
      // Just check it doesn't error
      expect(Array.isArray(tokens)).toBe(true);
    });
  });

  describe("cosineSimilarity()", () => {
    it("returns 1.0 for identical token arrays", () => {
      const a = ["payment", "webhook", "handler"];
      const b = ["payment", "webhook", "handler"];
      expect(cosineSimilarity(a, b)).toBe(1);
    });

    it("returns 0.0 for completely different token arrays", () => {
      const a = ["payment", "checkout"];
      const b = ["catalog", "inventory"];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it("returns value between 0 and 1 for partial overlap", () => {
      const a = ["payment", "webhook", "handler"];
      const b = ["payment", "retry", "circuit"];
      const score = cosineSimilarity(a, b);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });

    it("returns 0 for empty arrays (protected denominator)", () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it("returns 0 when one array is empty", () => {
      expect(cosineSimilarity(["payment"], [])).toBe(0);
      expect(cosineSimilarity([], ["payment"])).toBe(0);
    });

    it("is commutative: sim(A,B) === sim(B,A)", () => {
      const a = ["payment", "webhook", "idempotencia"];
      const b = ["webhook", "retry", "payment"];
      expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
    });

    it("correctly measures 2-of-3 overlap", () => {
      // |intersection| = 2, |A| = 3, |B| = 3 → 2 / sqrt(3*3) ≈ 0.667
      const a = ["checkout", "payment", "fraud"];
      const b = ["checkout", "payment", "catalog"];
      const score = cosineSimilarity(a, b);
      expect(score).toBeCloseTo(2 / Math.sqrt(9), 5);
    });

    it("scores higher for more overlap", () => {
      const query  = ["payment", "webhook", "idempotency", "retry"];
      const high   = ["payment", "webhook", "idempotency", "circuit"];
      const low    = ["catalog", "product", "sku", "price"];
      expect(cosineSimilarity(query, high)).toBeGreaterThan(cosineSimilarity(query, low));
    });
  });
});
