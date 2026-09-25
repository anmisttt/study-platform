import { describe, expect, it } from "vitest";
import type { LangfuseSpanProcessor } from "@langfuse/otel";
import { redactTraceSpan, redactTraceValue } from "./redaction.js";

describe("credential redaction before trace export", () => {
  it("masks OpenAI keys in text and credential fields in serialized metadata", () => {
    const value = redactTraceValue({ input: "My key is sk-proj-private_123456", metadata: JSON.stringify({ apiKey: "arbitrary-secret", model: "gpt-5.5" }), tokens: 12 });
    expect(JSON.stringify(value)).not.toContain("private_123456");
    expect(JSON.stringify(value)).not.toContain("arbitrary-secret");
    expect(value).toMatchObject({ tokens: 12 });
  });
  it("also redacts provider errors that bypass the standard mask callback", () => {
    const span = {
      attributes: { authorization: "arbitrary-secret", "langfuse.observation.status_message": "Incorrect key: arbitrary-secret", "langfuse.observation.input": "student answer" },
      status: { code: 2, message: "arbitrary-secret" },
      events: [{ attributes: { apiKey: "arbitrary-secret", "exception.message": "arbitrary-secret", "exception.stacktrace": "arbitrary-secret" } }],
    };
    redactTraceSpan(span as unknown as Parameters<LangfuseSpanProcessor["onEnd"]>[0]);
    expect(JSON.stringify(span)).not.toContain("arbitrary-secret");
    expect(span.attributes["langfuse.observation.input"]).toBe("student answer");
  });
});
