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

async function swipeCard(page: Page, text: string, dx: number) {
    const box = (await page.getByText(text, { exact: true }).boundingBox())!;
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

function fixture(deckId: string, gameType: string, cards: object[]) {
  return {
    schemaVersion: 1,
    deckId,
    version: '2026-01-07T00:00:00Z',
    name: 'Fixture',
    gameType,
    language: 'en',
    difficulty: 'easy',
    topics: [],
    nsfw: false,
    cards,
  };
}

test.describe('taboo swiping', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a card can only be scored once the timer is running', async ({ page }) => {
    await page.route('**/decks/everyday-words-en-taboo.json', (route) =>
      route.fulfill({
        json: fixture('everyday-words-en-taboo', 'taboo', [
          { cardId: 'a', type: 'taboo', target: 'Alpha', forbidden: ['a1', 'a2', 'a3', 'a4', 'a5'] },
          { cardId: 'b', type: 'taboo', target: 'Bravo', forbidden: ['b1', 'b2', 'b3', 'b4', 'b5'] },
        ]),
      })
    );
    await start(page, 'everyday-words-en-taboo');
    await expect(page.getByText('1 of 2')).toBeVisible();

    await swipeCard(page, 'Alpha', 170);
    await page.waitForTimeout(400);
    await expect(page.getByText('1 of 2')).toBeVisible();

    await page.getByRole('button', { name: /start timer/i }).click();
    await swipeCard(page, 'Alpha', 170);
    await expect(page.getByText('2 of 2')).toBeVisible();
  });
});

test.describe('trivia on a short screen', () => {
  // A small phone with the browser toolbar showing.
  test.use({ viewport: { width: 375, height: 500 } });

  test('a question too tall for its space can be read from its first line', async ({ page }) => {
    const question = 'Which long question has so many words that it cannot possibly fit in the space above the answers?';
    await page.route('**/decks/general-knowledge-en-trivia.json', (route) =>
      route.fulfill({
        json: fixture('general-knowledge-en-trivia', 'trivia', [
          { cardId: 'a', type: 'trivia', format: 'mcq', question, choices: ['One', 'Two', 'Three', 'Four'], answerIndex: 1, answerText: 'Two' },
        ]),
      })
    );
    await start(page, 'general-knowledge-en-trivia');
    const text = page.getByText(question, { exact: true });
    await expect(text).toBeVisible();
    const fits = await text.evaluate((el) => {
      const box = el.parentElement!;
      return { top: el.getBoundingClientRect().top >= box.getBoundingClientRect().top, overflows: box.scrollHeight > box.clientHeight };
    });
    expect(fits.overflows).toBe(true);
    expect(fits.top).toBe(true);
  });
});

test.describe('restart sheet', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Cancel is the bottom button and takes focus first', async ({ page }) => {
    await start(page, 'animals-en-charades');
    await page.getByRole('button', { name: /restart/i }).click();
    const cancel = page.getByRole('button', { name: /cancel/i });
    const confirm = page.getByRole('dialog').getByRole('button', { name: /^restart$/i });
    await expect(cancel).toBeVisible();
    const [c, r] = [(await cancel.boundingBox())!, (await confirm.boundingBox())!];
    expect(c.y).toBeGreaterThan(r.y);
    await expect(cancel).toBeFocused();
  });
});

test.describe('swiping', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  const swipe = (page: Page, dx: number) => swipeCard(page, 'Alpha', dx);

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
