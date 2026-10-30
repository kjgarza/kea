import { describe, expect, test } from "bun:test";
import { parsePhotoOutput, photoResponse } from "../ai/photo";
import {
  DEFAULT_REPO,
  GITHUB_URL_MAX_LENGTH,
  editFileUrl,
  emptyNewFileUrl,
  newFileUrl,
  parseRepoConfig,
} from "./github";
import { checkPackYaml, errorField, groupPackErrors, puzzleEntries } from "./pack-editor";
import { fitWithin } from "./image";

const parsed = parsePhotoOutput({
  readable: true,
  title: "The Cold Coffee",
  setup: "A man buys a hot coffee and pours it into the snow outside. Then he smiles.",
  solution: "His windscreen was frozen and the hot coffee melted the ice so he could drive.",
  keyFacts: ["His windscreen was frozen.", "The coffee melted the ice.", "He needed to drive."],
  hints: ["He never wanted to drink it."],
  difficulty: "easy",
  contentWarnings: [],
  ref: "",
});
if (!parsed.ok) throw new Error("fixture");
const { yaml } = photoResponse(parsed.puzzle, { pack: "winter", lang: "en" });

describe("GitHub links", () => {
  test("repo config defaults to kjgarza/kea on main", () => {
    expect(parseRepoConfig(undefined, undefined)).toEqual(DEFAULT_REPO);
    expect(parseRepoConfig("me/fork", "dev")).toEqual({ owner: "me", repo: "fork", branch: "dev" });
    expect(parseRepoConfig("bad", "../x")).toEqual(DEFAULT_REPO);
    expect(parseRepoConfig("a/b/c", "")).toEqual(DEFAULT_REPO);
  });

  test("new-file URL prefills the path and YAML", () => {
    const url = newFileUrl(DEFAULT_REPO, "decks/puzzles/winter-en.yaml", yaml)!;
    const parsedUrl = new URL(url);
    expect(parsedUrl.origin + parsedUrl.pathname).toBe("https://github.com/kjgarza/kea/new/main");
    expect(parsedUrl.searchParams.get("filename")).toBe("decks/puzzles/winter-en.yaml");
    expect(parsedUrl.searchParams.get("value")).toBe(yaml);
  });

  test("too long → null (the page falls back to copying)", () => {
    expect(newFileUrl(DEFAULT_REPO, "decks/puzzles/x-en.yaml", "x".repeat(GITHUB_URL_MAX_LENGTH))).toBeNull();
    expect(emptyNewFileUrl(DEFAULT_REPO, "decks/puzzles/x-en.yaml")).toBe(
      "https://github.com/kjgarza/kea/new/main?filename=decks%2Fpuzzles%2Fx-en.yaml"
    );
    expect(editFileUrl(DEFAULT_REPO, "decks/puzzles/x-en.yaml")).toBe(
      "https://github.com/kjgarza/kea/edit/main/decks/puzzles/x-en.yaml"
    );
  });
});

describe("pack editor validation", () => {
  test("photo YAML is valid and names its file", () => {
    expect(checkPackYaml(yaml)).toMatchObject({
      errors: [],
      fileName: "decks/puzzles/winter-en.yaml",
      deckId: "winter-en-situation",
    });
  });

  test("edits that break the puzzle report errors by field", () => {
    const broken = yaml.replace(/hints:\n(\s+- .*\n)+/, "hints: []\n");
    const check = checkPackYaml(broken);
    const groups = groupPackErrors(check.errors);
    expect(groups).toEqual([
      { field: "hints", puzzle: 'puzzles[0] "The Cold Coffee" (id "the-cold-coffee")', messages: ["'hints' has 0 items; it must have 1–4"] },
    ]);
    expect(groupPackErrors(checkPackYaml("pack: [").errors)[0].field).toBe("yaml");
    expect(groupPackErrors(checkPackYaml(yaml.replace("pack: winter", "pack: Winter")).errors)[0]).toMatchObject({
      field: "pack",
      puzzle: null,
    });
  });

  test("errorField", () => {
    expect(errorField("keyFacts[2].text is required")).toBe("keyFacts");
    expect(errorField("'setup' is 512 characters")).toBe("setup");
    expect(errorField("'source.origin' must be one of")).toBe("source");
    expect(errorField("the file must be a YAML mapping")).toBe("general");
  });

  test("puzzle entries for appending to an existing pack", () => {
    const entries = puzzleEntries(yaml);
    expect(entries.startsWith("  - title: The Cold Coffee")).toBe(true);
    expect(entries).not.toContain("pack: winter");
    expect(puzzleEntries("no list")).toBe("no list");
  });
});

test("fitWithin keeps the aspect ratio and never upscales", () => {
  expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
  expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
});
