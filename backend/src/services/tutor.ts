import type { CheckResult } from "@study-platform/shared";
import { OpenAI } from "openai";

export class Tutor {
  private readonly systemPrompt: string;
  private readonly model: string;
  private readonly temperature: number;
  private readonly maxTokens?: number;
  private readonly client: OpenAI;

  constructor({systemPrompt, model, apiKey, temperature, maxTokens}: {systemPrompt: string, model: string, apiKey: string, temperature: number, maxTokens?: number }) {
    this.systemPrompt = systemPrompt;
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.client = new OpenAI({ apiKey });
  }

  private async evaluateAnswerWithLLM(prompt: string): Promise<{rating: number, comment: string}> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: "system", content: this.systemPrompt },
        { role: "user", content: prompt },
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

  public async evaluateAnswer(prompt: string): Promise<CheckResult> {
    return this.evaluateAnswerWithLLM(prompt);
  }

}
