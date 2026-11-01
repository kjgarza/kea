"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RotateCcw, Scale } from "lucide-react";
import type { CaseCard } from "@/types/card";
import type { Deck } from "@/types/deck";
import type { CaseSessionState } from "@/types/session";
import type { AiLanguage } from "@/lib/ai/api";
import { judgeCaseAnswers } from "@/lib/ai/client";
import type { CaseAction } from "@/lib/game/modules/case/logic";
import type { TranslateFn } from "@/lib/i18n";
import { useAiPlayAvailability } from "@/hooks/use-ai-play-availability";

export interface JudgeSlotProps {
  deck: Deck<CaseCard>;
  session: CaseSessionState;
  card: CaseCard;
  /** Question ids whose answers did not match locally. */
  unmatchedIds: string[];
  /** Language the judge works in (the UI language). */
  language: AiLanguage;
  dispatch: (action: CaseAction) => void;
  t: TranslateFn;
}

type JudgeStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "done"; count: number }
  | { state: "error" };

/**
 * The answer judge (#37, F16) on the review screen. When AI is available it
 * sends the answers that did not match locally (and that the group has not
 * marked yet) to /case/judge once per accusation and dispatches
 * `judgeMarks`: the reducer pre-marks only unmarked answers and the group
 * can override every mark. Without a Worker (or passcode) it renders
 * nothing and the group marks everything by hand, as before.
 */
export function JudgeSlot({ deck, session, card, unmatchedIds, language, dispatch, t }: JudgeSlotProps) {
  const available = useAiPlayAvailability() === "available";
  const [status, setStatus] = useState<JudgeStatus>({ state: "idle" });
  const attempted = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Answers arrive after an await: always dispatch with the latest props.
  const latest = useRef({ dispatch, session, unmatchedIds });
  useEffect(() => {
    latest.current = { dispatch, session, unmatchedIds };
  });
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async () => {
    const { session: s, unmatchedIds: ids } = latest.current;
    const toJudge = ids.filter((id) => !s.marks?.[id]);
    if (toJudge.length === 0) return;
    const answers = Object.fromEntries(toJudge.map((id) => [id, s.answers[id] ?? ""]));
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ state: "checking" });
    try {
      const response = await judgeCaseAnswers(
        { deckId: deck.deckId, cardId: card.cardId, lang: language, answers },
        { signal: controller.signal }
      );
      const results = (Array.isArray(response.results) ? response.results : []).filter(
        (r) => toJudge.includes(r.questionId) && typeof r.correct === "boolean"
      );
      latest.current.dispatch({ type: "judgeMarks", results });
      setStatus({ state: "done", count: results.length });
    } catch {
      if (controller.signal.aborted) return;
      setStatus({ state: "error" });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [deck.deckId, card.cardId, language]);

  // Once per accusation (a new accusation after "Change answers" asks again).
  const key = `${card.cardId}|${session.accusedAt ?? ""}`;
  const needsJudge = available && unmatchedIds.some((id) => !session.marks?.[id]);
  useEffect(() => {
    if (!needsJudge || attempted.current === key) return;
    attempted.current = key;
    // Deferred so Strict Mode's test unmount cancels it before any request
    // is sent (no duplicate, metered call). Unmounted before the answer:
    // abort and let the next mount ask again.
    const timer = setTimeout(() => void run(), 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
      attempted.current = null;
    };
  }, [needsJudge, key, run]);

  if (!available || status.state === "idle") return null;

  return (
    <div
      className="flex items-start gap-2 rounded-2xl border border-case/20 bg-case/5 px-4 py-3 text-sm"
      role="status"
      data-testid="case-judge-status"
      data-status={status.state}
    >
      {status.state === "checking" ? (
        <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-case-dark" />
      ) : (
        <Scale className="mt-0.5 h-4 w-4 shrink-0 text-case-dark" />
      )}
      <div className="flex-1 space-y-2">
        <p>
          {status.state === "checking" && t("case.judge.checking")}
          {status.state === "done" && t("case.judge.done", { count: status.count })}
          {status.state === "error" && t("case.judge.error")}
        </p>
        {status.state === "error" && (
          <button
            type="button"
            onClick={() => void run()}
            className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-white px-3 font-semibold"
            data-testid="case-judge-retry"
          >
            <RotateCcw className="h-4 w-4" />
            {t("case.judge.retry")}
          </button>
        )}
      </div>
    </div>
  );
}
