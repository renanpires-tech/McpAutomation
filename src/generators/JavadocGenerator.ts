/** Generates Javadoc / KDoc documentation blocks */
export class JavadocGenerator {

  /** Generate Javadoc for a Java class */
  generateClassDoc(className: string, description: string, domain: string): string {
    return [
      "/**",
      ` * ${description}`,
      " *",
      ` * <p>Domínio GPA: <strong>${domain}</strong></p>`,
      " *",
      " * @author GPA MCP Server (auto-generated)",
      ` * @since ${new Date().toISOString().split("T")[0]}`,
      " */",
    ].join("\n");
  }

  /** Generate Javadoc for a method */
  generateMethodDoc(
    methodName: string,
    description: string,
    params: { name: string; desc: string }[],
    returnDesc: string,
    throwsDesc?: { type: string; desc: string }[],
  ): string {
    const lines = [
      "    /**",
      `     * ${description}`,
      "     *",
      ...params.map(p => `     * @param ${p.name} ${p.desc}`),
      `     * @return ${returnDesc}`,
      ...(throwsDesc ?? []).map(t => `     * @throws ${t.type} ${t.desc}`),
      "     */",
    ];
    return lines.join("\n");
  }

  /** Generate KDoc for Kotlin class */
  generateKDocClass(className: string, description: string, domain: string): string {
    return [
      "/**",
      ` * $description`,
      " *",
      ` * Domínio GPA: **${domain}**`,
      " *",
      " * @author GPA MCP Server (auto-generated)",
      " */",
    ].join("\n");
  }

  /** Generate full documentation for a Java source file */
  generateForSource(source: string, className: string, domain: string): string {
    const isKotlin = source.includes("fun ") || source.includes(": Unit");
    const methods  = this.extractMethods(source, isKotlin);

    const lines: string[] = [];

    if (isKotlin) {
      lines.push(this.generateKDocClass(className, `Serviço ${className} — domínio ${domain}`, domain));
    } else {
      lines.push(this.generateClassDoc(className, `Serviço ${className} — domínio ${domain}`, domain));
    }

    for (const method of methods) {
      lines.push("");
      lines.push(this.generateMethodDoc(
        method,
        `Executa a operação ${method}`,
        [{ name: "input", desc: "Dados de entrada" }],
        "Resultado da operação",
        [{ type: "IllegalArgumentException", desc: "Se o input for inválido" }],
      ));
    }

    return lines.join("\n");
  }

  private extractMethods(source: string, isKotlin: boolean): string[] {
    const methods: string[] = [];
    const re = isKotlin
      ? /fun\s+(\w+)\s*\(/g
      : /(?:public|protected)\s+\w[\w<>[\],\s]*\s+(\w+)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const name = m[1];
      if (name && name !== "companion" && name !== "override") {
        methods.push(name);
      }
    }
    return methods.slice(0, 10);
  }
}
