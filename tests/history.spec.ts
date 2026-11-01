import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Play history, groups, hide-played and random pick (#28), on a 375px phone
 * with the real `sample-en-situation` deck (sit-001 has no warnings; sit-002
 * and sit-003 do).
 */

test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

async function startDeck(page: Page) {
  await page.goto('/play/sample-en-situation');
  await page.getByRole('button', { name: /start game/i }).click();
  await expect(page.getByTestId('situation-picker')).toBeVisible();
}

/** Play sit-001 in human-keeper mode and give up after one question. */
async function finishFirstPuzzle(page: Page) {
  await page.getByTestId('situation-pick-sit-001').click();
  await page.getByRole('button', { name: 'Keeper: show solution' }).click();
  await page.getByRole('button', { name: "I'm the keeper, show it" }).click();
  await page.getByRole('button', { name: '+1 question' }).click();
  await page.getByRole('button', { name: 'Give up' }).click();
  await expect(page.getByTestId('situation-end')).toBeVisible();
}

async function restartDeck(page: Page) {
  await page.getByRole('button', { name: 'Restart', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Restart' }).click();
  await expect(page.getByTestId('situation-picker')).toBeVisible();
}

test.describe('play history (#28)', () => {
  test('a puzzle finished with a group is hidden for that group when hide-played is on', async ({ page }) => {
    await startDeck(page);
    await finishFirstPuzzle(page);

    // First finished puzzle: the home-screen prompt shows once.
    await expect(page.getByTestId('install-prompt')).toBeVisible();
    await page.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByTestId('install-prompt')).toHaveCount(0);

    // Play the deck again from the start: sit-001 is marked as played.
    await restartDeck(page);
    const pick1 = page.getByTestId('situation-pick-sit-001');
    await expect(pick1.getByTestId('situation-played-badge')).toHaveText('Played');

    await page.getByTestId('hide-played').click();
    await expect(pick1).toHaveCount(0);
    await expect(page.getByTestId('situation-pick-sit-002')).toBeVisible();
    await expect(page.getByTestId('situation-hidden-count')).toHaveText('Played and hidden: 1');

    // Another group has not played it.
    await page.getByRole('button', { name: 'New group' }).click();
    await page.getByRole('textbox', { name: 'Group name' }).fill('Berlin crew');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('radio', { name: 'Berlin crew' })).toHaveAttribute('aria-checked', 'true');
    await expect(pick1).toBeVisible();
    await expect(pick1.getByTestId('situation-played-badge')).toHaveCount(0);

    // Rename keeps the group (and its history) intact.
    await page.getByRole('button', { name: 'Rename group' }).click();
    await page.getByRole('textbox', { name: 'Group name' }).fill('Partner');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('radio', { name: 'Partner' })).toBeVisible();

    // Back to the first group: still hidden, also after a reload.
    await page.getByRole('radio', { name: 'My group' }).click();
    await expect(pick1).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('situation-picker')).toBeVisible();
    await expect(page.getByRole('radio', { name: 'My group' })).toHaveAttribute('aria-checked', 'true');
    await expect(pick1).toHaveCount(0);
  });

  test('history survives a reload and the home-screen prompt never comes back', async ({ page }) => {
    await startDeck(page);
    await finishFirstPuzzle(page);
    await expect(page.getByTestId('install-prompt')).toBeVisible();

    await page.goto('/history');
    const item = page.getByTestId('history-item');
    await expect(item).toHaveCount(1);
    await expect(item).toContainText("The Bus She Didn't Take");
    await expect(item).toContainText('My group');
    await expect(item).toContainText('Gave up');
    await expect(item).toContainText('Questions: 1');
    await expect(item).toContainText('Hints: 0');

    await page.reload();
    await expect(page.getByTestId('history-item')).toHaveCount(1);

    // Stored through the shared store under kea.history.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('kea.history') ?? 'null'));
    expect(stored.v).toBe(1);
    expect(stored.data[0]).toMatchObject({
      deckId: 'sample-en-situation',
      cardId: 'sit-001',
      group: 'default',
      outcome: 'gave_up',
      questions: 1,
    });

    // Persistence was requested once; settings shows its status.
    await page.getByTestId('settings-open').click();
    await expect(page.getByTestId('settings-persistence')).not.toHaveAttribute('data-state', 'notAsked');
    await page.keyboard.press('Escape');

    // A second finished puzzle does not show the prompt again.
    await page.goto('/play/sample-en-situation');
    await expect(page.getByTestId('situation-end')).toBeVisible(); // resumed
    await restartDeck(page);
    await finishFirstPuzzle(page);
    await expect(page.getByTestId('install-prompt')).toHaveCount(0);
  });

  test('history round-trips through export and import', async ({ page }) => {
    await startDeck(page);
    await finishFirstPuzzle(page);
    await page.goto('/history');
    await expect(page.getByTestId('history-item')).toHaveCount(1);

    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export backup' }).click();
    const file = await (await download).path();
    const backup = JSON.parse(readFileSync(file, 'utf8'));
    expect(backup.app).toBe('kea');
    expect(backup.data.history.data).toHaveLength(1);

    // A "new phone": nothing stored.
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await expect(page.getByTestId('history-empty')).toBeVisible();

    await page.getByTestId('backup-import-input').setInputFiles(file);
    await expect(page.getByRole('status')).toHaveText('Backup imported. New finished puzzles: 1.');
    await expect(page.getByTestId('history-item')).toHaveCount(1);
    await page.reload();
    await expect(page.getByTestId('history-item')).toContainText("The Bus She Didn't Take");
  });

  test('random pick honours the filters', async ({ page }) => {
    await startDeck(page);
    await finishFirstPuzzle(page);
    await restartDeck(page);

    await page.getByRole('button', { name: 'Random puzzle' }).click();
    const dialog = page.getByTestId('random-pick-dialog');
    // Defaults: unplayed only. sit-001 is played; sit-002/003 have warnings.
    await dialog.getByRole('switch', { name: 'Skip puzzles with content warnings' }).click();
    await expect(page.getByTestId('random-pick-matches')).toHaveText('No puzzle matches these filters.');
    await expect(dialog.getByRole('button', { name: 'Pick one' })).toBeDisabled();

    await dialog.getByRole('switch', { name: 'Skip puzzles with content warnings' }).click();
    await expect(page.getByTestId('random-pick-matches')).toHaveText('Matching puzzles: 2');
    await dialog.getByRole('button', { name: 'Pick one' }).click();
    // Either unplayed puzzle; both have warnings, so the interstitial shows.
    await expect(page.getByTestId('situation-warning-screen')).toBeVisible();
  });
});
