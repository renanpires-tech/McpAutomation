export interface TaskInput {
  name:        string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required: string[];
  };
}

export const TASK_DEFINITIONS: TaskInput[] = [
  {
    name: "analyze_coverage",
    description: "Analisa relatório JaCoCo XML e retorna gaps priorizados por domínio GPA",
    inputSchema: {
      type: "object",
      properties: {
        jacoco_xml:    { type: "string", description: "Conteúdo do jacoco.xml (opcional se lcov_report fornecido)" },
        lcov_report:   { type: "string", description: "Conteúdo do relatório LCOV (alternativa ao jacoco_xml)" },
        service_name:  { type: "string", description: "Nome do serviço (ex: checkout-service)" },
      },
      required: ["service_name"],
    },
  },
  {
    name: "generate_tests",
    description: "Gera suite de testes JUnit5/Mockito compilável para o código Java/Kotlin fornecido",
    inputSchema: {
      type: "object",
      properties: {
        source_code: { type: "string", description: "Código-fonte Java ou Kotlin" },
        class_name:  { type: "string", description: "Nome da classe a testar" },
        domain: {
          type: "string",
          description: "Domínio GPA",
          enum: ["checkout", "payment", "order", "catalog", "cart", "customer", "general"],
        },
      },
      required: ["source_code", "class_name"],
    },
  },
  {
    name: "diagnose_failure",
    description: "Diagnostica falha de teste ou stack trace e sugere correção",
    inputSchema: {
      type: "object",
      properties: {
        stack_trace:  { type: "string", description: "Stack trace Java completo" },
        test_code:    { type: "string", description: "Código do teste que falhou (opcional)" },
      },
      required: ["stack_trace"],
    },
  },
  {
    name: "generate_docs",
    description: "Gera documentação Javadoc/KDoc completa para classe Java ou Kotlin",
    inputSchema: {
      type: "object",
      properties: {
        source_code: { type: "string", description: "Código-fonte da classe" },
        class_name:  { type: "string", description: "Nome da classe" },
      },
      required: ["source_code", "class_name"],
    },
  },
  {
    name: "full_analysis",
    description: "Pipeline completo: analisa código + gera testes + valida arquitetura + documenta",
    inputSchema: {
      type: "object",
      properties: {
        source_code:  { type: "string", description: "Código-fonte Java/Kotlin" },
        class_name:   { type: "string", description: "Nome da classe" },
        jacoco_xml:   { type: "string", description: "Conteúdo jacoco.xml (opcional)" },
      },
      required: ["source_code", "class_name"],
    },
  },
];
