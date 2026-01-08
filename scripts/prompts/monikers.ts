import type { PromptContext } from "./base";
import { buildSystemPromptHeader } from "./base";

export function buildMonikersPrompt(ctx: PromptContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `${buildSystemPromptHeader(ctx)}

GAME: MONIKERS
A party game played in 3 rounds with the same cards:
- Round 1: Describe with unlimited words (no saying the name)
- Round 2: Describe with only ONE word
- Round 3: Act it out (charades style)

Card format:
{
  "cards": [
    { "phrase": "string" }
  ]
}

Requirements:
- Phrases should be well-known people, characters, or entities
- Must work across all 3 rounds:
  - Describable with words
  - Has a distinctive one-word association
  - Has actable characteristics or poses
- Mix of categories:
  - Fictional characters (Harry Potter, Darth Vader)
  - Historical figures (Albert Einstein, Cleopatra)
  - Celebrities (famous actors, musicians, athletes)
  - Iconic creatures (Godzilla, Big Bird)
- Culturally diverse selections
- Mix of eras (classic and modern references)`;

  const userPrompt = `Generate ${ctx.config.cardCount} unique Monikers phrases.

${ctx.context ? `Context/Theme:\n${ctx.context}` : ""}

Each phrase should be a well-known person, character, or entity that:
- Most players would recognize
- Can be described, summarized in one word, and acted out
- Is fun and memorable

Output valid JSON with a "cards" array containing objects with "phrase" field.
Example: { "cards": [{ "phrase": "Sherlock Holmes" }, { "phrase": "Darth Vader" }] }`;

  return { systemPrompt, userPrompt };
}
