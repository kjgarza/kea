import { test, expect, type Page } from '@playwright/test';

/**
 * The phone is the only surface. These pin what the design promises there:
 * every game in view, the current card and its controls fitting one screen,
 * big words staying whole, and swiping doing what the buttons do.
 */

const PHONES = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
];

async function start(page: Page, deckId: string) {
  await page.goto(`/play/${deckId}`);
  await page.getByRole('button', { name: /^start game$/i }).click();
}

const noSideScroll = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

for (const { width, height } of PHONES) {
  test.describe(`${width}x${height}`, () => {
    test.use({ viewport: { width, height } });

    test('home shows all seven games without scrolling', async ({ page }) => {
      await page.goto('/');
      const tiles = page.locator('nav a[href*="/game/"]');
      await expect(tiles).toHaveCount(7);
      await expect(tiles.last()).toBeInViewport({ ratio: 0.6 });
      expect(await noSideScroll(page)).toBe(true);
    });

    for (const deckId of [
      'animals-en-charades',
      'general-knowledge-en-trivia',
      'community-taboo-en-taboo',
      'simple-words-en-justone',
      'community-fictional-en-monikers',
    ]) {
      test(`${deckId}: card and controls fit one screen`, async ({ page }) => {
        await start(page, deckId);
        const pass = page.getByRole('button', { name: /^pass$/i });
        await expect(pass).toBeInViewport({ ratio: 1 });
        const box = await pass.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
        expect(await noSideScroll(page)).toBe(true);
      });
    }
  });
}

test.describe('card type', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test('a long word stays on one line', async ({ page }) => {
    await page.route('**/decks/simple-words-en-justone.json', (route) =>
      route.fulfill({
        json: {
          schemaVersion: 1,
          deckId: 'simple-words-en-justone',
          version: '2026-01-07T00:00:00Z',
          name: 'Fit',
          gameType: 'justone',
          language: 'en',
          difficulty: 'easy',
          topics: [],
          nsfw: false,
          cards: [{ cardId: 'a', type: 'justone', target: 'Arrastrar' }],
        },
      })
    );
    await start(page, 'simple-words-en-justone');
    const word = page.getByText('Arrastrar', { exact: true });
    await expect(word).toBeVisible();
    const lines = await word.evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
    });
    expect(lines).toBe(1);
  });
});

test.describe('swiping', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function swipe(page: Page, dx: number) {
    const box = (await page.getByText('Alpha', { exact: true }).boundingBox())!;
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    // Paced like a thumb: drags are picked up on animation frames, so a gesture
    // that starts and ends inside one frame wouldn't register.
    for (let step = 1; step <= 8; step++) {
      await page.mouse.move(x + (dx * step) / 8, y);
      await page.waitForTimeout(24);
    }
    await page.mouse.up();
  }

  test.beforeEach(async ({ page }) => {
    await page.route('**/decks/animals-en-charades.json', (route) =>
      route.fulfill({
        json: {
          schemaVersion: 1,
          deckId: 'animals-en-charades',
          version: '2026-01-07T00:00:00Z',
          name: 'Swipe',
          gameType: 'charades',
          language: 'en',
          difficulty: 'easy',
          topics: [],
          nsfw: false,
          cards: [
            { cardId: 'a', type: 'charades', prompt: 'Alpha' },
            { cardId: 'b', type: 'charades', prompt: 'Bravo' },
          ],
        },
      })
    );
    await start(page, 'animals-en-charades');
    await expect(page.getByText('Alpha', { exact: true })).toBeVisible();
    await expect(page.getByText('1 of 2')).toBeVisible();
  });

  test('right marks the card correct', async ({ page }) => {
    await swipe(page, 170);
    await expect(page.getByText('Bravo', { exact: true })).toBeVisible();
    await expect(page.getByText('2 of 2')).toBeVisible();
  });

  test('left passes the card, which comes back', async ({ page }) => {
    await swipe(page, -170);
    await expect(page.getByText('Bravo', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: /got it/i }).click();
    await expect(page.getByText('Alpha', { exact: true })).toBeVisible();
  });

  test('a small drag leaves the card in place', async ({ page }) => {
    await swipe(page, 40);
    await expect(page.getByText('Alpha', { exact: true })).toBeVisible();
    await expect(page.getByText('1 of 2')).toBeVisible();
  });
});
