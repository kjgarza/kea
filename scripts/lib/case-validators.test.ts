import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import type { CaseCard } from "../../src/types/card";
import type { Deck, DeckIndex } from "../../src/types/deck";
import {
  CASE_LIMITS,
  findUnlockCycle,
  validateCard,
  validateCaseCard,
  validateCaseDeck,
  type AssetExists,
} from "./validators";
import { ID_MAX_CHARS, ID_PATTERN } from "../../src/lib/ai/config";
import { createFileAssetExists } from "./case-assets";
import { buildDeckMeta } from "./deck-index";

const DECK_ID = "test-en-case";

/** Fake asset store: only these files exist for DECK_ID. */
function assets(...files: string[]): AssetExists {
  return (deckId, src) => deckId === DECK_ID && files.includes(src);
}

function validCase(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "case",
    title: "The Missing Trophy",
    briefing: "The trophy is gone.",
    evidence: [
      { id: "note", title: "Note", kind: "document", content: "Locked at 3." },
      { id: "photo", title: "Photo", kind: "image", src: "photo.svg" },
      {
        id: "letter",
        title: "Letter",
        kind: "document",
        content: "Dear coach…",
        unlockAfter: ["note", "photo"],
      },
    ],
    questions: [
      { id: "who", prompt: "Who?", answer: "Lena", acceptedVariants: ["the coach"], points: 2 },
      { id: "why", prompt: "Why?", answer: "Engraving", acceptedVariants: [], points: 1 },
    ],
    walkthrough: "Lena took it to the engraver.",
    ...overrides,
  };
}

const opts = { deckId: DECK_ID, assetExists: assets("photo.svg") };

function errorsFor(overrides: Record<string, unknown>, options = opts): string[] {
  return validateCaseCard(validCase(overrides), "c-1", options).errors;
}

describe("validateCaseCard", () => {
  test("accepts a valid case and normalises it", () => {
    const result = validateCaseCard(
      validCase({ title: "  The Missing Trophy ", contentWarnings: ["Theft", "theft"] }),
      "c-1",
      opts
    );
    expect(result.errors).toEqual([]);
    const card = result.card as CaseCard;
    expect(card.type).toBe("case");
    expect(card.cardId).toBe("c-1");
    expect(card.title).toBe("The Missing Trophy");
    expect(card.contentWarnings).toEqual(["theft"]);
    expect(card.evidence.map((e) => e.id)).toEqual(["note", "photo", "letter"]);
    expect(card.evidence[2].unlockAfter).toEqual(["note", "photo"]);
  });

  test("validateCard dispatches case cards with the asset options", () => {
    expect(validateCard(validCase(), "case", "c-1", opts).valid).toBe(true);
    const missing = validateCard(validCase(), "case", "c-1", {
      deckId: DECK_ID,
      assetExists: assets(),
    });
    expect(missing.valid).toBe(false);
  });

  test("requires the top-level fields", () => {
    const errors = validateCaseCard({ type: "case" }, "c-1", opts).errors;
    expect(errors).toContain(`case card "c-1": 'title' is required and must be a non-empty string`);
    expect(errors).toContain(`case card "c-1": 'briefing' is required and must be a non-empty string`);
    expect(errors).toContain(`case card "c-1": 'walkthrough' is required and must be a non-empty string`);
    expect(errors).toContain(`case card "c-1": 'evidence' is required and must be an array`);
    expect(errors).toContain(`case card "c-1": 'questions' is required and must be an array`);
  });

  test("needs at least one evidence item and one question", () => {
    const errors = errorsFor({ evidence: [], questions: [] });
    expect(errors).toContain(
      `case card "c-1": 'evidence' must have at least ${CASE_LIMITS.minEvidence} item`
    );
    expect(errors).toContain(
      `case card "c-1": 'questions' must have at least ${CASE_LIMITS.minQuestions} item`
    );
  });

  test("rejects duplicate evidence ids", () => {
    const errors = errorsFor({
      evidence: [
        { id: "note", title: "A", kind: "document", content: "x" },
        { id: "note", title: "B", kind: "interview", content: "y" },
      ],
    });
    expect(errors).toEqual([
      `case card "c-1": evidence[1] ("note").id "note" is a duplicate; evidence ids must be unique`,
    ]);
  });

  test("rejects evidence and question ids the Worker would reject", () => {
    const badEvidence = errorsFor({
      evidence: [
        { id: "has space", title: "A", kind: "document", content: "x" },
        { id: "ünï", title: "B", kind: "document", content: "x" },
        { id: "a".repeat(121), title: "C", kind: "document", content: "x" },
        { id: "ok_id-1.2", title: "D", kind: "document", content: "x" },
      ],
    });
    expect(badEvidence.filter((e) => e.includes("the Worker rejects"))).toHaveLength(3);
    const badQuestion = errorsFor({
      questions: [
        { id: "who?", prompt: "Who?", answer: "Lena", acceptedVariants: [], points: 1 },
        { id: "why", prompt: "Why?", answer: "Engraving", acceptedVariants: [], points: 1 },
      ],
    });
    expect(badQuestion).toEqual([
      `case card "c-1": questions[0] ("who?").id "who?" must match ${ID_PATTERN} and be at most ${ID_MAX_CHARS} characters (the Worker rejects other ids)`,
    ]);
  });

  test("rejects duplicate question ids", () => {
    const q = { id: "who", prompt: "Who?", answer: "Lena", acceptedVariants: [], points: 1 };
    const errors = errorsFor({ questions: [q, { ...q, prompt: "Who again?" }] });
    expect(errors).toEqual([
      `case card "c-1": questions[1] ("who").id "who" is a duplicate; question ids must be unique`,
    ]);
  });

  test("rejects unlockAfter references to unknown evidence", () => {
    const errors = errorsFor({
      evidence: [
        { id: "note", title: "A", kind: "document", content: "x", unlockAfter: ["ghost"] },
      ],
    });
    expect(errors).toEqual([
      `case card "c-1": evidence[0] ("note").unlockAfter[0] "ghost" is not an evidence id in this case`,
    ]);
  });

  test("rejects unlock cycles and reports the path", () => {
    const errors = errorsFor({
      evidence: [
        { id: "start", title: "Start", kind: "document", content: "x" },
        { id: "a", title: "A", kind: "document", content: "x", unlockAfter: ["start", "c"] },
        { id: "b", title: "B", kind: "document", content: "x", unlockAfter: ["a"] },
        { id: "c", title: "C", kind: "document", content: "x", unlockAfter: ["b"] },
      ],
    });
    expect(errors).toEqual([
      `case card "c-1": evidence unlockAfter forms a cycle (a -> c -> b -> a); that evidence could never be opened`,
    ]);
  });

  test("rejects evidence that unlocks after itself", () => {
    const errors = errorsFor({
      evidence: [{ id: "a", title: "A", kind: "document", content: "x", unlockAfter: ["a"] }],
    });
    expect(errors).toEqual([
      `case card "c-1": evidence unlockAfter forms a cycle (a -> a); that evidence could never be opened`,
    ]);
  });

  test("rejects missing asset files with the deck path", () => {
    const errors = errorsFor({}, { deckId: DECK_ID, assetExists: assets() });
    expect(errors).toEqual([
      `case card "c-1": evidence[1] ("photo").src "photo.svg" was not found at public/decks/assets/${DECK_ID}/photo.svg`,
    ]);
  });

  test("rejects unsafe src paths", () => {
    for (const src of ["../secret.png", "/abs.png", "https://x.test/a.png", "a//b.png", "a\\b.png"]) {
      const errors = errorsFor({
        evidence: [{ id: "photo", title: "Photo", kind: "image", src }],
      });
      expect(errors).toHaveLength(1);
      expect(errors[0]).toContain(`evidence[0] ("photo").src must be a relative path`);
    }
  });

  test("checks src shape but not existence when no asset checker is given", () => {
    expect(validateCaseCard(validCase(), "c-1").errors).toEqual([]);
  });

  test("asks for the deck id when an asset checker is given without one", () => {
    const errors = validateCaseCard(validCase(), "c-1", { assetExists: assets("photo.svg") }).errors;
    expect(errors).toContain(`case card "c-1": cannot check evidence files without the deck id`);
  });

  test("file kinds need src, text kinds need content", () => {
    const errors = errorsFor({
      evidence: [
        { id: "img", title: "Img", kind: "image" },
        { id: "pdf", title: "Pdf", kind: "pdf" },
        { id: "map", title: "Map", kind: "map", content: "A map" },
        { id: "doc", title: "Doc", kind: "document" },
        { id: "int", title: "Int", kind: "interview" },
        { id: "log", title: "Log", kind: "phone_log" },
      ],
    });
    expect(errors).toEqual([
      `case card "c-1": evidence[0] ("img").src is required for image evidence`,
      `case card "c-1": evidence[1] ("pdf").src is required for pdf evidence`,
      `case card "c-1": evidence[2] ("map").src is required for map evidence`,
      `case card "c-1": evidence[3] ("doc").content is required for document evidence`,
      `case card "c-1": evidence[4] ("int").content is required for interview evidence`,
      `case card "c-1": evidence[5] ("log").content is required for phone_log evidence`,
    ]);
  });

  test("rejects unknown evidence kinds and missing titles", () => {
    const errors = errorsFor({
      evidence: [{ id: "x", kind: "video", content: "..." }],
    });
    expect(errors).toContain(
      `case card "c-1": evidence[0] ("x").title is required and must be a non-empty string`
    );
    expect(errors).toContain(
      `case card "c-1": evidence[0] ("x").kind must be one of document, image, interview, phone_log, map, pdf`
    );
  });

  test("questions need prompt, answer, acceptedVariants and points > 0", () => {
    const errors = errorsFor({
      questions: [
        { id: "q1", prompt: "", answer: "", points: 0 },
        { id: "q2", prompt: "P", answer: "A", acceptedVariants: [""], points: -1 },
      ],
    });
    expect(errors).toEqual([
      `case card "c-1": questions[0] ("q1").prompt is required and must be a non-empty string`,
      `case card "c-1": questions[0] ("q1").answer is required and must be a non-empty string`,
      `case card "c-1": questions[0] ("q1").acceptedVariants is required and must be an array of strings (may be empty)`,
      `case card "c-1": questions[0] ("q1").points must be a number greater than 0`,
      `case card "c-1": questions[1] ("q2").acceptedVariants[0] must be a non-empty string`,
      `case card "c-1": questions[1] ("q2").points must be a number greater than 0`,
    ]);
  });

  test("checks optional fields", () => {
    const errors = errorsFor({ contentWarnings: "gore", estMinutes: 0 });
    expect(errors).toContain(`case card "c-1": 'contentWarnings' must be an array of strings`);
    expect(errors).toContain(`case card "c-1": 'estMinutes' must be a positive number`);
  });
});

describe("findUnlockCycle", () => {
  test("returns null for an acyclic graph", () => {
    expect(
      findUnlockCycle([
        { id: "a" },
        { id: "b", unlockAfter: ["a"] },
        { id: "c", unlockAfter: ["a", "b"] },
      ])
    ).toBeNull();
  });

  test("returns the cycle path", () => {
    expect(
      findUnlockCycle([
        { id: "a", unlockAfter: ["b"] },
        { id: "b", unlockAfter: ["a"] },
      ])
    ).toEqual(["a", "b", "a"]);
  });
});

describe("validateCaseDeck", () => {
  test("reports duplicate card ids and wrong card types", () => {
    const card = { cardId: "c-1", ...validCase() };
    const errors = validateCaseDeck(
      { deckId: DECK_ID, gameType: "case", cards: [card, { ...card, type: "situation" }] },
      { assetExists: assets("photo.svg") }
    );
    expect(errors).toEqual([
      `deck "${DECK_ID}": cardId "c-1" is a duplicate`,
      `case card "c-1": 'type' must be "case"`,
    ]);
  });
});

describe("createFileAssetExists", () => {
  test("finds files under <root>/<deckId>/", () => {
    const root = mkdtempSync(join(tmpdir(), "kea-assets-"));
    mkdirSync(join(root, DECK_ID, "maps"), { recursive: true });
    writeFileSync(join(root, DECK_ID, "maps", "street.png"), "x");
    const exists = createFileAssetExists(root);
    expect(exists(DECK_ID, "maps/street.png")).toBe(true);
    expect(exists(DECK_ID, "maps")).toBe(false); // a folder, not a file
    expect(exists(DECK_ID, "missing.png")).toBe(false);
    expect(exists("other-en-case", "maps/street.png")).toBe(false);
  });
});

describe("committed case decks", () => {
  test("every case deck in the index validates with its real asset files", async () => {
    const index = (await Bun.file("public/decks/index.json").json()) as DeckIndex;
    const ids = index.decks.filter((d) => d.gameType === "case").map((d) => d.deckId);
    expect(ids).toContain("sample-en-case");
    const assetExists = createFileAssetExists();
    for (const deckId of ids) {
      const deck = (await Bun.file(`public/decks/${deckId}.json`).json()) as Deck<CaseCard>;
      expect(validateCaseDeck(deck, { assetExists })).toEqual([]);
      for (const card of deck.cards) {
        // Committed decks are already normalised.
        expect(validateCaseCard(card, card.cardId, { deckId, assetExists }).card).toEqual(card);
      }
    }
  });

  test("the sample case has a locked item, an image asset and feeds deck warnings", async () => {
    const deck = (await Bun.file("public/decks/sample-en-case.json").json()) as Deck<CaseCard>;
    const evidence = deck.cards[0].evidence;
    expect(evidence.some((e) => (e.unlockAfter ?? []).length > 0)).toBe(true);
    expect(evidence.some((e) => e.kind === "image" && e.src)).toBe(true);
    expect(buildDeckMeta(deck, false).contentWarnings).toEqual(["theft"]);
  });
});
