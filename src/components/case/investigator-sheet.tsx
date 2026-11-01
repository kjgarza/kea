"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MessageSquareText, RotateCcw, Search, Send, X } from "lucide-react";
import type { CaseCard, Evidence } from "@/types/card";
import type { CaseInvestigatorEntry, CaseSessionState } from "@/types/session";
import type { AiLanguage } from "@/lib/ai/api";
import { askCaseInvestigator, KeaApiError, type ClientErrorCode } from "@/lib/ai/client";
import { CASE_AI_LIMITS } from "@/lib/ai/config";
import { investigatorTranscript, type CaseAction } from "@/lib/game/modules/case/logic";
import type { PlainMessageKey, TranslateFn } from "@/lib/i18n";
import { ComingLaterHint } from "@/components/ui/coming-later-hint";
import { CasePanel } from "./case-screens";
import { CaseSheet } from "./case-sheet";
import { EVIDENCE_ICONS } from "./evidence-drawer";

const now = () => new Date().toISOString();

/** A question sent to the Worker that has no answer yet (kept on error). */
interface PendingQuestion {
  q: string;
  status: "sending" | "error";
  error?: ClientErrorCode;
}

function errorKey(code: ClientErrorCode | undefined): PlainMessageKey {
  switch (code) {
    case "network":
      return "case.investigator.error.network";
    case "missing_passcode":
    case "unauthorized":
      return "case.investigator.error.passcode";
    case "rate_limited":
      return "case.investigator.error.limited";
    default:
      return "case.investigator.error.generic";
  }
}

/**
 * Board panel that opens the investigator sheet. Shown when AI is available,
 * and shown disabled with a "coming later" hint while AI play is deferred.
 */
export function InvestigatorPanel({
  count,
  onOpen,
  t,
  deferred = false,
}: {
  count: number;
  onOpen: () => void;
  t: TranslateFn;
  deferred?: boolean;
}) {
  const button = (
    <button
      type="button"
      onClick={onOpen}
      disabled={deferred}
      aria-disabled={deferred}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border-2 border-case/40 bg-white px-4 text-base font-semibold text-case-dark hover:bg-case/5 disabled:opacity-45 disabled:hover:bg-white"
      data-testid="case-investigator-open"
    >
      <Search className="h-5 w-5" />
      {t("case.investigator.open")}
      {count > 0 && (
        <span className="ml-1 text-xs font-medium text-muted-foreground">
          ({t("case.investigator.count", { count })})
        </span>
      )}
    </button>
  );
  return (
    <CasePanel data-testid="case-investigator-panel">
      <p className="mb-3 text-sm text-muted-foreground">{t("case.investigator.panelBody")}</p>
      {deferred ? (
        <ComingLaterHint message={t("ai.comingLater")} testId="case-investigator-hint">
          {button}
        </ComingLaterHint>
      ) : (
        button
      )}
    </CasePanel>
  );
}

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  deckId: string;
  card: CaseCard;
  session: CaseSessionState;
  language: AiLanguage;
  dispatch: (action: CaseAction) => void;
  /** Open an evidence item in the viewer (from a citation chip). */
  onViewEvidence: (evidence: Evidence) => void;
  t: TranslateFn;
}

/**
 * F15: the AI investigator. The group asks about the evidence; the Worker
 * answers from the opened evidence only and cites it. Citations render as
 * chips that open the evidence viewer. The transcript is saved in the
 * session (`recordInvestigator`), so it survives a reload; a question that
 * failed stays here with Retry/Discard.
 */
export function InvestigatorSheet({
  open,
  onOpenChange,
  deckId,
  card,
  session,
  language,
  dispatch,
  onViewEvidence,
  t,
}: SheetProps) {
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const transcript = investigatorTranscript(session);

  // The reply arrives after an await: use the latest dispatch and opened ids.
  const latest = useRef({ dispatch, opened: session.opened });
  useEffect(() => {
    latest.current = { dispatch, opened: session.opened };
  });
  useEffect(() => () => abortRef.current?.abort(), []);
  useEffect(() => {
    if (open) endRef.current?.scrollIntoView?.({ block: "end" });
  }, [open, transcript.length, pending?.status]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim().slice(0, CASE_AI_LIMITS.questionMaxChars);
      if (!q) return;
      setPending({ q, status: "sending" });
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await askCaseInvestigator(
          { deckId, cardId: card.cardId, lang: language, openedEvidenceIds: latest.current.opened, question: q },
          { signal: controller.signal }
        );
        latest.current.dispatch({
          type: "recordInvestigator",
          cardId: card.cardId,
          q,
          answer: typeof response.answer === "string" ? response.answer : "",
          citedEvidenceIds: Array.isArray(response.citedEvidenceIds) ? response.citedEvidenceIds : [],
          inEvidence: response.inEvidence !== false,
          at: now(),
        });
        setPending(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        const code: ClientErrorCode = error instanceof KeaApiError ? error.code : "network";
        setPending({ q, status: "error", error: code });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [deckId, card.cardId, language]
  );

  const canSend = !pending && draft.trim().length > 0;
  const submit = () => {
    if (!canSend) return;
    const q = draft;
    setDraft("");
    void ask(q);
  };

  return (
    <CaseSheet
      open={open}
      onOpenChange={onOpenChange}
      title={t("case.investigator.title")}
      description={t("case.investigator.description")}
      testId="case-investigator-sheet"
      footer={
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor="case-investigator-question" className="sr-only">
            {t("case.investigator.inputLabel")}
          </label>
          <input
            id="case-investigator-question"
            type="text"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={CASE_AI_LIMITS.questionMaxChars}
            placeholder={t("case.investigator.placeholder")}
            enterKeyHint="send"
            autoComplete="off"
            lang={language}
            className="h-14 min-w-0 flex-1 rounded-2xl border-2 border-border bg-white px-4 text-base outline-none focus:border-case"
            data-testid="case-investigator-input"
          />
          <button
            type="submit"
            disabled={!canSend}
            aria-label={t("case.investigator.send")}
            title={t("case.investigator.send")}
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-case text-white disabled:opacity-40"
            data-testid="case-investigator-send"
          >
            <Send className="h-5 w-5" />
          </button>
        </form>
      }
    >
      <ol className="space-y-4" aria-live="polite" data-testid="case-investigator-transcript">
        {transcript.length === 0 && !pending && (
          <li className="text-sm text-muted-foreground">{t("case.investigator.empty")}</li>
        )}
        {transcript.map((entry, index) => (
          <InvestigatorEntry key={`${entry.at}-${index}`} entry={entry} card={card} onView={onViewEvidence} t={t} />
        ))}
        {pending && (
          <li className="space-y-2" data-testid="case-investigator-pending" data-status={pending.status}>
            <Question text={pending.q} />
            {pending.status === "sending" ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("case.investigator.thinking")}
              </p>
            ) : (
              <div className="space-y-2 rounded-2xl border border-rose-200 bg-rose-50 p-3" role="alert">
                <p className="text-sm text-rose-900" data-testid="case-investigator-error">
                  {t(errorKey(pending.error))}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void ask(pending.q)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold"
                    data-testid="case-investigator-retry"
                  >
                    <RotateCcw className="h-4 w-4" />
                    {t("case.investigator.retry")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-muted-foreground"
                    data-testid="case-investigator-discard"
                  >
                    <X className="h-4 w-4" />
                    {t("case.investigator.discard")}
                  </button>
                </div>
              </div>
            )}
          </li>
        )}
      </ol>
      <div ref={endRef} />
    </CaseSheet>
  );
}

function Question({ text }: { text: string }) {
  return (
    <p className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-case px-4 py-2 text-white">{text}</p>
  );
}

function InvestigatorEntry({
  entry,
  card,
  onView,
  t,
}: {
  entry: CaseInvestigatorEntry;
  card: CaseCard;
  onView: (evidence: Evidence) => void;
  t: TranslateFn;
}) {
  const byId = new Map(card.evidence.map((e) => [e.id, e]));
  const cited = entry.citedEvidenceIds.map((id) => byId.get(id)).filter((e): e is Evidence => Boolean(e));
  return (
    <li className="space-y-2" data-testid="case-investigator-entry" data-in-evidence={entry.inEvidence ? "true" : "false"}>
      <Question text={entry.q} />
      <div className="max-w-[92%] rounded-2xl rounded-bl-md border bg-white px-4 py-3">
        <p className="flex gap-2 leading-relaxed" data-testid="case-investigator-answer">
          <MessageSquareText className="mt-1 h-4 w-4 shrink-0 text-case-dark" />
          <span>
            {entry.inEvidence ? (
              <AnswerText text={entry.answer} byId={byId} cited={new Set(entry.citedEvidenceIds)} onView={onView} />
            ) : (
              <span className="italic text-muted-foreground">{t("case.investigator.notInEvidence")}</span>
            )}
          </span>
        </p>
        {cited.length > 0 && (
          <div className="mt-3">
            <span className="sr-only">{t("case.investigator.cites")}</span>
            <ul className="flex flex-wrap gap-2" aria-label={t("case.investigator.cites")}>
              {cited.map((e) => (
                <li key={e.id}>
                  <EvidenceChip evidence={e} onView={onView} testId={`case-investigator-cite-${e.id}`} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </li>
  );
}

/** Reply text; inline `` `evidence-id` `` citations become evidence titles. */
function AnswerText({
  text,
  byId,
  cited,
  onView,
}: {
  text: string;
  byId: Map<string, Evidence>;
  cited: Set<string>;
  onView: (evidence: Evidence) => void;
}) {
  const parts = text.split(/`([^`\n]+)`/);
  return (
    <>
      {parts.map((part, index) => {
        if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
        const evidence = cited.has(part) ? byId.get(part) : undefined;
        if (!evidence) return <Fragment key={index}>{part}</Fragment>;
        return (
          <button
            key={index}
            type="button"
            onClick={() => onView(evidence)}
            className="font-semibold text-case-dark underline decoration-case/40 underline-offset-2"
          >
            {evidence.title}
          </button>
        );
      })}
    </>
  );
}

function EvidenceChip({ evidence, onView, testId }: { evidence: Evidence; onView: (e: Evidence) => void; testId: string }) {
  const Icon = EVIDENCE_ICONS[evidence.kind];
  return (
    <button
      type="button"
      onClick={() => onView(evidence)}
      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-case/30 bg-case/5 px-3 py-2 text-sm font-medium hover:bg-case/10"
      data-testid={testId}
    >
      <Icon className="h-4 w-4 text-case-dark" />
      {evidence.title}
    </button>
  );
}
