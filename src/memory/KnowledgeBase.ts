import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KB_DIR = path.join(__dirname, "../../knowledge");

const FILES: Record<string, string> = {
  patterns:        "patterns.json",
  solutions:       "solutions.json",
  services:        "service-map.json",
  metrics:         "metrics.json",
  intentPatterns:  "intent-patterns.json",
};

export interface KBMetrics {
  total_interactions: number;
  avg_quality_score: number;
  quality_trend: number[];
  top_patterns: string[];
  agents_performance: Record<string, Record<string, number>>;
}

const DEFAULT_METRICS: KBMetrics = {
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
};

export class KnowledgeBase {
  private cache: Map<string, Record<string, unknown>> = new Map();

  async init(): Promise<void> {
    await mkdir(KB_DIR, { recursive: true });
    // Seed metrics if missing
    await this.getAll("metrics", DEFAULT_METRICS);
  }

  private filePath(category: string): string {
    const file = FILES[category] ?? `${category}.json`;
    return path.join(KB_DIR, file);
  }

  async getAll<T>(category: string, fallback: T): Promise<T> {
    if (this.cache.has(category)) return this.cache.get(category) as unknown as T;
    try {
      const raw = await readFile(this.filePath(category), "utf-8");
      const data = JSON.parse(raw) as Record<string, unknown>;
      this.cache.set(category, data);
      return data as unknown as T;
    } catch {
      this.cache.set(category, fallback as unknown as Record<string, unknown>);
      return fallback;
    }
  }

  async get<T>(category: string, key: string): Promise<T | undefined> {
    const all = await this.getAll<Record<string, T>>(category, {});
    return all[key];
  }

  async store(category: string, key: string, value: unknown): Promise<void> {
    const all = await this.getAll<Record<string, unknown>>(category, {});
    all[key] = value;
    this.cache.set(category, all);
    await this.persist(category, all);
  }

  async dump(category: string): Promise<unknown> {
    if (category === "all") {
      const result: Record<string, unknown> = {};
      for (const cat of Object.keys(FILES)) {
        result[cat] = await this.getAll(cat, {});
      }
      return result;
    }
    return this.getAll(category, {});
  }

  async incrementMetric(agent: string, field: string, delta = 1): Promise<void> {
    const metrics = await this.getAll<KBMetrics>("metrics", DEFAULT_METRICS);
    metrics.total_interactions++;
    const perf = metrics.agents_performance[agent] ??= {};
    perf[field] = (perf[field] ?? 0) + delta;
    this.cache.set("metrics", metrics as unknown as Record<string, unknown>);
    await this.persist("metrics", metrics as unknown as Record<string, unknown>);
  }

  async recordQualityScore(score: number): Promise<void> {
    const metrics = await this.getAll<KBMetrics>("metrics", DEFAULT_METRICS);
    metrics.quality_trend.push(score);
    if (metrics.quality_trend.length > 100) metrics.quality_trend.shift();
    const sum = metrics.quality_trend.reduce((a, b) => a + b, 0);
    metrics.avg_quality_score = Math.round((sum / metrics.quality_trend.length) * 100) / 100;
    this.cache.set("metrics", metrics as unknown as Record<string, unknown>);
    await this.persist("metrics", metrics as unknown as Record<string, unknown>);
  }

  private async persist(category: string, data: unknown): Promise<void> {
    await mkdir(KB_DIR, { recursive: true });
    await writeFile(this.filePath(category), JSON.stringify(data, null, 2), "utf-8");
  }
}
