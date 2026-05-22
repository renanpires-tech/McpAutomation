import { detectDomain, getDomainConfig, type GpaDomain, type GpaRisk } from "./gpa-context.js";

export function classifyRisk(text: string): { domain: GpaDomain; risk: GpaRisk; coverageTarget: number } {
  const domain = detectDomain(text);
  const config = getDomainConfig(domain);
  return { domain, risk: config.risk, coverageTarget: config.coverageTarget };
}

export function riskScore(risk: GpaRisk): number {
  const scores: Record<GpaRisk, number> = { "CRÍTICO": 4, "ALTO": 3, "MÉDIO": 2, "BAIXO": 1 };
  return scores[risk];
}

export function riskEmoji(risk: GpaRisk): string {
  const emojis: Record<GpaRisk, string> = { "CRÍTICO": "🔴", "ALTO": "🟠", "MÉDIO": "🟡", "BAIXO": "🟢" };
  return emojis[risk];
}
