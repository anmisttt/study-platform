import { LangfuseClient } from "@langfuse/client";
import {
  systemPromptByType,
} from "./system-prompt";
import { QuestionType } from "@study-platform/shared";

export type LangfusePromptGetter = {
  prompt: {
    get: LangfuseClient["prompt"]["get"];
  };
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

export async function loadSystemPrompt(
  type: QuestionType,
  langfuse: LangfusePromptGetter = getLangfuseClient(),
): Promise<string> {
  const fallback = systemPromptByType[type].defaultPrompt;

  const prompt = await langfuse.prompt.get(systemPromptByType[type].langfusePrompt, {
    label: "production",
    type: "text",
    fallback,
  });
  return prompt.compile();
}
