import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests against the offline web export (npm run e2e:build), which
 * has no backend keys. Every request off 127.0.0.1 is blocked by the shared
 * fixture (e2e/fixtures.ts), so a test can never reach the live project.
 *
 * Locally this uses the installed Microsoft Edge; CI installs Chromium.
 */
const PORT = 8197;
export const SITE_PORT = 8198;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    // A phone-sized window; the app is phone-first.
    viewport: { width: 390, height: 844 },
    ...(process.env.CI ? {} : { channel: 'msedge' }),
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `node scripts/serve-export.mjs dist-e2e ${PORT}`,
      url: `http://127.0.0.1:${PORT}`,
      reuseExistingServer: !process.env.CI,
    },
    // The generated support and legal pages (npm run sync:legal), as a host would serve them.
    {
      command: `node scripts/serve-export.mjs site ${SITE_PORT}`,
      url: `http://127.0.0.1:${SITE_PORT}/support.html`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
