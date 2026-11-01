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

/**
 * Result of the generation-time solvability check (#33): a solver model
 * solved the puzzle against the AI keeper in `questions` questions. A
 * difficulty signal; absent on puzzles that were never checked.
 */
export interface SituationSolvability {
  questions: number;
  checkedAt: string; // ISO timestamp
  model?: string; // solver model
}

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
  solvability?: SituationSolvability;
}

// Case file card - a cooperative investigation (spec §4.2)
export const EVIDENCE_KINDS = [
  "document",
  "image",
  "interview",
  "phone_log",
  "map",
  "pdf",
] as const;

export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

/** Kinds whose body is markdown in `content`. */
export const TEXT_EVIDENCE_KINDS: readonly EvidenceKind[] = [
  "document",
  "interview",
  "phone_log",
];

/** Kinds whose body is a file in `src` (under public/decks/assets/<deckId>/). */
export const FILE_EVIDENCE_KINDS: readonly EvidenceKind[] = ["image", "pdf", "map"];

export interface Evidence {
  id: string;
  title: string;
  kind: EvidenceKind;
  content?: string; // markdown for text kinds
  src?: string; // path under public/decks/assets/<deckId>/
  unlockAfter?: string[]; // evidence ids that must be opened first
}

export interface CaseQuestion {
  id: string;
  prompt: string;
  answer: string;
  acceptedVariants: string[];
  points: number;
}

export interface CaseCard extends BaseCard {
  type: "case";
  title: string;
  briefing: string; // markdown
  evidence: Evidence[];
  questions: CaseQuestion[];
  walkthrough: string; // markdown, shown after the accusation
  contentWarnings?: string[];
  estMinutes?: number;
}

// Discriminated union of all card types
export type Card =
  | CharadesCard
  | TriviaCard
  | TabooCard
  | JustOneCard
  | MonikersCard
  | SituationCard
  | CaseCard;

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

export function isCaseCard(card: Card): card is CaseCard {
  return card.type === "case";
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
            : T extends "case"
              ? CaseCard
              : never;
