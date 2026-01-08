import type { PromptContext } from "./base";
import { buildSystemPromptHeader } from "./base";

export function buildJustOnePrompt(ctx: PromptContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `${buildSystemPromptHeader(ctx)}

GAME: JUST ONE
Players each give a one-word clue to help one player guess the target word.
Duplicate clues are eliminated, so unique clues are valuable.

Card format:
{
  "cards": [
    { "target": "string" }
  ]
}

Requirements:
- Target words should be concrete nouns (not abstract concepts)
- Words should have multiple possible one-word clues
- Avoid proper nouns (save those for Monikers)
- Words should be common enough that everyone knows them
- Avoid words with very limited clue options
- Avoid overly simple words (cat, dog, house)
- Good targets have rich associations (volcano, treasure, detective)`;

  const userPrompt = `Generate ${ctx.config.cardCount} unique target words for Just One.

${ctx.context ? `Context/Theme:\n${ctx.context}` : ""}

Each target should be a word that:
- Most people would know
- Has many possible one-word clues
- Is fun to guess

Output valid JSON with a "cards" array containing objects with "target" field.
Example: { "cards": [{ "target": "Volcano" }, { "target": "Pirate" }] }`;

  return { systemPrompt, userPrompt };
}
