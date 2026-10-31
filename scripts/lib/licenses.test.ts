import { describe, expect, test } from "bun:test";
import type { Deck, DeckIndex } from "../../src/types/deck";
import {
  LICENSE_IDS,
  contentSourceErrors,
  deckLicenseErrors,
  requiredShareAlikeLicense,
  stackExchangeLicense,
  stackExchangeLicenseByDate,
} from "./licenses";
import { validateCaseCard, validateSituationCard } from "./validators";

const sa4 = { origin: "adapted", license: "CC-BY-SA-4.0", author: "A", url: "https://example.org/a" } as const;

describe("licence allow-list", () => {
  test("covers public domain, CC0, CC BY, CC BY-SA and MIT", () => {
    expect(LICENSE_IDS).toEqual(
      expect.arrayContaining(["PDM-1.0", "CC0-1.0", "CC-BY-4.0", "CC-BY-SA-4.0", "CC-BY-SA-3.0", "MIT"])
    );
    expect(LICENSE_IDS).not.toContain("CC-BY-NC-4.0");
  });
});

describe("contentSourceErrors", () => {
  test("Kea's own sources need only an origin", () => {
    expect(contentSourceErrors({ origin: "original", pack: "classic" })).toEqual([]);
  });

  test("adapted content needs a licence and a URL", () => {
    expect(contentSourceErrors({ origin: "adapted", author: "A" })).toEqual([
      "'source.license' is required for adapted content",
      "'source.url' is required for adapted content",
    ]);
  });

  test("unknown licences are rejected", () => {
    expect(contentSourceErrors({ ...sa4, license: "CC-BY-NC-4.0" })[0]).toContain(
      `'source.license' "CC-BY-NC-4.0" is not allowed`
    );
  });

  test("attribution licences need an author; public domain does not", () => {
    expect(contentSourceErrors({ ...sa4, author: undefined })).toEqual([
      "'source.author' is required by CC BY-SA 4.0",
    ]);
    expect(contentSourceErrors({ origin: "adapted", license: "PDM-1.0", url: "https://example.org/x" })).toEqual([]);
  });

  test("checks url and modified types", () => {
    expect(contentSourceErrors({ ...sa4, url: "javascript:alert(1)", modified: "yes" })).toEqual([
      "'source.url' must be an http(s) URL",
      "'source.modified' must be true or false",
    ]);
  });

  test("the situation and case validators keep valid sources and report bad ones", () => {
    const puzzle = {
      title: "T",
      setup: "S",
      solution: "X",
      keyFacts: [
        { id: "a", text: "a" },
        { id: "b", text: "b" },
        { id: "c", text: "c" },
      ],
      hints: ["h"],
    };
    const ok = validateSituationCard({ ...puzzle, source: { ...sa4, modified: true } }, "p1");
    expect(ok.card?.source).toEqual({ ...sa4, modified: true });
    const bad = validateSituationCard({ ...puzzle, source: { origin: "adapted" } }, "p1");
    expect(bad.errors).toContain(`situation card "p1": 'source.license' is required for adapted content`);

    const caseCard = {
      title: "C",
      briefing: "B",
      walkthrough: "W",
      evidence: [{ id: "e", title: "E", kind: "document", content: "x" }],
      questions: [{ id: "q", prompt: "P", answer: "A", acceptedVariants: [], points: 1 }],
    };
    expect(validateCaseCard({ ...caseCard, source: sa4 }, "c1").card).toMatchObject({ source: sa4 });
    expect(validateCaseCard(caseCard, "c1").card).not.toHaveProperty("source");
    expect(validateCaseCard({ ...caseCard, source: { ...sa4, license: "GPL-3.0" } }, "c1").errors[0]).toContain(
      "'source.license' \"GPL-3.0\" is not allowed"
    );
  });
});

describe("deckLicenseErrors (share-alike rule)", () => {
  const card = (cardId: string, license?: string, modified?: boolean) => ({
    cardId,
    source: { license, modified },
  });

  test("decks without share-alike cards pass, with or without a licence", () => {
    expect(deckLicenseErrors({ deckId: "d", cards: [card("a"), card("b", "CC-BY-4.0")] })).toEqual([]);
    expect(deckLicenseErrors({ deckId: "d", license: "CC0-1.0", cards: [card("a", "PDM-1.0")] })).toEqual([]);
  });

  test("mixing share-alike and other cards fails with a clear error", () => {
    expect(
      deckLicenseErrors({ deckId: "d", license: "CC-BY-SA-4.0", cards: [card("a", "CC-BY-SA-4.0"), card("b")] })
    ).toEqual([
      `deck "d": card "a" is CC BY-SA 4.0 (share-alike) but card "b" is not; keep share-alike content in its own deck`,
    ]);
  });

  test("share-alike cards need a share-alike deck licence", () => {
    expect(deckLicenseErrors({ deckId: "d", cards: [card("a", "CC-BY-SA-4.0")] })[0]).toContain(
      "the deck 'license' must be set"
    );
    expect(deckLicenseErrors({ deckId: "d", license: "CC-BY-4.0", cards: [card("a", "CC-BY-SA-4.0")] })[0]).toContain(
      "needs a share-alike deck licence"
    );
  });

  test("older share-alike versions ship under a later deck licence only as adaptations", () => {
    expect(
      deckLicenseErrors({ deckId: "d", license: "CC-BY-SA-4.0", cards: [card("a", "CC-BY-SA-3.0", true)] })
    ).toEqual([]);
    expect(
      deckLicenseErrors({ deckId: "d", license: "CC-BY-SA-4.0", cards: [card("a", "CC-BY-SA-3.0")] })[0]
    ).toContain("only ship under CC BY-SA 4.0 as an adaptation");
    expect(
      deckLicenseErrors({ deckId: "d", license: "CC-BY-SA-3.0", cards: [card("a", "CC-BY-SA-4.0")] })[0]
    ).toContain("newer than the deck licence");
  });

  test("an unknown deck licence is an error", () => {
    expect(deckLicenseErrors({ deckId: "d", license: "WTFPL", cards: [] })[0]).toContain(`'license' "WTFPL" is not allowed`);
  });

  test("requiredShareAlikeLicense picks the latest version of the family", () => {
    expect(requiredShareAlikeLicense(["CC-BY-SA-2.5", "CC-BY-SA-3.0"])).toBe("CC-BY-SA-4.0");
    expect(requiredShareAlikeLicense(["CC-BY-4.0", undefined])).toBeUndefined();
  });

  test("every committed deck passes the licence rules", async () => {
    const index = (await Bun.file("public/decks/index.json").json()) as DeckIndex;
    for (const meta of index.decks) {
      const deck = (await Bun.file(`public/decks/${meta.deckId}.json`).json()) as Deck;
      expect(deckLicenseErrors(deck as Parameters<typeof deckLicenseErrors>[0])).toEqual([]);
      expect(meta.license).toBe(deck.license);
      expect(meta.attribution).toBe(deck.attribution);
    }
  });
});

describe("Stack Exchange licences", () => {
  test("by post date (UTC cut-overs)", () => {
    expect(stackExchangeLicenseByDate(new Date("2011-04-07T23:59:59Z"))).toBe("CC-BY-SA-2.5");
    expect(stackExchangeLicenseByDate(new Date("2011-04-08T00:00:00Z"))).toBe("CC-BY-SA-3.0");
    expect(stackExchangeLicenseByDate(new Date("2018-05-01T23:59:59Z"))).toBe("CC-BY-SA-3.0");
    expect(stackExchangeLicenseByDate(new Date("2018-05-02T00:00:00Z"))).toBe("CC-BY-SA-4.0");
  });

  test("the API's content_license field maps to our ids", () => {
    expect(stackExchangeLicense("CC BY-SA 4.0")).toBe("CC-BY-SA-4.0");
    expect(stackExchangeLicense("CC BY-SA 2.5")).toBe("CC-BY-SA-2.5");
    expect(stackExchangeLicense("CC BY-SA 3")).toBe("CC-BY-SA-3.0");
    expect(stackExchangeLicense("All rights reserved")).toBeNull();
    expect(stackExchangeLicense(undefined)).toBeNull();
  });
});
