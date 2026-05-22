import type { GpaDomain, GpaRisk } from "./gpa-context.js";

export interface PatternDefinition {
  name:        string;
  intent:      string;
  domains:     GpaDomain[];
  risk:        GpaRisk;
  /** Regex or keyword triggers */
  triggers:    string[];
  /** Must-have test types for this pattern */
  requiredTests: string[];
  /** Anti-patterns that indicate missing best practice */
  antiPatterns: string[];
}

export const PATTERN_REGISTRY: PatternDefinition[] = [
  {
    name: "webhook_handler",
    intent: "Recebe notificações externas (pagamento, logística)",
    domains: ["payment", "order"],
    risk: "CRÍTICO",
    triggers: ["@PostMapping", "WebhookController", "webhook", "notification", "callback"],
    requiredTests: ["timeout", "fallback", "idempotency", "hmac", "signature"],
    antiPatterns: ["sem validação de assinatura", "sem idempotência"],
  },
  {
    name: "kafka_consumer",
    intent: "Consome eventos Kafka de forma assíncrona",
    domains: ["order", "checkout", "payment"],
    risk: "ALTO",
    triggers: ["@KafkaListener", "KafkaConsumer", "ConsumerRecord", "@EnableKafka"],
    requiredTests: ["idempotent", "retry", "dlq", "offset"],
    antiPatterns: ["sem retry", "sem DLQ"],
  },
  {
    name: "transactional_service",
    intent: "Executa operações transacionais multi-step",
    domains: ["payment", "order", "checkout"],
    risk: "CRÍTICO",
    triggers: ["@Transactional", "transactionManager", "rollbackFor"],
    requiredTests: ["rollback", "commit", "isolation", "concurrent"],
    antiPatterns: ["checked exception sem rollbackFor", "audit log dentro da transação"],
  },
  {
    name: "feign_client",
    intent: "Integração HTTP com serviço externo via OpenFeign",
    domains: ["payment", "catalog", "order"],
    risk: "ALTO",
    triggers: ["@FeignClient", "FeignClient", "@EnableFeignClients", "feign"],
    requiredTests: ["timeout", "circuit", "fallback", "unavailable"],
    antiPatterns: ["sem circuit breaker", "sem timeout"],
  },
  {
    name: "cache_layer",
    intent: "Cache de dados para performance",
    domains: ["catalog", "cart"],
    risk: "MÉDIO",
    triggers: ["@Cacheable", "@CacheEvict", "@CachePut", "RedisTemplate", "CacheManager"],
    requiredTests: ["cache hit", "cache miss", "evict", "ttl"],
    antiPatterns: ["sem TTL configurado"],
  },
  {
    name: "repository_pattern",
    intent: "Acesso a dados via Spring Data JPA/MongoDB",
    domains: ["order", "customer", "catalog"],
    risk: "MÉDIO",
    triggers: ["JpaRepository", "MongoRepository", "@Repository", "EntityManager"],
    requiredTests: ["save", "findById", "delete", "query"],
    antiPatterns: ["N+1 query", "sem paginação"],
  },
];

export function findPattern(code: string): PatternDefinition | undefined {
  const lower = code.toLowerCase();
  return PATTERN_REGISTRY.find(p =>
    p.triggers.some(t => lower.includes(t.toLowerCase()))
  );
}

export function findAllPatterns(code: string): PatternDefinition[] {
  const lower = code.toLowerCase();
  return PATTERN_REGISTRY.filter(p =>
    p.triggers.some(t => lower.includes(t.toLowerCase()))
  );
}
