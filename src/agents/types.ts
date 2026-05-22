// ─────────────────────────────────────────────
//  Shared Types — Multi-Agent System
// ─────────────────────────────────────────────

export type Domain =
  | "checkout" | "payment" | "order" | "catalog"
  | "fulfillment" | "customer" | "notification"
  | "report" | "admin" | "util" | "config" | "unknown";

export type Risk = "CRÍTICO" | "ALTO" | "MÉDIO" | "BAIXO";

export type PatternName =
  | "webhook_handler"
  | "kafka_consumer"
  | "transactional_service"
  | "feign_client"
  | "unknown";

export type Intent =
  | "coverage_analysis"
  | "test_generation"
  | "failure_diagnosis"
  | "reverse_engineer"
  | "architecture_map";

export type EdgeType = "REST" | "Kafka" | "Database" | "Cache";

// ─────────────────────────────────────────────
//  Knowledge Base Structures
// ─────────────────────────────────────────────

export interface PatternEntry {
  pattern_name: PatternName;
  domain: Domain;
  risk: Risk;
  occurrences: number;
  confidence: number;           // min(0.6 + occurrences * 0.05, 1.0)
  recommended_tests: string[];
  last_seen: string;            // ISO timestamp
  false_positives: number;
}

export interface SolutionEntry {
  intent: Intent;
  input_pattern: string;
  solution_summary: string;     // first 500 chars
  agents_used: string[];
  quality_score: number;        // 0-1
  reused_count: number;
  timestamp: string;            // ISO
  domain: Domain;
}

export interface ServiceMapNode {
  id: string;
  name: string;
  tech: string;
  domain: Domain;
  risk: Risk;
}

export interface ServiceMapEdge {
  from: string;
  to: string;
  type: EdgeType;
  has_timeout: boolean;
  has_retry: boolean;
  has_circuit_breaker: boolean;
  occurrences: number;
}

export interface ServiceMap {
  nodes: ServiceMapNode[];
  edges: ServiceMapEdge[];
}

export interface AgentsPerformance {
  analyst:   { calls: number; avg_confidence: number };
  tester:    { calls: number; avg_coverage: number };
  architect: { calls: number; spof_found: number };
  doc:       { calls: number; docs_generated: number };
  memory:    { calls: number; kb_size_kb: number };
}

export interface Metrics {
  total_interactions: number;
  avg_quality_score: number;
  quality_trend: number[];      // last 10 interactions
  top_patterns: string[];
  agents_performance: AgentsPerformance;
}

// ─────────────────────────────────────────────
//  Runtime Structures
// ─────────────────────────────────────────────

export interface PatternDetection {
  pattern: PatternName;
  domain: Domain;
  risk: Risk;
  triggers: string[];
  confidence: number;
  signature: string;            // unique key for KB
}

export interface ArchitectValidation {
  approved: boolean;
  missing_coverage: string[];   // e.g. ["timeout test", "downstream unavailable"]
  spof_alerts: string[];
  service_edges: ServiceMapEdge[];
  service_nodes: ServiceMapNode[];
}

export interface SharedContext {
  input: string;
  intent: Intent;
  patterns: PatternDetection[];
  generatedTests: string;
  documentation: string;
  architectureNotes: string[];
  approvedTests: boolean;
  refinementFeedback: string[];
  alerts: string[];
}

export interface KBHit {
  key: string;
  solution: SolutionEntry;
  score: number;
}

export interface OrchestrationResult {
  knowledge_header: {
    similar_interactions: number;
    confidence: number;
    agents_used: string[];
    pattern_identified: string;
    kb_hit: boolean;
  };
  diagnosis: string;
  solution: string;
  tests: string;
  documentation: string;
  validation: string;
  learning_registered: string;
  quality_score: number;
}

export type AgentEventType =
  | "pattern_found"
  | "test_generated"
  | "test_approved"
  | "test_needs_refinement"
  | "doc_generated"
  | "learning_complete"
  | "spof_detected"
  | "alert";

export interface AgentEvent {
  type: AgentEventType;
  source: string;
  payload: unknown;
}
