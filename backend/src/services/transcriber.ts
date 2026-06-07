import { OpenAI, toFile } from "openai";

export class Transcriber {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor({apiKey, model}: {apiKey: string; model: string}) {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  private resolveExtension(mimeType?: string): string {
    if (!mimeType) return "wav";
    const [, subtype = "wav"] = mimeType.split("/");
    const cleanSubtype = subtype.split(";")[0]?.trim().toLowerCase();
    if (!cleanSubtype) return "wav";
    if (cleanSubtype.includes("mpeg")) return "mp3";
    if (cleanSubtype.includes("ogg")) return "ogg";
    if (cleanSubtype.includes("webm")) return "webm";
    return cleanSubtype;
  }

  public async transcribeAudio({
    audioBuffer,
    mimeType,
    language,
  }: {
    audioBuffer: Buffer;
    mimeType?: string;
    language?: string;
  }): Promise<string> {
    const startedAt = Date.now();
    const extension = this.resolveExtension(mimeType);

    try {
      const file = await toFile(audioBuffer, `microphone.${extension}`, {
        type: mimeType ?? "audio/wav",
      });
      const normalizedLanguage = language?.trim().toLowerCase();
      // eslint-disable-next-line no-console
      console.log(
        `[Transcriber] Starting inference (engine=openai, model=${this.model}, mime=${mimeType ?? "unknown"}, language=${normalizedLanguage ?? "auto"})`,
      );
      const transcription = await this.client.audio.transcriptions.create({
        model: this.model,
        file,
        ...(normalizedLanguage ? { language: normalizedLanguage } : {}),
      });
      const text = transcription.text.trim();

      // eslint-disable-next-line no-console
      console.log(
        `[Transcriber] Inference completed in ${Date.now() - startedAt}ms (textLength=${text.length})`,
      );
      return text;
    } catch (error: unknown) {
      // eslint-disable-next-line no-console
      console.error("[Transcriber] Inference failed", error);
      throw error;
    }
  }
}