import type { GameType } from "./game";

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

// Situation puzzles: the card stack picks the next puzzle. Per-puzzle state
// (mode, transcript, facts, hints, reveal — spec §4.4) is added with the
// keeper screen (#25).
export interface SituationSessionState extends BaseSessionState {
  gameType: "situation";
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
