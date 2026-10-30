/**
 * A small, safe Markdown parser for case briefings, evidence and walkthroughs.
 *
 * It produces a tiny AST that `<Markdown>` renders as React elements, so no
 * raw HTML ever reaches the DOM (`<script>` etc. come out as text). Supported:
 *
 * - Blocks: paragraphs, `#`–`######` headings, `-`/`*`/`+` and `1.` lists,
 *   `>` blockquotes, `---` rules, fenced code blocks and GFM pipe tables.
 * - Inline: `**strong**`/`__strong__`, `*em*`/`_em_`, `` `code` ``,
 *   `~~strike~~` and `[links](https://…)` (http, https and mailto only;
 *   other links render as their text).
 * - A single newline inside a paragraph is a line break (case files are
 *   often letters, logs and transcripts where lines matter).
 */

export type Inline =
  | { type: "text"; text: string }
  | { type: "strong"; children: Inline[] }
  | { type: "em"; children: Inline[] }
  | { type: "del"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "br" };

export type Block =
  | { type: "heading"; level: 1 | 2 | 3 | 4 | 5 | 6; children: Inline[] }
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; start: number; items: Inline[][] }
  | { type: "blockquote"; children: Block[] }
  | { type: "hr" }
  | { type: "code"; text: string }
  | {
      type: "table";
      align: ("left" | "center" | "right" | null)[];
      header: Inline[][];
      rows: Inline[][][];
    };

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const UL = /^\s{0,3}[-*+]\s+(.*)$/;
const OL = /^\s{0,3}(\d{1,9})[.)]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const FENCE = /^\s{0,3}(```|~~~)/;
const TABLE_DIVIDER = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Whether a link target may be rendered as a clickable link. */
export function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|mailto:)/i.test(href.trim());
}

function splitRow(line: string): string[] {
  let row = line.trim();
  if (row.startsWith("|")) row = row.slice(1);
  if (row.endsWith("|") && !row.endsWith("\\|")) row = row.slice(0, -1);
  const cells: string[] = [];
  let cell = "";
  for (let i = 0; i < row.length; i++) {
    if (row[i] === "\\" && row[i + 1] === "|") {
      cell += "|";
      i++;
    } else if (row[i] === "|") {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += row[i];
    }
  }
  cells.push(cell.trim());
  return cells;
}

function isBlockStart(line: string): boolean {
  return (
    HEADING.test(line) ||
    HR.test(line) ||
    UL.test(line) ||
    OL.test(line) ||
    QUOTE.test(line) ||
    FENCE.test(line)
  );
}

export function parseMarkdown(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(fence[1])) body.push(lines[i++]);
      i++; // closing fence (or end of input)
      blocks.push({ type: "code", text: body.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3 | 4 | 5 | 6,
        children: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    if (HR.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && lines[i].trim() && QUOTE.test(lines[i])) {
        body.push(lines[i].match(QUOTE)![1]);
        i++;
      }
      blocks.push({ type: "blockquote", children: parseMarkdown(body.join("\n")) });
      continue;
    }

    const ul = UL.test(line);
    const ol = line.match(OL);
    if (ul || ol) {
      const ordered = !ul;
      const pattern = ordered ? OL : UL;
      const items: string[] = [];
      while (i < lines.length && lines[i].trim()) {
        const m = lines[i].match(pattern);
        if (m) items.push(ordered ? m[2] : m[1]);
        else if (isBlockStart(lines[i])) break;
        else items[items.length - 1] += `\n${lines[i].trim()}`; // continuation line
        i++;
      }
      blocks.push({
        type: "list",
        ordered,
        start: ol ? Number(ol[1]) : 1,
        items: items.map((item) => parseInline(item)),
      });
      continue;
    }

    if (line.includes("|") && i + 1 < lines.length && TABLE_DIVIDER.test(lines[i + 1])) {
      const header = splitRow(line);
      const align = splitRow(lines[i + 1]).map((cell) => {
        const left = cell.startsWith(":");
        const right = cell.endsWith(":");
        return left && right ? "center" : right ? "right" : left ? "left" : null;
      });
      i += 2;
      const rows: Inline[][][] = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        const cells = splitRow(lines[i]);
        rows.push(header.map((_, c) => parseInline(cells[c] ?? "")));
        i++;
      }
      blocks.push({
        type: "table",
        align: header.map((_, c) => align[c] ?? null),
        header: header.map((cell) => parseInline(cell)),
        rows,
      });
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && (para.length === 0 || !isBlockStart(lines[i]))) {
      para.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: "paragraph", children: parseInline(para.join("\n")) });
  }

  return blocks;
}

/** Find the closing delimiter, skipping escaped characters. */
function findClosing(text: string, delim: string, from: number): number {
  for (let i = from; i <= text.length - delim.length; i++) {
    if (text[i] === "\\") {
      i++;
      continue;
    }
    if (text.startsWith(delim, i) && i > from) return i;
  }
  return -1;
}

const ESCAPABLE = new Set("\\`*_{}[]()#+-.!|~>".split(""));

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) out.push({ type: "text", text: buffer });
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    if (ch === "\\" && ESCAPABLE.has(text[i + 1] ?? "")) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    if (ch === "\n") {
      buffer = buffer.replace(/\s+$/, "");
      flush();
      out.push({ type: "br" });
      i++;
      continue;
    }

    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i) {
        flush();
        out.push({ type: "code", text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "[") {
      const close = findClosing(text, "]", i + 1);
      if (close > i && text[close + 1] === "(") {
        const end = text.indexOf(")", close + 2);
        if (end > close) {
          const label = parseInline(text.slice(i + 1, close));
          const href = text.slice(close + 2, end).trim();
          flush();
          if (isSafeHref(href)) out.push({ type: "link", href, children: label });
          else out.push(...label);
          i = end + 1;
          continue;
        }
      }
    }

    const two = text.slice(i, i + 2);
    if (two === "**" || two === "__" || two === "~~") {
      const end = findClosing(text, two, i + 2);
      if (end > i + 2) {
        flush();
        const children = parseInline(text.slice(i + 2, end));
        out.push(two === "~~" ? { type: "del", children } : { type: "strong", children });
        i = end + 2;
        continue;
      }
    }

    if ((ch === "*" || ch === "_") && text[i + 1] && !/\s/.test(text[i + 1])) {
      // `_` inside a word (snake_case) is literal.
      const intraword = ch === "_" && /[\p{L}\p{N}]/u.test(text[i - 1] ?? "");
      const end = intraword ? -1 : findClosing(text, ch, i + 1);
      if (end > i + 1 && !/\s/.test(text[end - 1])) {
        flush();
        out.push({ type: "em", children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    buffer += ch;
    i++;
  }
  flush();
  return out;
}

/** Plain text of some inline nodes (for titles, aria labels, tests). */
export function inlineText(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.type) {
        case "text":
        case "code":
          return n.text;
        case "br":
          return "\n";
        default:
          return inlineText(n.children);
      }
    })
    .join("");
}
