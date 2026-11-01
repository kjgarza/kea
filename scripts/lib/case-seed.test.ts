import { describe, expect, test } from "bun:test";
import type { CaseCard } from "../../src/types/card";
import type { CaseDeck } from "../../src/types/deck";
import { normalizeAnswer } from "../../src/lib/game/modules/case/scoring";
import { caseMaxPoints } from "../../src/lib/game/modules/case/logic";
import { parseCasePack, walkthroughEvidenceRefs, type CasePack } from "./case-pack";
import { validateCaseDeck } from "./validators";
import { createFileAssetExists, caseAssetFilePath } from "./case-assets";

/**
 * The hand-written seed case (#36): "The Halden Chronometer" in
 * saltmarsh-bay-{en,es}-case. Checks that the two languages line up and that
 * the case is fair: every question is settled by named evidence that the
 * players can reach, and the walkthrough cites only real evidence.
 */

interface Seed {
  lang: "en" | "es";
  deckId: string;
  file: string;
}

const SEEDS: Seed[] = [
  { lang: "en", deckId: "saltmarsh-bay-en-case", file: "decks/cases/saltmarsh-bay-en.yaml" },
  { lang: "es", deckId: "saltmarsh-bay-es-case", file: "decks/cases/saltmarsh-bay-es.yaml" },
];

async function load(seed: Seed) {
  const deck = (await Bun.file(`public/decks/${seed.deckId}.json`).json()) as CaseDeck;
  const pack = parseCasePack(await Bun.file(seed.file).text(), { fileName: seed.file })
    .value as CasePack;
  return { deck, card: deck.cards[0], pack };
}

/** Everything a player can read in one evidence item (text, or the SVG's text). */
async function evidenceText(deckId: string, card: CaseCard, id: string): Promise<string> {
  const e = card.evidence.find((x) => x.id === id)!;
  let text = `${e.title}\n${e.content ?? ""}`;
  if (e.src) text += `\n${await Bun.file(caseAssetFilePath(deckId, e.src)).text()}`;
  return normalizeAnswer(text);
}

/** Evidence the players can open, following unlockAfter from the start. */
function reachable(card: CaseCard): Set<string> {
  const opened = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const e of card.evidence) {
      if (!opened.has(e.id) && (e.unlockAfter ?? []).every((id) => opened.has(id))) {
        opened.add(e.id);
        grew = true;
      }
    }
  }
  return opened;
}

/**
 * The solvability trace (also in the PR): for each question, phrases that
 * must appear in specific evidence. The first phrase of each question is the
 * core of the answer and must also appear in the official answer.
 */
const TRACE: Record<"en" | "es", Record<string, [evidenceId: string, phrase: string][]>> = {
  en: {
    who: [
      ["lost-property", "R. Lindqvist"],
      ["building-log", "VOL-07"],
      ["ruth-interview", "didn't go out again"],
      ["nina-interview", "Dr Lindqvist's car"],
      ["cctv-note", "without a break from 20:55 to 22:10"],
      ["concert-photo", "Monday, 21:20"],
      ["concert-photo", "Felix Marsh"],
    ],
    when: [
      ["building-log", "21:12"],
      ["building-log", "21:41"],
      ["condition-report", "No. 1874"],
      ["replica-plate", "No. 1874"],
    ],
    badge: [
      ["building-log", "VOL-07"],
      ["felix-interview", "VOL-07"],
      ["lost-property", "VOL-07"],
    ],
    exit: [
      ["building-log", "loading dock"],
      ["nina-interview", "backed right up to the loading dock"],
      ["floor-plan", "Loading dock"],
    ],
    where: [
      ["courier-booking", "Kessler Fine Instruments, Rotterdam"],
      ["ruth-phone", "Bay Couriers"],
      ["courier-booking", "collected 07:02 Tuesday"],
    ],
  },
  es: {
    who: [
      ["lost-property", "R. Lindqvist"],
      ["building-log", "VOL-07"],
      ["ruth-interview", "No volví a salir"],
      ["nina-interview", "el coche de la Dra. Lindqvist"],
      ["cctv-note", "sin interrupción de 20:55 a 22:10"],
      ["concert-photo", "Lunes, 21:20"],
      ["concert-photo", "Felix Marsh"],
    ],
    when: [
      ["building-log", "21:12"],
      ["building-log", "21:41"],
      ["condition-report", "n.º 1874"],
      ["replica-plate", "N.º 1874"],
    ],
    badge: [
      ["building-log", "VOL-07"],
      ["felix-interview", "VOL-07"],
      ["lost-property", "VOL-07"],
    ],
    exit: [
      ["building-log", "muelle de carga"],
      ["nina-interview", "pegado al muelle de carga"],
      ["floor-plan", "Muelle de carga"],
    ],
    where: [
      ["courier-booking", "Kessler Fine Instruments, Róterdam"],
      ["ruth-phone", "Bay Couriers"],
      ["courier-booking", "recogido el martes a las 07:02"],
    ],
  },
};

for (const seed of SEEDS) describe(`seed case ${seed.deckId}`, () => {
  test("is a valid case deck with its assets committed", async () => {
    const { deck } = await load(seed);
    expect(validateCaseDeck(deck, { assetExists: createFileAssetExists() })).toEqual([]);
    expect(deck.language).toBe(seed.lang);
  });

  test("matches the issue's shape: 10–12 evidence items, mixed kinds, unlock chains, 4–5 questions", async () => {
    const { card } = await load(seed);
    expect(card.evidence.length).toBeGreaterThanOrEqual(10);
    expect(card.evidence.length).toBeLessThanOrEqual(12);
    const kinds = new Set(card.evidence.map((e) => e.kind));
    for (const kind of ["document", "interview", "phone_log", "map", "image"] as const) {
      expect(kinds.has(kind)).toBe(true);
    }
    expect(card.evidence.filter((e) => e.unlockAfter).length).toBeGreaterThanOrEqual(2);
    expect(card.questions.length).toBeGreaterThanOrEqual(4);
    expect(card.questions.length).toBeLessThanOrEqual(5);
    for (const q of card.questions) expect(q.acceptedVariants.length).toBeGreaterThan(0);
  });

  test("the walkthrough cites only existing evidence ids, and cites every item", async () => {
    const { card } = await load(seed);
    const ids = card.evidence.map((e) => e.id);
    const refs = walkthroughEvidenceRefs(card.walkthrough);
    expect(refs.filter((id) => !ids.includes(id))).toEqual([]);
    expect([...refs].sort()).toEqual([...ids].sort());
  });

  test("every evidence item can be opened (unlock chains reach everything)", async () => {
    const { card } = await load(seed);
    expect(reachable(card).size).toBe(card.evidence.length);
  });

  test("every question has a proof of reachable evidence that the walkthrough cites", async () => {
    const { card, pack } = await load(seed);
    const open = reachable(card);
    const cited = walkthroughEvidenceRefs(card.walkthrough);
    for (const q of pack.cases[0].questions) {
      expect(q.proof?.length ?? 0).toBeGreaterThan(0);
      for (const id of q.proof!) {
        expect(open.has(id)).toBe(true);
        expect(cited).toContain(id);
      }
    }
  });

  test("solvability trace: each answer is stated in the evidence that proves it", async () => {
    const { deck, card, pack } = await load(seed);
    const trace = TRACE[seed.lang];
    expect(Object.keys(trace).sort()).toEqual(card.questions.map((q) => q.id).sort());
    for (const q of card.questions) {
      const steps = trace[q.id];
      const proof = pack.cases[0].questions.find((p) => p.id === q.id)!.proof!;
      for (const [id, phrase] of steps) {
        expect({ q: q.id, id, found: (await evidenceText(deck.deckId, card, id)).includes(normalizeAnswer(phrase)) })
          .toEqual({ q: q.id, id, found: true });
        expect(proof).toContain(id);
      }
      // Every word of the core phrase is in the official answer.
      const answer = normalizeAnswer(q.answer).split(" ");
      const core = normalizeAnswer(steps[0][1]).split(" ").filter((w) => w.length > 1);
      expect({ q: q.id, missing: core.filter((w) => !answer.includes(w)) }).toEqual({ q: q.id, missing: [] });
    }
  });
});

describe("EN/ES seed parity", () => {
  test("ids, kinds, asset paths, unlocks and points are identical", async () => {
    const [en, es] = await Promise.all(SEEDS.map(load));
    const shape = (card: CaseCard) => ({
      cardId: card.cardId,
      evidence: card.evidence.map(({ id, kind, src, unlockAfter }) => ({ id, kind, src, unlockAfter })),
      questions: card.questions.map(({ id, points }) => ({ id, points })),
      estMinutes: card.estMinutes,
    });
    expect(shape(es.card)).toEqual(shape(en.card));
    expect(caseMaxPoints(es.card)).toBe(caseMaxPoints(en.card));
    expect(walkthroughEvidenceRefs(es.card.walkthrough)).toEqual(
      walkthroughEvidenceRefs(en.card.walkthrough)
    );
  });

  test("each language has its own copy of every asset, localised for Spanish", async () => {
    const [en, es] = await Promise.all(SEEDS.map(load));
    for (const e of en.card.evidence.filter((x) => x.src)) {
      const enText = await Bun.file(caseAssetFilePath(en.deck.deckId, e.src!)).text();
      const esText = await Bun.file(caseAssetFilePath(es.deck.deckId, e.src!)).text();
      expect(esText).not.toBe(enText);
    }
  });
});
