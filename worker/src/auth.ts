import type { Env } from "./env";

export function configuredPasscodes(env: Env): string[] {
  return (env.KEA_PASSCODES ?? "")
    .split(/[\n,]/)
    .map((code) => code.trim())
    .filter(Boolean);
}

async function sha256(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return new Uint8Array(digest);
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Constant-time check of a supplied passcode against the configured list. */
export async function isPasscodeValid(supplied: string | null, env: Env): Promise<boolean> {
  if (!supplied) return false;
  const suppliedHash = await sha256(supplied.trim());
  let match = false;
  for (const code of configuredPasscodes(env)) {
    if (equalBytes(suppliedHash, await sha256(code))) match = true;
  }
  return match;
}

/** Short, non-reversible id for a passcode (rate-limit keys, logs). */
export async function passcodeId(passcode: string): Promise<string> {
  const bytes = await sha256(`kea-rl:${passcode.trim()}`);
  return Array.from(bytes.slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}
