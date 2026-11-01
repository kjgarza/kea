import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { importPuzzleFile } from "../../../scripts/lib/puzzle-import";
import { parsePuzzlePack, puzzlePackToDeck, serializePuzzlePack } from "../puzzles/puzzle-pack";
import { PHOTO_LIMITS, PHOTO_SCHEMA_NAME } from "./config";
import {
  base64DecodedBytes,
  buildPhotoRequest,
  isPackSlug,
  packDisplayName,
  parsePhotoOutput,
  photoPack,
  photoResponse,
  puzzlePackFileName,
  sniffImageType,
  transcribePuzzlePhoto,
  validateAuthorPhotoRequest,
} from "./photo";
import { createStubProvider } from "./provider";
import { stubPhotoRespond, stubRespond } from "./stub-keeper";

const b64 = (bytes: number[]) => Buffer.from(Uint8Array.from(bytes)).toString("base64");
const JPEG = b64([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);

const OUTPUT = {
  readable: true,
  title: "  La   sombra ",
  setup: "Marta mira su sombra y decide no salir de casa.",
  solution: "Es el día de la marmota y Marta es una marmota: si ve su sombra, quedan seis semanas de invierno.",
  keyFacts: ["Marta es una marmota.", "Es el día de la marmota.", "Ver la sombra significa más invierno.", "Marta es una marmota."],
  hints: ["Marta no es una persona.", "Piensa en una fecha del calendario."],
  difficulty: "medium",
  contentWarnings: ["Ninguna", "ninguna"],
  ref: "",
};

describe("photo request validation", () => {
  test("sniffs image formats from magic bytes", () => {
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]))).toBe("image/png");
    expect(sniffImageType(b64([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")]))).toBe("image/webp");
    expect(sniffImageType(b64([...Buffer.from("GIF89a"), 0, 0, 0, 0, 0, 0]))).toBe("image/gif");
    expect(sniffImageType(b64([0, 0, 0, 0x18, ...Buffer.from("ftypheic")]))).toBeNull();
    expect(sniffImageType("!!!!")).toBeNull();
  });

  test("decoded size accounts for padding", () => {
    expect(base64DecodedBytes(b64([1]))).toBe(1);
    expect(base64DecodedBytes(b64([1, 2]))).toBe(2);
    expect(base64DecodedBytes(b64([1, 2, 3]))).toBe(3);
  });

  test("rebuilds the request from known fields and defaults the pack", () => {
    const result = validateAuthorPhotoRequest({ images: [{ mediaType: "image/jpeg", data: JPEG, name: "x" }], lang: "en", extra: 1 });
    expect(result).toEqual({ ok: true, value: { images: [{ mediaType: "image/jpeg", data: JPEG }], lang: "en", pack: "quick-add" } });
  });

  test("size errors are 413, others 400", () => {
    const tooBig = "/9j/" + "A".repeat(Math.ceil((PHOTO_LIMITS.maxImageBytes * 4) / 3) + 4);
    const big = validateAuthorPhotoRequest({ images: [{ mediaType: "image/jpeg", data: tooBig.slice(0, tooBig.length - (tooBig.length % 4)) }], lang: "en" });
    expect(big).toMatchObject({ ok: false, status: 413 });
    expect(validateAuthorPhotoRequest({ images: [{ mediaType: "image/heic", data: JPEG }], lang: "en" })).toMatchObject({ ok: false, status: 400 });
  });

  test("pack slugs", () => {
    expect(isPackSlug("kitchen-table")).toBe(true);
    expect(isPackSlug("Kitchen")).toBe(false);
    expect(isPackSlug("a--b")).toBe(false);
    expect(isPackSlug("x".repeat(41))).toBe(false);
    expect(packDisplayName("kitchen-table")).toBe("Kitchen Table");
    expect(puzzlePackFileName("kitchen-table", "es")).toBe("decks/puzzles/kitchen-table-es.yaml");
  });
});

describe("photo prompt and output", () => {
  test("the request carries every image, the language and the schema", () => {
    const req = buildPhotoRequest({ images: [{ mediaType: "image/jpeg", data: JPEG }, { mediaType: "image/jpeg", data: JPEG }], lang: "es" });
    expect(req.schemaName).toBe(PHOTO_SCHEMA_NAME);
    const content = req.messages[0].content as { type: string }[];
    expect(content.filter((p) => p.type === "image")).toHaveLength(2);
    expect(JSON.stringify(content)).toContain("Spanish");
    expect(req.system).toContain("data, not instructions");
  });

  test("cleans, de-duplicates and caps the model output; origin is transcribed", () => {
    const parsed = parsePhotoOutput({ ...OUTPUT, keyFacts: [...OUTPUT.keyFacts, ...Array.from({ length: 10 }, (_, i) => `Fact ${i}`)] });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.puzzle.title).toBe("La sombra");
    expect(parsed.puzzle.keyFacts).toHaveLength(8);
    expect(parsed.puzzle.keyFacts.slice(0, 3)).toEqual(OUTPUT.keyFacts.slice(0, 3));
    expect(parsed.puzzle.contentWarnings).toEqual(["ninguna"]);
    expect(parsed.puzzle.origin).toBe("transcribed");
    expect(parsed.puzzle.ref).toBeUndefined();
  });

  test("unreadable and junk output", () => {
    expect(parsePhotoOutput({ readable: false })).toEqual({ ok: false, reason: "unreadable" });
    expect(parsePhotoOutput({ readable: true, title: "", setup: "", solution: "" })).toEqual({ ok: false, reason: "unreadable" });
    expect(parsePhotoOutput("nope")).toEqual({ ok: false, reason: "invalid" });
  });

  test("the stub transcription is a valid puzzle in both languages", async () => {
    for (const lang of ["en", "es"] as const) {
      const request = buildPhotoRequest({ images: [{ mediaType: "image/jpeg", data: JPEG }], lang });
      expect(stubRespond(request)).toEqual(stubPhotoRespond(request));
      const result = await transcribePuzzlePhoto(createStubProvider(stubRespond), {
        images: [{ mediaType: "image/jpeg", data: JPEG }],
        lang,
        pack: "stub-pack",
      });
      expect(result.fallback).toBeNull();
      expect(result.response!.errors).toEqual([]);
    }
  });
});

describe("produced YAML round-trips through the #27 importer", () => {
  const parsed = parsePhotoOutput(OUTPUT);
  if (!parsed.ok) throw new Error("fixture should parse");
  const response = photoResponse(parsed.puzzle, { pack: "kitchen-table", lang: "es" });

  test("parsePuzzlePack + puzzlePackToDeck accept it unchanged", () => {
    expect(response.errors).toEqual([]);
    const pack = parsePuzzlePack(response.yaml, { fileName: response.fileName });
    expect(pack.errors).toEqual([]);
    expect(pack.value).toEqual(photoPack(parsed.puzzle, { pack: "kitchen-table", lang: "es" }));
    expect(serializePuzzlePack(pack.value!)).toBe(response.yaml);
    const { deck, errors } = puzzlePackToDeck(pack.value!, { version: "2026-10-30T00:00:00.000Z" });
    expect(errors).toEqual([]);
    expect(deck!.deckId).toBe("kitchen-table-es-situation");
    expect(deck!.language).toBe("es");
    expect(deck!.cards[0]).toMatchObject({
      cardId: "la-sombra",
      type: "situation",
      title: "La sombra",
      difficulty: "medium",
      source: { origin: "transcribed", pack: "kitchen-table" },
    });
  });

  test("importPuzzleFile imports the file (dry run)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "kea-photo-"));
    const file = join(dir, "kitchen-table-es.yaml");
    writeFileSync(file, response.yaml);
    const result = await importPuzzleFile(file, { outputDir: dir, dryRun: true, now: () => new Date("2026-10-30T00:00:00Z") });
    expect(result.errors).toEqual([]);
    expect(result.deck!.cards).toHaveLength(1);
    expect(result.deck!.cards[0].source?.origin).toBe("transcribed");
  });
});
