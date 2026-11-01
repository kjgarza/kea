import type { ApiErrorBody, ApiErrorCode } from "../../src/lib/ai/api";

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
