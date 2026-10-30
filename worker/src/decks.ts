/**
 * Loads published decks from `${SITE_ORIGIN}/decks/<deckId>.json`.
 *
 * Two cache layers: a per-isolate in-memory map (fastest, lost when the
 * isolate recycles) and the Workers Cache API (per data centre) when
 * available. Concurrent loads of the same deck share one fetch.
 */
import type { Deck } from "../../src/types/deck";
import type { FetchLike } from "../../src/lib/ai/provider";

export const DEFAULT_DECK_TTL_SECONDS = 600;

export class DeckLoadError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "DeckLoadError";
  }
}

export interface DeckLoaderOptions {
  siteOrigin: string;
  fetch: FetchLike;
  ttlSeconds?: number;
  /** Workers Cache API (`caches.default`); omitted in tests. */
  edgeCache?: Cache | null;
  now?: () => number;
}

interface MemoryEntry {
  deck: Deck;
  expiresAt: number;
}

export function deckUrl(siteOrigin: string, deckId: string): string {
  return `${siteOrigin.replace(/\/+$/, "")}/decks/${encodeURIComponent(deckId)}.json`;
}

function isDeck(value: unknown, deckId: string): value is Deck {
  if (!value || typeof value !== "object") return false;
  const deck = value as Partial<Deck>;
  return deck.deckId === deckId && Array.isArray(deck.cards);
}

export class DeckLoader {
  private memory = new Map<string, MemoryEntry>();
  private inflight = new Map<string, Promise<Deck>>();
  private ttl: number;
  private now: () => number;

  constructor(private options: DeckLoaderOptions) {
    this.ttl = options.ttlSeconds ?? DEFAULT_DECK_TTL_SECONDS;
    this.now = options.now ?? (() => Date.now());
  }

  async load(deckId: string): Promise<Deck> {
    const cached = this.memory.get(deckId);
    if (cached && cached.expiresAt > this.now()) return cached.deck;

    const pending = this.inflight.get(deckId);
    if (pending) return pending;

    const promise = this.fetchDeck(deckId)
      .then((deck) => {
        this.memory.set(deckId, { deck, expiresAt: this.now() + this.ttl * 1000 });
        return deck;
      })
      .finally(() => this.inflight.delete(deckId));
    this.inflight.set(deckId, promise);
    return promise;
  }

  private async fetchDeck(deckId: string): Promise<Deck> {
    const url = deckUrl(this.options.siteOrigin, deckId);
    const cache = this.options.edgeCache ?? null;

    let response: Response | undefined;
    if (cache) {
      try {
        response = (await cache.match(url)) ?? undefined;
      } catch {
        response = undefined;
      }
    }
    const fromEdge = Boolean(response);
    if (!response) {
      try {
        response = await this.options.fetch(url, { headers: { accept: "application/json" } });
      } catch (error) {
        throw new DeckLoadError(`Could not fetch deck ${deckId}: ${String(error)}`, 502);
      }
    }
    if (response.status === 404) throw new DeckLoadError(`Deck ${deckId} not found`, 404);
    if (!response.ok) throw new DeckLoadError(`Deck ${deckId}: HTTP ${response.status}`, 502);

    const text = await response.text();
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new DeckLoadError(`Deck ${deckId} is not valid JSON`, 502);
    }
    if (!isDeck(data, deckId)) throw new DeckLoadError(`Deck ${deckId} has an unexpected shape`, 502);

    if (cache && !fromEdge) {
      try {
        await cache.put(
          url,
          new Response(text, {
            headers: {
              "content-type": "application/json",
              "cache-control": `public, max-age=${this.ttl}`,
            },
          })
        );
      } catch (error) {
        console.warn("deck edge-cache put failed", String(error));
      }
    }
    return data;
  }

  /** For tests. */
  clear(): void {
    this.memory.clear();
    this.inflight.clear();
  }
}
