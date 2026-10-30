import type { SituationCard } from "@/types/card";
import type { SituationSessionState } from "@/types/session";
import { SituationPlayView } from "@/components/situation/situation-play-view";
import { defineGameModule } from "../types";
import {
  createSituationSession,
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
