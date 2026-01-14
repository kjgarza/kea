"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Drama, Brain, Ban, Lightbulb, Users, Check, X } from "lucide-react";
import type { Card } from "@/types/card";
import {
  isCharadesCard,
  isTriviaCard,
  isTriviaMCQCard,
  isTabooCard,
  isJustOneCard,
  isMonikersCard,
} from "@/types/card";

interface CardDisplayProps {
  card: Card;
  isRevealed?: boolean;
  onReveal?: () => void;
}

export function CardDisplay({ card, isRevealed = false, onReveal }: CardDisplayProps) {
  if (isCharadesCard(card)) {
    return <CharadesCardDisplay card={card} />;
  }

  if (isTriviaCard(card)) {
    return (
      <TriviaCardDisplay
        card={card}
        isRevealed={isRevealed}
        onReveal={onReveal}
      />
    );
  }

  if (isTabooCard(card)) {
    return <TabooCardDisplay card={card} />;
  }

  if (isJustOneCard(card)) {
    return <JustOneCardDisplay card={card} />;
  }

  if (isMonikersCard(card)) {
    return <MonikersCardDisplay card={card} />;
  }

  return null;
}

// Charades Card - Hot Pink gradient
function CharadesCardDisplay({ card }: { card: { prompt: string } }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative h-full rounded-3xl bg-gradient-to-br from-charades to-charades-dark overflow-hidden shadow-2xl shadow-charades/30"
    >
      {/* Decorative elements */}
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

      {/* Header badge */}
      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm">
        <Drama className="w-4 h-4 text-white" />
        <span className="text-xs font-semibold text-white uppercase tracking-wide">Act it out!</span>
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center justify-center h-full p-8">
        <motion.p
          key={card.prompt}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-center text-white font-display leading-tight"
        >
          {card.prompt}
        </motion.p>
      </div>
    </motion.div>
  );
}

// Trivia Card - Royal Blue gradient
function TriviaCardDisplay({
  card,
  isRevealed,
  onReveal,
}: {
  card: Card & { type: "trivia" };
  isRevealed: boolean;
  onReveal?: () => void;
}) {
  const isMCQ = isTriviaMCQCard(card);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative h-full rounded-3xl bg-gradient-to-br from-trivia to-trivia-dark overflow-hidden shadow-2xl shadow-trivia/30"
    >
      {/* Decorative elements */}
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

      {/* Header badge */}
      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm">
        <Brain className="w-4 h-4 text-white" />
        <span className="text-xs font-semibold text-white uppercase tracking-wide">Trivia</span>
      </div>

      {/* Content */}
      <div className="relative flex flex-col h-full p-6 pt-14">
        {/* Question */}
        <div className="flex-1 flex items-center justify-center">
          <motion.p
            key={card.question}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-2xl md:text-3xl font-bold text-center text-white font-display"
          >
            {card.question}
          </motion.p>
        </div>

        {/* MCQ Choices */}
        {isMCQ && (
          <div className="space-y-2 mb-4">
            {card.choices.map((choice, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`p-3 rounded-xl flex items-center gap-3 transition-all ${
                  isRevealed && idx === card.answerIndex
                    ? "bg-success text-success-foreground shadow-lg"
                    : "bg-white/15 text-white"
                }`}
              >
                <span className={`
                  w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm
                  ${isRevealed && idx === card.answerIndex
                    ? "bg-white/30"
                    : "bg-white/20"
                  }
                `}>
                  {String.fromCharCode(65 + idx)}
                </span>
                <span className="font-medium">{choice}</span>
                {isRevealed && idx === card.answerIndex && (
                  <Check className="w-5 h-5 ml-auto" />
                )}
              </motion.div>
            ))}
          </div>
        )}

        {/* Answer Section */}
        <div className="mt-auto">
          <AnimatePresence mode="wait">
            {isRevealed ? (
              <motion.div
                key="answer"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="p-4 rounded-xl bg-success text-success-foreground"
              >
                <p className="text-xs font-semibold uppercase tracking-wide mb-1 opacity-80">
                  Answer
                </p>
                <p className="text-xl font-bold font-display">{card.answerText}</p>
              </motion.div>
            ) : (
              <motion.button
                key="reveal"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                onClick={onReveal}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="w-full p-4 rounded-xl bg-white/20 backdrop-blur-sm text-white font-bold hover:bg-white/30 transition-colors"
              >
                Reveal Answer
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

// Taboo Card - Fiery Red gradient
function TabooCardDisplay({
  card,
}: {
  card: { target: string; forbidden: string[] };
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative h-full rounded-3xl overflow-hidden shadow-2xl shadow-taboo/30"
    >
      {/* Top section with target word */}
      <div className="absolute inset-0 bg-gradient-to-b from-taboo via-taboo-dark to-slate-900" />

      {/* Decorative elements */}
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10" />

      {/* Header badge */}
      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm">
        <Ban className="w-4 h-4 text-white" />
        <span className="text-xs font-semibold text-white uppercase tracking-wide">Taboo</span>
      </div>

      {/* Content */}
      <div className="relative flex flex-col h-full">
        {/* Target Word */}
        <div className="flex-1 flex items-center justify-center p-6 pt-14">
          <motion.p
            key={card.target}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-4xl md:text-5xl lg:text-6xl font-bold text-center text-white font-display"
          >
            {card.target}
          </motion.p>
        </div>

        {/* Forbidden Words Section */}
        <div className="bg-slate-900/80 backdrop-blur-sm p-5 rounded-t-3xl">
          <div className="flex items-center justify-center gap-2 mb-4">
            <X className="w-4 h-4 text-red-400" />
            <span className="text-xs font-bold text-red-400 uppercase tracking-widest">
              Forbidden Words
            </span>
            <X className="w-4 h-4 text-red-400" />
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {card.forbidden.map((word, idx) => (
              <motion.span
                key={idx}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className="px-4 py-2 rounded-full bg-red-500/20 text-red-300 font-semibold text-sm border border-red-500/30"
              >
                {word}
              </motion.span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// Just One Card - Bright Green gradient
function JustOneCardDisplay({ card }: { card: { target: string } }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative h-full rounded-3xl bg-gradient-to-br from-justone to-justone-dark overflow-hidden shadow-2xl shadow-justone/30"
    >
      {/* Decorative elements */}
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

      {/* Header badge */}
      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm">
        <Lightbulb className="w-4 h-4 text-white" />
        <span className="text-xs font-semibold text-white uppercase tracking-wide">Just One</span>
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center justify-center h-full p-8">
        <motion.p
          key={card.target}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl md:text-5xl lg:text-6xl font-bold text-center text-white font-display mb-6"
        >
          {card.target}
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="flex flex-col items-center gap-3"
        >
          <div className="flex -space-x-2">
            {[...Array(4)].map((_, i) => (
              <div
                key={i}
                className="w-10 h-10 rounded-full bg-white/20 border-2 border-white/40 flex items-center justify-center"
              >
                <Users className="w-5 h-5 text-white/80" />
              </div>
            ))}
          </div>
          <p className="text-white/80 text-center font-medium">
            Everyone write ONE clue!
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

// Monikers Card - Vibrant Orange gradient
function MonikersCardDisplay({ card }: { card: { phrase: string } }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="relative h-full rounded-3xl bg-gradient-to-br from-monikers to-monikers-dark overflow-hidden shadow-2xl shadow-monikers/30"
    >
      {/* Decorative elements */}
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10" />
      <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-white/5" />

      {/* Header badge */}
      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/20 backdrop-blur-sm">
        <Users className="w-4 h-4 text-white" />
        <span className="text-xs font-semibold text-white uppercase tracking-wide">Monikers</span>
      </div>

      {/* Content */}
      <div className="relative flex flex-col items-center justify-center h-full p-8">
        <motion.p
          key={card.phrase}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl md:text-4xl lg:text-5xl font-bold text-center text-white font-display leading-tight"
        >
          {card.phrase}
        </motion.p>
      </div>
    </motion.div>
  );
}
