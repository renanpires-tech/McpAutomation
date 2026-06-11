import { describe, it, expect } from "vitest";
import { JaCoCoParser } from "../parsers/JaCoCoParser.js";

const parser = new JaCoCoParser();

// ────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────
function makeXml(pkg: string, className: string, lineMissed: number, lineCovered: number, branchMissed = 0, branchCovered = 0, methodMissed = 0, methodCovered = 1) {
  return `<?xml version="1.0"?>
<report name="test-service">
  <package name="${pkg}">
    <class name="${pkg}/${className}" sourcefilename="${className}.java">
      <counter type="LINE"   missed="${lineMissed}"   covered="${lineCovered}"/>
      <counter type="BRANCH" missed="${branchMissed}" covered="${branchCovered}"/>
      <counter type="METHOD" missed="${methodMissed}" covered="${methodCovered}"/>
    </class>
    <counter type="LINE"   missed="${lineMissed}"   covered="${lineCovered}"/>
    <counter type="BRANCH" missed="${branchMissed}" covered="${branchCovered}"/>
  </package>
  <counter type="LINE"   missed="${lineMissed}"   covered="${lineCovered}"/>
  <counter type="BRANCH" missed="${branchMissed}" covered="${branchCovered}"/>
  <counter type="METHOD" missed="${methodMissed}" covered="${methodCovered}"/>
</report>`;
}

// ────────────────────────────────────────────
describe("JaCoCoParser", () => {

  describe("parse() — empty / invalid", () => {
    it("returns emptyReport with overallCoverage=100 for empty string", () => {
      const r = parser.parse("", "svc");
      expect(r.serviceName).toBe("svc");
      expect(r.overallCoverage).toBe(100);
      expect(r.gaps).toHaveLength(0);
    });

    it("returns emptyReport for malformed XML without <report> tag", () => {
      const r = parser.parse("<notareport/>", "svc");
      expect(r.overallCoverage).toBe(100);
      expect(r.gaps).toHaveLength(0);
    });

    it("preserves serviceName in emptyReport", () => {
      const r = parser.parse("", "payment-service");
      expect(r.serviceName).toBe("payment-service");
    });
  });

  describe("parse() — line coverage", () => {
    it("calculates overallCoverage correctly when lines are missed", () => {
      const xml = makeXml("br/com/gpa/order", "OrderService", 2, 8);
      const r = parser.parse(xml, "order-service");
      // 8 covered / 10 total = 80%
      expect(r.overallCoverage).toBe(80);
    });

    it("produces a gap for missed lines", () => {
      const xml = makeXml("br/com/gpa/order", "OrderService", 3, 7);
      const r = parser.parse(xml, "order-service");
      expect(r.gaps.length).toBeGreaterThan(0);
      expect(r.gaps[0].type).toBe("LINE");
      expect(r.gaps[0].missedCount).toBe(3);
    });

    it("produces no gap when lineMissed=0", () => {
      const xml = makeXml("br/com/gpa/catalog", "ProductService", 0, 10);
      const r = parser.parse(xml, "catalog-service");
      expect(r.gaps).toHaveLength(0);
      expect(r.overallCoverage).toBe(100);
    });
  });

  describe("parse() — branch coverage", () => {
    it("calculates branchCoverage correctly", () => {
      const xml = makeXml("br/com/gpa/payment", "PaymentService", 0, 10, 2, 2);
      const r = parser.parse(xml, "payment-service");
      // 2 covered / 4 total = 50%
      expect(r.branchCoverage).toBe(50);
    });

    it("returns branchCoverage=100 when no branches exist", () => {
      const xml = makeXml("br/com/gpa/catalog", "CatalogService", 0, 5, 0, 0);
      const r = parser.parse(xml, "catalog-service");
      expect(r.branchCoverage).toBe(100);
    });
  });

  describe("parse() — method coverage", () => {
    it("calculates methodCoverage correctly", () => {
      const xml = makeXml("br/com/gpa/order", "OrderService", 0, 5, 0, 0, 2, 3);
      const r = parser.parse(xml, "order-service");
      // 3 covered / 5 total = 60%
      expect(r.methodCoverage).toBe(60);
    });
  });

  describe("parse() — domain & risk classification", () => {
    it("assigns risk CRÍTICO to payment domain gaps", () => {
      const xml = makeXml("br/com/gpa/payment", "PaymentProcessor", 5, 5);
      const r = parser.parse(xml, "payment-service");
      expect(r.gaps[0].risk).toBe("CRÍTICO");
      expect(r.gaps[0].domain).toBe("payment");
    });

    it("assigns risk CRÍTICO to checkout domain gaps", () => {
      const xml = makeXml("br/com/gpa/checkout", "CheckoutService", 3, 7);
      const r = parser.parse(xml, "checkout-service");
      expect(r.gaps[0].risk).toBe("CRÍTICO");
      expect(r.gaps[0].domain).toBe("checkout");
    });

    it("assigns risk ALTO to order domain gaps", () => {
      const xml = makeXml("br/com/gpa/order", "OrderService", 2, 8);
      const r = parser.parse(xml, "order-service");
      expect(r.gaps[0].risk).toBe("ALTO");
    });

    it("populates byDomain map", () => {
      const xml = makeXml("br/com/gpa/payment", "PaymentService", 5, 5);
      const r = parser.parse(xml, "payment-service");
      expect(r.byDomain).toHaveProperty("payment");
      expect(r.byDomain["payment"]).toBeGreaterThanOrEqual(0);
    });
  });

  describe("parse() — multiple packages", () => {
    it("processes multiple packages in a single report", () => {
      const xml = `<?xml version="1.0"?>
<report name="multi-service">
  <package name="br/com/gpa/payment">
    <class name="br/com/gpa/payment/PaymentService" sourcefilename="PaymentService.java">
      <counter type="LINE" missed="2" covered="8"/>
      <counter type="BRANCH" missed="1" covered="1"/>
      <counter type="METHOD" missed="0" covered="2"/>
    </class>
  </package>
  <package name="br/com/gpa/order">
    <class name="br/com/gpa/order/OrderService" sourcefilename="OrderService.java">
      <counter type="LINE" missed="1" covered="9"/>
      <counter type="BRANCH" missed="0" covered="2"/>
      <counter type="METHOD" missed="0" covered="1"/>
    </class>
  </package>
  <counter type="LINE" missed="3" covered="17"/>
</report>`;
      const r = parser.parse(xml, "multi-service");
      expect(r.gaps.length).toBeGreaterThanOrEqual(2);
      expect(Object.keys(r.byDomain).length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("parse() — gap sorting by risk", () => {
    it("sorts gaps so CRÍTICO comes before ALTO", () => {
      const xml = `<?xml version="1.0"?>
<report name="svc">
  <package name="br/com/gpa/order">
    <class name="br/com/gpa/order/OrderService" sourcefilename="OrderService.java">
      <counter type="LINE" missed="2" covered="8"/>
      <counter type="METHOD" missed="0" covered="1"/>
    </class>
  </package>
  <package name="br/com/gpa/payment">
    <class name="br/com/gpa/payment/PaymentService" sourcefilename="PaymentService.java">
      <counter type="LINE" missed="3" covered="7"/>
      <counter type="METHOD" missed="0" covered="1"/>
    </class>
  </package>
  <counter type="LINE" missed="5" covered="15"/>
</report>`;
      const r = parser.parse(xml, "svc");
      const firstRisk = r.gaps[0]?.risk;
      if (r.gaps.length >= 2) {
        expect(firstRisk).toBe("CRÍTICO");
      }
    });
  });
});
