import type { Card } from "@/types/card";

/**
 * Content warnings ("suicide", "gore", ...) are free-form tags on puzzle
 * cards. Decks expose the union in the index (`DeckMeta.contentWarnings`) so
 * the deck list can show them before a deck is opened (spec F5).
 */

/** Trim, lower-case and collapse whitespace so "Child  Death" == "child death". */
export function normalizeContentWarning(warning: string): string {
  return warning.trim().replace(/\s+/g, " ").toLowerCase();
}

/** A card's own warnings (only some card types carry them). */
export function cardContentWarnings(card: Card): string[] {
  switch (card.type) {
    case "situation":
      return card.contentWarnings ?? [];
    case "charades":
    case "trivia":
    case "taboo":
    case "justone":
    case "monikers":
      return [];
  }
}

/** Union of all cards' warnings: normalised, de-duplicated and sorted. */
export function deckContentWarnings(cards: readonly Card[]): string[] {
  const all = new Set<string>();
  for (const card of cards) {
    for (const warning of cardContentWarnings(card)) {
      const normalized = normalizeContentWarning(warning);
      if (normalized) all.add(normalized);
    }
  }
  return [...all].sort((a, b) => a.localeCompare(b));
}
