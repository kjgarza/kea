"use client";

import type { CaseCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { CaseSessionState } from "@/types/session";
import type { CaseAction } from "@/lib/game/modules/case/logic";
import type { TranslateFn } from "@/lib/i18n";

export interface JudgeSlotProps {
  deck: Deck<CaseCard>;
  session: CaseSessionState;
  card: CaseCard;
  /** Question ids whose answers did not match locally. */
  unmatchedIds: string[];
  dispatch: (action: CaseAction) => void;
  t: TranslateFn;
}

/**
 * Extension point for the answer judge (#37, F16). It is rendered on the
 * review screen while the accusation is being marked. When AI is configured
 * (`useAiAvailability() === "available"`), #37 should POST the unmatched
 * answers to /case/judge and dispatch
 * `{ type: "judgeMarks", results }`: the reducer pre-marks only answers the
 * group has not marked yet, and the group can still override every mark.
 * Until then it renders nothing and the group marks everything by hand.
 */
export function JudgeSlot(_props: JudgeSlotProps) {
  return null;
}
