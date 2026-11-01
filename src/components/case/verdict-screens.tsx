"use client";

import { ArrowRight, Check, CheckCircle2, Eye, Pencil, Trophy, X, XCircle } from "lucide-react";
import type { CaseCard, CaseQuestion } from "@/types/card";
import type { CaseMark, CaseScoredAnswer } from "@/types/session";
import type { TranslateFn } from "@/lib/i18n";
import { matchAnswer } from "@/lib/game/modules/case/scoring";
import { ActionButton } from "@/components/play/action-bar";
import { Markdown } from "@/components/markdown/markdown";
import { CasePanel, CaseShell } from "./case-screens";
import { SourceCredit } from "@/components/credits/source-credit";

interface ReviewProps {
  card: CaseCard;
  answers: Record<string, string>;
  marks: Record<string, CaseMark>;
  onMark: (questionId: string, correct: boolean) => void;
  onReveal: () => void;
  onEdit: () => void;
  /** The answer judge slot (#37). */
  judge?: React.ReactNode;
  t: TranslateFn;
}

/**
 * F16: the accusation is locked. Answers matching the solution or an
 * accepted variant score on their own; the group compares the others with
 * the solution and marks them right or wrong before the walkthrough.
 */
export function CaseReviewScreen({ card, answers, marks, onMark, onReveal, onEdit, judge, t }: ReviewProps) {
  const pending = card.questions.filter(
    (q) => matchAnswer(q, answers[q.id]) === null && !marks[q.id]
  ).length;
  return (
    <CaseShell
      testId="case-review"
      footer={
        <>
          {pending > 0 && (
            <p className="text-center text-sm font-medium text-muted-foreground" data-testid="case-review-pending">
              {t("case.review.pending", { count: pending })}
            </p>
          )}
          <ActionButton
            variant="primary"
            className="w-full"
            onClick={onReveal}
            disabled={pending > 0}
            icon={<Eye className="h-5 w-5" />}
          >
            {t("case.review.reveal")}
          </ActionButton>
          <ActionButton
            variant="pass"
            className="w-full"
            onClick={onEdit}
            icon={<Pencil className="h-5 w-5" />}
          >
            {t("case.review.edit")}
          </ActionButton>
        </>
      }
    >
      <div className="pt-2 space-y-1">
        <h1 className="text-2xl font-bold font-display">{t("case.review.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("case.review.body")}</p>
      </div>
      {judge}
      {card.questions.map((q, i) => (
        <ReviewItem
          key={q.id}
          index={i}
          question={q}
          answer={answers[q.id] ?? ""}
          mark={marks[q.id]}
          onMark={(correct) => onMark(q.id, correct)}
          t={t}
        />
      ))}
    </CaseShell>
  );
}

function ReviewItem({
  index,
  question,
  answer,
  mark,
  onMark,
  t,
}: {
  index: number;
  question: CaseQuestion;
  answer: string;
  mark: CaseMark | undefined;
  onMark: (correct: boolean) => void;
  t: TranslateFn;
}) {
  const match = matchAnswer(question, answer);
  return (
    <CasePanel
      className="space-y-3"
      data-testid={`case-review-item-${question.id}`}
      data-match={match ?? "unmatched"}
    >
      <p className="font-semibold leading-snug">
        {index + 1}. {question.prompt}
      </p>
      <AnswerLines question={question} answer={answer} t={t} />
      {match ? (
        <p
          className={`flex items-center gap-2 text-sm font-semibold ${
            match === "blank" ? "text-muted-foreground" : "text-emerald-700"
          }`}
        >
          {match === "blank" ? <XCircle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
          {t(`case.review.match.${match}`)}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-semibold">{t("case.review.doesItCount")}</p>
          {mark?.by === "judge" && (
            <p className="text-xs text-muted-foreground" data-testid={`case-judge-note-${question.id}`}>
              {t("case.review.judgeSays", {
                verdict: t(mark.correct ? "case.review.correct" : "case.review.incorrect"),
              })}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2" role="group" aria-label={t("case.review.doesItCount")}>
            <MarkButton
              active={mark?.correct === true}
              onClick={() => onMark(true)}
              tone="good"
              testId={`case-mark-correct-${question.id}`}
            >
              <Check className="h-4 w-4" />
              {t("case.review.correct")}
            </MarkButton>
            <MarkButton
              active={mark?.correct === false}
              onClick={() => onMark(false)}
              tone="bad"
              testId={`case-mark-incorrect-${question.id}`}
            >
              <X className="h-4 w-4" />
              {t("case.review.incorrect")}
            </MarkButton>
          </div>
        </div>
      )}
    </CasePanel>
  );
}

function AnswerLines({ question, answer, t }: { question: CaseQuestion; answer: string; t: TranslateFn }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
      <dt className="text-muted-foreground">{t("case.review.yourAnswer")}</dt>
      <dd className="font-medium" data-testid={`case-given-${question.id}`}>
        {answer.trim() || <span className="italic text-muted-foreground">{t("case.review.noAnswer")}</span>}
      </dd>
      <dt className="text-muted-foreground">{t("case.review.solution")}</dt>
      <dd className="font-medium">{question.answer}</dd>
    </dl>
  );
}

function MarkButton({
  active,
  onClick,
  tone,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  tone: "good" | "bad";
  testId: string;
  children: React.ReactNode;
}) {
  const activeClass = tone === "good" ? "bg-emerald-600 text-white border-emerald-600" : "bg-rose-600 text-white border-rose-600";
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      data-testid={testId}
      className={`flex h-12 items-center justify-center gap-2 rounded-2xl border-2 font-semibold transition-colors ${
        active ? activeClass : "bg-white"
      }`}
    >
      {children}
    </button>
  );
}

interface ClosedProps {
  card: CaseCard;
  answers: Record<string, string>;
  scored: CaseScoredAnswer[];
  score: number;
  max: number;
  hasMore: boolean;
  onNext: () => void;
  notices?: React.ReactNode;
  t: TranslateFn;
}

/** F17: the walkthrough and the team score. */
export function CaseClosedScreen({ card, answers, scored, score, max, hasMore, onNext, notices, t }: ClosedProps) {
  const byId = new Map(scored.map((s) => [s.questionId, s]));
  const solved = scored.every((s) => s.correct);
  return (
    <CaseShell
      testId="case-closed"
      footer={
        <ActionButton
          variant="primary"
          className="w-full"
          onClick={onNext}
          icon={<ArrowRight className="h-5 w-5" />}
        >
          {t(hasMore ? "case.closed.next" : "case.closed.finish")}
        </ActionButton>
      }
    >
      <div className="pt-4 text-center space-y-2">
        <Trophy className={`mx-auto h-12 w-12 ${solved ? "text-amber-500" : "text-case"}`} />
        <h1 className="text-2xl font-bold font-display">
          {t(solved ? "case.closed.solved" : "case.closed.title")}
        </h1>
        <p className="text-sm text-muted-foreground">{card.title}</p>
      </div>
      <CasePanel className="text-center">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {t("case.closed.score")}
        </div>
        <div className="text-3xl font-bold font-display" data-testid="case-score" data-score={score} data-max={max}>
          {t("case.closed.points", { score, max })}
        </div>
      </CasePanel>

      <ul className="space-y-2">
        {card.questions.map((q) => {
          const result = byId.get(q.id);
          return (
            <li
              key={q.id}
              className="rounded-2xl border bg-white/90 p-4 space-y-2"
              data-testid={`case-result-${q.id}`}
              data-correct={result?.correct ? "true" : "false"}
            >
              <p className="flex items-start gap-2 font-semibold leading-snug">
                {result?.correct ? (
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                ) : (
                  <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
                )}
                <span className="flex-1">{q.prompt}</span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {result?.points ?? 0}/{q.points}
                </span>
              </p>
              <AnswerLines question={q} answer={answers[q.id] ?? ""} t={t} />
            </li>
          );
        })}
      </ul>

      <CasePanel>
        <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t("case.closed.walkthrough")}
        </h2>
        <Markdown source={card.walkthrough} data-testid="case-walkthrough" />
        <SourceCredit source={card.source} t={t} className="mt-4 border-t pt-3" />
      </CasePanel>
      {notices}
    </CaseShell>
  );
}
