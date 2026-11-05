"use client";

import { useCallback, useRef } from "react";
import type { SwipeDirection } from "@/lib/ui/swipe";

/**
 * Remembers which way the current card should leave. Wrap the game's actions
 * with it, so a tap on Got it throws the card right and a tap on Pass throws
 * it left, the same as swiping.
 */
export function useCardFlight() {
  const direction = useRef<SwipeDirection>(1);
  const fly = useCallback(
    <A extends unknown[]>(to: SwipeDirection, action: (...args: A) => void) =>
      (...args: A) => {
        direction.current = to;
        action(...args);
      },
    []
  );
  return { direction, fly };
}
