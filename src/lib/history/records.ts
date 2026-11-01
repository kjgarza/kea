import type { PlayOutcome, PlayRecord } from "./types";

/**
 * Pure helpers over PlayRecord lists.
 */

/** Puzzle family key: EN/ES variants of a deck share card ids (decision 7). */
export function deckFamily(deckId: string): string {
  return deckId.replace(/-(en|es)-(situation|case)$/, "-$2");
}

/** Identity used to dedupe records (same puzzle, group and start time). */
export function recordKey(r: PlayRecord): string {
  return [r.deckId, r.cardId, r.group, r.startedAt].join("|");
}

/** Append `record` unless an identical one (same key) is already there. */
export function addRecord(records: PlayRecord[], record: PlayRecord): PlayRecord[] {
  const key = recordKey(record);
  if (records.some((r) => recordKey(r) === key)) return records;
  return [...records, record];
}

/** Union of two record lists, deduped and sorted by end time (oldest first). */
export function mergeRecords(a: PlayRecord[], b: PlayRecord[]): PlayRecord[] {
  const byKey = new Map<string, PlayRecord>();
  for (const r of [...a, ...b]) {
    if (!byKey.has(recordKey(r))) byKey.set(recordKey(r), r);
  }
  return [...byKey.values()].sort((x, y) => x.endedAt.localeCompare(y.endedAt));
}

/**
 * Card ids of `deckId` (or its other-language twin) that `groupId` has
 * finished.
 */
export function playedCardIds(
  records: PlayRecord[],
  deckId: string,
  groupId: string
): Set<string> {
  const family = deckFamily(deckId);
  const played = new Set<string>();
  for (const r of records) {
    if (r.group === groupId && deckFamily(r.deckId) === family) played.add(r.cardId);
  }
  return played;
}

const OUTCOMES: readonly PlayOutcome[] = ["solved", "gave_up", "partial"];

export function isPlayRecord(value: unknown): value is PlayRecord {
  if (typeof value !== "object" || value === null) return false;
  const r = value as Record<string, unknown>;
  return (
    typeof r.deckId === "string" &&
    typeof r.cardId === "string" &&
    typeof r.group === "string" &&
    typeof r.mode === "string" &&
    (r.language === "en" || r.language === "es") &&
    typeof r.startedAt === "string" &&
    typeof r.endedAt === "string" &&
    typeof r.questions === "number" &&
    typeof r.hintsUsed === "number" &&
    OUTCOMES.includes(r.outcome as PlayOutcome)
  );
}

export function isPlayRecordList(value: unknown): value is PlayRecord[] {
  return Array.isArray(value) && value.every(isPlayRecord);
}

/** Newest first, for display. */
export function newestFirst(records: PlayRecord[]): PlayRecord[] {
  return [...records].sort((a, b) => b.endedAt.localeCompare(a.endedAt));
}
