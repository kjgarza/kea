"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_GROUPS } from "./groups";
import { getGroups, getHistory, getSettings, historyVersion, subscribeHistory } from "./history-store";
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
// The cache is keyed by the store's version, so writes made while nothing is
// subscribed (e.g. recording a play after the picker unmounted) are seen by
// the next mount.
let cached: { version: number; state: HistoryState } | null = null;

function getSnapshot(): HistoryState {
  const version = historyVersion();
  if (!cached || cached.version !== version) {
    cached = { version, state: { history: getHistory(), groups: getGroups(), settings: getSettings() } };
  }
  return cached.state;
}

function subscribe(listener: () => void): () => void {
  return subscribeHistory(listener);
}

/** History, groups and settings, kept in sync with the store. */
export function useHistoryState(): HistoryState {
  return useSyncExternalStore(subscribe, getSnapshot, () => SERVER_STATE);
}
