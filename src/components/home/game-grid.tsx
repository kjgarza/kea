"use client";

import { MotionConfig } from "framer-motion";
import { GAMES, GAME_TYPES } from "@/types/game";
import { GameTile } from "./game-tile";

/** Every game in one view: a stack of cards, each overlapping the one above. */
export function GameGrid() {
  return (
    <MotionConfig reducedMotion="user">
      <nav className="flex flex-1 flex-col">
        {GAME_TYPES.map((gameType, index) => (
          <GameTile
            key={gameType}
            game={GAMES[gameType]}
            index={index}
            isLast={index === GAME_TYPES.length - 1}
          />
        ))}
      </nav>
    </MotionConfig>
  );
}
