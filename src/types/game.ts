// Game type enumeration
export type GameType =
  | "charades"
  | "trivia"
  | "taboo"
  | "justone"
  | "monikers";

export type Difficulty = "easy" | "medium" | "hard";

// Pass behavior determines what happens when a player passes on a card
export type PassBehavior = "recycle" | "discard";

// Game metadata for display and behavior configuration
export interface GameMetadata {
  type: GameType;
  name: string;
  description: string;
  icon: string;
  passBehavior: PassBehavior;
  hasReveal: boolean;
}

// All game configurations
export const GAMES: Record<GameType, GameMetadata> = {
  charades: {
    type: "charades",
    name: "Charades",
    description: "Act it out without words",
    icon: "drama",
    passBehavior: "recycle",
    hasReveal: false,
  },
  trivia: {
    type: "trivia",
    name: "Trivia",
    description: "Test your knowledge",
    icon: "brain",
    passBehavior: "discard",
    hasReveal: true,
  },
  taboo: {
    type: "taboo",
    name: "Taboo",
    description: "Describe without forbidden words",
    icon: "ban",
    passBehavior: "recycle",
    hasReveal: false,
  },
  justone: {
    type: "justone",
    name: "Just One",
    description: "Give unique one-word clues",
    icon: "lightbulb",
    passBehavior: "discard",
    hasReveal: false,
  },
  monikers: {
    type: "monikers",
    name: "Monikers",
    description: "Three rounds of guessing",
    icon: "users",
    passBehavior: "recycle",
    hasReveal: false,
  },
};

// Helper to get all game types as array
export const GAME_TYPES = Object.keys(GAMES) as GameType[];

// Type guard for GameType
export function isGameType(value: string): value is GameType {
  return value in GAMES;
}
