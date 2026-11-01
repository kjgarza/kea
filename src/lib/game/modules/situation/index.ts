import type { SituationCard } from "@/types/card";
import type { SituationSessionState } from "@/types/session";
import { SituationPlayView } from "@/components/situation/situation-play-view";
import { defineGameModule } from "../types";
import {
  createSituationSession,
  getMode,
  isSituationComplete,
  reduceSituation,
  situationCardIds,
  situationProgress,
  type SituationAction,
} from "./logic";

export type { SituationAction } from "./logic";

/**
 * Situation puzzles: puzzle picker → content warnings → setup → keeper
 * (mode-specific panel, see src/components/situation/keeper-panels.tsx) →
 * end screen, then the next puzzle along the card stack.
 */
export const situationModule = defineGameModule<
  SituationSessionState,
  SituationCard,
  SituationAction
>({
  type: "situation",
  createSession: (deck, opts) => createSituationSession(deck, opts),
  // Restart keeps the chosen keeper mode (human / AI / solo).
  restart: (session, deck) => ({
    ...createSituationSession(deck, {
      shuffleEnabled: session.shuffleEnabled,
      shuffleSeed: session.shuffleSeed,
    }),
    mode: getMode(session),
  }),
  reduce: reduceSituation,
  isComplete: isSituationComplete,
  progress: situationProgress,
  cardIds: situationCardIds,
  PlayView: SituationPlayView,
  completeTitle: "situation.complete.title",
  theme: {
    gradient: "from-situation/15 via-situation/8 to-situation/20",
    pattern: "text-situation",
  },
});
