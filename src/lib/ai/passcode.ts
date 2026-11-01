/**
 * The Worker passcode, stored on this phone under `kea.passcode`.
 * Excluded from backups (BACKUP_EXCLUDED_KEYS in src/lib/history/backup.ts).
 */
import { defineStoredValue } from "@/lib/storage";

export const passcodeStore = defineStoredValue<string>("passcode", {
  version: 1,
  validate: (data): data is string => typeof data === "string",
});

export function getPasscode(): string | null {
  const value = passcodeStore.get();
  return value && value.trim() ? value.trim() : null;
}

export function setPasscode(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    passcodeStore.remove();
    return true;
  }
  return passcodeStore.set(trimmed);
}

export function clearPasscode(): void {
  passcodeStore.remove();
}
