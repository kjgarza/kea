"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check, List } from "lucide-react";
import type { SituationCard } from "@/types/card";
import type { SituationPuzzleState } from "@/types/session";
import type { TranslateFn } from "@/lib/i18n";
import { ActionButton } from "@/components/play/action-bar";
import { ElapsedTime } from "./elapsed-time";
import { SituationPanel, SituationShell } from "./situation-shell";

interface Props {
  card: SituationCard;
  puzzle: SituationPuzzleState;
  /** Whether more puzzles are left in the stack. */
  hasMore: boolean;
  onNext: () => void;
  onChoose: () => void;
  /** Install prompt / export reminder (#28), shown under the stats. */
  notices?: React.ReactNode;
  t: TranslateFn;
}

/** F11: full solution, time, questions, hints (and transcript in AI modes). */
export function SituationEndScreen({
  card,
  puzzle,
  hasMore,
  onNext,
  onChoose,
  notices,
  t,
}: Props) {
  const found = new Set(puzzle.factsRevealed);
  const solved = puzzle.outcome === "solved";
  const questions = Math.max(puzzle.questionCount, puzzle.transcript.length);

  return (
    <SituationShell
      testId="situation-end"
      footer={
        hasMore ? (
          <div className="flex gap-3">
            <ActionButton variant="pass" onClick={onChoose} icon={<List className="h-5 w-5" />}>
              {t("situation.end.choose")}
            </ActionButton>
            <ActionButton variant="primary" onClick={onNext} icon={<ArrowRight className="h-5 w-5" />}>
              {t("situation.end.next")}
            </ActionButton>
          </div>
        ) : (
          <ActionButton
            variant="primary"
            className="w-full"
            onClick={onNext}
            icon={<ArrowRight className="h-5 w-5" />}
          >
            {t("situation.end.finish")}
          </ActionButton>
        )
      }
    >
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center pt-2"
      >
        <div className="text-5xl mb-2" aria-hidden>
          {solved ? "🎉" : "🕵️"}
        </div>
        <h1 className="text-2xl font-bold font-display">
          {solved ? t("situation.end.solved") : t("situation.end.gaveUp")}
        </h1>
        <p className="text-muted-foreground">{card.title}</p>
      </motion.div>

      <dl className="grid grid-cols-4 gap-2 text-center" data-testid="situation-end-stats">
        <EndStat label={t("situation.end.time")}>
          <ElapsedTime puzzle={puzzle} />
        </EndStat>
        <EndStat label={t("situation.end.questions")}>
          <span data-testid="situation-end-questions">{questions}</span>
        </EndStat>
        <EndStat label={t("situation.end.hints")}>
          <span data-testid="situation-end-hints">{puzzle.hintsUsed}</span>
        </EndStat>
        <EndStat label={t("situation.end.facts")}>
          <span data-testid="situation-end-facts">
            {found.size}/{card.keyFacts.length}
          </span>
        </EndStat>
      </dl>

      {notices}

      <SituationPanel>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-situation mb-2">
          {t("situation.end.solution")}
        </h2>
        <p className="text-lg leading-relaxed" data-testid="situation-end-solution">
          {card.solution}
        </p>
        <ul className="mt-4 space-y-1.5">
          {card.keyFacts.map((fact) => (
            <li key={fact.id} className="flex items-start gap-2 text-sm">
              <Check
                className={`h-4 w-4 mt-0.5 shrink-0 ${
                  found.has(fact.id) ? "text-situation" : "text-muted-foreground/30"
                }`}
              />
              <span className={found.has(fact.id) ? "" : "text-muted-foreground"}>{fact.text}</span>
            </li>
          ))}
        </ul>
      </SituationPanel>

      {puzzle.transcript.length > 0 && (
        <SituationPanel>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-situation mb-2">
            {t("situation.end.transcript")}
          </h2>
          <ol className="space-y-1 text-sm">
            {puzzle.transcript.map((entry, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>{entry.q}</span>
                <span className="font-semibold shrink-0">{t(`situation.answer.${entry.a}`)}</span>
              </li>
            ))}
          </ol>
        </SituationPanel>
      )}
    </SituationShell>
  );
}

function EndStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/90 border shadow-sm px-1 py-2">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground truncate">
        {label}
      </dt>
      <dd className="text-xl font-bold font-display tabular-nums">{children}</dd>
    </div>
  );
}
