"use client";

import { useEffect, useState } from "react";
import type { SituationPuzzleState } from "@/types/session";
import { formatElapsed, puzzleElapsedMs } from "@/lib/game/modules/situation/logic";

/** Current time, re-read every second while `active`. */
function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

interface Props {
  puzzle: SituationPuzzleState;
  className?: string;
}

/**
 * Time played on a puzzle, derived from `startedAt`/`endedAt` in the session,
 * so it keeps counting across reloads and freezes once the puzzle ends.
 */
export function ElapsedTime({ puzzle, className }: Props) {
  const now = useNow(puzzle.endedAt === null);
  return (
    <span className={`tabular-nums ${className ?? ""}`} data-testid="situation-timer">
      {formatElapsed(puzzleElapsedMs(puzzle, now))}
    </span>
  );
}
