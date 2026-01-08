import type { Difficulty } from "../../src/types/game";
import type { DeckSourceConfig } from "../lib/config-loader";

export interface PromptContext {
  config: DeckSourceConfig;
  context: string; // Combined markdown + URL content
}

/**
 * Get difficulty guidance text
 */
export function getDifficultyGuidance(difficulty: Difficulty): string {
  switch (difficulty) {
    case "easy":
      return `
Difficulty: EASY
- Use common, everyday words and concepts
- Avoid obscure references or technical terms
- Target audience: children and casual players
- Everyone should know most items`;

    case "medium":
      return `
Difficulty: MEDIUM
- Mix of common and moderately challenging items
- Some cultural references are acceptable
- Target audience: general adult players
- Most people should recognize 70-80% of items`;

    case "hard":
      return `
Difficulty: HARD
- Include challenging, niche, or obscure items
- Deep cultural references are encouraged
- Target audience: trivia enthusiasts
- Items can be specialized or require knowledge`;
  }
}

/**
 * Get safety guidelines
 */
export function getSafetyGuidelines(nsfw: boolean): string {
  if (nsfw) {
    return `
Content restrictions: Adult content is allowed but avoid:
- Hate speech or discrimination
- Illegal activities
- Extreme violence`;
  }

  return `
Content restrictions: FAMILY SAFE - No adult content:
- No sexual content or innuendo
- No violence or gore
- No drug references
- No profanity
- Suitable for all ages`;
}

/**
 * Build the base system prompt header
 */
export function buildSystemPromptHeader(ctx: PromptContext): string {
  return `You are a professional game content creator generating cards for party games.
Your output MUST be valid JSON.

${getDifficultyGuidance(ctx.config.difficulty)}
${getSafetyGuidelines(ctx.config.nsfw)}

Language: ${ctx.config.language.toUpperCase()}
All content must be in this language.

Topics: ${ctx.config.topics.length > 0 ? ctx.config.topics.join(", ") : "General/Any"}
`;
}
