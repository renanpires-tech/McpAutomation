import { EventEmitter } from "node:events";
import type { PatternDetection, Domain, Risk } from "./types.js";

// ─────────────────────────────────────────────
//  DocAgent
// ─────────────────────────────────────────────

export class DocAgent {
  constructor(private readonly emitter: EventEmitter) {}

  generateDoc(code: string, detections: PatternDetection[], existingDoc?: string): string {
    const primary = detections[0];
    const className = this.extractClassName(code);
    const methods = this.extractMethods(code);
    const deps = this.extractDependencies(code);
    const kafkaTopics = this.extractKafkaTopics(code);
    const cacheKeys = this.extractCacheKeys(code);

    let doc = this.buildJavadoc({
      className,
      pattern: primary.pattern,
      domain: primary.domain,
      risk: primary.risk,
      methods,
      deps,
      kafkaTopics,
      cacheKeys,
      existingDoc,
    });

    this.emitter.emit("doc_generated", {
      type: "doc_generated",
      source: "DOC",
      payload: { className, pattern: primary.pattern, doc },
    });

    return doc;
  }

  private buildJavadoc(opts: {
    className: string;
    pattern: string;
    domain: Domain;
    risk: Risk;
    methods: string[];
    deps: string[];
    kafkaTopics: string[];
    cacheKeys: string[];
    existingDoc?: string;
  }): string {
    const { className, pattern, domain, risk, methods, deps, kafkaTopics, cacheKeys, existingDoc } = opts;

    const domainDescriptions: Record<Domain, string> = {
      checkout: "Orquestração do fluxo de finalização de compra",
      payment: "Processamento e validação de pagamentos",
      order: "Gerenciamento do ciclo de vida de pedidos",
      catalog: "Gestão de produtos e catálogo",
      fulfillment: "Processamento logístico e separação de pedidos",
      customer: "Gerenciamento de dados e autenticação de clientes",
      notification: "Envio de notificações (email, SMS, push)",
      report: "Geração de relatórios analíticos",
      admin: "Operações administrativas e backoffice",
      util: "Utilitários e helpers internos",
      config: "Configuração e inicialização do serviço",
      unknown: "Componente de domínio a ser classificado",
    };

    const patternDescriptions: Record<string, string> = {
      webhook_handler: "Recebe e processa eventos externos via webhook",
      kafka_consumer: "Consome e processa eventos assíncronos via Kafka",
      transactional_service: "Executa operações de negócio com garantia de consistência transacional",
      feign_client: "Realiza chamadas HTTP para serviços externos",
      unknown: "Componente com responsabilidade a ser documentada",
    };

    const securityNote = domain === "payment"
      ? ` * ⚠️  Segurança: Este componente manipula dados financeiros — PCI-DSS aplicável.\n * Validar: assinatura HMAC, idempotência, audit log obrigatório.\n *`
      : "";

    const lgpdNote = (domain === "customer" || domain === "checkout")
      ? ` * ⚠️  LGPD: Componente processa dados pessoais — garantir consentimento e rastreabilidade.\n *`
      : "";

    const evolutionNote = existingDoc
      ? ` * 🔄 Documentação atualizada — versão anterior preservada no KB.\n *`
      : "";

    const methodDocs = methods.slice(0, 5).map(m =>
      ` * @see #${m}`,
    ).join("\n");

    const topicDocs = kafkaTopics.length > 0
      ? ` * Eventos publicados: ${kafkaTopics.join(", ")}\n *`
      : "";

    const cacheDocs = cacheKeys.length > 0
      ? ` * Cache envolvido: ${cacheKeys.join(", ")}\n *`
      : "";

    const depDocs = deps.length > 0
      ? ` * Dependências externas: ${deps.join(", ")}\n *`
      : "";

    return `/**
 * ${className} — ${patternDescriptions[pattern] ?? "Componente do sistema GPA"}
 *
 * ${domainDescriptions[domain] ?? "Domínio GPA"}
 * O que este código FAZ para o negócio: ${this.inferBusinessPurpose(pattern, domain)}
 *
 * Domínio GPA: ${domain}
 * Risco: ${risk}
 * Padrão: ${pattern}
 *${securityNote}
 *${lgpdNote}
 *${evolutionNote}
${methodDocs ? methodDocs + "\n *\n" : " *\n"}${depDocs ? depDocs + "\n" : ""}${topicDocs ? topicDocs + "\n" : ""}${cacheDocs ? cacheDocs + "\n" : ""} * @author GPA Backend Team
 * @version 2.0.0 — gerado por DOC Agent (Multi-Agent MCP)
 */`;
  }

  private inferBusinessPurpose(pattern: string, domain: Domain): string {
    const matrix: Partial<Record<string, string>> = {
      "webhook_handler::payment": "Recebe confirmações de pagamento do gateway e atualiza o status do pedido no GPA",
      "webhook_handler::order": "Recebe atualizações de status de pedido de parceiros logísticos",
      "kafka_consumer::order": "Processa eventos de pedido criado/atualizado no pipeline de fulfillment do GPA",
      "kafka_consumer::fulfillment": "Consome eventos de separação e despacho para atualizar rastreamento",
      "transactional_service::checkout": "Finaliza compra: reserva estoque, cria pedido e debita pagamento atomicamente",
      "transactional_service::order": "Atualiza estado do pedido garantindo consistência entre Order, Stock e Audit",
      "feign_client::payment": "Integra com gateway de pagamento externo (Cielo/Adyen/PagSeguro)",
      "feign_client::catalog": "Consulta informações de produto e preço do serviço de catálogo",
    };

    return matrix[`${pattern}::${domain}`]
      ?? `Executa lógica de negócio do domínio ${domain} no contexto GPA`;
  }

  private extractClassName(code: string): string {
    const match = /(?:class|interface|enum)\s+(\w+)/.exec(code);
    return match?.[1] ?? "UnknownClass";
  }

  private extractMethods(code: string): string[] {
    const matches = code.matchAll(/(?:public|protected|private)\s+\S+\s+(\w+)\s*\(/g);
    return [...matches].map(m => m[1]).filter(m => m !== "class");
  }

  private extractDependencies(code: string): string[] {
    const deps: string[] = [];
    if (code.includes("@FeignClient")) {
      const match = /@FeignClient\s*\(\s*(?:name\s*=\s*)?["']([^"']+)["']/.exec(code);
      if (match) deps.push(match[1]);
    }
    if (code.includes("RestTemplate")) deps.push("RestTemplate (HTTP externo)");
    if (code.includes("WebClient")) deps.push("WebClient (HTTP reativo)");
    if (code.includes("KafkaTemplate")) deps.push("KafkaTemplate (producer)");
    return deps;
  }

  private extractKafkaTopics(code: string): string[] {
    const topics: string[] = [];
    const listenerMatch = code.matchAll(/@KafkaListener\s*\(\s*topics\s*=\s*["']([^"']+)["']/g);
    for (const m of listenerMatch) topics.push(m[1]);
    const sendMatch = code.matchAll(/kafkaTemplate\.send\s*\(\s*["']([^"']+)["']/g);
    for (const m of sendMatch) topics.push(`${m[1]} (produced)`);
    return topics;
  }

  private extractCacheKeys(code: string): string[] {
    const keys: string[] = [];
    const cacheMatch = code.matchAll(/@Cacheable\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/g);
    for (const m of cacheMatch) keys.push(m[1]);
    const redisMatch = code.matchAll(/redisTemplate\..*?["']([^"']+)["']/g);
    for (const m of redisMatch) keys.push(m[1]);
    return keys;
  }
}
