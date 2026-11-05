import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { localDayKey } from '@/lib/day';

/**
 * Push the current streak snapshot to the home-screen widget. Writes a small
 * blob to AsyncStorage (the headless widget handler reads it on its periodic
 * refresh) and, on Android, asks the widget to redraw immediately.
 * react-native-android-widget is required lazily so it never loads on web/iOS.
 */
export const WIDGET_KEY = 'winback.widget';
const DAY = 86_400_000;

export type WidgetSnapshot = {
  quitDate: string | null;
  dailyRate: number;
  lastCheckIn?: string | null;
  /**
   * The most recent day with any close-out mark, a slip included. A slip day
   * counts as closed in the app, so the widget must not keep offering a
   * close-out that records nothing. Older blobs lack it: lastCheckIn stands in.
   */
  closedDay?: string | null;
  /** Money kept during earlier streaks, so the widget matches Home exactly. */
  moneyKeptBefore?: number;
  /**
   * Discreet mode. The widget sits on the home screen where anyone holding
   * the phone can read it, so when this is on it shows neutral text only:
   * no day count, no money, nothing about betting.
   */
  discreet: boolean;
};

/** What the widget renders. Derived only here, see widgetView. */
export type WidgetView = {
  /** Neutral rendering: no numbers, no money, no recovery words. */
  discreet: boolean;
  /** False before onboarding (or after an erase): there is no day to close. */
  hasStreak: boolean;
  days: number;
  money: string;
  checkedInToday: boolean;
};

const finiteOr = (v: unknown, fallback: number) =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback;

/**
 * Read a stored snapshot defensively. The blob lives in AsyncStorage, which
 * any older build (or a corrupted write) may have left in another shape, and
 * the headless handler renders it with no app around to catch a throw.
 * Discreet is only off when it was explicitly stored as false, so a snapshot
 * from before discreet mode existed renders neutral until the app rewrites it.
 */
export function parseWidgetSnapshot(raw: string | null): WidgetSnapshot {
  let v: Record<string, unknown> = {};
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') v = parsed as Record<string, unknown>;
  } catch {}
  const quitDate =
    typeof v.quitDate === 'string' && Number.isFinite(new Date(v.quitDate).getTime())
      ? v.quitDate
      : null;
  return {
    quitDate,
    dailyRate: finiteOr(v.dailyRate, 0),
    lastCheckIn: typeof v.lastCheckIn === 'string' ? v.lastCheckIn : null,
    closedDay: typeof v.closedDay === 'string' ? v.closedDay : null,
    moneyKeptBefore: finiteOr(v.moneyKeptBefore, 0),
    discreet: v.discreet !== false,
  };
}

/**
 * The single place the widget's numbers are derived. The handler and the
 * live-update path both call it, so the two can never disagree - and it floors
 * the money the way Home does. Rounding here instead put the widget a dollar
 * ahead of the app on the same phone.
 */
export function widgetView({
  quitDate,
  dailyRate,
  lastCheckIn,
  closedDay,
  moneyKeptBefore = 0,
  discreet,
}: WidgetSnapshot): WidgetView {
  const closed = closedDay ?? lastCheckIn;
  const start = quitDate ? new Date(quitDate).getTime() : NaN;
  const hasStreak = Number.isFinite(start);
  const elapsed = hasStreak ? Math.max(0, Date.now() - start) : 0;
  const money = moneyKeptBefore + (elapsed / DAY) * dailyRate;
  return {
    // With no streak there is nothing worth showing, so fall back to the
    // neutral face rather than a "0 days, $0" card.
    discreet: discreet || !hasStreak,
    hasStreak,
    days: Math.floor(elapsed / DAY),
    money: '$' + Math.floor(money).toLocaleString('en-US'),
    checkedInToday: !!closed && closed === localDayKey(),
  };
}

/**
 * Wipe the widget snapshot on account deletion. The blob holds the quit date
 * and daily spend rate, so leaving it behind would keep the previous user's
 * streak and money figure rendering on the home screen after they erased
 * everything.
 */
export async function clearStreakWidget(): Promise<void> {
  try {
    await AsyncStorage.removeItem(WIDGET_KEY);
  } catch {}
  await updateStreakWidget({
    quitDate: null,
    dailyRate: 0,
    lastCheckIn: null,
    closedDay: null,
    discreet: true,
  });
}

/**
 * Accepts the snapshot object, or the older positional form with discreet
 * last. Both need discreet stated, so a caller cannot forget it and put the
 * numbers on a home screen by accident.
 */
export function updateStreakWidget(snapshot: WidgetSnapshot): Promise<void>;
export function updateStreakWidget(
  quitDate: string | null,
  dailyRate: number,
  lastCheckIn: string | null,
  moneyKeptBefore: number,
  discreet: boolean,
): Promise<void>;
export async function updateStreakWidget(
  first: WidgetSnapshot | string | null,
  dailyRate = 0,
  lastCheckIn: string | null = null,
  moneyKeptBefore = 0,
  discreet = true,
): Promise<void> {
  const snapshot: WidgetSnapshot =
    first !== null && typeof first === 'object'
      ? first
      : { quitDate: first, dailyRate, lastCheckIn, moneyKeptBefore, discreet };

  try {
    await AsyncStorage.setItem(
      WIDGET_KEY,
      JSON.stringify({
        quitDate: snapshot.quitDate,
        dailyRate: snapshot.dailyRate,
        lastCheckIn: snapshot.lastCheckIn ?? null,
        closedDay: snapshot.closedDay ?? null,
        moneyKeptBefore: snapshot.moneyKeptBefore ?? 0,
        discreet: snapshot.discreet,
      }),
    );
  } catch {}

  if (Platform.OS !== 'android') return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { requestWidgetUpdate } = require('react-native-android-widget');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const React = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { StreakWidget } = require('./StreakWidget');

    await requestWidgetUpdate({
      widgetName: 'Streak',
      renderWidget: () => React.createElement(StreakWidget, widgetView(snapshot)),
      widgetNotFound: () => {},
    });
  } catch {
    // Widget not added or module unavailable - nothing to do.
  }
}
