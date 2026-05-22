import { detectDomain } from "../domain/gpa-context.js";
import type { GpaDomain } from "../domain/gpa-context.js";

export interface LcovFileCoverage {
  file:      string;
  domain:    GpaDomain;
  lines:     { total: number; covered: number; pct: number };
  branches:  { total: number; covered: number; pct: number };
  functions: { total: number; covered: number; pct: number };
}

export interface LcovReport {
  files:          LcovFileCoverage[];
  totalLines:     number;
  coveredLines:   number;
  overallPct:     number;
}

export class LcovParser {
  parse(lcovContent: string): LcovReport {
    const files: LcovFileCoverage[] = [];
    let currentFile: Partial<LcovFileCoverage> & {
      lf?: number; lh?: number;
      brf?: number; brh?: number;
      fnf?: number; fnh?: number;
    } | null = null;

    for (const raw of lcovContent.split("\n")) {
      const line = raw.trim();
      if (!line) continue;

      if (line.startsWith("SF:")) {
        currentFile = { file: line.slice(3), domain: detectDomain(line.slice(3)) };
      } else if (line === "end_of_record" && currentFile) {
        const lf  = currentFile.lf  ?? 0;
        const lh  = currentFile.lh  ?? 0;
        const brf = currentFile.brf ?? 0;
        const brh = currentFile.brh ?? 0;
        const fnf = currentFile.fnf ?? 0;
        const fnh = currentFile.fnh ?? 0;

        files.push({
          file:      currentFile.file ?? "",
          domain:    currentFile.domain ?? "general",
          lines:     { total: lf,  covered: lh,  pct: lf  > 0 ? Math.round((lh  / lf)  * 100) : 100 },
          branches:  { total: brf, covered: brh, pct: brf > 0 ? Math.round((brh / brf) * 100) : 100 },
          functions: { total: fnf, covered: fnh, pct: fnf > 0 ? Math.round((fnh / fnf) * 100) : 100 },
        });
        currentFile = null;
      } else if (currentFile) {
        const [key, val] = line.split(":");
        const n = Number(val ?? 0);
        if (key === "LF")  currentFile.lf  = n;
        else if (key === "LH")  currentFile.lh  = n;
        else if (key === "BRF") currentFile.brf = n;
        else if (key === "BRH") currentFile.brh = n;
        else if (key === "FNF") currentFile.fnf = n;
        else if (key === "FNH") currentFile.fnh = n;
      }
    }

    const totalLines   = files.reduce((s, f) => s + f.lines.total,   0);
    const coveredLines = files.reduce((s, f) => s + f.lines.covered,  0);

    return {
      files,
      totalLines,
      coveredLines,
      overallPct: totalLines > 0 ? Math.round((coveredLines / totalLines) * 100) : 100,
    };
  }
}
