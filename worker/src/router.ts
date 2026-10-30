/**
 * Request pipeline: CORS/origin check -> route -> passcode -> daily limit ->
 * handler. Dependencies are injected so tests can mock fetch and the model.
 */
import { API_ROUTES } from "../../src/lib/ai/api";
import { PASSCODE_HEADER } from "../../src/lib/ai/config";
import type { LlmProvider } from "../../src/lib/ai/provider";
import { createProvider, isProviderName } from "../../src/lib/ai/provider";
import type { StatusResponse } from "../../src/lib/ai/api";
import { configuredPasscodes, isPasscodeValid, passcodeId } from "./auth";
import { corsHeaders, isOriginAllowed } from "./cors";
import type { DeckLoader } from "./decks";
import type { Env } from "./env";
import { errorResponse, json, withHeaders } from "./http";
import { handleKeeperAsk } from "./keeper";
import type { RateLimiter, RateLimitResult } from "./rate-limit";
import { stubKeeperRespond } from "./stub-keeper";

export interface WorkerDeps {
  decks: DeckLoader;
  rateLimiter: RateLimiter;
  /** Builds the model provider; defaults to one chosen from env. */
  provider?: (env: Env) => LlmProvider;
  now?: () => Date;
}

export interface HandlerContext {
  request: Request;
  env: Env;
  decks: DeckLoader;
  provider: () => LlmProvider;
  /**
   * Count this request toward the passcode's daily limit. Call it after the
   * request is validated and right before the model call; a returned
   * Response (429) must be sent as-is.
   */
  meter: () => Promise<Response | null>;
}

type Handler = (ctx: HandlerContext) => Promise<Response>;

interface Route {
  method: "GET" | "POST";
  /** Counts toward the daily limit. */
  metered: boolean;
  handler?: Handler; // undefined = not implemented yet
}

const notImplemented: Route = { method: "POST", metered: false };

const ROUTES: Record<string, Route> = {
  [API_ROUTES.keeperAsk]: { method: "POST", metered: true, handler: handleKeeperAsk },
  [API_ROUTES.keeperGrade]: notImplemented, // #32
  [API_ROUTES.caseAsk]: notImplemented, // #37
  [API_ROUTES.caseJudge]: notImplemented, // #37
  [API_ROUTES.authorPhoto]: notImplemented, // #38
  [API_ROUTES.status]: { method: "GET", metered: false },
};

/** Provider from env: KEEPER_PROVIDER (default anthropic) + KEEPER_MODEL. */
export function providerFromEnv(env: Env): LlmProvider {
  const name = env.KEEPER_PROVIDER?.trim() || "anthropic";
  if (!isProviderName(name)) throw new Error(`Unknown KEEPER_PROVIDER "${name}"`);
  return createProvider({
    provider: name,
    model: env.KEEPER_MODEL?.trim() || undefined,
    apiKey: name === "openai" ? env.OPENAI_API_KEY : env.ANTHROPIC_API_KEY,
    respond: stubKeeperRespond,
  });
}

function rateHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {};
  if (result.limit !== null) headers["X-RateLimit-Limit"] = String(result.limit);
  if (result.remaining !== null) headers["X-RateLimit-Remaining"] = String(result.remaining);
  return headers;
}

export async function handleRequest(request: Request, env: Env, deps: WorkerDeps): Promise<Response> {
  const origin = request.headers.get("Origin");
  if (!isOriginAllowed(origin, env)) {
    return errorResponse(403, "forbidden_origin", "Origin not allowed", { Vary: "Origin" });
  }
  const cors = corsHeaders(origin);
  const respond = (response: Response) => withHeaders(response, cors);

  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

  const path = new URL(request.url).pathname.replace(/\/+$/, "") || "/";
  if (path === "/" && request.method === "GET") {
    return respond(json({ name: "kea-worker", ok: true }));
  }
  const route = ROUTES[path];
  if (!route) return respond(errorResponse(404, "not_found", `No route ${path}`));
  if (request.method !== route.method) {
    return respond(
      errorResponse(405, "method_not_allowed", `Use ${route.method}`, { Allow: `${route.method}, OPTIONS` })
    );
  }

  if (configuredPasscodes(env).length === 0) {
    return respond(errorResponse(500, "misconfigured", "KEA_PASSCODES is not set"));
  }
  const passcode = request.headers.get(PASSCODE_HEADER);
  if (!(await isPasscodeValid(passcode, env))) {
    return respond(errorResponse(401, "unauthorized", "Missing or wrong passcode"));
  }
  const id = await passcodeId(passcode!);
  const now = deps.now?.() ?? new Date();

  if (path === API_ROUTES.status) {
    const state = await deps.rateLimiter.peek(id, now);
    const body: StatusResponse = { ok: true, remaining: state.remaining, limit: state.limit };
    return respond(json(body, 200, rateHeaders(state)));
  }

  if (!route.handler) {
    return respond(errorResponse(501, "not_implemented", `${path} is not implemented yet`));
  }

  let limitHeaders: Record<string, string> = {};
  const meter = async (): Promise<Response | null> => {
    if (!route.metered) return null;
    const state = await deps.rateLimiter.consume(id, now);
    limitHeaders = rateHeaders(state);
    if (state.allowed) return null;
    return errorResponse(429, "rate_limited", "Daily limit reached for this passcode", {
      ...limitHeaders,
      "Retry-After": String(state.retryAfter),
    });
  };

  const makeProvider = deps.provider ?? providerFromEnv;
  let provider: LlmProvider | undefined;
  const ctx: HandlerContext = {
    request,
    env,
    decks: deps.decks,
    provider: () => (provider ??= makeProvider(env)),
    meter,
  };
  try {
    const response = await route.handler(ctx);
    return withHeaders(response, { ...cors, ...limitHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const misconfigured = /API_KEY is not set|Unknown KEEPER_PROVIDER/.test(message);
    console.error("worker error", message);
    return respond(
      misconfigured
        ? errorResponse(500, "misconfigured", message)
        : errorResponse(500, "internal", "Unexpected error")
    );
  }
}
