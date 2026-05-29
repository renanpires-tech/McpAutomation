import { EventEmitter } from "node:events";
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  PatternEntry, SolutionEntry, ServiceMap, Metrics,
  PatternName, Domain, Risk, KBHit,
} from "./types.js";
import { cosineSimilarity } from "../memory/SemanticMatcher.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolves to <project-root>/kb from dist/agents/MemoryAgent.js
const KB_DIR = path.join(__dirname, "../../knowledge");

// ─────────────────────────────────────────────
//  KB helpers
// ─────────────────────────────────────────────

async function ensureKB(): Promise<void> {
  await mkdir(KB_DIR, { recursive: true });
}

async function readJSON<T>(filename: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(path.join(KB_DIR, filename), "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJSON(filename: string, data: unknown): Promise<void> {
  await ensureKB();
  await writeFile(path.join(KB_DIR, filename), JSON.stringify(data, null, 2), "utf-8");
}

const STOPWORDS = new Set([
  "o","a","de","do","da","em","e","que","para","com","se","um","uma",
  "the","an","is","in","of","for","to","and","or","not","this","that",
]);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-záéíóúãõàâêîôûç\s]/g, " ")
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOPWORDS.has(w));
}

// ─────────────────────────────────────────────
//  MemoryAgent
// ─────────────────────────────────────────────

export class MemoryAgent {
  constructor(private readonly emitter: EventEmitter) {}

  // ── Read helpers ─────────────────────────────

  async getPatterns(): Promise<Record<string, PatternEntry>> {
    return readJSON<Record<string, PatternEntry>>("patterns.json", {});
  }

  async getSolutions(): Promise<Record<string, SolutionEntry>> {
    return readJSON<Record<string, SolutionEntry>>("solutions.json", {});
  }

  async getServiceMap(): Promise<ServiceMap> {
    return readJSON<ServiceMap>("service-map.json", { nodes: [], edges: [] });
  }

  async getMetrics(): Promise<Metrics> {
    return readJSON<Metrics>("metrics.json", {
      total_interactions: 0,
      avg_quality_score: 0,
      quality_trend: [],
      top_patterns: [],
      agents_performance: {
        analyst:   { calls: 0, avg_confidence: 0 },
        tester:    { calls: 0, avg_coverage: 0 },
        architect: { calls: 0, spof_found: 0 },
        doc:       { calls: 0, docs_generated: 0 },
        memory:    { calls: 0, kb_size_kb: 0 },
      },
    });
  }

  // ── Fuzzy search ─────────────────────────────

  async findSimilarSolutions(input: string, topN = 3): Promise<KBHit[]> {
    const solutions = await this.getSolutions();
    const keywords = tokenize(input);

    const scored = Object.entries(solutions).map(([key, sol]) => {
      const candidate = tokenize(`${sol.input_pattern} ${sol.solution_summary}`);
      const score = cosineSimilarity(keywords, candidate);
      return { key, solution: sol, score };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }

  // ── Write helpers ─────────────────────────────

  async savePattern(
    signature: string,
    entry: Pick<PatternEntry, "pattern_name" | "domain" | "risk"> & { recommended_tests?: string[] },
  ): Promise<PatternEntry> {
    const patterns = await this.getPatterns();
    const existing = patterns[signature];
    const occurrences = (existing?.occurrences ?? 0) + 1;

    const updated: PatternEntry = {
      pattern_name: entry.pattern_name,
      domain: entry.domain,
      risk: entry.risk,
      occurrences,
      confidence: Math.min(0.6 + occurrences * 0.05, 1),
      recommended_tests: entry.recommended_tests ?? existing?.recommended_tests ?? [],
      last_seen: new Date().toISOString(),
      false_positives: existing?.false_positives ?? 0,
    };

    patterns[signature] = updated;
    await writeJSON("patterns.json", patterns);
    return updated;
  }

  async incrementFalsePositive(signature: string): Promise<void> {
    const patterns = await this.getPatterns();
    if (patterns[signature]) {
      patterns[signature].false_positives++;
      await writeJSON("patterns.json", patterns);
    }
  }

  async saveSolution(
    key: string,
    entry: Omit<SolutionEntry, "reused_count" | "timestamp">,
  ): Promise<void> {
    const solutions = await this.getSolutions();
    const existing = solutions[key];
    solutions[key] = {
      ...entry,
      solution_summary: entry.solution_summary.substring(0, 500),
      reused_count: existing?.reused_count ?? 0,
      timestamp: new Date().toISOString(),
    };
    await writeJSON("solutions.json", solutions);
  }

  async incrementReuse(key: string): Promise<void> {
    const solutions = await this.getSolutions();
    if (solutions[key]) {
      solutions[key].reused_count++;
      await writeJSON("solutions.json", solutions);
    }
  }

  async updateServiceMap(
    newEdges: ServiceMap["edges"],
    newNodes: ServiceMap["nodes"],
  ): Promise<void> {
    const map = await this.getServiceMap();

    for (const node of newNodes) {
      if (!map.nodes.some(n => n.id === node.id)) map.nodes.push(node);
    }

    for (const edge of newEdges) {
      const ex = map.edges.find(e => e.from === edge.from && e.to === edge.to);
      if (ex) {
        ex.occurrences++;
        ex.has_timeout         = ex.has_timeout         || edge.has_timeout;
        ex.has_retry           = ex.has_retry           || edge.has_retry;
        ex.has_circuit_breaker = ex.has_circuit_breaker || edge.has_circuit_breaker;
      } else {
        map.edges.push({ ...edge, occurrences: 1 });
      }
    }

    await writeJSON("service-map.json", map);
  }

  async updateMetrics(qualityScore: number, agentsUsed: string[], patternFound: string): Promise<void> {
    const metrics = await this.getMetrics();
    metrics.total_interactions++;

    const trend = [...metrics.quality_trend, qualityScore].slice(-10);
    metrics.quality_trend = trend;
    metrics.avg_quality_score = trend.reduce((a, b) => a + b, 0) / trend.length;

    if (patternFound && patternFound !== "unknown" && !metrics.top_patterns.includes(patternFound)) {
      metrics.top_patterns.push(patternFound);
    }

    for (const a of agentsUsed) {
      const key = a.toLowerCase() as keyof typeof metrics.agents_performance;
      if (metrics.agents_performance[key]) metrics.agents_performance[key].calls++;
    }

    // compute KB size
    let kbSize = 0;
    for (const f of ["patterns.json", "solutions.json", "service-map.json"]) {
      const s = await stat(path.join(KB_DIR, f)).catch(() => null);
      if (s) kbSize += s.size;
    }
    metrics.agents_performance.memory.kb_size_kb = Math.round((kbSize / 1024) * 10) / 10;
    metrics.agents_performance.memory.calls++;

    await writeJSON("metrics.json", metrics);
  }

  // ── Master consolidation ──────────────────────

  async consolidateLearning(opts: {
    signature: string;
    pattern: PatternName;
    domain: Domain;
    risk: Risk;
    tests: string[];
    solutionKey: string;
    solutionEntry: Omit<SolutionEntry, "reused_count" | "timestamp">;
    serviceMapUpdate?: { edges: ServiceMap["edges"]; nodes: ServiceMap["nodes"] };
    qualityScore: number;
    agentsUsed: string[];
  }): Promise<string> {
    const saved = await this.savePattern(opts.signature, {
      pattern_name: opts.pattern,
      domain: opts.domain,
      risk: opts.risk,
      recommended_tests: opts.tests,
    });

    await this.saveSolution(opts.solutionKey, opts.solutionEntry);

    if (opts.serviceMapUpdate) {
      await this.updateServiceMap(opts.serviceMapUpdate.edges, opts.serviceMapUpdate.nodes);
    }

    await this.updateMetrics(opts.qualityScore, opts.agentsUsed, opts.pattern);

    const summary = `patterns(+1, confidence=${saved.confidence.toFixed(2)}) | solutions(+1) | metrics updated`;
    this.emitter.emit("learning_complete", { summary, pattern: opts.pattern, domain: opts.domain });
    return summary;
  }
}
