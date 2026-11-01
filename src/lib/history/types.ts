/**
 * Play history, groups and app settings (spec §4.5, F3, F4). Everything here
 * is stored through the shared store (`src/lib/storage`) under:
 *
 *   kea.history   PlayRecord[]        (oldest first)
 *   kea.groups    GroupsState
 *   kea.settings  AppSettings
 */

export type PlayOutcome = "solved" | "gave_up" | "partial";

/** One finished puzzle (spec §4.5). */
export interface PlayRecord {
  deckId: string;
  cardId: string;
  /**
   * Group id (see `PlayGroup.id`). Ids keep "played" tracking stable when a
   * group is renamed; `groupName` is a snapshot for display/export.
   */
  group: string;
  mode: string;
  language: "en" | "es";
  startedAt: string;
  endedAt: string;
  questions: number;
  hintsUsed: number;
  outcome: PlayOutcome;
  score?: number;
  /** Snapshots so the history list renders without loading every deck. */
  groupName?: string;
  title?: string;
  deckName?: string;
}

/** A set of people who play together, e.g. "Berlin crew", "partner", "solo". */
export interface PlayGroup {
  id: string;
  /** Empty for the built-in default group, which shows a localised name. */
  name: string;
  /** Hide puzzles this group has already played in the picker. */
  hidePlayed: boolean;
}

export interface GroupsState {
  groups: PlayGroup[];
  selectedId: string;
}

/** Random-pick filters (F4). */
export interface RandomFilters {
  /** Only puzzles the selected group has not played. */
  unplayed: boolean;
  /** Only puzzles estimated at this many minutes or fewer (null = any). */
  maxMinutes: number | null;
  /** Skip puzzles that carry any content warning. */
  excludeWarnings: boolean;
}

export interface PersistenceStatus {
  /** `navigator.storage.persist()` has been called (it is called once). */
  requested: boolean;
  /** Its answer; null when the API is missing or it has not been asked. */
  granted: boolean | null;
}

/**
 * App-wide settings (`kea.settings`). #29 keeps the Worker passcode in its
 * own key (`kea.passcode`), not here, so it never ends up in a backup.
 */
export interface AppSettings {
  randomFilters: RandomFilters;
  persistence: PersistenceStatus;
  /** The add-to-home-screen prompt has been shown (it is shown once). */
  installPromptShown: boolean;
  /** History length when the user last exported or dismissed the reminder. */
  exportReminderCount: number;
}
