"use client";

import { useLocale } from "@/lib/i18n";

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
    <div className={`pb-safe-3 flex shrink-0 gap-2.5 px-4 pt-3 ${stacked ? "flex-col" : ""}`}>
      {children}
    </div>
  );
}

interface ActionButtonProps {
  variant: "pass" | "primary" | "secondary";
  onClick?: () => void;
  disabled?: boolean;
  /** Optional: the words carry the button; only some actions need a symbol. */
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

const VARIANTS = {
  pass: "flex-1 bg-foreground/12 text-foreground active:bg-foreground/20 disabled:opacity-40",
  primary: "flex-[1.7] bg-primary text-primary-foreground active:brightness-90 disabled:opacity-35",
  secondary: "flex-1 bg-secondary text-secondary-foreground active:brightness-95",
};

export function ActionButton({
  variant,
  onClick,
  disabled,
  icon,
  children,
  className = "",
}: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`font-display flex h-16 min-w-0 items-center justify-center gap-2 rounded-2xl text-xl font-extrabold transition-[transform,filter,background-color] active:scale-[0.97] ${VARIANTS[variant]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

export function PassButton({ onClick, language }: { onClick: () => void; language?: string }) {
  const { t } = useLocale(language);
  return (
    <ActionButton variant="pass" onClick={onClick}>
      {t("actions.pass")}
    </ActionButton>
  );
}
