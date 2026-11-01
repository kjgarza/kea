"use client";

import { Fragment, useMemo } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/markdown/parse";

interface Props {
  source: string;
  className?: string;
  "data-testid"?: string;
}

/**
 * Renders a small, safe Markdown subset (see src/lib/markdown/parse.ts) as
 * React elements styled with @tailwindcss/typography. No raw HTML is ever
 * injected.
 */
export function Markdown({ source, className = "", "data-testid": testId }: Props) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div
      className={`prose prose-neutral max-w-none prose-p:my-2 prose-headings:font-display prose-table:my-2 prose-th:px-2 prose-td:px-2 ${className}`}
      data-testid={testId}
    >
      {blocks.map((block, i) => (
        <BlockView key={i} block={block} />
      ))}
    </div>
  );
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as const;
      return (
        <Tag>
          <Inlines nodes={block.children} />
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p>
          <Inlines nodes={block.children} />
        </p>
      );
    case "list": {
      const items = block.items.map((item, i) => (
        <li key={i}>
          <Inlines nodes={item} />
        </li>
      ));
      return block.ordered ? (
        <ol start={block.start === 1 ? undefined : block.start}>{items}</ol>
      ) : (
        <ul>{items}</ul>
      );
    }
    case "blockquote":
      return (
        <blockquote>
          {block.children.map((child, i) => (
            <BlockView key={i} block={child} />
          ))}
        </blockquote>
      );
    case "hr":
      return <hr />;
    case "code":
      return (
        <pre className="whitespace-pre-wrap">
          <code>{block.text}</code>
        </pre>
      );
    case "table":
      return (
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {block.header.map((cell, c) => (
                  <th key={c} style={block.align[c] ? { textAlign: block.align[c]! } : undefined}>
                    <Inlines nodes={cell} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      style={block.align[c] ? { textAlign: block.align[c]! } : undefined}
                    >
                      <Inlines nodes={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Inlines({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((node, i) => (
        <InlineView key={i} node={node} />
      ))}
    </>
  );
}

function InlineView({ node }: { node: Inline }) {
  switch (node.type) {
    case "text":
      return <Fragment>{node.text}</Fragment>;
    case "br":
      return <br />;
    case "code":
      return <code>{node.text}</code>;
    case "strong":
      return (
        <strong>
          <Inlines nodes={node.children} />
        </strong>
      );
    case "em":
      return (
        <em>
          <Inlines nodes={node.children} />
        </em>
      );
    case "del":
      return (
        <del>
          <Inlines nodes={node.children} />
        </del>
      );
    case "link":
      return (
        <a href={node.href} target="_blank" rel="noopener noreferrer nofollow">
          <Inlines nodes={node.children} />
        </a>
      );
  }
}
