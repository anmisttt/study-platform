import { MAX_SEGMENT_SECONDS } from "@study-platform/shared";
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
  maxSeconds: number = MAX_SEGMENT_SECONDS,
): Promise<number | null> {
  let duration: number | undefined;
  try {
    const metadata = await parseBuffer(audioBuffer, { mimeType: mimeType ?? "audio/webm" });
    duration = metadata.format.duration;
  } catch (error: unknown) {
    // Some browsers (e.g. Firefox) emit containers whose duration cannot be
    // parsed from the header. Don't block transcription over it — the client
    // already caps recording length and multer caps the upload size.
    // eslint-disable-next-line no-console
    console.warn("[AudioDuration] Could not parse audio metadata:", error);
    return null;
  }

  if (typeof duration !== "number" || !Number.isFinite(duration)) {
    return null;
  }

  if (duration > maxSeconds + DURATION_TOLERANCE_SECONDS) {
    throw new AudioDurationError(`Audio exceeds maximum duration of ${maxSeconds} seconds.`);
  }

  return duration;
}
