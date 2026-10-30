import type { Difficulty, GameType } from "./game";

// Base card interface
interface BaseCard {
  cardId: string;
}

// Charades card - shows a prompt to act out
export interface CharadesCard extends BaseCard {
  type: "charades";
  prompt: string;
}

// Trivia card - Multiple choice format
export interface TriviaMCQCard extends BaseCard {
  type: "trivia";
  format: "mcq";
  question: string;
  choices: string[];
  answerIndex: number;
  answerText: string;
}

// Trivia card - Open-ended format
export interface TriviaOpenCard extends BaseCard {
  type: "trivia";
  format: "open";
  question: string;
  answerText: string;
}

// Combined Trivia card type
export type TriviaCard = TriviaMCQCard | TriviaOpenCard;

// Taboo card - target word with forbidden words
export interface TabooCard extends BaseCard {
  type: "taboo";
  target: string;
  forbidden: string[]; // 5-6 words
}

// Just One card - target word for clues
export interface JustOneCard extends BaseCard {
  type: "justone";
  target: string;
}

// Monikers card - phrase to guess
export interface MonikersCard extends BaseCard {
  type: "monikers";
  phrase: string;
  description?: string;
}

// Situation puzzle card - a lateral-thinking mystery (spec §4.1)
export interface SituationKeyFact {
  id: string;
  text: string;
}

export type SituationOrigin = "generated" | "original" | "transcribed";

export interface SituationCard extends BaseCard {
  type: "situation";
  title: string;
  setup: string; // the front of the card, read aloud
  solution: string; // the full story
  keyFacts: SituationKeyFact[]; // 3–8 atomic facts players must uncover
  hints: string[]; // ordered, mild → strong; 1–4
  difficulty?: Difficulty; // overrides the deck difficulty
  contentWarnings?: string[]; // e.g. "suicide", "child death", "gore"
  estMinutes?: number;
  source?: { pack?: string; ref?: string; origin: SituationOrigin };
}

// Discriminated union of all card types
export type Card =
  | CharadesCard
  | TriviaCard
  | TabooCard
  | JustOneCard
  | MonikersCard
  | SituationCard;

// Type guards
export function isCharadesCard(card: Card): card is CharadesCard {
  return card.type === "charades";
}

export function isTriviaCard(card: Card): card is TriviaCard {
  return card.type === "trivia";
}

export function isTriviaMCQCard(card: Card): card is TriviaMCQCard {
  return card.type === "trivia" && "format" in card && card.format === "mcq";
}

export function isTriviaOpenCard(card: Card): card is TriviaOpenCard {
  return card.type === "trivia" && "format" in card && card.format === "open";
}

export function isTabooCard(card: Card): card is TabooCard {
  return card.type === "taboo";
}

export function isJustOneCard(card: Card): card is JustOneCard {
  return card.type === "justone";
}

export function isMonikersCard(card: Card): card is MonikersCard {
  return card.type === "monikers";
}

export function isSituationCard(card: Card): card is SituationCard {
  return card.type === "situation";
}

// Map game type to card type
export type CardForGame<T extends GameType> = T extends "charades"
  ? CharadesCard
  : T extends "trivia"
    ? TriviaCard
    : T extends "taboo"
      ? TabooCard
      : T extends "justone"
        ? JustOneCard
        : T extends "monikers"
          ? MonikersCard
          : T extends "situation"
            ? SituationCard
            : never;
