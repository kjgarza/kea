# Kea AI Worker

A small Cloudflare Worker that holds the model API key and serves Kea's AI
features (spec §6 of epic #20). Kea itself stays a static site; with no Worker
URL configured, the AI features are hidden.

Prompts, schemas and request/response types live in `../src/lib/ai/` (a pure
module with no Next/Bun/Node APIs) and are shared with the scripts, so the eval
harness and the solvability check test the same keeper players use.

## API

All endpoints take and return JSON. Requests need the passcode header
`X-Kea-Passcode`. Browser requests must come from an allowed origin (CORS).
Errors are `{ "error": { "code", "message" } }`.

| Method | Path | Body | Response | Status |
|---|---|---|---|---|
| POST | `/keeper/ask` | `{ deckId, cardId, lang: "en"\|"es", transcript: [{ q, a }], question }` | `{ answer: "yes"\|"no"\|"irrelevant"\|"partly"\|"rephrase", factIds: string[], confidence: 0..1 }` | implemented (#29) |
| POST | `/keeper/grade` | `{ deckId, cardId, lang, theory }` (theory ≤ 1200 chars) | `{ correctFactIds: string[], missingCount: number, verdict: "solved"\|"close"\|"not_yet" }` | implemented (#32) |
| POST | `/case/ask` | `{ deckId, cardId, lang, openedEvidenceIds, question }` | `{ answer, citedEvidenceIds, inEvidence }` | #37: uses only opened, unlocked evidence; 502 on bad model output |
| POST | `/case/judge` | `{ deckId, cardId, lang, answers }` | `{ results: [{ questionId, correct }] }` | #37: only submitted questions; blank/exact/variant decided locally; 502 on bad model output |
| POST | `/author/photo` | `{ images: [{ mediaType, data }], lang }` | `{ yaml }` | 501 until #38 |
| GET | `/status` | none | `{ ok, remaining, limit }` (does not use quota) | implemented |

Status codes: 400 `bad_request`, 401 `unauthorized` (missing or wrong
passcode), 403 `forbidden_origin`, 404 `not_found` (route, deck or card), 405,
429 `rate_limited` (with `Retry-After` in seconds until UTC midnight), 500
`misconfigured`, 501 `not_implemented`, 502 `deck_unavailable` /
`upstream_error`. Metered responses carry `X-RateLimit-Limit` and
`X-RateLimit-Remaining`.

The client sends ids and player input only. The Worker loads the card
(solution, key facts) from `${SITE_ORIGIN}/decks/<deckId>.json` and drops any
other field in the body.

## Behaviour

- **Keeper**: structured output constrained to the five answers and the card's
  fact ids. Output is validated again: anything outside the vocabulary becomes
  `rephrase`, unknown fact ids are dropped, confidence is clamped to 0..1. A
  model refusal or malformed output also returns `rephrase`; an upstream HTTP
  error returns 502.
- **Grader**: the model only lists which key facts the theory states
  correctly (structured output constrained to the card's fact ids). The
  verdict is computed from that coverage, not by the model (see
  `GRADE_THRESHOLDS` in `src/lib/ai/grade.ts`): `solved` = every key fact,
  `close` = at least half of them (rounded up) but not all, `not_yet` = fewer.
  The response is rebuilt from known correct ids plus a count, so missing
  fact ids or texts are never returned. A refusal or malformed output returns
  502 `upstream_error` (retryable) instead of a verdict.
- **Decks** are cached in memory per isolate and in the Workers Cache API per
  data centre for `DECK_CACHE_TTL` seconds (default 600). After publishing a
  deck change, answers can use the old deck for up to that long.
- **Passcodes**: `KEA_PASSCODES` secret, comma- or newline-separated. Compared
  in constant time. If it is unset every request gets 500 `misconfigured`.
- **CORS**: browser requests are allowed only from `ALLOWED_ORIGINS`
  (default: the origin of `SITE_ORIGIN`). Requests without an `Origin` header
  (curl, scripts) are allowed but still need the passcode.
- **Daily limit**: `DAILY_LIMIT` requests per passcode per UTC day (default
  200, `0` = off). Only requests that reach the model count. Stored in the
  `RATE_LIMIT` KV namespace when bound; KV is eventually consistent, so the
  limit is approximate. Without KV it falls back to a per-isolate in-memory
  counter (resets when the isolate is recycled). If KV fails, requests are
  allowed and the error is logged.

## Setup

1. Install: `cd worker && bun install` (or `bun run worker:install` from the root).
2. Log in: `bunx wrangler login` (or export `CLOUDFLARE_API_TOKEN`).
3. Secrets:
   ```bash
   bunx wrangler secret put KEA_PASSCODES       # e.g. "berlin-crew,family"
   bunx wrangler secret put ANTHROPIC_API_KEY
   ```
4. Daily-limit storage (recommended):
   ```bash
   bunx wrangler kv namespace create RATE_LIMIT
   ```
   Paste the id into the commented `[[kv_namespaces]]` block in
   `wrangler.toml` and uncomment it.
5. Check `[vars]` in `wrangler.toml`: `SITE_ORIGIN` must be the deployed site
   including its base path (`https://kjgarza.github.io/kea`).
6. Deploy: `bunx wrangler deploy`, or push to `main` / run the **Deploy AI
   Worker** workflow (needs repo secrets `CLOUDFLARE_API_TOKEN` and
   `CLOUDFLARE_ACCOUNT_ID`; optional repo variable `KEA_SITE_ORIGIN` overrides
   `SITE_ORIGIN`).
7. Point the site at it: set the repo variable `NEXT_PUBLIC_KEA_API_URL` to the
   Worker URL (e.g. `https://kea-worker.<account>.workers.dev`) and redeploy
   Pages. Players then enter the passcode in the settings sheet (gear icon).

Smoke test after deploying:

```bash
curl -s -X POST "$KEA_API_URL/keeper/ask" \
  -H "X-Kea-Passcode: $PASSCODE" -H "content-type: application/json" \
  -d '{"deckId":"classic-en-situation","cardId":"cl-001","lang":"en","transcript":[],"question":"Did he work in a lighthouse?"}'
# expected: "answer":"yes" (cl-001 is the lighthouse-keeper puzzle)
```

## Configuration

| Name | Kind | Default | Notes |
|---|---|---|---|
| `SITE_ORIGIN` | var | `https://kjgarza.github.io/kea` | Decks at `${SITE_ORIGIN}/decks/<id>.json` |
| `ALLOWED_ORIGINS` | var | origin of `SITE_ORIGIN` | Comma-separated |
| `DAILY_LIMIT` | var | `200` | Per passcode per UTC day; `0` = off |
| `KEEPER_PROVIDER` | var | `anthropic` | `anthropic`, `openai` or `stub` |
| `KEEPER_MODEL` | var | `DEFAULT_ANTHROPIC_MODEL` in `src/lib/ai/config.ts` | |
| `DECK_CACHE_TTL` | var | `600` | Seconds |
| `KEA_PASSCODES` | secret | required | |
| `ANTHROPIC_API_KEY` | secret | required for `anthropic` | |
| `OPENAI_API_KEY` | secret | required for `openai` | |
| `RATE_LIMIT` | KV binding | optional | See above |

The Anthropic provider calls the Messages API with plain `fetch`
(`output_config.format` JSON schema, low effort) and opts into the server-side
refusal fallback (`fallbacks: "default"`); see `src/lib/ai/provider.ts`.

## Local development

```bash
cp .dev.vars.example .dev.vars   # stub provider, passcode "local-dev"
bun run dev:local                 # wrangler dev --local on :8787
```

`KEEPER_PROVIDER=stub` is an offline keyword matcher (no API key, not a real
keeper) for clicking through the UI. Point `SITE_ORIGIN` at something that
serves `public/decks/` (the Next dev server at `http://localhost:3000/kea`, or
`python3 -m http.server 8788` inside `public/`). To use a real model locally,
set `KEEPER_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` in `.dev.vars`.

Run the app against it with
`NEXT_PUBLIC_KEA_API_URL=http://localhost:8787 bun run dev` (and add
`http://localhost:3000` to `ALLOWED_ORIGINS`).

## Checks

```bash
bun run typecheck   # worker sources (workers types) + tests (bun types)
bun test            # router, CORS, passcode, rate limit, deck cache, keeper validation
```

From the repo root: `bun run worker:typecheck`, `bun run worker:test`. The
root `tsconfig.json` excludes `worker/`, so the Next build is unaffected.
