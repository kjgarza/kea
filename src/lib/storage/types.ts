/**
 * Minimal key/value backend the store writes to. `window.localStorage` is
 * adapted to this shape; tests and the in-memory fallback implement it
 * directly. Any method may throw (blocked storage, quota exceeded); the store
 * catches every call.
 */
export interface StorageBackend {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  /** All raw keys currently held by the backend. */
  keys(): string[];
}

/** What is actually written under each `kea.*` key. */
export interface StoredEnvelope<T = unknown> {
  /** Schema version of `data`. */
  v: number;
  data: T;
}

/**
 * Describes the stored shape of a key (or a family of keys sharing a prefix).
 * When a stored value has an older `v` than `version`, `migrate` is called and
 * the result is written back. Returning `null` drops the value.
 */
export interface StorageSchema<T> {
  version: number;
  migrate?: (data: unknown, fromVersion: number) => T | null;
  /** Optional shape check run after reading/migrating; failing drops the value. */
  validate?: (data: unknown) => data is T;
}
