"use client";

import { Check } from "lucide-react";
import type { Card } from "@/types/card";
import type { StandardSessionState } from "@/types/session";
import type { PlayViewProps } from "@/lib/game/modules/types";
import type { StandardAction } from "@/lib/game/modules/standard-stack/logic";
import { CardDisplay } from "../card-display";
import { CardStage } from "../card-stage";
import { ActionBar, ActionButton, PassButton } from "../action-bar";

export type StandardPlayViewProps = PlayViewProps<
  StandardSessionState,
  Card,
  StandardAction
>;

/** Charades and Just One: card plus Pass / Got it. */
export function StandardPlayView({ currentCard, dispatch }: StandardPlayViewProps) {
  if (!currentCard) return null;

  return (
    <>
      <CardStage>
        <CardDisplay card={currentCard} />
      </CardStage>
      <ActionBar>
        <PassButton onClick={() => dispatch({ type: "pass" })} />
        <ActionButton
          variant="primary"
          onClick={() => dispatch({ type: "next" })}
          icon={<Check className="h-5 w-5" />}
        >
          Got it!
        </ActionButton>
      </ActionBar>
    </>
  );
}
