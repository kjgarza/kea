import { DEFAULT_RANDOM_FILTERS, isRandomFilters } from "./random-pick";
import type { AppSettings } from "./types";

export const DEFAULT_SETTINGS: AppSettings = {
  randomFilters: DEFAULT_RANDOM_FILTERS,
  persistence: { requested: false, granted: null },
  installPromptShown: false,
  exportReminderCount: 0,
};

/**
 * Fill in missing/invalid fields from the defaults, so later builds can add
 * fields without a schema migration.
 */
export function normalizeSettings(value: unknown): AppSettings {
  if (typeof value !== "object" || value === null) return DEFAULT_SETTINGS;
  const s = value as Partial<Record<keyof AppSettings, unknown>>;
  const p = (s.persistence ?? {}) as Record<string, unknown>;
  return {
    randomFilters: isRandomFilters(s.randomFilters)
      ? s.randomFilters
      : DEFAULT_SETTINGS.randomFilters,
    persistence: {
      requested: p.requested === true,
      granted: typeof p.granted === "boolean" ? p.granted : null,
    },
    installPromptShown: s.installPromptShown === true,
    exportReminderCount:
      typeof s.exportReminderCount === "number" ? s.exportReminderCount : 0,
  };
}

/** Records between export reminders when storage is not persistent. */
export const EXPORT_REMINDER_EVERY = 10;

/**
 * Remind the user to export when the browser has not promised to keep Kea's
 * data and at least EXPORT_REMINDER_EVERY records were added since the last
 * export (or dismissed reminder).
 */
export function shouldRemindExport(historyLength: number, settings: AppSettings): boolean {
  if (settings.persistence.granted === true) return false;
  return historyLength - settings.exportReminderCount >= EXPORT_REMINDER_EVERY;
}

export type PersistenceState = "granted" | "denied" | "notAsked" | "unsupported" | "memoryOnly";

/**
 * What the settings sheet says about storage. `live` is the browser's current
 * `navigator.storage.persisted()` answer (null when unavailable);
 * `storeDurable` is `getStore().isPersistent()` (false = memory only).
 */
export function persistenceState(
  settings: AppSettings,
  live: boolean | null,
  storeDurable: boolean,
  apiAvailable: boolean
): PersistenceState {
  if (!storeDurable) return "memoryOnly";
  if (live === true || settings.persistence.granted === true) return "granted";
  if (!apiAvailable) return "unsupported";
  if (!settings.persistence.requested) return "notAsked";
  return "denied";
}
