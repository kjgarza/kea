import { describe, expect, test } from "bun:test";
import { inlineText, isSafeHref, parseInline, parseMarkdown } from "./parse";

describe("parseInline", () => {
  test("strong, em, code, strike and line breaks", () => {
    expect(parseInline("At **15:00** *sharp* `x` ~~no~~")).toEqual([
      { type: "text", text: "At " },
      { type: "strong", children: [{ type: "text", text: "15:00" }] },
      { type: "text", text: " " },
      { type: "em", children: [{ type: "text", text: "sharp" }] },
      { type: "text", text: " " },
      { type: "code", text: "x" },
      { type: "text", text: " " },
      { type: "del", children: [{ type: "text", text: "no" }] },
    ]);
    expect(parseInline("a\nb")).toEqual([
      { type: "text", text: "a" },
      { type: "br" },
      { type: "text", text: "b" },
    ]);
  });

  test("unclosed markers, escapes and snake_case stay literal", () => {
    expect(inlineText(parseInline("2 * 3 = 6"))).toBe("2 * 3 = 6");
    expect(inlineText(parseInline("**open"))).toBe("**open");
    expect(inlineText(parseInline("\\*not em\\*"))).toBe("*not em*");
    expect(parseInline("file_name_here")).toEqual([{ type: "text", text: "file_name_here" }]);
  });

  test("links: only http(s)/mailto become links", () => {
    expect(parseInline("[site](https://example.com)")).toEqual([
      { type: "link", href: "https://example.com", children: [{ type: "text", text: "site" }] },
    ]);
    expect(parseInline("[bad](javascript:alert(1))")[0]).toEqual({ type: "text", text: "bad" });
    expect(isSafeHref("JAVASCRIPT:x")).toBe(false);
    expect(isSafeHref("mailto:a@b.c")).toBe(true);
  });

  test("raw HTML is plain text", () => {
    expect(parseInline("<script>alert(1)</script>")).toEqual([
      { type: "text", text: "<script>alert(1)</script>" },
    ]);
  });
});

describe("parseMarkdown", () => {
  test("paragraphs, headings, lists, quotes, rules and code", () => {
    const blocks = parseMarkdown(
      "# Title\n\nFirst line\nsecond line\n\n- one\n- two\n\n3. three\n4. four\n\n> quoted\n\n---\n\n```\n**raw**\n```"
    );
    expect(blocks.map((b) => b.type)).toEqual([
      "heading",
      "paragraph",
      "list",
      "list",
      "blockquote",
      "hr",
      "code",
    ]);
    const ol = blocks[3];
    expect(ol.type === "list" && ol.ordered && ol.start).toBe(3);
    expect(blocks[6]).toEqual({ type: "code", text: "**raw**" });
  });

  test("GFM tables (the phone log fixture)", () => {
    const [table] = parseMarkdown(
      "| Time | Number | Duration |\n|---|:---:|---:|\n| 14:52 | Mum | 3 min |\n| 16:05 | Silverline \\| Co | 6 min |"
    );
    expect(table.type).toBe("table");
    if (table.type !== "table") return;
    expect(table.align).toEqual([null, "center", "right"]);
    expect(table.header.map(inlineText)).toEqual(["Time", "Number", "Duration"]);
    expect(table.rows.map((r) => r.map(inlineText))).toEqual([
      ["14:52", "Mum", "3 min"],
      ["16:05", "Silverline | Co", "6 min"],
    ]);
  });

  test("CRLF and blank input", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("a\r\n\r\nb").length).toBe(2);
  });
});
