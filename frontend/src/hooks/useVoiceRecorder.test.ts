import { describe, expect, it } from "vitest";
import { applyRealtimeTranscriptionEvent } from "./useVoiceRecorder";

describe("applyRealtimeTranscriptionEvent", () => {
  it("returns final text for completed transcription events", () => {
    expect(
      applyRealtimeTranscriptionEvent(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "  Hello world  ",
        }),
      ),
    ).toEqual({ kind: "final", text: "Hello world" });
  });

  it("ignores completed events with empty transcripts", () => {
    expect(
      applyRealtimeTranscriptionEvent(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.completed",
          transcript: "   ",
        }),
      ),
    ).toEqual({ kind: "ignore" });
  });

  it("marks delta and speech-start events as partial without draft text", () => {
    expect(
      applyRealtimeTranscriptionEvent(
        JSON.stringify({
          type: "conversation.item.input_audio_transcription.delta",
          delta: "Hel",
        }),
      ),
    ).toEqual({ kind: "partial" });

    expect(
      applyRealtimeTranscriptionEvent(
        JSON.stringify({
          type: "input_audio_buffer.speech_started",
        }),
      ),
    ).toEqual({ kind: "partial" });
  });

  it("ignores unrelated or invalid payloads", () => {
    expect(applyRealtimeTranscriptionEvent("not-json")).toEqual({ kind: "ignore" });
    expect(
      applyRealtimeTranscriptionEvent(
        JSON.stringify({ type: "session.created" }),
      ),
    ).toEqual({ kind: "ignore" });
  });
});
