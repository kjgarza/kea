"use client";

import { Gavel, Search } from "lucide-react";
import type { CaseCard } from "@/types/card";
import type { TranslateFn } from "@/lib/i18n";
import { CASE_INPUT_LIMITS } from "@/lib/game/modules/case/logic";
import { ActionButton } from "@/components/play/action-bar";
import { CaseSheet } from "./case-sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  card: CaseCard;
  answers: Record<string, string>;
  onAnswer: (questionId: string, text: string) => void;
  onSubmit: () => void;
  t: TranslateFn;
}

/**
 * F16: the joint accusation — every case question in one form. Drafts are
 * saved in the session as they are typed; submitting locks them.
 */
export function AccusationSheet({ open, onOpenChange, card, answers, onAnswer, onSubmit, t }: Props) {
  const answered = card.questions.filter((q) => (answers[q.id] ?? "").trim()).length;
  return (
    <CaseSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("case.accuse.title")}
      description={t("case.accuse.description")}
      testId="case-accusation-sheet"
      footer={
        <>
          <ActionButton
            variant="primary"
            className="w-full"
            onClick={onSubmit}
            disabled={answered === 0}
            icon={<Gavel className="h-5 w-5" />}
          >
            <span data-testid="case-accuse-submit">{t("case.accuse.submit")}</span>
          </ActionButton>
          <ActionButton
            variant="pass"
            className="w-full"
            onClick={() => onOpenChange(false)}
            icon={<Search className="h-5 w-5" />}
          >
            {t("case.accuse.keepInvestigating")}
          </ActionButton>
        </>
      }
    >
      <p className="mb-3 text-sm font-medium text-muted-foreground" data-testid="case-accuse-progress">
        {t("case.accuse.answered", { answered, total: card.questions.length })}
      </p>
      <ol className="space-y-4">
        {card.questions.map((q, i) => (
          <li key={q.id} className="space-y-2">
            <label htmlFor={`case-answer-${q.id}`} className="flex items-start justify-between gap-3">
              <span className="font-semibold leading-snug">
                {i + 1}. {q.prompt}
              </span>
              <span className="shrink-0 rounded-full bg-case/15 px-2 py-0.5 text-xs font-semibold text-case-dark">
                {t("case.accuse.points", { points: q.points })}
              </span>
            </label>
            <input
              id={`case-answer-${q.id}`}
              type="text"
              value={answers[q.id] ?? ""}
              onChange={(e) => onAnswer(q.id, e.target.value)}
              placeholder={t("case.accuse.placeholder")}
              maxLength={CASE_INPUT_LIMITS.answerMaxChars}
              autoComplete="off"
              className="h-12 w-full rounded-2xl border bg-white px-4 text-base outline-none focus:ring-2 focus:ring-case/40"
              data-testid={`case-answer-${q.id}`}
            />
          </li>
        ))}
      </ol>
    </CaseSheet>
  );
}
