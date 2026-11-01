import type { SessionState } from "@/types/session";
import { SESSION_KEY_PREFIX } from "@/types/session";
import { defineStoredCollection, getStore } from "@/lib/storage";

/**
 * Game sessions, one per deck, stored at `kea.session.<deckId>`.
 *
 * Envelope version 1 holds a SessionState exactly as before the typed store
 * existed (the session's own `schemaVersion` field is unchanged), so legacy
 * `cg.session.*` values are copied across as-is.
 */
const SESSION_STORAGE_VERSION = 1;

function isSessionLike(value: unknown): value is SessionState {
  if (typeof value !== "object" || value === null) return false;
  const s = value as Partial<SessionState>;
  return Boolean(s.deckId && s.deckVersion && s.gameType);
}

const sessions = defineStoredCollection<SessionState>(SESSION_KEY_PREFIX, {
  version: SESSION_STORAGE_VERSION,
  validate: isSessionLike,
});

/** Load a session. Returns null if none exists or it is malformed. */
export function loadSession(deckId: string): SessionState | null {
  return sessions.get(deckId);
}

/** Save a session (in memory only if storage is blocked or full). */
export function saveSession(session: SessionState): void {
  if (!sessions.set(session.deckId, session)) {
    // Not persisted: likely quota. Make room and retry once.
    clearOldSessions(session.deckId);
    sessions.set(session.deckId, session);
  }
}

export function clearSession(deckId: string): void {
  sessions.remove(deckId);
}

export function hasSession(deckId: string): boolean {
  return sessions.get(deckId) !== null;
}

/** All deck IDs that have a saved session. */
export function listSavedSessions(): string[] {
  return sessions.ids();
}

export function getSessionCount(): number {
  return listSavedSessions().length;
}

export function clearAllSessions(): void {
  for (const deckId of listSavedSessions()) {
    clearSession(deckId);
  }
}

/** Free space by keeping only the first 10 sessions (besides `keep`). */
function clearOldSessions(keep: string): void {
  const toRemove = listSavedSessions()
    .filter((id) => id !== keep)
    .slice(10);
  for (const deckId of toRemove) {
    clearSession(deckId);
  }
}

/** Export all sessions as JSON (for backup/debug). */
export function exportSessions(): Record<string, SessionState> {
  const result: Record<string, SessionState> = {};
  for (const deckId of listSavedSessions()) {
    const session = loadSession(deckId);
    if (session) result[deckId] = session;
  }
  return result;
}

/** Import sessions from JSON (for restore/debug). */
export function importSessions(data: Record<string, SessionState>): void {
  for (const [deckId, session] of Object.entries(data)) {
    if (session.deckId === deckId) {
      saveSession(session);
    }
  }
}

/** Whether sessions survive a reload (false when storage is blocked/full). */
export function isSessionStoragePersistent(): boolean {
  return getStore().isPersistent();
}
