import { LangfuseClient, type TextPromptClient } from "@langfuse/client";
import type { QuestionType } from "@study-platform/shared";

const systemPromptNameByType: Record<QuestionType, string> = {
  practice: "practice-system-prompt",
  theory: "theory-system-prompt",
};

let client: LangfuseClient | undefined;

function getLangfuseClient(): LangfuseClient {
  if (!client) {
    const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
    const secretKey = process.env.LANGFUSE_SECRET_KEY;
    const baseUrl = process.env.LANGFUSE_BASE_URL ?? process.env.LANGFUSE_HOST;
    if (!publicKey || !secretKey || !baseUrl) {
      throw new Error(
        "LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, and LANGFUSE_BASE_URL (or LANGFUSE_HOST) must be set",
      );
    }
    client = new LangfuseClient({ publicKey, secretKey, baseUrl });
  }
  return client;
}

export function loadSystemPrompt(
  type: QuestionType,
  langfuse: LangfuseClient = getLangfuseClient(),
): Promise<TextPromptClient> {
  return langfuse.prompt.get(systemPromptNameByType[type], {
    label: "production",
    type: "text",
  });
}
