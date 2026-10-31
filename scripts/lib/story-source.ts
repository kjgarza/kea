import { getLicense, isHttpUrl, LICENSE_IDS } from "./licenses";
import { slugify } from "./puzzle-pack";
import { commercialSourceFlags, type RawStoryItem } from "./raw-sources";

/**
 * Public-domain / openly licensed story importer (#58). Turns a plain-text
 * story (e.g. a Project Gutenberg or Standard Ebooks text) into a raw story
 * item for `scripts/normalize-sources.ts`. Pure; the CLI is
 * `scripts/import-story.ts`.
 *
 * Project Gutenberg's header and footer (licence boilerplate and the
 * trademark) are stripped: the trademark may not travel with redistributed
 * text, and the story itself is what we adapt.
 */

export const STORY_LIMITS = {
  /** Longer texts must be split into one story per file. */
  maxChars: 60_000,
  minChars: 200,
} as const;

export interface StoryImportOptions {
  url: string;
  author: string;
  license: string;
  title?: string; // default: the first non-empty line
  language?: string; // default "en"
  id?: string; // default: slug of the title
}

/** Remove a Project Gutenberg header/footer, if present. */
export function stripGutenbergBoilerplate(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const start = normalized.match(/^\*{3}\s*START OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*{3}\s*$/im);
  const end = normalized.match(/^\*{3}\s*END OF (THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*{3}\s*$/im);
  let body = normalized;
  if (end?.index !== undefined) body = body.slice(0, end.index);
  if (start?.index !== undefined) body = body.slice(start.index + start[0].length);
  return body;
}

/** Tidy whitespace: unwrap nothing, but trim lines and collapse blank runs. */
export function tidyStoryText(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Build a raw story item, or the list of problems. */
export function storyToRawItem(
  text: string,
  opts: StoryImportOptions
): { item: RawStoryItem | null; errors: string[] } {
  const errors: string[] = [];
  const body = tidyStoryText(stripGutenbergBoilerplate(text));
  const license = getLicense(opts.license);
  if (!license) {
    errors.push(`--license "${opts.license}" is not allowed; use one of ${LICENSE_IDS.join(", ")}`);
  }
  if (!isHttpUrl(opts.url)) errors.push(`--url must be an http(s) URL`);
  if (!opts.author?.trim()) errors.push(`--author is required`);
  if (body.length < STORY_LIMITS.minChars) {
    errors.push(`the story is ${body.length} characters; at least ${STORY_LIMITS.minChars} are needed`);
  }
  if (body.length > STORY_LIMITS.maxChars) {
    errors.push(
      `the story is ${body.length} characters; split it into stories of at most ${STORY_LIMITS.maxChars}`
    );
  }
  const title = (opts.title ?? body.split("\n").find((l) => l.trim()) ?? "").trim();
  if (!title) errors.push(`--title is required (the text has no first line to use)`);
  const id = opts.id ?? slugify(title);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) errors.push(`--id must be a lower-case slug`);
  const language = opts.language ?? "en";
  if (!/^[a-z]{2}(-[A-Za-z]{2})?$/.test(language)) errors.push(`--lang must be a language code`);
  if (errors.length > 0) return { item: null, errors };

  return {
    item: {
      kind: "story",
      source: "story",
      id,
      title,
      author: opts.author.trim(),
      url: opts.url,
      license: license!.id,
      language,
      text: body,
      flags: commercialSourceFlags(title),
    },
    errors: [],
  };
}
