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
 * Situation puzzles. Placeholder module (#24): shows each puzzle's warnings
 * and setup so decks can be listed and opened; the human keeper view (#25)
 * replaces the PlayView and extends the session state.
 */
export const situationModule = defineGameModule<
  SituationSessionState,
  SituationCard,
  SituationAction
>({
  type: "situation",
  createSession: (deck, opts) => createSituationSession(deck, opts),
  reduce: (session, action) => reduceSituation(session, action),
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
