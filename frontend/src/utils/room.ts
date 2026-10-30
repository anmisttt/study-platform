import type { QuestionType, RoomAnswerFields, RoomChapterAnswers } from "@study-platform/shared";
import { formatQuestionRef } from "@study-platform/shared";
import type { ChapterSession, ResponseEntry } from "../components/contest-types";

export function mergeRoomAnswersIntoSession(
  session: ChapterSession,
  answers: RoomChapterAnswers,
): ChapterSession {
  const responses: Record<string, ResponseEntry> = {};
  const revisions: Record<string, number> = {};

  const collect = (type: QuestionType, items: (RoomAnswerFields | null)[]) => {
    items.forEach((item, index) => {
      if (!item) {
        return;
      }
      const id = formatQuestionRef(type, index);
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
  };
  collect("theory", answers.theory);
  collect("practice", answers.practice);

  return {
    ...session,
    responses,
    revisions,
  };
}
