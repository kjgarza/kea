import { test, expect } from '@playwright/test';

/**
 * Situation puzzles (#24): the home tile opens the deck list, which shows the
 * sample deck with its content warnings; the placeholder play screen shows
 * the warnings and setup but not the solution.
 */

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

  test('opening the sample deck shows the setup, not the solution', async ({ page }) => {
    await page.goto('/play/sample-en-situation');
    await page.getByRole('button', { name: /start game/i }).click();

    const card = page.getByTestId('situation-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('Every weekday Anna catches the 8:00 bus');
    await expect(page.getByText('Her son had just qualified')).toHaveCount(0);

    // Puzzle 2 carries a warning, shown on the card above the setup.
    await page.getByRole('button', { name: 'Next puzzle' }).click();
    await expect(card.getByTestId('situation-content-warnings')).toHaveText(
      'Content warnings: animal in danger'
    );
  });
});
