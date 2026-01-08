import type { PromptContext } from "./base";
import { buildSystemPromptHeader } from "./base";

export function buildCharadesPrompt(ctx: PromptContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `${buildSystemPromptHeader(ctx)}

GAME: CHARADES
Players act out the prompt without speaking while others guess.

Card format:
{
  "cards": [
    { "prompt": "string" }
  ]
}

Requirements:
- Each prompt should be actable (can be mimed)
- Avoid abstract concepts that can't be physically demonstrated
- Include a mix of: actions, animals, occupations, objects, famous characters
- Prompts should be 1-3 words maximum
- No duplicate prompts`;

  const userPrompt = `Generate ${ctx.config.cardCount} unique charades prompts.

${ctx.context ? `Context/Theme:\n${ctx.context}` : ""}

Output valid JSON with a "cards" array containing objects with "prompt" field.
Example: { "cards": [{ "prompt": "Elephant" }, { "prompt": "Swimming" }] }`;

  return { systemPrompt, userPrompt };
}
