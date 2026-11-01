import { test, expect, type Page } from '@playwright/test';

/**
 * Case files (#34, #35): the home grid tile and deck list, and the
 * cooperative case board played end to end on a 375px phone with the
 * `sample-en-case` fixture (case-001 "The Missing Chess Trophy").
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

  test('the evidence image is served from the deck asset folder', async ({ request }) => {
    const res = await request.get('/decks/assets/sample-en-case/receipt.svg');
    expect(res.ok()).toBe(true);
    expect(await res.text()).toContain('SILVERLINE ENGRAVING');
  });
});

async function openDrawer(page: Page) {
  await page.getByTestId('case-evidence-open').click();
  await expect(page.getByTestId('case-evidence-drawer')).toBeVisible();
}

async function closeViewer(page: Page) {
  await page.getByTestId('case-viewer-close').click();
  await expect(page.getByTestId('case-viewer')).toHaveCount(0);
}

/** Horizontal swipe with the mouse (pointer events) across the viewer body. */
async function swipe(page: Page, direction: 'left' | 'right') {
  const box = (await page.getByTestId('case-viewer-body').boundingBox())!;
  const y = box.y + Math.min(box.height / 2, 200);
  const [from, to] =
    direction === 'left'
      ? [box.x + box.width - 40, box.x + 40]
      : [box.x + 40, box.x + box.width - 40];
  await page.mouse.move(from, y);
  await page.mouse.down();
  await page.mouse.move((from + to) / 2, y, { steps: 4 });
  await page.mouse.move(to, y, { steps: 4 });
  await page.mouse.up();
}

test.describe('case board (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('open evidence → unlock → note → reload → accuse → walkthrough + score', async ({ page }) => {
    await page.goto('/play/sample-en-case');
    await page.getByRole('button', { name: /start game/i }).click();

    // Cover: content warnings before the briefing (F5); no spoilers.
    const cover = page.getByTestId('case-cover');
    await expect(cover.getByTestId('case-card')).toContainText('The Missing Chess Trophy');
    await expect(cover.getByTestId('case-content-warnings')).toContainText('theft');
    await expect(cover.getByTestId('case-contents')).toContainText('6 evidence items · 3 questions');
    await expect(page.getByTestId('case-briefing')).toHaveCount(0);
    await expect(page.getByText('Silverline Engraving')).toHaveCount(0);
    await page.getByRole('button', { name: 'Open the case file' }).click();

    // Board: briefing rendered from markdown.
    await expect(page.getByTestId('case-board')).toBeVisible();
    await expect(page.getByTestId('case-briefing')).toContainText('glass display case');

    // Drawer: locked items name what unlocks them (F12).
    await openDrawer(page);
    const receipt = page.getByTestId('case-evidence-item-receipt');
    await expect(receipt).toHaveAttribute('data-state', 'locked');
    await expect(receipt).toBeDisabled();
    await expect(receipt).toContainText("Open “Lena Brandt's call log, Friday” first");
    await expect(page.getByTestId('case-evidence-item-dentist-reply')).toContainText(
      "Open “Interview: Lena Brandt (chess coach)” and “Receipt found in the staff room” first"
    );

    // Open a document: markdown with bold text.
    await page.getByTestId('case-evidence-item-head-note').click();
    const viewer = page.getByTestId('case-viewer');
    await expect(viewer.getByTestId('case-viewer-title')).toHaveText("Head teacher's note");
    await expect(viewer.getByTestId('case-viewer-text').locator('strong').first()).toHaveText('15:00');
    await closeViewer(page);

    // Open the phone log (a markdown table); it unlocks the receipt.
    await openDrawer(page);
    await page.getByTestId('case-evidence-item-phone-lena').click();
    await expect(viewer.getByRole('table')).toContainText('Silverline Engraving');
    await expect(viewer.getByTestId('case-viewer-counter')).toHaveText('2 / 2');

    // Swipe between opened items (F13).
    await swipe(page, 'right');
    await expect(viewer.getByTestId('case-viewer-title')).toHaveText("Head teacher's note");
    await swipe(page, 'left');
    await expect(viewer.getByTestId('case-viewer-title')).toHaveText("Lena Brandt's call log, Friday");
    await closeViewer(page);

    await openDrawer(page);
    await expect(receipt).toHaveAttribute('data-state', 'unlocked');
    await receipt.click();
    const image = viewer.getByTestId('case-viewer-image');
    await expect(image.locator('img')).toHaveAttribute(
      'src',
      /\/decks\/assets\/sample-en-case\/receipt\.svg$/
    );
    await expect(image).toHaveAttribute('data-zoomed', 'false');
    await viewer.getByRole('button', { name: 'Zoom in' }).click();
    await expect(image).toHaveAttribute('data-zoomed', 'true');
    await viewer.getByRole('button', { name: 'Reset zoom' }).click();
    await expect(image).toHaveAttribute('data-zoomed', 'false');
    await closeViewer(page);

    // Notes in two tabs (F14).
    await page.getByTestId('case-notes-open').click();
    const notes = page.getByTestId('case-notes-sheet');
    await notes.getByTestId('case-notes-input').fill('Lena lied about the dentist');
    await notes.getByTestId('case-notes-tab-timeline').click();
    await notes.getByTestId('case-notes-input').fill('16:05 call to the engraver');
    await page.keyboard.press('Escape');
    await expect(notes).toHaveCount(0);

    // Reload: opened evidence and notes survive.
    await page.reload();
    await expect(page.getByTestId('case-board')).toBeVisible();
    for (const id of ['head-note', 'phone-lena', 'receipt']) {
      await expect(page.getByTestId(`case-opened-${id}`)).toBeVisible();
    }
    await page.getByTestId('case-notes-open').click();
    await expect(notes.getByTestId('case-notes-input')).toHaveValue('Lena lied about the dentist');
    await notes.getByTestId('case-notes-tab-timeline').click();
    await expect(notes.getByTestId('case-notes-input')).toHaveValue('16:05 call to the engraver');
    await page.keyboard.press('Escape');

    // Accusation (F16): one exact, one variant, one for the group to mark.
    await page.getByTestId('case-accuse-open').click();
    const form = page.getByTestId('case-accusation-sheet');
    await form.getByTestId('case-answer-who').fill('lena');
    await form.getByTestId('case-answer-why').fill('She wanted the new champions engraved on it');
    await form.getByTestId('case-answer-where').fill('At Silverline Engraving!');
    await form.getByRole('button', { name: 'Submit the accusation' }).click();

    const review = page.getByTestId('case-review');
    await expect(review.getByTestId('case-review-item-who')).toHaveAttribute('data-match', 'variant');
    await expect(review.getByTestId('case-review-item-where')).toHaveAttribute('data-match', 'exact');
    await expect(review.getByTestId('case-review-item-why')).toHaveAttribute('data-match', 'unmatched');
    const reveal = page.getByRole('button', { name: 'Reveal the walkthrough' });
    await expect(reveal).toBeDisabled();
    await review.getByTestId('case-mark-correct-why').click();
    await expect(review.getByTestId('case-mark-correct-why')).toHaveAttribute('aria-pressed', 'true');
    await expect(reveal).toBeEnabled();
    await reveal.click();

    // Walkthrough and team score (F17).
    const closed = page.getByTestId('case-closed');
    await expect(closed.getByRole('heading', { name: 'Case solved!' })).toBeVisible();
    await expect(closed.getByTestId('case-score')).toHaveText('5 / 5 points');
    await expect(closed.getByTestId('case-walkthrough')).toContainText('Silverline Engraving');
    await expect(closed.getByTestId('case-result-why')).toHaveAttribute('data-correct', 'true');

    // Recorded in the play history (#28).
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('kea.history') ?? 'null'));
    expect(history?.data).toHaveLength(1);
    expect(history.data[0]).toMatchObject({
      deckId: 'sample-en-case',
      cardId: 'case-001',
      mode: 'coop',
      outcome: 'solved',
      score: 5,
      questions: 3,
    });

    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page.getByText('All cases closed!')).toBeVisible();
  });

  test('a wrong group mark scores partial points', async ({ page }) => {
    await page.goto('/play/sample-en-case');
    await page.getByRole('button', { name: /start game/i }).click();
    await page.getByRole('button', { name: 'Open the case file' }).click();
    await page.getByTestId('case-accuse-open').click();
    const form = page.getByTestId('case-accusation-sheet');
    await form.getByTestId('case-answer-who').fill('Coach Lena Brandt');
    await form.getByTestId('case-answer-why').fill('revenge');
    await form.getByRole('button', { name: 'Submit the accusation' }).click();

    const review = page.getByTestId('case-review');
    await expect(review.getByTestId('case-review-item-where')).toHaveAttribute('data-match', 'blank');
    await review.getByTestId('case-mark-incorrect-why').click();
    await page.getByRole('button', { name: 'Reveal the walkthrough' }).click();

    const closed = page.getByTestId('case-closed');
    await expect(closed.getByRole('heading', { name: 'Case closed' })).toBeVisible();
    await expect(closed.getByTestId('case-score')).toHaveText('2 / 5 points');
    await expect(closed.getByTestId('case-result-why')).toHaveAttribute('data-correct', 'false');
  });
});
