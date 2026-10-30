import type { KeaStore } from "./store";
import { KEA_NAMESPACE } from "./store";

/**
 * Keys written by builds before the typed store existed. Each legacy prefix is
 * moved under `kea.<to>` wrapped in a `{ v, data }` envelope.
 */
export const LEGACY_KEY_MAPPINGS: ReadonlyArray<{
  from: string;
  to: string;
  version: number;
}> = [
  // Game sessions: `cg.session.<deckId>` -> `kea.session.<deckId>`
  { from: "cg.session.", to: "session.", version: 1 },
];

/**
 * Move legacy keys into the `kea.` namespace. Idempotent: a legacy key is
 * removed once its value has been written durably, and an existing `kea.` key
 * is never overwritten. Unparseable legacy values are dropped. If the new key
 * can only be kept in memory (storage full/blocked), the legacy key is left in
 * place so nothing is lost.
 *
 * Returns the logical keys that were migrated.
 */
export function migrateLegacyKeys(store: KeaStore): string[] {
  const migrated: string[] = [];
  for (const rawKey of store.allRawKeys()) {
    const mapping = LEGACY_KEY_MAPPINGS.find((m) => rawKey.startsWith(m.from));
    if (!mapping) continue;

    const raw = store.readRaw(rawKey);
    if (raw === null) continue;

    const logicalKey = mapping.to + rawKey.slice(mapping.from.length);

    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      store.removeRaw(rawKey);
      continue;
    }

    if (store.readRaw(KEA_NAMESPACE + logicalKey) !== null) {
      // Already migrated (or a newer session exists); drop the stale copy.
      store.removeRaw(rawKey);
      continue;
    }

    const persisted = store.writeRaw(
      KEA_NAMESPACE + logicalKey,
      JSON.stringify({ v: mapping.version, data })
    );
    if (persisted) store.removeRaw(rawKey);
    migrated.push(logicalKey);
  }
  return migrated;
}
