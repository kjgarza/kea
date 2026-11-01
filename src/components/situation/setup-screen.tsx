"use client";

import { Megaphone } from "lucide-react";
import type { SituationCard } from "@/types/card";
import type { TranslateFn } from "@/lib/i18n";
import { SituationShell } from "./situation-shell";

interface Props {
  card: SituationCard;
  /** Mode-specific controls under the setup (e.g. the keeper's reveal button). */
  footer: React.ReactNode;
  /** Optional extra content under the setup (e.g. an AI transcript, #31). */
  children?: React.ReactNode;
  t: TranslateFn;
}

/** F6: the setup in large type, for reading aloud. Never shows the solution. */
export function SetupScreen({ card, footer, children, t }: Props) {
  return (
    <SituationShell testId="situation-setup" footer={footer}>
      <div
        className="rounded-3xl bg-gradient-to-br from-situation to-situation-dark text-white shadow-xl shadow-situation/30 p-6 space-y-4"
        data-testid="situation-card"
      >
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/80">
          <Megaphone className="h-4 w-4" />
          {t("situation.setup.readAloud")}
        </div>
        <h1 className="text-2xl font-bold font-display">{card.title}</h1>
        <p className="text-2xl sm:text-3xl leading-snug font-medium" data-testid="situation-setup-text">
          {card.setup}
        </p>
      </div>
      {children}
    </SituationShell>
  );
}
