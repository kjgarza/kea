import { test, expect } from '@playwright/test';

/**
 * Content sources (#58): the fixture decks built by the source pipeline
 * (scripts/fixtures/sources → normalise → import) show their licence and
 * credits. Both decks are fixtures (not recommended); their content is
 * original text written for the tests, with example.org links.
 */

test.describe('content credits (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('a CC BY-SA puzzle deck shows its licence on the deck page and the post credit on the end screen', async ({ page }) => {
    await page.goto('/play/sample-cc-by-sa-en-situation');
    const credits = page.getByTestId('deck-credits');
    await expect(credits).toContainText('Licence: CC BY-SA 4.0');
    await expect(credits.getByTestId('deck-credits-license')).toHaveAttribute(
      'href',
      'https://creativecommons.org/licenses/by-sa/4.0/'
    );
    await expect(credits.getByTestId('deck-credits-attribution')).toContainText('Puzzling Stack Exchange');

    await page.getByRole('button', { name: /start game/i }).click();
    await page.getByTestId('situation-pick-puzzling-1001').click();
    await expect(page.getByTestId('situation-setup-text')).toContainText('Mara climbed her tower');
    // The credit sits with the solution, never on the setup screen.
    await expect(page.getByTestId('source-credit')).toHaveCount(0);

    await page.getByRole('button', { name: 'Keeper: show solution' }).click();
    await page.getByRole('button', { name: "I'm the keeper, show it" }).click();
    await page.getByRole('button', { name: 'Solved' }).click();

    const end = page.getByTestId('situation-end');
    await expect(end.getByTestId('situation-end-solution')).toContainText('bonfire');
    const credit = end.getByTestId('source-credit');
    await expect(credit.getByTestId('source-credit-author')).toHaveText(
      'By Fixture Asker (question), Fixture Solver (answer)'
    );
    await expect(credit.getByTestId('source-credit-link')).toHaveAttribute(
      'href',
      'https://example.org/kea-fixture/questions/1001/the-lighthouse-that-stayed-dark'
    );
    await expect(credit.getByTestId('source-credit-license')).toHaveText('CC BY-SA 4.0');
    await expect(credit.getByTestId('source-credit-modified')).toHaveText('Adapted by Kea');
  });

  test('a case adapted from a story credits it on the deck page and under the walkthrough', async ({ page }) => {
    await page.goto('/play/sample-public-domain-en-case');
    const credits = page.getByTestId('deck-credits');
    await expect(credits.getByTestId('deck-credits-attribution')).toHaveText(
      'Adapted from “The Brass Key” by Kea test fixture (CC0 1.0).'
    );

    await page.getByRole('button', { name: /start game/i }).click();
    await expect(page.getByTestId('case-cover').getByTestId('case-card')).toContainText('The Brass Key');
    await page.getByRole('button', { name: 'Open the case file' }).click();

    await page.getByTestId('case-accuse-open').click();
    const form = page.getByTestId('case-accusation-sheet');
    await form.getByTestId('case-answer-who').fill('Mrs Pell');
    await form.getByTestId('case-answer-how').fill('through the transom');
    await form.getByTestId('case-answer-when').fill('11:40');
    await form.getByRole('button', { name: 'Submit the accusation' }).click();
    await page.getByRole('button', { name: 'Reveal the walkthrough' }).click();

    const closed = page.getByTestId('case-closed');
    await expect(closed.getByTestId('case-score')).toHaveText('6 / 6 points');
    const credit = closed.getByTestId('source-credit');
    await expect(credit.getByTestId('source-credit-author')).toHaveText('By Kea test fixture');
    await expect(credit.getByTestId('source-credit-link')).toHaveAttribute(
      'href',
      'https://example.org/kea-fixture/stories/the-brass-key'
    );
    await expect(credit.getByTestId('source-credit-license')).toHaveText('CC0 1.0');
  });

  test('credits are translated in Spanish chrome', async ({ page }) => {
    await page.goto('/play/sample-cc-by-sa-en-situation');
    await page.getByTestId('locale-switch').click();
    await expect(page.getByRole('button', { name: /^empezar partida$/i })).toBeVisible();
    await expect(page.getByTestId('deck-credits')).toContainText('Créditos');
    await expect(page.getByTestId('deck-credits')).toContainText('Licencia: CC BY-SA 4.0');
  });

  test('Kea decks without a licence show no credits', async ({ page }) => {
    await page.goto('/play/sample-en-situation');
    await expect(page.getByRole('button', { name: /start game/i })).toBeVisible();
    await expect(page.getByTestId('deck-credits')).toHaveCount(0);
  });
});
