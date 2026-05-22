// GPA E-commerce domain context — hardcoded knowledge

export type GpaDomain = "checkout" | "payment" | "order" | "catalog" | "cart" | "customer" | "general";
export type GpaRisk   = "CRÍTICO" | "ALTO" | "MÉDIO" | "BAIXO";

export interface DomainConfig {
  name:         GpaDomain;
  risk:         GpaRisk;
  keywords:     string[];
  /** Typical Spring Boot / GPA service name patterns */
  serviceNames: string[];
  /** SLO target for test coverage % */
  coverageTarget: number;
}

export const GPA_DOMAINS: DomainConfig[] = [
  {
    name: "checkout",
    risk: "CRÍTICO",
    keywords: ["checkout", "carrinho", "finalizar", "pedido", "cupom", "frete"],
    serviceNames: ["checkout-service", "cart-service"],
    coverageTarget: 90,
  },
  {
    name: "payment",
    risk: "CRÍTICO",
    keywords: ["payment", "pagamento", "pix", "boleto", "cartao", "credito", "debito", "adyen", "cielo"],
    serviceNames: ["payment-service", "payment-gateway", "billing-service"],
    coverageTarget: 95,
  },
  {
    name: "order",
    risk: "ALTO",
    keywords: ["order", "pedido", "fulfillment", "entrega", "cancelamento", "status"],
    serviceNames: ["order-service", "fulfillment-service"],
    coverageTarget: 85,
  },
  {
    name: "catalog",
    risk: "MÉDIO",
    keywords: ["catalog", "produto", "product", "sku", "categoria", "estoque", "preco"],
    serviceNames: ["catalog-service", "product-service", "pricing-service"],
    coverageTarget: 80,
  },
  {
    name: "cart",
    risk: "ALTO",
    keywords: ["cart", "carrinho", "basket", "wishlist", "item"],
    serviceNames: ["cart-service"],
    coverageTarget: 85,
  },
  {
    name: "customer",
    risk: "MÉDIO",
    keywords: ["customer", "cliente", "user", "usuario", "perfil", "endereco", "cpf"],
    serviceNames: ["customer-service", "identity-service", "profile-service"],
    coverageTarget: 80,
  },
  {
    name: "general",
    risk: "BAIXO",
    keywords: [],
    serviceNames: [],
    coverageTarget: 70,
  },
];

export function detectDomain(text: string): GpaDomain {
  const lower = text.toLowerCase();
  for (const domain of GPA_DOMAINS) {
    if (domain.name === "general") continue;
    if (domain.keywords.some(k => lower.includes(k))) return domain.name;
  }
  return "general";
}

export function getDomainConfig(domain: GpaDomain): DomainConfig {
  return GPA_DOMAINS.find(d => d.name === domain) ?? GPA_DOMAINS[GPA_DOMAINS.length - 1];
}
