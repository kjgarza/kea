import { test, expect, type Page } from '@playwright/test';

/**
 * Seed case (#36): "The Halden Chronometer" (saltmarsh-bay-en-case) and its
 * Spanish deck (saltmarsh-bay-es-case). The English case is played to the
 * end by opening every evidence item through its unlock chains; the Spanish
 * deck shows Spanish chrome and its own localised assets.
 */

const EVIDENCE_COUNT = 12;

/** Open every evidence item, following unlock chains, until none is left. */
async function openAllEvidence(page: Page) {
  const drawer = page.getByTestId('case-evidence-drawer');
  for (let round = 0; round < EVIDENCE_COUNT; round++) {
    await page.getByTestId('case-evidence-open').click();
    await expect(drawer).toBeVisible();
    const next = drawer.locator('[data-testid^="case-evidence-item-"][data-state="unlocked"]').first();
    if ((await next.count()) === 0) {
      await page.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
      return;
    }
    await next.click();
    await expect(page.getByTestId('case-viewer')).toBeVisible();
    await page.getByTestId('case-viewer-close').click();
    await expect(page.getByTestId('case-viewer')).toHaveCount(0);
  }
}

test.describe('seed case (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('the English seed case is solvable by playing it: all evidence opens and the answers score in full', async ({ page }) => {
    await page.goto('/play/saltmarsh-bay-en-case');
    await page.getByRole('button', { name: /start game/i }).click();

    const cover = page.getByTestId('case-cover');
    await expect(cover.getByTestId('case-card')).toContainText('The Halden Chronometer');
    await expect(cover.getByTestId('case-contents')).toContainText(
      `${EVIDENCE_COUNT} evidence items · 5 questions`
    );
    await page.getByRole('button', { name: 'Open the case file' }).click();
    await expect(page.getByTestId('case-briefing')).toContainText('Halden chronometer');

    // Locked evidence names what unlocks it.
    await page.getByTestId('case-evidence-open').click();
    await expect(page.getByTestId('case-evidence-item-courier-booking')).toHaveAttribute('data-state', 'locked');
    await expect(page.getByTestId('case-evidence-item-courier-booking')).toContainText(
      'Open “Dr Lindqvist\'s work phone, call log” first'
    );
    await page.keyboard.press('Escape');

    await openAllEvidence(page);
    for (const id of [
      'condition-report', 'replica-plate', 'floor-plan', 'building-log', 'nina-interview',
      'cctv-note', 'felix-interview', 'concert-photo', 'lost-property', 'ruth-interview',
      'ruth-phone', 'courier-booking',
    ]) {
      await expect(page.getByTestId(`case-opened-${id}`)).toBeVisible();
    }

    // The map is served from the deck's asset folder.
    await page.getByTestId('case-opened-floor-plan').click();
    await expect(page.getByTestId('case-viewer-image').locator('img')).toHaveAttribute(
      'src',
      /\/decks\/assets\/saltmarsh-bay-en-case\/floor-plan\.svg$/
    );
    await page.getByTestId('case-viewer-close').click();

    // Answers a group would write from the evidence (exact or accepted variants).
    await page.getByTestId('case-accuse-open').click();
    const form = page.getByTestId('case-accusation-sheet');
    await form.getByTestId('case-answer-who').fill('Ruth Lindqvist');
    await form.getByTestId('case-answer-when').fill('Monday night');
    await form.getByTestId('case-answer-badge').fill('VOL-07');
    await form.getByTestId('case-answer-exit').fill('Through the loading dock');
    await form.getByTestId('case-answer-where').fill('Kessler Fine Instruments');
    await form.getByRole('button', { name: 'Submit the accusation' }).click();

    const review = page.getByTestId('case-review');
    for (const id of ['who', 'when', 'badge', 'exit', 'where']) {
      await expect(review.getByTestId(`case-review-item-${id}`)).toHaveAttribute('data-match', 'variant');
    }
    await page.getByRole('button', { name: 'Reveal the walkthrough' }).click();

    const closed = page.getByTestId('case-closed');
    await expect(closed.getByRole('heading', { name: 'Case solved!' })).toBeVisible();
    await expect(closed.getByTestId('case-score')).toHaveText('10 / 10 points');
    await expect(closed.getByTestId('case-walkthrough')).toContainText('courier-booking');
  });

  test('the Spanish seed case loads with Spanish chrome and Spanish assets', async ({ page }) => {
    await page.goto('/play/saltmarsh-bay-es-case');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await page.getByRole('button', { name: /^empezar partida$/i }).click();

    const cover = page.getByTestId('case-cover');
    await expect(cover.getByTestId('case-card')).toContainText('El cronómetro Halden');
    await expect(cover.getByTestId('case-contents')).toContainText(`${EVIDENCE_COUNT} pruebas · 5 preguntas`);
    await expect(cover.getByTestId('case-content-warnings')).toContainText('robo');
    await page.getByRole('button', { name: 'Abrir el expediente' }).click();

    await expect(page.getByTestId('case-briefing')).toContainText('cronómetro Halden');
    await expect(page.getByTestId('case-evidence-open')).toContainText('Pruebas');
    await page.getByTestId('case-evidence-open').click();
    await expect(page.getByTestId('case-evidence-item-cctv-note')).toContainText(
      'Abre primero “Entrevista: Nina Osei (vigilante nocturna)”'
    );
    await page.getByTestId('case-evidence-item-replica-plate').click();
    await expect(page.getByTestId('case-viewer-title')).toHaveText('Foto del objeto hallado en la vitrina');
    await expect(page.getByTestId('case-viewer-image').locator('img')).toHaveAttribute(
      'src',
      /\/decks\/assets\/saltmarsh-bay-es-case\/replica-plate\.svg$/
    );
    await page.getByTestId('case-viewer-close').click();

    await page.getByTestId('case-accuse-open').click();
    const form = page.getByTestId('case-accusation-sheet');
    await form.getByTestId('case-answer-who').fill('la directora');
    await form.getByTestId('case-answer-where').fill('Róterdam');
    await form.getByRole('button', { name: 'Enviar la acusación' }).click();
    const review = page.getByTestId('case-review');
    await expect(review.getByTestId('case-review-item-who')).toHaveAttribute('data-match', 'variant');
    await expect(review.getByTestId('case-review-item-where')).toHaveAttribute('data-match', 'variant');
    await expect(review.getByTestId('case-review-item-when')).toHaveAttribute('data-match', 'blank');
    await page.getByRole('button', { name: 'Revelar la resolución' }).click();
    await expect(page.getByTestId('case-closed').getByTestId('case-score')).toHaveText('6 / 10 puntos');
  });

  test('the Spanish assets are served', async ({ request }) => {
    const res = await request.get('/decks/assets/saltmarsh-bay-es-case/gazette-clipping.svg');
    expect(res.ok()).toBe(true);
    expect(await res.text()).toContain('Lunes, 21:20');
  });
});
