import {
  getLicense,
  requiredShareAlikeLicense,
  stackExchangeLicense,
  stackExchangeLicenseByDate,
} from "./licenses";
import { commercialSourceFlags, type RawAuthor, type RawPuzzleItem } from "./raw-sources";

/**
 * Stack Exchange importer (#58): `lateral-thinking` questions with accepted
 * answers, fetched through the public API (api.stackexchange.com/2.3, no key
 * needed at low volume) rather than the data dump, whose 2024 terms conflict
 * with CC BY-SA. Pure apart from the injected `fetch` and `sleep`.
 *
 * Licence per post: the API's `content_license` when present, else the
 * cut-over dates (`stackExchangeLicenseByDate`). A card that combines a
 * question and an answer is an adaptation of both, so it takes the latest
 * CC BY-SA version of the two and must credit both authors.
 */

export const STACK_EXCHANGE_API = "https://api.stackexchange.com/2.3";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface StackExchangeOwner {
  display_name?: string;
  link?: string;
  user_id?: number;
  user_type?: string;
}

export interface StackExchangeQuestion {
  question_id: number;
  title: string;
  body?: string;
  link: string;
  score: number;
  tags: string[];
  creation_date: number; // unix seconds
  accepted_answer_id?: number;
  content_license?: string;
  owner?: StackExchangeOwner;
}

export interface StackExchangeAnswer {
  answer_id: number;
  question_id: number;
  body?: string;
  score: number;
  is_accepted: boolean;
  creation_date: number;
  content_license?: string;
  owner?: StackExchangeOwner;
}

export interface StackExchangePage<T> {
  items: T[];
  has_more?: boolean;
  backoff?: number;
  quota_remaining?: number;
  error_id?: number;
  error_message?: string;
}

export interface FetchStackExchangeOptions {
  fetch: FetchLike;
  site?: string; // default "puzzling"
  tag?: string; // default "lateral-thinking"
  minScore?: number; // default 5
  max?: number; // default 50
  pageSize?: number; // default 50 (API max 100)
  maxPages?: number; // default 10
  sleep?: (ms: number) => Promise<void>;
  apiBase?: string;
}

export interface FetchStackExchangeResult {
  items: RawPuzzleItem[];
  skipped: { questionId: number; reason: string }[];
}

// ---------------------------------------------------------------------------
// HTML → plain text

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
};

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? match;
  });
}

/**
 * Stack Exchange post HTML as plain text: paragraphs and list items on their
 * own lines, spoilers and quotes unwrapped, tags removed, entities decoded.
 */
export function htmlToText(html: string): string {
  const text = html
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n- ")
    .replace(/<\/li>/gi, "")
    .replace(/<\/(p|div|blockquote|ul|ol|pre|h[1-6])>/gi, "\n\n")
    .replace(/<hr\s*\/?>/gi, "\n\n")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(text)
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------------------------------------------------------------------------
// Licences and credits

/** Licence id of one post. */
export function postLicense(post: { content_license?: string; creation_date: number }): string {
  return (
    stackExchangeLicense(post.content_license) ??
    stackExchangeLicenseByDate(new Date(post.creation_date * 1000))
  );
}

/** "A (question), B (answer)", or just "A" when one person wrote both. */
export function creditLine(authors: readonly RawAuthor[]): string {
  const names = [...new Set(authors.map((a) => a.name))];
  if (names.length === 1) return names[0];
  return authors.map((a) => `${a.name} (${a.role})`).join(", ");
}

function author(role: RawAuthor["role"], owner: StackExchangeOwner | undefined, license: string): RawAuthor | null {
  const name = owner?.display_name ? decodeEntities(owner.display_name).trim() : "";
  if (!name) return null;
  return { role, name, ...(owner?.link ? { url: owner.link } : {}), license };
}

/**
 * One raw item from a question and its accepted answer, or a reason to skip
 * it. Pure; used by `fetchStackExchangeItems` and the tests.
 */
export function toRawPuzzleItem(
  site: string,
  question: StackExchangeQuestion,
  answer: StackExchangeAnswer | undefined
): RawPuzzleItem | { skip: string } {
  if (!question.accepted_answer_id) return { skip: "no accepted answer" };
  if (!answer || answer.answer_id !== question.accepted_answer_id) {
    return { skip: "accepted answer not returned by the API" };
  }
  if (!question.body || !answer.body) return { skip: "post body missing (use filter=withbody)" };

  const qLicense = postLicense(question);
  const aLicense = postLicense(answer);
  const qAuthor = author("question", question.owner, qLicense);
  const aAuthor = author("answer", answer.owner, aLicense);
  if (!qAuthor || !aAuthor) return { skip: "an author is missing, so the post cannot be credited" };
  const license = requiredShareAlikeLicense([qLicense, aLicense]);
  if (!license || !getLicense(license)) return { skip: `unrecognised licence ${qLicense} / ${aLicense}` };

  const title = decodeEntities(question.title).trim();
  const setup = htmlToText(question.body);
  const solution = htmlToText(answer.body);
  const authors = [qAuthor, aAuthor];
  return {
    kind: "puzzle",
    source: "stackexchange",
    id: `${site}-${question.question_id}`,
    site,
    questionId: question.question_id,
    answerId: answer.answer_id,
    title,
    setup,
    solution,
    url: question.link,
    answerUrl: `${question.link.replace(/#.*$/, "")}#${answer.answer_id}`,
    authors,
    license,
    credit: creditLine(authors),
    score: question.score,
    created: new Date(question.creation_date * 1000).toISOString(),
    tags: [...question.tags].sort(),
    flags: commercialSourceFlags(title, setup, solution),
  };
}

async function getJson<T>(
  fetch: FetchLike,
  url: string,
  sleep: (ms: number) => Promise<void>
): Promise<StackExchangePage<T>> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  const body = (await res.json().catch(() => null)) as StackExchangePage<T> | null;
  if (!res.ok || !body || body.error_id) {
    throw new Error(
      `Stack Exchange API ${res.status}: ${body?.error_message ?? "unreadable response"} (${url})`
    );
  }
  // The API asks clients to wait `backoff` seconds before the next request.
  if (body.backoff) await sleep(body.backoff * 1000);
  return body;
}

/**
 * Fetch questions tagged `tag` (sorted by votes, at least `minScore`), then
 * their accepted answers, and turn each pair into a raw item. Results are
 * sorted by question id so the output does not depend on API ordering.
 */
export async function fetchStackExchangeItems(
  opts: FetchStackExchangeOptions
): Promise<FetchStackExchangeResult> {
  const site = opts.site ?? "puzzling";
  const tag = opts.tag ?? "lateral-thinking";
  const minScore = opts.minScore ?? 5;
  const max = opts.max ?? 50;
  const pageSize = Math.min(opts.pageSize ?? 50, 100);
  const maxPages = opts.maxPages ?? 10;
  const api = opts.apiBase ?? STACK_EXCHANGE_API;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));

  const questions: StackExchangeQuestion[] = [];
  const skipped: FetchStackExchangeResult["skipped"] = [];
  for (let page = 1; page <= maxPages && questions.length < max; page++) {
    const params = new URLSearchParams({
      site,
      tagged: tag,
      sort: "votes",
      order: "desc",
      min: String(minScore),
      filter: "withbody",
      pagesize: String(pageSize),
      page: String(page),
    });
    const res = await getJson<StackExchangeQuestion>(opts.fetch, `${api}/questions?${params}`, sleep);
    for (const q of res.items) {
      if (q.score < minScore) {
        skipped.push({ questionId: q.question_id, reason: `score ${q.score} is below ${minScore}` });
      } else if (!q.accepted_answer_id) {
        skipped.push({ questionId: q.question_id, reason: "no accepted answer" });
      } else if (questions.length < max) {
        questions.push(q);
      }
    }
    if (!res.has_more) break;
  }

  const answers = new Map<number, StackExchangeAnswer>();
  const ids = questions.map((q) => q.accepted_answer_id!);
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const params = new URLSearchParams({ site, filter: "withbody", pagesize: "100" });
    const res = await getJson<StackExchangeAnswer>(
      opts.fetch,
      `${api}/answers/${chunk.join(";")}?${params}`,
      sleep
    );
    for (const a of res.items) answers.set(a.answer_id, a);
  }

  const items: RawPuzzleItem[] = [];
  for (const q of questions) {
    const item = toRawPuzzleItem(site, q, answers.get(q.accepted_answer_id!));
    if ("skip" in item) skipped.push({ questionId: q.question_id, reason: item.skip });
    else items.push(item);
  }
  items.sort((a, b) => a.questionId - b.questionId);
  skipped.sort((a, b) => a.questionId - b.questionId);
  return { items, skipped };
}
