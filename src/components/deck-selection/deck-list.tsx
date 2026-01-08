"use client";

import { useEffect, useState } from "react";
import { DeckCard } from "./deck-card";
import type { DeckMeta } from "@/types/deck";
import type { GameType } from "@/types/game";
import { getDecksForGame } from "@/lib/data/deck-loader";

interface DeckListProps {
  gameType: GameType;
}

export function DeckList({ gameType }: DeckListProps) {
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDecks() {
      try {
        setIsLoading(true);
        const loadedDecks = await getDecksForGame(gameType);
        // Sort: recommended first, then alphabetically
        loadedDecks.sort((a, b) => {
          if (a.recommended && !b.recommended) return -1;
          if (!a.recommended && b.recommended) return 1;
          return a.name.localeCompare(b.name);
        });
        setDecks(loadedDecks);
        setError(null);
      } catch (err) {
        setError("Failed to load decks");
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    loadDecks();
  }, [gameType]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[...Array(3)].map((_, i) => (
          <div
            key={i}
            className="h-40 rounded-lg bg-muted animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-10">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  if (decks.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">
          No decks available for this game yet.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {decks.map((deck) => (
        <DeckCard key={deck.deckId} deck={deck} />
      ))}
    </div>
  );
}
