import type { Card, CaseCard, ContentSource } from "../../src/types/card";
import type { Deck } from "../../src/types/deck";
import { normalizeContentWarning } from "../../src/lib/data/content-warnings";
import { walkthroughEvidenceRefs } from "./case-pack";
import type { GenerationResult } from "./llm-client";

/**
 * Pure parts of the deck translator (scripts/translate-decks.ts): which card
 * fields are sent to the model, how batches are built, and how translations
 * are merged back. The LLM call is injected as a `BatchTranslator`, so tests
 * can run the whole pipeline with a mocked model.
 *
 * Ids never change: card ids come from the original cards, and situation
 * key-fact ids and case evidence/question ids are kept from the original even
 * if the model rewrites them. Case evidence keeps its kind, `src` (asset
 * paths are shared across languages) and `unlockAfter`; questions keep their
 * points.
 */

export const TRANSLATION_BATCH_SIZE = 15;

/**
 * Game types the translator does not handle. Empty since #36 added case
 * files; kept so a future game type can opt out with a clear message.
 */
export const UNTRANSLATABLE_GAME_TYPES: readonly string[] = [];

export function isTranslatableGameType(gameType: string): boolean {
  return !UNTRANSLATABLE_GAME_TYPES.includes(gameType);
}

export function untranslatableGameTypeMessage(gameType: string): string {
  return `${gameType} decks cannot be translated automatically yet; write the Spanish deck by hand`;
}

export const TRANSLATION_SYSTEM_PROMPT = `You are a professional translator specializing in English to Latin American Spanish translation for party games.
Translate the text fields of the provided game cards from English to Spanish.
Return a JSON object with a "cards" array containing the translated cards.
Preserve all cardId and type fields exactly as-is — never change them.
Only translate the text content fields (prompts, targets, phrases, questions, choices, answers, forbidden words, titles, setups, solutions, key fact texts, hints, content warnings, briefings, evidence titles and contents, accepted answer variants, walkthroughs). Never change key fact ids, evidence ids or question ids.
Never add, remove, or reorder items in any arrays (for example: choices, forbidden, keyFacts, hints). Only translate the text of existing items.
Preserve any index fields such as answerIndex exactly as provided. For multiple-choice (mcq) trivia cards, do not reorder the choices array; only translate the text of each choice so that the existing answerIndex continues to point to the same logical answer.
Keep proper nouns (names of people, brands, specific places) untranslated unless they have a well-known standard Spanish form.
Case files: keep the markdown (bold, tables, lists, line breaks), times, dates, numbers, codes and badge numbers exactly. In a walkthrough, text inside backticks (for example \`phone-log\`) is an evidence id: copy it unchanged and keep every one. acceptedVariants are short alternative answers a Spanish-speaking player might type; write natural Spanish variants (the list may be shorter or longer than the original).
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
    case "case":
      return {
        ...base,
        title: card.title,
        briefing: card.briefing,
        evidence: card.evidence.map((e) => ({
          id: e.id,
          title: e.title,
          ...(e.content !== undefined ? { content: e.content } : {}),
        })),
        questions: card.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          answer: q.answer,
          acceptedVariants: q.acceptedVariants,
        })),
        walkthrough: card.walkthrough,
        ...(card.contentWarnings ? { contentWarnings: card.contentWarnings } : {}),
      };
  }
}

/**
 * Source fields after translation (#58): everything is kept unchanged, and
 * external content (a card with a licence, or `adapted`/`transcribed`) is
 * marked `modified: true`, because a translation is an adaptation. Kea's own
 * cards keep their source exactly as it was.
 */
export function translatedSource<S extends ContentSource | undefined>(source: S): S {
  if (!source) return source;
  const external =
    source.license !== undefined || source.origin === "adapted" || source.origin === "transcribed";
  return external ? ({ ...source, modified: true } as S) : source;
}

/**
 * Deck-level licence fields a translated deck inherits (#58): the licence and
 * attribution are copied unchanged (a translation of CC BY-SA stays CC BY-SA).
 */
export function translatedDeckLicensing(deck: Pick<Deck, "license" | "attribution">): Pick<Deck, "license" | "attribution"> {
  return {
    ...(deck.license !== undefined ? { license: deck.license } : {}),
    ...(deck.attribution !== undefined ? { attribution: deck.attribution } : {}),
  };
}

/**
 * Merge translated fields back into the original card structure. Source
 * fields come from the original (see `translatedSource`).
 */
export function mergeTranslation(original: Card, translated: Record<string, unknown>): Card {
  const merged = mergeTranslatedFields(original, translated);
  if ((merged.type === "situation" || merged.type === "case") && merged.source) {
    return { ...merged, source: translatedSource(merged.source) };
  }
  return merged;
}

function mergeTranslatedFields(original: Card, translated: Record<string, unknown>): Card {
  switch (original.type) {
    case "case":
      return mergeCaseTranslation(original, translated);
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

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function recordsById(value: unknown): Map<string, Record<string, unknown>> {
  const byId = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(value)) return byId;
  for (const item of value) {
    if (item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string") {
      byId.set((item as { id: string }).id, item as Record<string, unknown>);
    }
  }
  return byId;
}

/**
 * Merge a translated case. Structure always comes from the original: evidence
 * and question ids, order, kind, `src`, `unlockAfter` and points. Text is
 * taken per item (matched by id) when it is a non-empty string. The
 * walkthrough is accepted only if it still cites every evidence id the
 * original cites and no unknown ones.
 */
export function mergeCaseTranslation(
  original: CaseCard,
  translated: Record<string, unknown>
): CaseCard {
  const text = (value: unknown, fallback: string) =>
    nonEmptyString(value) ? value.trim() : fallback;

  const evidenceById = recordsById(translated.evidence);
  const evidence = original.evidence.map((e) => {
    const t = evidenceById.get(e.id);
    if (!t) return e;
    return {
      ...e,
      title: text(t.title, e.title),
      ...(e.content !== undefined ? { content: text(t.content, e.content) } : {}),
    };
  });

  const questionsById = recordsById(translated.questions);
  const questions = original.questions.map((q) => {
    const t = questionsById.get(q.id);
    if (!t) return q;
    const variants = Array.isArray(t.acceptedVariants)
      ? [...new Set((t.acceptedVariants as unknown[]).filter(nonEmptyString).map((v) => v.trim()))]
      : null;
    return {
      ...q,
      prompt: text(t.prompt, q.prompt),
      answer: text(t.answer, q.answer),
      acceptedVariants: variants && variants.length > 0 ? variants : q.acceptedVariants,
    };
  });

  let walkthrough = original.walkthrough;
  if (nonEmptyString(translated.walkthrough)) {
    const ids = new Set(original.evidence.map((e) => e.id));
    const refs = walkthroughEvidenceRefs(translated.walkthrough);
    const keepsCitations = walkthroughEvidenceRefs(original.walkthrough).every((id) =>
      refs.includes(id)
    );
    if (keepsCitations && refs.every((id) => ids.has(id))) {
      walkthrough = translated.walkthrough.trim();
    }
  }

  let contentWarnings = original.contentWarnings;
  const tw = translated.contentWarnings;
  if (
    contentWarnings &&
    Array.isArray(tw) &&
    tw.length === contentWarnings.length &&
    tw.every(nonEmptyString)
  ) {
    contentWarnings = (tw as string[]).map(normalizeContentWarning);
  }

  return {
    ...original,
    title: text(translated.title, original.title),
    briefing: text(translated.briefing, original.briefing),
    evidence,
    questions,
    walkthrough,
    ...(contentWarnings ? { contentWarnings } : {}),
  };
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
  if (!isTranslatableGameType(gameType)) {
    throw new Error(untranslatableGameTypeMessage(gameType));
  }
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
