"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Flag, Loader2, Mic, MicOff, RotateCcw, Send, Trophy, WifiOff, X } from "lucide-react";
import type { KeeperAnswer, SituationPuzzleState } from "@/types/session";
import type { SituationCard } from "@/types/card";
import { askKeeper, KeaApiError, type ClientErrorCode } from "@/lib/ai/client";
import { KEEPER_LIMITS } from "@/lib/ai/config";
import { questionsAsked, soloScore, SOLO_SCORE } from "@/lib/game/modules/situation/logic";
import { translate, type PlainMessageKey, type TranslateFn } from "@/lib/i18n";
import { useOnlineStatus } from "@/hooks/use-online-status";
import { speechLang, useSpeechRecognition } from "@/hooks/use-speech-recognition";
import { ActionButton } from "@/components/play/action-bar";
import { AppSettingsButton } from "@/components/settings/app-settings-sheet";
import type { KeeperPanelProps } from "./keeper-panels";
import { ElapsedTime } from "./elapsed-time";
import { HintLadder } from "./hint-ladder";
import { SituationPanel, SituationShell, SituationStat } from "./situation-shell";
import { TheorySlot } from "./theory-slot";

const now = () => new Date().toISOString();

/** A question sent to the Worker that has no answer yet (kept on error). */
interface PendingQuestion {
  q: string;
  status: "sending" | "error";
  error?: ClientErrorCode;
}

const ANSWER_STYLES: Record<KeeperAnswer, string> = {
  yes: "bg-emerald-600 text-white",
  no: "bg-rose-600 text-white",
  partly: "bg-amber-500 text-white",
  irrelevant: "bg-slate-500 text-white",
  rephrase: "bg-sky-600 text-white",
};

function errorMessageKey(code: ClientErrorCode | undefined): PlainMessageKey {
  switch (code) {
    case "network":
      return "situation.ai.error.network";
    case "missing_passcode":
    case "unauthorized":
      return "situation.ai.error.passcode";
    case "rate_limited":
      return "situation.ai.error.limited";
    case "not_configured":
      return "situation.ai.error.notConfigured";
    default:
      return "situation.ai.error.generic";
  }
}

/** AI keeper (spec §3, F8/F9): everyone plays, the Worker answers. */
export function AiKeeperPanel(props: KeeperPanelProps) {
  return <AiPlay {...props} solo={false} />;
}

/** Solo (spec §3): AI keeper plus a running score. */
export function SoloKeeperPanel(props: KeeperPanelProps) {
  return <AiPlay {...props} solo />;
}

function AiPlay({ solo, ...props }: KeeperPanelProps & { solo: boolean }) {
  const { deck, session, puzzle, card, dispatch, t } = props;
  const language = session.language === "es" ? "es" : "en";
  const online = useOnlineStatus();
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<PendingQuestion | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // The answer arrives after an await: dispatch through the latest props so a
  // hint taken meanwhile is not overwritten by a stale session.
  const latest = useRef({ dispatch, puzzle });
  useEffect(() => {
    latest.current = { dispatch, puzzle };
  });
  useEffect(() => () => abortRef.current?.abort(), []);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim().slice(0, KEEPER_LIMITS.questionMaxChars);
      if (!q) return;
      setPending({ q, status: "sending" });
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setPending({ q, status: "error", error: "network" });
        return;
      }
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await askKeeper(
          {
            deckId: deck.deckId,
            cardId: card.cardId,
            lang: language,
            transcript: latest.current.puzzle.transcript
              .slice(-KEEPER_LIMITS.transcriptMaxEntries)
              .map(({ q: prevQ, a }) => ({ q: prevQ, a })),
            question: q,
          },
          { signal: controller.signal }
        );
        latest.current.dispatch({
          type: "recordAnswer",
          cardId: card.cardId,
          q,
          a: response.answer,
          factIds: Array.isArray(response.factIds) ? response.factIds : [],
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
    [deck.deckId, card.cardId, language]
  );

  const canSend = !pending && draft.trim().length > 0 && online;

  const submit = () => {
    if (!canSend) return;
    const q = draft;
    setDraft("");
    void ask(q);
  };

  const speech = useSpeechRecognition({
    lang: speechLang(language),
    onText: (text) => setDraft(text.slice(0, KEEPER_LIMITS.questionMaxChars)),
  });

  return (
    <SituationShell
      testId="situation-ai-keeper"
      footer={
        <>
          {!online && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-2xl bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-900"
              data-testid="keeper-offline"
            >
              <WifiOff className="h-4 w-4 shrink-0 mt-0.5" />
              {t("situation.ai.offline")}
            </p>
          )}
          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <label htmlFor="keeper-question" className="sr-only">
              {t("situation.ai.inputLabel")}
            </label>
            <input
              id="keeper-question"
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              maxLength={KEEPER_LIMITS.questionMaxChars}
              placeholder={speech.listening ? t("situation.ai.listening") : t("situation.ai.placeholder")}
              enterKeyHint="send"
              autoComplete="off"
              lang={language}
              className="h-14 min-w-0 flex-1 rounded-2xl border-2 border-border bg-white px-4 text-base outline-none focus:border-situation"
              data-testid="keeper-question-input"
            />
            {speech.supported && (
              <button
                type="button"
                onClick={speech.listening ? speech.stop : speech.start}
                aria-pressed={speech.listening}
                aria-label={speech.listening ? t("situation.ai.micStop") : t("situation.ai.micStart")}
                title={speech.listening ? t("situation.ai.micStop") : t("situation.ai.micStart")}
                className={`h-14 w-14 shrink-0 rounded-2xl border-2 flex items-center justify-center transition ${
                  speech.listening
                    ? "bg-rose-600 border-rose-600 text-white animate-pulse"
                    : "bg-white border-border"
                }`}
                data-testid="keeper-mic"
              >
                {speech.listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </button>
            )}
            <button
              type="submit"
              disabled={!canSend}
              aria-label={t("situation.ai.send")}
              title={t("situation.ai.send")}
              className="h-14 w-14 shrink-0 rounded-2xl bg-situation text-white flex items-center justify-center disabled:opacity-40"
              data-testid="keeper-send"
            >
              <Send className="h-5 w-5" />
            </button>
          </form>
          {speech.error && speech.error !== "no-speech" && (
            <p className="text-xs text-muted-foreground" data-testid="keeper-mic-error">
              {speech.error === "not-allowed" ? t("situation.ai.micDenied") : t("situation.ai.micFailed")}
            </p>
          )}
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
              {solo ? t("situation.ai.solvedSolo") : t("situation.ai.solved")}
            </ActionButton>
          </div>
        </>
      }
    >
      <div className={`grid gap-3 ${solo ? "grid-cols-3" : "grid-cols-2"}`}>
        <SituationStat label={t("situation.keeper.time")}>
          <ElapsedTime puzzle={puzzle} />
        </SituationStat>
        <SituationStat label={t("situation.keeper.questions")}>
          <span className="tabular-nums" data-testid="situation-question-count">
            {questionsAsked(puzzle)}
          </span>
        </SituationStat>
        {solo && (
          <SituationStat label={t("situation.ai.score")}>
            <span className="tabular-nums" data-testid="solo-score">
              {soloScore(puzzle)}
            </span>
          </SituationStat>
        )}
      </div>

      <SetupBlock card={card} t={t} />

      <FactProgress puzzle={puzzle} card={card} t={t} />

      <Transcript
        puzzle={puzzle}
        pending={pending}
        language={language}
        onRetry={() => pending && void ask(pending.q)}
        onDiscard={() => setPending(null)}
        t={t}
      />

      <HintLadder
        card={card}
        puzzle={puzzle}
        onHint={() => dispatch({ type: "useHint" })}
        nextLabel={(number) => t("situation.ai.getHint", { number })}
        note={
          solo ? (
            <p className="text-xs text-muted-foreground mb-3">
              {t("situation.ai.scoreHelp", {
                perQuestion: SOLO_SCORE.perQuestion,
                perHint: SOLO_SCORE.perHint,
              })}
            </p>
          ) : undefined
        }
        t={t}
      />

      {/* #32: theory sheet (submit a theory, graded by /keeper/grade). */}
      <TheorySlot {...props} solo={solo} />
    </SituationShell>
  );
}

function SetupBlock({ card, t }: { card: SituationCard; t: TranslateFn }) {
  return (
    <div
      className="rounded-3xl bg-gradient-to-br from-situation to-situation-dark text-white shadow-lg shadow-situation/20 p-5 space-y-2"
      data-testid="situation-card"
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-white/80">
        {t("situation.ai.setup")}
      </div>
      <h1 className="text-xl font-bold font-display">{card.title}</h1>
      <p className="text-lg leading-snug" data-testid="situation-setup-text">
        {card.setup}
      </p>
    </div>
  );
}

/** F9: progress from the fact ids the keeper returned. Never shows fact text. */
function FactProgress({
  puzzle,
  card,
  t,
}: {
  puzzle: SituationPuzzleState;
  card: SituationCard;
  t: TranslateFn;
}) {
  const known = new Set(card.keyFacts.map((f) => f.id));
  const found = new Set(puzzle.factsRevealed.filter((id) => known.has(id))).size;
  const total = card.keyFacts.length;
  const pct = total === 0 ? 0 : Math.round((found / total) * 100);

  return (
    <SituationPanel className="py-4">
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <span id="keeper-progress-label" className="text-sm font-semibold uppercase tracking-wide text-situation">
          {t("situation.ai.progress")}
        </span>
        <span className="text-sm font-semibold tabular-nums" data-testid="keeper-progress-value">
          {t("situation.ai.progressValue", { found, total })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-labelledby="keeper-progress-label"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={found}
        className="h-3 rounded-full bg-situation/15 overflow-hidden"
        data-testid="keeper-progress"
        data-found={found}
        data-total={total}
      >
        <motion.div
          className="h-full rounded-full bg-situation"
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
      </div>
    </SituationPanel>
  );
}

interface TranscriptProps {
  puzzle: SituationPuzzleState;
  pending: PendingQuestion | null;
  /** Session language: answer chips are always shown in it (spec §6.2). */
  language: "en" | "es";
  onRetry: () => void;
  onDiscard: () => void;
  t: TranslateFn;
}

/** Transcript with the latest at the bottom, then the big chip for the latest answer. */
function Transcript({ puzzle, pending, language, onRetry, onDiscard, t }: TranscriptProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const entries = puzzle.transcript;
  const last = entries[entries.length - 1];
  const answerLabel = (a: KeeperAnswer) => translate(language, `situation.answer.${a}`);

  // Keep the newest question in view.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [entries.length, pending?.status]);

  return (
    <SituationPanel className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-situation">
        {t("situation.ai.transcript")}
      </h2>
      {entries.length === 0 && !pending && (
        <p className="text-sm text-muted-foreground" data-testid="keeper-transcript-empty">
          {t("situation.ai.empty")}
        </p>
      )}
      {(entries.length > 0 || pending) && (
        <ol
          ref={listRef}
          className="max-h-64 overflow-y-auto overscroll-contain space-y-2 pr-1"
          data-testid="keeper-transcript"
          aria-live="polite"
        >
          {entries.map((entry, i) => (
            <li
              key={`${entry.at}-${i}`}
              className="flex items-start justify-between gap-3 text-sm"
              data-testid="keeper-transcript-entry"
            >
              <span className="min-w-0 break-words">{entry.q}</span>
              <span
                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${ANSWER_STYLES[entry.a]}`}
              >
                {answerLabel(entry.a)}
              </span>
            </li>
          ))}
          {pending && (
            <li className="space-y-2 text-sm" data-testid="keeper-pending" data-status={pending.status}>
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0 break-words font-medium">{pending.q}</span>
                {pending.status === "sending" && (
                  <Loader2
                    className="h-4 w-4 shrink-0 animate-spin text-situation"
                    aria-label={t("situation.ai.sending")}
                  />
                )}
              </div>
              {pending.status === "error" && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 px-3 py-2 space-y-2">
                  <p className="text-rose-900" role="alert" data-testid="keeper-error">
                    {t(errorMessageKey(pending.error))}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={onRetry}
                      className="h-10 rounded-full bg-situation px-4 text-sm font-semibold text-white inline-flex items-center gap-1.5"
                      data-testid="keeper-retry"
                    >
                      <RotateCcw className="h-4 w-4" />
                      {t("situation.ai.retry")}
                    </button>
                    <button
                      type="button"
                      onClick={onDiscard}
                      className="h-10 rounded-full border px-3 text-sm inline-flex items-center gap-1.5"
                      data-testid="keeper-discard"
                    >
                      <X className="h-4 w-4" />
                      {t("situation.ai.discard")}
                    </button>
                    {(pending.error === "missing_passcode" || pending.error === "unauthorized") && (
                      <AppSettingsButton t={t} />
                    )}
                  </div>
                </div>
              )}
            </li>
          )}
        </ol>
      )}

      {last && (
        <motion.div
          key={entries.length}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="rounded-3xl border-2 border-situation/30 bg-situation/5 p-4 text-center"
          data-testid="keeper-latest"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {t("situation.ai.latest")}
          </div>
          <p className="mt-1 text-sm text-muted-foreground break-words">{last.q}</p>
          <span
            className={`mt-3 inline-block rounded-full px-8 py-3 text-4xl font-bold font-display ${ANSWER_STYLES[last.a]}`}
            data-testid="keeper-answer"
            data-answer={last.a}
            lang={language}
          >
            {answerLabel(last.a)}
          </span>
          {last.a === "rephrase" && (
            <p className="mt-2 text-sm text-muted-foreground">
              {translate(language, "situation.ai.rephraseHelp")}
            </p>
          )}
        </motion.div>
      )}
    </SituationPanel>
  );
}
