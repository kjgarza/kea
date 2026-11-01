import { test, expect } from '@playwright/test';

// The AI Worker URL is inlined at build time. Default runs have it unset; run
// with NEXT_PUBLIC_KEA_API_URL=https://kea-worker.test (dev server AND
// Playwright) to exercise the passcode flow against a mocked Worker.
const API_URL = process.env.NEXT_PUBLIC_KEA_API_URL;

test.describe('AI settings', () => {
  test('without a Worker URL the settings sheet has no passcode section', async ({ page }) => {
    test.skip(Boolean(API_URL), 'NEXT_PUBLIC_KEA_API_URL is set');
    await page.goto('/history');
    await page.getByTestId('settings-open').click();
    await expect(page.getByTestId('settings-sheet')).toBeVisible();
    await expect(page.getByTestId('settings-persistence')).toBeVisible();
    await expect(page.getByTestId('passcode-input')).toHaveCount(0);
  });

  test('with a Worker URL the passcode can be saved and checked', async ({ page }) => {
    test.skip(!API_URL, 'NEXT_PUBLIC_KEA_API_URL is not set');
    const seen: (string | null)[] = [];
    await page.route(`${API_URL!.replace(/\/$/, '')}/status`, async (route) => {
      const passcode = route.request().headers()['x-kea-passcode'] ?? null;
      seen.push(passcode);
      if (passcode === 'open-sesame') {
        await route.fulfill({
          json: { ok: true, remaining: 42, limit: 200 },
          headers: { 'access-control-allow-origin': '*' },
        });
      } else {
        await route.fulfill({
          status: 401,
          json: { error: { code: 'unauthorized', message: 'no' } },
          headers: { 'access-control-allow-origin': '*' },
        });
      }
    });

    await page.goto('/history');
    await page.getByTestId('settings-open').click();
    const input = page.getByTestId('passcode-input');
    await input.fill('wrong');
    await page.getByTestId('passcode-check').click();
    await expect(page.getByTestId('passcode-feedback')).toHaveText('That passcode was not accepted.');

    await input.fill('open-sesame');
    await page.getByTestId('passcode-check').click();
    await expect(page.getByTestId('passcode-feedback')).toHaveText('Passcode works. 42 requests left today.');
    await page.getByTestId('passcode-save').click();
    await expect(page.getByTestId('passcode-feedback')).toHaveText('Passcode saved.');
    expect(seen).toEqual(['wrong', 'open-sesame']);

    // Stored under kea.passcode, and survives a reload.
    const stored = await page.evaluate(() => localStorage.getItem('kea.passcode'));
    expect(stored).toContain('open-sesame');
    await page.reload();
    await page.getByTestId('settings-open').click();
    await expect(page.getByTestId('passcode-input')).toHaveValue('open-sesame');
    await page.getByTestId('passcode-remove').click();
    await expect(page.getByTestId('passcode-feedback')).toHaveText('Passcode removed.');
  });
});
