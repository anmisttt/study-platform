import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRealtimeTranscriptionEvent,
  TRANSCRIPTION_DRAIN_TIMEOUT_MS,
  useVoiceRecorder,
} from "./useVoiceRecorder";

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

class MockRTCDataChannel {
  readyState: RTCDataChannelState = "open";
  readonly send = vi.fn();
  readonly close = vi.fn(() => {
    this.readyState = "closed";
  });
  private readonly messageListeners: Array<(event: { data: string }) => void> = [];

  addEventListener(type: string, listener: (event: { data: string }) => void): void {
    if (type === "message") {
      this.messageListeners.push(listener);
    }
  }

  emit(data: string): void {
    for (const listener of this.messageListeners) {
      listener({ data });
    }
  }
}

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];

  readonly dataChannel = new MockRTCDataChannel();
  readonly close = vi.fn();
  private readonly senders: Array<{ track: { stop: ReturnType<typeof vi.fn> } | null }> = [];

  constructor() {
    MockRTCPeerConnection.instances.push(this);
  }

  static latest(): MockRTCPeerConnection {
    const peer = MockRTCPeerConnection.instances.at(-1);
    if (!peer) {
      throw new Error("No RTCPeerConnection was created.");
    }
    return peer;
  }

  addTrack(track: { stop: ReturnType<typeof vi.fn> }): void {
    this.senders.push({ track });
  }

  getSenders(): Array<{ track: { stop: ReturnType<typeof vi.fn> } | null }> {
    return this.senders;
  }

  createDataChannel(): MockRTCDataChannel {
    return this.dataChannel;
  }

  createOffer(): Promise<RTCSessionDescriptionInit> {
    return Promise.resolve({ type: "offer", sdp: "offer-sdp" });
  }

  setLocalDescription(): Promise<void> {
    return Promise.resolve();
  }

  setRemoteDescription(): Promise<void> {
    return Promise.resolve();
  }
}

type AudioTrackMock = {
  kind: string;
  stop: ReturnType<typeof vi.fn>;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function completedEvent(transcript: string): string {
  return JSON.stringify({
    type: "conversation.item.input_audio_transcription.completed",
    transcript,
  });
}

describe("useVoiceRecorder drain", () => {
  let audioTrack: AudioTrackMock;

  beforeEach(() => {
    MockRTCPeerConnection.instances = [];
    audioTrack = { kind: "audio", stop: vi.fn() };

    vi.stubGlobal("RTCPeerConnection", MockRTCPeerConnection);
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/realtime/transcription-token")) {
          return Promise.resolve(jsonResponse({ value: "ephemeral-token" }));
        }
        if (url.includes("/v1/realtime/calls")) {
          return Promise.resolve(new Response("answer-sdp", { status: 200 }));
        }
        return Promise.reject(new Error(`Unexpected fetch: ${url}`));
      }),
    );

    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: vi.fn(async () => ({
          getTracks: () => [audioTrack],
          getAudioTracks: () => [audioTrack],
        })),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function renderListeningRecorder(onTranscript = vi.fn()) {
    const hook = renderHook(() =>
      useVoiceRecorder({
        apiBase: "http://localhost/api",
        onTranscript,
      }),
    );

    await act(async () => {
      hook.result.current.toggle();
    });
    await waitFor(() => {
      expect(hook.result.current.isListening).toBe(true);
    });

    const peer = MockRTCPeerConnection.latest();
    return { hook, onTranscript, peer, dataChannel: peer.dataChannel };
  }

  it("stops the mic on toggle but keeps the realtime connection open and commits audio", async () => {
    const { hook, peer, dataChannel } = await renderListeningRecorder();

    act(() => {
      hook.result.current.toggle();
    });

    expect(hook.result.current.isListening).toBe(false);
    expect(hook.result.current.isTranscribing).toBe(true);
    expect(audioTrack.stop).toHaveBeenCalled();
    expect(dataChannel.send).toHaveBeenCalledWith(
      JSON.stringify({ type: "input_audio_buffer.commit" }),
    );
    expect(dataChannel.close).not.toHaveBeenCalled();
    expect(peer.close).not.toHaveBeenCalled();
  });

  it("applies the last transcript then closes the connection", async () => {
    const { hook, onTranscript, peer, dataChannel } = await renderListeningRecorder();

    act(() => {
      hook.result.current.toggle();
    });
    act(() => {
      dataChannel.emit(completedEvent(" last chunk "));
    });

    expect(onTranscript).toHaveBeenCalledWith("last chunk");
    expect(hook.result.current.isTranscribing).toBe(false);
    expect(dataChannel.close).toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
  });

  it("closes the connection after the drain timeout if no transcript arrives", async () => {
    const { hook, onTranscript, peer, dataChannel } = await renderListeningRecorder();

    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    act(() => {
      hook.result.current.toggle();
    });

    act(() => {
      vi.advanceTimersByTime(TRANSCRIPTION_DRAIN_TIMEOUT_MS - 1);
    });
    expect(dataChannel.close).not.toHaveBeenCalled();
    expect(peer.close).not.toHaveBeenCalled();
    expect(hook.result.current.isTranscribing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(onTranscript).not.toHaveBeenCalled();
    expect(hook.result.current.isTranscribing).toBe(false);
    expect(dataChannel.close).toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
  });

  it("closes the connection immediately when stop() is called", async () => {
    const { hook, peer, dataChannel } = await renderListeningRecorder();

    act(() => {
      hook.result.current.stop();
    });

    expect(hook.result.current.isListening).toBe(false);
    expect(hook.result.current.isTranscribing).toBe(false);
    expect(dataChannel.close).toHaveBeenCalled();
    expect(peer.close).toHaveBeenCalled();
    expect(dataChannel.send).not.toHaveBeenCalled();
  });
});
