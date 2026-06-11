import { describe, it, expect } from "vitest";
import { LcovParser } from "../parsers/LcovParser.js";

const parser = new LcovParser();

// ────────────────────────────────────────────
//  LCOV helpers
// ────────────────────────────────────────────
function lcovFile(path: string, lf: number, lh: number, brf = 0, brh = 0, fnf = 0, fnh = 0): string {
  return [
    `SF:${path}`,
    `LF:${lf}`,
    `LH:${lh}`,
    `BRF:${brf}`,
    `BRH:${brh}`,
    `FNF:${fnf}`,
    `FNH:${fnh}`,
    "end_of_record",
  ].join("\n");
}

// ────────────────────────────────────────────
describe("LcovParser", () => {

  describe("parse() — empty input", () => {
    it("returns overallPct=100 and zero files for empty string", () => {
      const r = parser.parse("");
      expect(r.overallPct).toBe(100);
      expect(r.files).toHaveLength(0);
      expect(r.totalLines).toBe(0);
      expect(r.coveredLines).toBe(0);
    });

    it("returns overallPct=100 for whitespace-only input", () => {
      const r = parser.parse("   \n\n  ");
      expect(r.overallPct).toBe(100);
    });
  });

  describe("parse() — single file, all covered", () => {
    it("returns 100% when all lines are covered", () => {
      const lcov = lcovFile("src/PaymentService.java", 10, 10, 4, 4, 2, 2);
      const r = parser.parse(lcov);
      expect(r.overallPct).toBe(100);
      expect(r.files).toHaveLength(1);
      expect(r.files[0].lines.pct).toBe(100);
      expect(r.files[0].branches.pct).toBe(100);
      expect(r.files[0].functions.pct).toBe(100);
    });

    it("stores correct file path", () => {
      const lcov = lcovFile("src/main/java/br/com/gpa/checkout/CheckoutService.java", 5, 5);
      const r = parser.parse(lcov);
      expect(r.files[0].file).toBe("src/main/java/br/com/gpa/checkout/CheckoutService.java");
    });
  });

  describe("parse() — single file, partial coverage", () => {
    it("calculates correct line pct for 6 of 10 covered", () => {
      const lcov = lcovFile("src/OrderService.java", 10, 6);
      const r = parser.parse(lcov);
      expect(r.files[0].lines.pct).toBe(60);
      expect(r.files[0].lines.total).toBe(10);
      expect(r.files[0].lines.covered).toBe(6);
    });

    it("calculates correct branch pct", () => {
      const lcov = lcovFile("src/CartService.java", 10, 10, 4, 2);
      const r = parser.parse(lcov);
      expect(r.files[0].branches.pct).toBe(50);
    });

    it("calculates correct function pct", () => {
      const lcov = lcovFile("src/FraudAnalyzer.java", 10, 10, 0, 0, 4, 3);
      const r = parser.parse(lcov);
      expect(r.files[0].functions.pct).toBe(75);
    });

    it("sets branch pct to 100 when brf=0", () => {
      const lcov = lcovFile("src/UtilHelper.java", 5, 5, 0, 0);
      const r = parser.parse(lcov);
      expect(r.files[0].branches.pct).toBe(100);
    });
  });

  describe("parse() — aggregate metrics", () => {
    it("aggregates totalLines and coveredLines across multiple files", () => {
      const lcov = [
        lcovFile("src/A.java", 10, 8),
        lcovFile("src/B.java", 20, 15),
      ].join("\n");
      const r = parser.parse(lcov);
      expect(r.totalLines).toBe(30);
      expect(r.coveredLines).toBe(23);
    });

    it("calculates overallPct correctly for multiple files", () => {
      const lcov = [
        lcovFile("src/A.java", 10, 10),
        lcovFile("src/B.java", 10, 0),
      ].join("\n");
      const r = parser.parse(lcov);
      // 10/20 = 50%
      expect(r.overallPct).toBe(50);
    });

    it("returns correct number of files", () => {
      const lcov = [
        lcovFile("src/A.java", 5, 5),
        lcovFile("src/B.java", 5, 5),
        lcovFile("src/C.java", 5, 5),
      ].join("\n");
      const r = parser.parse(lcov);
      expect(r.files).toHaveLength(3);
    });
  });

  describe("parse() — domain detection", () => {
    it("detects payment domain from file path", () => {
      const lcov = lcovFile("src/main/java/br/com/gpa/payment/PaymentService.java", 5, 5);
      const r = parser.parse(lcov);
      expect(r.files[0].domain).toBe("payment");
    });

    it("detects checkout domain from file path", () => {
      const lcov = lcovFile("src/main/java/br/com/gpa/checkout/CheckoutService.java", 5, 5);
      const r = parser.parse(lcov);
      expect(r.files[0].domain).toBe("checkout");
    });

    it("falls back to general for unknown domain", () => {
      const lcov = lcovFile("src/main/java/com/other/SomeService.java", 5, 5);
      const r = parser.parse(lcov);
      expect(r.files[0].domain).toBe("general");
    });
  });

  describe("parse() — DA line format (real LCOV)", () => {
    it("parses real LCOV with DA lines correctly", () => {
      const lcov = [
        "SF:src/main/java/br/com/gpa/order/OrderService.java",
        "FN:10,processOrder",
        "FNDA:5,processOrder",
        "DA:10,5",
        "DA:11,5",
        "DA:12,0",
        "DA:13,0",
        "LF:4",
        "LH:2",
        "BRF:2",
        "BRH:1",
        "FNF:1",
        "FNH:1",
        "end_of_record",
      ].join("\n");
      const r = parser.parse(lcov);
      expect(r.files).toHaveLength(1);
      expect(r.files[0].lines.total).toBe(4);
      expect(r.files[0].lines.covered).toBe(2);
      expect(r.files[0].lines.pct).toBe(50);
      expect(r.files[0].branches.total).toBe(2);
      expect(r.files[0].branches.covered).toBe(1);
      expect(r.files[0].branches.pct).toBe(50);
    });
  });
});
