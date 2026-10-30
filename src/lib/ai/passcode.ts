/**
 * The Worker passcode, stored on this phone under `kea.passcode`.
 * Excluded from backups (BACKUP_EXCLUDED_KEYS in src/lib/history/backup.ts).
 */
import { defineStoredValue } from "@/lib/storage";

export const passcodeStore = defineStoredValue<string>("passcode", {
  version: 1,
  validate: (data): data is string => typeof data === "string",
});

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((listener) => listener());
}

/**
 * Called whenever the passcode changes (here or in another tab), so screens
 * that gate AI features on it (e.g. the puzzle picker) update right away.
 */
export function subscribePasscode(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === "kea.passcode") listener();
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}

export function getPasscode(): string | null {
  const value = passcodeStore.get();
  return value && value.trim() ? value.trim() : null;
}

export function setPasscode(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    passcodeStore.remove();
    notify();
    return true;
  }
  const persisted = passcodeStore.set(trimmed);
  notify();
  return persisted;
}

export function clearPasscode(): void {
  passcodeStore.remove();
  notify();
}
