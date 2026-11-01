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
import { HumanKeeperPanel } from "./human-keeper-panel";
import { SetupScreen } from "./setup-screen";
import { ActionButton } from "@/components/play/action-bar";
import { ArrowLeft } from "lucide-react";

/**
 * Extension point for keeper modes. While a puzzle is being played (after
 * the content warnings, before the end screen) the situation PlayView
 * renders `KEEPER_PANELS[session.mode]`, which owns the whole screen body.
 *
 * - human (#25): setup → confirmed reveal → crib sheet.
 * - ai / solo (#31, #32): replace the placeholders below with panels that show
 *   the setup (reuse `SetupScreen`), the question input, transcript and
 *   theory sheet, dispatching their own actions added to `SituationAction`.
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

/** Shown for modes whose UI has not shipped yet. */
function UnavailableKeeperPanel({ card, dispatch, t }: KeeperPanelProps) {
  return (
    <SetupScreen
      card={card}
      t={t}
      footer={
        <ActionButton
          variant="pass"
          className="w-full"
          onClick={() => dispatch({ type: "backToPicker" })}
          icon={<ArrowLeft className="h-5 w-5" />}
        >
          {t("situation.setup.back")}
        </ActionButton>
      }
    >
      <p className="text-center text-sm text-muted-foreground">
        {t("situation.keeper.modeUnavailable")}
      </p>
    </SetupScreen>
  );
}

export const KEEPER_PANELS: Record<SituationMode, ComponentType<KeeperPanelProps>> = {
  human: HumanKeeperPanel,
  ai: UnavailableKeeperPanel,
  solo: UnavailableKeeperPanel,
};
