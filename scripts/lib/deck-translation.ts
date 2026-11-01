import type { Card } from "../../src/types/card";
import { normalizeContentWarning } from "../../src/lib/data/content-warnings";
import type { GenerationResult } from "./llm-client";

/**
 * Pure parts of the deck translator (scripts/translate-decks.ts): which card
 * fields are sent to the model, how batches are built, and how translations
 * are merged back. The LLM call is injected as a `BatchTranslator`, so tests
 * can run the whole pipeline with a mocked model.
 *
 * Ids never change: card ids come from the original cards, and situation
 * key-fact ids are kept from the original even if the model rewrites them.
 */

export const TRANSLATION_BATCH_SIZE = 15;

export const TRANSLATION_SYSTEM_PROMPT = `You are a professional translator specializing in English to Latin American Spanish translation for party games.
Translate the text fields of the provided game cards from English to Spanish.
Return a JSON object with a "cards" array containing the translated cards.
Preserve all cardId and type fields exactly as-is — never change them.
Only translate the text content fields (prompts, targets, phrases, questions, choices, answers, forbidden words, titles, setups, solutions, key fact texts, hints, content warnings). Never change key fact ids.
Never add, remove, or reorder items in any arrays (for example: choices, forbidden, keyFacts, hints). Only translate the text of existing items.
Preserve any index fields such as answerIndex exactly as provided. For multiple-choice (mcq) trivia cards, do not reorder the choices array; only translate the text of each choice so that the existing answerIndex continues to point to the same logical answer.
Keep proper nouns (names of people, brands, specific places) untranslated unless they have a well-known standard Spanish form.
Ensure the translations are natural and appropriate for a party game context.`;

/**
 * Extract just the translatable fields from a card (to minimize context sent to LLM)
 */
export function extractTranslatableFields(card: Card): Record<string, unknown> {
  const base = { cardId: card.cardId, type: card.type };

  switch (card.type) {
    case "charades":
      return { ...base, prompt: card.prompt };
    case "justone":
      return { ...base, target: card.target };
    case "monikers":
      return { ...base, phrase: card.phrase };
    case "taboo":
      return { ...base, target: card.target, forbidden: card.forbidden };
    case "situation":
      return {
        ...base,
        title: card.title,
        setup: card.setup,
        solution: card.solution,
        keyFacts: card.keyFacts,
        hints: card.hints,
        ...(card.contentWarnings ? { contentWarnings: card.contentWarnings } : {}),
      };
    case "trivia":
      if (card.format === "mcq") {
        return {
          ...base,
          format: card.format,
          question: card.question,
          choices: card.choices,
          answerText: card.answerText,
          answerIndex: card.answerIndex,
        };
      } else {
        return {
          ...base,
          format: card.format,
          question: card.question,
          answerText: card.answerText,
        };
      }
  }
}

/**
 * Merge translated fields back into the original card structure
 */
export function mergeTranslation(original: Card, translated: Record<string, unknown>): Card {
  switch (original.type) {
    case "charades":
      return { ...original, prompt: String(translated.prompt ?? original.prompt) };
    case "justone":
      return { ...original, target: String(translated.target ?? original.target) };
    case "monikers":
      return { ...original, phrase: String(translated.phrase ?? original.phrase) };
    case "taboo":
      // Safely merge Taboo translations: keep forbidden words schema and count intact.
      {
        let mergedForbidden = original.forbidden;

        if (Array.isArray(translated.forbidden)) {
          const candidateForbidden = (translated.forbidden as unknown[]).filter(
            (w) => typeof w === "string"
          ) as string[];

          // Only accept translated forbidden words if all are strings and length matches.
          if (candidateForbidden.length === original.forbidden.length) {
            mergedForbidden = candidateForbidden;
          }
        }

        return {
          ...original,
          target: String(translated.target ?? original.target),
          forbidden: mergedForbidden,
        };
      }
    case "situation": {
      // Keep fact ids and array lengths; only accept translated text that
      // lines up with the original structure.
      const t = translated as {
        keyFacts?: unknown;
        hints?: unknown;
        contentWarnings?: unknown;
      };
      let keyFacts = original.keyFacts;
      if (Array.isArray(t.keyFacts) && t.keyFacts.length === original.keyFacts.length) {
        keyFacts = original.keyFacts.map((fact, i) => {
          const candidate = (t.keyFacts as unknown[])[i] as { text?: unknown } | null;
          return typeof candidate?.text === "string" ? { ...fact, text: candidate.text } : fact;
        });
      }
      let hints = original.hints;
      if (
        Array.isArray(t.hints) &&
        t.hints.length === original.hints.length &&
        t.hints.every((h) => typeof h === "string")
      ) {
        hints = t.hints as string[];
      }
      let contentWarnings = original.contentWarnings;
      if (
        contentWarnings &&
        Array.isArray(t.contentWarnings) &&
        t.contentWarnings.length === contentWarnings.length &&
        t.contentWarnings.every((w) => typeof w === "string" && w.trim().length > 0)
      ) {
        contentWarnings = (t.contentWarnings as string[]).map(normalizeContentWarning);
      }
      return {
        ...original,
        ...(contentWarnings ? { contentWarnings } : {}),
        title: String(translated.title ?? original.title),
        setup: String(translated.setup ?? original.setup),
        solution: String(translated.solution ?? original.solution),
        keyFacts,
        hints,
      };
    }
    case "trivia":
      if (original.format === "mcq") {
        // Safely merge MCQ translations while keeping answerIndex consistent.
        let mergedChoices = original.choices;
        const mergedAnswerIndex = original.answerIndex;

        if (Array.isArray(translated.choices)) {
          const candidateChoices = (translated.choices as unknown[]).filter(
            (c) => typeof c === "string"
          ) as string[];

          // Only accept translated choices if they are all strings and the length matches.
          if (candidateChoices.length === original.choices.length) {
            mergedChoices = candidateChoices;
          }
        }

        return {
          ...original,
          question: String(translated.question ?? original.question),
          choices: mergedChoices,
          answerIndex: mergedAnswerIndex,
          answerText: String(translated.answerText ?? original.answerText),
        };
      } else {
        return {
          ...original,
          question: String(translated.question ?? original.question),
          answerText: String(translated.answerText ?? original.answerText),
        };
      }
  }
}


export interface TranslationPrompt {
  systemPrompt: string;
  prompt: string;
}

/** Sends every prompt to the model; one result (array of cards) per prompt. */
export type BatchTranslator = (
  prompts: TranslationPrompt[]
) => Promise<GenerationResult<Record<string, unknown>[]>[]>;

export interface TranslateCardsOptions {
  batchSize?: number;
  /** Called for recoverable problems (failed batch, missing card). */
  warn?: (message: string) => void;
}

/** Split cards into batches and build one prompt per batch. */
export function buildTranslationPrompts(
  cards: readonly Card[],
  gameType: string,
  batchSize: number = TRANSLATION_BATCH_SIZE
): { batches: Card[][]; prompts: TranslationPrompt[] } {
  const batches: Card[][] = [];
  for (let i = 0; i < cards.length; i += batchSize) {
    batches.push(cards.slice(i, i + batchSize));
  }
  const prompts = batches.map((batch) => ({
    systemPrompt: TRANSLATION_SYSTEM_PROMPT,
    prompt: `Translate these ${gameType} game cards to Spanish:\n\n${JSON.stringify(
      batch.map(extractTranslatableFields)
    )}\n\nReturn: { "cards": [...] }`,
  }));
  return { batches, prompts };
}

/**
 * Translate cards with the given translator. Order and ids follow the
 * originals; a failed batch or a card missing from the reply keeps the
 * original (English) card.
 */
export async function translateCardsWith(
  cards: readonly Card[],
  gameType: string,
  translate: BatchTranslator,
  { batchSize = TRANSLATION_BATCH_SIZE, warn = () => {} }: TranslateCardsOptions = {}
): Promise<{ cards: Card[]; failedBatches: number }> {
  const { batches, prompts } = buildTranslationPrompts(cards, gameType, batchSize);
  const results = await translate(prompts);

  const translatedCards: Card[] = [];
  let failedBatches = 0;

  for (let i = 0; i < batches.length; i++) {
    const result = results[i];
    const originalBatch = batches[i];

    if (!result?.success || !result.data) {
      warn(`Batch ${i + 1} failed: ${result?.error ?? "no result"} — keeping originals`);
      failedBatches++;
      translatedCards.push(...originalBatch);
      continue;
    }

    // Look translations up by cardId so we don't depend on order
    const translatedById = new Map<string, Record<string, unknown>>();
    for (const translated of result.data) {
      if (translated && typeof translated.cardId === "string") {
        translatedById.set(translated.cardId, translated);
      }
    }

    for (const original of originalBatch) {
      const translated = translatedById.get(original.cardId);
      if (translated) {
        translatedCards.push(mergeTranslation(original, translated));
      } else {
        warn(
          `No matching translated card for cardId ${original.cardId} in batch ${i + 1} — keeping original`
        );
        translatedCards.push(original);
      }
    }
  }

  return { cards: translatedCards, failedBatches };
}

/** Derive the Spanish deck ID from an English deck ID */
export function toSpanishDeckId(deckId: string): string {
  return deckId.replace("-en-", "-es-");
}
