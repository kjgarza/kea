import type { StorageBackend, StorageSchema, StoredEnvelope } from "./types";
import { createMemoryBackend } from "./backends";

/** Every key the app writes lives under this namespace. */
export const KEA_NAMESPACE = "kea.";

function isEnvelope(value: unknown): value is StoredEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as StoredEnvelope).v === "number" &&
    "data" in value
  );
}

/**
 * Typed, versioned key/value store over localStorage with an in-memory
 * fallback.
 *
 * - Keys passed to the API are *logical* (`session.my-deck`); the store adds
 *   the `kea.` prefix.
 * - Every value is wrapped in `{ v, data }`. Reads with a schema migrate old
 *   versions forward and write the result back.
 * - No call ever throws. If the primary backend is missing or a call to it
 *   fails (blocked, quota exceeded), the value is kept in memory for the rest
 *   of the page's life, so the app keeps working; it just isn't persisted.
 */
export class KeaStore {
  private primary: StorageBackend | null;
  private readonly memory = createMemoryBackend();

  constructor(primary: StorageBackend | null) {
    this.primary = primary;
  }

  /** True when values are being written to durable storage. */
  isPersistent(): boolean {
    return this.primary !== null && this.memory.keys().length === 0;
  }

  get<T = unknown>(key: string, schema?: StorageSchema<T>): T | null {
    const fullKey = KEA_NAMESPACE + key;
    const raw = this.readRaw(fullKey);
    if (raw === null) return null;

    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      this.remove(key);
      return null;
    }
    if (!isEnvelope(envelope)) {
      this.remove(key);
      return null;
    }

    if (!schema) return envelope.data as T;

    let data: unknown = envelope.data;
    if (envelope.v > schema.version) {
      // Written by a newer build; leave it alone.
      return null;
    }
    if (envelope.v < schema.version) {
      let migrated: T | null = null;
      try {
        migrated = schema.migrate ? schema.migrate(data, envelope.v) : null;
      } catch {
        migrated = null;
      }
      if (migrated === null) {
        this.remove(key);
        return null;
      }
      data = migrated;
      this.set(key, migrated, schema);
    }
    if (schema.validate && !schema.validate(data)) {
      this.remove(key);
      return null;
    }
    return data as T;
  }

  /**
   * Store a value. Returns true if it reached durable storage, false if it is
   * only held in memory.
   */
  set<T>(key: string, value: T, schema?: StorageSchema<T>): boolean {
    const envelope: StoredEnvelope<T> = { v: schema?.version ?? 1, data: value };
    let raw: string;
    try {
      raw = JSON.stringify(envelope);
    } catch {
      return false;
    }
    return this.writeRaw(KEA_NAMESPACE + key, raw);
  }

  remove(key: string): void {
    this.removeRaw(KEA_NAMESPACE + key);
  }

  /** Logical keys starting with `prefix` (without the `kea.` namespace). */
  list(prefix = ""): string[] {
    const full = KEA_NAMESPACE + prefix;
    return this.allRawKeys()
      .filter((k) => k.startsWith(full))
      .map((k) => k.slice(KEA_NAMESPACE.length))
      .sort();
  }

  /** Every stored envelope, keyed by logical key. For backup/debug. */
  exportAll(): Record<string, StoredEnvelope> {
    const result: Record<string, StoredEnvelope> = {};
    for (const key of this.list()) {
      const raw = this.readRaw(KEA_NAMESPACE + key);
      if (raw === null) continue;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (isEnvelope(parsed)) result[key] = parsed;
      } catch {
        // skip corrupt entries
      }
    }
    return result;
  }

  /**
   * Restore envelopes produced by `exportAll`. Invalid entries are skipped.
   * Returns the number of keys written.
   */
  importAll(
    data: Record<string, unknown>,
    options: { overwrite?: boolean } = {}
  ): number {
    const { overwrite = true } = options;
    let count = 0;
    for (const [key, envelope] of Object.entries(data)) {
      if (!isEnvelope(envelope)) continue;
      if (!overwrite && this.readRaw(KEA_NAMESPACE + key) !== null) continue;
      try {
        this.writeRaw(KEA_NAMESPACE + key, JSON.stringify(envelope));
        count++;
      } catch {
        // skip
      }
    }
    return count;
  }

  // --- raw access (also used by legacy migration) ---------------------------

  /** @internal Read a raw (namespaced or legacy) key. */
  readRaw(fullKey: string): string | null {
    const inMemory = this.memory.getItem(fullKey);
    if (inMemory !== null) return inMemory;
    if (!this.primary) return null;
    try {
      return this.primary.getItem(fullKey);
    } catch {
      return null;
    }
  }

  /** @internal Write a raw key; falls back to memory on failure. */
  writeRaw(fullKey: string, raw: string): boolean {
    if (this.primary) {
      try {
        this.primary.setItem(fullKey, raw);
        this.memory.removeItem(fullKey);
        return true;
      } catch {
        // fall through to memory
      }
    }
    this.memory.setItem(fullKey, raw);
    return false;
  }

  /** @internal Remove a raw key from every backend. */
  removeRaw(fullKey: string): void {
    this.memory.removeItem(fullKey);
    if (!this.primary) return;
    try {
      this.primary.removeItem(fullKey);
    } catch {
      // ignore
    }
  }

  /** @internal Every raw key in memory and the primary backend. */
  allRawKeys(): string[] {
    const keys = new Set(this.memory.keys());
    if (this.primary) {
      try {
        for (const k of this.primary.keys()) keys.add(k);
      } catch {
        // ignore
      }
    }
    return [...keys];
  }
}
