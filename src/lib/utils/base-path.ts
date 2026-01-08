/**
 * Get the base path for the application.
 * This is needed for GitHub Pages deployment where the app is served from a subdirectory.
 */
export function getBasePath(): string {
  if (typeof window !== "undefined") {
    // Client-side: use the base path from the document
    const base = document.querySelector("base")?.href;
    if (base) {
      const url = new URL(base);
      return url.pathname.replace(/\/$/, "");
    }
  }

  // Fallback to environment variable or empty string
  const isProd = process.env.NODE_ENV === "production";
  const repoName = process.env.NEXT_PUBLIC_REPO_NAME || "cards-game";
  return isProd ? `/${repoName}` : "";
}

/**
 * Prepend the base path to a URL.
 * Use this for all fetch calls and asset URLs.
 */
export function withBasePath(path: string): string {
  const basePath = getBasePath();
  // Avoid double slashes
  if (path.startsWith("/")) {
    return `${basePath}${path}`;
  }
  return `${basePath}/${path}`;
}
