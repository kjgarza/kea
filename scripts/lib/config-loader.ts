import { parse } from "yaml";
import type { GameType, Difficulty } from "../../src/types/game";
import { normalizeContentWarning } from "../../src/lib/data/content-warnings";

/** Tone of generated situation puzzles. */
export type SituationTone = "macabre" | "funny" | "no-death";

export const SITUATION_TONES: readonly SituationTone[] = [
  "macabre",
  "funny",
  "no-death",
];

/** Situation-only generation settings (resolved with defaults). */
export interface SituationConfig {
  tone: SituationTone;
  /** May a puzzle involve a death? Always false for the "no-death" tone. */
  allowDeath: boolean;
  /** Warnings added to every generated puzzle (normalised, de-duplicated). */
  contentWarnings: string[];
}

export interface DeckSourceConfig {
  name: string;
  gameType: GameType;
  language: string;
  topics: string[];
  difficulty: Difficulty;
  cardCount: number;
  nsfw: boolean;
  recommended: boolean;
  triviaFormat?: "mcq" | "open" | "mixed"; // Only for trivia
  situation?: SituationConfig; // Only for situation (always set for that game type)
  context?: {
    markdown?: string;
    urls?: string[];
  };
}

/**
 * Parse a YAML config file into a DeckSourceConfig
 */
export function parseConfig(yamlContent: string): DeckSourceConfig {
  const parsed = parse(yamlContent);

  // Apply defaults
  return {
    name: parsed.name,
    gameType: parsed.gameType,
    language: parsed.language ?? "en",
    topics: parsed.topics ?? [],
    difficulty: parsed.difficulty ?? "medium",
    cardCount: parsed.cardCount ?? 50,
    nsfw: parsed.nsfw ?? false,
    recommended: parsed.recommended ?? false,
    triviaFormat: parsed.triviaFormat,
    ...(parsed.gameType === "situation"
      ? { situation: parseSituationConfig(parsed) }
      : {}),
    context: parsed.context,
  };
}

/**
 * Resolve the situation fields of a YAML config:
 * - `tone` defaults to "macabre" (the classic Black Stories feel)
 * - `allowDeath` defaults to true, except for the "no-death" tone, which
 *   always forces it to false
 * - `contentWarnings` defaults to [] and is normalised
 */
export function parseSituationConfig(
  parsed: Record<string, unknown>
): SituationConfig {
  const rawTone = parsed.tone ?? "macabre";
  if (!SITUATION_TONES.includes(rawTone as SituationTone)) {
    throw new Error(
      `Invalid situation tone "${String(rawTone)}"; expected one of ${SITUATION_TONES.join(", ")}`
    );
  }
  const tone = rawTone as SituationTone;

  if (parsed.allowDeath !== undefined && typeof parsed.allowDeath !== "boolean") {
    throw new Error("'allowDeath' must be a boolean");
  }
  const allowDeath = tone === "no-death" ? false : ((parsed.allowDeath as boolean | undefined) ?? true);

  const rawWarnings = parsed.contentWarnings ?? [];
  if (
    !Array.isArray(rawWarnings) ||
    !rawWarnings.every((w) => typeof w === "string" && w.trim().length > 0)
  ) {
    throw new Error("'contentWarnings' must be a list of non-empty strings");
  }
  const contentWarnings = [
    ...new Set((rawWarnings as string[]).map(normalizeContentWarning)),
  ];

  return { tone, allowDeath, contentWarnings };
}

/**
 * Load all config files from the source directory
 */
export async function loadAllConfigs(
  sourceDir: string
): Promise<Map<string, DeckSourceConfig>> {
  const configs = new Map<string, DeckSourceConfig>();
  const glob = new Bun.Glob("*.yaml");

  for await (const file of glob.scan(sourceDir)) {
    const filePath = `${sourceDir}/${file}`;
    const content = await Bun.file(filePath).text();
    const config = parseConfig(content);
    const configName = file.replace(".yaml", "");
    configs.set(configName, config);
  }

  return configs;
}

/**
 * Load a single config file
 */
export async function loadConfig(filePath: string): Promise<DeckSourceConfig> {
  const content = await Bun.file(filePath).text();
  return parseConfig(content);
}

/**
 * Generate a deterministic deck ID from config
 */
export function generateDeckIdFromConfig(config: DeckSourceConfig): string {
  const slug = config.name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug}-${config.language}-${config.gameType}`;
}
