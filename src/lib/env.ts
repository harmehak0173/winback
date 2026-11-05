import { Platform } from 'react-native';

/**
 * Configuration report.
 *
 * This used to throw at module scope, which meant a single missing build-time
 * variable produced a blank screen on launch for 100% of users, with no
 * message and no way to roll back. That is a worse outcome than the
 * misconfiguration it was guarding against, so the guarantees live where they
 * actually belong:
 *
 *  - The BUILD fails first: scripts/check-build-env.mjs runs as the
 *    `eas-build-pre-install` hook and stops a production build that is missing
 *    any of these variables or carries a RevenueCat test key. That is the
 *    gate; this file is the runtime backstop for anything that slips past it.
 *  - Premium can never be granted without a real receipt: `purchasePlan`
 *    simulates only in a development build (`SIMULATED_PURCHASES`).
 *  - A build with no store keys says so on the paywall ("Purchases aren't
 *    available in this build.") instead of showing prices it cannot charge,
 *    and `isPremiumActive` returns false.
 *
 * So at runtime this reports rather than crashes.
 */
export function missingProductionConfig(): string[] {
  const isProduction = process.env.EXPO_PUBLIC_APP_ENV === 'production';
  const missing: string[] = [];
  if (!process.env.EXPO_PUBLIC_SUPABASE_URL) missing.push('EXPO_PUBLIC_SUPABASE_URL');
  if (!process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY) missing.push('EXPO_PUBLIC_SUPABASE_ANON_KEY');
  if (!isProduction) return missing;

  const key =
    Platform.OS === 'ios'
      ? { name: 'EXPO_PUBLIC_REVENUECAT_IOS_KEY', value: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY }
      : Platform.OS === 'android'
        ? {
            name: 'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
            value: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
          }
        : null;
  if (key && !key.value) missing.push(key.name);
  // A RevenueCat Test Store key sells nothing real. In a production build it
  // is as good as missing.
  if (key?.value?.startsWith('test_')) missing.push(`${key.name} (test key, not a store key)`);
  return missing;
}

/**
 * Log any configuration gaps at startup. Never throws: a misconfigured build
 * still runs (offline-first, purchases unavailable) instead of showing nothing.
 */
export function reportProductionConfig(): void {
  if (__DEV__) return;
  const missing = missingProductionConfig();
  if (!missing.length) return;
  console.error(
    `[winback] Missing build configuration: ${missing.join(', ')}. ` +
      `Without the Supabase values this build does not sync, restore or delete server data; ` +
      `without a store key the paywall says purchases are unavailable. ` +
      `Set these as EAS environment variables and rebuild.`,
  );
}
