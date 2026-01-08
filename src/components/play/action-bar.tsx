"use client";

import { Button } from "@/components/ui/button";
import { SkipForward, Check, ArrowRight, Clock } from "lucide-react";
import type { GameType } from "@/types/game";

interface ActionBarProps {
  gameType: GameType;
  onNext: () => void;
  onPass: () => void;
  // Monikers specific
  onCorrect?: () => void;
  onEndTurn?: () => void;
  isRevealed?: boolean;
}

export function ActionBar({
  gameType,
  onNext,
  onPass,
  onCorrect,
  onEndTurn,
  isRevealed = false,
}: ActionBarProps) {
  // Monikers has special controls
  if (gameType === "monikers") {
    return (
      <div className="flex gap-3 p-4 bg-background border-t">
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={onPass}
        >
          <SkipForward className="h-5 w-5 mr-2" />
          Pass
        </Button>
        <Button
          variant="default"
          size="lg"
          className="flex-1"
          onClick={onCorrect}
        >
          <Check className="h-5 w-5 mr-2" />
          Correct!
        </Button>
        <Button
          variant="secondary"
          size="lg"
          onClick={onEndTurn}
        >
          <Clock className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  // Trivia: Only show Next after reveal
  if (gameType === "trivia") {
    return (
      <div className="flex gap-3 p-4 bg-background border-t">
        <Button
          variant="outline"
          size="lg"
          className="flex-1"
          onClick={onPass}
        >
          <SkipForward className="h-5 w-5 mr-2" />
          Pass
        </Button>
        <Button
          variant="default"
          size="lg"
          className="flex-1"
          onClick={onNext}
          disabled={!isRevealed}
        >
          <ArrowRight className="h-5 w-5 mr-2" />
          Next
        </Button>
      </div>
    );
  }

  // Default: Pass and Next
  return (
    <div className="flex gap-3 p-4 bg-background border-t">
      <Button
        variant="outline"
        size="lg"
        className="flex-1"
        onClick={onPass}
      >
        <SkipForward className="h-5 w-5 mr-2" />
        Pass
      </Button>
      <Button
        variant="default"
        size="lg"
        className="flex-1"
        onClick={onNext}
      >
        <ArrowRight className="h-5 w-5 mr-2" />
        Next
      </Button>
    </div>
  );
}
