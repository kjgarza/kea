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
  howToPlay: string[];
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
    howToPlay: [
      "One player draws a card and acts out the prompt — no words, sounds, or mouthing allowed.",
      "Teammates shout guesses until someone names it correctly.",
      "Correct guess scores a point. Pass to recycle the card back into the deck.",
    ],
    icon: "drama",
    passBehavior: "recycle",
    hasReveal: false,
  },
  trivia: {
    type: "trivia",
    name: "Trivia",
    description: "Test your knowledge",
    howToPlay: [
      "Read the question aloud. Players (or teams) write down or call out their answer.",
      "Reveal the correct answer — whoever got it right scores a point.",
      "Passed cards are discarded; each question is used only once.",
    ],
    icon: "brain",
    passBehavior: "discard",
    hasReveal: true,
  },
  taboo: {
    type: "taboo",
    name: "Taboo",
    description: "Describe without forbidden words",
    howToPlay: [
      "Get your team to say the target word without using any of the forbidden words on the card.",
      "Other teams watch for slip-ups — use a forbidden word and the card is lost.",
      "Passed cards recycle back into the deck.",
    ],
    icon: "ban",
    passBehavior: "recycle",
    hasReveal: false,
  },
  justone: {
    type: "justone",
    name: "Just One",
    description: "Give unique one-word clues",
    howToPlay: [
      "Everyone except the active guesser secretly writes one word as a clue.",
      "Before the guesser looks, reveal all clues — any duplicates are removed.",
      "The guesser sees only the unique clues and tries to name the target word.",
    ],
    icon: "lightbulb",
    passBehavior: "discard",
    hasReveal: false,
  },
  monikers: {
    type: "monikers",
    name: "Monikers",
    description: "Three rounds of guessing",
    howToPlay: [
      "Three rounds with the same cards, each harder than the last.",
      "Round 1: Describe freely (no target word). Round 2: One word only. Round 3: Silently act it out.",
      "Passed cards recycle; each correct card scores a point per round.",
    ],
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
