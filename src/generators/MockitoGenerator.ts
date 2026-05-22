/** Generates compilable Mockito mock/stub/spy blocks for Java */
export class MockitoGenerator {

  /** Full mock class for a given interface/class name */
  generateMock(typeName: string, fieldName: string): string {
    return `@Mock\nprivate ${typeName} ${fieldName};`;
  }

  /** when(...).thenReturn(...) stub */
  generateStub(
    mockField: string,
    method: string,
    returnValue: string,
    argMatchers = "any()",
  ): string {
    return `when(${mockField}.${method}(${argMatchers})).thenReturn(${returnValue});`;
  }

  /** when(...).thenThrow(...) stub */
  generateThrowStub(
    mockField: string,
    method: string,
    exceptionClass: string,
    message = "simulated error",
  ): string {
    return `when(${mockField}.${method}(any())).thenThrow(new ${exceptionClass}("${message}"));`;
  }

  /** doThrow(...).when(...).method() for void methods */
  generateVoidThrowStub(
    mockField: string,
    method: string,
    exceptionClass: string,
    message = "simulated error",
  ): string {
    return `doThrow(new ${exceptionClass}("${message}")).when(${mockField}).${method}(any());`;
  }

  /** verify(mock).method(args) */
  generateVerify(mockField: string, method: string, times = 1, argMatchers = "any()"): string {
    if (times === 0) return `verify(${mockField}, never()).${method}(${argMatchers});`;
    if (times === 1) return `verify(${mockField}).${method}(${argMatchers});`;
    return `verify(${mockField}, times(${times})).${method}(${argMatchers});`;
  }

  /** Full setup block for a service with dependencies */
  generateSetupBlock(serviceName: string, dependencies: { type: string; field: string }[]): string {
    const lines: string[] = [
      "@ExtendWith(MockitoExtension.class)",
      `class ${serviceName}Test {`,
      "",
      ...dependencies.map(d => `    @Mock\n    private ${d.type} ${d.field};`),
      "",
      "    @InjectMocks",
      `    private ${serviceName} subject;`,
      "",
      "    @BeforeEach",
      "    void setUp() {",
      "        // Common test setup",
      "    }",
    ];
    return lines.join("\n");
  }

  /** ArgumentCaptor block */
  generateCaptor(type: string, varName: string): string {
    return [
      `ArgumentCaptor<${type}> ${varName}Captor = ArgumentCaptor.forClass(${type}.class);`,
      `verify(mock).method(${varName}Captor.capture());`,
      `${type} captured${type} = ${varName}Captor.getValue();`,
    ].join("\n");
  }
}
