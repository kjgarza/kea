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

// Standard session (non-Monikers games)
export interface StandardSessionState extends BaseSessionState {
  gameType: Exclude<GameType, "monikers">;
}

// Union of all session types
export type SessionState = StandardSessionState | MonikersSessionState;

// Type guard for Monikers session
export function isMonikersSession(
  session: SessionState
): session is MonikersSessionState {
  return session.gameType === "monikers";
}

// Session storage key pattern
export const SESSION_KEY_PREFIX = "cg.session.";

export function getSessionKey(deckId: string): string {
  return `${SESSION_KEY_PREFIX}${deckId}`;
}

// Current schema version for migrations
export const CURRENT_SCHEMA_VERSION = 1;
