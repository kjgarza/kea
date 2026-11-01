"use client";

import { ArrowRight } from "lucide-react";
import { CardDisplay } from "../card-display";
import { CardStage } from "../card-stage";
import { ActionBar, ActionButton, PassButton } from "../action-bar";
import type { StandardPlayViewProps } from "./standard-play-view";

/** Trivia: reveal the answer on the card; Next unlocks after reveal. */
export function TriviaPlayView({ session, currentCard, dispatch }: StandardPlayViewProps) {
  if (!currentCard) return null;

  return (
    <>
      <CardStage>
        <CardDisplay
          card={currentCard}
          isRevealed={session.isRevealed}
          onReveal={() => dispatch({ type: "reveal" })}
        />
      </CardStage>
      <ActionBar>
        <PassButton onClick={() => dispatch({ type: "pass" })} />
        <ActionButton
          variant="primary"
          onClick={() => dispatch({ type: "next" })}
          disabled={!session.isRevealed}
          icon={<ArrowRight className="h-5 w-5" />}
        >
          Next
        </ActionButton>
      </ActionBar>
    </>
  );
}
