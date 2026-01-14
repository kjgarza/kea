"use client";

import { GAMES, GAME_TYPES } from "@/types/game";
import { GameTile } from "./game-tile";

export function GameGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
      {GAME_TYPES.map((gameType, index) => (
        <GameTile key={gameType} game={GAMES[gameType]} index={index} />
      ))}
    </div>
  );
}
