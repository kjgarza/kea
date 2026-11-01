/**
 * Play history, groups, random pick and app settings (issue #28, spec §4.5,
 * F3, F4). Pure logic lives in records/groups/random-pick/settings/backup;
 * history-store.ts does the store I/O; use-history.ts is the React hook.
 */
export * from "./types";
export * from "./records";
export * from "./groups";
export * from "./random-pick";
export * from "./settings";
export * from "./backup";
export {
  exportBackup,
  getGroups,
  getHistory,
  getSettings,
  importBackup,
  queryPersisted,
  recordPlay,
  requestPersistenceOnce,
  setGroups,
  snoozeExportReminder,
  subscribeHistory,
  updateSettings,
  type RecordPlayResult,
} from "./history-store";
export { useHistoryState, type HistoryState } from "./use-history";
export { situationPlayRecord } from "./situation-record";
export { downloadJson } from "./download";
