import type { KnowledgeBase } from "./KnowledgeBase.js";

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

export function cosineSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  const intersection = [...setA].filter(t => setB.has(t));
  return intersection.length / Math.sqrt(setA.size * setB.size || 1);
}

export interface SemanticHit {
  key:      string;
  score:    number;
  payload:  unknown;
}

export class SemanticMatcher {
  constructor(private readonly kb: KnowledgeBase) {}

  async findSimilar(input: string, category: string, topN = 3): Promise<SemanticHit[]> {
    const all = await this.kb.getAll<Record<string, Record<string, unknown>>>(category, {});
    const tokens = tokenize(input);

    const scored = Object.entries(all).map(([key, entry]) => {
      const text = Object.values(entry)
        .filter(v => typeof v === "string")
        .join(" ");
      const score = cosineSimilarity(tokens, tokenize(text));
      return { key, score, payload: entry };
    });

    return scored
      .filter(s => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  }
}
