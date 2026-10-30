import { test, expect, type Page, type Route } from '@playwright/test';
import kitchenDeck from '../public/decks/kitchen-table-en-situation.json';

/**
 * AI keeper and solo modes (#31) on a 375px phone, with the Worker mocked via
 * `page.route`. The Worker URL is inlined at build time, so the AI-on tests
 * need NEXT_PUBLIC_KEA_API_URL=https://kea-worker.test exported for BOTH the
 * dev server and Playwright (see tests/ai-settings.spec.ts). Without it only
 * the "not configured" test runs.
 */

test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

const API_URL = process.env.NEXT_PUBLIC_KEA_API_URL?.replace(/\/$/, '');
const DECK_ID = 'kitchen-table-en-situation';
const CARD = kitchenDeck.cards.find((c) => c.cardId === 'wet-letter')!;
const CORS = { 'access-control-allow-origin': '*' };

async function seedPasscode(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('kea.passcode', JSON.stringify({ v: 1, data: 'open-sesame' }));
  });
}

async function openPicker(page: Page, deckId = DECK_ID) {
  await page.goto(`/play/${deckId}`);
  await page.getByRole('button', { name: /start game|empezar partida/i }).click();
  await expect(page.getByTestId('situation-picker')).toBeVisible();
}

async function startAiPuzzle(page: Page, mode: 'ai' | 'solo' = 'ai') {
  await openPicker(page);
  await page.getByTestId(`mode-${mode}`).click();
  await expect(page.getByTestId(`mode-${mode}`)).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId(`situation-pick-${CARD.cardId}`).click();
  await expect(page.getByTestId('situation-ai-keeper')).toBeVisible();
}

async function ask(page: Page, question: string) {
  await page.getByTestId('keeper-question-input').fill(question);
  await page.getByTestId('keeper-send').click();
}

type Reply = { answer: string; factIds?: string[] } | { status: number; code: string };

/** Mock /keeper/ask with a queue of replies; records request bodies. */
async function mockKeeper(page: Page, replies: Reply[]) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(`${API_URL}/keeper/ask`, async (route: Route) => {
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
    const reply = replies.shift() ?? { answer: 'irrelevant' };
    if ('status' in reply) {
      await route.fulfill({
        status: reply.status,
        json: { error: { code: reply.code, message: 'mock error' } },
        headers: CORS,
      });
    } else {
      await route.fulfill({
        json: { answer: reply.answer, factIds: reply.factIds ?? [], confidence: 0.9 },
        headers: CORS,
      });
    }
  });
  return bodies;
}

test.describe('AI keeper without a Worker', () => {
  test('AI and solo are disabled with an explanation', async ({ page }) => {
    test.skip(Boolean(API_URL), 'NEXT_PUBLIC_KEA_API_URL is set');
    await openPicker(page);
    await expect(page.getByTestId('mode-human')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('mode-ai')).toBeDisabled();
    await expect(page.getByTestId('mode-solo')).toBeDisabled();
    await expect(page.getByTestId('mode-unavailable')).toContainText("isn't set up for this site");

    // Human keeper still works as before.
    await page.getByTestId(`situation-pick-${CARD.cardId}`).click();
    await expect(page.getByRole('button', { name: 'Keeper: show solution' })).toBeVisible();
  });
});

test.describe('AI keeper with a mocked Worker (375px)', () => {
  test.skip(!API_URL, 'NEXT_PUBLIC_KEA_API_URL is not set');

  test('without a passcode AI is disabled until one is saved in settings', async ({ page }) => {
    await openPicker(page);
    await expect(page.getByTestId('mode-ai')).toBeDisabled();
    await expect(page.getByTestId('mode-unavailable')).toContainText('Enter the AI passcode');

    await page.getByTestId('mode-open-settings').click();
    await page.getByTestId('passcode-input').fill('open-sesame');
    await page.getByTestId('passcode-save').click();
    await page.keyboard.press('Escape');

    await expect(page.getByTestId('mode-ai')).toBeEnabled();
    await expect(page.getByTestId('mode-unavailable')).toHaveCount(0);
  });

  test('ask → answer chip → fact progress; transcript survives a reload; solved goes to history', async ({ page }) => {
    await seedPasscode(page);
    const factId = CARD.keyFacts[0].id;
    const bodies = await mockKeeper(page, [
      { answer: 'yes', factIds: [factId] },
      { answer: 'irrelevant' },
    ]);
    await startAiPuzzle(page);

    await expect(page.getByTestId('keeper-progress')).toHaveAttribute('data-found', '0');
    await ask(page, 'Was the ink special?');
    await expect(page.getByTestId('keeper-answer')).toHaveText('Yes');
    await expect(page.getByTestId('keeper-answer')).toHaveAttribute('data-answer', 'yes');
    await expect(page.getByTestId('keeper-progress')).toHaveAttribute('data-found', '1');
    await expect(page.getByTestId('keeper-progress-value')).toHaveText(`1 of ${CARD.keyFacts.length}`);

    await ask(page, 'Was it raining?');
    await expect(page.getByTestId('keeper-answer')).toHaveText('Irrelevant');
    const entries = page.getByTestId('keeper-transcript-entry');
    await expect(entries).toHaveCount(2);
    // Latest at the bottom.
    await expect(entries.last()).toContainText('Was it raining?');
    await expect(page.getByTestId('situation-question-count')).toHaveText('2');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // The request carries ids, language, transcript and question only.
    expect(bodies[0]).toEqual({
      deckId: DECK_ID,
      cardId: CARD.cardId,
      lang: 'en',
      transcript: [],
      question: 'Was the ink special?',
    });
    expect(bodies[1].transcript).toEqual([{ q: 'Was the ink special?', a: 'yes' }]);
    expect(JSON.stringify(bodies)).not.toContain(CARD.solution);

    await page.reload();
    await expect(page.getByTestId('situation-ai-keeper')).toBeVisible();
    await expect(page.getByTestId('keeper-transcript-entry')).toHaveCount(2);
    await expect(page.getByTestId('keeper-answer')).toHaveText('Irrelevant');
    await expect(page.getByTestId('keeper-progress')).toHaveAttribute('data-found', '1');

    await page.getByRole('button', { name: 'We solved it' }).click();
    await expect(page.getByTestId('situation-end')).toBeVisible();
    await expect(page.getByTestId('situation-end-questions')).toHaveText('2');
    await expect(page.getByTestId('situation-end-solution')).toContainText(CARD.solution.slice(0, 30));
    const history = await page.evaluate(() => localStorage.getItem('kea.history'));
    expect(JSON.parse(history!).data[0]).toMatchObject({
      cardId: CARD.cardId,
      mode: 'ai',
      questions: 2,
      outcome: 'solved',
    });
  });

  test('a Worker error keeps the question and the transcript; retry sends it again', async ({ page }) => {
    await seedPasscode(page);
    await mockKeeper(page, [
      { answer: 'no' },
      { status: 502, code: 'upstream_error' },
      { answer: 'yes', factIds: [CARD.keyFacts[1].id] },
    ]);
    await startAiPuzzle(page);

    await ask(page, 'Was the letter blank?');
    await expect(page.getByTestId('keeper-answer')).toHaveText('No');

    await ask(page, 'Was it from a relative?');
    await expect(page.getByTestId('keeper-error')).toContainText('had a problem');
    await expect(page.getByTestId('keeper-pending')).toContainText('Was it from a relative?');
    await expect(page.getByTestId('keeper-transcript-entry')).toHaveCount(1);
    // One question at a time: send is blocked until retry or discard.
    await page.getByTestId('keeper-question-input').fill('Another one');
    await expect(page.getByTestId('keeper-send')).toBeDisabled();

    await page.getByTestId('keeper-retry').click();
    await expect(page.getByTestId('keeper-answer')).toHaveText('Yes');
    await expect(page.getByTestId('keeper-pending')).toHaveCount(0);
    await expect(page.getByTestId('keeper-transcript-entry')).toHaveCount(2);
    await expect(page.getByTestId('keeper-progress')).toHaveAttribute('data-found', '1');
  });

  test('offline: banner, and sending waits until back online', async ({ page, context }) => {
    await seedPasscode(page);
    await mockKeeper(page, [{ answer: 'yes' }]);
    await startAiPuzzle(page);

    await context.setOffline(true);
    await expect(page.getByTestId('keeper-offline')).toBeVisible();
    await page.getByTestId('keeper-question-input').fill('Is it about ink?');
    await expect(page.getByTestId('keeper-send')).toBeDisabled();
    await page.getByTestId('keeper-question-input').press('Enter');
    await expect(page.getByTestId('keeper-pending')).toHaveCount(0);

    await context.setOffline(false);
    await expect(page.getByTestId('keeper-offline')).toHaveCount(0);
    await page.getByTestId('keeper-send').click();
    await expect(page.getByTestId('keeper-answer')).toHaveText('Yes');
  });

  test('solo: hints lower the score, which is shown at the end and saved', async ({ page }) => {
    await seedPasscode(page);
    await mockKeeper(page, [{ answer: 'no' }]);
    await startAiPuzzle(page, 'solo');

    await expect(page.getByTestId('solo-score')).toHaveText('100');
    await ask(page, 'Was the letter blank?');
    await expect(page.getByTestId('keeper-answer')).toHaveText('No');
    await expect(page.getByTestId('solo-score')).toHaveText('98');
    await page.getByTestId('situation-hint-button').click();
    await expect(page.getByTestId('situation-hints')).toContainText(CARD.hints[0]);
    await expect(page.getByTestId('solo-score')).toHaveText('88');

    await page.getByRole('button', { name: 'I solved it' }).click();
    await expect(page.getByTestId('situation-end-score')).toHaveText('Score: 88');
    const history = await page.evaluate(() => localStorage.getItem('kea.history'));
    expect(JSON.parse(history!).data[0]).toMatchObject({ mode: 'solo', score: 88, hintsUsed: 1 });
  });

  test('Spanish deck: asks in Spanish and shows the chip in Spanish', async ({ page }) => {
    await seedPasscode(page);
    const bodies = await mockKeeper(page, [{ answer: 'yes', factIds: ['window-cleaner'] }]);
    await openPicker(page, 'no-death-es-situation');
    await page.getByTestId('mode-ai').click();
    await page.getByTestId('situation-pick-no-001').click();
    await ask(page, '¿Limpiaba ventanas?');
    await expect(page.getByTestId('keeper-answer')).toHaveText('Sí');
    expect(bodies[0]).toMatchObject({ deckId: 'no-death-es-situation', cardId: 'no-001', lang: 'es' });
  });
});
