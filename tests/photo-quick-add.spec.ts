import { test, expect, type Page, type Route } from '@playwright/test';
import { parsePhotoOutput, photoResponse } from '../src/lib/ai/photo';

/**
 * Photo quick-add (#38) at 375px with POST /author/photo mocked. AI-on tests
 * need NEXT_PUBLIC_KEA_API_URL=https://kea-worker.test exported for BOTH the
 * dev server and Playwright (see tests/ai-settings.spec.ts).
 */

test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

const API_URL = process.env.NEXT_PUBLIC_KEA_API_URL?.replace(/\/$/, '');
const CORS = { 'access-control-allow-origin': '*' };
const FRONT = 'tests/fixtures/puzzle-card-front.jpg';

function transcription(pack: string) {
  const parsed = parsePhotoOutput({
    readable: true,
    title: 'The Cold Coffee',
    setup: 'A man buys a hot coffee, pours it into the snow outside the cafe, and smiles.',
    solution: 'His windscreen was frozen and he had no scraper, so he used the hot coffee to melt the ice and drive to work.',
    keyFacts: ['His windscreen was frozen.', 'He had no ice scraper.', 'The hot coffee melted the ice.'],
    hints: ['He never meant to drink it.', 'Think about what is parked outside.'],
    difficulty: 'easy',
    contentWarnings: [],
    ref: '',
  });
  if (!parsed.ok) throw new Error('fixture');
  return photoResponse(parsed.puzzle, { pack, lang: 'en' });
}

type Reply = { json: unknown } | { status: number; code: string };

async function mockPhoto(page: Page, replies: Reply[]) {
  const bodies: Record<string, unknown>[] = [];
  await page.route(`${API_URL}/author/photo`, async (route: Route) => {
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: { ...CORS, 'access-control-allow-headers': 'content-type, x-kea-passcode', 'access-control-allow-methods': 'POST, OPTIONS' },
      });
      return;
    }
    bodies.push(route.request().postDataJSON());
    const reply = replies.shift() ?? { status: 502, code: 'upstream_error' };
    if ('status' in reply) {
      await route.fulfill({ status: reply.status, json: { error: { code: reply.code, message: 'mock' } }, headers: CORS });
    } else {
      await route.fulfill({ json: reply.json, headers: CORS });
    }
  });
  return bodies;
}

async function seedPasscode(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('kea.passcode', JSON.stringify({ v: 1, data: 'open-sesame' }));
  });
}

async function addFrontPhoto(page: Page) {
  await page.getByTestId('add-photo-input-front').setInputFiles(FRONT);
  await expect(page.getByTestId('add-photo-preview-front')).toBeVisible();
  await expect(page.getByTestId('add-photo-front')).toHaveAttribute('data-status', 'ready');
}

test('without the Worker the page explains it is unavailable and settings has no link', async ({ page }) => {
  test.skip(!!API_URL, 'only meaningful when AI is not configured');
  await page.goto('/add');
  await expect(page.getByTestId('add-unavailable')).toBeVisible();
  await expect(page.getByTestId('add-read')).toHaveCount(0);
  await page.getByTestId('settings-open').click();
  await expect(page.getByTestId('settings-sheet')).toBeVisible();
  await expect(page.getByTestId('settings-add-puzzle')).toHaveCount(0);
});

test.describe('with the Worker', () => {
  test.skip(!API_URL, 'set NEXT_PUBLIC_KEA_API_URL for the dev server and Playwright');

  test('settings links to /add', async ({ page }) => {
    await page.goto('/history');
    await page.getByTestId('settings-open').click();
    await page.getByTestId('settings-add-puzzle').click();
    await expect(page).toHaveURL(/\/add\/?$/);
    await expect(page.getByRole('heading', { name: 'Add a puzzle from a photo' })).toBeVisible();
  });

  test('photo → YAML preview → edit → validation error → GitHub link', async ({ page }) => {
    await seedPasscode(page);
    const response = transcription('winter-puzzles');
    const bodies = await mockPhoto(page, [{ json: response }]);
    await page.goto('/add');

    // Both file inputs accept images; the camera one asks for the rear camera.
    const camera = page.getByTestId('add-photo-camera-front');
    await expect(camera).toHaveAttribute('accept', 'image/*');
    await expect(camera).toHaveAttribute('capture', 'environment');

    await expect(page.getByTestId('add-read')).toBeDisabled();
    await addFrontPhoto(page);
    await page.getByTestId('add-pack-input').fill('winter-puzzles');
    await page.getByTestId('add-read').click();

    const yaml = page.getByTestId('add-yaml');
    await expect(yaml).toHaveValue(response.yaml);
    expect(bodies).toHaveLength(1);
    const body = bodies[0] as { images: { mediaType: string; data: string }[]; lang: string; pack: string };
    expect(body.lang).toBe('en');
    expect(body.pack).toBe('winter-puzzles');
    expect(body.images).toHaveLength(1);
    expect(body.images[0].mediaType).toBe('image/jpeg');
    expect(body.images[0].data.startsWith('/9j/')).toBe(true); // re-encoded JPEG, no data: prefix

    await expect(page.getByTestId('add-validation')).toHaveAttribute('data-valid', 'true');
    await expect(page.getByTestId('add-file-name')).toContainText('decks/puzzles/winter-puzzles-en.yaml');

    const link = page.getByTestId('add-github-link');
    const href = new URL((await link.getAttribute('href'))!);
    expect(href.origin + href.pathname).toBe('https://github.com/kjgarza/kea/new/main');
    expect(href.searchParams.get('filename')).toBe('decks/puzzles/winter-puzzles-en.yaml');
    expect(href.searchParams.get('value')).toBe(response.yaml);

    // Break it: no hints.
    const broken = response.yaml.replace(/hints:\n(?:\s+- .*\n)+/, 'hints: []\n');
    await yaml.fill(broken);
    await expect(page.getByTestId('add-validation')).toHaveAttribute('data-valid', 'false');
    const hintsError = page.locator('[data-testid="add-error-field"][data-field="hints"]');
    await expect(hintsError).toContainText("'hints' has 0 items");
    await expect(page.getByTestId('add-github-link')).toHaveCount(0);

    // Fix it with an edited title: the link carries the edited YAML.
    const edited = response.yaml.replace('title: The Cold Coffee', 'title: Coffee on Ice');
    await yaml.fill(edited);
    await expect(page.getByTestId('add-validation')).toHaveAttribute('data-valid', 'true');
    const fixed = new URL((await page.getByTestId('add-github-link').getAttribute('href'))!);
    expect(fixed.searchParams.get('value')).toBe(edited);
  });

  test('an existing pack file is appended to instead', async ({ page }) => {
    await seedPasscode(page);
    await mockPhoto(page, [{ json: transcription('kitchen-table') }]);
    await page.goto('/add');
    await addFrontPhoto(page);
    await page.getByTestId('add-pack-input').fill('kitchen-table');
    await page.getByTestId('add-read').click();
    await expect(page.getByTestId('add-pack-exists')).toContainText('decks/puzzles/kitchen-table-en.yaml');
    await expect(page.getByTestId('add-github-link')).toHaveCount(0);
    await expect(page.getByTestId('add-github-edit')).toHaveAttribute(
      'href',
      'https://github.com/kjgarza/kea/edit/main/decks/puzzles/kitchen-table-en.yaml'
    );
    await expect(page.getByTestId('add-copy-puzzle')).toBeVisible();
  });

  test('an unreadable photo shows a retryable error', async ({ page }) => {
    await seedPasscode(page);
    const response = transcription('quick-add');
    await mockPhoto(page, [{ status: 422, code: 'unreadable_image' }, { json: response }]);
    await page.goto('/add');
    await addFrontPhoto(page);
    await page.getByTestId('add-read').click();
    await expect(page.getByTestId('add-error')).toContainText('No readable puzzle card');
    await page.getByTestId('add-error').getByRole('button').click();
    await expect(page.getByTestId('add-yaml')).toHaveValue(response.yaml);
  });

  test('without a passcode the page asks for it and cannot send', async ({ page }) => {
    await page.goto('/add');
    await expect(page.getByTestId('add-needs-passcode')).toBeVisible();
    await addFrontPhoto(page);
    await expect(page.getByTestId('add-read')).toBeDisabled();
  });
});
