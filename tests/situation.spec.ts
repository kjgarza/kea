import { test, expect, type Page } from '@playwright/test';
import sampleDeck from '../public/decks/sample-en-situation.json';

/**
 * Situation puzzles: deck list (#24) and the human-keeper play screen (#25),
 * played on a 375px phone.
 */

const SOLUTION_1 = 'Her son had just qualified as a bus driver';
const SECRETS_1 = [
  SOLUTION_1,
  "The bus driver was Anna's son.", // key fact
  'Think about who was behind the wheel.', // hint
];

async function startDeck(page: Page) {
  await page.goto('/play/sample-en-situation');
  await page.getByRole('button', { name: /start game/i }).click();
  await expect(page.getByTestId('situation-picker')).toBeVisible();
}

async function expectNotInDom(page: Page, texts: string[]) {
  const html = await page.content();
  for (const text of texts) expect(html).not.toContain(text);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('situation puzzles', () => {
  test('home tile opens the deck list with the sample deck and its warnings', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Situation Puzzles/ }).click();
    await expect(page).toHaveURL(/\/game\/situation\/?$/);
    await expect(page.getByRole('heading', { name: 'Situation Puzzles', level: 1 })).toBeVisible();

    const deckCard = page.getByRole('link', { name: /Sample Situations/ });
    await expect(deckCard).toBeVisible();
    await expect(deckCard.getByTestId('deck-content-warnings')).toHaveText(
      'Content warnings: animal in danger, medical emergency'
    );
  });
});

test.describe('situation human keeper (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('picker lists puzzles without spoilers', async ({ page }) => {
    await startDeck(page);
    const picker = page.getByTestId('situation-picker');
    await expect(picker.getByRole('heading', { name: 'Choose a puzzle' })).toBeVisible();
    await expect(page.getByTestId('situation-pick-sit-001')).toContainText("The Bus She Didn't Take");
    await expect(page.getByTestId('situation-pick-sit-001')).toContainText('~10 min');
    await expect(page.getByTestId('situation-pick-sit-002')).toContainText('Warnings: animal in danger');
    await expectNotInDom(page, SECRETS_1);
    await expectNoHorizontalScroll(page);
  });

  test('setup → reveal → mark facts → solved', async ({ page }) => {
    await startDeck(page);
    await page.getByTestId('situation-pick-sit-001').click();

    // Setup in large type; nothing secret is in the DOM yet.
    await expect(page.getByTestId('situation-setup-text')).toContainText(
      'Every weekday Anna catches the 8:00 bus'
    );
    await expectNotInDom(page, SECRETS_1);
    await expectNoHorizontalScroll(page);

    // The reveal needs confirming; cancelling keeps it hidden.
    await page.getByRole('button', { name: 'Keeper: show solution' }).click();
    await expect(page.getByRole('dialog')).toContainText('Show the solution?');
    await expectNotInDom(page, SECRETS_1);
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expectNotInDom(page, SECRETS_1);

    await page.getByRole('button', { name: 'Keeper: show solution' }).click();
    await page.getByRole('button', { name: "I'm the keeper, show it" }).click();

    await expect(page.getByTestId('situation-solution')).toContainText(SOLUTION_1);
    await expect(page.getByTestId('situation-timer')).toBeVisible();

    // Question counter, facts, hints.
    const addQuestion = page.getByRole('button', { name: '+1 question' });
    await addQuestion.click();
    await addQuestion.click();
    await addQuestion.click();
    await page.getByRole('button', { name: 'Undo last question' }).click();
    await expect(page.getByTestId('situation-question-count')).toHaveText('2');

    const fact = page.getByRole('checkbox', { name: "The bus driver was Anna's son." });
    await fact.click();
    await expect(fact).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('checkbox', { name: "It was his first day driving that route." }).click();
    await expect(page.getByText('Key facts 2/4')).toBeVisible();

    await page.getByRole('button', { name: 'Give hint 1' }).click();
    await expect(page.getByTestId('situation-hints')).toContainText('Anna never meant to get on the bus.');
    await expectNoHorizontalScroll(page);

    // Main actions are within thumb reach on a 667px-tall screen.
    const solved = page.getByRole('button', { name: 'Solved' });
    const box = await solved.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(667);
    await solved.click();

    const end = page.getByTestId('situation-end');
    await expect(end.getByRole('heading', { name: 'Solved!' })).toBeVisible();
    await expect(page.getByTestId('situation-end-solution')).toContainText(SOLUTION_1);
    await expect(page.getByTestId('situation-end-questions')).toHaveText('2');
    await expect(page.getByTestId('situation-end-hints')).toHaveText('1');
    await expect(page.getByTestId('situation-end-facts')).toHaveText('2/4');
    await expect(page.getByTestId('situation-timer')).toHaveText(/^\d+:\d\d$/);

    // Next puzzle moves along the stack; puzzle 2 has a warning first.
    await page.getByRole('button', { name: 'Next puzzle' }).click();
    await expect(page.getByTestId('situation-warning-screen')).toBeVisible();
    await expect(page.getByTestId('situation-content-warnings')).toContainText('animal in danger');
    await expect(page.getByTestId('situation-setup')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show the setup' }).click();
    await expect(page.getByTestId('situation-setup-text')).toContainText('smashes the window');
  });

  test('resumes mid-puzzle after a reload', async ({ page }) => {
    await startDeck(page);
    await page.getByTestId('situation-pick-sit-001').click();
    await page.getByRole('button', { name: 'Keeper: show solution' }).click();
    await page.getByRole('button', { name: "I'm the keeper, show it" }).click();
    await page.getByRole('button', { name: '+1 question' }).click();
    await page.getByRole('checkbox', { name: "The bus driver was Anna's son." }).click();
    await page.getByRole('button', { name: 'Give hint 1' }).click();

    await page.reload();

    await expect(page.getByTestId('situation-solution')).toContainText(SOLUTION_1);
    await expect(page.getByTestId('situation-question-count')).toHaveText('1');
    await expect(
      page.getByRole('checkbox', { name: "The bus driver was Anna's son." })
    ).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('situation-hints')).toContainText('Anna never meant to get on the bus.');

    await page.getByRole('button', { name: 'Give up' }).click();
    await expect(page.getByRole('heading', { name: "Here's what happened" })).toBeVisible();
  });

  test('a Spanish deck shows the keeper screens in Spanish', async ({ page }) => {
    await page.route('**/decks/sample-en-situation.json', (route) =>
      route.fulfill({ json: { ...sampleDeck, language: 'es' } })
    );
    await page.goto('/play/sample-en-situation');
    await page.getByRole('button', { name: /^empezar partida$/i }).click();
    await expect(page.getByRole('heading', { name: 'Elige un enigma' })).toBeVisible();
    await page.getByTestId('situation-pick-sit-002').click();
    await expect(page.getByRole('heading', { name: 'Advertencia de contenido' })).toBeVisible();
    await page.getByRole('button', { name: 'Mostrar la situación' }).click();
    await expect(page.getByRole('button', { name: 'Narrador: ver solución' })).toBeVisible();
  });
});
