"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { GameMark } from "@/components/game/game-mark";
import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { ActionButton } from "./action-bar";
import { deckDepthShadow, fitType } from "@/lib/ui/fit-type";
import { useGameState } from "@/hooks/use-game-state";
import { useLocale, type TranslateFn } from "@/lib/i18n";
import { GAMES } from "@/types/game";
import type { Deck } from "@/types/deck";
import type { AnyGameModule } from "@/lib/game/modules/types";
import { DeckCredits } from "@/components/credits/source-credit";

interface PlayScreenProps {
  deckId: string;
}

/**
 * Shared play-screen chrome: loading/error states, start screen, header
 * (exit, title, restart), restart dialog and the completion screen. The
 * in-game body is the deck's module `PlayView` (see
 * src/lib/game/modules/registry.ts).
 */
export function PlayScreen({ deckId }: PlayScreenProps) {
  const {
    deck,
    gameModule,
    session,
    currentCard,
    isLoading,
    error,
    isNotFound,
    isComplete,
    hasSavedSession,
    startGame,
    resumeGame,
    dispatch,
    handleRestart,
  } = useGameState(deckId);

  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);
  const { locale, t } = useLocale(deck?.language);

  // Keep <html lang> in step with the UI language while on this screen.
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.lang = previous;
    };
  }, [locale]);

  // Loading state
  if (isLoading) {
    return (
      <div className="on-table pt-safe flex h-dvh flex-col">
        <div className="h-14 shrink-0" />
        <div className="min-h-0 flex-1 px-4 pb-2">
          <Skeleton className="h-full rounded-[1.75rem]" />
        </div>
        <div className="pb-safe-3 flex gap-2.5 px-4 pt-3">
          <Skeleton className="h-16 flex-1 rounded-2xl" />
          <Skeleton className="h-16 flex-[1.7] rounded-2xl" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || isNotFound || !deck || !gameModule) {
    return (
      <div className="on-table feathers pt-safe pb-safe-5 flex min-h-dvh flex-col justify-between px-5">
        <div className="pt-16">
          <h1 className="display-type text-[3.5rem] text-flash [--type-width:84%]">
            {isNotFound ? t("play.error.notFoundTitle") : t("play.error.title")}
          </h1>
          <p className="mt-4 text-xl font-bold">
            {isNotFound ? t("play.error.notFoundBody") : t("play.error.body")}
          </p>
        </div>
        <Button asChild size="lg" className="w-full">
          <Link href="/">{t("common.backToHome")}</Link>
        </Button>
      </div>
    );
  }

  // Pre-game: start/resume screen
  if (!session) {
    return (
      <StartScreen
        deck={deck}
        hasSavedSession={hasSavedSession}
        shuffleEnabled={shuffleEnabled}
        onShuffleChange={setShuffleEnabled}
        onStart={() => startGame(shuffleEnabled)}
        onResume={resumeGame}
        t={t}
      />
    );
  }

  if (isComplete) {
    return (
      <CompleteScreen
        deck={deck}
        gameModule={gameModule}
        onRestart={handleRestart}
        t={t}
      />
    );
  }

  const { PlayView, HeaderView } = gameModule;
  const playView = (
    <PlayView
      deck={deck}
      session={session}
      currentCard={currentCard}
      dispatch={dispatch}
    />
  );

  // Module-controlled full-screen state (e.g. Monikers between rounds)
  if (gameModule.showChrome && !gameModule.showChrome(session)) {
    return playView;
  }

  const isTable = gameModule.surface === "table";
  const progress = isTable ? gameModule.progress(session, deck) : null;
  const done = progress ? Math.min(progress.total, progress.completed + 1) : 0;

  return (
    <div
      data-game={deck.gameType}
      className={`flex flex-col ${isTable ? "on-table h-dvh overflow-hidden" : "min-h-dvh"}`}
    >
      {/* Header: on paper it carries the game's colour, so the game stays recognisable. */}
      <header
        className={`pt-safe relative z-10 flex shrink-0 items-center gap-1 px-2 ${
          isTable ? "" : "card-back mb-3 pb-1"
        }`}
      >
        <Link
          href={`/game/${deck.gameType}`}
          aria-label={t("play.header.exit")}
          title={t("play.header.exit")}
          className="my-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-full active:bg-foreground/10"
        >
          <X className="size-6" />
        </Link>

        <div className="min-w-0 flex-1 px-1">
          {HeaderView ? (
            <HeaderView deck={deck} session={session} />
          ) : (
            <>
              <p className="font-display truncate py-0.5 text-lg leading-none font-extrabold [font-stretch:80%]">{deck.name}</p>
              {progress && (
                <p className="mt-1 text-sm leading-none font-bold text-muted-foreground tabular-nums">
                  {t("play.progress", { done, total: progress.total })}
                </p>
              )}
            </>
          )}
        </div>

        <LocaleSwitch deckLanguage={deck.language} className="shrink-0 bg-transparent" />
        <button
          type="button"
          onClick={() => setShowRestartDialog(true)}
          aria-label={t("play.header.restart")}
          title={t("play.header.restart")}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full active:bg-foreground/10"
        >
          <RotateCcw className="size-5" />
        </button>
      </header>

      {/* Game body */}
      <main className="relative z-10 flex min-h-0 flex-1 flex-col">{playView}</main>

      {/* Restart Confirmation Dialog */}
      <Dialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display text-2xl font-extrabold">{t("play.restart.title")}</DialogTitle>
            <DialogDescription className="text-base">{t("play.restart.body")}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2.5">
            <Button variant="secondary" size="lg" onClick={() => setShowRestartDialog(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              size="lg"
              onClick={() => {
                handleRestart();
                setShowRestartDialog(false);
              }}
            >
              {t("play.restart.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Start Screen Component: the deck itself, ready to pick up.
function StartScreen({
  deck,
  hasSavedSession,
  shuffleEnabled,
  onShuffleChange,
  onStart,
  onResume,
  t,
}: {
  deck: Deck;
  hasSavedSession: boolean;
  shuffleEnabled: boolean;
  onShuffleChange: (enabled: boolean) => void;
  onStart: () => void;
  onResume: () => void;
  t: TranslateFn;
}) {
  const game = GAMES[deck.gameType];
  const cardCount = deck.cards.length;

  return (
    <div data-game={deck.gameType} className="on-table feathers pt-safe flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between px-2">
        <Link
          href={`/game/${deck.gameType}`}
          aria-label={t("common.chooseDifferentDeck")}
          className="inline-flex size-11 items-center justify-center rounded-full active:bg-foreground/10"
        >
          <ArrowLeft className="size-6" />
        </Link>
        <LocaleSwitch deckLanguage={deck.language} />
      </header>

      <div className="flex flex-1 flex-col px-4 pb-6">
        {/* The deck, with an edge for every doubling of its card count. */}
        <div
          className="card-back relative flex min-h-[17rem] flex-1 flex-col justify-between overflow-hidden rounded-[1.75rem] p-6 [container-type:inline-size]"
          style={{ boxShadow: deckDepthShadow(cardCount, 2) }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-lg font-bold">{game.name}</p>
            <GameMark game={deck.gameType} className="size-12 shrink-0" />
          </div>
          <div>
            <h1 className="display-type" style={fitType(deck.name, { maxPx: 76, aspect: 0.7, measure: 80 })}>
              {deck.name}
            </h1>
            <p className="mt-3 text-xl font-bold">{t("common.cardCount", { count: cardCount })}</p>
          </div>
        </div>
      </div>

      <div className="pb-safe-3 grid gap-2.5 px-4">
        <DeckCredits deck={deck} t={t} className="px-1" />

        <label className="flex min-h-14 items-center justify-between px-1 text-lg font-bold">
          {t("play.start.shuffle")}
          <Switch checked={shuffleEnabled} onCheckedChange={onShuffleChange} />
        </label>

        {hasSavedSession ? (
          <>
            <ActionButton variant="primary" className="w-full" onClick={onResume}>
              {t("play.start.resume")}
            </ActionButton>
            <Button variant="secondary" size="lg" onClick={onStart}>
              {t("play.start.startNew")}
            </Button>
          </>
        ) : (
          <ActionButton variant="primary" className="w-full" onClick={onStart}>
            {t("play.start.start")}
          </ActionButton>
        )}
      </div>
    </div>
  );
}

// Complete Screen Component
function CompleteScreen({
  deck,
  gameModule,
  onRestart,
  t,
}: {
  deck: Deck;
  gameModule: AnyGameModule;
  onRestart: () => void;
  t: TranslateFn;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <div data-game={deck.gameType} className="on-table feathers pt-safe flex min-h-dvh flex-col overflow-hidden">
      {/* The played cards, fanned out across the table. */}
      <div aria-hidden className="relative h-64 shrink-0">
        {[-2, -1, 0, 1, 2].map((slot) => (
          <motion.div
            key={slot}
            className="card-back absolute top-14 left-1/2 -ml-16 h-48 w-32 rounded-2xl border-4 border-paper shadow-[0_10px_24px_-8px_rgb(0_0_0/0.6)]"
            initial={reduceMotion ? false : { rotate: 0, x: 0, y: 40 }}
            animate={{ rotate: slot * 13, x: slot * 44, y: Math.abs(slot) * 12 }}
            transition={{ type: "spring", stiffness: 180, damping: 15, delay: 0.1 }}
          />
        ))}
      </div>

      <div className="flex-1 px-6 pt-8">
        <h1 className="display-type text-[3.75rem] [--type-width:84%]">
          {t(gameModule.completeTitle ?? "play.complete.deckTitle")}
        </h1>
        <p className="mt-4 text-xl font-bold text-muted-foreground">{deck.name}</p>
      </div>

      <div className="pb-safe-3 grid gap-2.5 px-4 pt-4">
        <ActionButton variant="primary" className="w-full" onClick={onRestart}>
          {t("play.complete.playAgain")}
        </ActionButton>
        <Button variant="secondary" size="lg" asChild>
          <Link href={`/game/${deck.gameType}`}>{t("common.chooseDifferentDeck")}</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link href="/">{t("common.backToHome")}</Link>
        </Button>
      </div>
    </div>
  );
}
