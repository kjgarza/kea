import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SituationDeck } from "../../src/types/deck";
import {
  assignPuzzleIds,
  generateId,
  packNameFromFileName,
  parsePuzzlePack,
  puzzlePackToDeck,
  serializePuzzlePack,
  slugify,
  type PuzzlePack,
} from "./puzzle-pack";
import { importPuzzleFile } from "./puzzle-import";

const SAMPLE = "decks/puzzles/kitchen-table-en.yaml";

const PUZZLE = {
  title: "The Bus",
  setup: "A woman waves at a bus but does not get on.",
  solution: "Her son was driving it on his first day.",
  keyFacts: ["Her son drove the bus.", "It was his first day.", "She came only to watch."],
  hints: ["She never meant to get on."],
};

function pack(overrides: Partial<PuzzlePack> = {}): PuzzlePack {
  return { pack: "test", language: "en", name: "Test", puzzles: [PUZZLE], ...overrides };
}

const tempDirs: string[] = [];
afterAll(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true });
});

describe("ids", () => {
  test("slugify strips accents and apostrophes and cuts at a word boundary", () => {
    expect(slugify("¿Qué pasó en la estación?")).toBe("que-paso-en-la-estacion");
    expect(slugify("It was Tom's birthday.")).toBe("it-was-toms-birthday");
    expect(slugify("one two three four", 12)).toBe("one-two");
  });

  test("generateId suffixes clashes and falls back for empty text", () => {
    const taken = new Set(["a-b"]);
    expect(generateId("A b", taken, "x")).toBe("a-b-2");
    expect(generateId("A b", taken, "x")).toBe("a-b-3");
    expect(generateId("!!!", taken, "f1")).toBe("f1");
  });

  test("explicit ids win and generated ids never collide with them", () => {
    const [p] = assignPuzzleIds(
      pack({
        puzzles: [
          { ...PUZZLE, keyFacts: ["Her son drove the bus.", { id: "her-son-drove-the-bus", text: "x" }, "y"] },
        ],
      })
    );
    expect(p.id).toBe("the-bus");
    expect((p.keyFacts as { id: string }[]).map((f) => f.id)).toEqual([
      "her-son-drove-the-bus-2",
      "her-son-drove-the-bus",
      "y",
    ]);
  });

  test("file names split into pack and language", () => {
    expect(packNameFromFileName("decks/puzzles/kitchen-table-en.yaml")).toEqual({
      pack: "kitchen-table",
      language: "en",
    });
    expect(packNameFromFileName("nolang.yaml")).toBeNull();
  });
});

describe("parsePuzzlePack / puzzlePackToDeck", () => {
  test("the committed sample pack imports into a valid deck", async () => {
    const parsed = parsePuzzlePack(await Bun.file(SAMPLE).text(), { fileName: SAMPLE });
    expect(parsed.errors).toEqual([]);
    const { deck, errors } = puzzlePackToDeck(parsed.value!, { version: "v" });
    expect(errors).toEqual([]);
    expect(deck!.deckId).toBe("kitchen-table-en-situation");
    expect(deck!.cards.length).toBeGreaterThanOrEqual(3);
    for (const card of deck!.cards) expect(card.source).toMatchObject({ origin: "original", pack: "kitchen-table" });
  });

  test("the committed deck JSON is exactly what the importer produces (no drift)", async () => {
    const parsed = parsePuzzlePack(await Bun.file(SAMPLE).text(), { fileName: SAMPLE });
    const committed = (await Bun.file("public/decks/kitchen-table-en-situation.json").json()) as SituationDeck;
    const { deck } = puzzlePackToDeck(parsed.value!, { version: committed.version });
    expect(deck).toEqual(committed);
  });

  test("errors name the puzzle (index, title, id) and the field", () => {
    const { deck, errors } = puzzlePackToDeck(
      pack({ puzzles: [PUZZLE, { ...PUZZLE, setup: "Another setup.", hints: [], id: "bad-one" }] }),
      { version: "v" }
    );
    expect(deck).toBeNull();
    expect(errors).toEqual([`puzzles[1] "The Bus" (id "bad-one"): 'hints' has 0 items; it must have 1–4`]);
  });

  test("duplicate setups are rejected", () => {
    const { errors } = puzzlePackToDeck(pack({ puzzles: [PUZZLE, { ...PUZZLE, title: "Copy" }] }), { version: "v" });
    expect(errors[0]).toContain(`puzzles[1] "Copy" (id "copy"): 'setup' duplicates puzzle "the-bus"`);
  });

  test("pack metadata errors are reported, and must match the file name", () => {
    const { value, errors } = parsePuzzlePack("pack: other\nlanguage: es\npuzzles: []\n", {
      fileName: "decks/puzzles/kitchen-table-en.yaml",
    });
    expect(value).toBeNull();
    expect(errors).toEqual([
      `'pack' is "other" but the file name says "kitchen-table"`,
      `'language' is "es" but the file name says "en"`,
      `'name' is required and must be a non-empty string`,
      `'puzzles' is required and must be a non-empty list`,
    ]);
  });

  test("serializePuzzlePack round-trips", () => {
    const original = pack({ difficulty: "easy", puzzles: [{ ...PUZZLE, estMinutes: 5 }] });
    const parsed = parsePuzzlePack(serializePuzzlePack(original));
    expect(parsed.errors).toEqual([]);
    expect(parsed.value).toEqual(original);
  });
});

describe("importPuzzleFile", () => {
  test("importing twice produces byte-identical deck and index files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kea-puzzles-"));
    tempDirs.push(dir);
    await Bun.write(join(dir, "index.json"), await Bun.file("public/decks/index.json").text());

    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
    const first = await importPuzzleFile(SAMPLE, { outputDir: dir, now });
    expect(first.errors).toEqual([]);
    expect(first.changed).toBe(true);
    const deckPath = join(dir, "kitchen-table-en-situation.json");
    const deck1 = await Bun.file(deckPath).text();
    const index1 = await Bun.file(join(dir, "index.json")).text();

    const second = await importPuzzleFile(SAMPLE, { outputDir: dir, now });
    expect(second.changed).toBe(false);
    expect(await Bun.file(deckPath).text()).toBe(deck1);
    expect(await Bun.file(join(dir, "index.json")).text()).toBe(index1);
  });

  test("invalid packs write nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "kea-puzzles-"));
    tempDirs.push(dir);
    const file = join(dir, "broken-en.yaml");
    await Bun.write(file, serializePuzzlePack(pack({ pack: "broken", puzzles: [{ ...PUZZLE, keyFacts: ["one"] }] })));
    const result = await importPuzzleFile(file, { outputDir: dir });
    expect(result.errors[0]).toContain(`puzzles[0] "The Bus" (id "the-bus"): 'keyFacts' has 1 items`);
    expect(await Bun.file(join(dir, "broken-en-situation.json")).exists()).toBe(false);
  });
});
