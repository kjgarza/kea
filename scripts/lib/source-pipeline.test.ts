import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CaseCard, SituationCard } from "../../src/types/card";
import type { CaseDeck, SituationDeck } from "../../src/types/deck";
import { createStubProvider } from "../../src/lib/ai/provider";
import { casePackToDeck, parseCasePack } from "./case-pack";
import { mergeTranslation, translatedDeckLicensing, translatedSource } from "./deck-translation";
import { parsePuzzlePack, puzzlePackToDeck, serializePuzzlePack, type PuzzlePack } from "./puzzle-pack";
import { createRecordedStackExchangeFetch, readRawItems, writeRawItems } from "./raw-source-files";
import { commercialSourceFlags, serializeRawItem, type RawPuzzleItem } from "./raw-sources";
import {
  CASE_ADAPT_SCHEMA_NAME,
  PUZZLE_NORMALIZE_SCHEMA_NAME,
  caseDraftYaml,
  createReplayProvider,
  normalizePuzzleItems,
  normalizeStoryItems,
  parsePuzzleNormalizeOutput,
  puzzleDraftYaml,
} from "./source-normalize";
import { fetchStackExchangeItems, htmlToText, toRawPuzzleItem } from "./stackexchange";
import { storyToRawItem, stripGutenbergBoilerplate } from "./story-source";

/**
 * The #58 source pipeline on the committed fixtures (original text written
 * for the tests, in the Stack Exchange API's shape):
 * recorded API → raw items → normalised YAML (replayed model output) →
 * import → the playable fixture decks in public/decks/.
 */

const FIXTURES = "scripts/fixtures/sources";
const json = (p: string) => Bun.file(path.join(FIXTURES, p)).json();

async function stackExchangeItems() {
  const fetch = createRecordedStackExchangeFetch({
    questions: await json("stackexchange/questions.json"),
    answers: await json("stackexchange/answers.json"),
  });
  return fetchStackExchangeItems({ fetch, sleep: async () => {} });
}

async function storyItem() {
  const text = await Bun.file(path.join(FIXTURES, "story-the-brass-key.txt")).text();
  const { item, errors } = storyToRawItem(text, {
    url: "https://example.org/kea-fixture/stories/the-brass-key",
    author: "Kea test fixture",
    license: "CC0-1.0",
  });
  expect(errors).toEqual([]);
  return item!;
}

const PUZZLE_META = { pack: "sample-cc-by-sa", language: "en", name: "Sample: CC BY-SA source (fixture)" };
const CASE_META = { pack: "sample-public-domain", language: "en", name: "Sample: public-domain story (fixture)" };

/** The committed deck without its version (the importer sets that). */
async function committedDeck<T>(deckId: string): Promise<T> {
  const deck = await Bun.file(`public/decks/${deckId}.json`).json();
  return { ...deck, version: "" } as T;
}

describe("Stack Exchange importer", () => {
  test("keeps questions with an accepted answer above the score threshold", async () => {
    const { items, skipped } = await stackExchangeItems();
    expect(items.map((i) => i.id)).toEqual(["puzzling-1001"]);
    expect(skipped).toEqual([
      { questionId: 1002, reason: "no accepted answer" },
      { questionId: 1004, reason: "score 2 is below 5" },
    ]);
  });

  test("records the URL, both authors and the licence by post", async () => {
    const [item] = (await stackExchangeItems()).items;
    expect(item.url).toBe("https://example.org/kea-fixture/questions/1001/the-lighthouse-that-stayed-dark");
    expect(item.answerUrl).toEndWith("#1003");
    // The question says CC BY-SA 3.0; the answer has no content_license and
    // dates from 2019, so it is 4.0. The combined card takes 4.0.
    expect(item.authors.map((a) => [a.role, a.name, a.license])).toEqual([
      ["question", "Fixture Asker", "CC-BY-SA-3.0"],
      ["answer", "Fixture Solver", "CC-BY-SA-4.0"],
    ]);
    expect(item.license).toBe("CC-BY-SA-4.0");
    expect(item.credit).toBe("Fixture Asker (question), Fixture Solver (answer)");
    expect(item.solution).toContain("bonfire");
    expect(item.solution).not.toContain("<");
    expect(item.flags).toEqual([]);
  });

  test("passes the score threshold and paging to the API and honours backoff", async () => {
    const urls: string[] = [];
    const waits: number[] = [];
    const fetch = async (url: string) => {
      urls.push(url);
      const body = url.includes("/answers/")
        ? { items: [] }
        : { items: [], has_more: false, backoff: 2 };
      return new Response(JSON.stringify(body), { status: 200 });
    };
    await fetchStackExchangeItems({ fetch, minScore: 10, max: 5, sleep: async (ms) => void waits.push(ms) });
    const params = new URL(urls[0]).searchParams;
    expect(params.get("tagged")).toBe("lateral-thinking");
    expect(params.get("site")).toBe("puzzling");
    expect(params.get("min")).toBe("10");
    expect(params.get("filter")).toBe("withbody");
    expect(waits).toEqual([2000]);
  });

  test("API errors are reported", async () => {
    const fetch = async () =>
      new Response(JSON.stringify({ error_id: 502, error_message: "too many requests" }), { status: 400 });
    await expect(fetchStackExchangeItems({ fetch, sleep: async () => {} })).rejects.toThrow("too many requests");
  });

  test("posts without a credited author are skipped", () => {
    const res = toRawPuzzleItem(
      "puzzling",
      { question_id: 1, title: "t", body: "<p>b</p>", link: "https://example.org/q/1", score: 9, tags: [], creation_date: 1, accepted_answer_id: 2 },
      { answer_id: 2, question_id: 1, body: "<p>a</p>", score: 1, is_accepted: true, creation_date: 1, owner: { display_name: "B" } }
    );
    expect(res).toEqual({ skip: "an author is missing, so the post cannot be credited" });
  });

  test("htmlToText unwraps paragraphs, lists, spoilers and entities", () => {
    expect(htmlToText(`<p>A &amp; B&#39;s</p><ul><li>one</li><li>two</li></ul><blockquote class="spoiler"><p>hidden</p></blockquote>`)).toBe(
      "A & B's\n\n- one\n- two\n\nhidden"
    );
  });

  test("flags posts that point at commercial or third-party sources", () => {
    expect(commercialSourceFlags("This is from Black Stories, card 12")).toEqual(["mentions Black Stories (commercial)"]);
    expect(commercialSourceFlags("I heard this one from a friend")).toEqual(["the poster may not be its author"]);
    expect(commercialSourceFlags("A man walks into a bar")).toEqual([]);
  });
});

describe("story importer", () => {
  test("strips Project Gutenberg boilerplate", () => {
    const text = [
      "The Project Gutenberg eBook of X",
      "*** START OF THE PROJECT GUTENBERG EBOOK X ***",
      "The story.",
      "*** END OF THE PROJECT GUTENBERG EBOOK X ***",
      "Licence text",
    ].join("\n");
    expect(stripGutenbergBoilerplate(text).trim()).toBe("The story.");
  });

  test("requires an allowed licence, a URL and an author", () => {
    const { errors } = storyToRawItem("x".repeat(300), { url: "ftp://x", author: "", license: "CC-BY-NC-4.0" });
    expect(errors).toEqual([
      expect.stringContaining(`--license "CC-BY-NC-4.0" is not allowed`),
      "--url must be an http(s) URL",
      "--author is required",
    ]);
  });

  test("builds a raw item from the fixture story", async () => {
    const item = await storyItem();
    expect(item).toMatchObject({ id: "the-brass-key", title: "The Brass Key", license: "CC0-1.0", language: "en" });
  });
});

describe("normalisation (replayed model output)", () => {
  test("Stack Exchange items become the committed CC BY-SA pack and deck", async () => {
    const { items } = await stackExchangeItems();
    const provider = createReplayProvider(await json("stackexchange-replay.json"));
    const res = await normalizePuzzleItems(provider, items, PUZZLE_META);
    expect(res.rejected).toEqual([]);
    expect(res.errors).toEqual([]);

    const draft = puzzleDraftYaml(res.pack!, items.map((i) => i.url), res.errors);
    expect(draft).toStartWith("# DRAFT for human review");
    const committed = parsePuzzlePack(await Bun.file("decks/puzzles/sample-cc-by-sa-en.yaml").text(), {
      fileName: "sample-cc-by-sa-en.yaml",
    });
    expect(parsePuzzlePack(draft).value).toEqual(committed.value);

    const { deck } = puzzlePackToDeck(committed.value!, { version: "" });
    expect(deck).toEqual(await committedDeck<SituationDeck>("sample-cc-by-sa-en-situation"));
    const card = deck!.cards[0] as SituationCard;
    expect(card.source).toEqual({
      origin: "adapted",
      pack: "sample-cc-by-sa",
      ref: "puzzling:q1001/a1003",
      license: "CC-BY-SA-4.0",
      author: "Fixture Asker (question), Fixture Solver (answer)",
      url: "https://example.org/kea-fixture/questions/1001/the-lighthouse-that-stayed-dark",
      modified: true,
    });
    expect(deck!.license).toBe("CC-BY-SA-4.0");
  });

  test("the fixture story becomes the committed case pack and deck", async () => {
    const item = await storyItem();
    const provider = createReplayProvider(await json("story-replay.json"));
    const res = await normalizeStoryItems(provider, [item], CASE_META);
    expect(res.errors).toEqual([]);
    const draft = caseDraftYaml(res.pack!, [item.url], res.errors);
    const committed = parseCasePack(await Bun.file("decks/cases/sample-public-domain-en.yaml").text(), {
      fileName: "sample-public-domain-en.yaml",
    });
    expect(parseCasePack(draft).value).toEqual(committed.value);

    const { deck } = casePackToDeck(committed.value!, { version: "" });
    expect(deck).toEqual(await committedDeck<CaseDeck>("sample-public-domain-en-case"));
    const card = deck!.cards[0] as CaseCard;
    expect(card.source).toMatchObject({ origin: "adapted", license: "CC0-1.0", author: "Kea test fixture", modified: true });
    expect(deck!.license).toBeUndefined();
    expect(deck!.attribution).toBe("Adapted from “The Brass Key” by Kea test fixture (CC0 1.0).");
  });

  test("the model never sets the licence or credit; non-puzzles are rejected", async () => {
    const [item] = (await stackExchangeItems()).items;
    const parsed = parsePuzzleNormalizeOutput(
      { isSituationPuzzle: true, title: "T", setup: "S", solution: "X", keyFacts: [], hints: [], license: "MIT", author: "Model" },
      item
    );
    expect(parsed.ok && [parsed.puzzle.license, parsed.puzzle.author]).toEqual([
      "CC-BY-SA-4.0",
      "Fixture Asker (question), Fixture Solver (answer)",
    ]);
    const provider = createStubProvider((req) => {
      expect(req.schemaName).toBe(PUZZLE_NORMALIZE_SCHEMA_NAME);
      return { isSituationPuzzle: false, rejectReason: "a riddle" };
    });
    const res = await normalizePuzzleItems(provider, [item], PUZZLE_META);
    expect(res.pack).toBeNull();
    expect(res.rejected).toEqual([{ id: "puzzling-1001", reason: "a riddle" }]);
  });

  test("flagged items are skipped unless asked for", async () => {
    const [item] = (await stackExchangeItems()).items;
    const flagged: RawPuzzleItem = { ...item, flags: ["mentions Black Stories (commercial)"] };
    const provider = createStubProvider(() => {
      throw new Error("must not be called");
    });
    const res = await normalizePuzzleItems(provider, [flagged], PUZZLE_META);
    expect(res.rejected[0].reason).toContain("flagged");
  });

  test("case requests carry the story and the schema name", async () => {
    const item = await storyItem();
    let seen = "";
    const provider = createStubProvider((req) => {
      seen = req.schemaName;
      expect(JSON.stringify(req.messages)).toContain("Item id: the-brass-key");
      return {};
    });
    const res = await normalizeStoryItems(provider, [item], CASE_META);
    expect(seen).toBe(CASE_ADAPT_SCHEMA_NAME);
    expect(res.pack).toBeNull();
  });
});

describe("licence rules in the importers", () => {
  test("adding a non-share-alike puzzle to the CC BY-SA pack fails validation", async () => {
    const pack = parsePuzzlePack(await Bun.file("decks/puzzles/sample-cc-by-sa-en.yaml").text()).value!;
    const mixed: PuzzlePack = {
      ...pack,
      puzzles: [
        ...pack.puzzles,
        { ...pack.puzzles[0], id: "kea-own", setup: "A different setup.", origin: "original", license: undefined, author: undefined, url: undefined, modified: undefined, ref: undefined },
      ],
    };
    const res = puzzlePackToDeck(mixed, { version: "" });
    expect(res.deck).toBeNull();
    expect(res.errors).toEqual([
      `deck "sample-cc-by-sa-en-situation": card "puzzling-1001" is CC BY-SA 4.0 (share-alike) but card "kea-own" is not; keep share-alike content in its own deck`,
    ]);
  });

  test("the pack round-trips with its new fields", async () => {
    const text = await Bun.file("decks/puzzles/sample-cc-by-sa-en.yaml").text();
    const pack = parsePuzzlePack(text).value!;
    expect(parsePuzzlePack(serializePuzzlePack(pack)).value).toEqual(pack);
  });

  test("unknown pack licences are rejected when parsing", () => {
    const res = parsePuzzlePack("pack: x\nlanguage: en\nname: X\nlicense: CC-BY-NC-4.0\npuzzles: [{}]\n");
    expect(res.errors).toEqual([expect.stringContaining(`'license' "CC-BY-NC-4.0" is not allowed`)]);
    const caseRes = parseCasePack("pack: x\nlanguage: en\nname: X\ncases:\n  - title: T\n    url: not-a-url\n");
    expect(caseRes.errors).toEqual([`cases[0] "T": 'url' must be an http(s) URL`]);
  });
});

describe("translation keeps sources", () => {
  test("external cards are marked modified; Kea's own are untouched", async () => {
    const deck = await committedDeck<SituationDeck>("sample-cc-by-sa-en-situation");
    const merged = mergeTranslation(deck.cards[0], { title: "El faro" }) as SituationCard;
    expect(merged.title).toBe("El faro");
    expect(merged.source).toEqual({ ...deck.cards[0].source!, modified: true });
    expect(translatedSource({ origin: "original" as const, pack: "x" })).toEqual({ origin: "original", pack: "x" });
    expect(translatedDeckLicensing(deck)).toEqual({ license: deck.license, attribution: deck.attribution });
    expect(translatedDeckLicensing({})).toEqual({});
  });
});

describe("determinism", () => {
  test("re-running the importers writes nothing new", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "kea-sources-"));
    try {
      const first = await writeRawItems([...(await stackExchangeItems()).items, await storyItem()], dir);
      expect(first.written.length).toBe(2);
      const second = await writeRawItems([...(await stackExchangeItems()).items, await storyItem()], dir);
      expect(second).toEqual({ written: [], unchanged: first.written });
      const read = await readRawItems([dir]);
      expect(read.map(serializeRawItem)).toEqual(
        [...(await stackExchangeItems()).items, await storyItem()].map(serializeRawItem)
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("normalising twice gives the same YAML", async () => {
    const { items } = await stackExchangeItems();
    const run = async () => {
      const res = await normalizePuzzleItems(createReplayProvider(await json("stackexchange-replay.json")), items, PUZZLE_META);
      return puzzleDraftYaml(res.pack!, items.map((i) => i.url), res.errors);
    };
    expect(await run()).toBe(await run());
  });
});
