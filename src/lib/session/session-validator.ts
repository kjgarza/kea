import type { SessionState } from "@/types/session";
import type { Deck } from "@/types/deck";
import { CURRENT_SCHEMA_VERSION, isMonikersSession } from "@/types/session";

export type ValidationReason =
  | "version_mismatch"
  | "schema_outdated"
  | "cards_changed"
  | "game_type_mismatch";

export interface ValidationResult {
  isValid: boolean;
  reason?: ValidationReason;
  message?: string;
}

/**
 * Validate a session against a deck
 * Checks if the session is still valid for resuming play
 */
export function validateSessionAgainstDeck(
  session: SessionState,
  deck: Deck
): ValidationResult {
  // Check schema version
  if (session.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return {
      isValid: false,
      reason: "schema_outdated",
      message: `Session schema version ${session.schemaVersion} does not match current version ${CURRENT_SCHEMA_VERSION}`,
    };
  }

  // Check deck version mismatch
  if (session.deckVersion !== deck.version) {
    return {
      isValid: false,
      reason: "version_mismatch",
      message: "The deck has been updated since this session was saved",
    };
  }

  // Check game type matches
  if (session.gameType !== deck.gameType) {
    return {
      isValid: false,
      reason: "game_type_mismatch",
      message: `Session game type ${session.gameType} does not match deck game type ${deck.gameType}`,
    };
  }

  // Verify all card IDs in session exist in deck
  const deckCardIds = new Set(deck.cards.map((c) => c.cardId));

  // Collect all card IDs from session
  const sessionCardIds = [
    ...session.remainingCardIds,
    ...session.passedCardIds,
    ...(session.currentCardId ? [session.currentCardId] : []),
  ];

  // For Monikers, also check round-specific card IDs
  if (isMonikersSession(session)) {
    sessionCardIds.push(
      ...session.monikersRemainingCardIds,
      ...session.monikersPassedCardIds
    );
  }

  // Check each card ID exists in deck
  for (const cardId of sessionCardIds) {
    if (!deckCardIds.has(cardId)) {
      return {
        isValid: false,
        reason: "cards_changed",
        message: `Card ${cardId} from session no longer exists in deck`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Check if a session can be migrated to the current schema
 * Returns true if migration is possible, false if session must be discarded
 */
export function canMigrateSession(session: SessionState): boolean {
  // Currently no migrations supported - only exact version match
  return session.schemaVersion === CURRENT_SCHEMA_VERSION;
}

/**
 * Migrate a session to the current schema version
 * Returns null if migration is not possible
 */
export function migrateSession(
  session: SessionState
): SessionState | null {
  if (session.schemaVersion === CURRENT_SCHEMA_VERSION) {
    return session;
  }

  // Future: Add migration logic here when schema changes
  // For now, return null to indicate migration not possible
  return null;
}

/**
 * Validate session state integrity
 * Checks for internal consistency (e.g., no duplicate card IDs)
 */
export function validateSessionIntegrity(session: SessionState): ValidationResult {
  const allCardIds = [
    ...session.remainingCardIds,
    ...session.passedCardIds,
    ...(session.currentCardId ? [session.currentCardId] : []),
  ];

  if (isMonikersSession(session)) {
    allCardIds.push(
      ...session.monikersRemainingCardIds,
      ...session.monikersPassedCardIds
    );
  }

  // Check for duplicates
  const seen = new Set<string>();
  for (const cardId of allCardIds) {
    if (seen.has(cardId)) {
      return {
        isValid: false,
        reason: "cards_changed",
        message: `Duplicate card ID found: ${cardId}`,
      };
    }
    seen.add(cardId);
  }

  return { isValid: true };
}
