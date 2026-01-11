"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, RotateCcw } from "lucide-react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CardDisplay } from "./card-display";
import { ActionBar } from "./action-bar";
import { RoundIndicator } from "@/components/monikers/round-indicator";
import { EndTurnOverlay } from "@/components/monikers/end-turn-overlay";
import { useGameState } from "@/hooks/use-game-state";
import { GAMES } from "@/types/game";
import { isMonikersSession } from "@/types/session";

interface PlayScreenProps {
  deckId: string;
}

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
      <div className="min-h-screen flex flex-col bg-background">
        <header className="flex items-center justify-between p-4 border-b">
          <Skeleton className="h-8 w-16" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-8 w-8" />
        </header>
        <main className="flex-1 flex items-center justify-center p-4">
          <Skeleton className="w-full max-w-lg aspect-[3/4] rounded-xl" />
        </main>
        <div className="p-4 border-t flex gap-3">
          <Skeleton className="flex-1 h-12 rounded-md" />
          <Skeleton className="flex-1 h-12 rounded-md" />
        </div>
      </div>
    );
  }

  // Error state
  if (error || isNotFound) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <h1 className="text-2xl font-bold mb-2">
          {isNotFound ? "Deck Not Found" : "Error"}
        </h1>
        <p className="text-muted-foreground mb-6">
          {isNotFound
            ? "This deck doesn't exist."
            : "Something went wrong loading the deck."}
        </p>
        <Button asChild>
          <Link href="/">Back to Home</Link>
        </Button>
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

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-4 border-b">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/game/${deck!.gameType}`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Exit
          </Link>
        </Button>

        <div className="flex items-center gap-2">
          {monikersRound ? (
            <RoundIndicator round={monikersRound} />
          ) : (
            <Badge variant="outline">{deck!.name}</Badge>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowRestartDialog(true)}
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
      </header>

      {/* Card Display */}
      <main className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-center p-4 min-h-0 overflow-auto">
          <div className="w-full max-w-lg aspect-[3/4] max-h-[calc(100vh-180px)] bg-card rounded-xl shadow-lg border overflow-hidden">
            <CardDisplay
              card={currentCard}
              isRevealed={session.isRevealed}
              onReveal={handleReveal}
            />
          </div>
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart Game?</DialogTitle>
            <DialogDescription>
              This will reset your progress and start from the beginning.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRestartDialog(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                handleRestart();
                setShowRestartDialog(false);
              }}
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

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{deck.name}</CardTitle>
          <p className="text-muted-foreground">
            {game.name} - {cardCount} cards
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {!hasSavedSession && (
            <div className="flex items-center justify-between">
              <span className="text-sm">Shuffle cards</span>
              <Switch
                checked={shuffleEnabled}
                onCheckedChange={onShuffleChange}
              />
            </div>
          )}

          <div className="space-y-3">
            {hasSavedSession ? (
              <>
                <Button className="w-full" size="lg" onClick={onResume}>
                  Resume Game
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={onStart}
                >
                  Start New Game
                </Button>
              </>
            ) : (
              <Button className="w-full" size="lg" onClick={onStart}>
                Start Game
              </Button>
            )}
          </div>

          <Button variant="ghost" className="w-full" asChild>
            <Link href={`/game/${deck.gameType}`}>Choose Different Deck</Link>
          </Button>
        </CardContent>
      </Card>
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
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">
            {monikersRound === 3 ? "Game Complete!" : "Deck Complete!"}
          </CardTitle>
          <p className="text-muted-foreground">{deck.name}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-4xl">🎉</p>
          <div className="space-y-3">
            <Button className="w-full" size="lg" onClick={onRestart}>
              Play Again
            </Button>
            <Button variant="outline" className="w-full" asChild>
              <Link href={`/game/${deck.gameType}`}>Choose Different Deck</Link>
            </Button>
            <Button variant="ghost" className="w-full" asChild>
              <Link href="/">Back to Home</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
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
    1: "Round 2: One Word",
    2: "Round 3: Charades",
    3: "Complete!",
  };

  const roundDescriptions = {
    1: "Use only ONE word to describe the phrase",
    2: "Act it out! No words allowed",
    3: "",
  };

  const nextRound = (round + 1) as 1 | 2 | 3;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <CardTitle className="text-2xl">Round {round} Complete!</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="text-4xl">🎉</p>

          <div className="p-4 bg-muted rounded-lg">
            <p className="font-semibold text-lg">
              {roundNames[round as keyof typeof roundNames]}
            </p>
            {roundDescriptions[round as keyof typeof roundDescriptions] && (
              <p className="text-sm text-muted-foreground mt-1">
                {roundDescriptions[round as keyof typeof roundDescriptions]}
              </p>
            )}
          </div>

          <Button className="w-full" size="lg" onClick={onNextRound}>
            Start Round {nextRound}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
