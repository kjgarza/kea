"use client";

import { useEffect, useState } from "react";
import { DeckCard } from "./deck-card";
import type { DeckMeta } from "@/types/deck";
import type { GameType } from "@/types/game";
import { getDecksForGame } from "@/lib/data/deck-loader";
import { localeFromLanguage, useLocale } from "@/lib/i18n";

interface DeckListProps {
  gameType: GameType;
}

export function DeckList({ gameType }: DeckListProps) {
  const [decks, setDecks] = useState<DeckMeta[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<boolean>(false);
  const { t, locale } = useLocale();

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
        setError(false);
      } catch (err) {
        setError(true);
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    loadDecks();
  }, [gameType]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-2 px-5 pt-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return <p className="px-5 py-8 text-lg font-bold">{t("decks.loadError")}</p>;
  }

  if (decks.length === 0) {
    return <p className="px-5 py-8 text-lg text-muted-foreground">{t("decks.empty")}</p>;
  }

  // Decks in the language being used come first; the rest follow under a label.
  const here = decks.filter((deck) => localeFromLanguage(deck.language) === locale);
  const elsewhere = decks.filter((deck) => localeFromLanguage(deck.language) !== locale);
  const otherLanguage = locale === "en" ? "es" : "en";

  return (
    <div className="pb-safe-5 pt-1">
      <div className="divide-y divide-border">
        {here.map((deck) => (
          <DeckCard key={deck.deckId} deck={deck} />
        ))}
      </div>
      {elsewhere.length > 0 && (
        <>
          <h3 className="px-5 pt-6 pb-1 text-lg font-bold text-muted-foreground">
            {t("decks.otherLanguage", { language: t(`locale.name.${otherLanguage}`) })}
          </h3>
          <div className="divide-y divide-border">
            {elsewhere.map((deck) => (
              <DeckCard key={deck.deckId} deck={deck} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
