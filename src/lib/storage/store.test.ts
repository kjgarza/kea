import { afterEach, describe, expect, test } from "bun:test";
import type { StorageBackend } from "./types";
import {
  KeaStore,
  createMemoryBackend,
  createStore,
  defineStoredCollection,
  migrateLegacyKeys,
  setStore,
} from "./index";
import {
  loadSession,
  saveSession,
  listSavedSessions,
} from "@/lib/session/session-storage";
import type { SessionState } from "@/types/session";

/** A backend we can inspect directly. */
function inspectableBackend(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const backend: StorageBackend = {
    getItem: (k) => (data.has(k) ? data.get(k)! : null),
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
    keys: () => [...data.keys()],
  };
  return { backend, data };
}

/** Behaves like localStorage in Safari private mode / disabled storage. */
function throwingBackend(): StorageBackend {
  const fail = () => {
    throw new DOMException("blocked", "SecurityError");
  };
  return { getItem: fail, setItem: fail, removeItem: fail, keys: fail };
}

/** Reads work, writes fail with a quota error. */
function fullBackend(initial: Record<string, string> = {}): StorageBackend {
  const { backend } = inspectableBackend(initial);
  return {
    ...backend,
    setItem: () => {
      throw new DOMException("full", "QuotaExceededError");
    },
  };
}

const legacySession: SessionState = {
  schemaVersion: 1,
  deckId: "animals-en-charades",
  deckVersion: "2026-01-01T00:00:00Z",
  gameType: "charades",
  shuffleEnabled: false,
  remainingCardIds: ["c2", "c3"],
  passedCardIds: [],
  currentCardId: "c1",
  isRevealed: false,
};

afterEach(() => setStore(undefined));

describe("KeaStore basics", () => {
  test("get/set/remove under the kea. namespace with an envelope", () => {
    const { backend, data } = inspectableBackend();
    const store = new KeaStore(backend);
    expect(store.set("settings.lang", "es")).toBe(true);
    expect(data.get("kea.settings.lang")).toBe(JSON.stringify({ v: 1, data: "es" }));
    expect(store.get<string>("settings.lang")).toBe("es");
    store.remove("settings.lang");
    expect(store.get("settings.lang")).toBeNull();
    expect(data.size).toBe(0);
  });

  test("list(prefix) returns logical keys and ignores foreign keys", () => {
    const { backend } = inspectableBackend({ "other.app": "x" });
    const store = new KeaStore(backend);
    store.set("session.a", 1);
    store.set("session.b", 2);
    store.set("history", []);
    expect(store.list("session.")).toEqual(["session.a", "session.b"]);
    expect(store.list()).toEqual(["history", "session.a", "session.b"]);
  });

  test("exportAll/importAll round-trip", () => {
    const a = new KeaStore(inspectableBackend().backend);
    a.set("session.a", { x: 1 });
    a.set("notes", "hi", { version: 3 });
    const dump = a.exportAll();
    expect(dump).toEqual({
      "session.a": { v: 1, data: { x: 1 } },
      notes: { v: 3, data: "hi" },
    });

    const b = new KeaStore(inspectableBackend().backend);
    expect(b.importAll({ ...dump, junk: "not an envelope" })).toBe(2);
    expect(b.exportAll()).toEqual(dump);
  });

  test("corrupt values are dropped, not thrown", () => {
    const { backend, data } = inspectableBackend({
      "kea.bad": "{not json",
      "kea.noenv": JSON.stringify({ hello: 1 }),
    });
    const store = new KeaStore(backend);
    expect(store.get("bad")).toBeNull();
    expect(store.get("noenv")).toBeNull();
    expect(data.size).toBe(0);
  });
});

describe("schema versions", () => {
  test("older values are migrated and written back", () => {
    const { backend, data } = inspectableBackend({
      "kea.prefs": JSON.stringify({ v: 1, data: { dark: true } }),
    });
    const store = new KeaStore(backend);
    const schema = {
      version: 2,
      migrate: (old: unknown, from: number) =>
        from === 1 ? { theme: (old as { dark: boolean }).dark ? "dark" : "light" } : null,
    };
    expect(store.get("prefs", schema)).toEqual({ theme: "dark" });
    expect(JSON.parse(data.get("kea.prefs")!)).toEqual({ v: 2, data: { theme: "dark" } });
  });

  test("migrate returning null drops the value", () => {
    const { backend, data } = inspectableBackend({
      "kea.prefs": JSON.stringify({ v: 1, data: 1 }),
    });
    const store = new KeaStore(backend);
    expect(store.get("prefs", { version: 2, migrate: () => null })).toBeNull();
    expect(data.has("kea.prefs")).toBe(false);
  });

  test("values from a newer build are left alone", () => {
    const { backend, data } = inspectableBackend({
      "kea.prefs": JSON.stringify({ v: 9, data: 1 }),
    });
    const store = new KeaStore(backend);
    expect(store.get("prefs", { version: 2 })).toBeNull();
    expect(data.has("kea.prefs")).toBe(true);
  });
});

describe("in-memory fallback", () => {
  test("no backend at all: values live in memory", () => {
    const store = new KeaStore(null);
    expect(store.set("session.a", 1)).toBe(false);
    expect(store.get<number>("session.a")).toBe(1);
    expect(store.list("session.")).toEqual(["session.a"]);
    expect(store.isPersistent()).toBe(false);
  });

  test("backend that throws on every call (blocked localStorage)", () => {
    const store = createStore(throwingBackend());
    expect(store.set("session.a", { n: 1 })).toBe(false);
    expect(store.get<object>("session.a")).toEqual({ n: 1 });
    expect(store.list()).toEqual(["session.a"]);
    store.remove("session.a");
    expect(store.get("session.a")).toBeNull();
  });

  test("quota exceeded: reads still come from storage, writes go to memory", () => {
    const store = new KeaStore(
      fullBackend({ "kea.old": JSON.stringify({ v: 1, data: "persisted" }) })
    );
    expect(store.get<string>("old")).toBe("persisted");
    expect(store.set("new", "mem")).toBe(false);
    expect(store.get<string>("new")).toBe("mem");
    expect(store.list()).toEqual(["new", "old"]);
    expect(store.isPersistent()).toBe(false);
  });

  test("sessions still save and load with storage blocked", () => {
    setStore(createStore(throwingBackend()));
    saveSession(legacySession);
    expect(loadSession(legacySession.deckId)).toEqual(legacySession);
    expect(listSavedSessions()).toEqual([legacySession.deckId]);
  });
});

describe("legacy cg.session.* migration", () => {
  test("moves old keys into kea.session.* on store creation", () => {
    const { backend, data } = inspectableBackend({
      "cg.session.animals-en-charades": JSON.stringify(legacySession),
      unrelated: "keep me",
    });
    setStore(createStore(backend));

    expect(data.has("cg.session.animals-en-charades")).toBe(false);
    expect(JSON.parse(data.get("kea.session.animals-en-charades")!)).toEqual({
      v: 1,
      data: legacySession,
    });
    expect(data.get("unrelated")).toBe("keep me");
    expect(loadSession("animals-en-charades")).toEqual(legacySession);
  });

  test("is idempotent and never overwrites an existing kea key", () => {
    const newer = { ...legacySession, currentCardId: "c3", remainingCardIds: [] };
    const { backend, data } = inspectableBackend({
      "cg.session.animals-en-charades": JSON.stringify(legacySession),
      "kea.session.animals-en-charades": JSON.stringify({ v: 1, data: newer }),
    });
    const store = new KeaStore(backend);
    expect(migrateLegacyKeys(store)).toEqual([]);
    expect(migrateLegacyKeys(store)).toEqual([]);
    expect(data.has("cg.session.animals-en-charades")).toBe(false);
    expect(store.get<SessionState>("session.animals-en-charades")).toEqual(newer);
  });

  test("drops unparseable legacy values", () => {
    const { backend, data } = inspectableBackend({ "cg.session.x": "{oops" });
    migrateLegacyKeys(new KeaStore(backend));
    expect(data.size).toBe(0);
  });

  test("keeps the legacy key when the new one cannot be persisted", () => {
    const raw = JSON.stringify(legacySession);
    const store = new KeaStore(fullBackend({ "cg.session.d": raw }));
    expect(migrateLegacyKeys(store)).toEqual(["session.d"]);
    // Usable this page-load from memory...
    expect(store.get<SessionState>("session.d")).toEqual(legacySession);
    // ...and the original is still there for next time.
    expect(store.readRaw("cg.session.d")).toBe(raw);
  });
});

describe("defineStoredCollection", () => {
  test("typed per-id access with validation", () => {
    setStore(new KeaStore(createMemoryBackend()));
    const notes = defineStoredCollection<string>("notes.", {
      version: 1,
      validate: (d): d is string => typeof d === "string",
    });
    notes.set("case-1", "the butler");
    expect(notes.get("case-1")).toBe("the butler");
    expect(notes.ids()).toEqual(["case-1"]);
    notes.remove("case-1");
    expect(notes.ids()).toEqual([]);
  });
});
