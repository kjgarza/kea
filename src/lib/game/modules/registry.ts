import type { GameType } from "@/types/game";
import { StandardPlayView } from "@/components/play/views/standard-play-view";
import { TriviaPlayView } from "@/components/play/views/trivia-play-view";
import { TabooPlayView } from "@/components/play/views/taboo-play-view";
import type { AnyGameModule } from "./types";
import { createStandardStackModule } from "./standard-stack";
import { monikersModule } from "./monikers";
import { situationModule } from "./situation";
import { caseModule } from "./case";

/**
 * GameType -> GameModule. The only place that knows which module plays which
 * game. Adding a game type = add its module here (the Record type makes a
 * missing entry a compile error).
 */
export const GAME_MODULES: Record<GameType, AnyGameModule> = {
  charades: createStandardStackModule({
    type: "charades",
    PlayView: StandardPlayView,
    surface: "table",
  }),
  trivia: createStandardStackModule({
    type: "trivia",
    PlayView: TriviaPlayView,
    surface: "table",
  }),
  taboo: createStandardStackModule({
    type: "taboo",
    PlayView: TabooPlayView,
    surface: "table",
  }),
  justone: createStandardStackModule({
    type: "justone",
    PlayView: StandardPlayView,
    surface: "table",
  }),
  monikers: monikersModule,
  situation: situationModule,
  case: caseModule,
};

export function getGameModule(gameType: GameType): AnyGameModule {
  const gameModule = GAME_MODULES[gameType];
  if (!gameModule) {
    throw new Error(`No game module registered for "${gameType}"`);
  }
  return gameModule;
}
