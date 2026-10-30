import { PASSCODE_HEADER } from "../../src/lib/ai/config";
import type { Env } from "./env";

/** Origins allowed to call the Worker from a browser. */
export function allowedOrigins(env: Env): string[] {
  if (env.ALLOWED_ORIGINS?.trim()) {
    return env.ALLOWED_ORIGINS.split(",")
      .map((origin) => origin.trim().replace(/\/+$/, ""))
      .filter(Boolean);
  }
  try {
    return [new URL(env.SITE_ORIGIN).origin];
  } catch {
    return [];
  }
}

/**
 * `null` origin header (curl, scripts) is allowed: those requests still need
 * the passcode. A browser request from any other origin is rejected.
 */
export function isOriginAllowed(origin: string | null, env: Env): boolean {
  if (origin === null) return true;
  return allowedOrigins(env).includes(origin);
}

export function corsHeaders(origin: string | null): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = `Content-Type, ${PASSCODE_HEADER}`;
    headers["Access-Control-Expose-Headers"] = "X-RateLimit-Limit, X-RateLimit-Remaining, Retry-After";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}
