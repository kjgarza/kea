import type { SituationCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import type {
  KeeperAnswer,
  SituationMode,
  SituationOutcome,
  SituationPuzzleState,
  SituationSessionState,
} from "@/types/session";
import { localeFromLanguage } from "@/lib/i18n/translate";
import { normalizeKeeperAnswer } from "@/lib/ai/answers";
import { KEEPER_LIMITS, THEORY_LIMITS } from "@/lib/ai/config";
import { toGradeResponse } from "@/lib/ai/grade";
import { countCompletedCards, createBaseSession } from "../stack";
import type { Progress, StartOptions } from "../types";

/**
 * Pure logic for situation puzzles (spec §4.4).
 *
 * The card stack decides "which puzzle is next"; `session.puzzle` holds the
 * state of the puzzle being played. Phases are derived, not stored:
 *
 *   puzzle === null                 → "picker"   (choose a puzzle)
 *   puzzle.startedAt === null       → "warnings" (content-warning interstitial)
 *   puzzle.outcome === null         → "playing"  (mode-specific panel)
 *   otherwise                       → "ended"    (end screen)
 *
 * Every action that needs a clock carries `at` (ISO string) so the reducer
 * stays pure; views pass `new Date().toISOString()`.
 */

export type SituationAction =
  /** Switch keeper mode. Only allowed from the picker (no puzzle in play). */
  | { type: "setMode"; mode: SituationMode }
  /**
   * Play this puzzle (must be current or upcoming). `mode`, when given, also
   * switches the keeper mode in the same step (the picker's mode toggle).
   */
  | { type: "pick"; cardId: string; at: string; mode?: SituationMode }
  /** Accept the content warnings and show the setup. */
  | { type: "acceptWarnings"; at: string }
  /** Leave the puzzle unplayed and go back to the picker. */
  | { type: "backToPicker" }
  /** Human keeper confirmed the reveal: show the crib sheet. */
  | { type: "revealSolution" }
  | { type: "toggleFact"; factId: string }
  /** Give the next hint on the ladder. */
  | { type: "useHint" }
  /** Question counter (+1 / undo). */
  | { type: "addQuestion" }
  | { type: "removeQuestion" }
  /**
   * AI / solo (#31): the keeper answered a question. Appends to the
   * transcript and adds the returned key-fact ids to `factsRevealed`.
   * `cardId` guards against a late answer landing on a different puzzle.
   */
  | {
      type: "recordAnswer";
      cardId: string;
      q: string;
      a: KeeperAnswer;
      factIds: string[];
      at: string;
    }
  /**
   * AI / solo (#32): the grader returned which key facts a theory gets
   * right. The verdict and missing count are recomputed from those ids with
   * the shared rules (src/lib/ai/grade.ts); unknown ids are dropped. Correct
   * facts count as found. A `solved` verdict ends the puzzle as solved.
   */
  | {
      type: "addTheory";
      cardId: string;
      text: string;
      correctFactIds: string[];
      at: string;
    }
  /** Solved or gave up: ends the puzzle and shows the end screen. */
  | { type: "end"; outcome: SituationOutcome; at: string }
  /**
   * Discard the ended puzzle and move along the stack. With `toPicker` the
   * picker opens; otherwise the next puzzle starts right away.
   */
  | { type: "next"; at: string; toPicker?: boolean };

const FACT_ANSWERS: ReadonlySet<KeeperAnswer> = new Set<KeeperAnswer>(["yes", "no", "partly"]);

export type SituationPhase = "picker" | "warnings" | "playing" | "ended";

export function createSituationSession(
  deck: Deck<SituationCard>,
  opts: StartOptions
): SituationSessionState {
  return {
    ...createBaseSession(deck, opts),
    gameType: "situation",
    mode: "human",
    language: localeFromLanguage(deck.language),
    puzzle: null,
  };
}

/** Sessions saved before #25 lack `puzzle`/`mode`; treat them as fresh. */
export function getPuzzle(session: SituationSessionState): SituationPuzzleState | null {
  return session.puzzle ?? null;
}

export function getMode(session: SituationSessionState): SituationMode {
  return session.mode ?? "human";
}

export function situationPhase(session: SituationSessionState): SituationPhase {
  const puzzle = getPuzzle(session);
  if (!puzzle) return "picker";
  if (puzzle.startedAt === null) return "warnings";
  if (puzzle.outcome === null) return "playing";
  return "ended";
}

/** Card IDs the picker offers: the current one first, then the rest of the stack. */
export function pickableCardIds(session: SituationSessionState): string[] {
  return [
    ...(session.currentCardId ? [session.currentCardId] : []),
    ...session.remainingCardIds,
  ];
}

export function newPuzzleState(
  card: SituationCard,
  at: string
): SituationPuzzleState {
  const hasWarnings = (card.contentWarnings ?? []).length > 0;
  return {
    cardId: card.cardId,
    startedAt: hasWarnings ? null : at,
    transcript: [],
    factsRevealed: [],
    hintsUsed: 0,
    solutionRevealed: false,
    theories: [],
    questionCount: 0,
    outcome: null,
    endedAt: null,
  };
}

function findCard(deck: Deck<SituationCard>, cardId: string | null) {
  if (!cardId) return null;
  return deck.cards.find((c) => c.cardId === cardId) ?? null;
}

/** Make `cardId` current, putting the previous current card back on top of the stack. */
function bringToFront(
  session: SituationSessionState,
  cardId: string
): SituationSessionState {
  if (session.currentCardId === cardId) return session;
  if (!session.remainingCardIds.includes(cardId)) return session;
  const rest = session.remainingCardIds.filter((id) => id !== cardId);
  return {
    ...session,
    currentCardId: cardId,
    remainingCardIds: session.currentCardId ? [session.currentCardId, ...rest] : rest,
  };
}

function updatePuzzle(
  session: SituationSessionState,
  update: (p: SituationPuzzleState) => SituationPuzzleState | null
): SituationSessionState {
  const puzzle = getPuzzle(session);
  // Only an active (started, not ended) puzzle accepts play actions.
  if (!puzzle || puzzle.startedAt === null || puzzle.outcome !== null) return session;
  const next = update(puzzle);
  return next && next !== puzzle ? { ...session, puzzle: next } : session;
}

export function reduceSituation(
  session: SituationSessionState,
  action: SituationAction,
  deck: Deck<SituationCard>
): SituationSessionState {
  if (!session.currentCardId) return session;
  const puzzle = getPuzzle(session);

  switch (action.type) {
    case "setMode":
      if (puzzle || getMode(session) === action.mode) return session;
      return { ...session, mode: action.mode };

    case "pick": {
      if (puzzle) return session;
      const card = findCard(deck, action.cardId);
      if (!card) return session;
      const moved = bringToFront(session, action.cardId);
      if (moved.currentCardId !== action.cardId) return session;
      const withMode = action.mode ? { ...moved, mode: action.mode } : moved;
      return { ...withMode, puzzle: newPuzzleState(card, action.at) };
    }

    case "acceptWarnings":
      if (!puzzle || puzzle.startedAt !== null) return session;
      return { ...session, puzzle: { ...puzzle, startedAt: action.at } };

    case "backToPicker":
      if (!puzzle || puzzle.outcome !== null) return session;
      return { ...session, puzzle: null };

    case "revealSolution":
      return updatePuzzle(session, (p) =>
        p.solutionRevealed ? p : { ...p, solutionRevealed: true }
      );

    case "toggleFact": {
      const card = findCard(deck, session.currentCardId);
      if (!card?.keyFacts.some((f) => f.id === action.factId)) return session;
      return updatePuzzle(session, (p) => ({
        ...p,
        factsRevealed: p.factsRevealed.includes(action.factId)
          ? p.factsRevealed.filter((id) => id !== action.factId)
          : [...p.factsRevealed, action.factId],
      }));
    }

    case "useHint": {
      const hintCount = findCard(deck, session.currentCardId)?.hints.length ?? 0;
      return updatePuzzle(session, (p) =>
        p.hintsUsed >= hintCount ? p : { ...p, hintsUsed: p.hintsUsed + 1 }
      );
    }

    case "addQuestion":
      return updatePuzzle(session, (p) => ({ ...p, questionCount: p.questionCount + 1 }));

    case "removeQuestion":
      return updatePuzzle(session, (p) =>
        p.questionCount === 0 ? p : { ...p, questionCount: p.questionCount - 1 }
      );

    case "recordAnswer": {
      const card = findCard(deck, session.currentCardId);
      if (!card || action.cardId !== card.cardId) return session;
      const q = action.q.trim().slice(0, KEEPER_LIMITS.questionMaxChars);
      if (!q) return session;
      const a = normalizeKeeperAnswer(action.a);
      // Only yes/no/partly can point at facts (same rule as the Worker), and
      // only ids that exist on this card count.
      const known = new Set(card.keyFacts.map((f) => f.id));
      const factIds = FACT_ANSWERS.has(a)
        ? [...new Set(action.factIds)].filter((id) => known.has(id))
        : [];
      return updatePuzzle(session, (p) => ({
        ...p,
        transcript: [...p.transcript, { q, a, factIds, at: action.at }],
        factsRevealed: [
          ...p.factsRevealed,
          ...factIds.filter((id) => !p.factsRevealed.includes(id)),
        ],
      }));
    }

    case "addTheory": {
      const card = findCard(deck, session.currentCardId);
      if (!card || action.cardId !== card.cardId) return session;
      const text = action.text.trim().slice(0, THEORY_LIMITS.theoryMaxChars);
      if (!text) return session;
      const grade = toGradeResponse(card, action.correctFactIds);
      return updatePuzzle(session, (p) => {
        const theorized: SituationPuzzleState = {
          ...p,
          theories: [...(p.theories ?? []), { text, ...grade, at: action.at }],
          factsRevealed: [
            ...p.factsRevealed,
            ...grade.correctFactIds.filter((id) => !p.factsRevealed.includes(id)),
          ],
        };
        return grade.verdict === "solved"
          ? { ...theorized, outcome: "solved", endedAt: action.at, solutionRevealed: true }
          : theorized;
      });
    }

    case "end":
      return updatePuzzle(session, (p) => ({
        ...p,
        outcome: action.outcome,
        endedAt: action.at,
        solutionRevealed: true,
      }));

    case "next": {
      if (!puzzle || puzzle.outcome === null) return session;
      const [nextCardId, ...rest] = session.remainingCardIds;
      const advanced: SituationSessionState = {
        ...session,
        currentCardId: nextCardId ?? null,
        remainingCardIds: rest,
        isRevealed: false,
        puzzle: null,
      };
      const nextCard = findCard(deck, advanced.currentCardId);
      if (action.toPicker || !nextCard) return advanced;
      return { ...advanced, puzzle: newPuzzleState(nextCard, action.at) };
    }
  }
}

/**
 * How the puzzle ends if `action` is applied, or null if it keeps going.
 * Covers `end` and a theory graded `solved`, so callers (history) record
 * every ending the same way.
 */
export function puzzleEnding(
  session: SituationSessionState,
  action: SituationAction,
  deck: Deck<SituationCard>
): { outcome: SituationOutcome; at: string } | null {
  if (situationPhase(session) !== "playing") return null;
  if (action.type !== "end" && action.type !== "addTheory") return null;
  const after = getPuzzle(reduceSituation(session, action, deck));
  if (!after?.outcome || !after.endedAt) return null;
  return { outcome: after.outcome, at: after.endedAt };
}

/** Questions asked so far: the human counter, or the AI transcript. */
export function questionsAsked(puzzle: SituationPuzzleState): number {
  return Math.max(puzzle.questionCount, puzzle.transcript.length);
}

/** Share of key facts found, 0..1. */
export function factProgress(puzzle: SituationPuzzleState, card: SituationCard): number {
  if (card.keyFacts.length === 0) return 0;
  const known = new Set(card.keyFacts.map((f) => f.id));
  const found = new Set(puzzle.factsRevealed.filter((id) => known.has(id)));
  return found.size / card.keyFacts.length;
}

/** Solo scoring (spec §3): start at 100, lose points per question and hint. */
export const SOLO_SCORE = {
  start: 100,
  perQuestion: 2,
  perHint: 10,
  /** Floor for a solved puzzle, so solving always beats giving up. */
  solvedMin: 10,
} as const;

/**
 * Solo score. While playing it is the score you would get by solving now;
 * once ended it is final (0 when the player gave up).
 */
export function soloScore(puzzle: SituationPuzzleState): number {
  if (puzzle.outcome === "gave_up") return 0;
  const raw =
    SOLO_SCORE.start -
    SOLO_SCORE.perQuestion * questionsAsked(puzzle) -
    SOLO_SCORE.perHint * puzzle.hintsUsed;
  return Math.max(SOLO_SCORE.solvedMin, raw);
}

/** Milliseconds played: from setup shown to end (or `now` while playing). */
export function puzzleElapsedMs(puzzle: SituationPuzzleState, now: number): number {
  if (!puzzle.startedAt) return 0;
  const start = Date.parse(puzzle.startedAt);
  const end = puzzle.endedAt ? Date.parse(puzzle.endedAt) : now;
  return Math.max(0, end - start);
}

/** "m:ss" or "h:mm:ss". */
export function formatElapsed(ms: number): string {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function isSituationComplete(session: SituationSessionState): boolean {
  return session.currentCardId === null && session.remainingCardIds.length === 0;
}

export function situationProgress(
  session: SituationSessionState,
  deck: Deck<SituationCard>
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

export function situationCardIds(session: SituationSessionState): string[] {
  return [
    ...session.remainingCardIds,
    ...session.passedCardIds,
    ...(session.currentCardId ? [session.currentCardId] : []),
  ];
}
