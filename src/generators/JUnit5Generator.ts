import type { CoverageGap } from "../parsers/JaCoCoParser.js";
import { findPattern } from "../domain/pattern-registry.js";
import { MockitoGenerator } from "./MockitoGenerator.js";

export class JUnit5Generator {

  private readonly mockitoGen = new MockitoGenerator();

  /** Generate a full JUnit5 test class for a coverage gap */
  generateForGap(gap: CoverageGap, classSource = ""): string {
    const className  = gap.className.split("/").pop()?.replace(/\.java$/, "") ?? gap.className;
    const testClass  = `${className}Test`;
    const pkg        = this.inferPackage(gap.className);
    const mocks      = this.inferMocks(classSource);
    const methods    = this.buildTestMethods(gap, className, classSource);

    return [
      `package ${pkg};`,
      "",
      "import org.junit.jupiter.api.Test;",
      "import org.junit.jupiter.api.extension.ExtendWith;",
      "import org.mockito.InjectMocks;",
      "import org.mockito.Mock;",
      "import org.mockito.junit.jupiter.MockitoExtension;",
      "import static org.mockito.Mockito.*;",
      "import static org.junit.jupiter.api.Assertions.*;",
      "",
      "/**",
      ` * Testes gerados automaticamente pelo GPA MCP Server — domínio: ${gap.domain}`,
      ` * Risco: ${gap.risk} | Linhas não cobertas: ${gap.missedCount}`,
      " */",
      "@ExtendWith(MockitoExtension.class)",
      `class ${testClass} {`,
      "",
      ...mocks.map(m => {
        const parts = m.split(" ");
        const type  = parts[0] ?? "Object";
        const field = parts[1] ?? type.charAt(0).toLowerCase() + type.slice(1);
        return `    ${this.mockitoGen.generateMock(type, field)}`;
      }),
      "",
      `    @InjectMocks`,
      `    private ${className} subject;`,
      "",
      ...methods,
      "}",
    ].join("\n");
  }

  /** Generate a complete test class from source code */
  generateFromSource(source: string, className: string): string {
    const pkg     = this.inferPackageFromSource(source);
    const pattern = findPattern(source);
    const methods = this.generatePatternTests(source, className, pattern?.name);

    return [
      `package ${pkg};`,
      "",
      "import org.junit.jupiter.api.Test;",
      "import org.junit.jupiter.api.extension.ExtendWith;",
      "import org.mockito.InjectMocks;",
      "import org.mockito.Mock;",
      "import org.mockito.junit.jupiter.MockitoExtension;",
      "import static org.mockito.Mockito.*;",
      "import static org.junit.jupiter.api.Assertions.*;",
      ...(source.includes("@Transactional") ? ["import org.springframework.transaction.annotation.Transactional;"] : []),
      "",
      `/**`,
      ` * Testes para ${className} — padrão: ${pattern?.name ?? "geral"}`,
      ` */`,
      "@ExtendWith(MockitoExtension.class)",
      `class ${className}Test {`,
      "",
      ...this.inferMocks(source).map(m => {
        const parts = m.split(" ");
        const type  = parts[0] ?? "Object";
        const field = parts[1] ?? type.charAt(0).toLowerCase() + type.slice(1);
        return `    ${this.mockitoGen.generateMock(type, field)}`;
      }),
      "",
      `    @InjectMocks`,
      `    private ${className} subject;`,
      "",
      ...methods,
      "}",
    ].join("\n");
  }

  // ─────────────────── private helpers ───────────────────

  private buildTestMethods(gap: CoverageGap, className: string, source: string): string[] {
    const pattern = findPattern(source);
    if (pattern) return this.generatePatternTests(source, className, pattern.name);
    return this.generateGenericTests(className, gap);
  }

  private generatePatternTests(source: string, className: string, patternName?: string): string[] {
    switch (patternName) {
      case "webhook_handler":   return this.webhookTests(className);
      case "kafka_consumer":    return this.kafkaTests(className);
      case "transactional_service": return this.transactionalTests(className);
      case "feign_client":      return this.feignTests(className);
      case "cache_layer":       return this.cacheTests(className, source);
      default:                  return this.genericServiceTests(className, source);
    }
  }

  private webhookTests(cls: string): string[] {
    return [
      `    @Test`,
      `    void shouldRejectWebhookWithInvalidSignature() {`,
      `        // given`,
      `        String invalidPayload = "{}";`,
      `        String invalidSig = "sha256=invalid";`,
      `        // when / then`,
      `        assertThrows(SecurityException.class, () ->`,
      `            subject.handleWebhook(invalidPayload, invalidSig));`,
      `    }`,
      "",
      `    @Test`,
      `    void shouldProcessWebhookIdempotently() {`,
      `        // given`,
      `        String idempotencyKey = "evt_12345";`,
      `        when(repository.existsByIdempotencyKey(idempotencyKey)).thenReturn(true);`,
      `        // when`,
      `        subject.handleWebhook("{}", idempotencyKey);`,
      `        // then — deve ignorar evento duplicado`,
      `        verify(repository, never()).save(any());`,
      `    }`,
      "",
      `    @Test`,
      `    void shouldHandleTimeoutGracefully() {`,
      `        // given`,
      `        doThrow(new java.net.SocketTimeoutException("timeout"))`,
      `            .when(externalService).notify(any());`,
      `        // when / then`,
      `        assertDoesNotThrow(() -> subject.handleWebhook("{}", "evt_timeout"));`,
      `    }`,
    ];
  }

  private kafkaTests(cls: string): string[] {
    return [
      `    @Test`,
      `    void shouldConsumeEventIdempotently() {`,
      `        // given`,
      `        String eventId = "evt-001";`,
      `        when(processedEventRepository.existsById(eventId)).thenReturn(true);`,
      `        // when`,
      `        subject.consume(buildEvent(eventId));`,
      `        // then`,
      `        verify(orderService, never()).process(any());`,
      `    }`,
      "",
      `    @Test`,
      `    void shouldProcessNewEventAndMarkAsProcessed() {`,
      `        // given`,
      `        String eventId = "evt-002";`,
      `        when(processedEventRepository.existsById(eventId)).thenReturn(false);`,
      `        // when`,
      `        subject.consume(buildEvent(eventId));`,
      `        // then`,
      `        verify(orderService).process(any());`,
      `        verify(processedEventRepository).save(eventId);`,
      `    }`,
      "",
      `    private Object buildEvent(String id) {`,
      `        // TODO: instanciar evento real do domínio`,
      `        return new Object();`,
      `    }`,
    ];
  }

  private transactionalTests(cls: string): string[] {
    return [
      `    @Test`,
      `    void shouldRollbackOnException() {`,
      `        // given`,
      `        doThrow(new RuntimeException("DB error")).when(repository).save(any());`,
      `        // when / then`,
      `        assertThrows(RuntimeException.class, () -> subject.execute(any()));`,
      `        verify(repository, never()).saveAuditLog(any());`,
      `    }`,
      "",
      `    @Test`,
      `    void shouldPublishDomainEventAfterCommit() {`,
      `        // given`,
      `        when(repository.save(any())).thenReturn(new Object());`,
      `        // when`,
      `        subject.execute(any());`,
      `        // then`,
      `        verify(eventPublisher).publishAfterCommit(any());`,
      `    }`,
    ];
  }

  private feignTests(cls: string): string[] {
    return [
      `    @Test`,
      `    void shouldFallbackWhenServiceUnavailable() {`,
      `        // given`,
      `        when(feignClient.call(any())).thenThrow(`,
      `            new feign.RetryableException(503, "Service Unavailable", null, null, null));`,
      `        // when`,
      `        var result = subject.callWithFallback(any());`,
      `        // then`,
      `        assertNotNull(result);`,
      `        assertTrue(result.isFallback());`,
      `    }`,
      "",
      `    @Test`,
      `    void shouldTimeoutAndOpenCircuitBreaker() {`,
      `        // given`,
      `        when(feignClient.call(any())).thenThrow(`,
      `            new java.net.SocketTimeoutException("Read timed out"));`,
      `        // when / then`,
      `        assertThrows(ServiceUnavailableException.class,`,
      `            () -> subject.callWithFallback(any()));`,
      `    }`,
    ];
  }

  private cacheTests(cls: string, source: string): string[] {
    return [
      `    @Test`,
      `    void shouldReturnCachedValueOnSecondCall() {`,
      `        // given`,
      `        when(repository.findById(1L)).thenReturn(Optional.of(new Object()));`,
      `        // when`,
      `        subject.findById(1L); // miss`,
      `        subject.findById(1L); // hit`,
      `        // then`,
      `        verify(repository, times(1)).findById(1L);`,
      `    }`,
      "",
      `    @Test`,
      `    void shouldEvictCacheOnUpdate() {`,
      `        // when`,
      `        subject.update(1L, new Object());`,
      `        // then`,
      `        verify(cacheManager).evict(anyString(), eq(1L));`,
      `    }`,
    ];
  }

  private genericServiceTests(cls: string, source: string): string[] {
    return [
      `    @Test`,
      `    void shouldExecuteHappyPath() {`,
      `        // given`,
      `        // TODO: setup mocks for ${cls}`,
      `        // when`,
      `        // TODO: call method under test`,
      `        // then`,
      `        // TODO: assert expected outcome`,
      `    }`,
      "",
      `    @Test`,
      `    void shouldThrowWhenInputIsInvalid() {`,
      `        assertThrows(IllegalArgumentException.class, () -> {`,
      `            // TODO: call with invalid input`,
      `        });`,
      `    }`,
    ];
  }

  private generateGenericTests(className: string, gap: CoverageGap): string[] {
    return this.genericServiceTests(className, "");
  }

  private inferMocks(source: string): string[] {
    const mocks: string[] = [];
    const privateFieldRe = /private\s+([\w<>]+)\s+(\w+)\s*;/g;
    let m: RegExpExecArray | null;
    while ((m = privateFieldRe.exec(source)) !== null) {
      const type = m[1] ?? "";
      const name = m[2] ?? "";
      if (!type.toLowerCase().includes("string") && !type.toLowerCase().includes("int")) {
        mocks.push(`${type} ${name}`);
      }
    }
    return mocks.slice(0, 4); // max 4 mocks per class
  }

  private inferPackage(className: string): string {
    const parts = className.replace(/\//g, ".").split(".");
    return parts.slice(0, -1).join(".");
  }

  private inferPackageFromSource(source: string): string {
    const m = /^package\s+([\w.]+);/m.exec(source);
    return m?.[1] ?? "com.grupopao.test";
  }

  extractClassName(source: string): string {
    const m = /(?:class|interface|enum)\s+(\w+)/.exec(source);
    return m?.[1] ?? "UnknownClass";
  }
}
