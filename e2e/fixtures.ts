import AxeBuilder from '@axe-core/playwright';
import { expect, test as base } from '@playwright/test';

/**
 * Every test gets three guards for free:
 *  - nothing leaves the machine: any request off 127.0.0.1 is aborted, and
 *    the test fails if one was even attempted (the app is offline-first);
 *  - no console errors, and no uncaught page errors;
 *  - `axe(name)`: an accessibility scan of the current screen that fails on
 *    critical or serious WCAG 2.x A/AA violations (the full list is attached
 *    to the report).
 * `seed(state)` starts the app as a person who has already committed.
 */
type Fixtures = {
  networkGuard: string[];
  noConsoleErrors: string[];
  axe: (screen: string) => Promise<void>;
  seed: (state?: Record<string, unknown>) => Promise<void>;
};

const LOCAL = /^(http:\/\/127\.0\.0\.1(:\d+)?\/|data:|blob:|about:)/;

// Expected in this build:
//  - it has no backend keys on purpose, and the app reports missing
//    configuration so that a real build without them is noticed;
//  - the web export pre-renders each route without its query string, so a
//    screen opened with one (/legal?doc=terms, /panic?moment=block) differs
//    from its pre-rendered copy and React re-renders it on load (hydration
//    errors 418/423/425). Web only; the phone apps do not pre-render.
const EXPECTED_ERRORS = [
  /^\[winback\] Missing build configuration:/,
  /Minified React error #(418|423|425)\b/,
];

export const test = base.extend<Fixtures>({
  networkGuard: [
    async ({ page }, use) => {
      const attempted: string[] = [];
      await page.route('**/*', (route) => {
        const url = route.request().url();
        if (LOCAL.test(url)) return route.continue();
        attempted.push(url);
        return route.abort();
      });
      await use(attempted);
      expect(attempted, 'requests that tried to leave the machine').toEqual([]);
    },
    { auto: true },
  ],

  noConsoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('console', (m) => {
        if (m.type() !== 'error') return;
        const text = m.text();
        if (!EXPECTED_ERRORS.some((re) => re.test(text))) errors.push(text);
      });
      page.on('pageerror', (e) => {
        if (!EXPECTED_ERRORS.some((re) => re.test(e.message))) errors.push(`page error: ${e.message}`);
      });
      await use(errors);
      expect(errors, 'console errors').toEqual([]);
    },
    { auto: true },
  ],

  axe: async ({ page }, use, testInfo) => {
    await use(async (screen: string) => {
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        // A rule about web documents. The product is the native app, whose
        // screens have no document title; everything else applies to both.
        .disableRules(['document-title'])
        .analyze();
      await testInfo.attach(`axe-${screen}.json`, {
        body: JSON.stringify(results.violations, null, 2),
        contentType: 'application/json',
      });
      const blocking = results.violations
        .filter((v) => v.impact === 'critical' || v.impact === 'serious')
        .map(
          (v) =>
            `${v.id} (${v.impact}): ${v.help} - ${v.nodes
              .map((n) => `${n.target.join(' ')} "${(n.html.match(/aria-label="([^"]*)"/)?.[1] ?? n.html).slice(0, 80)}"`)
              .join('; ')}`,
        );
      expect(blocking, `axe on ${screen}`).toEqual([]);
    });
  },

  seed: async ({ page }, use) => {
    await use(async (state = {}) => {
      const daysAgo = 10;
      const full = {
        quitDate: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
        // Celebrations already seen, so they do not cover the screen.
        lastMilestoneSeen: 7,
        ...state,
      };
      // Once per test: a reload keeps whatever the app has saved since.
      await page.addInitScript((s) => {
        if (sessionStorage.getItem('e2e-seeded')) return;
        localStorage.clear();
        localStorage.setItem('winback:v1', JSON.stringify(s));
        sessionStorage.setItem('e2e-seeded', '1');
      }, full);
    });
  },
});

export { expect };
