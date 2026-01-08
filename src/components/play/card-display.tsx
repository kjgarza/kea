"use client";

import type { Card } from "@/types/card";
import {
  isCharadesCard,
  isTriviaCard,
  isTriviaMCQCard,
  isTabooCard,
  isJustOneCard,
  isMonikersCard,
} from "@/types/card";

interface CardDisplayProps {
  card: Card;
  isRevealed?: boolean;
  onReveal?: () => void;
}

export function CardDisplay({ card, isRevealed = false, onReveal }: CardDisplayProps) {
  if (isCharadesCard(card)) {
    return <CharadesCardDisplay card={card} />;
  }

  if (isTriviaCard(card)) {
    return (
      <TriviaCardDisplay
        card={card}
        isRevealed={isRevealed}
        onReveal={onReveal}
      />
    );
  }

  if (isTabooCard(card)) {
    return <TabooCardDisplay card={card} />;
  }

  if (isJustOneCard(card)) {
    return <JustOneCardDisplay card={card} />;
  }

  if (isMonikersCard(card)) {
    return <MonikersCardDisplay card={card} />;
  }

  return null;
}

// Charades Card
function CharadesCardDisplay({ card }: { card: { prompt: string } }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <p className="text-4xl md:text-5xl font-bold text-center">{card.prompt}</p>
    </div>
  );
}

// Trivia Card
function TriviaCardDisplay({
  card,
  isRevealed,
  onReveal,
}: {
  card: Card & { type: "trivia" };
  isRevealed: boolean;
  onReveal?: () => void;
}) {
  const isMCQ = isTriviaMCQCard(card);

  return (
    <div className="flex flex-col h-full p-6">
      {/* Question */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-2xl md:text-3xl font-semibold text-center">
          {card.question}
        </p>
      </div>

      {/* MCQ Choices */}
      {isMCQ && (
        <div className="space-y-2 mb-6">
          {card.choices.map((choice, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-lg border ${
                isRevealed && idx === card.answerIndex
                  ? "bg-green-100 border-green-500 dark:bg-green-900/30"
                  : "bg-muted/50"
              }`}
            >
              <span className="font-medium mr-2">
                {String.fromCharCode(65 + idx)}.
              </span>
              {choice}
            </div>
          ))}
        </div>
      )}

      {/* Answer Section */}
      <div className="mt-auto">
        {isRevealed ? (
          <div className="p-4 rounded-lg bg-green-100 dark:bg-green-900/30 border border-green-500">
            <p className="text-sm text-green-700 dark:text-green-300 font-medium mb-1">
              Answer
            </p>
            <p className="text-xl font-bold">{card.answerText}</p>
          </div>
        ) : (
          <button
            onClick={onReveal}
            className="w-full p-4 rounded-lg bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
          >
            Reveal Answer
          </button>
        )}
      </div>
    </div>
  );
}

// Taboo Card
function TabooCardDisplay({
  card,
}: {
  card: { target: string; forbidden: string[] };
}) {
  return (
    <div className="flex flex-col h-full p-6">
      {/* Target Word */}
      <div className="flex-1 flex items-center justify-center">
        <p className="text-4xl md:text-5xl font-bold text-center text-primary">
          {card.target}
        </p>
      </div>

      {/* Forbidden Words */}
      <div className="border-t border-destructive/30 pt-4">
        <p className="text-sm text-destructive font-medium mb-3 text-center">
          TABOO WORDS
        </p>
        <div className="space-y-2">
          {card.forbidden.map((word, idx) => (
            <div
              key={idx}
              className="p-2 rounded bg-destructive/10 text-destructive text-center font-medium"
            >
              {word}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Just One Card
function JustOneCardDisplay({ card }: { card: { target: string } }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <p className="text-4xl md:text-5xl font-bold text-center">{card.target}</p>
      <p className="mt-6 text-muted-foreground text-center">
        Give a one-word clue!
      </p>
    </div>
  );
}

// Monikers Card
function MonikersCardDisplay({ card }: { card: { phrase: string } }) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <p className="text-3xl md:text-4xl font-bold text-center">{card.phrase}</p>
    </div>
  );
}
