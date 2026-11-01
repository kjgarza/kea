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
});
