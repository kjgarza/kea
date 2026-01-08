import type {
  Card,
  CharadesCard,
  TriviaCard,
  TabooCard,
  JustOneCard,
  MonikersCard,
} from "./card";
import type { GameType, Difficulty } from "./game";

// Deck metadata - used in the deck index for listing/filtering
export interface DeckMeta {
  deckId: string;
  name: string;
  gameType: GameType;
  language: string;
  difficulty: Difficulty;
  topics: string[];
  recommended: boolean;
  nsfw: boolean;
  version: string; // ISO timestamp
  cardCount: number;
}

// Deck index file structure (public/decks/index.json)
export interface DeckIndex {
  schemaVersion: number;
  decks: DeckMeta[];
}

// Full deck file structure (public/decks/<deckId>.json)
export interface Deck<C extends Card = Card> {
  schemaVersion: number;
  deckId: string;
  version: string;
  name: string;
  gameType: GameType;
  language: string;
  difficulty: Difficulty;
  topics: string[];
  nsfw: boolean;
  cards: C[];
}

// Typed deck helpers for each game type
export type CharadesDeck = Deck<CharadesCard>;
export type TriviaDeck = Deck<TriviaCard>;
export type TabooDeck = Deck<TabooCard>;
export type JustOneDeck = Deck<JustOneCard>;
export type MonikersDeck = Deck<MonikersCard>;
