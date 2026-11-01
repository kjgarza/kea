import { test, expect } from '@playwright/test';

/**
 * Case files (#34): the home grid has a Case Files tile whose deck list shows
 * the sample case deck with its content warnings; the placeholder play screen
 * shows the briefing (the case board arrives with #35).
 */

test.describe('case files', () => {
  test('Case Files tile lists the sample case deck with its warnings', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /Case Files/ }).click();
    await expect(page).toHaveURL(/\/game\/case\/?$/);
    await expect(page.getByRole('heading', { name: 'Case Files', level: 1 })).toBeVisible();

    const deckCard = page.getByRole('link', { name: /Sample Case Files/ });
    await expect(deckCard).toBeVisible();
    await expect(deckCard.getByTestId('deck-content-warnings')).toHaveText(
      'Content warnings: theft'
    );
  });

  test('opening the sample case shows the briefing, not the walkthrough', async ({ page }) => {
    await page.goto('/play/sample-en-case');
    await page.getByRole('button', { name: /start game/i }).click();

    const card = page.getByTestId('case-card');
    await expect(card).toBeVisible();
    await expect(card).toContainText('The Missing Chess Trophy');
    await expect(card.getByTestId('case-briefing')).toContainText('glass display case');
    await expect(card.getByTestId('case-content-warnings')).toHaveText('Content warnings: theft');
    await expect(card.getByTestId('case-contents')).toHaveText('6 evidence items · 3 questions');
    await expect(page.getByText('Silverline Engraving')).toHaveCount(0);

    await page.getByRole('button', { name: 'Next case' }).click();
    await expect(page.getByText('All cases closed!')).toBeVisible();
  });

  test('the evidence image is served from the deck asset folder', async ({ request }) => {
    const res = await request.get('/decks/assets/sample-en-case/receipt.svg');
    expect(res.ok()).toBe(true);
    expect(await res.text()).toContain('SILVERLINE ENGRAVING');
  });
});
