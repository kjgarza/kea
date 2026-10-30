import { test, expect, type Page } from '@playwright/test';

/**
 * Shared chrome follows the deck language by default; the EN/ES switch
 * overrides it and persists (via the kea.* store) across reloads.
 */

const VERSION = '2026-01-07T00:00:00Z';

function deck(deckId: string, language: string) {
  return {
    schemaVersion: 1,
    deckId,
    version: VERSION,
    name: `i18n ${language}`,
    gameType: 'charades',
    language,
    difficulty: 'easy',
    topics: [],
    nsfw: false,
    cards: [
      { cardId: 'a', type: 'charades', prompt: 'Alpha' },
      { cardId: 'b', type: 'charades', prompt: 'Bravo' },
    ],
  };
}

const ES_DECK = deck('animals-es-charades', 'es');
const EN_DECK = deck('animals-en-charades', 'en');

async function open(page: Page, fixture: { deckId: string }) {
  await page.route(`**/decks/${fixture.deckId}.json`, (route) =>
    route.fulfill({ json: fixture })
  );
  await page.goto(`/play/${fixture.deckId}`);
}

test.describe('i18n', () => {
  test('a Spanish deck shows the shared chrome in Spanish', async ({ page }) => {
    await open(page, ES_DECK);

    await expect(page.getByRole('button', { name: /^empezar partida$/i })).toBeVisible();
    await expect(page.getByText('2 cartas')).toBeVisible();
    await expect(page.getByText('Barajar cartas')).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');

    await page.getByRole('button', { name: /^empezar partida$/i }).click();
    await expect(page.getByRole('link', { name: /salir/i })).toBeVisible();

    await page.getByRole('button', { name: /^reiniciar$/i }).click();
    await expect(page.getByText('¿Reiniciar la partida?')).toBeVisible();
    await page.getByRole('button', { name: /^cancelar$/i }).click();
  });

  test('an English deck shows English chrome', async ({ page }) => {
    await open(page, EN_DECK);
    await expect(page.getByRole('button', { name: /^start game$/i })).toBeVisible();
    await expect(page.getByText('2 cards')).toBeVisible();
  });

  test('the manual switch persists across reloads', async ({ page }) => {
    await open(page, ES_DECK);
    await expect(page.getByRole('button', { name: /^empezar partida$/i })).toBeVisible();

    await page.getByTestId('locale-switch').click();
    await expect(page.getByRole('button', { name: /^start game$/i })).toBeVisible();

    const stored = await page.evaluate(() => localStorage.getItem('kea.locale'));
    expect(JSON.parse(stored!)).toEqual({ v: 1, data: 'en' });

    await page.reload();
    await expect(page.getByRole('button', { name: /^start game$/i })).toBeVisible();
    await expect(page.getByText('2 cards')).toBeVisible();

    // The override applies on other screens too (deck list labels).
    await page.getByTestId('locale-switch').click();
    await page.goto('/game/charades');
    await expect(page.getByRole('heading', { name: 'Elige una baraja' })).toBeVisible();
    await expect(page.getByText('Cómo se juega')).toBeVisible();
  });
});
