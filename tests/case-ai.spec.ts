import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * AI investigator and answer judge (#37) on the seed case (saltmarsh-bay-en-case),
 * 375px, with the Worker mocked via `page.route`. The AI-on tests need
 * NEXT_PUBLIC_KEA_API_URL=https://kea-worker.test exported for BOTH the dev
 * server and Playwright (see tests/ai-settings.spec.ts). Without it only the
 * no-Worker test runs.
 */

test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

const API_URL = process.env.NEXT_PUBLIC_KEA_API_URL?.replace(/\/$/, '');
const AI_PLAY = process.env.NEXT_PUBLIC_KEA_AI_PLAY === '1';
const DECK_ID = 'saltmarsh-bay-en-case';
const CORS = { 'access-control-allow-origin': '*' };

async function seedPasscode(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('kea.passcode', JSON.stringify({ v: 1, data: 'open-sesame' }));
  });
}

async function openCase(page: Page) {
  await page.goto(`/play/${DECK_ID}`);
  await page.getByRole('button', { name: /start game/i }).click();
  await page.getByRole('button', { name: 'Open the case file' }).click();
  await expect(page.getByTestId('case-board')).toBeVisible();
}

async function openEvidence(page: Page, id: string) {
  await page.getByTestId('case-evidence-open').click();
  await page.getByTestId(`case-evidence-item-${id}`).click();
  await expect(page.getByTestId('case-viewer')).toBeVisible();
  await page.getByTestId('case-viewer-close').click();
  await expect(page.getByTestId('case-viewer')).toHaveCount(0);
}

type Reply = { json: unknown } | { status: number; code: string };

/** Mock a Worker route with a queue of replies; records request bodies. */
async function mockRoute(page: Page, path: string, replies: Reply[]) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(`${API_URL}${path}`, async (route: Route) => {
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
    const reply = replies.shift() ?? { status: 502, code: 'upstream_error' };
    if ('status' in reply) {
      await route.fulfill({ status: reply.status, json: { error: { code: reply.code, message: 'mock' } }, headers: CORS });
    } else {
      await route.fulfill({ json: reply.json, headers: CORS });
    }
  });
  return bodies;
}

async function accuse(page: Page, answers: Record<string, string>) {
  await page.getByTestId('case-accuse-open').click();
  const form = page.getByTestId('case-accusation-sheet');
  for (const [id, text] of Object.entries(answers)) await form.getByTestId(`case-answer-${id}`).fill(text);
  await form.getByRole('button', { name: 'Submit the accusation' }).click();
  await expect(page.getByTestId('case-review')).toBeVisible();
}

test.describe('case: AI play deferred', () => {
  test.skip(AI_PLAY, 'NEXT_PUBLIC_KEA_AI_PLAY=1');

  test('the investigator is shown disabled with a hint; no judge, the group marks by hand', async ({ page }) => {
    await seedPasscode(page);
    await openCase(page);
    await expect(page.getByTestId('case-investigator-open')).toBeDisabled();
    const hint = page.getByTestId('case-investigator-hint');
    await expect(hint).toHaveAttribute('title', 'Coming in a later release');
    await hint.hover();
    await expect(hint.getByRole('tooltip')).toBeVisible();
    await accuse(page, { who: 'the museum curator, Dr Lindqvist', when: 'Monday night' });
    await expect(page.getByTestId('case-judge-status')).toHaveCount(0);
    await page.getByTestId('case-mark-correct-who').click();
    await expect(page.getByTestId('case-mark-correct-who')).toHaveAttribute('aria-pressed', 'true');
  });

  test('answers lock at the accusation: the review has no way back to the board', async ({ page }) => {
    await openCase(page);
    await accuse(page, { who: 'nobody' });
    await expect(page.getByRole('button', { name: 'Change answers' })).toHaveCount(0);
  });
});

test.describe('case without a Worker', () => {
  test.skip(!!API_URL || !AI_PLAY, 'needs NEXT_PUBLIC_KEA_AI_PLAY=1 and no Worker URL');

  test('no investigator, and the group marks unmatched answers by hand', async ({ page }) => {
    await seedPasscode(page);
    await openCase(page);
    await expect(page.getByTestId('case-investigator-panel')).toHaveCount(0);
    await expect(page.getByTestId('case-investigator-open')).toHaveCount(0);
    await accuse(page, { who: 'the museum curator, Dr Lindqvist', when: 'Monday night' });
    await expect(page.getByTestId('case-judge-status')).toHaveCount(0);
    await expect(page.getByTestId('case-review-item-who')).toHaveAttribute('data-match', 'unmatched');
    await expect(page.getByTestId('case-judge-note-who')).toHaveCount(0);
    await expect(page.getByTestId('case-mark-correct-who')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('case-mark-correct-who').click();
    await expect(page.getByTestId('case-mark-correct-who')).toHaveAttribute('aria-pressed', 'true');
  });
});

test.describe('case with the AI Worker (mocked)', () => {
  test.skip(!API_URL || !AI_PLAY, 'Set NEXT_PUBLIC_KEA_API_URL (e.g. https://kea-worker.test) and NEXT_PUBLIC_KEA_AI_PLAY=1 for the dev server and tests');

  test('the investigator is hidden without a passcode', async ({ page }) => {
    await openCase(page);
    await expect(page.getByTestId('case-investigator-panel')).toHaveCount(0);
  });

  test('ask the investigator: opened evidence ids are sent, a cited chip opens the evidence, errors retry, the transcript survives a reload', async ({ page }) => {
    await seedPasscode(page);
    const bodies = await mockRoute(page, '/case/ask', [
      { status: 502, code: 'upstream_error' },
      {
        json: {
          answer: 'The display key left the key box at 21:12 with badge VOL-07 (`building-log`).',
          citedEvidenceIds: ['building-log'],
          inEvidence: true,
        },
      },
      { json: { answer: 'That is not in the opened evidence.', citedEvidenceIds: [], inEvidence: false } },
    ]);
    await openCase(page);
    await openEvidence(page, 'building-log');

    await page.getByTestId('case-investigator-open').click();
    const sheet = page.getByTestId('case-investigator-sheet');
    await expect(sheet).toBeVisible();
    await sheet.getByTestId('case-investigator-input').fill('Whose badge took the key on Monday?');
    await sheet.getByTestId('case-investigator-send').click();

    await expect(sheet.getByTestId('case-investigator-error')).toBeVisible();
    await sheet.getByTestId('case-investigator-retry').click();
    const entry = sheet.getByTestId('case-investigator-entry').first();
    await expect(entry.getByTestId('case-investigator-answer')).toContainText('badge VOL-07');
    await expect(entry.getByTestId('case-investigator-answer')).toContainText('Building access log (export)');
    expect(bodies[1]).toEqual({
      deckId: DECK_ID,
      cardId: 'halden-chronometer',
      lang: 'en',
      openedEvidenceIds: ['building-log'],
      question: 'Whose badge took the key on Monday?',
    });

    // Unknown answers say so.
    await sheet.getByTestId('case-investigator-input').fill('Where is the chronometer now?');
    await sheet.getByTestId('case-investigator-send').click();
    const second = sheet.getByTestId('case-investigator-entry').nth(1);
    await expect(second).toHaveAttribute('data-in-evidence', 'false');
    await expect(second).toContainText('not in the opened evidence');

    // The citation chip opens the evidence viewer.
    await entry.getByTestId('case-investigator-cite-building-log').click();
    await expect(page.getByTestId('case-viewer')).toBeVisible();
    await expect(page.getByTestId('case-viewer-title')).toContainText('Building access log');
    await page.getByTestId('case-viewer-close').click();

    // Saved in the session.
    await page.reload();
    await expect(page.getByTestId('case-board')).toBeVisible();
    await expect(page.getByTestId('case-investigator-open')).toContainText('2 questions asked');
    await page.getByTestId('case-investigator-open').click();
    await expect(page.getByTestId('case-investigator-entry')).toHaveCount(2);
  });

  test('the judge pre-marks a paraphrase; the group can still override it', async ({ page }) => {
    await seedPasscode(page);
    const bodies = await mockRoute(page, '/case/judge', [
      { json: { results: [{ questionId: 'who', correct: true }, { questionId: 'where', correct: false }] } },
    ]);
    await openCase(page);
    await accuse(page, {
      who: 'the museum curator, Dr Lindqvist',
      when: 'Monday night',
      where: "hidden in Felix's workshop",
    });

    await expect(page.getByTestId('case-judge-status')).toHaveAttribute('data-status', 'done');
    // Only the answers the local matcher did not match were sent.
    expect(bodies).toHaveLength(1);
    expect(bodies[0]).toEqual({
      deckId: DECK_ID,
      cardId: 'halden-chronometer',
      lang: 'en',
      answers: { who: 'the museum curator, Dr Lindqvist', where: "hidden in Felix's workshop" },
    });
    await expect(page.getByTestId('case-judge-note-who')).toContainText('The judge suggests: Correct');
    await expect(page.getByTestId('case-mark-correct-who')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('case-mark-incorrect-where')).toHaveAttribute('aria-pressed', 'true');

    // The group overrides the judge.
    await page.getByTestId('case-mark-correct-where').click();
    await expect(page.getByTestId('case-mark-correct-where')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('case-judge-note-where')).toHaveCount(0);
  });

  test('a judge failure leaves group marking unchanged and can be retried', async ({ page }) => {
    await seedPasscode(page);
    await mockRoute(page, '/case/judge', [
      { status: 502, code: 'upstream_error' },
      { json: { results: [{ questionId: 'who', correct: true }] } },
    ]);
    await openCase(page);
    await accuse(page, { who: 'the museum curator, Dr Lindqvist' });
    await expect(page.getByTestId('case-judge-status')).toHaveAttribute('data-status', 'error');
    await expect(page.getByTestId('case-mark-correct-who')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('case-judge-retry').click();
    await expect(page.getByTestId('case-judge-note-who')).toBeVisible();
  });
});
