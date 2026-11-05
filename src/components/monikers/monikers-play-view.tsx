"use client";

import { useState } from "react";
import { Hourglass } from "lucide-react";
import type { MonikersCard } from "@/types/card";
import type { MonikersSessionState } from "@/types/session";
import type { HeaderViewProps, PlayViewProps } from "@/lib/game/modules/types";
import {
  isMonikersRoundComplete,
  monikersCardsLeft,
  type MonikersAction,
} from "@/lib/game/modules/monikers/logic";
import { useLocale } from "@/lib/i18n";
import { CardDisplay } from "@/components/play/card-display";
import { useCardFlight } from "@/hooks/use-card-flight";
import { CardStage } from "@/components/play/card-stage";
import { ActionBar, ActionButton, PassButton } from "@/components/play/action-bar";
import { EndTurnOverlay } from "./end-turn-overlay";
import { RoundCompleteScreen } from "./round-complete-screen";
import { RoundIndicator } from "./round-indicator";

type Props = PlayViewProps<MonikersSessionState, MonikersCard, MonikersAction>;

export function MonikersPlayView({ deck, session, currentCard, dispatch }: Props) {
  const { t } = useLocale(deck.language);
  const { direction, fly } = useCardFlight();
  const [showEndTurnOverlay, setShowEndTurnOverlay] = useState(false);

  if (isMonikersRoundComplete(session)) {
    return (
      <RoundCompleteScreen
        round={session.monikersRound}
        language={deck.language}
        onNextRound={() => dispatch({ type: "nextRound" })}
      />
    );
  }

  if (!currentCard) return null;

  const onPass = () => dispatch({ type: "pass" });
  const onCorrect = () => dispatch({ type: "correct" });

  return (
    <>
      <CardStage
        cardKey={currentCard.cardId}
        direction={direction}
        fly={fly}
        onSwipeLeft={onPass}
        onSwipeRight={onCorrect}
        leftLabel={t("actions.pass")}
        rightLabel={t("actions.correct")}
      >
        <CardDisplay card={currentCard} language={deck.language} />
      </CardStage>
      <ActionBar>
        <PassButton onClick={fly(-1, onPass)} language={deck.language} />
        <ActionButton variant="primary" onClick={fly(1, onCorrect)}>
          {t("actions.correct")}
        </ActionButton>
        <button
          type="button"
          onClick={() => setShowEndTurnOverlay(true)}
          aria-label={t("monikers.endTurn")}
          className="flex h-16 w-14 shrink-0 items-center justify-center rounded-2xl bg-foreground/12 transition-transform active:scale-[0.97]"
        >
          <Hourglass className="size-5" aria-hidden />
        </button>
      </ActionBar>

      {showEndTurnOverlay && (
        <EndTurnOverlay
          cardsRemaining={monikersCardsLeft(session)}
          language={deck.language}
          onContinue={() => {
            dispatch({ type: "endTurn" });
            setShowEndTurnOverlay(false);
          }}
        />
      )}
    </>
  );
}

export function MonikersHeaderView({
  deck,
  session,
}: HeaderViewProps<MonikersSessionState, MonikersCard>) {
  return <RoundIndicator round={session.monikersRound} language={deck.language} />;
}
