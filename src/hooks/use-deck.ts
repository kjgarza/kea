"use client";

import { useState, useEffect } from "react";
import type { Deck } from "@/types/deck";
import { loadDeck, DeckNotFoundError } from "@/lib/data/deck-loader";

export interface UseDeckReturn {
  deck: Deck | null;
  isLoading: boolean;
  error: Error | null;
  isNotFound: boolean;
}

/**
 * Hook for loading a deck by ID
 */
export function useDeck(deckId: string): UseDeckReturn {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setIsLoading(true);
        setError(null);
        setIsNotFound(false);

        const loadedDeck = await loadDeck(deckId);

        if (!cancelled) {
          setDeck(loadedDeck);
        }
      } catch (err) {
        if (!cancelled) {
          if (err instanceof DeckNotFoundError) {
            setIsNotFound(true);
          }
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [deckId]);

  return { deck, isLoading, error, isNotFound };
}
