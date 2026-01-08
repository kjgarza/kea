import type { Difficulty } from "./game";

// Sort options for deck list
export type SortOption = "recommended" | "alphabetical";

// Filter state for deck selection
export interface DeckFilters {
  language: string | null; // null = any language
  difficulty: Difficulty | null; // null = any difficulty
  topics: string[]; // empty = any/random
  familySafe: boolean;
  search: string;
  sortBy: SortOption;
}

// Default filter state
export const DEFAULT_FILTERS: DeckFilters = {
  language: null, // Will be set to browser language on init
  difficulty: "medium",
  topics: [],
  familySafe: true,
  search: "",
  sortBy: "recommended",
};

// Shuffle option (separate from filters, affects play session)
export interface PlayOptions {
  shuffleEnabled: boolean;
}

export const DEFAULT_PLAY_OPTIONS: PlayOptions = {
  shuffleEnabled: false,
};
