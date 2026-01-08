import type { PromptContext } from "./base";
import { buildSystemPromptHeader } from "./base";

export function buildTabooPrompt(ctx: PromptContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `${buildSystemPromptHeader(ctx)}

GAME: TABOO
Players describe a target word without using the forbidden "taboo" words.

Card format:
{
  "cards": [
    {
      "target": "string (the word to guess)",
      "forbidden": ["word1", "word2", "word3", "word4", "word5"]
    }
  ]
}

STRICT Requirements for forbidden words:
- Exactly 5 forbidden words per card
- All 5 must be unique (no duplicates)
- None can be the target word or variations of it
- No plurals of the target (if target is "beach", don't use "beaches")
- No verb forms of the target (if target is "run", don't use "running")
- Choose the most obvious clues someone would naturally use
- Forbidden words should make the game challenging but fair`;

  const userPrompt = `Generate ${ctx.config.cardCount} unique Taboo cards.

${ctx.context ? `Context/Theme:\n${ctx.context}` : ""}

Each card needs:
1. A target word (the word players guess)
2. Exactly 5 forbidden words (words the describer cannot use)

Output valid JSON with a "cards" array.
Example:
{
  "cards": [
    {
      "target": "Beach",
      "forbidden": ["sand", "ocean", "sun", "waves", "vacation"]
    }
  ]
}`;

  return { systemPrompt, userPrompt };
}
