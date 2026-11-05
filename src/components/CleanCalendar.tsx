import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { CloseMark, MARK_LABEL, MONTH_NAMES } from '@/components/CloseMark';
import { ChevronLeftIcon } from '@/components/icons';
import { addDays, type DayKey, dayKeyToDate, localDayKey, weekdayIndex } from '@/lib/day';
import { CLOSEOUT_WINDOW_DAYS } from '@/lib/restore';
import type { CloseoutMark } from '@/lib/weekly';
import { colors, fonts } from '@/theme/tokens';

const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
// Indexed by Date.getDay(), for the spoken day labels.
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * The month view on the Streak tab (hook 2): a record a slip cannot erase.
 *
 * Ember dot for a clean day, ember ring for a close call beaten, neutral grey
 * for a slip. A day with nothing logged is simply blank - never red, never
 * crossed out, never counted as missed. No number here is derived from these
 * marks: the lifetime totals live in LifetimeStats and only ever go up.
 *
 * Goes back as far as the device keeps records (CLOSEOUT_WINDOW_DAYS).
 */
export function CleanCalendar({
  closeouts,
  todayKey,
}: {
  closeouts: Record<DayKey, CloseoutMark>;
  todayKey: DayKey;
}) {
  // Months back from the current one: 0 = this month.
  const [back, setBack] = useState(0);

  const today = dayKeyToDate(todayKey);
  const earliest = dayKeyToDate(addDays(todayKey, -(CLOSEOUT_WINDOW_DAYS - 1)));
  const maxBack =
    (today.getFullYear() - earliest.getFullYear()) * 12 + (today.getMonth() - earliest.getMonth());
  const shown = Math.min(back, maxBack);

  const first = new Date(today.getFullYear(), today.getMonth() - shown, 1);
  const monthName = MONTH_NAMES[first.getMonth()];
  const title = `${monthName} ${first.getFullYear()}`;
  // Say the new month when it changes: the button keeps focus, and the title
  // that changed is elsewhere on screen.
  const shownBefore = useRef(title);
  useEffect(() => {
    if (shownBefore.current === title) return;
    shownBefore.current = title;
    AccessibilityInfo.announceForAccessibility(title);
  }, [title]);
  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const lead = weekdayIndex(localDayKey(first));
  const cells: (DayKey | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) =>
      localDayKey(new Date(first.getFullYear(), first.getMonth(), i + 1)),
    ),
  ];
  while (cells.length % 7) cells.push(null);
  const rows = Array.from({ length: cells.length / 7 }, (_, r) => cells.slice(r * 7, r * 7 + 7));

  const canBack = shown < maxBack;
  const canForward = shown > 0;

  return (
    <View>
      <View style={styles.header}>
        <Pressable
          onPress={() => setBack(shown + 1)}
          disabled={!canBack}
          hitSlop={8}
          style={[styles.nav, !canBack && styles.navOff]}
          accessibilityRole="button"
          accessibilityLabel="Previous month"
          aria-disabled={!canBack}
        >
          <ChevronLeftIcon size={18} color={colors.textMuted} />
        </Pressable>
        <Text style={styles.title} accessibilityRole="header" maxFontSizeMultiplier={1.4}>
          {title}
        </Text>
        <Pressable
          onPress={() => setBack(shown - 1)}
          disabled={!canForward}
          hitSlop={8}
          style={[styles.nav, styles.navFlip, !canForward && styles.navOff]}
          accessibilityRole="button"
          accessibilityLabel="Next month"
          aria-disabled={!canForward}
        >
          <ChevronLeftIcon size={18} color={colors.textMuted} />
        </Pressable>
      </View>

      <View style={styles.row} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {WEEKDAY_INITIALS.map((d, i) => (
          <Text key={i} style={[styles.cell, styles.weekday]} maxFontSizeMultiplier={1.3}>
            {d}
          </Text>
        ))}
      </View>

      {rows.map((row, r) => (
        <View key={r} style={styles.row}>
          {row.map((key, c) => {
            if (!key) {
              return (
                <View
                  key={c}
                  style={styles.cell}
                  importantForAccessibility="no-hide-descendants"
                  accessibilityElementsHidden
                />
              );
            }
            const n = Number(key.slice(8));
            const mark = closeouts[key] ?? null;
            const isToday = key === todayKey;
            const future = key > todayKey;
            // Weekday and year too: the weekday row is hidden from screen readers,
            // and the 400-day window can show the same month in two years.
            const weekday = WEEKDAY_NAMES[dayKeyToDate(key).getDay()];
            const label = `${weekday}, ${monthName} ${n}, ${first.getFullYear()}${mark != null ? `, ${MARK_LABEL[mark]}` : ''}${isToday ? ', today' : ''}`;
            return (
              <View key={key} style={styles.cell} accessible accessibilityLabel={label}>
                <Text
                  style={[styles.date, future && styles.dateFuture, isToday && styles.dateToday]}
                  maxFontSizeMultiplier={1.3}
                >
                  {n}
                </Text>
                <View style={styles.markSlot}>
                  <CloseMark mark={mark} size={8} />
                </View>
              </View>
            );
          })}
        </View>
      ))}

      <View style={styles.legend} accessible accessibilityLabel="Ember dot: clean. Ember ring: close call beaten. Grey dash: slip logged. Blank days are just days.">
        <View style={styles.legendItem}>
          <CloseMark mark={0} size={8} />
          <Text style={styles.legendText}>Clean</Text>
        </View>
        <View style={styles.legendItem}>
          <CloseMark mark={1} size={8} />
          <Text style={styles.legendText}>Close call beaten</Text>
        </View>
        <View style={styles.legendItem}>
          <CloseMark mark={2} size={8} />
          <Text style={styles.legendText}>Slip</Text>
        </View>
      </View>
      <Text style={styles.note}>Blank days are just days. Nothing here is ever marked missed.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  nav: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  navFlip: { transform: [{ scaleX: -1 }] },
  navOff: { opacity: 0.3 },
  // Shrinks rather than pushing Next off the row at large text sizes.
  title: { flexShrink: 1, textAlign: 'center', fontFamily: fonts.display.bold, fontSize: 15.5, color: colors.text },
  row: { flexDirection: 'row' },
  // One seventh of the row.
  cell: { width: '14.2857%', alignItems: 'center', paddingVertical: 5 },
  weekday: { fontFamily: fonts.body.semibold, fontSize: 11, color: colors.textFaint, textAlign: 'center' },
  date: { fontFamily: fonts.body.medium, fontSize: 13, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  // Dimmer than past days, still 4.59:1 on the card (60% opacity was 2.44:1).
  dateFuture: { color: colors.textFaint },
  dateToday: { fontFamily: fonts.display.bold, color: colors.accent },
  markSlot: { height: 12, justifyContent: 'center', marginTop: 3 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendText: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textDim },
  note: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textFaint, marginTop: 8 },
});
