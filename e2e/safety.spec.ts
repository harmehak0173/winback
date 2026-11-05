import { expect, test } from './fixtures';

/**
 * F02 panic and F03 slip: the safety layer, free forever and reachable from
 * Home in one tap. A committed person, ten days in, end-of-week paywall
 * already shown (so it does not cover Home).
 */
test.beforeEach(async ({ seed }) => {
  await seed({ trialPromptShown: true });
});

const urgeHeadings = (page: import('@playwright/test').Page) =>
  page.getByRole('heading').filter({ hasText: 'The urge is here.' });

test('F02-H1 panic opens from Home and closes back to it', async ({ page, axe }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Feel an urge? Get through it' }).click();
  await expect(urgeHeadings(page)).toHaveCount(1);
  await axe('panic');
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('DAYS CLEAN')).toBeVisible();
});

test('F02-E1 a double tap opens one panic screen, not two', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Feel an urge? Get through it' }).dblclick();
  await expect(urgeHeadings(page)).toHaveCount(1);
});

test('F02-H2 "About to switch off a block?" logs the moment once, on a tap', async ({ page }) => {
  await page.goto('/panic');
  await page.getByRole('button', { name: 'About to switch off a block?' }).click();
  await expect(page.getByText('That is the urge asking, not you deciding.', { exact: false })).toBeVisible();
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('winback.triggerLog') ?? '[]'));
  expect(log.filter((e: { label: string }) => e.label === 'Wanted to undo a block')).toHaveLength(1);
});

test('F02-H4 your own reasons show on the panic screen, in your words', async ({ page, axe }) => {
  await page.goto('/you');
  await page.getByLabel('Reason 1 of 3').fill('My daughter');
  await page.getByLabel('Reason 2 of 3').fill('  Getting   the house back ');
  await page.getByRole('button', { name: 'Save my reasons' }).click();
  await expect(page.getByRole('button', { name: 'Update my reasons' })).toBeVisible();
  // Kept on this phone only (the web build's stand-in for secure storage).
  const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('winback.reasons') ?? '[]'));
  expect(kept).toEqual(['My daughter', 'Getting the house back']);
  await page.goto('/panic');
  await expect(page.getByText('My daughter', { exact: true })).toBeVisible();
  await expect(page.getByText('Getting the house back', { exact: true })).toBeVisible();
  await axe('panic-own-reasons');
});

test('F02-N1 a link opened straight on the block card logs nothing', async ({ page }) => {
  await page.goto('/panic?moment=block');
  await expect(page.getByText('That is the urge asking, not you deciding.', { exact: false })).toBeVisible();
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem('winback.triggerLog') ?? '[]'));
  expect(log).toHaveLength(0);
});

test('F02-H3 the panic screen links to the helpline directory', async ({ page }) => {
  await page.goto('/panic');
  // No phone numbers ship: every region gets the directory link.
  await expect(page.getByText('Find a helpline in your country').first()).toBeVisible();
});

test('F03-H1 a slip can reset the count, and the record keeps the days', async ({ page, axe }) => {
  await page.goto('/slip');
  await expect(page.getByRole('heading').first()).toBeVisible();
  await axe('slip');
  await page.getByRole('button', { name: 'Reset to day 0. Count starts today.' }).click();
  await expect(page.getByRole('button', { name: 'Done' })).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('winback:v1') ?? '{}'));
  // The new run starts now; the ten days are kept as the best streak and the
  // money they saved is banked. (Whether the reset reaches the server is a
  // unit-level concern: this build has no backend, so every sync succeeds.)
  expect(Date.now() - Date.parse(stored.quitDate)).toBeLessThan(60_000);
  expect(stored.bestStreakDays).toBeGreaterThanOrEqual(10);
  expect(stored.moneyKeptBefore).toBeGreaterThan(0);
});
