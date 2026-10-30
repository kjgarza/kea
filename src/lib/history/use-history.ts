"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_GROUPS } from "./groups";
import { getGroups, getHistory, getSettings, subscribeHistory } from "./history-store";
import { DEFAULT_SETTINGS } from "./settings";
import type { AppSettings, GroupsState, PlayRecord } from "./types";

export interface HistoryState {
  history: PlayRecord[];
  groups: GroupsState;
  settings: AppSettings;
}

const SERVER_STATE: HistoryState = {
  history: [],
  groups: DEFAULT_GROUPS,
  settings: DEFAULT_SETTINGS,
};

// useSyncExternalStore needs a stable snapshot: re-read only after a change.
let cached: HistoryState | null = null;

function getSnapshot(): HistoryState {
  if (!cached) {
    cached = { history: getHistory(), groups: getGroups(), settings: getSettings() };
  }
  return cached;
}

function subscribe(listener: () => void): () => void {
  return subscribeHistory(() => {
    cached = null;
    listener();
  });
}

/** History, groups and settings, kept in sync with the store. */
export function useHistoryState(): HistoryState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}
