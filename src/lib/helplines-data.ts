/**
 * Crisis helpline data and the pure logic that picks which lines to show.
 *
 * Deliberately free of native imports so it can be exercised directly in a
 * test. The device-region lookup lives in helplines.ts; everything that
 * decides what a person in crisis actually sees lives here, where it can be
 * proven rather than eyeballed.
 *
 * This copy ships no phone numbers: every screen shows the Find A Helpline
 * directory instead (HELPLINE_DIRECTORY). An operator who adds numbers puts
 * them in BY_REGION, each verified against the line's own published details
 * and a government or regulator source, hours included (SAFETY.md).
 */

export type Helpline = {
  /** Row title, as shown to the user. Always carries the dialable digits. */
  name: string;
  /** Coverage and cost, e.g. "United States · free, confidential, 24/7". */
  sub: string;
  /** Primary action: a tel: or sms: URI (https: only for the directory). */
  uri: string;
  /**
   * The number as a person would dial it from another phone. Shown when this
   * device cannot call or text (an iPad, a Wi-Fi tablet), so a failed tap
   * still hands over something usable instead of doing nothing.
   */
  number: string;
  /**
   * sms: URI for lines that take texts as well as calls. The row then offers
   * both, because "call or text" next to a button that can only do one of
   * them is a promise the button breaks.
   */
  sms?: string;
  /**
   * A short code that only reaches this line from a phone inside the region.
   * Anywhere else the same digits reach a different local service, or
   * nothing. Such a row is shown only in its own region's list, never in the
   * everything-list or the other-regions list.
   */
  localOnly?: true;
};

/** ISO 3166-1 alpha-2 regions the app recognises. */
export type Region = 'US' | 'CA' | 'GB' | 'IE' | 'AU' | 'NZ';

/**
 * Verified lines per region. Empty in this copy: no phone numbers ship with
 * the app, and linesFor() falls back to the directory. Read SAFETY.md before
 * adding any.
 */
export const BY_REGION: Record<Region, Helpline[]> = {
  US: [],
  CA: [],
  GB: [],
  IE: [],
  AU: [],
  NZ: [],
};

export const SUPPORTED = Object.keys(BY_REGION) as Region[];

/**
 * The route to help on every screen while a region has no verified numbers
 * (in this copy, every region). Find A Helpline is a free public directory
 * run by ThroughLine that lists verified gambling helplines country by
 * country.
 */
export const HELPLINE_DIRECTORY: Helpline = {
  name: 'Find a helpline in your country',
  sub: 'Free directory of gambling helplines worldwide',
  uri: 'https://findahelpline.com/topics/gambling',
  number: 'findahelpline.com',
};

/**
 * True when a list is long enough to render compactly: Canada's provincial
 * lines, and the everything-list for a device we cannot place. Someone in a
 * craving should not have to scroll past a dozen full-size cards to reach the
 * line they need.
 */
export function isLongList(lines: Helpline[]): boolean {
  return lines.length > 3;
}

/**
 * Every line we have, in region order, minus the local-only short codes:
 * this list is for a phone we could not place, where those digits would
 * reach some other local service.
 */
export function allHelplines(): Helpline[] {
  return SUPPORTED.flatMap((r) => BY_REGION[r]).filter((l) => !l.localOnly);
}

/**
 * First supported region among the device's locales, or null.
 * Takes raw codes so it can be tested without a device.
 */
export function pickRegion(codes: (string | null | undefined)[]): Region | null {
  for (const code of codes) {
    const up = code?.toUpperCase();
    if (up && (SUPPORTED as string[]).includes(up)) return up as Region;
  }
  return null;
}

/**
 * Lines to show. Never empty: when the region has no verified numbers (in
 * this copy, always) or we cannot place the user, show the directory rather
 * than nothing at all.
 */
export function linesFor(region: Region | null): Helpline[] {
  const lines = region ? BY_REGION[region] : allHelplines();
  return lines.length > 0 ? lines : [HELPLINE_DIRECTORY];
}

/**
 * Lines for the other regions, for the "not in your country?" escape hatch.
 * Empty when we already showed everything.
 */
export function otherLinesFor(region: Region | null): Helpline[] {
  if (!region) return [];
  return SUPPORTED.filter((r) => r !== region)
    .flatMap((r) => BY_REGION[r])
    .filter((l) => !l.localOnly);
}

