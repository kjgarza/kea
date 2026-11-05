"use client";

import type { Card } from "@/types/card";
import type { StandardSessionState } from "@/types/session";
import type { PlayViewProps } from "@/lib/game/modules/types";
import type { StandardAction } from "@/lib/game/modules/standard-stack/logic";
import { useLocale } from "@/lib/i18n";
import { CardDisplay } from "../card-display";
import { useCardFlight } from "@/hooks/use-card-flight";
import { CardStage } from "../card-stage";
import { ActionBar, ActionButton, PassButton } from "../action-bar";

export type StandardPlayViewProps = PlayViewProps<
  StandardSessionState,
  Card,
  StandardAction
>;

/** Charades and Just One: card plus Pass / Got it, by button or by swiping. */
export function StandardPlayView({ deck, currentCard, dispatch }: StandardPlayViewProps) {
  const { t } = useLocale(deck.language);
  const { direction, fly } = useCardFlight();
  if (!currentCard) return null;

  const onPass = () => dispatch({ type: "pass" });
  const onGotIt = () => dispatch({ type: "next" });

  return (
    <>
      <CardStage
        cardKey={currentCard.cardId}
        direction={direction}
        fly={fly}
        onSwipeLeft={onPass}
        onSwipeRight={onGotIt}
        leftLabel={t("actions.pass")}
        rightLabel={t("actions.gotIt")}
      >
        <CardDisplay card={currentCard} language={deck.language} />
      </CardStage>
      <ActionBar>
        <PassButton onClick={fly(-1, onPass)} language={deck.language} />
        <ActionButton variant="primary" onClick={fly(1, onGotIt)}>
          {t("actions.gotIt")}
        </ActionButton>
      </ActionBar>
    </>
  );
}
