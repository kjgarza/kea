import { afterAll, describe, expect, test } from "bun:test";
import { cp, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CaseDeck } from "../../src/types/deck";
import {
  assignCaseIds,
  casePackToDeck,
  parseCasePack,
  serializeCasePack,
  walkthroughEvidenceRefs,
  type CasePack,
} from "./case-pack";
import { importCaseFile, resolvePackAsset } from "./case-import";

const SEED_FILES = ["decks/cases/saltmarsh-bay-en.yaml", "decks/cases/saltmarsh-bay-es.yaml"];

const CASE = {
  id: "trophy",
  title: "The Trophy",
  briefing: "It is gone.",
  evidence: [
    { id: "note", title: "Note", kind: "document" as const, content: "Locked at 3." },
    { id: "photo", title: "Photo", kind: "image" as const, src: "photo.svg", unlockAfter: ["note"] },
  ],
  questions: [
    { id: "who", prompt: "Who?", answer: "Lena", acceptedVariants: ["the coach"], points: 2, proof: ["note"] },
  ],
  walkthrough: "The note (`note`) and the photo (`photo`) show it.",
};

function pack(overrides: Partial<CasePack> = {}): CasePack {
  return { pack: "test", language: "en", name: "Test", cases: [CASE], ...overrides };
}

const tempDirs: string[] = [];
async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "kea-cases-"));
  tempDirs.push(dir);
  return dir;
}
afterAll(async () => {
  for (const d of tempDirs) await rm(d, { recursive: true, force: true });
});

/** Every file under `dir`, as relative path → bytes. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const entry of await readdir(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    out[path.slice(dir.length + 1)] = await Bun.file(path).text();
  }
  return out;
}

describe("walkthroughEvidenceRefs", () => {
  test("returns inline-code citations in order, without duplicates", () => {
    expect(walkthroughEvidenceRefs("A (`a`), then `b-2` and `a` again.\n```\nblock\n```")).toEqual([
      "a",
      "b-2",
    ]);
  });
});

describe("parseCasePack / casePackToDeck", () => {
  test("a valid pack becomes a case deck; proofs are not shipped", () => {
    const { deck, errors } = casePackToDeck(pack(), {
      version: "v1",
      assetExists: (_d, src) => src === "photo.svg",
    });
    expect(errors).toEqual([]);
    expect(deck!.deckId).toBe("test-en-case");
    expect(deck!.gameType).toBe("case");
    expect(deck!.cards[0].cardId).toBe("trophy");
    expect(deck!.cards[0].questions[0]).toEqual({
      id: "who", prompt: "Who?", answer: "Lena", acceptedVariants: ["the coach"], points: 2,
    });
  });

  test("defaults: card id from the title, variants [] and points 1", () => {
    const noId = { ...CASE, id: undefined };
    const p = pack({
      cases: [{ ...noId, questions: [{ id: "who", prompt: "Who?", answer: "Lena" }] }],
    });
    expect(assignCaseIds(p)).toEqual(["the-trophy"]);
    const { deck } = casePackToDeck(p, { version: "v" });
    expect(deck!.cards[0].questions[0]).toMatchObject({ acceptedVariants: [], points: 1 });
  });

  test("errors name the case, the item and the field", () => {
    const { errors } = casePackToDeck(
      pack({
        cases: [
          {
            ...CASE,
            evidence: [CASE.evidence[0], { ...CASE.evidence[1], unlockAfter: ["ghost"] }],
            questions: [{ ...CASE.questions[0], proof: ["note", "nope"] }],
            walkthrough: "See `note` and `missing`.",
          },
        ],
      }),
      { version: "v", assetExists: () => false }
    );
    expect(errors).toContain(
      'cases[0] "The Trophy" (id "trophy"): evidence[1] ("photo").unlockAfter[0] "ghost" is not an evidence id in this case'
    );
    expect(errors.some((e) => e.includes('evidence[1] ("photo").src "photo.svg" was not found'))).toBe(true);
  });

  test("walkthrough citations and question proofs are checked", () => {
    const { errors } = casePackToDeck(
      pack({
        cases: [
          {
            ...CASE,
            questions: [{ ...CASE.questions[0], proof: ["photo", "nope"] }],
            walkthrough: "Only `note` and `ghost`.",
          },
        ],
      }),
      { version: "v" }
    );
    expect(errors).toEqual([
      'cases[0] "The Trophy" (id "trophy"): walkthrough cites `ghost`, which is not an evidence id in this case',
      'cases[0] "The Trophy" (id "trophy"): questions[0] ("who").proof "photo" is not cited in the walkthrough',
      'cases[0] "The Trophy" (id "trophy"): questions[0] ("who").proof "nope" is not an evidence id in this case',
    ]);
  });

  test("pack metadata must match the file name; evidence and question ids are required", () => {
    const yaml = serializeCasePack(pack({ language: "es" }));
    expect(parseCasePack(yaml, { fileName: "decks/cases/test-en.yaml" }).errors).toContain(
      `'language' is "es" but the file name says "en"`
    );
    const noIds = serializeCasePack(
      pack({ cases: [{ ...CASE, evidence: [{ ...CASE.evidence[0], id: "" }], questions: [{ ...CASE.questions[0], id: "Who" }] }] })
    );
    const errors = parseCasePack(noIds).errors;
    expect(errors).toContain('cases[0] "The Trophy": evidence[0].id is required and must be a lower-case slug');
    expect(errors).toContain('cases[0] "The Trophy": questions[0].id is required and must be a lower-case slug');
  });

  test("serializeCasePack round-trips", () => {
    const p = pack({ difficulty: "hard", topics: ["x"], recommended: true });
    expect(parseCasePack(serializeCasePack(p)).value).toEqual(p);
  });
});

describe("importCaseFile", () => {
  test("the committed seed decks and assets equal the importer output", async () => {
    for (const file of SEED_FILES) {
      const result = await importCaseFile(file, { outputDir: "public/decks", dryRun: true });
      expect(result.errors).toEqual([]);
      expect(result.changed).toBe(false);
      const committed = (await Bun.file(`public/decks/${result.deck!.deckId}.json`).json()) as CaseDeck;
      expect(result.deck).toEqual(committed);
      const pack = parseCasePack(await Bun.file(file).text(), { fileName: file }).value!;
      for (const src of result.assets) {
        const from = resolvePackAsset(pack, src)!;
        expect(await Bun.file(`public/decks/assets/${committed.deckId}/${src}`).text()).toBe(
          await Bun.file(from).text()
        );
      }
    }
  });

  test("re-running the import is byte-identical (deck, assets and index)", async () => {
    const out = await tempDir();
    const assetsOut = join(out, "assets");
    let tick = 0;
    const now = () => new Date(Date.UTC(2026, 0, 1, 0, 0, tick++));
    const run = async () => {
      for (const file of SEED_FILES) {
        const r = await importCaseFile(file, { outputDir: out, deckAssetsDir: assetsOut, now });
        expect(r.errors).toEqual([]);
      }
      return snapshot(out);
    };
    const first = await run();
    expect(Object.keys(first).sort()).toEqual([
      "assets/saltmarsh-bay-en-case/floor-plan.svg",
      "assets/saltmarsh-bay-en-case/gazette-clipping.svg",
      "assets/saltmarsh-bay-en-case/replica-plate.svg",
      "assets/saltmarsh-bay-es-case/floor-plan.svg",
      "assets/saltmarsh-bay-es-case/gazette-clipping.svg",
      "assets/saltmarsh-bay-es-case/replica-plate.svg",
      "index.json",
      "saltmarsh-bay-en-case.json",
      "saltmarsh-bay-es-case.json",
    ]);
    const second = await run();
    expect(second).toEqual(first);
    expect(tick).toBe(2); // the clock was only read for the first import of each deck
  });

  test("a changed asset bumps the version; a language folder overrides the shared file", async () => {
    const root = await tempDir();
    const packDir = join(root, "cases");
    const packAssets = join(packDir, "assets");
    await mkdir(join(packAssets, "test", "es"), { recursive: true });
    await writeFile(join(packAssets, "test", "photo.svg"), "<svg>en</svg>");
    await writeFile(join(packAssets, "test", "es", "photo.svg"), "<svg>es</svg>");
    const file = join(packDir, "test-es.yaml");
    await writeFile(file, serializeCasePack(pack({ language: "es" })));
    const opts = {
      outputDir: join(root, "out"),
      packAssetsDir: packAssets,
      deckAssetsDir: join(root, "out", "assets"),
    };
    await mkdir(opts.outputDir, { recursive: true });

    const a = await importCaseFile(file, { ...opts, now: () => new Date("2026-01-01T00:00:00Z") });
    expect(a.errors).toEqual([]);
    expect(await Bun.file(join(opts.deckAssetsDir, "test-es-case", "photo.svg")).text()).toBe("<svg>es</svg>");

    await writeFile(join(packAssets, "test", "es", "photo.svg"), "<svg>es v2</svg>");
    const b = await importCaseFile(file, { ...opts, now: () => new Date("2026-02-01T00:00:00Z") });
    expect(b.changed).toBe(true);
    expect(b.deck!.version).toBe("2026-02-01T00:00:00.000Z");
    expect(await Bun.file(join(opts.deckAssetsDir, "test-es-case", "photo.svg")).text()).toBe("<svg>es v2</svg>");
  });

  test("a missing asset names the pack folder and nothing is written", async () => {
    const root = await tempDir();
    await cp("decks/cases/saltmarsh-bay-en.yaml", join(root, "saltmarsh-bay-en.yaml"));
    const r = await importCaseFile(join(root, "saltmarsh-bay-en.yaml"), {
      outputDir: join(root, "out"),
      packAssetsDir: join(root, "no-assets"),
    });
    expect(r.deck).toBeNull();
    expect(r.errors.some((e) => e.includes("was not found in") && e.includes("saltmarsh-bay/"))).toBe(true);
    expect(await Bun.file(join(root, "out", "index.json")).exists()).toBe(false);
  });
});
