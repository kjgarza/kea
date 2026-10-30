import { test, expect, type Page } from '@playwright/test';

/**
 * Smoke tests for every existing game through the module registry:
 * start, next, pass, finish. Each test serves a tiny fixture deck in place of
 * the real deck JSON (same deckId so the static route exists), which keeps
 * "finish" short and the card order known (shuffle is off by default).
 */

const VERSION = '2026-01-07T00:00:00Z';

function deck(deckId: string, gameType: string, cards: object[]) {
  return {
    schemaVersion: 1,
    deckId,
    version: VERSION,
    name: `Smoke ${gameType}`,
    gameType,
    language: 'en',
    difficulty: 'easy',
    topics: [],
    nsfw: false,
    cards,
  };
}

const FIXTURES = {
  charades: deck('animals-en-charades', 'charades', [
    { cardId: 'a', type: 'charades', prompt: 'Alpha' },
    { cardId: 'b', type: 'charades', prompt: 'Bravo' },
    { cardId: 'c', type: 'charades', prompt: 'Charlie' },
  ]),
  trivia: deck('general-knowledge-en-trivia', 'trivia', [
    { cardId: 'a', type: 'trivia', format: 'open', question: 'Question Alpha?', answerText: 'Answer Alpha' },
    { cardId: 'b', type: 'trivia', format: 'open', question: 'Question Bravo?', answerText: 'Answer Bravo' },
    {
      cardId: 'c', type: 'trivia', format: 'mcq', question: 'Question Charlie?',
      choices: ['One', 'Two', 'Three', 'Four'], answerIndex: 1, answerText: 'Two',
    },
  ]),
  taboo: deck('everyday-words-en-taboo', 'taboo', [
    { cardId: 'a', type: 'taboo', target: 'Alpha', forbidden: ['a1', 'a2', 'a3', 'a4', 'a5'] },
    { cardId: 'b', type: 'taboo', target: 'Bravo', forbidden: ['b1', 'b2', 'b3', 'b4', 'b5'] },
    { cardId: 'c', type: 'taboo', target: 'Charlie', forbidden: ['c1', 'c2', 'c3', 'c4', 'c5'] },
  ]),
  justone: deck('simple-words-en-justone', 'justone', [
    { cardId: 'a', type: 'justone', target: 'Alpha' },
    { cardId: 'b', type: 'justone', target: 'Bravo' },
    { cardId: 'c', type: 'justone', target: 'Charlie' },
  ]),
  monikers: deck('pop-culture-en-monikers', 'monikers', [
    { cardId: 'a', type: 'monikers', phrase: 'Alpha' },
    { cardId: 'b', type: 'monikers', phrase: 'Bravo' },
    { cardId: 'c', type: 'monikers', phrase: 'Charlie' },
  ]),
} as const;

async function serveFixture(page: Page, fixture: { deckId: string }) {
  await page.route(`**/decks/${fixture.deckId}.json`, (route) =>
    route.fulfill({ json: fixture })
  );
}

async function openAndStart(page: Page, fixture: { deckId: string }) {
  await serveFixture(page, fixture);
  await page.goto(`/play/${fixture.deckId}`);
  await page.getByRole('button', { name: /^start game$/i }).click();
}

/** The card text, matched exactly so "Alpha" doesn't match "Answer Alpha". */
function card(page: Page, text: string) {
  return page.getByText(text, { exact: true });
}

const pass = (page: Page) => page.getByRole('button', { name: /^pass$/i }).click();
const gotIt = (page: Page) => page.getByRole('button', { name: /got it/i }).click();

test.describe('game smoke tests', () => {
  test('charades: start, next, pass (recycles), finish', async ({ page }) => {
    await openAndStart(page, FIXTURES.charades);
    await expect(card(page, 'Alpha')).toBeVisible();
    await gotIt(page);
    await expect(card(page, 'Bravo')).toBeVisible();
    await pass(page);
    await expect(card(page, 'Charlie')).toBeVisible();
    await gotIt(page);
    // Passed card comes back
    await expect(card(page, 'Bravo')).toBeVisible();
    await gotIt(page);
    await expect(page.getByRole('heading', { name: 'Deck Complete!' })).toBeVisible();
  });

  test('trivia: start, pass (discards), reveal + next, finish', async ({ page }) => {
    await openAndStart(page, FIXTURES.trivia);
    await expect(card(page, 'Question Alpha?')).toBeVisible();
    await pass(page);
    await expect(card(page, 'Question Bravo?')).toBeVisible();
    const next = page.getByRole('button', { name: /^next$/i });
    await expect(next).toBeDisabled();
    await page.getByRole('button', { name: /reveal answer/i }).click();
    await expect(card(page, 'Answer Bravo')).toBeVisible();
    await next.click();
    await expect(card(page, 'Question Charlie?')).toBeVisible();
    await page.getByRole('button', { name: /reveal answer/i }).click();
    await next.click();
    await expect(page.getByRole('heading', { name: 'Deck Complete!' })).toBeVisible();
  });

  test('taboo: timer, next, pass (recycles), finish', async ({ page }) => {
    await openAndStart(page, FIXTURES.taboo);
    await expect(card(page, 'Alpha')).toBeVisible();
    await page.getByRole('button', { name: /start timer/i }).click();
    await expect(page.getByRole('button', { name: /taboo word said/i })).toBeVisible();
    await gotIt(page);
    await expect(card(page, 'Bravo')).toBeVisible();
    // Timer resets on card change
    await expect(page.getByRole('button', { name: /start timer/i })).toBeVisible();
    await expect(page.getByText('60s')).toBeVisible();
    await pass(page);
    await expect(card(page, 'Charlie')).toBeVisible();
    await page.getByRole('button', { name: /start timer/i }).click();
    await gotIt(page);
    await expect(card(page, 'Bravo')).toBeVisible();
    await page.getByRole('button', { name: /start timer/i }).click();
    await gotIt(page);
    await expect(page.getByRole('heading', { name: 'Deck Complete!' })).toBeVisible();
  });

  test('just one: start, next, pass (discards), finish', async ({ page }) => {
    await openAndStart(page, FIXTURES.justone);
    await expect(card(page, 'Alpha')).toBeVisible();
    await gotIt(page);
    await expect(card(page, 'Bravo')).toBeVisible();
    await pass(page);
    await expect(card(page, 'Charlie')).toBeVisible();
    await gotIt(page);
    await expect(page.getByRole('heading', { name: 'Deck Complete!' })).toBeVisible();
  });

  test('monikers: correct, pass, end turn, three rounds, finish', async ({ page }) => {
    await openAndStart(page, FIXTURES.monikers);
    const correct = () => page.getByRole('button', { name: /correct/i }).click();

    await expect(page.getByText('Round 1/3')).toBeVisible();
    await expect(card(page, 'Alpha')).toBeVisible();
    await correct();
    await expect(card(page, 'Bravo')).toBeVisible();
    await pass(page);
    await expect(card(page, 'Charlie')).toBeVisible();
    await page.getByRole('button', { name: /end turn/i }).click();
    await expect(page.getByText('Turn Ended!')).toBeVisible();
    await expect(page.getByText('2 cards remaining')).toBeVisible();
    await page.getByRole('button', { name: /start turn/i }).click();
    await expect(card(page, 'Charlie')).toBeVisible();
    await correct();
    await expect(card(page, 'Bravo')).toBeVisible();
    await correct();

    for (const round of [2, 3]) {
      await expect(page.getByRole('heading', { name: `Round ${round - 1} Complete!` })).toBeVisible();
      await page.getByRole('button', { name: `Start Round ${round}` }).click();
      await expect(page.getByText(`Round ${round}/3`)).toBeVisible();
      for (let i = 0; i < 3; i++) await correct();
    }

    await expect(page.getByRole('heading', { name: 'Game Complete!' })).toBeVisible();
  });
});

test.describe('session storage', () => {
  test('progress resumes after reload from kea.session.*', async ({ page }) => {
    await openAndStart(page, FIXTURES.charades);
    await gotIt(page);
    await expect(card(page, 'Bravo')).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('kea.session.animals-en-charades'));
    expect(JSON.parse(stored!)).toMatchObject({ v: 1, data: { currentCardId: 'b' } });

    await page.reload();
    await expect(card(page, 'Bravo')).toBeVisible();
  });

  test('legacy cg.session.* key is migrated and resumed', async ({ page }) => {
    const legacy = {
      schemaVersion: 1,
      deckId: 'animals-en-charades',
      deckVersion: VERSION,
      gameType: 'charades',
      shuffleEnabled: false,
      remainingCardIds: [],
      passedCardIds: [],
      currentCardId: 'c',
      isRevealed: false,
    };
    await page.addInitScript((value) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('cg.session.animals-en-charades', value);
        sessionStorage.setItem('seeded', '1');
      }
    }, JSON.stringify(legacy));
    await serveFixture(page, FIXTURES.charades);
    await page.goto('/play/animals-en-charades');

    await expect(card(page, 'Charlie')).toBeVisible();
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain('kea.session.animals-en-charades');
    expect(keys).not.toContain('cg.session.animals-en-charades');
  });

  test('games still play when localStorage is blocked', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get() {
          throw new DOMException('blocked', 'SecurityError');
        },
      });
    });
    await openAndStart(page, FIXTURES.justone);
    await expect(card(page, 'Alpha')).toBeVisible();
    await gotIt(page);
    await pass(page);
    await gotIt(page);
    await expect(page.getByRole('heading', { name: 'Deck Complete!' })).toBeVisible();
  });
});
