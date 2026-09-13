import type { CheckResult } from "@study-platform/shared";
import type { TextPromptClient } from "@langfuse/client";
import { observeOpenAI, type LangfuseConfig } from "@langfuse/openai";
import { OpenAI } from "openai";
import type { TutorEvaluationRequest } from "../prompts/user-prompt";
import { initializeLangfuseTracing } from "../observability/langfuse";

export type TutorTraceContext = {
  sessionId?: string;
  metadata?: Record<string, string>;
};

export function tutorLangfuseConfig(
  request: TutorEvaluationRequest,
  systemPrompt: TextPromptClient,
  traceContext: TutorTraceContext = {},
): LangfuseConfig {
  return {
    traceName: "evaluate-tutor-answer",
    sessionId: traceContext.sessionId,
    tags: ["tutor", "answer-evaluation", request.itemType],
    generationName: "grade-answer",
    langfusePrompt: systemPrompt,
    generationMetadata: {
      ...traceContext.metadata,
      reference_answer: request.referenceAnswer,
    },
  };
}

export class Tutor {
  private readonly systemPrompt: TextPromptClient;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens?: number;
  private readonly client: OpenAI;

  constructor({systemPrompt, model, apiKey, temperature, maxTokens}: {systemPrompt: TextPromptClient, model: string, apiKey: string, temperature: number, maxTokens?: number }) {
    initializeLangfuseTracing();
    this.systemPrompt = systemPrompt;
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.client = new OpenAI({ apiKey });
  }

  private async evaluateAnswerWithLLM(
    request: TutorEvaluationRequest,
    traceContext: TutorTraceContext,
  ): Promise<{rating: number, comment: string}> {
    const client = observeOpenAI(
      this.client,
      tutorLangfuseConfig(request, this.systemPrompt, traceContext),
    );
    const response = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt.compile() },
        { role: "user", content: request.llmPrompt },
      ],
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "answer_evaluation",
          strict: true,
          schema: {
            type: "object",
            properties: {
              rating: { type: "number" },
              comment: { type: "string" },
            },
            required: ["rating", "comment"],
            additionalProperties: false,
          },
        },
      },
    });

    if (!response.choices[0].message.content) {
      throw new Error("No response from the model");
    }

    return JSON.parse(response.choices[0].message.content) as {rating: number, comment: string};
  }

  public async evaluateAnswer(
    request: TutorEvaluationRequest,
    traceContext: TutorTraceContext = {},
  ): Promise<CheckResult> {
    return this.evaluateAnswerWithLLM(request, traceContext);
  }

}
