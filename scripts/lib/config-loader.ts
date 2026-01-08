import { parse } from "yaml";
import type { GameType, Difficulty } from "../../src/types/game";

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
    context: parsed.context,
  };
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
