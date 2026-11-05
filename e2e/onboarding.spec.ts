import { expect, test } from './fixtures';

/**
 * F01: a new person, from Welcome to Home. On the web build the screen
 * reader check always answers yes, so every question waits for Continue,
 * which also exercises the screen-reader path of the quiz and interlude.
 */
test('F01-H1 a new person gets from Welcome to Home', async ({ page, axe }) => {
  await page.goto('/');
  const agree = page.getByRole('button', { name: 'Agree and start' });
  await expect(agree).toBeVisible();
  await axe('welcome');
  await agree.click();

  for (let q = 1; q <= 10; q++) {
    await expect(page.getByLabel(`Question ${q} of 10`).first()).toBeVisible();
    if (q === 1) await axe('quiz');
    // The first option of each question; multi-select questions need one too.
    await page.getByRole('radio').or(page.getByRole('checkbox')).first().click();
    await page.getByRole('button', { name: 'Continue' }).click();
  }

  // Interlude, then the three reveal screens.
  for (const screen of ['interlude', 'reveal-1', 'reveal-2', 'reveal-3']) {
    const next = page.getByRole('button', { name: 'Continue' });
    await expect(next).toBeVisible();
    if (screen === 'reveal-1') await axe('reveal');
    await next.click();
  }

  const tap = page.getByRole('button', { name: "Or just tap, I'm in" });
  await expect(tap).toBeVisible();
  await axe('commit');
  await tap.click();

  // A safety screen for some answers, then the reminders screen, then Home.
  const gotIt = page.getByRole('button', { name: 'Got it' });
  const remindersContinue = page.getByRole('button', { name: 'Continue' });
  await expect(gotIt.or(remindersContinue)).toBeVisible();
  if (await gotIt.isVisible()) await gotIt.click();
  if (await remindersContinue.isVisible()) await remindersContinue.click();

  await expect(page.getByText('DAYS CLEAN')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Feel an urge? Get through it' })).toBeVisible();
});

test('F01-E1 Back on a question goes back, never forward', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Agree and start' }).click();
  await page.getByRole('radio').first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByLabel('Question 2 of 10').first()).toBeVisible();
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page.getByLabel('Question 1 of 10').first()).toBeVisible();
  // The earlier answer is kept.
  await expect(page.getByRole('radio', { checked: true })).toHaveCount(1);
});
