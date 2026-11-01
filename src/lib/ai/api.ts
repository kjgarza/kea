/**
 * Request/response types for every Worker endpoint (spec §6.1).
 *
 * Pure module shared by the Worker and the client. The client sends ids and
 * player input only: no request type has a field for the solution, key facts,
 * hints or case answers. The Worker loads those from the published deck.
 */
import type { KeeperAnswer } from "./answers";

/** UI/session language the response is shown in. */
export type AiLanguage = "en" | "es";

export const AI_LANGUAGES: readonly AiLanguage[] = ["en", "es"];

/** Every route the Worker knows. Unimplemented ones answer 501 until their issue lands. */
export const API_ROUTES = {
  keeperAsk: "/keeper/ask", // #29
  keeperGrade: "/keeper/grade", // #32
  caseAsk: "/case/ask", // #37
  caseJudge: "/case/judge", // #37
  authorPhoto: "/author/photo", // #38
  status: "/status", // passcode check + remaining quota
} as const;

export type ApiRoute = (typeof API_ROUTES)[keyof typeof API_ROUTES];

// ---------------------------------------------------------------------------
// POST /keeper/ask
// ---------------------------------------------------------------------------

/** One earlier exchange, so repeated questions get the same answer. */
export interface KeeperTranscriptTurn {
  q: string;
  a: KeeperAnswer;
}

export interface KeeperAskRequest {
  deckId: string;
  cardId: string;
  lang: AiLanguage;
  transcript: KeeperTranscriptTurn[];
  question: string;
}

export interface KeeperAskResponse {
  answer: KeeperAnswer;
  /** Key-fact ids (from the card) this question touched or uncovered. */
  factIds: string[];
  /** 0..1, the model's own confidence. */
  confidence: number;
}

// ---------------------------------------------------------------------------
// POST /keeper/grade (#32)
// ---------------------------------------------------------------------------

export type TheoryVerdict = "solved" | "close" | "not_yet";

export interface KeeperGradeRequest {
  deckId: string;
  cardId: string;
  lang: AiLanguage;
  theory: string;
}

export interface KeeperGradeResponse {
  correctFactIds: string[];
  /** How many key facts the theory still misses (never which). */
  missingCount: number;
  verdict: TheoryVerdict;
}

// ---------------------------------------------------------------------------
// POST /case/ask (#37)
// ---------------------------------------------------------------------------

export interface CaseAskRequest {
  deckId: string;
  cardId: string;
  lang: AiLanguage;
  openedEvidenceIds: string[];
  question: string;
}

export interface CaseAskResponse {
  answer: string;
  citedEvidenceIds: string[];
}

// ---------------------------------------------------------------------------
// POST /case/judge (#37)
// ---------------------------------------------------------------------------

export interface CaseJudgeRequest {
  deckId: string;
  cardId: string;
  lang: AiLanguage;
  /** questionId -> the group's answer. */
  answers: Record<string, string>;
}

export interface CaseJudgeResponse {
  results: { questionId: string; correct: boolean }[];
}

// ---------------------------------------------------------------------------
// POST /author/photo (#38)
// ---------------------------------------------------------------------------

export interface AuthorPhotoImage {
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  /** Base64 data, no `data:` prefix. */
  data: string;
}

export interface AuthorPhotoRequest {
  images: AuthorPhotoImage[];
  lang: AiLanguage;
}

export interface AuthorPhotoResponse {
  yaml: string;
}

// ---------------------------------------------------------------------------
// GET /status
// ---------------------------------------------------------------------------

export interface StatusResponse {
  ok: true;
  /** Requests left today for this passcode; null when no limit applies. */
  remaining: number | null;
  limit: number | null;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type ApiErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden_origin"
  | "rate_limited"
  | "not_found"
  | "method_not_allowed"
  | "not_implemented"
  | "deck_unavailable"
  | "upstream_error"
  | "misconfigured"
  | "internal";

export interface ApiErrorBody {
  error: { code: ApiErrorCode; message: string };
}

/** Request body type per route, for the generic client. */
export interface ApiRequestMap {
  "/keeper/ask": KeeperAskRequest;
  "/keeper/grade": KeeperGradeRequest;
  "/case/ask": CaseAskRequest;
  "/case/judge": CaseJudgeRequest;
  "/author/photo": AuthorPhotoRequest;
}

export interface ApiResponseMap {
  "/keeper/ask": KeeperAskResponse;
  "/keeper/grade": KeeperGradeResponse;
  "/case/ask": CaseAskResponse;
  "/case/judge": CaseJudgeResponse;
  "/author/photo": AuthorPhotoResponse;
}

export type PostRoute = keyof ApiRequestMap;
