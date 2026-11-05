import { safeLinkPath } from '@/lib/deepLinks';

/**
 * Every link that opens the app passes through here before the router sees
 * it (iOS and Android; the web build has no equivalent). Only known screens
 * with well-formed parameters get through; see lib/deepLinks.ts.
 *
 * Must never throw: a crash here would stop the app opening at all.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    // A development build's own launcher links pass through untouched.
    if (__DEV__ && typeof path === 'string' && path.includes('expo-development-client')) return path;
    return safeLinkPath(path);
  } catch {
    return '/';
  }
}
