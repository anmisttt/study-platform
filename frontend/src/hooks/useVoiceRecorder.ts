import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_SEGMENT_SECONDS } from "@study-platform/shared";

// Preferred recording containers, in priority order. Explicitly selecting a
// supported type keeps browsers consistent: without this Firefox defaults to
// `audio/ogg`, which the server-side duration parser can choke on, while Chrome
// defaults to `audio/webm`. Forcing WebM/Opus (supported by both) makes the
// whole pipeline behave identically across browsers.
const PREFERRED_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
];

// Voice-activity-detection tuning.
const SILENCE_RMS_THRESHOLD = 0.015; // below this we treat the frame as silence
const PAUSE_MS = 1000; // silence this long (after speech) finalizes a segment
const MIN_SEGMENT_MS = 500; // ignore blips shorter than this
const VAD_INTERVAL_MS = 100; // how often we sample the microphone level

// Total recording length is unlimited. This only bounds a single segment so a
// pauseless monologue can't grow past the server/OpenAI per-upload cap: we cut
// a couple of seconds below the backend limit to stay safely under it.
const MAX_SEGMENT_MS = Math.max(1000, (MAX_SEGMENT_SECONDS - 2) * 1000);

type UseVoiceRecorderOptions = {
  apiBase: string;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
};

type UseVoiceRecorderResult = {
  isListening: boolean;
  isTranscribing: boolean;
  isSupported: boolean;
  toggle: () => void;
  stop: () => void;
};

type Segment = {
  hadSpeech: boolean;
  startedAt: number;
};

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }
  for (const candidate of PREFERRED_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return "";
}

function fileExtensionFromMimeType(mimeType: string): string {
  const [, subtype = "webm"] = mimeType.split("/");
  const cleanSubtype = subtype.split(";")[0]?.trim().toLowerCase();
  if (!cleanSubtype) {
    return "webm";
  }
  if (cleanSubtype.includes("mpeg")) {
    return "mp3";
  }
  if (cleanSubtype.includes("mp4")) {
    return "mp4";
  }
  return cleanSubtype;
}

export function useVoiceRecorder({
  apiBase,
  onTranscript,
  onError,
}: UseVoiceRecorderOptions): UseVoiceRecorderResult {
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const onTranscriptRef = useRef(onTranscript);
  const onErrorRef = useRef(onError);
  const apiBaseRef = useRef(apiBase);

  // Keep the latest callbacks/props available to the long-lived recording
  // closures without recreating them on every render.
  useEffect(() => {
    onTranscriptRef.current = onTranscript;
    onErrorRef.current = onError;
    apiBaseRef.current = apiBase;
  });

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const vadDataRef = useRef<Uint8Array | null>(null);
  const vadIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mimeTypeRef = useRef<string>("");

  const currentRecorderRef = useRef<MediaRecorder | null>(null);
  const currentSegmentRef = useRef<Segment | null>(null);
  const silenceStartRef = useRef<number | null>(null);

  // Sequential transcription queue so appended text stays in spoken order even
  // if network responses would otherwise arrive out of order.
  const queueRef = useRef<Blob[]>([]);
  const processingRef = useRef(false);

  const isSupported =
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof MediaRecorder !== "undefined";

  const transcribeBlob = useCallback(async (audioBlob: Blob): Promise<string> => {
    const formData = new FormData();
    const mimeType = audioBlob.type || mimeTypeRef.current || "audio/webm";
    const extension = fileExtensionFromMimeType(mimeType);
    formData.append("audio", audioBlob, `microphone.${extension}`);
    formData.append("language", (navigator.language || "en").split("-")[0]);

    const res = await fetch(`${apiBaseRef.current}/transcribe`, {
      method: "POST",
      body: formData,
    });
    const payload = (await res.json()) as { text?: string; error?: string };
    if (!res.ok) {
      throw new Error(payload.error ?? "Failed to transcribe audio.");
    }
    return payload.text?.trim() ?? "";
  }, []);

  const processQueue = useCallback(async (): Promise<void> => {
    if (processingRef.current) {
      return;
    }
    processingRef.current = true;
    setIsTranscribing(true);
    try {
      while (queueRef.current.length > 0) {
        const blob = queueRef.current.shift();
        if (!blob) {
          continue;
        }
        try {
          const text = await transcribeBlob(blob);
          if (text) {
            onTranscriptRef.current(text);
          }
        } catch (error: unknown) {
          onErrorRef.current?.(
            error instanceof Error ? error.message : "Failed to transcribe audio.",
          );
        }
      }
    } finally {
      processingRef.current = false;
      setIsTranscribing(false);
    }
  }, [transcribeBlob]);

  const enqueueTranscription = useCallback(
    (audioBlob: Blob): void => {
      queueRef.current.push(audioBlob);
      void processQueue();
    },
    [processQueue],
  );

  const startSegment = useCallback((): void => {
    const stream = mediaStreamRef.current;
    if (!stream) {
      return;
    }

    const options = mimeTypeRef.current ? { mimeType: mimeTypeRef.current } : undefined;
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, options);
    } catch {
      recorder = new MediaRecorder(stream);
    }

    const chunks: Blob[] = [];
    const segment: Segment = { hadSpeech: false, startedAt: Date.now() };

    recorder.ondataavailable = (event: BlobEvent) => {
      if (event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onstop = () => {
      const durationMs = Date.now() - segment.startedAt;
      const blob = new Blob(chunks, {
        type: recorder.mimeType || mimeTypeRef.current || "audio/webm",
      });
      if (segment.hadSpeech && blob.size > 0 && durationMs >= MIN_SEGMENT_MS) {
        enqueueTranscription(blob);
      }
    };

    currentSegmentRef.current = segment;
    currentRecorderRef.current = recorder;
    silenceStartRef.current = null;
    recorder.start();
  }, [enqueueTranscription]);

  const flushSegment = useCallback(
    (continueRecording: boolean): void => {
      const recorder = currentRecorderRef.current;
      currentRecorderRef.current = null;
      currentSegmentRef.current = null;
      silenceStartRef.current = null;

      if (recorder && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          // Ignore: a segment that fails to stop cleanly is simply dropped.
        }
      }

      // We only flush during silence, so restarting here loses no speech.
      if (continueRecording && mediaStreamRef.current) {
        startSegment();
      }
    },
    [startSegment],
  );

  const teardownAudioGraph = useCallback((): void => {
    if (vadIntervalRef.current !== null) {
      clearInterval(vadIntervalRef.current);
      vadIntervalRef.current = null;
    }
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    vadDataRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
  }, []);

  const stopStreamTracks = useCallback((): void => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stop = useCallback((): void => {
    teardownAudioGraph();
    // Finalize the in-flight segment (it may contain the last spoken words).
    flushSegment(false);
    stopStreamTracks();
    setIsListening(false);
  }, [teardownAudioGraph, flushSegment, stopStreamTracks]);

  const stopRef = useRef(stop);
  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const sampleVad = useCallback((): void => {
    const analyser = analyserRef.current;
    const data = vadDataRef.current;
    if (!analyser || !data) {
      return;
    }

    const segment = currentSegmentRef.current;
    const now = Date.now();

    // Safety net: force-cut a segment that has run too long without a natural
    // pause, so no single upload can exceed the per-segment/OpenAI size limit.
    if (segment?.hadSpeech && now - segment.startedAt >= MAX_SEGMENT_MS) {
      flushSegment(true);
      return;
    }

    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let index = 0; index < data.length; index += 1) {
      const centered = (data[index]! - 128) / 128;
      sumSquares += centered * centered;
    }
    const rms = Math.sqrt(sumSquares / data.length);

    if (rms >= SILENCE_RMS_THRESHOLD) {
      if (segment) {
        segment.hadSpeech = true;
      }
      silenceStartRef.current = null;
    } else if (segment?.hadSpeech) {
      if (silenceStartRef.current === null) {
        silenceStartRef.current = now;
      } else if (now - silenceStartRef.current >= PAUSE_MS) {
        // Speaker paused: finalize this segment and immediately keep listening.
        flushSegment(true);
      }
    }
  }, [flushSegment]);

  const start = useCallback(async (): Promise<void> => {
    if (!isSupported) {
      onErrorRef.current?.("Voice input is not supported in this browser.");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      onErrorRef.current?.("Microphone permission is required for voice input.");
      return;
    }

    mediaStreamRef.current = stream;
    mimeTypeRef.current = pickMimeType();

    try {
      const AudioContextCtor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextCtor) {
        const context = new AudioContextCtor();
        if (context.state === "suspended") {
          await context.resume().catch(() => undefined);
        }
        const source = context.createMediaStreamSource(stream);
        const analyser = context.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);
        audioContextRef.current = context;
        sourceRef.current = source;
        analyserRef.current = analyser;
        vadDataRef.current = new Uint8Array(analyser.fftSize);
      }
    } catch {
      // If Web Audio setup fails we still record; the segment is transcribed on stop.
      teardownAudioGraph();
    }

    setIsListening(true);
    startSegment();

    if (analyserRef.current) {
      vadIntervalRef.current = setInterval(sampleVad, VAD_INTERVAL_MS);
    }
  }, [isSupported, startSegment, sampleVad, teardownAudioGraph]);

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
