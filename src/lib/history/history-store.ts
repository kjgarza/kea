import { defineStoredValue, getStore } from "@/lib/storage";
import {
  createBackup,
  GROUPS_KEY,
  GROUPS_VERSION,
  HISTORY_KEY,
  HISTORY_VERSION,
  restoreBackup,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  type KeaBackup,
  type RestoreResult,
} from "./backup";
import { DEFAULT_GROUPS, isGroupsState } from "./groups";
import { addRecord, isPlayRecordList } from "./records";
import { normalizeSettings } from "./settings";
import type { AppSettings, GroupsState, PlayRecord } from "./types";

/**
 * Stateful side of history: reads/writes `kea.history`, `kea.groups` and
 * `kea.settings` through the shared store and notifies React subscribers
 * (see use-history.ts). Never touches localStorage directly.
 */

const historyValue = defineStoredValue<PlayRecord[]>(HISTORY_KEY, {
  version: HISTORY_VERSION,
  validate: isPlayRecordList,
});
const groupsValue = defineStoredValue<GroupsState>(GROUPS_KEY, {
  version: GROUPS_VERSION,
  validate: isGroupsState,
});
const settingsValue = defineStoredValue<AppSettings>(SETTINGS_KEY, {
  version: SETTINGS_VERSION,
});

export function getHistory(): PlayRecord[] {
  return historyValue.get() ?? [];
}

export function getGroups(): GroupsState {
  return groupsValue.get() ?? DEFAULT_GROUPS;
}

export function getSettings(): AppSettings {
  return normalizeSettings(settingsValue.get());
}

// --- change notification -----------------------------------------------------

const listeners = new Set<() => void>();
let storageListening = false;
let version = 0;

/**
 * Bumped on every change, whether or not anyone is subscribed, so cached
 * snapshots (see `useHistoryState`) can tell they are stale.
 */
export function historyVersion(): number {
  return version;
}

function notify(): void {
  version++;
  listeners.forEach((l) => l());
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  if (!storageListening && typeof window !== "undefined") {
    storageListening = true;
    // Another tab changed Kea's data.
    window.addEventListener("storage", (e) => {
      if (e.key === null || e.key.startsWith("kea.")) notify();
    });
  }
  return () => listeners.delete(listener);
}

// --- writes ------------------------------------------------------------------

export function setGroups(update: (state: GroupsState) => GroupsState): GroupsState {
  const current = getGroups();
  const next = update(current);
  if (next !== current) {
    groupsValue.set(next);
    notify();
  }
  return next;
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...getSettings(), ...patch };
  settingsValue.set(next);
  notify();
  return next;
}

export interface RecordPlayResult {
  /** True when this is the first record ever written on this phone. */
  first: boolean;
  count: number;
}

/**
 * Append a finished puzzle to `kea.history` (deduped). The first write asks
 * the browser to keep Kea's data (`navigator.storage.persist()`), once.
 */
export function recordPlay(record: PlayRecord): RecordPlayResult {
  const before = getHistory();
  const after = addRecord(before, record);
  if (after !== before) historyValue.set(after);
  notify();
  void requestPersistenceOnce();
  return { first: before.length === 0 && after.length === 1, count: after.length };
}

/** Calls `navigator.storage.persist()` the first time only; stores the answer. */
export async function requestPersistenceOnce(): Promise<void> {
  const settings = getSettings();
  if (settings.persistence.requested) return;
  updateSettings({ persistence: { requested: true, granted: null } });
  let granted: boolean | null = null;
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persist) {
      granted = await navigator.storage.persist();
    }
  } catch {
    granted = null;
  }
  updateSettings({ persistence: { requested: true, granted } });
}

/** Live answer from the browser, or null when the API is missing. */
export async function queryPersisted(): Promise<boolean | null> {
  try {
    if (typeof navigator !== "undefined" && navigator.storage?.persisted) {
      return await navigator.storage.persisted();
    }
  } catch {
    // ignore
  }
  return null;
}

/** Build a backup and reset the export reminder. */
export function exportBackup(now: Date = new Date()): KeaBackup {
  const backup = createBackup(getStore(), now);
  updateSettings({ exportReminderCount: getHistory().length });
  return backup;
}

export function importBackup(input: unknown): RestoreResult {
  const result = restoreBackup(getStore(), input);
  if (result.ok) notify();
  return result;
}

/** Start the reminder count again from now ("Later"). */
export function snoozeExportReminder(): void {
  updateSettings({ exportReminderCount: getHistory().length });
}

