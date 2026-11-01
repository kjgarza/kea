"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { BellRing, Check, Timer } from "lucide-react";
import { TABOO_TIMER_SECONDS } from "@/lib/game/constants";
import { CardDisplay } from "../card-display";
import { CardStage } from "../card-stage";
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
export function TabooPlayView({ session, currentCard, dispatch }: StandardPlayViewProps) {
  const beep = useBeep();
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

  return (
    <>
      <CardStage>
        <CardDisplay card={currentCard} tabooTimerSeconds={seconds} tabooTimerActive={active} />
      </CardStage>
      {active ? (
        <ActionBar stacked>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => beep(800)}
            className="w-full h-16 rounded-2xl bg-destructive text-destructive-foreground font-bold text-lg flex items-center justify-center gap-2 shadow-lg shadow-destructive/30"
          >
            <BellRing className="h-6 w-6" />
            ALERT! Taboo Word Said
          </motion.button>
          <div className="flex gap-3">
            <PassButton onClick={onPass} />
            <ActionButton
              variant="primary"
              onClick={onGotIt}
              icon={<Check className="h-5 w-5" />}
            >
              Got it!
            </ActionButton>
          </div>
        </ActionBar>
      ) : (
        <ActionBar>
          <PassButton onClick={onPass} />
          <ActionButton
            variant="primary"
            onClick={() => setTimer((t) => ({ ...t, active: true }))}
            icon={<Timer className="h-5 w-5" />}
          >
            Start Timer
          </ActionButton>
        </ActionBar>
      )}
    </>
  );
}
