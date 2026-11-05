import { expect, test } from './fixtures';

/**
 * F08: the hosted pages that `npm run sync:legal` generates into site/ from
 * src/state/legal.ts (support, privacy, terms, account deletion), served as a
 * static host would serve them. Same guards as the app: nothing loads from
 * elsewhere, no console errors, and an axe scan of every page.
 */
const SITE = 'http://127.0.0.1:8198';

test('F08-H5 a confirmation link leaves no token in the address bar', async ({ page }) => {
  await page.goto(`${SITE}/support.html#access_token=abc&refresh_token=def&type=email_change`);
  await expect(page.getByRole('status')).toHaveText('Email confirmed. Go back to Winback.');
  expect(page.url()).not.toContain('access_token');
  // A new fragment on the same page is not a new load, so leave it first.
  await page.goto('about:blank');
  await page.goto(`${SITE}/support.html#error=access_denied&error_code=otp_expired`);
  await expect(page.getByRole('status')).toHaveText(
    'This link did not work, or it has expired. Open Winback and send a new one.',
  );
});

for (const [name, heading] of [
  ['support', 'Winback support'],
  ['privacy', 'Privacy Policy'],
  ['terms', 'Terms of Use'],
  ['delete-account', 'Delete your account'],
]) {
  test(`F08-H3 the ${name} page renders and passes axe`, async ({ page, axe }) => {
    await page.goto(`${SITE}/${name}.html`);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(heading);
    await axe(`site-${name}`);
  });
}
