import { describe, expect, test } from "bun:test";
import { parseConfig } from "../lib/config-loader";
import { buildPrompt } from "./index";
import { buildCasePrompt } from "./case";

function promptFor(yaml = "") {
  const config = parseConfig(`name: Test\ngameType: case\n${yaml}`);
  return buildCasePrompt({ config, context: "" });
}

describe("buildCasePrompt", () => {
  test("is the prompt builder for the case game type", () => {
    const config = parseConfig("name: Test\ngameType: case\n");
    expect(buildPrompt("case", { config, context: "" })).toEqual(
      buildCasePrompt({ config, context: "" })
    );
  });

  test("asks for every CaseCard field and the generation limits", () => {
    const { systemPrompt, userPrompt } = promptFor("cardCount: 2\n");
    for (const field of [
      "title", "briefing", "evidence", "questions", "walkthrough", "contentWarnings",
      "estMinutes", "unlockAfter", "acceptedVariants", "points",
    ]) {
      expect(systemPrompt).toContain(`"${field}"`);
    }
    expect(systemPrompt).toContain("8–15 items");
    expect(systemPrompt).toContain("3–5 questions");
    expect(systemPrompt).toContain("FAIR PLAY");
    expect(userPrompt).toContain("Generate 2 unique case files");
  });

  test("generated cases are text-only", () => {
    const { systemPrompt } = promptFor();
    expect(systemPrompt).toContain("TEXT ONLY");
    expect(systemPrompt).toContain('"kind": "document" | "interview" | "phone_log"');
    expect(systemPrompt).toContain('NO "src" field');
  });

  test("the walkthrough cites evidence ids in backticks", () => {
    expect(promptFor().systemPrompt).toContain("its id in backticks");
  });

  test("the context is passed through", () => {
    const config = parseConfig("name: Test\ngameType: case\n");
    expect(buildCasePrompt({ config, context: "A seaside town" }).userPrompt).toContain(
      "A seaside town"
    );
  });
});
