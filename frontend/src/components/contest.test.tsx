import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Contest from "./contest";
import type { RoomChapterAnswers, RoomSummary } from "@study-platform/shared";
import type { ChapterSession } from "./contest-types";
import { createInitialChapterSession } from "./contest-types";
import {
  API_BASE,
  chapterMeta,
  roomAnswersWith,
  sessionWithRoom,
} from "../test/fixtures";

vi.mock("../auth/context", () => ({ useAuth: () => ({ profile: { id: "owner" }, loading: false }) }));

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
  onRoomSnapshot: undefined as ((answers: RoomChapterAnswers) => void) | undefined,
  onRoomSummary: undefined as ((summary: RoomSummary) => void) | undefined,
  onRoomError: undefined as ((message: string) => void) | undefined,
  emitRoomSnapshot(answers: RoomChapterAnswers) {
    draftApi.onRoomSnapshot?.(answers);
  },
  emitRoomSummary(summary: RoomSummary) {
    draftApi.onRoomSummary?.(summary);
  },
  emitRoomError(message: string) {
    draftApi.onRoomError?.(message);
  },
  reset() {
    draftApi.answerInput = "";
    draftApi.isDraftHydrated = true;
    draftApi.isAnswerChecking = false;
    draftApi.onAnswerInputChange.mockClear();
    draftApi.appendDraftText.mockClear();
    draftApi.clearCollaborativeDraft.mockClear();
    draftApi.setAnswerChecking.mockClear();
    draftApi.clearLocalAnswerChecking.mockClear();
    draftApi.onRoomSnapshot = undefined;
    draftApi.onRoomSummary = undefined;
    draftApi.onRoomError = undefined;
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
  useCollaborativeDraft: (options: {
    onRoomSnapshot?: (answers: RoomChapterAnswers) => void;
    onRoomSummary?: (summary: RoomSummary) => void;
    onRoomError?: (message: string) => void;
  }) => {
    draftApi.onRoomSnapshot = options.onRoomSnapshot;
    draftApi.onRoomSummary = options.onRoomSummary;
    draftApi.onRoomError = options.onRoomError;
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
  hasOwnerLlmKey?: boolean;
  onQuestionNavigate?: (questionRef: string, roomId?: string) => void;
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
}: Omit<HarnessProps, "hasOwnerLlmKey">) {
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
  const { hasOwnerLlmKey = true, ...harnessProps } = props;
  const view = render(
    <ContestHarness
      {...harnessProps}
      onQuestionNavigate={onQuestionNavigate}
      onRoomAccessError={onRoomAccessError}
      onResetProgress={onResetProgress}
    />,
  );
  if (props.roomId) {
    act(() => {
      draftApi.emitRoomSummary({ roomId: props.roomId!, hasOwnerLlmKey, chapters: [] });
    });
  }
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
    fetchMock.mockResolvedValueOnce(jsonResponse({ roomId: "ABC123" }));

    const { onQuestionNavigate } = renderContest();

    fireEvent.click(screen.getByRole("button", { name: "Create a room" }));

    await waitFor(() => {
      expect(onQuestionNavigate).toHaveBeenCalledWith("theory-1", "ABC123");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/rooms`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("joins an existing room and navigates to the first question", async () => {
    const { onQuestionNavigate } = renderContest();

    fireEvent.change(screen.getByPlaceholderText("Room ID"), {
      target: { value: "ABC123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join room" }));

    expect(onQuestionNavigate).toHaveBeenCalledWith("theory-1", "ABC123");
    expect(fetch).not.toHaveBeenCalled();
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
      questionRef: "theory-1",
      initialSession: sessionWithRoom(),
    });

    expect(screen.getByRole("heading", { name: "Theory 1" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    await waitFor(() => {
      expectResultField(/Rating:/, "4/5");
    });
    expectResultField(/Your answer:/, "A process is a running program.");
    expectResultField(/Comment:/, "Solid answer.");
    expect(draftApi.clearCollaborativeDraft).toHaveBeenCalled();
    expect(draftApi.setAnswerChecking).not.toHaveBeenCalled();
    expect(voiceApi.stop).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      `${API_BASE}/rooms/ABC123/chapters/first_chapter/questions/theory-1/check`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          answer: "A process is a running program.",
          baseRevision: 0,
        }),
      }),
    );
  });

  it("posts Check to the practice question id currently shown", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rating: 5, comment: "Nice.", revision: 1 }),
    );

    draftApi.answerInput = "Use an atomic integer.";
    renderContest({
      roomId: "ABC123",
      questionRef: "practice-1",
      initialSession: sessionWithRoom(),
    });

    expect(screen.getByRole("heading", { name: "Practice 1" })).toBeTruthy();
    expect(screen.getByText("Implement a counter")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_BASE}/rooms/ABC123/chapters/first_chapter/questions/practice-1/check`,
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            answer: "Use an atomic integer.",
            baseRevision: 0,
          }),
        }),
      );
    });
    expectResultField(/Rating:/, "5/5");
  });

  it("does not post a theory check URL while viewing a practice question", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ rating: 5, comment: "ok", revision: 1 }),
    );

    draftApi.answerInput = "practice answer";
    renderContest({
      roomId: "ABC123",
      questionRef: "practice-1",
      initialSession: sessionWithRoom(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const checkCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/check"),
    );
    expect(checkCalls).toHaveLength(1);
    expect(String(checkCalls[0][0])).toBe(
      `${API_BASE}/rooms/ABC123/chapters/first_chapter/questions/practice-1/check`,
    );
    expect(String(checkCalls[0][0])).not.toContain("theory");
  });

  it("applies a 409 conflict room payload and alerts", async () => {
    const conflictRoom = roomAnswersWith({
      theoryAnswer: {
        answer: "Peer answer",
        rating: 5,
        comment: "Already graded.",
        revision: 2,
      },
    });
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ error: "Question was updated by someone else.", answers: conflictRoom }, 409),
    );

    draftApi.answerInput = "Stale local answer";
    renderContest({
      roomId: "ABC123",
      questionRef: "theory-1",
      initialSession: sessionWithRoom(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Check" }));

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalledWith("Question was updated by someone else.");
    });
    expect(draftApi.clearCollaborativeDraft).not.toHaveBeenCalled();
    expect(document.querySelector(".dot.rating-5")).toBeTruthy();

    expectResultField(/Rating:/, "5/5");
    expectResultField(/Your answer:/, "Peer answer");
    expect(screen.queryByRole("button", { name: /Show previous answer/ })).toBeNull();
  });

  it("merges and displays peer results received through the room connection", async () => {
    const peerRoom = roomAnswersWith({
      practiceAnswer: {
        answer: "Peer practice answer",
        rating: 3,
        comment: "From peer.",
        revision: 1,
      },
    });
    renderContest({
      roomId: "ABC123",
      questionRef: "practice-1",
      initialSession: sessionWithRoom(),
    });

    expect(document.querySelector(".dot.rating-3")).toBeNull();

    act(() => {
      draftApi.emitRoomSnapshot(peerRoom);
    });

    await waitFor(() => {
      expect(document.querySelector(".dot.rating-3")).toBeTruthy();
    });
    expect(fetch).not.toHaveBeenCalled();

    expectResultField(/Rating:/, "3/5");
    expectResultField(/Your answer:/, "Peer practice answer");
    expect(screen.queryByRole("button", { name: /Show (previous|reference) answer/ })).toBeNull();
  });

  it("keeps a peer check pending until its result arrives", async () => {
    draftApi.answerInput = "Peer draft";
    draftApi.isAnswerChecking = true;
    const view = renderContest({
      roomId: "ABC123",
      questionRef: "practice-1",
      initialSession: sessionWithRoom(),
    });

    expect(screen.getByRole("status")).toHaveTextContent("Checking answer...");

    draftApi.answerInput = "";
    draftApi.isAnswerChecking = false;
    view.rerender(
      <ContestHarness
        roomId="ABC123"
        questionRef="practice-1"
        initialSession={sessionWithRoom()}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Checking answer...");

    act(() => {
      draftApi.emitRoomSnapshot(
        roomAnswersWith({
          practiceAnswer: {
            answer: "Peer draft",
            rating: 4,
            comment: "Peer result.",
            revision: 1,
          },
        }),
      );
    });

    await waitFor(() => {
      expectResultField(/Rating:/, "4/5");
    });
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("returns to the editor when Try again is clicked", async () => {
    const answered = sessionWithRoom(
      roomAnswersWith({
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
      questionRef: "theory-1",
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

  it("resets the local editor preference when switching questions", async () => {
    const answered = sessionWithRoom(
      roomAnswersWith({
        theoryAnswer: {
          answer: "Prior answer",
          rating: 2,
          comment: "Needs work.",
          revision: 1,
        },
      }),
    );
    const view = renderContest({
      roomId: "ABC123",
      questionRef: "theory-1",
      initialSession: answered,
    });

    await waitFor(() => {
      expectResultField(/Rating:/, "2/5");
    });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByPlaceholderText("Type your answer in any language...")).toBeTruthy();

    view.rerender(
      <ContestHarness
        roomId="ABC123"
        questionRef="practice-1"
        initialSession={answered}
      />,
    );
    expect(screen.getByRole("heading", { name: "Practice 1" })).toBeTruthy();

    view.rerender(
      <ContestHarness
        roomId="ABC123"
        questionRef="theory-1"
        initialSession={answered}
      />,
    );
    expectResultField(/Rating:/, "2/5");
    expect(screen.queryByPlaceholderText("Type your answer in any language...")).toBeNull();
  });

  it("calls onResetProgress when Start again is clicked", () => {
    const { onResetProgress } = renderContest({
      roomId: "ABC123",
      questionRef: "theory-1",
      initialSession: sessionWithRoom(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Start again" }));

    expect(onResetProgress).toHaveBeenCalledTimes(1);
    expect(voiceApi.stop).toHaveBeenCalled();
  });

  it("navigates between questions while keeping the room id", () => {
    const { onQuestionNavigate } = renderContest({
      roomId: "ABC123",
      questionRef: "theory-1",
      initialSession: sessionWithRoom(),
    });

    fireEvent.click(screen.getByRole("button", { name: "Next question" }));
    expect(onQuestionNavigate).toHaveBeenCalledWith("practice-1", "ABC123");

    fireEvent.click(screen.getByRole("button", { name: "Open question 1" }));
    expect(onQuestionNavigate).toHaveBeenCalledWith("theory-1", "ABC123");
  });

  it("takes owner-key availability from the room summary", () => {
    renderContest({ roomId: "ABC123", questionRef: "theory-1", initialSession: sessionWithRoom(), hasOwnerLlmKey: false });
    expect(screen.getByText(/AI features need an OpenAI key/)).toBeTruthy();

    act(() => {
      draftApi.emitRoomSummary({ roomId: "ABC123", hasOwnerLlmKey: true, chapters: [] });
    });

    expect(screen.queryByText(/AI features need an OpenAI key/)).toBeNull();
  });

  it("hides the owner-key notice and keeps Check disabled until the room summary arrives", () => {
    draftApi.answerInput = "An answer";
    render(<ContestHarness roomId="ABC123" questionRef="theory-1" initialSession={sessionWithRoom()} />);

    expect(screen.queryByText(/AI features need an OpenAI key/)).toBeNull();
    expect(screen.getByRole("button", { name: "Check" })).toBeDisabled();
  });

  it("reports room access errors to the parent", async () => {
    const { onRoomAccessError } = renderContest({
      roomId: "MISSING",
      questionRef: "theory-1",
      initialSession: createInitialChapterSession(),
    });

    act(() => {
      draftApi.emitRoomError("Room not found.");
    });

    expect(onRoomAccessError).toHaveBeenCalledWith("Room not found.");
  });

  describe("read-only (no room)", () => {

    it("navigates between questions without a room id", () => {
      const { onQuestionNavigate } = renderContest({
        questionRef: "theory-1",
        initialSession: sessionWithRoom(),
      });

      fireEvent.click(screen.getByRole("button", { name: "Next question" }));
      expect(onQuestionNavigate).toHaveBeenCalledWith("practice-1", undefined);
    });

    it("opens the first question roomless from Browse questions", () => {
      const { onQuestionNavigate } = renderContest();

      fireEvent.click(screen.getByRole("button", { name: "Browse questions" }));
      expect(onQuestionNavigate).toHaveBeenCalledWith("theory-1", undefined);
      expect(fetch).not.toHaveBeenCalled();
    });

    it("hides the owner-key notice", () => {
      renderContest({ questionRef: "theory-1", initialSession: sessionWithRoom() });

      expect(screen.getByRole("button", { name: "Create a room" })).toBeTruthy();
      expect(screen.queryByText(/AI features need an OpenAI key/)).toBeNull();
    });

    it("shows the owner-key notice in a room without an owner key", () => {
      renderContest({
        roomId: "ABC123",
        questionRef: "theory-1",
        initialSession: sessionWithRoom(),
        hasOwnerLlmKey: false,
      });

      expect(screen.getByText(/AI features need an OpenAI key/)).toBeTruthy();
    });

    it("creates a room from the hint and stays on the same question", async () => {
      const fetchMock = vi.mocked(fetch);
      fetchMock.mockResolvedValueOnce(jsonResponse({ roomId: "NEW123" }));
      const { onQuestionNavigate } = renderContest({
        questionRef: "practice-1",
        initialSession: sessionWithRoom(),
      });

      fireEvent.click(screen.getByRole("button", { name: "Create a room" }));

      await waitFor(() => {
        expect(onQuestionNavigate).toHaveBeenCalledWith("practice-1", "NEW123");
      });
      expect(fetchMock).toHaveBeenCalledWith(
        `${API_BASE}/rooms`,
        expect.objectContaining({ method: "POST" }),
      );
    });

    it("shows room creation errors on the question view", async () => {
      vi.mocked(fetch).mockResolvedValueOnce(jsonResponse({ error: "Room limit reached." }, 400));
      renderContest({ questionRef: "theory-1", initialSession: sessionWithRoom() });

      fireEvent.click(screen.getByRole("button", { name: "Create a room" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Room limit reached.");
    });
  });

  it("disables Start again without a room", () => {
    renderContest({ questionRef: "theory-1", initialSession: sessionWithRoom() });

    expect(screen.getByRole("button", { name: "Start again" })).toBeDisabled();
  });

});
