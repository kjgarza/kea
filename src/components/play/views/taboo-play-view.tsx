"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BellRing } from "lucide-react";
import { TABOO_TIMER_SECONDS } from "@/lib/game/constants";
import { useLocale } from "@/lib/i18n";
import { CardDisplay } from "../card-display";
import { CardStage, useCardFlight } from "../card-stage";
import { ActionBar, ActionButton, PassButton } from "../action-bar";
import type { StandardPlayViewProps } from "./standard-play-view";

/** Short sine beep; silently ignored where Web Audio is unavailable. */
function useBeep() {
  const audioContextRef = useRef<AudioContext | null>(null);
  return useCallback((frequency: number) => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      const oscillator = ctx.createOscillator();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, ctx.currentTime);
      oscillator.connect(ctx.destination);
      oscillator.start();
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // Ignore errors (e.g. unsupported browser)
    }
  }, []);
}

/**
 * Taboo: the 60s timer lives here and resets whenever the card changes.
 */
export function TabooPlayView({ deck, session, currentCard, dispatch }: StandardPlayViewProps) {
  const { t } = useLocale(deck.language);
  const beep = useBeep();
  const { direction, fly } = useCardFlight();
  const [timer, setTimer] = useState({
    cardId: session.currentCardId,
    seconds: TABOO_TIMER_SECONDS,
    active: false,
  });

  // Reset when the card changes (state adjustment during render, no effect).
  if (timer.cardId !== session.currentCardId) {
    setTimer({ cardId: session.currentCardId, seconds: TABOO_TIMER_SECONDS, active: false });
  }

  const { seconds, active } = timer;

  // Countdown tick
  useEffect(() => {
    if (!active) return;
    if (seconds <= 0) {
      setTimer((t) => ({ ...t, active: false, seconds: TABOO_TIMER_SECONDS }));
      beep(400);
      return;
    }
    const id = setInterval(
      () => setTimer((t) => ({ ...t, seconds: t.seconds - 1 })),
      1000
    );
    return () => clearInterval(id);
  }, [active, seconds, beep]);

  if (!currentCard) return null;

  const onPass = () => dispatch({ type: "pass" });
  const onGotIt = () => dispatch({ type: "next" });
  const isLow = active && seconds <= 10;

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

      {/* Lives outside the card so it stays put while cards change. */}
      <div className="flex shrink-0 items-center gap-3 px-4 pt-2">
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-foreground/15">
          <div
            className={`h-full origin-left rounded-full transition-transform duration-1000 ease-linear ${
              isLow ? "bg-game" : "bg-foreground"
            }`}
            style={{ transform: `scaleX(${seconds / TABOO_TIMER_SECONDS})` }}
          />
        </div>
        <span
          className={`font-display w-14 text-right text-2xl leading-none font-extrabold tabular-nums ${
            active ? "" : "text-muted-foreground"
          }`}
        >
          {String(seconds).padStart(2, "0")}s
        </span>
      </div>

      {active ? (
        <ActionBar stacked>
          <button
            type="button"
            onClick={() => beep(800)}
            className="font-display flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-paper text-xl font-extrabold text-game-deep transition-transform active:scale-[0.97]"
          >
            <BellRing className="size-6" aria-hidden />
            {t("actions.alert")}
          </button>
          <div className="flex gap-2.5">
            <PassButton onClick={fly(-1, onPass)} language={deck.language} />
            <ActionButton variant="primary" onClick={fly(1, onGotIt)}>
              {t("actions.gotIt")}
            </ActionButton>
          </div>
        </ActionBar>
      ) : (
        <ActionBar>
          <PassButton onClick={fly(-1, onPass)} language={deck.language} />
          <ActionButton
            variant="primary"
            onClick={() => setTimer((t) => ({ ...t, active: true }))}
          >
            {t("actions.startTimer")}
          </ActionButton>
        </ActionBar>
      )}
    </>
  );
}
