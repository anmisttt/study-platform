import { OpenAI } from "openai";

export type TranscriptionClientSecret = {
  value: string;
  expires_at: number;
};

export class Transcriber {
  private readonly client: OpenAI;

  constructor({ apiKey }: { apiKey: string }) {
    this.client = new OpenAI({ apiKey });
  }

  public async createTranscriptionClientSecret({
    languages,
    safetyIdentifier,
  }: {
    languages?: string[];
    safetyIdentifier?: string;
  } = {}): Promise<TranscriptionClientSecret> {
    const normalizedLanguages = (languages ?? [])
      .map((code) => code.trim().toLowerCase())
      .filter(Boolean);

    const response = await this.client.realtime.clientSecrets.create(
      {
        expires_after: {
          anchor: "created_at",
          seconds: 60,
        },
        session: {
          type: "transcription",
          audio: {
            input: {
              transcription: {
                model: "gpt-transcribe",
                ...(normalizedLanguages.length > 0
                  ? { languages: normalizedLanguages }
                  : {}),
              },
              turn_detection: {
                type: "server_vad",
                silence_duration_ms: 500,
              },
            },
          },
        },
      },
      safetyIdentifier
        ? {
            headers: {
              "OpenAI-Safety-Identifier": safetyIdentifier,
            },
          }
        : undefined,
    );

    return {
      value: response.value,
      expires_at: response.expires_at,
    };
  }
}
