import type { GameType } from "@/types/game";
import { StandardPlayView } from "@/components/play/views/standard-play-view";
import { TriviaPlayView } from "@/components/play/views/trivia-play-view";
import { TabooPlayView } from "@/components/play/views/taboo-play-view";
import type { AnyGameModule } from "./types";
import { createStandardStackModule } from "./standard-stack";
import { monikersModule } from "./monikers";

/**
 * GameType -> GameModule. The only place that knows which module plays which
 * game. Adding a game type = add its module here (the Record type makes a
 * missing entry a compile error).
 */
export const GAME_MODULES: Record<GameType, AnyGameModule> = {
  charades: createStandardStackModule({
    type: "charades",
    PlayView: StandardPlayView,
    theme: {
      gradient: "from-charades/15 via-charades/8 to-charades/20",
      pattern: "text-charades",
    },
  }),
  trivia: createStandardStackModule({
    type: "trivia",
    PlayView: TriviaPlayView,
    theme: {
      gradient: "from-trivia/15 via-trivia/8 to-trivia/20",
      pattern: "text-trivia",
    },
  }),
  taboo: createStandardStackModule({
    type: "taboo",
    PlayView: TabooPlayView,
    theme: {
      gradient: "from-taboo/15 via-taboo/8 to-taboo/20",
      pattern: "text-taboo",
    },
  }),
  justone: createStandardStackModule({
    type: "justone",
    PlayView: StandardPlayView,
    theme: {
      gradient: "from-justone/15 via-justone/8 to-justone/20",
      pattern: "text-justone",
    },
  }),
  monikers: monikersModule,
};

export function getGameModule(gameType: GameType): AnyGameModule {
  const gameModule = GAME_MODULES[gameType];
  if (!gameModule) {
    throw new Error(`No game module registered for "${gameType}"`);
  }
  return gameModule;
}
