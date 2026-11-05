import { expect, test } from './fixtures';

/**
 * F04 Cut the lines, F05 You, F06 comeback week, F07 legal pages: the screens
 * a committed person comes back to.
 */
const EARLY_LINES = [
  'delete-apps',
  'emails',
  'texts',
  'marketing-optout',
  'fewer-ads',
  'unfollow',
  'mute-chat',
  'prediction-apps',
  'saved-cards',
  'bank-block',
  'blocker',
];

test('F04-H1 the partner-lock task opens next, and its link leads to the partner fields', async ({ page, seed, axe }) => {
  await seed({ trialPromptShown: true, cutLinesDone: EARLY_LINES });
  await page.goto('/');
  await page.getByRole('button', { name: /^Cut the lines · 11 of 13\. Give your person the key\./ }).click();
  await expect(page.getByText('A lock you can undo yourself is only as strong as your worst minute.', { exact: false })).toBeVisible();
  // Big step: Done and Skip look the same.
  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip for now', exact: true })).toBeVisible();
  await axe('cut-lines');
  await page.getByRole('button', { name: 'No one saved yet? Add your person in You' }).click();
  await expect(page).toHaveURL(/\/you\?section=corner/);
  await expect(page.getByLabel("Your person's name")).toBeVisible();
});

test('F04-H2 marking a line done counts it and opens the next one', async ({ page, seed }) => {
  await seed({ trialPromptShown: true });
  await page.goto('/cut-lines');
  await expect(page.getByText('Lines cut: 0 of 13')).toBeVisible();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByText('Lines cut: 1 of 13')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete the betting apps, done' })).toBeVisible();
});

test('F05-H1 You shows the helplines and peer support', async ({ page, seed, axe }) => {
  await seed({ trialPromptShown: true });
  await page.goto('/you');
  await expect(page.getByText('Find a helpline in your country').first()).toBeVisible();
  await expect(page.getByText("PEOPLE WHO'VE BEEN THERE", { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find a meeting, Gamblers Anonymous' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find a meeting, Gam-Anon' })).toBeVisible();
  await expect(page.getByLabel('Email address')).toBeVisible();
  await axe('you');
});

test('F06-H1 the comeback week shows its lines and peer support', async ({ page, seed, axe }) => {
  await seed({ trialPromptShown: true });
  await page.goto('/comeback');
  await expect(page.getByText('TALK TO SOMEONE, ANY TIME', { exact: false })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find a meeting, SMART Recovery' })).toBeVisible();
  await axe('comeback');
});

for (const doc of ['privacy', 'terms']) {
  test(`F07-H1 the ${doc} page renders`, async ({ page, axe }) => {
    await page.goto(`/legal?doc=${doc}`);
    await expect(page.getByRole('heading').first()).toBeVisible();
    await axe(`legal-${doc}`);
  });
}
