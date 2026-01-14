"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Drama,
  Brain,
  Ban,
  Lightbulb,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { GameMetadata, GameType } from "@/types/game";

const iconMap: Record<string, LucideIcon> = {
  drama: Drama,
  brain: Brain,
  ban: Ban,
  lightbulb: Lightbulb,
  users: Users,
};

const gameGradients: Record<GameType, string> = {
  charades: "from-charades to-charades-dark",
  trivia: "from-trivia to-trivia-dark",
  taboo: "from-taboo to-taboo-dark",
  justone: "from-justone to-justone-dark",
  monikers: "from-monikers to-monikers-dark",
};

const gameShadows: Record<GameType, string> = {
  charades: "shadow-charades/40",
  trivia: "shadow-trivia/40",
  taboo: "shadow-taboo/40",
  justone: "shadow-justone/40",
  monikers: "shadow-monikers/40",
};

interface GameTileProps {
  game: GameMetadata;
  index: number;
}

export function GameTile({ game, index }: GameTileProps) {
  const Icon = iconMap[game.icon] ?? Drama;
  const gradient = gameGradients[game.type];
  const shadow = gameShadows[game.type];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1, duration: 0.4, ease: "easeOut" }}
    >
      <Link href={`/game/${game.type}`}>
        <motion.div
          className={`
            relative overflow-hidden rounded-3xl p-6
            bg-gradient-to-br ${gradient}
            shadow-xl ${shadow}
            cursor-pointer
          `}
          whileHover={{ scale: 1.03, y: -4 }}
          whileTap={{ scale: 0.98 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          {/* Decorative circles */}
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10" />
          <div className="absolute -bottom-4 -left-4 w-24 h-24 rounded-full bg-white/5" />

          {/* Content */}
          <div className="relative flex flex-col items-center text-center gap-3">
            <div className="p-4 rounded-2xl bg-white/20 backdrop-blur-sm">
              <Icon className="h-10 w-10 text-white" strokeWidth={2.5} />
            </div>
            <h2 className="text-2xl font-bold text-white font-display">
              {game.name}
            </h2>
            <p className="text-sm text-white/80 leading-relaxed">
              {game.description}
            </p>
          </div>
        </motion.div>
      </Link>
    </motion.div>
  );
}
