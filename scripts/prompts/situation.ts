import type { Difficulty } from "../../src/types/game";
import type { SituationConfig, SituationTone } from "../lib/config-loader";
import { SITUATION_LIMITS } from "../lib/validators";
import type { PromptContext } from "./base";
import { buildSystemPromptHeader } from "./base";

/** Defaults used when a config reaches the prompt without situation fields. */
const DEFAULT_SITUATION_CONFIG: SituationConfig = {
  tone: "macabre",
  allowDeath: true,
  contentWarnings: [],
};

export function getSituationToneGuidance(
  tone: SituationTone,
  allowDeath: boolean
): string {
  const death = allowDeath
    ? `- Deaths may happen (this overrides the general "no violence" restriction above),
  but keep them off-stage and never describe gore, cruelty or sexual content.
- Tag every puzzle that involves a death with the matching content warnings.`
    : `- NO DEATH: nobody dies, is killed, commits suicide or is found dead — not even off-stage, in the past, or as a red herring.
- Avoid murder, corpses, funerals, graves and fatal accidents entirely.`;

  switch (tone) {
    case "macabre":
      return `
Tone: MACABRE (in the style of "Black Stories")
- Dark, eerie and surprising: the setup sounds sinister or impossible
- The twist is grim but logical; the answer should make players groan "of course!"
${death}`;
    case "funny":
      return `
Tone: FUNNY
- Absurd, playful setups with a satisfying, silly-but-logical explanation
- Wordplay is fine only if it also works when the puzzle is translated
${death}`;
    case "no-death":
      return `
Tone: NO DEATH (family safe)
- Gentle, clever and surprising, suitable for children and family game nights
- Twists come from misdirection, everyday objects, jobs, games, weather or animals
${death}`;
  }
}

export function getSituationDifficultyGuidance(difficulty: Difficulty): string {
  switch (difficulty) {
    case "easy":
      return `
Puzzle difficulty: EASY
- One twist; 3–4 key facts; solvable in about 5–10 yes/no questions
- Hints can point quite directly at the twist`;
    case "medium":
      return `
Puzzle difficulty: MEDIUM
- One main twist plus one supporting detail; 4–6 key facts
- Solvable in about 15–25 yes/no questions`;
    case "hard":
      return `
Puzzle difficulty: HARD
- A chain of two or three linked surprises; 5–8 key facts
- Solvable in about 25–40 yes/no questions, with no specialist knowledge needed`;
  }
}

export function buildSituationPrompt(ctx: PromptContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const situation = ctx.config.situation ?? DEFAULT_SITUATION_CONFIG;
  const { setupMaxChars, minKeyFacts, maxKeyFacts, minHints, maxHints } =
    SITUATION_LIMITS;

  const systemPrompt = `${buildSystemPromptHeader(ctx)}

GAME: SITUATION PUZZLES (lateral thinking / "yes-no" mysteries)
One player (the keeper) reads a strange setup aloud and secretly knows the full story.
The others ask questions that can only be answered "yes", "no" or "irrelevant" until
they reconstruct what happened.
${getSituationToneGuidance(situation.tone, situation.allowDeath)}
${getSituationDifficultyGuidance(ctx.config.difficulty)}

Card format:
{
  "cards": [
    {
      "title": "string — short, intriguing, does not give the twist away",
      "setup": "string — at most ${setupMaxChars} characters, read aloud",
      "solution": "string — the full story, 2–5 sentences",
      "keyFacts": [{ "id": "kebab-case-id", "text": "one atomic fact" }],
      "hints": ["mildest hint", "...", "strongest hint"],
      "difficulty": "easy" | "medium" | "hard",
      "contentWarnings": ["lower-case tags, e.g. death, murder, suicide, gore, animal harm"],
      "estMinutes": number
    }
  ]
}

Requirements:
- ONE coherent answer. Every detail of the setup is explained by the solution, and
  the solution contradicts nothing in the setup.
- Reachable by yes/no questions: no puns that only work in English, no obscure
  trivia, no hidden numbers or names that must be guessed exactly.
- Fair: the setup is strange but true; it never lies or withholds the one fact that
  makes the twist possible to imagine.
- keyFacts: ${minKeyFacts}–${maxKeyFacts} short, atomic statements (one idea each) that together
  rebuild the solution. Ids are unique, lower-case kebab-case, 1–3 words
  (e.g. "son-driver", "power-cut").
- hints: ${minHints}–${maxHints} hints ordered from mild to strong. The last hint points at the
  core twist but never states the whole solution.
- contentWarnings: list every sensitive theme the puzzle contains (death, murder,
  suicide, child death, gore, animal harm, ...). Use [] when there is none.
- estMinutes: realistic playing time in minutes (usually 5–20).
- Original puzzles only. Do not copy published puzzles from Black Stories, Paul
  Sloane or other books; well-known folk riddles must be retold in your own words.
- Every puzzle uses a different twist; no near-duplicates.`;

  const deckWarnings =
    situation.contentWarnings.length > 0
      ? `\nThe deck already warns about: ${situation.contentWarnings.join(", ")}.`
      : "";

  const userPrompt = `Generate ${ctx.config.cardCount} unique situation puzzles.
${deckWarnings}
${ctx.context ? `Context/Theme:\n${ctx.context}\n` : ""}
Output valid JSON with a "cards" array of objects with the fields title, setup,
solution, keyFacts, hints, difficulty, contentWarnings and estMinutes.
Example:
{ "cards": [{
  "title": "The Bus She Didn't Take",
  "setup": "Every weekday Anna catches the 8:00 bus. One morning it arrives on time; she lets it go by, waves, and walks home happy.",
  "solution": "Anna had the day off. Her son had just qualified as a bus driver and the 8:00 was his first route, so she went to the stop only to wave at him.",
  "keyFacts": [
    { "id": "day-off", "text": "Anna was not going to work that day." },
    { "id": "son-driver", "text": "The bus driver was Anna's son." },
    { "id": "first-route", "text": "It was his first day driving that route." }
  ],
  "hints": ["Anna never meant to get on the bus.", "Think about who was driving."],
  "difficulty": "easy",
  "contentWarnings": [],
  "estMinutes": 8
}] }`;

  return { systemPrompt, userPrompt };
}
