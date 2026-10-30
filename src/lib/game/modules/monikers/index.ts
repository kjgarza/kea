import type { MonikersCard } from "@/types/card";
import type { MonikersSessionState } from "@/types/session";
import {
  MonikersHeaderView,
  MonikersPlayView,
} from "@/components/monikers/monikers-play-view";
import { defineGameModule } from "../types";
import {
  createMonikersSession,
  isMonikersComplete,
  isMonikersRoundComplete,
  monikersCardIds,
  monikersProgress,
  reduceMonikers,
  type MonikersAction,
} from "./logic";

export type { MonikersAction } from "./logic";

export const monikersModule = defineGameModule<
  MonikersSessionState,
  MonikersCard,
  MonikersAction
>({
  type: "monikers",
  createSession: (deck, opts) => createMonikersSession(deck, opts),
  reduce: (session, action, deck) => reduceMonikers(session, action, deck),
  isComplete: isMonikersComplete,
  progress: monikersProgress,
  cardIds: monikersCardIds,
  PlayView: MonikersPlayView,
  HeaderView: MonikersHeaderView,
  // The between-rounds screen is full-screen, without header/background.
  showChrome: (session) => !isMonikersRoundComplete(session),
  completeTitle: "play.complete.gameTitle",
  theme: {
    gradient: "from-monikers/15 via-monikers/8 to-monikers/20",
    pattern: "text-monikers",
  },
});
