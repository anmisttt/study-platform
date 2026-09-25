import type { LangfuseSpanProcessor } from "@langfuse/otel";

const credentialField = /^(authorization|cookie|set-cookie|password|api[-_]?key|client[-_]?secret|access[-_]?token|refresh[-_]?token)$/i;
export function redactTraceValue(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object") return JSON.stringify(redactTraceValue(parsed));
    } catch { /* Most attributes are plain strings. */ }
    return value.replace(/\bsk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redactTraceValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, credentialField.test(key) ? "[REDACTED]" : redactTraceValue(item)]));
  return value;
}

// The SDK's normal mask callback does not cover status/error attributes.
export function redactTraceSpan(span: Parameters<LangfuseSpanProcessor["onEnd"]>[0]): void {
  for (const [key, value] of Object.entries(span.attributes)) {
    span.attributes[key] = /status.?message|exception\./i.test(key)
      ? "LLM request failed."
      : credentialField.test(key) ? "[REDACTED]" : redactTraceValue(value) as typeof value;
  }
  if (span.status.message) span.status.message = "LLM request failed.";
  for (const event of span.events) {
    if (!event.attributes) continue;
    for (const [key, value] of Object.entries(event.attributes)) {
      event.attributes[key] = key.startsWith("exception.") ? "LLM request failed." : credentialField.test(key) ? "[REDACTED]" : redactTraceValue(value) as typeof value;
    }
  }
}
