import { CASE_GENERATION_LIMITS } from "../lib/case-generation";
import type { PromptContext } from "./base";
import { buildSystemPromptHeader } from "./base";

/**
 * Prompt for generated case files (issue #36, spec F18). Generated cases are
 * text-only (document, interview, phone_log): generation cannot create
 * images, maps or PDFs. `finalizeCaseCards` (scripts/lib/case-generation.ts)
 * enforces the limits below after the shared validator.
 */
export function buildCasePrompt(ctx: PromptContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const { minEvidence, maxEvidence, minQuestions, maxQuestions, minUnlockChains } =
    CASE_GENERATION_LIMITS;

  const systemPrompt = `${buildSystemPromptHeader(ctx)}

GAME: CASE FILES (cooperative detective case)
A group passes one phone around. They read a briefing, open evidence items one by one,
take notes together and finally answer the case questions in one joint accusation.
Afterwards they read a walkthrough that explains the solution.

Card format (one card = one whole case):
{
  "cards": [
    {
      "title": "string — short, intriguing, does not give the answer away",
      "briefing": "markdown — 2–4 short paragraphs: what happened, who is involved, what the players must find out",
      "evidence": [
        {
          "id": "kebab-case-id",
          "title": "string, e.g. \\"Interview: Ana Ruiz (neighbour)\\"",
          "kind": "document" | "interview" | "phone_log",
          "content": "markdown",
          "unlockAfter": ["ids of evidence that must be opened first"]
        }
      ],
      "questions": [
        {
          "id": "kebab-case-id",
          "prompt": "string",
          "answer": "string — the full answer",
          "acceptedVariants": ["short alternative answers players might type"],
          "points": 1 | 2 | 3
        }
      ],
      "walkthrough": "markdown — the deduction step by step, citing evidence ids in backticks",
      "contentWarnings": ["lower-case tags, e.g. theft, fraud, kidnapping"],
      "estMinutes": number
    }
  ]
}

Requirements:
- evidence: ${minEvidence}–${maxEvidence} items. TEXT ONLY: kind must be "document", "interview" or
  "phone_log", every item has "content", and there is NO "src" field. Do not describe
  photos, maps or recordings as if they were attached; if a picture matters, write it as a
  document (e.g. "Police photographer's notes").
- Markdown in content: **bold**, lists and pipe tables are fine. Interviews alternate
  "**Q:**" and "**Name:**" lines. Phone logs are tables with time, number, direction and duration.
- unlockAfter: at least ${minUnlockChains} items are locked behind other items (the chain should
  make sense: a call in a phone log unlocks the booking it led to; an interview mentions a
  receipt, which unlocks the receipt). Several items must be open from the start, every
  id in unlockAfter exists, and there are no cycles.
- questions: ${minQuestions}–${maxQuestions} questions, usually who / when / how / where / why. Answers are
  specific and checkable (a name, a time, a place). acceptedVariants lists 3–7 short forms a
  player might type ("Ana", "Ana Ruiz", "the neighbour"); never a vague word that would also
  fit a wrong answer.
- FAIR PLAY (most important):
  * Every answer is deducible from the evidence alone, with no outside knowledge, guessing,
    or wordplay.
  * The culprit appears in the evidence before the end, and at least one red herring
    suspect is cleared by a specific piece of evidence.
  * No evidence item contradicts another by mistake; times, names and places are consistent
    everywhere (check every timestamp).
  * The decisive clue is not hidden only in the walkthrough.
- walkthrough: explain the deduction in order, citing the evidence that proves each step by
  its id in backticks, e.g. "the booking (\`courier-booking\`) was made at 21:51". Cite only
  ids that exist. Every question's answer must be explained.
- contentWarnings: list sensitive themes (theft, fraud, violence, death, ...). [] when none.
  Keep violence off-stage.
- estMinutes: realistic playing time (usually 20–45).
- Original cases only; do not retell published mysteries. Each case uses a different crime
  and setting.`;

  const userPrompt = `Generate ${ctx.config.cardCount} unique case files.
${ctx.context ? `Context/Theme:\n${ctx.context}\n` : ""}
Output valid JSON with a "cards" array of objects with the fields title, briefing,
evidence, questions, walkthrough, contentWarnings and estMinutes.
Shape example (shortened — a real case needs ${minEvidence}–${maxEvidence} evidence items):
{ "cards": [{
  "title": "The Missing Chess Trophy",
  "briefing": "The school chess club's trophy has vanished from its locked display case...",
  "evidence": [
    { "id": "head-note", "title": "Head teacher's note", "kind": "document", "content": "Case locked at **15:00**, found open at **17:00**..." },
    { "id": "phone-lena", "title": "Lena Brandt's call log", "kind": "phone_log", "content": "| Time | Number | Duration |\\n|---|---|---|\\n| 16:05 | Silverline Engraving | 6 min |" },
    { "id": "engraver-receipt", "title": "Receipt from Silverline Engraving", "kind": "document", "content": "16:40 — 1 cup trophy, engrave \\"Champions 2026\\", ready Monday.", "unlockAfter": ["phone-lena"] }
  ],
  "questions": [
    { "id": "who", "prompt": "Who took the trophy?", "answer": "Coach Lena Brandt", "acceptedVariants": ["Lena Brandt", "Lena", "the coach"], "points": 2 },
    { "id": "where", "prompt": "Where is the trophy now?", "answer": "At Silverline Engraving", "acceptedVariants": ["Silverline Engraving", "the engraver"], "points": 1 }
  ],
  "walkthrough": "Lena called the engraver at 16:05 (\`phone-lena\`) and the receipt (\`engraver-receipt\`) shows ...",
  "contentWarnings": ["theft"],
  "estMinutes": 25
}] }`;

  return { systemPrompt, userPrompt };
}
