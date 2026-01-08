import type { PromptContext } from "./base";
import { buildSystemPromptHeader } from "./base";

export function buildTriviaPrompt(ctx: PromptContext): {
  systemPrompt: string;
  userPrompt: string;
} {
  const format = ctx.config.triviaFormat ?? "mixed";

  const formatInstructions = getFormatInstructions(format);

  const systemPrompt = `${buildSystemPromptHeader(ctx)}

GAME: TRIVIA
Players answer questions to test their knowledge.

${formatInstructions}

Requirements:
- Questions must be factually accurate
- Answers must be unambiguous
- For MCQ: exactly 4 choices, only one correct
- For MCQ: distractors should be plausible but clearly wrong
- No trick questions
- Vary question topics and difficulty within the set`;

  const userPrompt = `Generate ${ctx.config.cardCount} unique trivia questions.

${ctx.context ? `Context/Theme:\n${ctx.context}` : ""}

Output valid JSON with a "cards" array.
${getExampleOutput(format)}`;

  return { systemPrompt, userPrompt };
}

function getFormatInstructions(
  format: "mcq" | "open" | "mixed"
): string {
  if (format === "mcq") {
    return `
Format: MULTIPLE CHOICE ONLY
Card format:
{
  "cards": [
    {
      "format": "mcq",
      "question": "string",
      "choices": ["A", "B", "C", "D"],
      "answerIndex": 0-3,
      "answerText": "string (matching the correct choice)"
    }
  ]
}`;
  }

  if (format === "open") {
    return `
Format: OPEN-ENDED ONLY
Card format:
{
  "cards": [
    {
      "format": "open",
      "question": "string",
      "answerText": "string (short, unambiguous answer)"
    }
  ]
}`;
  }

  // mixed
  return `
Format: MIX of multiple choice and open-ended (roughly 60% MCQ, 40% open)
Card formats:
{
  "cards": [
    {
      "format": "mcq",
      "question": "string",
      "choices": ["A", "B", "C", "D"],
      "answerIndex": 0-3,
      "answerText": "string"
    },
    {
      "format": "open",
      "question": "string",
      "answerText": "string"
    }
  ]
}`;
}

function getExampleOutput(format: "mcq" | "open" | "mixed"): string {
  if (format === "mcq") {
    return `Example:
{
  "cards": [
    {
      "format": "mcq",
      "question": "Which planet is closest to the Sun?",
      "choices": ["Venus", "Mercury", "Mars", "Earth"],
      "answerIndex": 1,
      "answerText": "Mercury"
    }
  ]
}`;
  }

  if (format === "open") {
    return `Example:
{
  "cards": [
    {
      "format": "open",
      "question": "What is the capital of France?",
      "answerText": "Paris"
    }
  ]
}`;
  }

  return `Include both MCQ and open-ended questions in your response.`;
}
