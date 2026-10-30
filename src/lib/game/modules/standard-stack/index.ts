import type { ComponentType } from "react";
import type { Card } from "@/types/card";
import type { GameType } from "@/types/game";
import { GAMES } from "@/types/game";
import type { StandardSessionState } from "@/types/session";
import {
  defineGameModule,
  type GameModule,
  type PlayViewProps,
} from "../types";
import {
  createStandardSession,
  isStandardComplete,
  reduceStandard,
  standardCardIds,
  standardProgress,
  type StandardAction,
} from "./logic";

export type { StandardAction } from "./logic";

export type StandardGameType = StandardSessionState["gameType"];

export type StandardStackModule = GameModule<
  StandardSessionState,
  Card,
  StandardAction
>;

interface StandardStackConfig {
  type: StandardGameType;
  PlayView: ComponentType<PlayViewProps<StandardSessionState, Card, StandardAction>>;
  theme: StandardStackModule["theme"];
}

/**
 * Build a module for a plain card-stack game. Pass behaviour (recycle vs
 * discard) comes from `GAMES[type].passBehavior`.
 */
export function createStandardStackModule({
  type,
  PlayView,
  theme,
}: StandardStackConfig): StandardStackModule {
  const passBehavior = GAMES[type as GameType].passBehavior;
  return defineGameModule<StandardSessionState, Card, StandardAction>({
    type,
    createSession: (deck, opts) => createStandardSession(deck, opts),
    reduce: (session, action) => reduceStandard(session, action, passBehavior),
    isComplete: isStandardComplete,
    progress: standardProgress,
    cardIds: standardCardIds,
    PlayView,
    theme,
  });
}
