import { Alert, Linking, Platform } from 'react-native';
import { DEV_FALLBACK_PRICE } from './pricing';

/**
 * RevenueCat wrapper. react-native-purchases is a native module, so it is
 * unavailable in Expo Go. A development build with no store keys simulates
 * the purchase so the funnel can be exercised end to end; every other build
 * without keys says plainly that it cannot sell, rather than showing prices
 * for a purchase that can never complete.
 */

const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY;
const IS_PRODUCTION = process.env.EXPO_PUBLIC_APP_ENV === 'production';

/**
 * Simulated purchases require BOTH a non-production env AND a dev build.
 *
 * The gate used to be `!IS_PRODUCTION` alone, which reads the value of
 * EXPO_PUBLIC_APP_ENV. If that variable is ever missing or misspelled in a
 * release build - a one-character typo in eas.json - IS_PRODUCTION is false
 * and every user is handed Premium for free. Requiring __DEV__ as well means
 * a shipped binary can never simulate a purchase, whatever the env says.
 * `purchasePlan` and the entitlement gate in AppState both read this one flag,
 * so they cannot drift apart again.
 */
export const SIMULATED_PURCHASES = !IS_PRODUCTION && __DEV__;

/** Package id, for the manage-subscription fallback link on Android. */
const ANDROID_PACKAGE = 'com.winback.app';

/** Nothing here may hang the UI: a store call that has not answered by now is treated as failed. */
const STORE_TIMEOUT_MS = 10_000;

/**
 * The two tiers sold. There is no weekly plan: a small price repeated every
 * week is the shape of the spending this app exists to undo (see pricing.ts).
 */
export type PlanId = 'yearly' | 'monthly';

/** Display order on the paywall: yearly first so it anchors the comparison. */
export const PLAN_IDS: PlanId[] = ['yearly', 'monthly'];

type PurchasesModule = typeof import('react-native-purchases').default;
type CustomerInfo = import('react-native-purchases').CustomerInfo;

let Purchases: PurchasesModule | null = null;
let configured = false;
let initPromise: Promise<void> | null = null;

function apiKey(): string | undefined {
  const key = Platform.OS === 'android' ? ANDROID_KEY : IOS_KEY;
  // A RevenueCat Test Store key completes "purchases" without any store. In a
  // production build that would hand out Premium for nothing, so treat it as
  // no key at all: the paywall then says purchases are unavailable.
  if (IS_PRODUCTION && key?.startsWith('test_')) return undefined;
  return key;
}

function withTimeout<T>(p: Promise<T>, ms = STORE_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('store timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Configure RevenueCat. Called at startup without waiting on the network, and
 * awaited by every other function here - child effects run before the root
 * layout's, so the first entitlement check at launch used to run before
 * configure had even started and reported a paying user as unsubscribed.
 * Memoized: every caller shares the one configure.
 */
export function initPurchases(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const key = apiKey();
      if (!key) return; // no store in this build
      try {
        const mod = (await import('react-native-purchases')).default;
        mod.configure({
          apiKey: key,
          // Signed responses. INFORMATIONAL never blocks a real subscriber on
          // a verification hiccup, but a response rewritten on the way (a
          // proxy with a trusted CA) comes back FAILED, and `entitled` below
          // refuses it.
          entitlementVerificationMode: mod.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
        });
        Purchases = mod;
        configured = true;
      } catch (e) {
        // Native module missing (Expo Go) - no store.
        console.warn('[purchases] RevenueCat unavailable:', e);
      }
    })();
  }
  return initPromise;
}

/**
 * The one definition of "entitled to Premium": an active `premium`
 * entitlement whose signature did not fail verification.
 */
function entitled(info: CustomerInfo | null | undefined): boolean {
  const premium = info?.entitlements.active.premium;
  if (!premium || !Purchases) return false;
  return premium.verification !== Purchases.VERIFICATION_RESULT.FAILED;
}

/**
 * Detach the RevenueCat customer from this device.
 *
 * Called on account deletion and when signing in as a different account.
 * Without it the previous user's alias stays attached, so their entitlement
 * follows the device into the next account - and a deleted user's purchases
 * remain associated with whoever uses the phone next.
 */
export async function forgetPurchasesIdentity(): Promise<void> {
  await initPurchases();
  if (!configured || !Purchases) return;
  try {
    await withTimeout(Purchases.logOut());
  } catch {
    // Already anonymous, or the native module is unavailable. Either way
    // there is nothing attached to detach.
  }
}

/**
 * Alias the RevenueCat customer onto the Supabase user id. Using logIn (rather
 * than configuring with the id up front) means a subscription bought before
 * the session resolved is merged onto the account instead of being orphaned,
 * and it survives the later anonymous -> email upgrade.
 *
 * logIn switches directly between identified users, so a sign-in does not
 * need a logOut first. Await this BEFORE checking entitlement after a sign-in,
 * or the check reads the previous customer.
 */
/**
 * Resolves false only when the store was asked and did not answer: the caller
 * then must not trust what it says about Premium (it is still looking at the
 * previous customer) and tries again later. Nothing to do counts as done.
 */
export async function identifyPurchases(appUserId: string): Promise<boolean> {
  await initPurchases();
  if (!configured || !Purchases || !appUserId) return true;
  try {
    await withTimeout(Purchases.logIn(appUserId));
    return true;
  } catch (e) {
    console.warn('[purchases] logIn failed:', e);
    return false;
  }
}

/**
 * Call `listener` whenever RevenueCat learns something new about this
 * customer: a renewal, a lapse, an Ask to Buy approval, a Play purchase that
 * was pending. Without it those only show up on the next foreground.
 * Returns an unsubscribe function. No-op when there is no store.
 */
export function onPremiumChange(listener: (isEntitled: boolean) => void): () => void {
  let active = true;
  let registered: ((info: CustomerInfo) => void) | null = null;
  void initPurchases().then(() => {
    if (!active || !configured || !Purchases) return;
    registered = (info: CustomerInfo) => listener(entitled(info));
    Purchases.addCustomerInfoUpdateListener(registered);
  });
  return () => {
    active = false;
    if (registered && Purchases) Purchases.removeCustomerInfoUpdateListener(registered);
  };
}

function packageFor(
  current: import('react-native-purchases').PurchasesOffering | null | undefined,
  plan: PlanId,
) {
  // Never fall back to "whatever package is first": that silently charges the
  // wrong price for the selected plan. Only the ANNUAL and MONTHLY packages
  // are read, so a WEEKLY (or any other) package left in an offering is
  // never shown and never sold.
  if (!current) return null;
  if (plan === 'yearly') return current.annual ?? null;
  return current.monthly ?? null;
}

const storeName = () => (Platform.OS === 'ios' ? 'the App Store' : 'Google Play');

export type PurchaseResult =
  | { ok: true; status: 'purchased' | 'simulated' }
  | {
      ok: false;
      /**
       * cancelled: the user backed out - say nothing.
       * pending: waiting on Ask to Buy or a slow payment method.
       * not_entitled: the store charged, but Premium did not activate.
       * unavailable: this build cannot sell.
       * failed: anything else.
       */
      status: 'cancelled' | 'pending' | 'not_entitled' | 'unavailable' | 'failed';
      /** User-facing sentence. Never a raw store string. */
      error?: string;
    };

/**
 * Purchase the package for the selected plan. Expects an offering whose
 * packages use the standard ANNUAL and MONTHLY package types.
 * `ok` is true only when the user ends up entitled to Premium.
 */
export async function purchasePlan(plan: PlanId): Promise<PurchaseResult> {
  await initPurchases();
  if (!configured || !Purchases) {
    // This is the ONLY place premium could be granted without a real receipt,
    // and only a dev build may take it.
    if (SIMULATED_PURCHASES) {
      console.log(`[purchases] simulated purchase: ${plan}`);
      return { ok: true, status: 'simulated' };
    }
    return {
      ok: false,
      status: 'unavailable',
      error: "Purchases aren't available in this build.",
    };
  }
  const P = Purchases;
  let pkg;
  try {
    pkg = packageFor((await withTimeout(P.getOfferings())).current, plan);
  } catch {
    return {
      ok: false,
      status: 'failed',
      error: `We couldn't reach ${storeName()}. Check your connection and try again.`,
    };
  }
  if (!pkg) return { ok: false, status: 'failed', error: 'That plan is not available right now.' };
  try {
    // No timeout on the purchase itself: the store sheet waits on the user.
    const { customerInfo } = await P.purchasePackage(pkg);
    if (entitled(customerInfo)) return { ok: true, status: 'purchased' };
    // Entitlements can trail the transaction by a moment. Ask once more
    // before telling someone who was just charged that it did not work.
    try {
      if (entitled(await withTimeout(P.getCustomerInfo()))) return { ok: true, status: 'purchased' };
    } catch {
      // fall through
    }
    return {
      ok: false,
      status: 'not_entitled',
      error:
        'Your purchase went through, but Premium has not switched on yet. Tap Restore purchases in a minute. If it still does not appear, contact support.',
    };
  } catch (e: unknown) {
    const err = e as { userCancelled?: boolean | null; code?: string };
    const codes = P.PURCHASES_ERROR_CODE;
    if (err.userCancelled || err.code === codes.PURCHASE_CANCELLED_ERROR) {
      return { ok: false, status: 'cancelled' };
    }
    if (err.code === codes.PAYMENT_PENDING_ERROR) {
      return {
        ok: false,
        status: 'pending',
        error:
          'Your purchase is waiting for approval. Premium switches on as soon as it goes through.',
      };
    }
    if (err.code === codes.PRODUCT_ALREADY_PURCHASED_ERROR) {
      return {
        ok: false,
        status: 'failed',
        error: 'This account already has that plan. Tap Restore purchases to switch it back on.',
      };
    }
    if (err.code === codes.NETWORK_ERROR || err.code === codes.OFFLINE_CONNECTION_ERROR) {
      return {
        ok: false,
        status: 'failed',
        error: `We couldn't reach ${storeName()}. Check your connection and try again.`,
      };
    }
    // Store error strings can carry account and device detail; log, never show.
    console.warn('[purchases] purchase failed:', err.code);
    return { ok: false, status: 'failed', error: "The purchase didn't go through. Please try again." };
  }
}

export interface DisplayOffer {
  /** Store-formatted price, in the user's storefront currency. */
  price: string;
  /** Numeric price, so the annualised figure is computed rather than guessed. */
  priceValue?: number;
  /** ISO currency code for formatting that annualised figure. */
  currencyCode?: string;
  /** Free-trial length in days, when the store product actually offers one. */
  trialDays?: number;
}

/**
 * What the paywall can show.
 *  - ready: the store answered. `offers` holds ONLY the tiers the current
 *    offering actually has; a missing tier is hidden, never faked.
 *  - simulated: dev build with no store. Placeholder prices, clearly marked.
 *  - unavailable: this build has no store configured and cannot sell.
 *  - error: the store could not be reached, or offered nothing.
 */
export interface OffersResult {
  status: 'ready' | 'simulated' | 'unavailable' | 'error';
  offers: Partial<Record<PlanId, DisplayOffer>>;
}

function devOffers(): Partial<Record<PlanId, DisplayOffer>> {
  const out: Partial<Record<PlanId, DisplayOffer>> = {};
  for (const id of PLAN_IDS) {
    out[id] = {
      price: `$${DEV_FALLBACK_PRICE[id].toFixed(2)}`,
      priceValue: DEV_FALLBACK_PRICE[id],
      currencyCode: 'USD',
    };
  }
  return out;
}

/**
 * Store price strings and real trial lengths from the current RevenueCat
 * offering, so the paywall only ever shows what the store will actually
 * charge and only promises a trial that exists.
 */
export async function getDisplayOffers(): Promise<OffersResult> {
  await initPurchases();
  if (!configured || !Purchases) {
    return SIMULATED_PURCHASES
      ? { status: 'simulated', offers: devOffers() }
      : { status: 'unavailable', offers: {} };
  }
  try {
    const current = (await withTimeout(Purchases.getOfferings())).current;
    const offers: Partial<Record<PlanId, DisplayOffer>> = {};
    for (const plan of PLAN_IDS) {
      const pkg = packageFor(current, plan);
      if (!pkg?.product?.priceString) continue;
      const product = pkg.product as {
        priceString: string;
        price?: number;
        currencyCode?: string;
        introPrice?: { price: number; periodNumberOfUnits: number; periodUnit: string } | null;
      };
      const intro = product.introPrice;
      let trialDays: number | undefined;
      if (intro && intro.price === 0) {
        const n = intro.periodNumberOfUnits;
        const unit = String(intro.periodUnit).toUpperCase();
        trialDays = unit === 'DAY' ? n : unit === 'WEEK' ? n * 7 : unit === 'MONTH' ? n * 30 : n;
      }
      offers[plan] = {
        price: product.priceString,
        priceValue: product.price,
        currencyCode: product.currencyCode,
        trialDays,
      };
    }
    return Object.keys(offers).length ? { status: 'ready', offers } : { status: 'error', offers: {} };
  } catch {
    return { status: 'error', offers: {} };
  }
}

export interface RestoreResult {
  /** restored: Premium is back. none: the store has no purchase for this account.
   *  error: the store could not be reached - NOT the same as "none".
   *  unavailable: this build has no store. */
  status: 'restored' | 'none' | 'error' | 'unavailable';
  restored: boolean;
  /** Which plan the store actually restored (not what the UI had selected). */
  plan?: PlanId;
}

export async function restorePurchases(): Promise<RestoreResult> {
  await initPurchases();
  if (!configured || !Purchases) return { status: 'unavailable', restored: false };
  try {
    // No timeout, like the purchase itself: on iOS a restore can bring up the
    // Apple ID sign-in, and the store sheet waits on the user. A cap here told
    // anyone slower than it that the store was unreachable while the sheet
    // was still open.
    const info = await Purchases.restorePurchases();
    if (!entitled(info)) return { status: 'none', restored: false };
    const entitlement = info.entitlements.active.premium;
    const id = String(entitlement?.productIdentifier ?? '').toLowerCase();
    // Premium is back either way; `plan` only labels the membership row. A
    // product that is neither tier (a weekly one from a sandbox test, say) is
    // left unlabelled rather than called monthly.
    const plan: PlanId | undefined =
      id.includes('year') || id.includes('annual') || id.includes('yr')
        ? 'yearly'
        : id.includes('week') || id.includes('wk')
          ? undefined
          : 'monthly';
    return { status: 'restored', restored: true, plan };
  } catch {
    return { status: 'error', restored: false };
  }
}

/**
 * Live, store-verified entitlement check. This - NOT the persisted `plan`
 * field in AppState - is the ONLY safe gate for premium features. `plan` is
 * cosmetic (it just labels the membership row) and lives in AsyncStorage,
 * which a rooted device can edit; RevenueCat re-validates the receipt with
 * Apple/Google here, and verification rejects a tampered response.
 */
export async function isPremiumActive(): Promise<boolean> {
  return (await checkPremium()) === true;
}

/**
 * Like isPremiumActive, but says when it could not tell: null means the store
 * did not answer. Use it before anything that would treat "not subscribed" as
 * a fact worth acting on, such as putting a trial-ended paywall in front of
 * someone who may well be paying.
 */
export async function checkPremium(): Promise<boolean | null> {
  await initPurchases();
  // No store to ask means no verifiable subscription, in any environment.
  // Testability comes from the free week, and from SIMULATED_PURCHASES in
  // AppState for the post-trial case.
  if (!configured || !Purchases) return false;
  try {
    return entitled(await withTimeout(Purchases.getCustomerInfo()));
  } catch {
    return null;
  }
}

export interface RenewalInfo {
  /** ISO timestamp the current paid period ends. */
  periodEndsAt: string;
  /** False once the subscriber has cancelled: Premium then ends at periodEndsAt. */
  willRenew: boolean;
}

/**
 * When the current Premium period ends and whether it renews, for the
 * "renews on" line in You, so nobody meets a charge they forgot was coming.
 * Null when there is no verifiable subscription, when the entitlement never
 * expires, or when the store did not answer: the line is then not shown.
 */
export async function getRenewalInfo(): Promise<RenewalInfo | null> {
  await initPurchases();
  if (!configured || !Purchases) return null;
  try {
    const info = await withTimeout(Purchases.getCustomerInfo());
    if (!entitled(info)) return null;
    const premium = info.entitlements.active.premium;
    if (!premium?.expirationDate) return null;
    return { periodEndsAt: premium.expirationDate, willRenew: premium.willRenew };
  } catch {
    return null;
  }
}

function platformManagementUrl(): string | null {
  if (Platform.OS === 'ios') return 'https://apps.apple.com/account/subscriptions';
  if (Platform.OS === 'android') {
    return `https://play.google.com/store/account/subscriptions?package=${ANDROID_PACKAGE}`;
  }
  return null;
}

/**
 * Apple's and Google's own store pages only. The management link arrives
 * over the network, so a tampered response (a phone with an extra trusted
 * certificate) must not be able to open a look-alike page.
 */
const STORE_URL = /^https:\/\/(apps\.apple\.com|play\.google\.com|[a-z0-9-]+\.itunes\.apple\.com)([/?#]|$)/i;

/**
 * Where this subscriber manages or cancels: the store's own link for this
 * customer when RevenueCat has one, else the platform's subscriptions page.
 */
export async function getManagementUrl(): Promise<string | null> {
  await initPurchases();
  if (configured && Purchases) {
    try {
      const url = (await withTimeout(Purchases.getCustomerInfo())).managementURL;
      if (url && STORE_URL.test(url)) return url;
    } catch {
      // fall back to the platform page
    }
  }
  return platformManagementUrl();
}

/**
 * Open subscription management. On iOS the native sheet, so nobody has to
 * find their way through Settings; otherwise the store page. If nothing can
 * be opened, say where to go instead of failing silently.
 */
export async function openManageSubscription(): Promise<void> {
  await initPurchases();
  if (Platform.OS === 'ios' && configured && Purchases) {
    try {
      await Purchases.showManageSubscriptions();
      return;
    } catch {
      // fall through to the link
    }
  }
  const url = await getManagementUrl();
  if (url) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // fall through to the instructions
    }
  }
  Alert.alert(
    'Manage your subscription',
    Platform.OS === 'ios'
      ? 'Open Settings, tap your name, then Subscriptions, and choose Winback.'
      : Platform.OS === 'android'
        ? 'Open Google Play, tap your profile picture, then Payments & subscriptions, then Subscriptions, and choose Winback.'
        : 'Subscriptions are managed in the App Store or Google Play on the phone you bought it on.',
  );
}
