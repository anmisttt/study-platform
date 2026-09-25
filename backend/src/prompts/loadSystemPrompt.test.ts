import type { LangfuseClient } from "@langfuse/client";
import { describe, expect, it, vi } from "vitest";
import { loadSystemPrompt } from "./loadSystemPrompt.js";

describe("loadSystemPrompt", () => {
  it.each([
    ["theory", "theory-system-prompt"],
    ["practice", "practice-system-prompt"],
  ] as const)("loads the production %s prompt without a fallback", async (type, promptName) => {
    const prompt = {
      name: promptName,
      version: 3,
      isFallback: false,
      compile: vi.fn(() => "compiled system prompt"),
    };
    const get = vi.fn().mockResolvedValue(prompt);
    const langfuse = { prompt: { get } } as unknown as LangfuseClient;

    const loaded = await loadSystemPrompt(type, langfuse);

    expect(get).toHaveBeenCalledWith(promptName, {
      label: "production",
      type: "text",
    });
    expect(loaded).toBe(prompt);
    expect(prompt.compile).not.toHaveBeenCalled();
  });
});
