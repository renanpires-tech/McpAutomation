import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/gpa-mcp-server.ts",
        "src/**/*.test.ts",
        "src/tasks/task-executor.ts",   // depende de KB/Orchestrator — coberto via integração
        "src/tasks/task-definitions.ts",
        "src/tasks/task-registry.ts",
        "src/agents/**",               // cobertos indiretamente
        "src/memory/KnowledgeBase.ts",
      ],
      thresholds: {
        lines:     70,
        branches:  60,
        functions: 70,
        statements: 70,
      },
    },
  },
});
