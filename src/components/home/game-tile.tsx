"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { GameMark } from "@/components/game/game-mark";
import { useLocale } from "@/lib/i18n";
import type { GameMetadata } from "@/types/game";

interface GameTileProps {
  game: GameMetadata;
  index: number;
  isLast: boolean;
}

/** One card in the home stack. Its top edge overlaps the card above it. */
export function GameTile({ game, index, isLast }: GameTileProps) {
  const { t } = useLocale();

  return (
    <motion.div
      data-game={game.type}
      className={`relative flex min-h-0 flex-1 ${index === 0 ? "" : "-mt-5"}`}
      style={{ zIndex: index }}
      // The one load animation in the app: the stack is dealt onto the table.
      initial={{ y: 90 + index * 26 }}
      animate={{ y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 30, delay: index * 0.035 }}
    >
      <Link
        href={`/game/${game.type}`}
        className={`card-back relative flex w-full flex-col justify-start overflow-hidden rounded-t-[1.75rem] px-5 pt-3 shadow-[0_-8px_20px_-8px_rgb(0_0_0/0.45)] transition-[filter] active:brightness-90 ${
          isLast ? "pb-safe-3" : "pb-7"
        }`}
      >
        <h2 className="display-type pr-16 text-[clamp(2.25rem,5.4dvh,2.75rem)] [--type-width:var(--title-width)]">
          {game.name}
        </h2>
        <p className="mt-1 pr-12 text-sm leading-tight font-bold">
          {t(`games.${game.type}.teaser`)}
        </p>
        <GameMark game={game.type} className="absolute top-2.5 right-4 size-14" />
      </Link>
    </motion.div>
  );
}
