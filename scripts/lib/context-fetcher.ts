import { NodeHtmlMarkdown } from "node-html-markdown";
import type { DeckSourceConfig } from "./config-loader";

const htmlToMarkdown = new NodeHtmlMarkdown();

/**
 * Fetch URL and convert HTML to markdown
 */
async function fetchUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DeckGenerator/1.0)",
      },
    });

    if (!response.ok) {
      console.warn(`Failed to fetch ${url}: ${response.status}`);
      return "";
    }

    const contentType = response.headers.get("content-type") ?? "";
    const text = await response.text();

    // Convert HTML to markdown, or return as-is for plain text
    if (contentType.includes("text/html")) {
      return htmlToMarkdown.translate(text);
    }

    return text;
  } catch (error) {
    console.warn(`Error fetching ${url}:`, error);
    return "";
  }
}

/**
 * Fetch all URLs in parallel and combine content
 */
async function fetchAllUrls(urls: string[]): Promise<string> {
  const results = await Promise.all(urls.map(fetchUrl));
  return results.filter(Boolean).join("\n\n---\n\n");
}

/**
 * Build complete context from config
 * Combines markdown content + fetched URL content
 */
export async function buildContext(config: DeckSourceConfig): Promise<string> {
  const parts: string[] = [];

  // Add inline markdown if present
  if (config.context?.markdown) {
    parts.push(config.context.markdown);
  }

  // Fetch and add URL content in parallel
  if (config.context?.urls && config.context.urls.length > 0) {
    const urlContent = await fetchAllUrls(config.context.urls);
    if (urlContent) {
      parts.push("## Additional Context from URLs\n\n" + urlContent);
    }
  }

  return parts.join("\n\n");
}

/**
 * Truncate context to fit within token limits
 * Rough estimate: 1 token ≈ 4 characters
 */
export function truncateContext(
  context: string,
  maxTokens: number = 4000
): string {
  const maxChars = maxTokens * 4;

  if (context.length <= maxChars) {
    return context;
  }

  // Truncate and add indicator
  return context.slice(0, maxChars - 50) + "\n\n[... context truncated ...]";
}
