/**
 * Browser client for the Kea AI Worker.
 *
 * AI features are hidden unless `NEXT_PUBLIC_KEA_API_URL` is set at build
 * time. Requests carry the passcode from `kea.passcode` and only the fields of
 * the typed request (ids and player input): never the solution.
 */
import type {
  ApiErrorBody,
  ApiErrorCode,
  ApiRequestMap,
  ApiResponseMap,
  KeeperAskRequest,
  KeeperAskResponse,
  PostRoute,
  StatusResponse,
} from "./api";
import { API_ROUTES } from "./api";
import { PASSCODE_HEADER } from "./config";
import { getPasscode } from "./passcode";

/** The Worker base URL, without a trailing slash, or null when AI is off. */
export function getKeaApiUrl(): string | null {
  // Must be a literal `process.env.NEXT_PUBLIC_*` access so Next inlines it.
  const raw = process.env.NEXT_PUBLIC_KEA_API_URL;
  const trimmed = raw?.trim().replace(/\/+$/, "");
  return trimmed ? trimmed : null;
}

/** True when the build has a Worker URL; gate every AI feature on this. */
export function isAiConfigured(): boolean {
  return getKeaApiUrl() !== null;
}

export type ClientErrorCode = ApiErrorCode | "not_configured" | "missing_passcode" | "network";

export class KeaApiError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = "KeaApiError";
  }
}

export interface ClientOptions {
  /** Defaults to `NEXT_PUBLIC_KEA_API_URL`. */
  baseUrl?: string | null;
  /** Defaults to the stored passcode. */
  passcode?: string | null;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
  signal?: AbortSignal;
}

function resolve(options: ClientOptions) {
  const baseUrl = options.baseUrl === undefined ? getKeaApiUrl() : options.baseUrl;
  if (!baseUrl) throw new KeaApiError("not_configured", "The AI Worker URL is not configured");
  const passcode = options.passcode === undefined ? getPasscode() : options.passcode;
  if (!passcode) throw new KeaApiError("missing_passcode", "Enter the passcode in settings");
  const doFetch = options.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init));
  return { baseUrl: baseUrl.replace(/\/+$/, ""), passcode, doFetch };
}

async function toError(response: Response): Promise<KeaApiError> {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.error?.code) return new KeaApiError(body.error.code, body.error.message, response.status);
  } catch {
    /* not JSON */
  }
  return new KeaApiError("internal", `Worker answered HTTP ${response.status}`, response.status);
}

async function request<T>(
  method: "GET" | "POST",
  path: string,
  body: unknown,
  options: ClientOptions
): Promise<T> {
  const { baseUrl, passcode, doFetch } = resolve(options);
  let response: Response;
  try {
    response = await doFetch(`${baseUrl}${path}`, {
      method,
      headers: {
        [PASSCODE_HEADER]: passcode,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new KeaApiError("network", `Could not reach the AI Worker: ${String(error)}`);
  }
  if (!response.ok) throw await toError(response);
  return (await response.json()) as T;
}

/** POST a typed request to a Worker route. */
export function postToWorker<R extends PostRoute>(
  route: R,
  body: ApiRequestMap[R],
  options: ClientOptions = {}
): Promise<ApiResponseMap[R]> {
  return request<ApiResponseMap[R]>("POST", route, body, options);
}

/**
 * Ask the AI keeper a question. The body is rebuilt from the typed fields so
 * nothing else on the caller's object (e.g. a whole card) can leak through.
 */
export function askKeeper(req: KeeperAskRequest, options: ClientOptions = {}): Promise<KeeperAskResponse> {
  const body: KeeperAskRequest = {
    deckId: req.deckId,
    cardId: req.cardId,
    lang: req.lang,
    transcript: req.transcript.map(({ q, a }) => ({ q, a })),
    question: req.question,
  };
  return postToWorker(API_ROUTES.keeperAsk, body, options);
}

/** Check the passcode and read today's remaining quota. */
export function getWorkerStatus(options: ClientOptions = {}): Promise<StatusResponse> {
  return request<StatusResponse>("GET", API_ROUTES.status, undefined, options);
}
