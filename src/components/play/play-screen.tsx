"use client";

import { useState } from "react";
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
import { CardDisplay } from "./card-display";
import { ActionBar } from "./action-bar";
import { RoundIndicator } from "@/components/monikers/round-indicator";
import { EndTurnOverlay } from "@/components/monikers/end-turn-overlay";
import { useGameState } from "@/hooks/use-game-state";
import { GAMES, GameType } from "@/types/game";
import { isMonikersSession } from "@/types/session";

interface PlayScreenProps {
  deckId: string;
}

const gameGradients: Record<GameType, string> = {
  charades: "from-charades/5 to-charades/10",
  trivia: "from-trivia/5 to-trivia/10",
  taboo: "from-taboo/5 to-taboo/10",
  justone: "from-justone/5 to-justone/10",
  monikers: "from-monikers/5 to-monikers/10",
};

export function PlayScreen({ deckId }: PlayScreenProps) {
  const {
    deck,
    session,
    currentCard,
    isLoading,
    error,
    isNotFound,
    isComplete,
    isRoundComplete,
    hasSavedSession,
    monikersRound,
    startGame,
    resumeGame,
    handleNext,
    handlePass,
    handleReveal,
    handleRestart,
    handleMonikersCorrect,
    handleMonikersEndTurn,
    handleMonikersNextRound,
  } = useGameState(deckId);

  const [showRestartDialog, setShowRestartDialog] = useState(false);
  const [showEndTurnOverlay, setShowEndTurnOverlay] = useState(false);
  const [shuffleEnabled, setShuffleEnabled] = useState(false);

  // Calculate cards remaining for Monikers
  const monikersCardsRemaining = session && isMonikersSession(session)
    ? session.monikersRemainingCardIds.length +
      session.monikersPassedCardIds.length +
      (session.currentCardId ? 1 : 0)
    : 0;

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
  if (error || isNotFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-background to-muted/30">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="text-6xl mb-4">😕</div>
          <h1 className="text-2xl font-bold mb-2 font-display">
            {isNotFound ? "Deck Not Found" : "Oops!"}
          </h1>
          <p className="text-muted-foreground mb-6">
            {isNotFound
              ? "This deck doesn't exist."
              : "Something went wrong loading the deck."}
          </p>
          <Button asChild size="lg" className="rounded-full">
            <Link href="/">Back to Home</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  // Pre-game: Show start screen
  if (!session || !currentCard) {
    // Check if game is complete
    if (isComplete) {
      return (
        <CompleteScreen
          deck={deck!}
          onRestart={handleRestart}
          monikersRound={monikersRound}
        />
      );
    }

    // Monikers round complete (not game complete)
    if (isRoundComplete && monikersRound && monikersRound < 3) {
      return (
        <RoundCompleteScreen
          round={monikersRound}
          onNextRound={handleMonikersNextRound}
        />
      );
    }

    // Show start/resume screen
    return (
      <StartScreen
        deck={deck!}
        hasSavedSession={hasSavedSession}
        shuffleEnabled={shuffleEnabled}
        onShuffleChange={setShuffleEnabled}
        onStart={() => startGame(shuffleEnabled)}
        onResume={resumeGame}
      />
    );
  }

  const game = GAMES[deck!.gameType];
  const bgGradient = gameGradients[deck!.gameType];

  return (
    <div className={`min-h-screen flex flex-col bg-gradient-to-b ${bgGradient}`}>
      {/* Header */}
      <header className="flex items-center justify-between p-4">
        <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
          <Link
            href={`/game/${deck!.gameType}`}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border shadow-sm text-sm font-medium hover:bg-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Exit
          </Link>
        </motion.div>

        <div className="flex items-center gap-2">
          {monikersRound ? (
            <RoundIndicator round={monikersRound} />
          ) : (
            <div className="px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border shadow-sm text-sm font-medium">
              {deck!.name}
            </div>
          )}
        </div>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowRestartDialog(true)}
          className="p-2.5 rounded-full bg-white/80 backdrop-blur-sm border shadow-sm hover:bg-white transition-colors"
        >
          <RotateCcw className="h-4 w-4" />
        </motion.button>
      </header>

      {/* Card Display */}
      <main className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-center p-4 min-h-0 overflow-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg aspect-[3/4] max-h-[calc(100vh-200px)]"
          >
            <CardDisplay
              card={currentCard}
              isRevealed={session.isRevealed}
              onReveal={handleReveal}
            />
          </motion.div>
        </div>

        {/* Action Bar */}
        <ActionBar
          gameType={deck!.gameType}
          onNext={handleNext}
          onPass={handlePass}
          onCorrect={handleMonikersCorrect}
          onEndTurn={() => setShowEndTurnOverlay(true)}
          isRevealed={session.isRevealed}
        />
      </main>

      {/* Monikers End Turn Overlay */}
      {showEndTurnOverlay && monikersRound && (
        <EndTurnOverlay
          cardsRemaining={monikersCardsRemaining}
          onContinue={() => {
            handleMonikersEndTurn();
            setShowEndTurnOverlay(false);
          }}
        />
      )}

      {/* Restart Confirmation Dialog */}
      <Dialog open={showRestartDialog} onOpenChange={setShowRestartDialog}>
        <DialogContent className="rounded-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">Restart Game?</DialogTitle>
            <DialogDescription>
              This will reset your progress and start from the beginning.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => setShowRestartDialog(false)}
              className="rounded-full"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleRestart();
                setShowRestartDialog(false);
              }}
              className="rounded-full"
            >
              Restart
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
  hasSavedSession,
  shuffleEnabled,
  onShuffleChange,
  onStart,
  onResume,
}: {
  deck: { name: string; cards: unknown[]; gameType: string };
  hasSavedSession: boolean;
  shuffleEnabled: boolean;
  onShuffleChange: (enabled: boolean) => void;
  onStart: () => void;
  onResume: () => void;
}) {
  const game = GAMES[deck.gameType as keyof typeof GAMES];
  const cardCount = deck.cards.length;
  const bgGradient = gameGradients[deck.gameType as GameType];

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b ${bgGradient}`}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md"
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
          <p className="text-muted-foreground mb-8">{cardCount} cards</p>

          {!hasSavedSession && (
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-2xl mb-6">
              <div className="flex items-center gap-2">
                <Shuffle className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Shuffle cards</span>
              </div>
              <Switch
                checked={shuffleEnabled}
                onCheckedChange={onShuffleChange}
              />
            </div>
          )}

          <div className="space-y-3">
            {hasSavedSession ? (
              <>
                <Button
                  className="w-full h-14 rounded-2xl text-base font-bold"
                  onClick={onResume}
                >
                  <Play className="w-5 h-5 mr-2" />
                  Resume Game
                </Button>
                <Button
                  variant="outline"
                  className="w-full h-12 rounded-2xl"
                  onClick={onStart}
                >
                  Start New Game
                </Button>
              </>
            ) : (
              <Button
                className="w-full h-14 rounded-2xl text-base font-bold"
                onClick={onStart}
              >
                <Play className="w-5 h-5 mr-2" />
                Start Game
              </Button>
            )}
          </div>

          <Button variant="ghost" className="w-full mt-4 rounded-full" asChild>
            <Link href={`/game/${deck.gameType}`}>Choose Different Deck</Link>
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// Complete Screen Component
function CompleteScreen({
  deck,
  onRestart,
  monikersRound,
}: {
  deck: { name: string; gameType: string };
  onRestart: () => void;
  monikersRound: number | null;
}) {
  const bgGradient = gameGradients[deck.gameType as GameType];

  return (
    <div className={`min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b ${bgGradient}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md text-center"
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
            {monikersRound === 3 ? "Game Complete!" : "Deck Complete!"}
          </h1>
          <p className="text-muted-foreground mb-8">{deck.name}</p>

          <div className="space-y-3">
            <Button
              className="w-full h-14 rounded-2xl text-base font-bold"
              onClick={onRestart}
            >
              <PartyPopper className="w-5 h-5 mr-2" />
              Play Again
            </Button>
            <Button variant="outline" className="w-full h-12 rounded-2xl" asChild>
              <Link href={`/game/${deck.gameType}`}>Choose Different Deck</Link>
            </Button>
            <Button variant="ghost" className="w-full rounded-full" asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// Round Complete Screen (Monikers)
function RoundCompleteScreen({
  round,
  onNextRound,
}: {
  round: number;
  onNextRound: () => void;
}) {
  const roundNames = {
    1: "One Word Only",
    2: "Act It Out!",
    3: "Complete!",
  };

  const roundDescriptions = {
    1: "Use only ONE word to describe the phrase",
    2: "Act it out! No words allowed",
    3: "",
  };

  const nextRound = (round + 1) as 1 | 2 | 3;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-monikers/5 to-monikers/10">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md text-center"
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

          <h1 className="text-3xl font-bold font-display mb-6">
            Round {round} Complete!
          </h1>

          <div className="p-5 bg-gradient-to-br from-monikers to-monikers-dark rounded-2xl mb-8">
            <p className="font-bold text-xl text-white font-display">
              Round {nextRound}: {roundNames[round as keyof typeof roundNames]}
            </p>
            {roundDescriptions[round as keyof typeof roundDescriptions] && (
              <p className="text-sm text-white/80 mt-2">
                {roundDescriptions[round as keyof typeof roundDescriptions]}
              </p>
            )}
          </div>

          <Button
            className="w-full h-14 rounded-2xl text-base font-bold"
            onClick={onNextRound}
          >
            <Play className="w-5 h-5 mr-2" />
            Start Round {nextRound}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
