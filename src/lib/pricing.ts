import type { PlanId } from './purchases';

/**
 * What a plan actually costs over a year.
 *
 * The people this app is for are specifically people who lost track of what
 * $20 a night compounds to. A price shown only as its small repeating number
 * charges them in the exact shape of the problem they came here to fix. That
 * is why there is no weekly plan at all: $4.99 a week reads as small and is
 * $259 a year, more than six times our own annual plan.
 *
 * The monthly plan stays, so its annualised figure sits right next to its
 * price. If that makes a plan hard to sell, the plan was relying on a
 * misperception.
 */

const PER_YEAR: Record<PlanId, number> = {
  monthly: 12,
  yearly: 1,
};

/**
 * Placeholder prices for a DEVELOPMENT build with no store configured, so the
 * paywall layout can be exercised. Never shown anywhere else: a production
 * paywall shows only what the store says it will charge, in the storefront's
 * own currency, or no price at all.
 */
export const DEV_FALLBACK_PRICE: Record<PlanId, number> = {
  monthly: 3.99,
  yearly: 39.99,
};

/**
 * Format a whole-currency amount. Intl is available in Hermes, but a device
 * without it must not take the paywall down, so there is a plain fallback.
 */
export function formatWhole(amount: number, currencyCode = 'USD'): string {
  const opts: Intl.NumberFormatOptions = {
    style: 'currency',
    currency: currencyCode,
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  };
  try {
    // narrowSymbol so this reads "$48" and not "US$48" next to the store's
    // own "$3.99". Not every ICU build supports it, hence the retry below.
    return new Intl.NumberFormat(undefined, { ...opts, currencyDisplay: 'narrowSymbol' }).format(
      amount,
    );
  } catch {
    // fall through
  }
  try {
    return new Intl.NumberFormat(undefined, opts).format(amount);
  } catch {
    return `${currencyCode === 'USD' ? '$' : ''}${Math.round(amount).toLocaleString('en-US')}`;
  }
}

/**
 * "$48 a year at this rate", or null for the yearly plan, which is already
 * stated as a yearly figure and would just repeat itself. Also null when the
 * store has not given a numeric price: a guessed figure next to a real one
 * would be worse than none.
 */
export function annualisedNote(
  plan: PlanId,
  priceValue?: number,
  currencyCode?: string,
): string | null {
  if (plan === 'yearly') return null;
  if (typeof priceValue !== 'number' || !(priceValue > 0)) return null;
  const perYear = priceValue * PER_YEAR[plan];
  if (!Number.isFinite(perYear) || perYear <= 0) return null;
  return `${formatWhole(perYear, currencyCode ?? 'USD')} a year at this rate`;
}

/**
 * The price in the user's own unit: days of what they used to stake.
 *
 * "$39.99/yr" is a number from our world. "About 1 day of what you used to
 * stake" is a number from theirs, computed from their own quiz answers, and it
 * is the strongest honest sentence the paywall can say. Null whenever the
 * comparison would be weak or absurd: a tiny stake makes the plan cost weeks
 * of betting, and showing that would argue against buying - honesty cuts both
 * ways, so we say nothing rather than something misleading either direction.
 */
export function priceInStakeDays(
  planYearlyPrice: number,
  dailyRate: number,
  currencyCode?: string,
): string | null {
  // The quiz brackets are in dollars. A pound or euro price divided by a
  // dollar stake is not a comparison, so outside USD storefronts say nothing.
  if (currencyCode && currencyCode !== 'USD') return null;
  if (!Number.isFinite(dailyRate) || dailyRate < 3) return null;
  if (!Number.isFinite(planYearlyPrice) || planYearlyPrice <= 0) return null;
  const days = planYearlyPrice / dailyRate;
  if (days > 14) return null;
  if (days <= 1.25) return 'about one day of what you used to stake';
  return `about ${Math.round(days)} days of what you used to stake`;
}
