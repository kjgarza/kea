/**
 * POST /author/photo (photo quick-add, spec F22, #38).
 *
 * Body: JSON `{ images: [{mediaType, data(base64)}], lang, pack? }` (1–2
 * images, ≤ PHOTO_LIMITS.maxImageBytes each). Returns a one-puzzle pack as
 * YAML in the import format plus any validator errors.
 *
 * Privacy: the images exist only in this request's memory. They are passed to
 * the model provider and dropped; nothing is written to KV, R2 or the cache,
 * and no log line includes image data or the transcribed text.
 */
import type { AuthorPhotoResponse } from "../../src/lib/ai/api";
import { PHOTO_LIMITS } from "../../src/lib/ai/config";
import { transcribePuzzlePhoto, validateAuthorPhotoRequest } from "../../src/lib/ai/photo";
import { errorResponse, json } from "./http";
import type { HandlerContext } from "./router";

const TOO_LARGE = `Request is larger than ${Math.round(PHOTO_LIMITS.maxBodyBytes / (1024 * 1024))} MB`;

export async function handleAuthorPhoto(ctx: HandlerContext): Promise<Response> {
  const declared = Number(ctx.request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > PHOTO_LIMITS.maxBodyBytes) {
    return errorResponse(413, "payload_too_large", TOO_LARGE);
  }
  let text: string;
  try {
    text = await ctx.request.text();
  } catch {
    return errorResponse(400, "bad_request", "Could not read the body");
  }
  if (text.length > PHOTO_LIMITS.maxBodyBytes) return errorResponse(413, "payload_too_large", TOO_LARGE);
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return errorResponse(400, "bad_request", "Body must be JSON");
  }
  const parsed = validateAuthorPhotoRequest(body);
  if (!parsed.ok) {
    return errorResponse(parsed.status, parsed.status === 413 ? "payload_too_large" : "bad_request", parsed.error);
  }

  // Build the provider first: a misconfigured Worker must not burn quota.
  const provider = ctx.provider();
  const limited = await ctx.meter();
  if (limited) return limited;

  let result;
  try {
    result = await transcribePuzzlePhoto(provider, parsed.value);
  } catch (error) {
    // Provider errors carry the HTTP status and the provider's message only.
    console.error("photo upstream error", error instanceof Error ? error.message : "unknown");
    return errorResponse(502, "upstream_error", "The photo reader is unavailable. Try again.");
  }
  if (result.fallback === "unreadable") {
    return errorResponse(422, "unreadable_image", "No readable puzzle card in the photos. Try a sharper, closer photo.");
  }
  if (result.fallback || !result.response) {
    console.warn("photo fallback", result.fallback);
    return errorResponse(502, "upstream_error", "The photo could not be read. Try again.");
  }
  const response: AuthorPhotoResponse = {
    yaml: result.response.yaml,
    fileName: result.response.fileName,
    errors: result.response.errors,
  };
  return json(response);
}
