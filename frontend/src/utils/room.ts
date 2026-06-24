import type { Chapter, RoomDetails } from "@study-platform/shared";
import { formatQuestionRef } from "@study-platform/shared";
import type { ChapterSession, ResponseEntry } from "../components/contest-types";

export function roomDetailsToChapterSession(
  data: RoomDetails,
): Pick<ChapterSession, "details" | "responses" | "revisions"> {
  const details: Chapter = {
    id: data.chapterId,
    number: data.number,
    name: data.name,
    theory: data.theory.map(({ question, answer }) => ({ question, answer })),
    practice: data.practice.map(({ task, description, solutions }) => ({
      task,
      description,
      solutions,
    })),
  };

  const responses: Record<string, ResponseEntry> = {};
  const revisions: Record<string, number> = {};

  data.theory.forEach((item, index) => {
    const id = formatQuestionRef("theory", index);
    revisions[id] = item.revision ?? 0;
    if (item.user_answer && item.rating !== undefined) {
      responses[id] = {
        answer: item.user_answer,
        result: {
          rating: item.rating,
          comment: item.comment ?? "",
        },
      };
    }
  });

  data.practice.forEach((item, index) => {
    const id = formatQuestionRef("practice", index);
    revisions[id] = item.revision ?? 0;
    if (item.user_answer && item.rating !== undefined) {
      responses[id] = {
        answer: item.user_answer,
        result: {
          rating: item.rating,
          comment: item.comment ?? "",
        },
      };
    }
  });

  return { details, responses, revisions };
}

export function mergeRoomDetailsIntoSession(
  session: ChapterSession,
  data: RoomDetails,
): ChapterSession {
  const mapped = roomDetailsToChapterSession(data);

  return {
    ...session,
    details: mapped.details,
    responses: mapped.responses,
    revisions: mapped.revisions,
  };
}
