import type { GameType } from "../../src/types/game";
import type { PromptContext } from "./base";
import { buildCharadesPrompt } from "./charades";
import { buildTriviaPrompt } from "./trivia";
import { buildTabooPrompt } from "./taboo";
import { buildJustOnePrompt } from "./justone";
import { buildMonikersPrompt } from "./monikers";

export type { PromptContext } from "./base";

/**
 * Build prompts for the specified game type
 */
export function buildPrompt(
  gameType: GameType,
  ctx: PromptContext
): { systemPrompt: string; userPrompt: string } {
  switch (gameType) {
    case "charades":
      return buildCharadesPrompt(ctx);
    case "trivia":
      return buildTriviaPrompt(ctx);
    case "taboo":
      return buildTabooPrompt(ctx);
    case "justone":
      return buildJustOnePrompt(ctx);
    case "monikers":
      return buildMonikersPrompt(ctx);
    default:
      throw new Error(`Unknown game type: ${gameType}`);
  }
}
