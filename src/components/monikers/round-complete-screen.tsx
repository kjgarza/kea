"use client";

import { motion } from "framer-motion";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RoundCompleteScreenProps {
  round: number;
  onNextRound: () => void;
}

const ROUND_NAMES = {
  1: "One Word Only",
  2: "Act It Out!",
  3: "Complete!",
};

const ROUND_DESCRIPTIONS = {
  1: "Use only ONE word to describe the phrase",
  2: "Act it out! No words allowed",
  3: "",
};

/** Full-screen interstitial between Monikers rounds. */
export function RoundCompleteScreen({ round, onNextRound }: RoundCompleteScreenProps) {
  const nextRound = (round + 1) as 1 | 2 | 3;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-b from-monikers/15 via-monikers/8 to-monikers/20 relative">
      <div className="game-bg-pattern text-monikers" />
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md text-center relative z-10"
      >
        <div className="bg-white/90 backdrop-blur-sm rounded-3xl shadow-xl p-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.2 }}
            className="text-7xl mb-4"
          >
            🎉
          </motion.div>

          <h1 className="text-3xl font-bold font-display mb-6">
            Round {round} Complete!
          </h1>

          <div className="p-5 bg-gradient-to-br from-monikers to-monikers-dark rounded-2xl mb-8">
            <p className="font-bold text-xl text-white font-display">
              Round {nextRound}: {ROUND_NAMES[round as keyof typeof ROUND_NAMES]}
            </p>
            {ROUND_DESCRIPTIONS[round as keyof typeof ROUND_DESCRIPTIONS] && (
              <p className="text-sm text-white/80 mt-2">
                {ROUND_DESCRIPTIONS[round as keyof typeof ROUND_DESCRIPTIONS]}
              </p>
            )}
          </div>

          <Button
            className="w-full h-14 rounded-2xl text-base font-bold"
            onClick={onNextRound}
          >
            <Play className="w-5 h-5 mr-2" />
            Start Round {nextRound}
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
