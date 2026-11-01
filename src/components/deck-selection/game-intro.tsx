"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { useLocale } from "@/lib/i18n";
import { GAMES, type GameType } from "@/types/game";

interface GameIntroProps {
  gameType: GameType;
}

/** Deck-list page header and "How to Play" with translated labels. */
export function GameIntro({ gameType }: GameIntroProps) {
  const { t } = useLocale();
  const game = GAMES[gameType];

  return (
    <>
      <header className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("decks.backToGames")}
            </Link>
          </Button>
          <LocaleSwitch />
        </div>
        <h1 className="text-3xl font-bold mb-2">{game.name}</h1>
        <p className="text-muted-foreground">{game.description}</p>
      </header>

      <section className="mb-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          {t("decks.howToPlay")}
        </h2>
        <ol className="space-y-1">
          {game.howToPlay.map((step, i) => (
            <li key={i} className="flex gap-3 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground shrink-0">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}

/** "Choose a Deck" heading. */
export function ChooseDeckHeading() {
  const { t } = useLocale();
  return <h2 className="text-xl font-semibold mb-4">{t("decks.chooseDeck")}</h2>;
}
