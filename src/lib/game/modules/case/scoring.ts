import type { CaseCard, CaseQuestion } from "@/types/card";
import { localAnswerMatch, normalizeCaseAnswer } from "@/lib/ai/case";
import type { CaseMark, CaseMatch, CaseScoredAnswer } from "@/types/session";

/**
 * Local scoring for case accusations (spec F16). Pure; shared by the reducer,
 * the play screen and the answer judge (#37).
 *
 * An answer scores locally when its normalised text equals the normalised
 * answer ("exact") or one of the accepted variants ("variant"). A blank
 * answer is wrong. Anything else is "unmatched": the group marks it (or the
 * judge pre-marks it when AI is configured).
 */

/**
 * Normalise an answer for comparison (accents, case, punctuation, a leading
 * article). Shared with the answer judge (#37) so the Worker and the play
 * screen agree on what is an exact or variant match.
 */
export const normalizeAnswer = normalizeCaseAnswer;

/** Local match for one answer, or null when the group/judge must decide. */
export function matchAnswer(
  question: CaseQuestion,
  answer: string | undefined
): Exclude<CaseMatch, "group" | "judge"> | null {
  return localAnswerMatch(question, answer);
}

/** Ids of questions whose answers need a group/judge decision. */
export function unmatchedQuestionIds(
  card: CaseCard,
  answers: Record<string, string>
): string[] {
  return card.questions
    .filter((q) => matchAnswer(q, answers[q.id]) === null)
    .map((q) => q.id);
}

/**
 * Per-question decision: the local match, else the mark, else null
 * (undecided).
 */
export function decideAnswer(
  question: CaseQuestion,
  answer: string | undefined,
  mark: CaseMark | undefined
): { correct: boolean; by: CaseMatch } | null {
  const local = matchAnswer(question, answer);
  if (local) return { correct: local !== "blank", by: local };
  if (mark) return { correct: mark.correct, by: mark.by };
  return null;
}

/**
 * Score the accusation. Returns null while any unmatched answer is still
 * unmarked.
 */
export function scoreAccusation(
  card: CaseCard,
  answers: Record<string, string>,
  marks: Record<string, CaseMark> = {}
): CaseScoredAnswer[] | null {
  const scored: CaseScoredAnswer[] = [];
  for (const q of card.questions) {
    const decision = decideAnswer(q, answers[q.id], marks[q.id]);
    if (!decision) return null;
    scored.push({
      questionId: q.id,
      correct: decision.correct,
      points: decision.correct ? q.points : 0,
      by: decision.by,
    });
  }
  return scored;
}

/** Team score (points) of a scored accusation. */
export function totalPoints(scored: readonly CaseScoredAnswer[]): number {
  return scored.reduce((sum, s) => sum + s.points, 0);
}

/** History outcome: every question right = solved, otherwise partial. */
export function caseOutcome(scored: readonly CaseScoredAnswer[]): "solved" | "partial" {
  return scored.length > 0 && scored.every((s) => s.correct) ? "solved" : "partial";
}
