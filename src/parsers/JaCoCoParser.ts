import { XMLParser } from "fast-xml-parser";
import { detectDomain } from "../domain/gpa-context.js";
import type { GpaDomain, GpaRisk } from "../domain/gpa-context.js";

export interface CoverageGap {
  file:        string;
  className:   string;
  line:        number;
  type:        "LINE" | "BRANCH" | "METHOD";
  domain:      GpaDomain;
  risk:        GpaRisk;
  missedCount: number;
}

export interface CoverageReport {
  serviceName:     string;
  overallCoverage: number;
  lineCoverage:    number;
  branchCoverage:  number;
  methodCoverage:  number;
  gaps:            CoverageGap[];
  byDomain:        Record<string, number>;
}

const RISK_BY_DOMAIN: Record<GpaDomain, GpaRisk> = {
  checkout: "CRÍTICO",
  payment:  "CRÍTICO",
  order:    "ALTO",
  cart:     "ALTO",
  catalog:  "MÉDIO",
  customer: "MÉDIO",
  general:  "BAIXO",
};

const RISK_ORDER: Record<GpaRisk, number> = { "CRÍTICO": 0, "ALTO": 1, "MÉDIO": 2, "BAIXO": 3 };

export class JaCoCoParser {
  parse(xmlContent: string, serviceName: string): CoverageReport {
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = parser.parse(xmlContent);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const report = parsed.report;

    const gaps:      CoverageGap[]           = [];
    const byDomain:  Record<string, number>  = {};
    let   totalMissed = 0, totalCovered = 0;
    let   branchMissed = 0, branchCovered = 0;
    let   methodMissed = 0, methodCovered = 0;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const rawPackages = report?.package;
    if (!rawPackages) {
      return this.emptyReport(serviceName);
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const packages: unknown[] = Array.isArray(rawPackages) ? rawPackages : [rawPackages];

    for (const pkg of packages) {
      if (!pkg || typeof pkg !== "object") continue;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
      const rawClasses = (pkg as Record<string, unknown>)["class"];
      if (!rawClasses) continue;

      const classes: unknown[] = Array.isArray(rawClasses) ? rawClasses : [rawClasses];

      for (const cls of classes) {
        if (!cls || typeof cls !== "object") continue;
        const c = cls as Record<string, unknown>;
        const className  = String(c["@_name"] ?? "");
        const sourceFile = String(c["@_sourcefilename"] ?? className);
        const domain     = detectDomain(className);

        const rawCounters = c["counter"];
        const counters: unknown[] = rawCounters
          ? (Array.isArray(rawCounters) ? rawCounters : [rawCounters])
          : [];

        for (const counter of counters) {
          if (!counter || typeof counter !== "object") continue;
          const ct = counter as Record<string, unknown>;
          const type    = String(ct["@_type"] ?? "");
          const missed  = Number(ct["@_missed"]  ?? 0);
          const covered = Number(ct["@_covered"] ?? 0);

          if (type === "LINE") {
            totalMissed  += missed;
            totalCovered += covered;
            if (missed > 0) {
              gaps.push({
                file: sourceFile,
                className,
                line: this.findFirstMissedLine(c),
                type: "LINE",
                domain,
                risk: RISK_BY_DOMAIN[domain] ?? "BAIXO",
                missedCount: missed,
              });
            }
          } else if (type === "BRANCH") {
            branchMissed   += missed;
            branchCovered  += covered;
          } else if (type === "METHOD") {
            methodMissed   += missed;
            methodCovered  += covered;
          }
        }

        const domTotal = totalCovered + totalMissed;
        byDomain[domain] = domTotal > 0
          ? Math.round((totalCovered / domTotal) * 100)
          : 100;
      }
    }

    const total  = totalCovered + totalMissed;
    const bTotal = branchCovered + branchMissed;
    const mTotal = methodCovered + methodMissed;

    gaps.sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);

    return {
      serviceName,
      overallCoverage: total  > 0 ? Math.round((totalCovered  / total)  * 100) : 100,
      lineCoverage:    total  > 0 ? Math.round((totalCovered  / total)  * 100) : 100,
      branchCoverage:  bTotal > 0 ? Math.round((branchCovered / bTotal) * 100) : 100,
      methodCoverage:  mTotal > 0 ? Math.round((methodCovered / mTotal) * 100) : 100,
      gaps,
      byDomain,
    };
  }

  private findFirstMissedLine(cls: Record<string, unknown>): number {
    const rawLines = cls["line"];
    if (!rawLines) return 0;
    const lines: unknown[] = Array.isArray(rawLines) ? rawLines : [rawLines];
    const missed = lines.find(l => {
      if (!l || typeof l !== "object") return false;
      return Number((l as Record<string, unknown>)["@_mi"] ?? 0) > 0;
    });
    if (!missed || typeof missed !== "object") return 0;
    return Number((missed as Record<string, unknown>)["@_nr"] ?? 0);
  }

  private emptyReport(serviceName: string): CoverageReport {
    return {
      serviceName,
      overallCoverage: 100, lineCoverage: 100, branchCoverage: 100, methodCoverage: 100,
      gaps: [], byDomain: {},
    };
  }
}
