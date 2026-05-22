import { detectDomain } from "../domain/gpa-context.js";
import type { GpaDomain } from "../domain/gpa-context.js";

export interface StackFrame {
  className:  string;
  method:     string;
  file:       string;
  line:       number;
  isGpa:      boolean;
  domain:     GpaDomain;
}

export interface ParsedStackTrace {
  exceptionClass: string;
  message:        string;
  frames:         StackFrame[];
  rootCause:      StackFrame | undefined;
  gpaFrames:      StackFrame[];
  summary:        string;
}

// Matches: at com.example.Foo.method(Foo.java:42)
const FRAME_RE = /^\s+at ([\w.$]+)\.([\w$<>]+)\(([^:)]+)(?::(\d+))?\)/;
// Matches: java.lang.NullPointerException: message here
const EX_RE    = /^([\w.]+(?:Exception|Error|Throwable)[\w.]*)(?::\s*(.*))?$/;
// GPA base package
const GPA_PKG  = /com\.grupopao|br\.com\.gpa|com\.gpa/i;

export class StackTraceParser {
  parse(stackTrace: string): ParsedStackTrace {
    const lines = stackTrace.split("\n");
    let exceptionClass = "UnknownException";
    let message = "";
    const frames: StackFrame[] = [];

    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;

      const exMatch = EX_RE.exec(line);
      if (exMatch && frames.length === 0) {
        exceptionClass = exMatch[1] ?? "UnknownException";
        message        = exMatch[2] ?? "";
        continue;
      }

      const frameMatch = FRAME_RE.exec(line);
      if (frameMatch) {
        const fullClass = frameMatch[1] ?? "";
        const method    = frameMatch[2] ?? "";
        const file      = frameMatch[3] ?? "";
        const lineNo    = Number(frameMatch[4] ?? 0);
        const isGpa     = GPA_PKG.test(fullClass);
        const domain    = detectDomain(fullClass + " " + method);

        frames.push({ className: fullClass, method, file, line: lineNo, isGpa, domain });
      }
    }

    const gpaFrames = frames.filter(f => f.isGpa);
    const rootCause = gpaFrames.find(f => f.line > 0) ?? gpaFrames[0];

    const summary = rootCause
      ? `${exceptionClass} in ${rootCause.className}.${rootCause.method}() line ${rootCause.line} [domain: ${rootCause.domain}]`
      : `${exceptionClass}: ${message}`;

    return { exceptionClass, message, frames, rootCause, gpaFrames, summary };
  }
}
