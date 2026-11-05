"use client";

import { useLocale } from "@/lib/i18n";
import { CardDisplay } from "../card-display";
import { CardStage, useCardFlight } from "../card-stage";
import { ActionBar, ActionButton, PassButton } from "../action-bar";
import type { StandardPlayViewProps } from "./standard-play-view";

/** Trivia: reveal the answer on the card; Next unlocks after reveal. */
export function TriviaPlayView({ deck, session, currentCard, dispatch }: StandardPlayViewProps) {
  const { t } = useLocale(deck.language);
  const { direction, fly } = useCardFlight();
  if (!currentCard) return null;

  const onPass = () => dispatch({ type: "pass" });
  const onNext = () => dispatch({ type: "next" });

  return (
    <>
      <CardStage
        cardKey={currentCard.cardId}
        direction={direction}
        fly={fly}
        onSwipeLeft={onPass}
        onSwipeRight={session.isRevealed ? onNext : undefined}
        leftLabel={t("actions.pass")}
        rightLabel={t("actions.next")}
      >
        <CardDisplay
          card={currentCard}
          language={deck.language}
          isRevealed={session.isRevealed}
          onReveal={() => dispatch({ type: "reveal" })}
        />
      </CardStage>
      <ActionBar>
        <PassButton onClick={fly(-1, onPass)} language={deck.language} />
        <ActionButton variant="primary" onClick={fly(1, onNext)} disabled={!session.isRevealed}>
          {t("actions.next")}
        </ActionButton>
      </ActionBar>
    </>
  );
}
