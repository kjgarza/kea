"use client";

import type { KeeperPanelProps } from "./keeper-panels";

export interface TheorySlotProps extends KeeperPanelProps {
  /** True in solo mode, false with the AI keeper. */
  solo: boolean;
}

/**
 * Slot for the theory sheet (#32, F10) inside the AI keeper and solo panels:
 * submit a theory, get back which facts are right and how many are missing.
 * Renders nothing until #32 fills it in; record verdicts through a reducer
 * action (e.g. `addTheory`) so they persist with the transcript.
 */
export function TheorySlot(_props: TheorySlotProps) {
  return null;
}
