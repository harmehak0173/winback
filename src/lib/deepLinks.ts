import { parseReminderUrl } from './schedule/reminderPlan';

/**
 * Links from outside the app (winback://..., the Android widget, a page that
 * opens the app) may open only the screens a reminder can open, with the same
 * well-formed parameters, plus the few entries below. Anything else lands on
 * Home.
 *
 * Without this, any web page could open any route with any parameters, and a
 * malformed link reached the router's own query parser, which has a known
 * slow path on bad percent-encoding. Checked here first, with a length cap,
 * nothing unvetted gets that far.
 */
const EXTRA_ENTRIES: Record<string, RegExp> = {
  // "About to switch off a block?" opened straight on its card. It logs
  // nothing until a tap (panic.tsx), so a link can show it but never write.
  '/panic?moment=block': /^\/panic\?moment=block$/,
};

const MAX_LINK_LENGTH = 300;
const HOME = '/';

export function safeLinkPath(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > MAX_LINK_LENGTH) return HOME;
  // winback://closeout and winback:///closeout both mean /closeout; a bare
  // path arrives as it is.
  let path = raw.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  if (!path.startsWith('/')) path = `/${path}`;
  if (path === '/' || path === '/(tabs)') return path;

  for (const rule of Object.values(EXTRA_ENTRIES)) if (rule.test(path)) return path;

  const route = parseReminderUrl(path);
  if (!route) return HOME;
  const query = Object.entries(route.params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return query ? `${route.pathname}?${query}` : route.pathname;
}
