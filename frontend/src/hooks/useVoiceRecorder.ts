import { useCallback, useEffect, useRef, useState } from "react";
import { realtimeTranscriptionTokenPath } from "@study-platform/shared";

const OPENAI_REALTIME_CALLS_URL = "https://api.openai.com/v1/realtime/calls";

type UseVoiceRecorderOptions = {
  apiBase: string;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
  /** Optional stable id bound to the ephemeral token (e.g. roomId). */
  safetyIdentifier?: string;
};

type UseVoiceRecorderResult = {
  isListening: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
  toggle: () => void;
  stop: () => void;
};

type TranscriptionTokenResponse = {
  value?: string;
  expires_at?: number;
  error?: string;
};

type RealtimeServerEvent = {
  type?: string;
  transcript?: string;
  delta?: string;
};

export type RealtimeTranscriptAction =
  | { kind: "final"; text: string }
  | { kind: "partial" }
  | { kind: "ignore" };

export function applyRealtimeTranscriptionEvent(raw: string): RealtimeTranscriptAction {
  let event: RealtimeServerEvent;
  try {
    event = JSON.parse(raw) as RealtimeServerEvent;
  } catch {
    return { kind: "ignore" };
  }

  if (event.type === "conversation.item.input_audio_transcription.completed") {
    const text = event.transcript?.trim() ?? "";
    return text ? { kind: "final", text } : { kind: "ignore" };
  }

  if (
    event.type === "conversation.item.input_audio_transcription.delta" ||
    event.type === "input_audio_buffer.speech_started"
  ) {
    return { kind: "partial" };
  }

  return { kind: "ignore" };
}

function languageHintsFromNavigator(): string[] {
  const primary = (navigator.language || "en").split("-")[0]?.trim().toLowerCase();
  return primary ? [primary] : ["en"];
}

export function useVoiceRecorder({
  apiBase,
  onTranscript,
  onError,
  safetyIdentifier,
}: UseVoiceRecorderOptions): UseVoiceRecorderResult {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const apiBaseRef = useRef(apiBase);
  const safetyIdentifierRef = useRef(safetyIdentifier);
  const startGenerationRef = useRef(0);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
    apiBaseRef.current = apiBase;
    safetyIdentifierRef.current = safetyIdentifier;
  });

  const isSupported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof RTCPeerConnection !== "undefined";

  const cleanupSession = useCallback((): void => {
    const dataChannel = dataChannelRef.current;
    dataChannelRef.current = null;
    if (dataChannel) {
      try {
        dataChannel.close();
      } catch {
        // Ignore close races during teardown.
      }
    }

    const peerConnection = peerConnectionRef.current;
    peerConnectionRef.current = null;
    if (peerConnection) {
      try {
        peerConnection.getSenders().forEach((sender) => {
          sender.track?.stop();
        });
        peerConnection.close();
      } catch {
        // Ignore close races during teardown.
      }
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const handleRealtimeEvent = useCallback((raw: string): void => {
    const action = applyRealtimeTranscriptionEvent(raw);
    if (action.kind === "final") {
      setIsTranscribing(false);
      onTranscriptRef.current(action.text);
      return;
    }
    if (action.kind === "partial") {
      // Partials are intentionally not written into the collaborative draft.
      setIsTranscribing(true);
    }
  }, []);

  const stop = useCallback((): void => {
    startGenerationRef.current += 1;
    cleanupSession();
    setIsListening(false);
    setIsTranscribing(false);
  }, [cleanupSession]);

  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const start = useCallback(async (): Promise<void> => {
    if (!isSupported) {
      onErrorRef.current?.("Voice input is not supported in this browser.");
      return;
    }

    const generation = ++startGenerationRef.current;
    cleanupSession();

    try {
      setIsTranscribing(true);

      const tokenRes = await fetch(`${apiBaseRef.current}${realtimeTranscriptionTokenPath()}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          languages: languageHintsFromNavigator(),
          ...(safetyIdentifierRef.current
            ? { safetyIdentifier: safetyIdentifierRef.current }
            : {}),
        }),
      });
      const tokenPayload = (await tokenRes.json()) as TranscriptionTokenResponse;
      if (!tokenRes.ok || !tokenPayload.value) {
        throw new Error(tokenPayload.error ?? "Failed to create transcription token.");
      }

      if (generation !== startGenerationRef.current) {
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (generation !== startGenerationRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      mediaStreamRef.current = stream;

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const [audioTrack] = stream.getAudioTracks();
      if (!audioTrack) {
        throw new Error("No microphone audio track is available.");
      }
      pc.addTrack(audioTrack, stream);

      const dc = pc.createDataChannel("oai-events");
      dataChannelRef.current = dc;
      dc.addEventListener("message", (messageEvent) => {
        if (typeof messageEvent.data === "string") {
          handleRealtimeEvent(messageEvent.data);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch(OPENAI_REALTIME_CALLS_URL, {
        method: "POST",
        body: offer.sdp ?? "",
        headers: {
          Authorization: `Bearer ${tokenPayload.value}`,
          "Content-Type": "application/sdp",
        },
      });
      if (!sdpResponse.ok) {
        const errorText = await sdpResponse.text();
        throw new Error(errorText || "Failed to connect realtime transcription session.");
      }

      if (generation !== startGenerationRef.current) {
        cleanupSession();
        return;
      }

      const answer: RTCSessionDescriptionInit = {
        type: "answer",
        sdp: await sdpResponse.text(),
      };
      await pc.setRemoteDescription(answer);

      if (generation !== startGenerationRef.current) {
        cleanupSession();
        return;
      }

      setIsListening(true);
      setIsTranscribing(false);
    } catch (error: unknown) {
      if (generation !== startGenerationRef.current) {
        return;
      }
      cleanupSession();
      setIsListening(false);
      setIsTranscribing(false);
      onErrorRef.current?.(
        error instanceof Error ? error.message : "Failed to start voice transcription.",
      );
    }
  }, [cleanupSession, handleRealtimeEvent, isSupported]);

  const toggle = useCallback((): void => {
    if (isListening) {
      stop();
    } else {
      void start();
    }
  }, [isListening, start, stop]);

  useEffect(() => {
    return () => {
      stopRef.current();
    };
  }, []);

  return { isListening, isTranscribing, isSupported, toggle, stop };
}
