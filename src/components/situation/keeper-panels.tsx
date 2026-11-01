"use client";

import type { ComponentType } from "react";
import type { SituationCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import type {
  SituationMode,
  SituationPuzzleState,
  SituationSessionState,
} from "@/types/session";
import type { SituationAction } from "@/lib/game/modules/situation/logic";
import type { TranslateFn } from "@/lib/i18n";
import { AiKeeperPanel, SoloKeeperPanel } from "./ai-keeper-panel";
import { HumanKeeperPanel } from "./human-keeper-panel";

/**
 * Extension point for keeper modes. While a puzzle is being played (after
 * the content warnings, before the end screen) the situation PlayView
 * renders `KEEPER_PANELS[session.mode]`, which owns the whole screen body.
 *
 * - human (#25): setup → confirmed reveal → crib sheet.
 * - ai / solo (#31): setup, question input (text + voice), answer chips,
 *   transcript, fact progress, hints (and a score in solo). Answers go through
 *   the `recordAnswer` action so the transcript persists with the session.
 *   #32 fills `TheorySlot` (theory-slot.tsx) inside these panels.
 *
 * The end screen, picker and warnings are shared by every mode.
 */
export interface KeeperPanelProps {
  deck: Deck<SituationCard>;
  session: SituationSessionState;
  puzzle: SituationPuzzleState;
  card: SituationCard;
  dispatch: (action: SituationAction) => void;
  t: TranslateFn;
}

export const KEEPER_PANELS: Record<SituationMode, ComponentType<KeeperPanelProps>> = {
  human: HumanKeeperPanel,
  ai: AiKeeperPanel,
  solo: SoloKeeperPanel,
};
