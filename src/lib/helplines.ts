import { getLocales } from 'expo-localization';
import { useSyncExternalStore } from 'react';
import { Alert, Linking, Platform } from 'react-native';
import {
  allHelplines,
  HELPLINE_DIRECTORY,
  isLongList,
  linesFor,
  otherLinesFor,
  pickRegion,
  type Helpline,
  type Region,
} from './helplines-data';

/**
 * Device-aware view of the crisis helplines.
 *
 * These numbers were hardcoded in five separate files, which is exactly how
 * the panic screen - the one someone opens mid-craving - ended up listing
 * fewer lines than the You tab and advertising a text number that only ever
 * dialled the voice one. There is one source of truth now, in
 * helplines-data.ts, and every screen reads it.
 *
 * Region is taken from the phone's region setting rather than its language:
 * someone in Britain may well run their phone in en-US, and sending them to a
 * US number would be useless.
 */

export type { Helpline, Region };
export { allHelplines, HELPLINE_DIRECTORY, isLongList };

let cachedRegion: Region | null | undefined;

export function deviceRegion(): Region | null {
  // Cached for the process: the panic screen re-renders every second while the
  // urge timer ticks, and there is no reason to ask the native localization
  // module the same question sixty times a minute. A region change on the
  // device is picked up on next launch, which is when it takes effect for the
  // rest of the OS anyway.
  if (cachedRegion !== undefined) return cachedRegion;
  cachedRegion = resolveRegion();
  return cachedRegion;
}

function resolveRegion(): Region | null {
  try {
    const codes = getLocales().map((l) => l.regionCode);
    // iOS gives every entry the phone's own region. Android gives each
    // language its own country, so a phone in Brazil with English (US) as a
    // second language read as the US: US numbers, and no "find a helpline in
    // your country" row. There, only the first language with a country
    // speaks for where the phone is.
    if (Platform.OS === 'android') {
      const first = codes.find((c) => !!c);
      return pickRegion(first ? [first] : []);
    }
    return pickRegion(codes);
  } catch {
    // Localization can fail on unusual devices. Falling through to null means
    // every line is shown, which is the safe direction to fail in.
    return null;
  }
}

/** Lines for this device. Never empty and never throws. */
export function deviceHelplines(): Helpline[] {
  return linesFor(deviceRegion());
}

/** Lines for other regions, for the "not in your country?" escape hatch. */
export function otherHelplines(): Helpline[] {
  return otherLinesFor(deviceRegion());
}

/**
 * The worldwide directory row, only for devices we cannot place in a region
 * we have verified numbers for. Null when a local line is already shown.
 */
export function deviceDirectoryLine(): Helpline | null {
  // Already in the device's list when its region has no numbers.
  if (deviceHelplines().includes(HELPLINE_DIRECTORY)) return null;
  return deviceRegion() ? null : HELPLINE_DIRECTORY;
}

const noSubscribe = () => () => {};

/**
 * False while a web page is pre-rendered at build time, and in the first
 * client render that hydrates that HTML; true everywhere else.
 *
 * The static web export renders every page on the build machine, so a
 * region-dependent line in that HTML was the build machine's region (one
 * region's lines on a page opened in another) until hydration swapped it, with a
 * hydration mismatch on top. Screens render their region's lines only once
 * this is true, so the web never shows the wrong region first. Native never
 * pre-renders, so there it is true from the very first render and no
 * helpline is ever held back.
 */
export function useRegionKnown(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => true,
    () => false,
  );
}

/**
 * A row's title and its dialable number, split at the " · " in the name, so
 * the number can sit on a line of its own and never wrap mid-number when
 * someone is reading it off to dial from another phone. `number` is null when the name has no separate
 * number part (the directory row).
 */
export function helplineParts(line: Helpline): { title: string; number: string | null } {
  const dot = line.name.indexOf(' · ');
  if (dot < 0) return { title: line.name, number: null };
  return { title: line.name.slice(0, dot), number: line.name.slice(dot + 3) };
}

export type HelplineMode = 'call' | 'text';

/** True when the line's primary action is a text rather than a call. */
export function isTextLine(line: Helpline): boolean {
  return line.uri.startsWith('sms:');
}

/** True when the line takes both calls and texts, so a row should offer both. */
export function canCallAndText(line: Helpline): boolean {
  return line.uri.startsWith('tel:') && !!line.sms;
}

/** Screen-reader hint for a helpline action, e.g. "Calls" and the number. */
/**
 * What a screen reader says for a helpline row: the action, the name and
 * number, then the line under it (where, cost, hours). The label replaces
 * the row's children, so without that line a VoiceOver user could not tell
 * Manitoba's line from Saskatchewan's, or hear that a line is not 24/7.
 */
export function helplineLabel(line: Helpline, mode?: HelplineMode): string {
  const { title, number } = helplineParts(line);
  const named = `${title}${number ? `, ${number}` : ''}`;
  // The separate Text button sits beside a row that has already said it all.
  if (mode === 'text') return `Text ${named}`;
  const sub = line.sub ? `. ${line.sub.replace(/ · /g, ', ')}` : '';
  if (line.uri.startsWith('https:')) return `${line.name}${sub}`;
  return `${isTextLine(line) ? 'Text' : 'Call'} ${named}${sub}`;
}

export function helplineHint(line: Helpline, mode?: HelplineMode): string {
  if (line.uri.startsWith('https:')) return `Opens ${line.number} in your browser`;
  if (mode === 'text' || (mode !== 'call' && isTextLine(line))) return `Starts a text to ${line.number}`;
  // The number in the name is what the tap dials. `number` can differ: for
  // a short-code line it is the fallback to use from another phone.
  return `Calls ${helplineParts(line).number ?? line.number}`;
}

function targetFor(line: Helpline, mode?: HelplineMode): string {
  if (mode === 'text') return line.sms ?? line.uri;
  return line.uri;
}

/**
 * Open a helpline, and never fail silently.
 *
 * On an iPad, a Wi-Fi tablet or a phone with no SIM, tel: and sms: cannot be
 * opened, and a helpline button that does nothing is the one control this app
 * cannot afford to have fail quietly. So: ask the OS first, try anyway (the
 * check is not trustworthy on its own - iOS answers false for any scheme the
 * build did not declare, and Android 11+ answers false without a matching
 * <queries> entry, even where dialling works), and if the open itself fails,
 * show the line's name and number so it can be dialled from another phone.
 */
export async function openHelpline(line: Helpline, mode?: HelplineMode): Promise<void> {
  const target = targetFor(line, mode);
  let supported = false;
  try {
    supported = await Linking.canOpenURL(target);
  } catch {
    supported = false;
  }
  try {
    await Linking.openURL(target);
    return;
  } catch {
    // Fall through to the visible fallback below.
  }
  const texting = target.startsWith('sms:');
  const web = target.startsWith('https:');
  const message = web
    ? `We couldn't open the page. You can find it at ${line.number} in any browser.`
    : texting
      ? `This device can't send texts${supported ? ' right now' : ''}. You can text ${line.number} from any phone.`
      : `This device can't make calls${supported ? ' right now' : ''}. You can call ${line.number} from any phone.`;
  Alert.alert(line.name, message);
}
