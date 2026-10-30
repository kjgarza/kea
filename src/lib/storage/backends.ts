import type { StorageBackend } from "./types";

/** Plain Map-backed storage. Used when localStorage is unavailable and in tests. */
export function createMemoryBackend(
  initial: Record<string, string> = {}
): StorageBackend {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key)! : null),
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
    keys: () => [...map.keys()],
  };
}

/** Adapt a Web Storage object (localStorage) to a StorageBackend. */
export function fromWebStorage(storage: Storage): StorageBackend {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    keys: () => {
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key !== null) keys.push(key);
      }
      return keys;
    },
  };
}

/**
 * Return a backend over `window.localStorage`, or null when it cannot even be
 * read (SSR, disabled cookies, sandboxed iframes). Merely touching
 * `window.localStorage` can throw, so everything is guarded. Storage that is
 * readable but rejects writes (full quota, old Safari private mode) is still
 * returned: the store keeps failed writes in memory instead.
 */
export function getBrowserBackend(): StorageBackend | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = window.localStorage;
    if (!storage) return null;
    storage.getItem("kea.__probe__");
    return fromWebStorage(storage);
  } catch {
    return null;
  }
}
