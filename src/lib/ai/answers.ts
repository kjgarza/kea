/**
 * The keeper's fixed answer vocabulary (spec §6.2). Pure module.
 */

export const KEEPER_ANSWERS = ["yes", "no", "irrelevant", "partly", "rephrase"] as const;

export type KeeperAnswer = (typeof KEEPER_ANSWERS)[number];

export function isKeeperAnswer(value: unknown): value is KeeperAnswer {
  return typeof value === "string" && (KEEPER_ANSWERS as readonly string[]).includes(value);
}

/**
 * Normalise a model-produced answer. Case and surrounding whitespace are
 * forgiven; anything outside the vocabulary becomes `rephrase`.
 */
export function normalizeKeeperAnswer(value: unknown): KeeperAnswer {
  if (typeof value !== "string") return "rephrase";
  const lowered = value.trim().toLowerCase();
  return isKeeperAnswer(lowered) ? lowered : "rephrase";
}
