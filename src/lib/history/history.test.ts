import { afterEach, describe, expect, test } from "bun:test";
import { createMemoryBackend, createStore, getStore, setStore } from "@/lib/storage";
import type { SituationCard } from "@/types/card";
import type { SituationSessionState } from "@/types/session";
import {
  addGroup,
  addRecord,
  backupFileName,
  createBackup,
  DEFAULT_GROUPS,
  DEFAULT_RANDOM_FILTERS,
  deckFamily,
  EXPORT_REMINDER_EVERY,
  exportBackup,
  filterCandidates,
  getGroups,
  getHistory,
  getSettings,
  importBackup,
  MAX_MINUTES_OPTIONS,
  mergeRecords,
  normalizeSettings,
  pickRandom,
  playedCardIds,
  recordPlay,
  renameGroup,
  restoreBackup,
  selectedGroup,
  selectGroup,
  setGroups,
  setHidePlayed,
  shouldRemindExport,
  situationPlayRecord,
  snoozeExportReminder,
  updateSettings,
  type PickCandidate,
  type PlayRecord,
  type RandomFilters,
} from "./index";

function record(overrides: Partial<PlayRecord> = {}): PlayRecord {
  return {
    deckId: "classic-en-situation",
    cardId: "cl-001",
    group: "default",
    mode: "human",
    language: "en",
    startedAt: "2026-10-30T20:00:00.000Z",
    endedAt: "2026-10-30T20:10:00.000Z",
    questions: 12,
    hintsUsed: 1,
    outcome: "solved",
    ...overrides,
  };
}

function useMemoryStore(raw: Record<string, string> = {}) {
  const store = createStore(createMemoryBackend(raw));
  setStore(store);
  return store;
}

afterEach(() => setStore(undefined));

describe("records", () => {
  test("addRecord dedupes by deck, card, group and start time", () => {
    const a = record();
    const list = addRecord([], a);
    expect(addRecord(list, { ...a })).toBe(list);
    expect(addRecord(list, record({ group: "g2" }))).toHaveLength(2);
  });

  test("playedCardIds is per group and spans EN/ES variants of a deck", () => {
    const records = [
      record({ cardId: "cl-001" }),
      record({ cardId: "cl-002", deckId: "classic-es-situation" }),
      record({ cardId: "cl-003", group: "berlin" }),
      record({ cardId: "no-001", deckId: "no-death-en-situation" }),
    ];
    expect([...playedCardIds(records, "classic-en-situation", "default")].sort()).toEqual([
      "cl-001",
      "cl-002",
    ]);
    expect([...playedCardIds(records, "classic-es-situation", "berlin")]).toEqual(["cl-003"]);
    expect(deckFamily("classic-es-situation")).toBe("classic-situation");
    expect(deckFamily("sample-en-situation")).not.toBe(deckFamily("classic-en-situation"));
  });

  test("mergeRecords is a deduped union sorted by end time", () => {
    const early = record({ cardId: "a", endedAt: "2026-01-01T00:00:00Z" });
    const late = record({ cardId: "b", endedAt: "2026-02-01T00:00:00Z" });
    expect(mergeRecords([late], [early, late]).map((r) => r.cardId)).toEqual(["a", "b"]);
  });
});

describe("groups", () => {
  test("add selects the new group; rename and hide-played update it", () => {
    let s = addGroup(DEFAULT_GROUPS, "  Berlin   crew ", "g1");
    expect(s.selectedId).toBe("g1");
    expect(selectedGroup(s)).toEqual({ id: "g1", name: "Berlin crew", hidePlayed: false });
    s = renameGroup(s, "g1", "Partner");
    s = setHidePlayed(s, "g1", true);
    expect(selectedGroup(s)).toEqual({ id: "g1", name: "Partner", hidePlayed: true });
    expect(selectGroup(s, "default").selectedId).toBe("default");
    expect(selectGroup(s, "missing")).toBe(s);
  });

  test("empty names are ignored", () => {
    expect(addGroup(DEFAULT_GROUPS, "   ", "g1")).toBe(DEFAULT_GROUPS);
    const s = addGroup(DEFAULT_GROUPS, "Solo", "g1");
    expect(renameGroup(s, "g1", " ")).toBe(s);
  });
});

describe("random pick", () => {
  const cards: PickCandidate[] = [
    { cardId: "short-clean", estMinutes: 5 },
    { cardId: "long-clean", estMinutes: 20 },
    { cardId: "short-warn", estMinutes: 5, contentWarnings: ["death"] },
    { cardId: "unknown-time" },
    { cardId: "played-clean", estMinutes: 5 },
  ];
  const played = new Set(["played-clean"]);

  test("filters drop played, too long and warned puzzles", () => {
    const filters: RandomFilters = { unplayed: true, maxMinutes: 10, excludeWarnings: true };
    expect(filterCandidates(cards, filters, played).map((c) => c.cardId)).toEqual([
      "short-clean",
      "unknown-time",
    ]);
  });

  test("never returns an excluded puzzle, for every filter combination", () => {
    for (const unplayed of [true, false]) {
      for (const excludeWarnings of [true, false]) {
        for (const maxMinutes of MAX_MINUTES_OPTIONS) {
          const filters: RandomFilters = { unplayed, excludeWarnings, maxMinutes };
          const allowed = new Set(filterCandidates(cards, filters, played).map((c) => c.cardId));
          for (let i = 0; i < 50; i++) {
            const r = i / 50;
            const pick = pickRandom(cards, filters, played, () => r);
            if (allowed.size === 0) {
              expect(pick).toBeNull();
            } else {
              expect(pick).not.toBeNull();
              expect(allowed.has(pick!.cardId)).toBe(true);
              if (unplayed) expect(played.has(pick!.cardId)).toBe(false);
              if (excludeWarnings) expect(pick!.contentWarnings ?? []).toHaveLength(0);
              if (maxMinutes !== null && pick!.estMinutes !== undefined) {
                expect(pick!.estMinutes).toBeLessThanOrEqual(maxMinutes);
              }
            }
          }
        }
      }
    }
  });

  test("returns null when nothing matches, and copes with random() edge values", () => {
    const allPlayed = new Set(cards.map((c) => c.cardId));
    expect(pickRandom(cards, DEFAULT_RANDOM_FILTERS, allPlayed)).toBeNull();
    expect(pickRandom(cards, { ...DEFAULT_RANDOM_FILTERS, unplayed: false }, allPlayed, () => 0.9999999)).not.toBeNull();
    expect(pickRandom([], DEFAULT_RANDOM_FILTERS, played)).toBeNull();
  });

  test("covers every allowed puzzle", () => {
    const filters = { ...DEFAULT_RANDOM_FILTERS, unplayed: false };
    const seen = new Set<string>();
    for (let i = 0; i < cards.length; i++) {
      seen.add(pickRandom(cards, filters, played, () => i / cards.length)!.cardId);
    }
    expect(seen.size).toBe(cards.length);
  });
});

describe("settings and reminders", () => {
  test("normalizeSettings fills gaps from defaults", () => {
    const s = normalizeSettings({ installPromptShown: true, randomFilters: { bad: 1 } });
    expect(s.installPromptShown).toBe(true);
    expect(s.randomFilters).toEqual(DEFAULT_RANDOM_FILTERS);
    expect(s.persistence).toEqual({ requested: false, granted: null });
  });

  test("export reminder every N records unless persistence was granted", () => {
    const base = normalizeSettings({});
    expect(shouldRemindExport(EXPORT_REMINDER_EVERY - 1, base)).toBe(false);
    expect(shouldRemindExport(EXPORT_REMINDER_EVERY, base)).toBe(true);
    expect(shouldRemindExport(EXPORT_REMINDER_EVERY, { ...base, exportReminderCount: 5 })).toBe(false);
    expect(
      shouldRemindExport(50, { ...base, persistence: { requested: true, granted: true } })
    ).toBe(false);
  });
});

describe("history store", () => {
  test("history survives a new store over the same backend (reload)", () => {
    const raw: Record<string, string> = {};
    const backend = createMemoryBackend(raw);
    setStore(createStore(backend));
    recordPlay(record());
    recordPlay(record()); // duplicate
    setStore(createStore(backend));
    expect(getHistory()).toEqual([record()]);
  });

  test("records are written through the store under kea.history", () => {
    const store = useMemoryStore();
    const first = recordPlay(record());
    expect(first).toEqual({ first: true, count: 1 });
    expect(recordPlay(record({ cardId: "cl-002" })).first).toBe(false);
    expect(store.list()).toContain("history");
    expect(store.exportAll().history.v).toBe(1);
  });

  test("persistence is requested once", async () => {
    useMemoryStore();
    let calls = 0;
    const original = globalThis.navigator;
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: { storage: { persist: async () => (calls++, true), persisted: async () => true } },
    });
    try {
      recordPlay(record());
      await new Promise((r) => setTimeout(r, 0));
      recordPlay(record({ cardId: "x" }));
      await new Promise((r) => setTimeout(r, 0));
      expect(calls).toBe(1);
      expect(getSettings().persistence).toEqual({ requested: true, granted: true });
    } finally {
      Object.defineProperty(globalThis, "navigator", { configurable: true, value: original });
    }
  });

  test("groups and settings persist through the store", () => {
    useMemoryStore();
    setGroups((s) => addGroup(s, "Berlin crew", "g1"));
    updateSettings({ randomFilters: { unplayed: false, maxMinutes: 10, excludeWarnings: true } });
    expect(getGroups().selectedId).toBe("g1");
    expect(getSettings().randomFilters.maxMinutes).toBe(10);
  });

  test("export resets the reminder; snooze too", () => {
    useMemoryStore();
    for (let i = 0; i < 10; i++) recordPlay(record({ cardId: `c${i}` }));
    expect(shouldRemindExport(getHistory().length, getSettings())).toBe(true);
    exportBackup();
    expect(shouldRemindExport(getHistory().length, getSettings())).toBe(false);
    for (let i = 10; i < 20; i++) recordPlay(record({ cardId: `c${i}` }));
    snoozeExportReminder();
    expect(getSettings().exportReminderCount).toBe(20);
  });
});

describe("backup round-trip", () => {
  test("export → import on an empty phone restores history, groups and sessions", () => {
    const phoneA = useMemoryStore();
    recordPlay(record());
    recordPlay(record({ cardId: "cl-002", outcome: "gave_up" }));
    setGroups((s) => setHidePlayed(addGroup(s, "Berlin crew", "g1"), "g1", true));
    phoneA.set("session.classic-en-situation", { any: "thing" });
    phoneA.set("passcode", "secret");

    const backup = JSON.parse(JSON.stringify(exportBackup(new Date("2026-10-30T12:00:00Z"))));
    expect(backup.app).toBe("kea");
    expect(backup.data.passcode).toBeUndefined();
    expect(backupFileName(new Date("2026-10-30T12:00:00Z"))).toBe("kea-backup-2026-10-30.json");

    const phoneB = useMemoryStore();
    const result = importBackup(backup);
    expect(result).toEqual({ ok: true, keys: expect.any(Number), records: 2 });
    expect(getHistory()).toEqual(getHistoryFrom(phoneA));
    expect(getGroups().groups.map((g) => g.name)).toEqual(["", "Berlin crew"]);
    expect(phoneB.get<unknown>("session.classic-en-situation")).toEqual({ any: "thing" });
    expect(phoneB.get("passcode")).toBeNull();
  });

  test("import merges history and keeps local sessions and settings", () => {
    const source = createStore(createMemoryBackend());
    setStore(source);
    recordPlay(record({ cardId: "a" }));
    source.set("session.d", { from: "backup" });
    const backup = createBackup(source);

    const target = useMemoryStore();
    recordPlay(record({ cardId: "b" }));
    recordPlay(record({ cardId: "a" }));
    target.set("session.d", { from: "local" });
    const result = restoreBackup(getStore(), backup);
    expect(result.ok && result.records).toBe(0);
    expect(getHistory().map((r) => r.cardId).sort()).toEqual(["a", "b"]);
    expect(target.get<unknown>("session.d")).toEqual({ from: "local" });

    // Importing twice is a no-op for history.
    restoreBackup(getStore(), backup);
    expect(getHistory()).toHaveLength(2);
  });

  test("rejects files that are not a backup", () => {
    useMemoryStore();
    expect(importBackup("nope")).toEqual({ ok: false, error: "invalid" });
    expect(importBackup([1, 2])).toEqual({ ok: false, error: "invalid" });
    expect(importBackup({ foo: "bar" })).toEqual({ ok: false, error: "invalid" });
  });
});

function getHistoryFrom(store: ReturnType<typeof createStore>): PlayRecord[] {
  return store.get<PlayRecord[]>("history") ?? [];
}

describe("situationPlayRecord", () => {
  const card = { cardId: "cl-001", title: "Blackout" } as SituationCard;
  const puzzle = {
    cardId: "cl-001",
    startedAt: "2026-10-30T20:00:00.000Z",
    transcript: [],
    factsRevealed: [],
    hintsUsed: 2,
    solutionRevealed: true,
    theories: [],
    questionCount: 7,
    outcome: null,
    endedAt: null,
  };
  const session = { mode: "human", language: "es", puzzle } as unknown as SituationSessionState;

  test("builds the record from the active puzzle", () => {
    expect(
      situationPlayRecord({
        deckId: "classic-es-situation",
        session,
        card,
        group: { id: "g1", name: "Berlin crew", hidePlayed: false },
        outcome: "gave_up",
        endedAt: "2026-10-30T20:12:00.000Z",
      })
    ).toEqual({
      deckId: "classic-es-situation",
      cardId: "cl-001",
      group: "g1",
      groupName: "Berlin crew",
      mode: "human",
      language: "es",
      startedAt: "2026-10-30T20:00:00.000Z",
      endedAt: "2026-10-30T20:12:00.000Z",
      questions: 7,
      hintsUsed: 2,
      outcome: "gave_up",
      title: "Blackout",
    });
  });

  test("AI and solo records count transcript questions; solo adds a score", () => {
    const transcript = Array.from({ length: 9 }, () => ({ q: "q", a: "no", factIds: [], at: "x" }));
    const group = DEFAULT_GROUPS.groups[0];
    const args = { deckId: "d", card, group, endedAt: "2026-10-30T20:12:00.000Z" };
    const ai = situationPlayRecord({
      ...args,
      outcome: "solved",
      session: { ...session, mode: "ai", puzzle: { ...puzzle, transcript } } as SituationSessionState,
    });
    expect(ai?.mode).toBe("ai");
    expect(ai?.questions).toBe(9);
    expect(ai?.score).toBeUndefined();

    const soloSession = { ...session, mode: "solo", puzzle: { ...puzzle, transcript } } as SituationSessionState;
    const solved = situationPlayRecord({ ...args, outcome: "solved", session: soloSession });
    expect(solved?.score).toBe(100 - 9 * 2 - 2 * 10);
    const gaveUp = situationPlayRecord({ ...args, outcome: "gave_up", session: soloSession });
    expect(gaveUp?.score).toBe(0);
  });

  test("returns null when the puzzle is not active", () => {
    const ended = { ...session, puzzle: { ...puzzle, outcome: "solved" } } as SituationSessionState;
    const group = DEFAULT_GROUPS.groups[0];
    const args = { deckId: "d", card, group, outcome: "solved" as const, endedAt: "x" };
    expect(situationPlayRecord({ ...args, session: ended })).toBeNull();
    expect(
      situationPlayRecord({ ...args, session: { ...session, puzzle: { ...puzzle, startedAt: null } } as SituationSessionState })
    ).toBeNull();
  });
});
