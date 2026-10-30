"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Lightbulb, Loader2, RotateCcw, X } from "lucide-react";
import type { TheoryVerdict } from "@/lib/ai/api";
import { gradeKeeperTheory, KeaApiError, type ClientErrorCode } from "@/lib/ai/client";
import { THEORY_LIMITS } from "@/lib/ai/config";
import type { SituationCard } from "@/types/card";
import type { SituationTheory } from "@/types/session";
import type { TranslateFn } from "@/lib/i18n";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { AppSettingsButton } from "@/components/settings/app-settings-sheet";
import { errorMessageKey } from "./ai-errors";
import type { KeeperPanelProps } from "./keeper-panels";
import { SituationPanel } from "./situation-shell";

export interface TheorySlotProps extends KeeperPanelProps {
  /** True in solo mode, false with the AI keeper. */
  solo: boolean;
}

/** A theory sent to the grader that has no verdict yet (kept on error). */
interface PendingTheory {
  text: string;
  status: "sending" | "error";
  error?: ClientErrorCode;
}

const VERDICT_STYLES: Record<TheoryVerdict, string> = {
  solved: "bg-emerald-600 text-white",
  close: "bg-amber-500 text-white",
  not_yet: "bg-slate-500 text-white",
};

const now = () => new Date().toISOString();

/**
 * Theory sheet (F10) inside the AI keeper and solo panels. The Worker grades
 * the theory (POST /keeper/grade); the reducer stores it in
 * `puzzle.theories` and a `solved` verdict ends the puzzle (end screen).
 * Other verdicts show the texts of the facts the theory got right and how
 * many are missing. Missing facts are never rendered: the view only reads
 * `correctFactIds`.
 */
export function TheorySlot({ deck, session, puzzle, card, dispatch, t }: TheorySlotProps) {
  const language = session.language === "es" ? "es" : "en";
  const online = useOnlineStatus();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingTheory | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The verdict arrives after an await: dispatch through the latest props.
  const latest = useRef({ dispatch });
  useEffect(() => {
    latest.current = { dispatch };
  });
  useEffect(() => () => abortRef.current?.abort(), []);

  const submit = useCallback(
    async (raw: string) => {
      const text = raw.trim().slice(0, THEORY_LIMITS.theoryMaxChars);
      if (!text) return;
      setPending({ text, status: "sending" });
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setPending({ text, status: "error", error: "network" });
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await gradeKeeperTheory(
          { deckId: deck.deckId, cardId: card.cardId, lang: language, theory: text },
          { signal: controller.signal }
        );
        latest.current.dispatch({
          type: "addTheory",
          cardId: card.cardId,
          text,
          correctFactIds: Array.isArray(response.correctFactIds) ? response.correctFactIds : [],
          at: now(),
        });
        setPending(null);
        setDraft("");
        setOpen(false);
      } catch (error) {
        if (controller.signal.aborted) return;
        const code: ClientErrorCode = error instanceof KeaApiError ? error.code : "network";
        setPending({ text, status: "error", error: code });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [deck.deckId, card.cardId, language]
  );

  const theories = puzzle.theories ?? [];
  const last = theories[theories.length - 1];
  const earlier = theories.slice(0, -1).reverse();
  const canSubmit = !pending && draft.trim().length > 0 && online;

  return (
    <SituationPanel className="space-y-3" data-testid="theory-sheet">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-situation flex items-center gap-2">
        <Lightbulb className="h-4 w-4" />
        {t("situation.theory.title")}
      </h2>
      <p className="text-sm text-muted-foreground">{t("situation.theory.help")}</p>

      {last && <TheoryResult theory={last} card={card} t={t} latest />}

      {!open && !pending && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="h-12 w-full rounded-2xl border-2 border-situation text-situation font-semibold"
          data-testid="theory-open"
        >
          {t("situation.theory.open")}
        </button>
      )}

      {(open || pending) && (
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit) void submit(draft);
          }}
        >
          <label htmlFor="theory-text" className="text-sm font-medium">
            {t("situation.theory.label")}
          </label>
          <textarea
            id="theory-text"
            value={pending ? pending.text : draft}
            onChange={(event) => setDraft(event.target.value)}
            readOnly={Boolean(pending)}
            maxLength={THEORY_LIMITS.theoryMaxChars}
            rows={4}
            placeholder={t("situation.theory.placeholder")}
            lang={language}
            className="w-full rounded-2xl border-2 border-border bg-white px-4 py-3 text-base outline-none focus:border-situation read-only:opacity-70"
            data-testid="theory-input"
          />
          {pending?.status === "sending" && (
            <p
              className="flex items-center gap-2 text-sm text-muted-foreground"
              role="status"
              data-testid="theory-pending"
              data-status="sending"
            >
              <Loader2 className="h-4 w-4 animate-spin text-situation" />
              {t("situation.theory.grading")}
            </p>
          )}
          {pending?.status === "error" && (
            <div
              className="rounded-2xl bg-rose-50 border border-rose-200 px-3 py-2 space-y-2"
              data-testid="theory-pending"
              data-status="error"
            >
              <p className="text-sm text-rose-900" role="alert" data-testid="theory-error">
                {pending.error && pending.error !== "upstream_error" && pending.error !== "internal"
                  ? t(errorMessageKey(pending.error))
                  : t("situation.theory.error")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => void submit(pending.text)}
                  className="h-10 rounded-full bg-situation px-4 text-sm font-semibold text-white inline-flex items-center gap-1.5"
                  data-testid="theory-retry"
                >
                  <RotateCcw className="h-4 w-4" />
                  {t("situation.ai.retry")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(pending.text);
                    setPending(null);
                  }}
                  className="h-10 rounded-full border px-3 text-sm inline-flex items-center gap-1.5"
                  data-testid="theory-edit"
                >
                  <X className="h-4 w-4" />
                  {t("situation.theory.cancel")}
                </button>
                {(pending.error === "missing_passcode" || pending.error === "unauthorized") && (
                  <AppSettingsButton t={t} />
                )}
              </div>
            </div>
          )}
          {!pending && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="h-12 rounded-2xl border px-4 text-sm"
                data-testid="theory-cancel"
              >
                {t("situation.theory.cancel")}
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className="h-12 flex-1 rounded-2xl bg-situation text-white font-semibold disabled:opacity-40"
                data-testid="theory-submit"
              >
                {t("situation.theory.submit")}
              </button>
            </div>
          )}
        </form>
      )}

      {earlier.length > 0 && (
        <details className="text-sm" data-testid="theory-history">
          <summary className="cursor-pointer font-medium">
            {t("situation.theory.history")} ({earlier.length})
          </summary>
          <ol className="mt-2 space-y-3">
            {earlier.map((theory, i) => (
              <li key={`${theory.at}-${i}`} data-testid="theory-history-entry">
                <TheoryResult theory={theory} card={card} t={t} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </SituationPanel>
  );
}

/** One graded theory: verdict, the facts it got right, and the missing count. */
function TheoryResult({
  theory,
  card,
  t,
  latest = false,
}: {
  theory: SituationTheory;
  card: SituationCard;
  t: TranslateFn;
  latest?: boolean;
}) {
  // Only facts the grader marked correct are ever looked up.
  const correct = new Set(theory.correctFactIds ?? []);
  const matched = card.keyFacts.filter((fact) => correct.has(fact.id));
  const missing = Math.max(0, theory.missingCount ?? card.keyFacts.length - matched.length);

  return (
    <motion.div
      initial={latest ? { scale: 0.95, opacity: 0 } : false}
      animate={{ scale: 1, opacity: 1 }}
      className={latest ? "rounded-2xl border-2 border-situation/30 bg-situation/5 p-4 space-y-2" : "space-y-1"}
      data-testid={latest ? "theory-result" : undefined}
      data-verdict={theory.verdict}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words text-sm italic">“{theory.text}”</p>
        <span
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${VERDICT_STYLES[theory.verdict]}`}
          data-testid="theory-verdict"
        >
          {t(`situation.theory.verdict.${theory.verdict}`)}
        </span>
      </div>
      {matched.length > 0 ? (
        <div className="text-sm">
          <p className="font-medium">{t("situation.theory.matched")}</p>
          <ul className="mt-1 space-y-1">
            {matched.map((fact) => (
              <li key={fact.id} className="flex items-start gap-2" data-testid="theory-matched-fact">
                <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
                <span>{fact.text}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{t("situation.theory.noneMatched")}</p>
      )}
      {missing > 0 && (
        <p className="text-sm font-semibold" data-testid="theory-missing" data-count={missing}>
          {missing === 1
            ? t("situation.theory.missingOne")
            : t("situation.theory.missingMany", { count: missing })}
        </p>
      )}
    </motion.div>
  );
}
