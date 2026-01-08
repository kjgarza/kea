import type { GameType } from "./game";

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
}

// Discriminated union of all card types
export type Card =
  | CharadesCard
  | TriviaCard
  | TabooCard
  | JustOneCard
  | MonikersCard;

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
          : never;
