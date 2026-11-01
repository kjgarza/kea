import { describe, expect, test } from "bun:test";
import { caseAssetPath, isSafeAssetPath } from "./case-assets";

describe("case assets", () => {
  test("accepts relative paths inside the deck folder", () => {
    expect(isSafeAssetPath("receipt.svg")).toBe(true);
    expect(isSafeAssetPath("maps/street.png")).toBe(true);
  });

  test("rejects absolute, parent, URL and malformed paths", () => {
    for (const src of ["", " a.png", "/a.png", "../a.png", "a/../b.png", "./a.png", "a//b.png", "a\\b.png", "https://x.test/a.png", "data:image/png;base64,xx"]) {
      expect(isSafeAssetPath(src)).toBe(false);
    }
  });

  test("builds the site-relative URL", () => {
    expect(caseAssetPath("sample-en-case", "receipt.svg")).toBe(
      "/decks/assets/sample-en-case/receipt.svg"
    );
  });

  test("percent-encodes each segment but keeps the slashes", () => {
    expect(caseAssetPath("sample-en-case", "photo#2.png")).toBe("/decks/assets/sample-en-case/photo%232.png");
    expect(caseAssetPath("sample-en-case", "plan 50%.pdf")).toBe("/decks/assets/sample-en-case/plan%2050%25.pdf");
    expect(caseAssetPath("sample-en-case", "maps/a b?.png")).toBe("/decks/assets/sample-en-case/maps/a%20b%3F.png");
  });
});
