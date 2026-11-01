/**
 * Typed browser storage for Kea.
 *
 * This is the ONLY module allowed to touch `localStorage`. Everything else
 * (sessions, history, settings, notes, passcode) goes through `getStore()` or
 * the typed helpers `defineStoredValue` / `defineStoredCollection`.
 */
import type { StorageBackend, StorageSchema } from "./types";
import { getBrowserBackend } from "./backends";
import { KeaStore } from "./store";
import { migrateLegacyKeys } from "./legacy";

export type { StorageBackend, StorageSchema, StoredEnvelope } from "./types";
export { KeaStore, KEA_NAMESPACE } from "./store";
export { createMemoryBackend, fromWebStorage } from "./backends";
export { migrateLegacyKeys, LEGACY_KEY_MAPPINGS } from "./legacy";

let instance: KeaStore | null = null;

/**
 * The app-wide store. Created lazily on first use; legacy keys are migrated
 * at that point. On the server (no window) it is a throwaway in-memory store.
 */
export function getStore(): KeaStore {
  if (!instance) {
    instance = createStore(getBrowserBackend());
  }
  return instance;
}

/** Build a store over a backend (null = memory only) and migrate legacy keys. */
export function createStore(backend: StorageBackend | null): KeaStore {
  const store = new KeaStore(backend);
  migrateLegacyKeys(store);
  return store;
}

/**
 * Replace the app-wide store. Tests use this to inject a backend; pass
 * `undefined` to go back to auto-detection on next `getStore()`.
 */
export function setStore(store: KeaStore | undefined): void {
  instance = store ?? null;
}

/** A single typed value stored under one key. */
export interface StoredValue<T> {
  readonly key: string;
  get(): T | null;
  set(value: T): boolean;
  remove(): void;
}

export function defineStoredValue<T>(
  key: string,
  schema: StorageSchema<T> = { version: 1 }
): StoredValue<T> {
  return {
    key,
    get: () => getStore().get<T>(key, schema),
    set: (value) => getStore().set<T>(key, value, schema),
    remove: () => getStore().remove(key),
  };
}

/** A family of typed values sharing a key prefix, addressed by id. */
export interface StoredCollection<T> {
  readonly prefix: string;
  keyFor(id: string): string;
  get(id: string): T | null;
  set(id: string, value: T): boolean;
  remove(id: string): void;
  /** Ids (key suffixes) currently stored. */
  ids(): string[];
}

export function defineStoredCollection<T>(
  prefix: string,
  schema: StorageSchema<T> = { version: 1 }
): StoredCollection<T> {
  const keyFor = (id: string) => `${prefix}${id}`;
  return {
    prefix,
    keyFor,
    get: (id) => getStore().get<T>(keyFor(id), schema),
    set: (id, value) => getStore().set<T>(keyFor(id), value, schema),
    remove: (id) => getStore().remove(keyFor(id)),
    ids: () => getStore().list(prefix).map((k) => k.slice(prefix.length)),
  };
}
