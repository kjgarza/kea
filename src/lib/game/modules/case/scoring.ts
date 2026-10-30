import type { CaseCard, CaseQuestion } from "@/types/card";
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

/** Leading articles dropped before comparing (EN + ES). */
const LEADING_ARTICLES = new Set([
  "the", "a", "an",
  "el", "la", "los", "las", "un", "una", "unos", "unas",
]);

/**
 * Normalise an answer for comparison: Unicode-decompose and drop accents,
 * lower-case, turn punctuation into spaces, collapse whitespace and drop a
 * leading article ("The coach" == "coach", "Él" == "el").
 */
export function normalizeAnswer(text: string): string {
  const words = text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
  if (words.length > 1 && LEADING_ARTICLES.has(words[0])) words.shift();
  return words.join(" ");
}

/** Local match for one answer, or null when the group/judge must decide. */
export function matchAnswer(
  question: CaseQuestion,
  answer: string | undefined
): Exclude<CaseMatch, "group" | "judge"> | null {
  const given = normalizeAnswer(answer ?? "");
  if (!given) return "blank";
  if (given === normalizeAnswer(question.answer)) return "exact";
  if (question.acceptedVariants.some((v) => normalizeAnswer(v) === given)) return "variant";
  return null;
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
