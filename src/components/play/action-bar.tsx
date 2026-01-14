"use client";

import { motion } from "framer-motion";
import { SkipForward, Check, ArrowRight, Clock } from "lucide-react";
import type { GameType } from "@/types/game";

interface ActionBarProps {
  gameType: GameType;
  onNext: () => void;
  onPass: () => void;
  // Monikers specific
  onCorrect?: () => void;
  onEndTurn?: () => void;
  isRevealed?: boolean;
}

interface ActionButtonProps {
  variant: "pass" | "primary" | "secondary";
  onClick?: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function ActionButton({ variant, onClick, disabled, icon, children, className = "" }: ActionButtonProps) {
  const baseStyles = "flex-1 h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-colors";

  const variants = {
    pass: "bg-white/80 border-2 border-border text-foreground hover:bg-white disabled:opacity-50",
    primary: "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:shadow-none",
    secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
  };

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyles} ${variants[variant]} ${className}`}
    >
      {icon}
      {children}
    </motion.button>
  );
}

export function ActionBar({
  gameType,
  onNext,
  onPass,
  onCorrect,
  onEndTurn,
  isRevealed = false,
}: ActionBarProps) {
  // Monikers has special controls
  if (gameType === "monikers") {
    return (
      <div className="flex gap-3 p-4 pb-6">
        <ActionButton
          variant="pass"
          onClick={onPass}
          icon={<SkipForward className="h-5 w-5" />}
        >
          Pass
        </ActionButton>
        <ActionButton
          variant="primary"
          onClick={onCorrect}
          icon={<Check className="h-5 w-5" />}
        >
          Correct!
        </ActionButton>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onEndTurn}
          className="h-14 w-14 rounded-2xl bg-secondary text-secondary-foreground flex items-center justify-center hover:bg-secondary/80"
        >
          <Clock className="h-5 w-5" />
        </motion.button>
      </div>
    );
  }

  // Trivia: Only show Next after reveal
  if (gameType === "trivia") {
    return (
      <div className="flex gap-3 p-4 pb-6">
        <ActionButton
          variant="pass"
          onClick={onPass}
          icon={<SkipForward className="h-5 w-5" />}
        >
          Pass
        </ActionButton>
        <ActionButton
          variant="primary"
          onClick={onNext}
          disabled={!isRevealed}
          icon={<ArrowRight className="h-5 w-5" />}
        >
          Next
        </ActionButton>
      </div>
    );
  }

  // Default: Pass and Next (for Charades, Taboo, Just One)
  return (
    <div className="flex gap-3 p-4 pb-6">
      <ActionButton
        variant="pass"
        onClick={onPass}
        icon={<SkipForward className="h-5 w-5" />}
      >
        Pass
      </ActionButton>
      <ActionButton
        variant="primary"
        onClick={onNext}
        icon={<Check className="h-5 w-5" />}
      >
        Got it!
      </ActionButton>
    </div>
  );
}
