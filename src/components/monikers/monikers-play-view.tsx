"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Clock } from "lucide-react";
import type { MonikersCard } from "@/types/card";
import type { MonikersSessionState } from "@/types/session";
import type { HeaderViewProps, PlayViewProps } from "@/lib/game/modules/types";
import {
  isMonikersRoundComplete,
  monikersCardsLeft,
  type MonikersAction,
} from "@/lib/game/modules/monikers/logic";
import { CardDisplay } from "@/components/play/card-display";
import { CardStage } from "@/components/play/card-stage";
import { ActionBar, ActionButton, PassButton } from "@/components/play/action-bar";
import { EndTurnOverlay } from "./end-turn-overlay";
import { RoundCompleteScreen } from "./round-complete-screen";
import { RoundIndicator } from "./round-indicator";

type Props = PlayViewProps<MonikersSessionState, MonikersCard, MonikersAction>;

export function MonikersPlayView({ session, currentCard, dispatch }: Props) {
  const [showEndTurnOverlay, setShowEndTurnOverlay] = useState(false);

  if (isMonikersRoundComplete(session)) {
    return (
      <RoundCompleteScreen
        round={session.monikersRound}
        onNextRound={() => dispatch({ type: "nextRound" })}
      />
    );
  }

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
          onClick={() => dispatch({ type: "correct" })}
          icon={<Check className="h-5 w-5" />}
        >
          Correct!
        </ActionButton>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowEndTurnOverlay(true)}
          aria-label="End turn"
          className="h-14 w-14 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center hover:bg-secondary/80"
        >
          <Clock className="h-5 w-5" />
        </motion.button>
      </ActionBar>

      {showEndTurnOverlay && (
        <EndTurnOverlay
          cardsRemaining={monikersCardsLeft(session)}
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
  session,
}: HeaderViewProps<MonikersSessionState, MonikersCard>) {
  return <RoundIndicator round={session.monikersRound} />;
}
