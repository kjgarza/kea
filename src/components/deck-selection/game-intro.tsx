"use client";

import Link from "next/link";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { GameMark } from "@/components/game/game-mark";
import { LocaleSwitch } from "@/components/i18n/locale-switch";
import { useLocale } from "@/lib/i18n";
import { GAMES, type GameType } from "@/types/game";

interface GameIntroProps {
  gameType: GameType;
}

/** The game's cover (full-width, in its colour) and collapsible rules. */
export function GameIntro({ gameType }: GameIntroProps) {
  const { t } = useLocale();
  const game = GAMES[gameType];

  return (
    <>
      <header className="card-back pt-safe relative overflow-hidden rounded-b-[1.75rem]">
        <div className="flex items-center justify-between px-3 pt-2">
          <Link
            href="/"
            aria-label={t("decks.backToGames")}
            className="inline-flex size-11 items-center justify-center rounded-full active:bg-black/15"
          >
            <ArrowLeft className="size-6" />
          </Link>
          <LocaleSwitch className="bg-black/10 active:bg-black/20" />
        </div>
        <div className="relative px-5 pt-5 pb-6">
          <GameMark
            game={gameType}
            className="absolute -top-11 right-16 size-14"
          />
          <h1
            className="relative text-[3.5rem] leading-[0.92] font-extrabold tracking-[-0.012em]"
            style={{ fontStretch: "var(--title-width)" }}
          >
            {game.name}
          </h1>
          <p className="relative mt-3 max-w-[30ch] text-lg leading-snug font-bold">
            {t(`games.${gameType}.teaser`)}
          </p>
        </div>
      </header>

      <details className="group border-b mx-5">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between text-lg font-bold [&::-webkit-details-marker]:hidden">
          {t("decks.howToPlay")}
          <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ol className="flex flex-col gap-3 pb-5">
          {game.howToPlay.map((step, i) => (
            <li key={i} className="flex gap-3 leading-snug text-muted-foreground">
              <span className="font-display w-5 shrink-0 text-xl leading-none font-extrabold text-foreground">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </details>
    </>
  );
}

/** "Choose a Deck" heading. */
export function ChooseDeckHeading() {
  const { t } = useLocale();
  return <h2 className="px-5 pt-6 pb-1 text-[1.75rem] leading-none font-extrabold">{t("decks.chooseDeck")}</h2>;
}
