import { test, expect, type Page, type Route } from '@playwright/test';
import kitchenDeck from '../public/decks/kitchen-table-en-situation.json';

/**
 * Theory grading (#32, F10) in the AI and solo panels on a 375px phone, with
 * the Worker mocked via `page.route`. Needs NEXT_PUBLIC_KEA_API_URL (e.g.
 * https://kea-worker.test) exported for BOTH the dev server and Playwright,
 * like tests/ai-keeper.spec.ts; otherwise these tests are skipped.
 */

test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

const API_URL = process.env.NEXT_PUBLIC_KEA_API_URL?.replace(/\/$/, '');
const AI_PLAY = process.env.NEXT_PUBLIC_KEA_AI_PLAY === '1';
const DECK_ID = 'kitchen-table-en-situation';
const CARD = kitchenDeck.cards.find((c) => c.cardId === 'wet-letter')!;
const FACT_IDS = CARD.keyFacts.map((f) => f.id);
const CORS = { 'access-control-allow-origin': '*' };

async function seedPasscode(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('kea.passcode', JSON.stringify({ v: 1, data: 'open-sesame' }));
  });
}

async function startPuzzle(page: Page, mode: 'ai' | 'solo') {
  await page.goto(`/play/${DECK_ID}`);
  await page.getByRole('button', { name: /start game|empezar partida/i }).click();
  await expect(page.getByTestId('situation-picker')).toBeVisible();
  await page.getByTestId(`mode-${mode}`).click();
  await page.getByTestId(`situation-pick-${CARD.cardId}`).click();
  await expect(page.getByTestId('situation-ai-keeper')).toBeVisible();
}

type GradeReply = { correctFactIds: string[]; missingCount: number; verdict: string } | { status: number; code: string };

/** Mock /keeper/grade with a queue of replies; records request bodies. */
async function mockGrade(page: Page, replies: GradeReply[]) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(`${API_URL}/keeper/grade`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          ...CORS,
          'access-control-allow-headers': 'content-type, x-kea-passcode',
          'access-control-allow-methods': 'POST, OPTIONS',
        },
      });
      return;
    }
    bodies.push(route.request().postDataJSON());
    const reply = replies.shift() ?? { correctFactIds: [], missingCount: FACT_IDS.length, verdict: 'not_yet' };
    if ('status' in reply) {
      await route.fulfill({ status: reply.status, json: { error: { code: reply.code, message: 'mock' } }, headers: CORS });
    } else {
      await route.fulfill({ json: reply, headers: CORS });
    }
  });
  return bodies;
}

async function submitTheory(page: Page, text: string) {
  await page.getByTestId('theory-open').click();
  await page.getByTestId('theory-input').fill(text);
  await page.getByTestId('theory-submit').click();
}

test.describe('theory grading with a mocked Worker (375px)', () => {
  test.skip(!API_URL || !AI_PLAY, 'needs NEXT_PUBLIC_KEA_API_URL and NEXT_PUBLIC_KEA_AI_PLAY=1');

  test('solved theory ends the puzzle and records a solved play', async ({ page }) => {
    await seedPasscode(page);
    const bodies = await mockGrade(page, [{ correctFactIds: FACT_IDS, missingCount: 0, verdict: 'solved' }]);
    await startPuzzle(page, 'ai');

    const theory = 'Her nephew wrote it with magic ink that only shows when wet, to say he is visiting.';
    await submitTheory(page, theory);

    await expect(page.getByTestId('situation-end')).toBeVisible();
    await expect(page.getByTestId('situation-end-solution')).toContainText(CARD.solution.slice(0, 30));
    expect(bodies).toEqual([{ deckId: DECK_ID, cardId: CARD.cardId, lang: 'en', theory }]);
    const history = await page.evaluate(() => localStorage.getItem('kea.history'));
    expect(JSON.parse(history!).data[0]).toMatchObject({ cardId: CARD.cardId, mode: 'ai', outcome: 'solved' });
    const session = await page.evaluate((id) => localStorage.getItem(`kea.session.${id}`), DECK_ID);
    expect(JSON.parse(session!).data.puzzle.theories).toMatchObject([{ text: theory, verdict: 'solved' }]);
  });

  test('partial theory shows matched facts and a missing count, never the missing facts; survives reload', async ({ page }) => {
    await seedPasscode(page);
    const [matched, ...missing] = CARD.keyFacts;
    await mockGrade(page, [
      // A misbehaving Worker that also sends a missing id must still not reveal it.
      { correctFactIds: [matched.id, 'not-a-fact'], missingCount: 2, verdict: 'not_yet' },
      { correctFactIds: [matched.id, missing[0].id], missingCount: 1, verdict: 'close' },
    ]);
    await startPuzzle(page, 'solo');

    await submitTheory(page, 'The ink was invisible until it got wet.');
    const result = page.getByTestId('theory-result');
    await expect(result).toHaveAttribute('data-verdict', 'not_yet');
    await expect(page.getByTestId('theory-verdict')).toHaveText('Not yet');
    await expect(page.getByTestId('theory-matched-fact')).toHaveText([matched.text]);
    await expect(page.getByTestId('theory-missing')).toHaveText('2 key facts are still missing.');
    await expect(page.getByTestId('keeper-progress')).toHaveAttribute('data-found', '1');

    const html = await page.content();
    for (const fact of missing) {
      expect(html).not.toContain(fact.text);
      expect(html).not.toContain(fact.id);
    }
    expect(html).not.toContain(CARD.solution.slice(0, 40));
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);

    await page.reload();
    await expect(page.getByTestId('situation-ai-keeper')).toBeVisible();
    await expect(page.getByTestId('theory-result')).toHaveAttribute('data-verdict', 'not_yet');
    await expect(page.getByTestId('theory-matched-fact')).toHaveText([matched.text]);
    expect(await page.content()).not.toContain(missing[1].text);

    // A second, closer theory; the first moves to the history list.
    await submitTheory(page, 'A child in her family wrote it in magic ink.');
    await expect(page.getByTestId('theory-result')).toHaveAttribute('data-verdict', 'close');
    await expect(page.getByTestId('theory-result').getByTestId('theory-missing')).toHaveText('1 key fact is still missing.');
    await expect(page.getByTestId('theory-history-entry')).toHaveCount(1);
    await expect(page.getByTestId('situation-ai-keeper')).toBeVisible();
    expect(await page.content()).not.toContain(missing[1].text);

    await page.reload();
    await expect(page.getByTestId('theory-result')).toHaveAttribute('data-verdict', 'close');
    await expect(page.getByTestId('theory-history-entry')).toHaveCount(1);
  });

  test('a grading error keeps the theory text; retry grades it', async ({ page }) => {
    await seedPasscode(page);
    await mockGrade(page, [
      { status: 502, code: 'upstream_error' },
      { correctFactIds: [], missingCount: 3, verdict: 'not_yet' },
    ]);
    await startPuzzle(page, 'ai');

    await submitTheory(page, 'It was a love letter.');
    await expect(page.getByTestId('theory-error')).toContainText("Couldn't check the theory");
    await expect(page.getByTestId('theory-input')).toHaveValue('It was a love letter.');
    await page.getByTestId('theory-retry').click();
    await expect(page.getByTestId('theory-result')).toHaveAttribute('data-verdict', 'not_yet');
    await expect(page.getByTestId('theory-missing')).toHaveText('3 key facts are still missing.');
    await expect(page.getByTestId('theory-matched-fact')).toHaveCount(0);
  });
});
