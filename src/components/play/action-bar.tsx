"use client";

import { motion } from "framer-motion";
import { SkipForward } from "lucide-react";

/**
 * Building blocks for the controls under the card. Each game's PlayView
 * composes its own row from these; there is no per-game branching here.
 */

interface ActionBarProps {
  children: React.ReactNode;
  /** Stack rows vertically (e.g. Taboo's alert button above Pass/Got it). */
  stacked?: boolean;
}

export function ActionBar({ children, stacked = false }: ActionBarProps) {
  return (
    <div className={`flex gap-3 p-4 pb-6 ${stacked ? "flex-col" : ""}`}>
      {children}
    </div>
  );
}

interface ActionButtonProps {
  variant: "pass" | "primary" | "secondary";
  onClick?: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ActionButton({
  variant,
  onClick,
  disabled,
  icon,
  children,
  className = "",
}: ActionButtonProps) {
  const baseStyles =
    "flex-1 h-14 rounded-2xl font-bold text-base flex items-center justify-center gap-2 transition-colors";

  const variants = {
    pass: "bg-white/80 border-2 border-border text-foreground hover:bg-white disabled:opacity-50",
    primary:
      "bg-gradient-to-r from-primary to-primary/80 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 disabled:opacity-50 disabled:shadow-none",
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

export function PassButton({ onClick }: { onClick: () => void }) {
  return (
    <ActionButton
      variant="pass"
      onClick={onClick}
      icon={<SkipForward className="h-5 w-5" />}
    >
      Pass
    </ActionButton>
  );
}
