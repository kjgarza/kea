import type { CaseCard, Evidence } from "@/types/card";
import type { Deck } from "@/types/deck";
import type {
  CaseMark,
  CaseNoteTab,
  CaseNotes,
  CaseSessionState,
} from "@/types/session";
import { countCompletedCards, createBaseSession } from "../stack";
import type { Progress, StartOptions } from "../types";
import { scoreAccusation, unmatchedQuestionIds } from "./scoring";

/**
 * Pure logic for case files (spec §4.4, F12–F17).
 *
 * The card stack decides "which case is next"; the per-case fields on the
 * session (`caseCardId`, `opened`, `notes`, `answers`, `marks`, `scored`)
 * hold the case being played. Phases are derived, not stored:
 *
 *   startedAt === null      → "cover"   (title + content warnings; F5)
 *   accusedAt === null      → "board"   (briefing, evidence, notes, answers)
 *   scored === undefined    → "review"  (accusation locked; group marks
 *                                         answers that did not match locally)
 *   otherwise               → "closed"  (walkthrough + team score)
 *
 * Actions that need a clock carry `at` (ISO) so the reducer stays pure.
 */

export type CaseAction =
  /** Leave the cover (warnings accepted) and open the case board. */
  | { type: "start"; at: string }
  /** Open an evidence item. No-op while it is locked (`unlockAfter`). */
  | { type: "open"; evidenceId: string }
  /** Autosaved note text for one tab. */
  | { type: "setNote"; tab: CaseNoteTab; text: string }
  /** Draft answer for one accusation question. */
  | { type: "setAnswer"; questionId: string; text: string }
  /** Submit the joint accusation (answers lock). */
  | { type: "accuse"; at: string }
  /** Back from the review to the board to change answers. */
  | { type: "editAnswers" }
  /**
   * Mark an unmatched answer right/wrong (`correct: null` clears it). The
   * group can always override a judge mark.
   */
  | { type: "mark"; questionId: string; correct: boolean | null; by?: CaseMark["by"] }
  /**
   * Answer judge (#37): pre-mark unmatched answers. Questions the group has
   * already marked, or that matched locally, are left alone.
   */
  | { type: "judgeMarks"; results: { questionId: string; correct: boolean }[] }
  /** Every answer is decided: score and reveal the walkthrough. */
  | { type: "reveal"; at: string }
  /** Close a scored case and move to the next one. */
  | { type: "next" }
  /** Abandon the current case (discarded, not recycled). */
  | { type: "skip" };

export type CasePhase = "cover" | "board" | "review" | "closed";

export const CASE_NOTE_TABS: readonly CaseNoteTab[] = ["suspects", "timeline", "free"];

/** Upper bounds that keep a saved session small. */
export const CASE_INPUT_LIMITS = { noteMaxChars: 10_000, answerMaxChars: 500 } as const;

export function emptyNotes(): CaseNotes {
  return { suspects: "", timeline: "", free: "" };
}

/** Per-case fields for a case that has not been opened yet. */
type CaseFields = Pick<
  CaseSessionState,
  | "caseCardId"
  | "startedAt"
  | "opened"
  | "notes"
  | "answers"
  | "accusedAt"
  | "marks"
  | "scored"
  | "endedAt"
>;

function freshCase(cardId: string | null): CaseFields {
  return {
    caseCardId: cardId,
    startedAt: null,
    opened: [],
    notes: emptyNotes(),
    answers: {},
    accusedAt: null,
    marks: {},
    scored: undefined,
    endedAt: null,
  };
}

export function createCaseSession(
  deck: Deck<CaseCard>,
  opts: StartOptions
): CaseSessionState {
  const base = createBaseSession(deck, opts);
  return { ...base, gameType: "case", ...freshCase(base.currentCardId) };
}

/**
 * The session with its per-case fields belonging to the current card.
 * Sessions saved before #35 (no `opened`/`notes`) or whose per-case fields
 * belong to another card are reset to a fresh case.
 */
export function normalizeCaseSession(session: CaseSessionState): CaseSessionState {
  const cardId = session.currentCardId;
  const matches =
    session.caseCardId === cardId &&
    Array.isArray(session.opened) &&
    typeof session.notes === "object" &&
    session.notes !== null &&
    typeof session.answers === "object" &&
    session.answers !== null;
  if (matches) return session;
  return { ...session, ...freshCase(cardId) };
}

export function casePhase(session: CaseSessionState): CasePhase {
  const s = normalizeCaseSession(session);
  if (!s.startedAt) return "cover";
  if (!s.accusedAt) return "board";
  if (!s.scored) return "review";
  return "closed";
}

function cardFor(session: CaseSessionState, deck: Deck<CaseCard>): CaseCard | null {
  if (!session.currentCardId) return null;
  return deck.cards.find((c) => c.cardId === session.currentCardId) ?? null;
}

function advance(session: CaseSessionState): CaseSessionState {
  const [nextCardId, ...rest] = session.remainingCardIds;
  const currentCardId = nextCardId ?? null;
  return {
    ...session,
    currentCardId,
    remainingCardIds: rest,
    isRevealed: false,
    ...freshCase(currentCardId),
  };
}

export function reduceCase(
  input: CaseSessionState,
  action: CaseAction,
  deck: Deck<CaseCard>
): CaseSessionState {
  if (!input.currentCardId) return input;
  const card = cardFor(input, deck);
  if (!card) return input;
  const session = normalizeCaseSession(input);
  const phase = casePhase(session);

  switch (action.type) {
    case "start":
      if (phase !== "cover") return input;
      return { ...session, startedAt: action.at };

    case "open": {
      if (phase === "cover") return input;
      if (session.opened.includes(action.evidenceId)) return input;
      const evidence = card.evidence.find((e) => e.id === action.evidenceId);
      if (!evidence || !isEvidenceUnlocked(evidence, session.opened)) return input;
      return { ...session, opened: [...session.opened, evidence.id] };
    }

    case "setNote": {
      if (phase === "cover" || !CASE_NOTE_TABS.includes(action.tab)) return input;
      const text = action.text.slice(0, CASE_INPUT_LIMITS.noteMaxChars);
      if (session.notes[action.tab] === text) return input;
      return { ...session, notes: { ...session.notes, [action.tab]: text } };
    }

    case "setAnswer": {
      if (phase !== "board") return input;
      if (!card.questions.some((q) => q.id === action.questionId)) return input;
      const text = action.text.slice(0, CASE_INPUT_LIMITS.answerMaxChars);
      if ((session.answers[action.questionId] ?? "") === text) return input;
      return { ...session, answers: { ...session.answers, [action.questionId]: text } };
    }

    case "accuse":
      if (phase !== "board") return input;
      return { ...session, accusedAt: action.at, marks: {} };

    case "editAnswers":
      if (phase !== "review") return input;
      return { ...session, accusedAt: null, marks: {} };

    case "mark": {
      if (phase !== "review") return input;
      if (!unmatchedQuestionIds(card, session.answers).includes(action.questionId)) {
        return input;
      }
      const marks = { ...(session.marks ?? {}) };
      if (action.correct === null) delete marks[action.questionId];
      else marks[action.questionId] = { correct: action.correct, by: action.by ?? "group" };
      return { ...session, marks };
    }

    case "judgeMarks": {
      if (phase !== "review") return input;
      const unmatched = new Set(unmatchedQuestionIds(card, session.answers));
      const marks = { ...(session.marks ?? {}) };
      let changed = false;
      for (const r of action.results) {
        if (!unmatched.has(r.questionId) || marks[r.questionId]) continue;
        marks[r.questionId] = { correct: r.correct, by: "judge" };
        changed = true;
      }
      return changed ? { ...session, marks } : input;
    }

    case "reveal": {
      if (phase !== "review") return input;
      const scored = scoreAccusation(card, session.answers, session.marks);
      if (!scored) return input;
      return { ...session, scored, endedAt: action.at };
    }

    case "next":
      if (phase !== "closed") return input;
      return advance(session);

    case "skip":
      if (phase === "closed") return input;
      return advance(session);
  }
}

/**
 * Whether `action` closes the case (a `reveal` that scores). Returns the
 * scored session so the view can write the history record.
 */
export function caseClosing(
  session: CaseSessionState,
  action: CaseAction,
  deck: Deck<CaseCard>
): CaseSessionState | null {
  if (action.type !== "reveal" || casePhase(session) !== "review") return null;
  const next = reduceCase(session, action, deck);
  return next.scored ? next : null;
}

/** Opened evidence of `card`, in the order the group opened it. */
export function openedEvidence(card: CaseCard, session: CaseSessionState): Evidence[] {
  const byId = new Map(card.evidence.map((e) => [e.id, e]));
  return normalizeCaseSession(session)
    .opened.map((id) => byId.get(id))
    .filter((e): e is Evidence => Boolean(e));
}

/**
 * Evidence ids still to open before `evidence` unlocks (empty when it is
 * already unlocked). Used for "Open X first".
 */
export function missingUnlocks(
  evidence: Evidence,
  openedIds: readonly string[]
): string[] {
  return (evidence.unlockAfter ?? []).filter((id) => !openedIds.includes(id));
}

export function isCaseComplete(session: CaseSessionState): boolean {
  return session.currentCardId === null && session.remainingCardIds.length === 0;
}

export function caseProgress(
  session: CaseSessionState,
  deck: Deck<CaseCard>
): Progress {
  const total = deck.cards.length;
  const remaining =
    session.remainingCardIds.length + (session.currentCardId ? 1 : 0);
  return {
    completed: countCompletedCards(total, remaining, 0),
    remaining,
    passed: 0,
    total,
  };
}

export function caseCardIds(session: CaseSessionState): string[] {
  return [
    ...session.remainingCardIds,
    ...session.passedCardIds,
    ...(session.currentCardId ? [session.currentCardId] : []),
  ];
}

/**
 * Whether an evidence item can be opened, given the ids opened so far: every
 * id in `unlockAfter` must already be open. Shared by the play screen (#35)
 * and the investigator (#37).
 */
export function isEvidenceUnlocked(
  evidence: Evidence,
  openedIds: ReadonlySet<string> | readonly string[]
): boolean {
  const opened = openedIds instanceof Set ? openedIds : new Set(openedIds);
  return (evidence.unlockAfter ?? []).every((id) => opened.has(id));
}

/** Total points available in a case (sum of its questions). */
export function caseMaxPoints(card: CaseCard): number {
  return card.questions.reduce((sum, q) => sum + q.points, 0);
}
