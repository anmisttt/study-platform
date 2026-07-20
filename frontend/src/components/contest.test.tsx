import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Contest from "./contest";
import type { ChapterSession } from "./contest-types";
import { createInitialChapterSession } from "./contest-types";
import {
  API_BASE,
  chapterMeta,
  roomDetails,
  roomDetailsWithAnswer,
  sessionWithRoom,
} from "../test/fixtures";

const draftApi = vi.hoisted(() => ({
  answerInput: "",
  isDraftHydrated: true,
  isAnswerChecking: false,
  onAnswerInputChange: vi.fn((value: string) => {
    draftApi.answerInput = value;
  }),
  appendDraftText: vi.fn(),
  clearCollaborativeDraft: vi.fn(() => {
    draftApi.answerInput = "";
  }),
  setAnswerChecking: vi.fn((checking: boolean) => {
    draftApi.isAnswerChecking = checking;
  }),
  clearLocalAnswerChecking: vi.fn(() => {
    draftApi.isAnswerChecking = false;
  }),
  reset() {
    draftApi.answerInput = "";
    draftApi.isDraftHydrated = true;
    draftApi.isAnswerChecking = false;
    draftApi.onAnswerInputChange.mockClear();
    draftApi.appendDraftText.mockClear();
    draftApi.clearCollaborativeDraft.mockClear();
    draftApi.setAnswerChecking.mockClear();
    draftApi.clearLocalAnswerChecking.mockClear();
  },
}));

const voiceApi = vi.hoisted(() => ({
  toggle: vi.fn(),
  stop: vi.fn(),
  reset() {
    voiceApi.toggle.mockClear();
    voiceApi.stop.mockClear();
  },
}));

vi.mock("../hooks/useCollaborativeDraft", () => ({
  useCollaborativeDraft: () => {
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    return {
      get answerInput() {
        return draftApi.answerInput;
      },
      get isDraftHydrated() {
        return draftApi.isDraftHydrated;
      },
      get isAnswerChecking() {
        return draftApi.isAnswerChecking;
      },
      textareaRef,
      onAnswerInputChange: (value: string) => {
        draftApi.onAnswerInputChange(value);
      },
      appendDraftText: draftApi.appendDraftText,
      clearCollaborativeDraft: () => {
        draftApi.clearCollaborativeDraft();
      },
      setAnswerChecking: (checking: boolean) => {
        draftApi.setAnswerChecking(checking);
      },
      clearLocalAnswerChecking: () => {
        draftApi.clearLocalAnswerChecking();
      },
    };
  },
}));

vi.mock("../hooks/useVoiceRecorder", () => ({
  useVoiceRecorder: () => ({
    isListening: false,
    isTranscribing: false,
    isSupported: true,
    toggle: voiceApi.toggle,
    stop: voiceApi.stop,
  }),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

type HarnessProps = {
  roomId?: string | null;
  questionRef?: string;
  initialSession?: ChapterSession;
  initialError?: string;
  onQuestionNavigate?: (questionRef: string, roomId: string) => void;
  onRoomAccessError?: (message: string) => void;
  onResetProgress?: () => void;
};

function ContestHarness({
  roomId = null,
  questionRef,
  initialSession = createInitialChapterSession(),
  initialError = "",
  onQuestionNavigate = vi.fn(),
  onRoomAccessError = vi.fn(),
  onResetProgress = vi.fn(),
}: HarnessProps) {
  const [session, setSession] = useState(initialSession);

  return (
    <Contest
      chapterMeta={chapterMeta}
      chapterSession={session}
      apiBase={API_BASE}
      roomId={roomId}
      questionRef={questionRef}
      initialError={initialError}
      onQuestionNavigate={onQuestionNavigate}
      onRoomAccessError={onRoomAccessError}
      onSessionChange={(updater) => {
        setSession((current) => updater(current));
      }}
      onResetProgress={onResetProgress}
    />
  );
}

function renderContest(props: HarnessProps = {}) {
  const onQuestionNavigate = props.onQuestionNavigate ?? vi.fn();
  const onRoomAccessError = props.onRoomAccessError ?? vi.fn();
  const onResetProgress = props.onResetProgress ?? vi.fn();
  const view = render(
    <ContestHarness
      {...props}
      onQuestionNavigate={onQuestionNavigate}
      onRoomAccessError={onRoomAccessError}
      onResetProgress={onResetProgress}
    />,
  );
  return { ...view, onQuestionNavigate, onRoomAccessError, onResetProgress };
}

function expectResultField(label: RegExp, value: string | RegExp) {
  expect(screen.getByText(label).parentElement).toHaveTextContent(value);
}

describe("Contest", () => {
  beforeEach(() => {
    draftApi.reset();
    voiceApi.reset();
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("Unexpected fetch"))),
    );
    vi.stubGlobal("alert", vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("creates a room and navigates to the first question", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ roomId: "ABC123" }))
      .mockResolvedValueOnce(jsonResponse(roomDetails));

    const { onQuestionNavigate } = renderContest();

    fireEvent.click(screen.getByRole("button", { name: "Generate new room" }));

    await waitFor(() => {
      expect(onQuestionNavigate).toHaveBeenCalledWith("theory-0", "ABC123");
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      `${API_BASE}/rooms`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ chapterId: chapterMeta.id }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      `${API_BASE}/rooms/ABC123?chapterId=${encodeURIComponent(chapterMeta.id)}`,
    );
  });

  it("joins an existing room and navigates to the first question", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(roomDetails));

    const { onQuestionNavigate } = renderContest();

    fireEvent.change(screen.getByPlaceholderText("Room ID..."), {
      target: { value: "ABC123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join room" }));

    await waitFor(() => {
      expect(onQuestionNavigate).toHaveBeenCalledWith("theory-0", "ABC123");
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/rooms/ABC123?chapterId=${encodeURIComponent(chapterMeta.id)}`,
    );
  });

  it("shows an error when join is submitted without a room id", async () => {
    renderContest();

    fireEvent.click(screen.getByRole("button", { name: "Join room" }));

    expect(await screen.findByText("Enter a room ID to join.")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("checks an answer, clears the draft, and shows the rating", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rating: 4, comment: "Solid answer.", revision: 1 }),
    );

    draftApi.answerInput = "A process is a running program.";
    renderContest({
      roomId: "ABC123",
      questionRef: "theory-0",
      initialSession: sessionWithRoom(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    await waitFor(() => {
      expectResultField(/Rating:/, "4/5");
    });
    expectResultField(/Your answer:/, "A process is a running program.");
    expectResultField(/Comment:/, "Solid answer.");
    expect(draftApi.clearCollaborativeDraft).toHaveBeenCalled();
    expect(draftApi.setAnswerChecking).toHaveBeenCalledWith(true);
    expect(draftApi.setAnswerChecking).toHaveBeenCalledWith(false);
    expect(voiceApi.stop).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/rooms/ABC123/questions/theory/0/check`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          answer: "A process is a running program.",
          baseRevision: 0,
        }),
      }),
    );
  });

  it("applies a 409 conflict room payload and alerts", async () => {
    const conflictRoom = roomDetailsWithAnswer({
      theoryAnswer: {
        answer: "Peer answer",
        rating: 5,
        comment: "Already graded.",
        revision: 2,
      },
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Question was updated by someone else.", room: conflictRoom }, 409),
    );

    draftApi.answerInput = "Stale local answer";
    renderContest({
      roomId: "ABC123",
      questionRef: "theory-0",
      initialSession: sessionWithRoom(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith("Question was updated by someone else.");
    });
    expect(draftApi.clearCollaborativeDraft).not.toHaveBeenCalled();
    expect(document.querySelector(".dot.rating-5")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Show previous answer/ }));
    expectResultField(/Rating:/, "5/5");
    expectResultField(/Your answer:/, "Peer answer");
  });

  it("polls the room and merges peer results into progress", async () => {
    const peerRoom = roomDetailsWithAnswer({
      practiceAnswer: {
        answer: "Peer practice answer",
        rating: 3,
        comment: "From peer.",
        revision: 1,
      },
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(jsonResponse(peerRoom));

    const pollCallbacks: Array<() => void> = [];
    vi.spyOn(window, "setInterval").mockImplementation(((handler: TimerHandler, timeout?: number) => {
      if (timeout === 5000 && typeof handler === "function") {
        pollCallbacks.push(handler as () => void);
      }
      return 0 as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);

    renderContest({
      roomId: "ABC123",
      questionRef: "practice-0",
      initialSession: sessionWithRoom(),
    });

    expect(document.querySelector(".dot.rating-3")).toBeNull();
    expect(pollCallbacks.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      pollCallbacks[0]!();
    });

    await waitFor(() => {
      expect(document.querySelector(".dot.rating-3")).toBeTruthy();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/rooms/ABC123?chapterId=${encodeURIComponent(chapterMeta.id)}`,
    );

    fireEvent.click(screen.getByRole("button", { name: /Show (previous|reference) answer/ }));
    expectResultField(/Rating:/, "3/5");
    expectResultField(/Your answer:/, "Peer practice answer");
  });

  it("returns to the editor when Try again is clicked", async () => {
    const answered = sessionWithRoom(
      roomDetailsWithAnswer({
        theoryAnswer: {
          answer: "Prior answer",
          rating: 2,
          comment: "Needs work.",
          revision: 1,
        },
      }),
    );
    draftApi.answerInput = "";
    draftApi.isDraftHydrated = true;

    renderContest({
      roomId: "ABC123",
      questionRef: "theory-0",
      initialSession: answered,
    });

    await waitFor(() => {
      expectResultField(/Rating:/, "2/5");
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByPlaceholderText("Type your answer in any language...")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check" })).toBeTruthy();
    expect(voiceApi.stop).toHaveBeenCalled();
  });

  it("calls onResetProgress when Start again is clicked", () => {
    const { onResetProgress } = renderContest({
      roomId: "ABC123",
      questionRef: "theory-0",
      initialSession: sessionWithRoom(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Start again" }));

    expect(onResetProgress).toHaveBeenCalledTimes(1);
    expect(voiceApi.stop).toHaveBeenCalled();
  });

  it("navigates between questions while keeping the room id", () => {
    const { onQuestionNavigate } = renderContest({
      roomId: "ABC123",
      questionRef: "theory-0",
      initialSession: sessionWithRoom(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(onQuestionNavigate).toHaveBeenCalledWith("practice-0", "ABC123");

    fireEvent.click(screen.getByRole("button", { name: "Open question 1" }));
    expect(onQuestionNavigate).toHaveBeenCalledWith("theory-0", "ABC123");
  });

  it("loads room details when practice starts without a cached session", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse(roomDetails));

    renderContest({
      roomId: "ABC123",
      questionRef: "theory-0",
      initialSession: createInitialChapterSession(),
    });

    expect(screen.getByText("Loading room questions...")).toBeTruthy();

    expect(await screen.findByText("Theory 1")).toBeTruthy();
    expect(screen.getByText("What is a process?")).toBeTruthy();
    expect(within(screen.getByText(/Room ID:/).parentElement as HTMLElement).getByText("ABC123")).toBeTruthy();
  });

  it("reports room access errors to the parent", async () => {
    const fetchMock = vi.mocked(fetch);
    // Keep the follow-up sync from clearing the error before the effect runs.
    fetchMock.mockImplementation(() => new Promise(() => {}));

    const { onRoomAccessError } = renderContest({
      roomId: "MISSING",
      questionRef: "theory-0",
      initialSession: {
        ...createInitialChapterSession(),
        error: "Room not found.",
      },
    });

    await waitFor(() => {
      expect(onRoomAccessError).toHaveBeenCalledWith("Room not found.");
    });
  });
});
