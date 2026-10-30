import type { SituationCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import type {
  SituationMode,
  SituationOutcome,
  SituationPuzzleState,
  SituationSessionState,
} from "@/types/session";
import { localeFromLanguage } from "@/lib/i18n/translate";
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
  /** Play this puzzle (must be current or upcoming). */
  | { type: "pick"; cardId: string; at: string }
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
  /** Solved or gave up: ends the puzzle and shows the end screen. */
  | { type: "end"; outcome: SituationOutcome; at: string }
  /**
   * Discard the ended puzzle and move along the stack. With `toPicker` the
   * picker opens; otherwise the next puzzle starts right away.
   */
  | { type: "next"; at: string; toPicker?: boolean };

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
      return { ...moved, puzzle: newPuzzleState(card, action.at) };
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
