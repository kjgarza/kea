import type { KeaStore, StoredEnvelope } from "@/lib/storage";
import { isGroupsState, mergeGroups } from "./groups";
import { isPlayRecordList, mergeRecords } from "./records";

/**
 * Export/import of everything Kea keeps on this phone, to move to another
 * phone. Built on the store's `exportAll` / `importAll`.
 *
 * - `kea.history` and `kea.groups` are merged with what is already here.
 * - Other keys (sessions, settings, notes, locale) are only added when the
 *   phone does not have them yet.
 * - Secrets (`kea.passcode`, #29) are never exported.
 */

export const HISTORY_KEY = "history";
export const GROUPS_KEY = "groups";
export const SETTINGS_KEY = "settings";
export const HISTORY_VERSION = 1;
export const GROUPS_VERSION = 1;
export const SETTINGS_VERSION = 1;

/** Keys that never leave the phone. */
export const BACKUP_EXCLUDED_KEYS: readonly string[] = ["passcode"];

export interface KeaBackup {
  app: "kea";
  kind: "backup";
  version: 1;
  exportedAt: string;
  data: Record<string, StoredEnvelope>;
}

export function createBackup(store: KeaStore, now: Date = new Date()): KeaBackup {
  const data = store.exportAll();
  for (const key of BACKUP_EXCLUDED_KEYS) delete data[key];
  return { app: "kea", kind: "backup", version: 1, exportedAt: now.toISOString(), data };
}

export function backupFileName(now: Date = new Date()): string {
  return `kea-backup-${now.toISOString().slice(0, 10)}.json`;
}

export type RestoreResult =
  | { ok: true; keys: number; records: number }
  | { ok: false; error: "invalid" };

function isEnvelope(value: unknown): value is StoredEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoredEnvelope).v === "number" &&
    "data" in value
  );
}

/** Accepts a `KeaBackup` (or a bare `exportAll()` object). */
function backupData(input: unknown): Record<string, StoredEnvelope> | null {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return null;
  const obj = input as Record<string, unknown>;
  const raw =
    obj.app === "kea" && typeof obj.data === "object" && obj.data !== null
      ? (obj.data as Record<string, unknown>)
      : obj;
  const entries = Object.entries(raw).filter(
    ([key, value]) => isEnvelope(value) && !BACKUP_EXCLUDED_KEYS.includes(key)
  );
  if (entries.length === 0 && Object.keys(raw).length > 0) return null;
  return Object.fromEntries(entries) as Record<string, StoredEnvelope>;
}

export function restoreBackup(store: KeaStore, input: unknown): RestoreResult {
  const data = backupData(input);
  if (!data) return { ok: false, error: "invalid" };

  const { [HISTORY_KEY]: history, [GROUPS_KEY]: groups, ...rest } = data;
  const merged: Record<string, StoredEnvelope> = {};
  let records = 0;

  if (history && history.v === HISTORY_VERSION && isPlayRecordList(history.data)) {
    const local = store.get(HISTORY_KEY, { version: HISTORY_VERSION, validate: isPlayRecordList }) ?? [];
    const all = mergeRecords(local, history.data);
    records = all.length - local.length;
    merged[HISTORY_KEY] = { v: HISTORY_VERSION, data: all };
  } else if (history) {
    rest[HISTORY_KEY] = history;
  }

  if (groups && groups.v === GROUPS_VERSION && isGroupsState(groups.data)) {
    const local = store.get(GROUPS_KEY, { version: GROUPS_VERSION, validate: isGroupsState });
    merged[GROUPS_KEY] = {
      v: GROUPS_VERSION,
      data: local ? mergeGroups(local, groups.data) : groups.data,
    };
  } else if (groups) {
    rest[GROUPS_KEY] = groups;
  }

  const keys =
    store.importAll(merged, { overwrite: true }) + store.importAll(rest, { overwrite: false });
  return { ok: true, keys, records };
}
