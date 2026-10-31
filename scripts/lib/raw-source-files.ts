import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { parseRawItem, serializeRawItem, type RawSourceItem } from "./raw-sources";
import type { FetchLike } from "./stackexchange";

/**
 * File-system side of the source importers (#58). Raw items are written as
 * `<dir>/<id>.json`; an unchanged file is not rewritten, so re-running an
 * importer leaves the tree as it was.
 */

export interface WriteRawResult {
  written: string[];
  unchanged: string[];
}

export async function writeRawItems(
  items: readonly RawSourceItem[],
  dir: string,
  { dryRun = false }: { dryRun?: boolean } = {}
): Promise<WriteRawResult> {
  const result: WriteRawResult = { written: [], unchanged: [] };
  if (!dryRun) await mkdir(dir, { recursive: true });
  for (const item of items) {
    const file = path.join(dir, `${item.id}.json`);
    const text = serializeRawItem(item);
    const existing = await Bun.file(file).text().catch(() => null);
    if (existing === text) {
      result.unchanged.push(file);
      continue;
    }
    if (!dryRun) await Bun.write(file, text);
    result.written.push(file);
  }
  return result;
}

/** Read raw items from files and/or directories (every *.json inside), sorted by path. */
export async function readRawItems(paths: readonly string[]): Promise<RawSourceItem[]> {
  const files: string[] = [];
  for (const p of paths) {
    const entries = await readdir(p).catch(() => null);
    if (entries) {
      files.push(...entries.filter((e) => e.endsWith(".json")).sort().map((e) => path.join(p, e)));
    } else {
      files.push(p);
    }
  }
  const items: RawSourceItem[] = [];
  for (const file of files) items.push(parseRawItem(await Bun.file(file).json(), file));
  return items;
}

/**
 * A `fetch` that serves recorded Stack Exchange API responses: `questions`
 * for `/questions` and `answers` for `/answers/...` (offline runs and tests).
 */
export function createRecordedStackExchangeFetch(recorded: {
  questions: unknown;
  answers: unknown;
}): FetchLike {
  return async (input: string) => {
    const { pathname } = new URL(input);
    const body = pathname.includes("/answers/") ? recorded.answers : pathname.endsWith("/questions") ? recorded.questions : null;
    if (!body) return new Response(JSON.stringify({ error_id: 404, error_message: "not recorded" }), { status: 404 });
    return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  };
}
