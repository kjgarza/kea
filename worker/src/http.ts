import type { ApiErrorBody, ApiErrorCode } from "../../src/lib/ai/api";
import { JSON_BODY_MAX_BYTES } from "../../src/lib/ai/config";

export function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  const h = new Headers(headers);
  h.set("content-type", "application/json; charset=utf-8");
  h.set("cache-control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function errorResponse(
  status: number,
  code: ApiErrorCode,
  message: string,
  headers: HeadersInit = {}
): Response {
  const body: ApiErrorBody = { error: { code, message } };
  return json(body, status, headers);
}

/** Copy a response, adding headers (Responses from fetch are immutable). */
export function withHeaders(response: Response, headers: Record<string, string>): Response {
  const copy = new Response(response.body, response);
  for (const [key, value] of Object.entries(headers)) copy.headers.set(key, value);
  return copy;
}

/**
 * Read a JSON request body, rejecting anything over `maxChars` with 413
 * before it is parsed: first by `content-length`, then by the actual text
 * length (the header can be absent or wrong).
 */
export async function readJsonBody(
  request: Request,
  maxChars: number = JSON_BODY_MAX_BYTES
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const tooLarge = () => ({
    ok: false as const,
    response: errorResponse(413, "payload_too_large", `Request is larger than ${Math.round(maxChars / 1024)} KiB`),
  });
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxChars) return tooLarge();
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, response: errorResponse(400, "bad_request", "Could not read the body") };
  }
  if (text.length > maxChars) return tooLarge();
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, response: errorResponse(400, "bad_request", "Body must be JSON") };
  }
}
