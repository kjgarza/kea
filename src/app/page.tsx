"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { GameGrid } from "@/components/home/game-grid";

export default function Home() {
  return (
    <main className="min-h-screen p-6 md:p-8 relative overflow-hidden">
      {/* Decorative background shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-64 h-64 rounded-full bg-charades/10 blur-3xl" />
        <div className="absolute top-40 right-10 w-48 h-48 rounded-full bg-trivia/10 blur-3xl" />
        <div className="absolute bottom-20 left-1/4 w-56 h-56 rounded-full bg-justone/10 blur-3xl" />
        <div className="absolute bottom-40 right-1/4 w-40 h-40 rounded-full bg-monikers/10 blur-3xl" />
      </div>

      <div className="max-w-4xl mx-auto relative">
        <header className="text-center mb-12">
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4"
          >
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Party time!</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-5xl md:text-6xl font-bold mb-4 font-display bg-gradient-to-r from-charades via-primary to-trivia bg-clip-text text-transparent"
          >
            Party Card Games
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-muted-foreground text-lg"
          >
            Choose a game and let the fun begin!
          </motion.p>
        </header>

        <GameGrid />
      </div>
    </main>
  );
}
