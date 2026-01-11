import { test, expect } from '@playwright/test';

test.describe('Card View Spacing', () => {
  test('action buttons should be visible without scrolling on desktop', async ({ page }) => {
    // Navigate to a play page
    await page.goto('/play/animals-en-charades');

    // Click "Start Game" button if present
    const startButton = page.getByRole('button', { name: /start game/i });
    if (await startButton.isVisible()) {
      await startButton.click();
    }

    // Wait for the play screen to load
    await page.waitForSelector('main', { state: 'visible' });

    // Check that action buttons are visible
    const passButton = page.getByRole('button', { name: /pass/i });
    const nextButton = page.getByRole('button', { name: /next/i });

    await expect(passButton).toBeVisible();
    await expect(nextButton).toBeVisible();

    // Check that buttons are in viewport without scrolling
    const passBox = await passButton.boundingBox();
    const nextBox = await nextButton.boundingBox();
    const viewportSize = page.viewportSize();

    expect(passBox).not.toBeNull();
    expect(nextBox).not.toBeNull();
    expect(viewportSize).not.toBeNull();

    if (passBox && nextBox && viewportSize) {
      // Buttons should be fully visible within viewport
      expect(passBox.y + passBox.height).toBeLessThanOrEqual(viewportSize.height);
      expect(nextBox.y + nextBox.height).toBeLessThanOrEqual(viewportSize.height);

      // Buttons should be at the bottom of the screen (not requiring scroll)
      expect(passBox.y).toBeGreaterThan(0);
      expect(nextBox.y).toBeGreaterThan(0);
    }

    // Verify no scroll is needed
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });

  test('action buttons should be visible without scrolling on mobile', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 }); // iPhone SE

    // Navigate to a play page
    await page.goto('/play/animals-en-charades');

    // Click "Start Game" button if present
    const startButton = page.getByRole('button', { name: /start game/i });
    if (await startButton.isVisible()) {
      await startButton.click();
    }

    // Wait for the play screen to load
    await page.waitForSelector('main', { state: 'visible' });

    // Check that action buttons are visible
    const passButton = page.getByRole('button', { name: /pass/i });
    const nextButton = page.getByRole('button', { name: /next/i });

    await expect(passButton).toBeVisible();
    await expect(nextButton).toBeVisible();

    // Check that buttons are in viewport without scrolling
    const passBox = await passButton.boundingBox();
    const nextBox = await nextButton.boundingBox();
    const viewportSize = page.viewportSize();

    expect(passBox).not.toBeNull();
    expect(nextBox).not.toBeNull();
    expect(viewportSize).not.toBeNull();

    if (passBox && nextBox && viewportSize) {
      // Buttons should be fully visible within viewport
      expect(passBox.y + passBox.height).toBeLessThanOrEqual(viewportSize.height);
      expect(nextBox.y + nextBox.height).toBeLessThanOrEqual(viewportSize.height);

      // Buttons should be at the bottom of the screen
      expect(passBox.y).toBeGreaterThan(0);
      expect(nextBox.y).toBeGreaterThan(0);
    }

    // Verify no scroll is needed
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBe(0);
  });

  test('card should fit within viewport on various screen sizes', async ({ page }) => {
    const screenSizes = [
      { width: 375, height: 667, name: 'iPhone SE' },
      { width: 390, height: 844, name: 'iPhone 12' },
      { width: 393, height: 851, name: 'Pixel 5' },
      { width: 1280, height: 720, name: 'Desktop' },
    ];

    for (const size of screenSizes) {
      await page.setViewportSize({ width: size.width, height: size.height });

      await page.goto('/play/animals-en-charades');

      // Click "Start Game" button if present
      const startButton = page.getByRole('button', { name: /start game/i });
      if (await startButton.isVisible()) {
        await startButton.click();
      }

      await page.waitForSelector('main', { state: 'visible' });

      // Get action buttons
      const actionBar = page.locator('div').filter({ has: page.getByRole('button', { name: /pass/i }) }).first();
      const actionBarBox = await actionBar.boundingBox();

      // Action bar should be visible
      expect(actionBarBox).not.toBeNull();

      if (actionBarBox) {
        // Action bar should be within viewport
        expect(actionBarBox.y + actionBarBox.height).toBeLessThanOrEqual(size.height);
        console.log(`✓ ${size.name} (${size.width}x${size.height}): Action bar visible at y=${actionBarBox.y}`);
      }
    }
  });
});
