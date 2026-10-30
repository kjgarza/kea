"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, RotateCcw, Sparkles, PartyPopper, Play, Shuffle } from "lucide-react";
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
import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { useGameState } from "@/hooks/use-game-state";
import { useLocale, type TranslateFn } from "@/lib/i18n";
import { GAMES } from "@/types/game";
import type { Deck } from "@/types/deck";
import type { AnyGameModule } from "@/lib/game/modules/types";

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
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
        <header className="flex items-center justify-between p-4">
          <Skeleton className="h-10 w-20 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
          <Skeleton className="h-10 w-10 rounded-full" />
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <Skeleton className="w-full max-w-lg aspect-[3/4] rounded-3xl" />
        </main>
        <div className="p-4 flex gap-3">
          <Skeleton className="flex-1 h-14 rounded-2xl" />
          <Skeleton className="flex-1 h-14 rounded-2xl" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || isNotFound || !deck || !gameModule) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-muted/30">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold mb-2 font-display">
            {isNotFound ? t("play.error.notFoundTitle") : t("play.error.title")}
          </h1>
          <p className="text-muted-foreground mb-6">
            {isNotFound
              ? t("play.error.notFoundBody")
              : t("play.error.body")}
          </p>
          <Button asChild size="lg" className="rounded-full">
            <Link href="/">{t("common.backToHome")}</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  // Pre-game: start/resume screen
  if (!session) {
    return (
      <StartScreen
        deck={deck}
        gameModule={gameModule}
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

  return (
    <div className={`min-h-screen flex flex-col bg-gradient-to-b ${gameModule.theme.gradient} relative`}>
      <div className={`game-bg-pattern ${gameModule.theme.pattern}`} />
      {/* Header */}
      <header className="flex items-center justify-between p-4 relative z-10">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Link
            href={`/game/${deck.gameType}`}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border shadow-sm text-sm font-medium hover:bg-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("play.header.exit")}
          </Link>
        </motion.div>

        <div className="flex items-center gap-2">
          {HeaderView ? (
            <HeaderView deck={deck} session={session} />
          ) : (
            <div className="px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border shadow-sm text-sm font-medium">
              {deck.name}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <LocaleSwitch deckLanguage={deck.language} />
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowRestartDialog(true)}
            aria-label={t("play.header.restart")}
            title={t("play.header.restart")}
            className="p-2.5 rounded-full bg-white/80 backdrop-blur-sm border shadow-sm hover:bg-white transition-colors"
          >
            <RotateCcw className="h-4 w-4" />
          </motion.button>
        </div>
      </header>

      {/* Game body */}
      <main className="flex-1 flex flex-col min-h-0 relative z-10">
        {playView}
      </main>

      {/* Restart Confirmation Dialog */}
      <Dialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">{t("play.restart.title")}</DialogTitle>
            <DialogDescription>
              {t("play.restart.body")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowRestartDialog(false)}
              className="rounded-full"
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleRestart();
                setShowRestartDialog(false);
              }}
              className="rounded-full"
            >
              {t("play.restart.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Start Screen Component
function StartScreen({
  deck,
  gameModule,
  hasSavedSession,
  shuffleEnabled,
  onShuffleChange,
  onStart,
  onResume,
  t,
}: {
  deck: Deck;
  gameModule: AnyGameModule;
  hasSavedSession: boolean;
  shuffleEnabled: boolean;
  onShuffleChange: (enabled: boolean) => void;
  onStart: () => void;
  onResume: () => void;
  t: TranslateFn;
}) {
  const game = GAMES[deck.gameType];
  const cardCount = deck.cards.length;
  const bgGradient = gameModule.theme.gradient;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b ${bgGradient} relative`}>
      <div className={`game-bg-pattern ${gameModule.theme.pattern}`} />
      <LocaleSwitch deckLanguage={deck.language} className="absolute top-4 right-4 z-20" />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl p-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4"
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">{game.name}</span>
          </motion.div>

          <h1 className="text-3xl font-bold font-display mb-2">{deck.name}</h1>
          <p className="text-muted-foreground mb-8">{t("common.cardCount", { count: cardCount })}</p>

          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl mb-6">
            <div className="flex items-center gap-2">
              <Shuffle className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">{t("play.start.shuffle")}</span>
            </div>
            <Switch
              checked={shuffleEnabled}
              onCheckedChange={onShuffleChange}
            />
          </div>

          <div className="space-y-3">
            {hasSavedSession ? (
              <>
                <Button
                  className="w-full h-14 rounded-2xl text-base font-bold"
                  onClick={onResume}
                >
                  <Play className="w-5 h-5 mr-2" />
                  {t("play.start.resume")}
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12 rounded-2xl"
                  onClick={onStart}
                >
                  {t("play.start.startNew")}
                </Button>
              </>
            ) : (
              <Button
                className="w-full h-14 rounded-2xl text-base font-bold"
                onClick={onStart}
              >
                <Play className="w-5 h-5 mr-2" />
                {t("play.start.start")}
              </Button>
            )}
          </div>

          <Button variant="ghost" className="w-full mt-4 rounded-full" asChild>
            <Link href={`/game/${deck.gameType}`}>{t("common.chooseDifferentDeck")}</Link>
          </Button>
        </div>
      </motion.div>
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
  const bgGradient = gameModule.theme.gradient;

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b ${bgGradient} relative`}>
      <div className={`game-bg-pattern ${gameModule.theme.pattern}`} />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md text-center relative z-10"
      >
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl p-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2 }}
            className="text-7xl mb-4"
          >
            🎉
          </motion.div>

          <h1 className="text-3xl font-bold font-display mb-2">
            {t(gameModule.completeTitle ?? "play.complete.deckTitle")}
          </h1>
          <p className="text-muted-foreground mb-8">{deck.name}</p>

          <div className="space-y-3">
            <Button
              className="w-full h-14 rounded-2xl text-base font-bold"
              onClick={onRestart}
            >
              <PartyPopper className="w-5 h-5 mr-2" />
              {t("play.complete.playAgain")}
            </Button>
            <Button variant="outline" className="w-full h-12 rounded-2xl" asChild>
              <Link href={`/game/${deck.gameType}`}>{t("common.chooseDifferentDeck")}</Link>
            </Button>
            <Button variant="ghost" className="w-full rounded-full" asChild>
              <Link href="/">{t("common.backToHome")}</Link>
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
