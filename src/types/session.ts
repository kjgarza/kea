import type { GameType } from "./game";
import type { KeeperAnswer } from "../lib/ai/answers";

// Monikers round type (3 rounds total)
export type MonikersRound = 1 | 2 | 3;

// Base session state shared across all games
export interface BaseSessionState {
  schemaVersion: number;
  deckId: string;
  deckVersion: string;
  gameType: GameType;
  shuffleEnabled: boolean;
  shuffleSeed?: string; // Per-session nonce for reproducible shuffles across all rounds
  remainingCardIds: string[];
  passedCardIds: string[];
  currentCardId: string | null;
  isRevealed: boolean; // Only meaningful for Trivia
}

// Monikers-specific session extensions
export interface MonikersSessionState extends BaseSessionState {
  gameType: "monikers";
  monikersRound: MonikersRound;
  monikersRemainingCardIds: string[]; // Current round state
  monikersPassedCardIds: string[];
}

// Standard session (plain card-stack games)
export interface StandardSessionState extends BaseSessionState {
  gameType: Exclude<GameType, "monikers" | "situation">;
}

// Situation puzzles (spec §4.4): the card stack picks the next puzzle, and
// `puzzle` holds the state of the one being played (null = puzzle picker).
export type SituationMode = "human" | "ai" | "solo";

/** Fixed keeper answer vocabulary (spec §6.2); defined in src/lib/ai/answers.ts. */
export type { KeeperAnswer };

export type SituationOutcome = "solved" | "gave_up";

export interface SituationTranscriptEntry {
  q: string;
  a: KeeperAnswer;
  factIds: string[];
  at: string;
}

export interface SituationTheory {
  text: string;
  verdict: "solved" | "close" | "not_yet";
}

export interface SituationPuzzleState {
  /** The card being played (always equals the session's currentCardId). */
  cardId: string;
  /**
   * When the setup was first shown (ISO). Null while the content-warning
   * interstitial is waiting to be accepted (F5: warnings before the setup).
   */
  startedAt: string | null;
  /** AI/solo modes (#31): question/answer log. Empty in human mode. */
  transcript: SituationTranscriptEntry[];
  /** Key-fact ids found so far (human: ticked by the keeper). */
  factsRevealed: string[];
  hintsUsed: number;
  /** Human mode: the keeper confirmed the reveal and sees the crib sheet. */
  solutionRevealed: boolean;
  /** Solo mode (#32): submitted theories and their verdicts. */
  theories: SituationTheory[];
  /** Human mode: questions counted by the keeper (+1 button). */
  questionCount: number;
  /** Set when the puzzle ends (solved / gave up); drives the end screen. */
  outcome: SituationOutcome | null;
  endedAt: string | null;
}

export interface SituationSessionState extends BaseSessionState {
  gameType: "situation";
  mode: SituationMode;
  /** Session language (from the deck), used for keeper answers. */
  language: "en" | "es";
  puzzle: SituationPuzzleState | null;
}

// Union of all session types. New game types add their session state here
// and register a module in src/lib/game/modules/registry.ts.
export type SessionState =
  | StandardSessionState
  | MonikersSessionState
  | SituationSessionState;

// Session storage key pattern (logical key inside the `kea.` store, so the
// raw localStorage key is `kea.session.<deckId>`). Builds before the typed
// store used `cg.session.<deckId>`; those are migrated on first load.
export const SESSION_KEY_PREFIX = "session.";

export function getSessionKey(deckId: string): string {
  return `${SESSION_KEY_PREFIX}${deckId}`;
}

// Current schema version for migrations
export const CURRENT_SCHEMA_VERSION = 1;
