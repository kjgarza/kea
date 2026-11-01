/**
 * Links that put a puzzle pack into the repo through the GitHub web UI
 * (photo quick-add, #38). Pure; no network.
 *
 * - New file: `https://github.com/<owner>/<repo>/new/<branch>?filename=<path>&value=<yaml>`
 *   opens the "create file" page with the path and contents prefilled.
 * - Existing file: GitHub cannot prefill an edit, so we link to
 *   `/edit/<branch>/<path>` and the author pastes the puzzle at the end.
 *
 * Long URLs fail (GitHub and browsers reject very long query strings), so
 * `newFileUrl` returns null above GITHUB_URL_MAX_LENGTH and the page falls
 * back to copy-to-clipboard.
 */

export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
}

export const DEFAULT_REPO: RepoConfig = { owner: "kjgarza", repo: "kea", branch: "main" };

/** Conservative URL budget (GitHub starts failing around 8 KB). */
export const GITHUB_URL_MAX_LENGTH = 7500;

const SEGMENT = /^[A-Za-z0-9_.-]+$/;

/**
 * Repo from `NEXT_PUBLIC_KEA_REPO` ("owner/name") and
 * `NEXT_PUBLIC_KEA_REPO_BRANCH`, defaulting to kjgarza/kea on main.
 */
export function parseRepoConfig(repo?: string | null, branch?: string | null): RepoConfig {
  const [owner, name, ...rest] = (repo ?? "").trim().split("/");
  const ok = rest.length === 0 && owner && name && SEGMENT.test(owner) && SEGMENT.test(name);
  const b = (branch ?? "").trim();
  return {
    owner: ok ? owner : DEFAULT_REPO.owner,
    repo: ok ? name : DEFAULT_REPO.repo,
    branch: b && /^[A-Za-z0-9_./-]+$/.test(b) && !b.includes("..") ? b : DEFAULT_REPO.branch,
  };
}

export function getRepoConfig(): RepoConfig {
  // Literal process.env accesses so Next inlines them at build time.
  return parseRepoConfig(process.env.NEXT_PUBLIC_KEA_REPO, process.env.NEXT_PUBLIC_KEA_REPO_BRANCH);
}

function base({ owner, repo }: RepoConfig): string {
  return `https://github.com/${owner}/${repo}`;
}

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

/** "Create new file" URL with the YAML prefilled, or null when it would be too long. */
export function newFileUrl(repo: RepoConfig, path: string, value: string): string | null {
  const url =
    `${base(repo)}/new/${encodePath(repo.branch)}` +
    `?filename=${encodeURIComponent(path)}&value=${encodeURIComponent(value)}`;
  return url.length <= GITHUB_URL_MAX_LENGTH ? url : null;
}

/** "Create new file" URL with only the path (contents pasted from the clipboard). */
export function emptyNewFileUrl(repo: RepoConfig, path: string): string {
  return `${base(repo)}/new/${encodePath(repo.branch)}?filename=${encodeURIComponent(path)}`;
}

/** Edit page of an existing file. */
export function editFileUrl(repo: RepoConfig, path: string): string {
  return `${base(repo)}/edit/${encodePath(repo.branch)}/${encodePath(path)}`;
}
