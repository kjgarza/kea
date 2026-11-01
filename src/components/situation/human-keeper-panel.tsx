"use client";

import { useState } from "react";
import {
  ArrowLeft,
  Check,
  Eye,
  Flag,
  Plus,
  Trophy,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ActionButton } from "@/components/play/action-bar";
import type { KeeperPanelProps } from "./keeper-panels";
import { ElapsedTime } from "./elapsed-time";
import { HintLadder } from "./hint-ladder";
import { SetupScreen } from "./setup-screen";
import { SituationPanel, SituationShell, SituationStat } from "./situation-shell";

const now = () => new Date().toISOString();

/**
 * Human keeper (spec §3, F6/F7): the setup to read aloud, then — only after
 * a confirmed reveal — the crib sheet. The solution, facts and hints are not
 * rendered at all (not merely hidden) until `puzzle.solutionRevealed`.
 */
export function HumanKeeperPanel(props: KeeperPanelProps) {
  return props.puzzle.solutionRevealed ? (
    <KeeperCribSheet {...props} />
  ) : (
    <KeeperSetup {...props} />
  );
}

function KeeperSetup({ card, dispatch, t }: KeeperPanelProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <SetupScreen
        card={card}
        t={t}
        footer={
          <>
            <ActionButton
              variant="primary"
              className="w-full"
              onClick={() => setConfirmOpen(true)}
              icon={<Eye className="h-5 w-5" />}
            >
              {t("situation.setup.reveal")}
            </ActionButton>
            <ActionButton
              variant="pass"
              className="w-full"
              onClick={() => dispatch({ type: "backToPicker" })}
              icon={<ArrowLeft className="h-5 w-5" />}
            >
              {t("situation.setup.back")}
            </ActionButton>
          </>
        }
      />
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">{t("situation.reveal.title")}</DialogTitle>
            <DialogDescription>{t("situation.reveal.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-full h-12"
              onClick={() => setConfirmOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="rounded-full h-12"
              onClick={() => {
                setConfirmOpen(false);
                dispatch({ type: "revealSolution" });
              }}
            >
              {t("situation.reveal.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function KeeperCribSheet({ card, puzzle, dispatch, t }: KeeperPanelProps) {
  const found = new Set(puzzle.factsRevealed);

  return (
    <SituationShell
      testId="situation-keeper"
      footer={
        <>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => dispatch({ type: "removeQuestion" })}
              disabled={puzzle.questionCount === 0}
              aria-label={t("situation.keeper.removeQuestion")}
              title={t("situation.keeper.removeQuestion")}
              className="h-14 w-14 shrink-0 rounded-2xl border-2 bg-white/80 flex items-center justify-center disabled:opacity-40"
            >
              <Undo2 className="h-5 w-5" />
            </button>
            <ActionButton
              variant="secondary"
              onClick={() => dispatch({ type: "addQuestion" })}
              icon={<Plus className="h-5 w-5" />}
            >
              {t("situation.keeper.addQuestion")}
            </ActionButton>
          </div>
          <div className="flex gap-3">
            <ActionButton
              variant="pass"
              onClick={() => dispatch({ type: "end", outcome: "gave_up", at: now() })}
              icon={<Flag className="h-5 w-5" />}
            >
              {t("situation.keeper.giveUp")}
            </ActionButton>
            <ActionButton
              variant="primary"
              onClick={() => dispatch({ type: "end", outcome: "solved", at: now() })}
              icon={<Trophy className="h-5 w-5" />}
            >
              {t("situation.keeper.solved")}
            </ActionButton>
          </div>
        </>
      }
    >
      {/* Stats: time + questions */}
      <div className="grid grid-cols-2 gap-3">
        <SituationStat label={t("situation.keeper.time")}>
          <ElapsedTime puzzle={puzzle} />
        </SituationStat>
        <SituationStat label={t("situation.keeper.questions")}>
          <span className="tabular-nums" data-testid="situation-question-count">
            {puzzle.questionCount}
          </span>
        </SituationStat>
      </div>

      <SituationPanel className="py-3">
        <details>
          <summary className="cursor-pointer font-semibold py-1">
            {t("situation.keeper.setup")}: {card.title}
          </summary>
          <p className="mt-2 text-muted-foreground">{card.setup}</p>
        </details>
      </SituationPanel>

      <SituationPanel data-testid="situation-solution">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-situation mb-2">
          {t("situation.keeper.solution")}
        </h2>
        <p className="text-lg leading-relaxed">{card.solution}</p>
      </SituationPanel>

      <SituationPanel>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-situation">
          {t("situation.keeper.facts", { found: found.size, total: card.keyFacts.length })}
        </h2>
        <p className="text-xs text-muted-foreground mb-3">{t("situation.keeper.factsHelp")}</p>
        <ul className="space-y-2">
          {card.keyFacts.map((fact) => {
            const checked = found.has(fact.id);
            return (
              <li key={fact.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={checked}
                  onClick={() => dispatch({ type: "toggleFact", factId: fact.id })}
                  className={`w-full min-h-12 text-left rounded-2xl border-2 px-3 py-2 flex items-center gap-3 transition-colors ${
                    checked ? "border-situation bg-situation/10" : "border-border bg-white"
                  }`}
                >
                  <span
                    className={`h-6 w-6 shrink-0 rounded-full border-2 flex items-center justify-center ${
                      checked ? "bg-situation border-situation text-white" : "border-muted-foreground/40"
                    }`}
                  >
                    {checked && <Check className="h-4 w-4" />}
                  </span>
                  <span className={checked ? "font-medium" : ""}>{fact.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </SituationPanel>

      <HintLadder
        card={card}
        puzzle={puzzle}
        onHint={() => dispatch({ type: "useHint" })}
        nextLabel={(number) => t("situation.keeper.giveHint", { number })}
        t={t}
      />
    </SituationShell>
  );
}
