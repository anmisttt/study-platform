import { MAX_RECORDING_SECONDS } from "@study-platform/shared";
import { parseBuffer } from "music-metadata";
const DURATION_TOLERANCE_SECONDS = 1;

export class AudioDurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AudioDurationError";
  }
}

export async function assertMaxRecordingDuration(
  audioBuffer: Buffer,
  mimeType?: string,
  maxSeconds: number = MAX_RECORDING_SECONDS,
): Promise<number> {
  const metadata = await parseBuffer(audioBuffer, { mimeType: mimeType ?? "audio/webm" });
  const duration = metadata.format.duration;

  if (typeof duration !== "number" || !Number.isFinite(duration)) {
    throw new AudioDurationError("Could not determine audio duration.");
  }

  if (duration > maxSeconds + DURATION_TOLERANCE_SECONDS) {
    throw new AudioDurationError(`Audio exceeds maximum duration of ${maxSeconds} seconds.`);
  }

  return duration;
}
