import { afterEach, describe, expect, test } from "bun:test";
import { createMemoryBackend, createStore, setStore } from "@/lib/storage";
import { en } from "./en";
import { es } from "./es";
import { getLocaleOverride, setLocaleOverride, subscribeLocaleOverride } from "./locale-store";
import { createTranslator, interpolate, localeFromLanguage, translate } from "./translate";
import type { Messages } from "./types";

describe("interpolate", () => {
  test("replaces placeholders", () => {
    expect(interpolate("{count} cards", { count: 3 })).toBe("3 cards");
    expect(interpolate("{a} and {b} and {a}", { a: "x", b: 0 })).toBe("x and 0 and x");
  });

  test("leaves unknown placeholders and plain text alone", () => {
    expect(interpolate("hi {name}", {})).toBe("hi {name}");
    expect(interpolate("no vars")).toBe("no vars");
  });
});

describe("t()", () => {
  test("translates per locale with vars", () => {
    expect(translate("en", "common.cardCount", { count: 12 })).toBe("12 cards");
    expect(translate("es", "common.cardCount", { count: 12 })).toBe("12 cartas");
    const t = createTranslator("es");
    expect(t("play.restart.title")).toBe("¿Reiniciar la partida?");
    expect(t("locale.switchLabel", { language: "Español", other: "English" })).toBe(
      "Idioma: Español. Cambiar a English"
    );
  });

  test("is type-checked", () => {
    const t = createTranslator("en");
    // @ts-expect-error unknown key
    t("nope.missing");
    // @ts-expect-error missing required vars
    t("common.cardCount");
    // @ts-expect-error wrong var name
    t("common.cardCount", { total: 1 });
  });
});

describe("catalogues", () => {
  test("es has exactly the en keys, all non-empty", () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
    for (const value of Object.values(es)) expect(value.length).toBeGreaterThan(0);
  });

  test("es keeps the en placeholders", () => {
    const names = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect({ key, names: names(es[key]) }).toEqual({ key, names: names(en[key]) });
    }
  });

  test("a catalogue missing a key fails type-checking", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { "common.cancel": _omitted, ...rest } = es;
    // @ts-expect-error "common.cancel" is missing
    const incomplete: Messages = rest;
    expect(incomplete).toBeDefined();
  });
});

describe("localeFromLanguage", () => {
  test("maps deck languages to locales", () => {
    expect(localeFromLanguage("es")).toBe("es");
    expect(localeFromLanguage("ES-mx")).toBe("es");
    expect(localeFromLanguage("en")).toBe("en");
    expect(localeFromLanguage("fr")).toBe("en");
    expect(localeFromLanguage(undefined)).toBe("en");
  });
});

describe("locale override", () => {
  afterEach(() => setStore(undefined));

  test("persists through the shared store and notifies", () => {
    const raw: Record<string, string> = {};
    const backend = createMemoryBackend(raw);
    setStore(createStore(backend));
    let calls = 0;
    const unsubscribe = subscribeLocaleOverride(() => calls++);

    expect(getLocaleOverride()).toBeNull();
    setLocaleOverride("es");
    expect(getLocaleOverride()).toBe("es");
    expect(JSON.parse(backend.getItem("kea.locale")!)).toEqual({ v: 1, data: "es" });

    // A fresh store over the same backend (i.e. a reload) sees it.
    setStore(createStore(backend));
    expect(getLocaleOverride()).toBe("es");

    setLocaleOverride(null);
    expect(getLocaleOverride()).toBeNull();
    expect(calls).toBe(2);
    unsubscribe();
  });

  test("ignores invalid stored values", () => {
    setStore(createStore(createMemoryBackend({ "kea.locale": JSON.stringify({ v: 1, data: "fr" }) })));
    expect(getLocaleOverride()).toBeNull();
  });
});
