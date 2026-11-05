import React from 'react';
import { StyleSheet, View } from 'react-native';
import { type DayKey, dayKeyToDate } from '@/lib/day';
import type { CloseoutMark } from '@/lib/weekly';
import { colors } from '@/theme/tokens';

/**
 * One day's close-out mark, shared by the month calendar and the week strip.
 *
 * Clean is an ember dot, a close call beaten is an ember ring (it counts
 * every bit as much), and a slip is a short grey dash. Never red, never a
 * cross: a slip is something that happened, not a grade. Each mark has its
 * own shape as well as its own colour, so none of them depends on telling
 * ember from grey. A day with nothing logged draws nothing at all - it is
 * not "missed", it is just a day.
 */
export function CloseMark({ mark, size = 10 }: { mark: CloseoutMark | null; size?: number }) {
  const shape = { width: size, height: size, borderRadius: size / 2 };
  if (mark === 0) return <View style={[shape, styles.clean]} />;
  if (mark === 1) return <View style={[shape, styles.close, { borderWidth: Math.max(1.5, size / 5) }]} />;
  if (mark === 2) {
    const thick = Math.max(2, Math.round(size / 4));
    return (
      <View style={[shape, styles.center]}>
        <View style={[styles.slip, { width: size, height: thick, borderRadius: thick / 2 }]} />
      </View>
    );
  }
  return <View style={shape} />;
}

/** Screen-reader words for each mark. Blank days say nothing about missing. */
export const MARK_LABEL: Record<CloseoutMark, string> = {
  0: 'clean',
  1: 'close call beaten',
  2: 'slip logged',
};

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Sunday-first, matching Date.getDay(). */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * "Saturday, October 3" (long) or "Sat, Oct 3" (short). Built by hand rather
 * than with toLocaleDateString so it reads the same on every engine.
 */
export function formatDay(key: DayKey, style: 'long' | 'short' = 'short'): string {
  const d = dayKeyToDate(key);
  if (Number.isNaN(d.getTime())) return '';
  const wd = WEEKDAY_NAMES[d.getDay()];
  const mo = MONTH_NAMES[d.getMonth()];
  return style === 'long'
    ? `${wd}, ${mo} ${d.getDate()}`
    : `${wd.slice(0, 3)}, ${mo.slice(0, 3)} ${d.getDate()}`;
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  clean: { backgroundColor: colors.accent },
  close: { borderColor: colors.accent },
  // Neutral: the same grey as quiet text, nowhere near a warning colour.
  slip: { backgroundColor: colors.textFaint },
});
