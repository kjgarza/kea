import type {
  Card,
  CharadesCard,
  TriviaCard,
  TabooCard,
  JustOneCard,
  MonikersCard,
  SituationCard,
  CaseCard,
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
  /**
   * Union of the cards' content warnings (normalised, sorted), so the deck
   * list can show them before a deck is opened. Computed when the index is
   * written (scripts/lib/deck-index.ts); `[]` for games without warnings.
   */
  contentWarnings: string[];
  /** Deck licence (#58), only when the deck sets one. */
  license?: string;
  /** Deck attribution line (#58), only when the deck sets one. */
  attribution?: string;
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
  /**
   * Content licence of the deck (#58; id from src/lib/content/licenses.ts).
   * Absent for Kea's own decks. Share-alike cards force a share-alike deck.
   */
  license?: string;
  /** Free-text credit shown on the deck page, e.g. "Adapted from …". */
  attribution?: string;
  cards: C[];
}

// Typed deck helpers for each game type
export type CharadesDeck = Deck<CharadesCard>;
export type TriviaDeck = Deck<TriviaCard>;
export type TabooDeck = Deck<TabooCard>;
export type JustOneDeck = Deck<JustOneCard>;
export type MonikersDeck = Deck<MonikersCard>;
export type SituationDeck = Deck<SituationCard>;
export type CaseDeck = Deck<CaseCard>;
