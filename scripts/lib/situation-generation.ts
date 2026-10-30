import type { SituationCard } from "../../src/types/card";
import { normalizeContentWarning } from "../../src/lib/data/content-warnings";
import type { SituationConfig } from "./config-loader";

/**
 * Post-processing for generated situation puzzles (issue #26), applied after
 * `validateSituationCard`:
 * - every card gets `source.origin: "generated"` (the model cannot claim
 *   "original"/"transcribed"; a pack/ref it returned is kept)
 * - the config's deck-level `contentWarnings` are merged into each card
 * - with `allowDeath: false`, cards that mention or warn about death are dropped
 */

const DEATH_PATTERN =
  /\b(death|deaths|dead|die|dies|died|dying|murder\w*|suicid\w*|kill\w*|corpse\w*|funeral\w*|grave|graves|homicid\w*|execut(?:ed|ion)|fatal\w*|drown(?:ed|s)?|poison(?:ed|s)?|muert\w*|muri\w*|asesin\w*|cad[aá]ver\w*)\b/i;

/** Does a content warning (e.g. "child death", "suicide") concern death? */
export function isDeathRelatedWarning(warning: string): boolean {
  return DEATH_PATTERN.test(normalizeContentWarning(warning));
}

/** Does any text of the puzzle (or its warnings) mention death? */
export function mentionsDeath(card: SituationCard): boolean {
  const texts = [
    card.title,
    card.setup,
    card.solution,
    ...card.keyFacts.map((f) => f.text),
    ...card.hints,
  ];
  return (
    (card.contentWarnings ?? []).some(isDeathRelatedWarning) ||
    texts.some((text) => DEATH_PATTERN.test(text))
  );
}

export interface FinalizedSituationCards {
  cards: SituationCard[];
  rejected: { cardId: string; reason: string }[];
}

export function finalizeSituationCards(
  cards: readonly SituationCard[],
  config: SituationConfig
): FinalizedSituationCards {
  const result: FinalizedSituationCards = { cards: [], rejected: [] };

  for (const card of cards) {
    if (!config.allowDeath && mentionsDeath(card)) {
      result.rejected.push({
        cardId: card.cardId,
        reason: "mentions death but the deck does not allow it",
      });
      continue;
    }

    const contentWarnings = [
      ...new Set(
        [...(card.contentWarnings ?? []), ...config.contentWarnings].map(
          normalizeContentWarning
        )
      ),
    ];

    result.cards.push({
      ...card,
      ...(contentWarnings.length > 0 ? { contentWarnings } : {}),
      source: { ...card.source, origin: "generated" },
    });
  }

  return result;
}
