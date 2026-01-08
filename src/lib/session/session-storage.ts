import type { SessionState } from "@/types/session";
import { getSessionKey, SESSION_KEY_PREFIX } from "@/types/session";

/**
 * Load session from localStorage
 * Returns null if no session exists or if parsing fails
 */
export function loadSession(deckId: string): SessionState | null {
  if (typeof window === "undefined") return null;

  try {
    const key = getSessionKey(deckId);
    const data = localStorage.getItem(key);
    if (!data) return null;

    const session = JSON.parse(data) as SessionState;

    // Basic validation - ensure required fields exist
    if (!session.deckId || !session.deckVersion || !session.gameType) {
      console.warn("Invalid session data, clearing");
      clearSession(deckId);
      return null;
    }

    return session;
  } catch (error) {
    console.error("Failed to load session:", error);
    clearSession(deckId);
    return null;
  }
}

/**
 * Save session to localStorage
 */
export function saveSession(session: SessionState): void {
  if (typeof window === "undefined") return;

  try {
    const key = getSessionKey(session.deckId);
    localStorage.setItem(key, JSON.stringify(session));
  } catch (error) {
    console.error("Failed to save session:", error);
    // Could be quota exceeded - try to clear old sessions
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      clearOldSessions();
      // Retry once
      try {
        const key = getSessionKey(session.deckId);
        localStorage.setItem(key, JSON.stringify(session));
      } catch {
        console.error("Failed to save session after clearing old sessions");
      }
    }
  }
}

/**
 * Clear session from localStorage
 */
export function clearSession(deckId: string): void {
  if (typeof window === "undefined") return;

  try {
    const key = getSessionKey(deckId);
    localStorage.removeItem(key);
  } catch (error) {
    console.error("Failed to clear session:", error);
  }
}

/**
 * Check if a session exists for a deck
 */
export function hasSession(deckId: string): boolean {
  if (typeof window === "undefined") return false;

  const key = getSessionKey(deckId);
  return localStorage.getItem(key) !== null;
}

/**
 * List all saved session deck IDs
 */
export function listSavedSessions(): string[] {
  if (typeof window === "undefined") return [];

  const sessions: string[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(SESSION_KEY_PREFIX)) {
      sessions.push(key.replace(SESSION_KEY_PREFIX, ""));
    }
  }

  return sessions;
}

/**
 * Get count of saved sessions
 */
export function getSessionCount(): number {
  return listSavedSessions().length;
}

/**
 * Clear all game sessions from localStorage
 */
export function clearAllSessions(): void {
  if (typeof window === "undefined") return;

  const sessions = listSavedSessions();
  for (const deckId of sessions) {
    clearSession(deckId);
  }
}

/**
 * Clear old sessions to free up storage
 * Keeps the 10 most recently accessed sessions
 */
function clearOldSessions(): void {
  const sessions = listSavedSessions();

  // Sort by last access time if we had timestamps
  // For now, just keep first 10 and remove the rest
  const toRemove = sessions.slice(10);

  for (const deckId of toRemove) {
    clearSession(deckId);
  }
}

/**
 * Export all sessions as JSON (for backup/debug)
 */
export function exportSessions(): Record<string, SessionState> {
  const sessions = listSavedSessions();
  const result: Record<string, SessionState> = {};

  for (const deckId of sessions) {
    const session = loadSession(deckId);
    if (session) {
      result[deckId] = session;
    }
  }

  return result;
}

/**
 * Import sessions from JSON (for restore/debug)
 */
export function importSessions(data: Record<string, SessionState>): void {
  for (const [deckId, session] of Object.entries(data)) {
    if (session.deckId === deckId) {
      saveSession(session);
    }
  }
}
