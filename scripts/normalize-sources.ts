#!/usr/bin/env bun
/**
 * Source normaliser (issue #58)
 *
 * Turns raw items from the source importers into a pack YAML DRAFT for human
 * review, using the shared LLM provider:
 *   - Stack Exchange items → a situation puzzle pack (setup ≤ 400 chars,
 *     solution, key facts, hints), every puzzle `origin: adapted` with its
 *     licence, authors and post URL;
 *   - stories → a case pack (briefing, evidence with unlock chains,
 *     questions, walkthrough), credited to the story.
 * The draft goes to decks/drafts/sources/<pack>-<lang>.yaml (git-ignored).
 * Review it, move it to decks/puzzles/ or decks/cases/, then run the
 * importer (and, for puzzles, the solvability check).
 *
 * Usage:
 *   bun scripts/normalize-sources.ts --input decks/sources/stackexchange \
 *     --pack pse-lateral --name "Puzzling Stack Exchange" [--lang en]
 *   bun scripts/normalize-sources.ts --input decks/sources/stories/the-blue-cross.json \
 *     --pack father-brown --name "Father Brown"
 *
 * Options:
 *   --input <path>       Raw item file or folder (repeatable; required)
 *   --pack <slug>        Pack slug (required)
 *   --name <name>        Deck name (required)
 *   --lang <code>        Language to write (default: the items' language, else en)
 *   --attribution <text> Deck credit line (default: generated from the sources)
 *   --provider <name>    anthropic | openai (default anthropic; keys from .env)
 *   --model <id>         Model override
 *   --replay <file>      Recorded model output keyed by item id (offline, no keys)
 *   --include-flagged    Also normalise items the importer flagged
 *   --out <file>         Draft path (default decks/drafts/sources/<pack>-<lang>.yaml)
 *   --dry-run            Print the draft instead of writing it
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { isProviderName } from "../src/lib/ai/provider";
import { createLlmProvider } from "./lib/llm-client";
import { readRawItems } from "./lib/raw-source-files";
import { SOURCE_DRAFTS_DIR, type RawPuzzleItem, type RawStoryItem } from "./lib/raw-sources";
import {
  caseDraftYaml,
  createReplayProvider,
  normalizePuzzleItems,
  normalizeStoryItems,
  puzzleDraftYaml,
} from "./lib/source-normalize";

const { values: args } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    input: { type: "string", multiple: true },
    pack: { type: "string" },
    name: { type: "string" },
    lang: { type: "string" },
    attribution: { type: "string" },
    provider: { type: "string", default: "anthropic" },
    model: { type: "string" },
    replay: { type: "string" },
    "include-flagged": { type: "boolean", default: false },
    out: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
});

if (args.help || !args.input?.length || !args.pack || !args.name) {
  console.log(
    (await Bun.file(import.meta.path).text()).match(/\/\*\*([\s\S]*?)\*\//)![1].replace(/^ \* ?/gm, "")
  );
  process.exit(args.help ? 0 : 1);
}

async function main() {
  const items = await readRawItems(args.input!);
  const puzzles = items.filter((i): i is RawPuzzleItem => i.kind === "puzzle");
  const stories = items.filter((i): i is RawStoryItem => i.kind === "story");
  if (puzzles.length > 0 && stories.length > 0) {
    throw new Error("mix of puzzle and story items; normalise them separately");
  }
  if (items.length === 0) throw new Error("no raw items found");

  let provider;
  if (args.replay) {
    provider = createReplayProvider(await Bun.file(args.replay).json());
  } else {
    if (!isProviderName(args.provider)) throw new Error(`unknown --provider "${args.provider}"`);
    provider = createLlmProvider(args.provider, { model: args.model });
  }

  const language = args.lang ?? stories[0]?.language ?? "en";
  const meta = { pack: args.pack!, language, name: args.name!, attribution: args.attribution };
  const sources = items.map((i) => i.url);

  let yaml: string;
  if (puzzles.length > 0) {
    const res = await normalizePuzzleItems(provider, puzzles, meta, { includeFlagged: args["include-flagged"] });
    for (const r of res.rejected) console.log(`  skip ${r.id}: ${r.reason}`);
    if (!res.pack) throw new Error(res.errors.join("; "));
    for (const e of res.errors) console.warn(`  ⚠ ${e}`);
    yaml = puzzleDraftYaml(res.pack, sources, res.errors);
    console.log(`✓ ${res.pack.puzzles.length} puzzle(s) normalised`);
  } else {
    const res = await normalizeStoryItems(provider, stories, meta);
    if (!res.pack) throw new Error(res.errors.join("; "));
    for (const e of res.errors) console.warn(`  ⚠ ${e}`);
    yaml = caseDraftYaml(res.pack, sources, res.errors);
    console.log(`✓ ${res.pack.cases.length} case(s) drafted`);
  }

  if (args["dry-run"]) {
    console.log(yaml);
    return;
  }
  const out = args.out ?? `${SOURCE_DRAFTS_DIR}/${meta.pack}-${language}.yaml`;
  await mkdir(path.dirname(out), { recursive: true });
  await Bun.write(out, yaml);
  console.log(`  draft → ${out} (review it, then move it to decks/${puzzles.length ? "puzzles" : "cases"}/ and import)`);
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
