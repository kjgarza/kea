"use client";

import { motion } from "framer-motion";
import { CircleHelp, Lightbulb } from "lucide-react";
import type { SituationCard } from "@/types/card";
import type { SituationPuzzleState } from "@/types/session";
import type { TranslateFn } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { SituationPanel } from "./situation-shell";

interface Props {
  card: SituationCard;
  puzzle: SituationPuzzleState;
  onHint: () => void;
  /** Button label for the next hint ("Give hint 2" / "Get hint 2"). */
  nextLabel: (number: number) => string;
  /** Optional note under the heading (e.g. the solo score cost). */
  note?: React.ReactNode;
  t: TranslateFn;
}

/** Ordered hints (mild → strong): those used so far, then the next-hint button. */
export function HintLadder({ card, puzzle, onHint, nextLabel, note, t }: Props) {
  const usedHints = card.hints.slice(0, puzzle.hintsUsed);
  const hintsLeft = puzzle.hintsUsed < card.hints.length;

  return (
    <SituationPanel>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-situation mb-3">
        {t("situation.keeper.hints")}
      </h2>
      {note}
      {usedHints.length > 0 && (
        <ol className="space-y-2 mb-3" data-testid="situation-hints">
          {usedHints.map((hint, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2"
            >
              <span className="block text-xs font-semibold text-amber-800">
                {t("situation.keeper.hint", { number: i + 1 })}
              </span>
              {hint}
            </motion.li>
          ))}
        </ol>
      )}
      <Button
        variant="outline"
        className="w-full h-12 rounded-2xl"
        disabled={!hintsLeft}
        onClick={onHint}
        data-testid="situation-hint-button"
      >
        {hintsLeft ? <Lightbulb className="h-4 w-4 mr-2" /> : <CircleHelp className="h-4 w-4 mr-2" />}
        {hintsLeft ? nextLabel(puzzle.hintsUsed + 1) : t("situation.keeper.noMoreHints")}
      </Button>
    </SituationPanel>
  );
}
