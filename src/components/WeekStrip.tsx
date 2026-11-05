import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { CloseMark, formatDay, MARK_LABEL } from '@/components/CloseMark';
import type { WeekSummary } from '@/lib/weekly';
import { colors, fonts } from '@/theme/tokens';

/**
 * Monday to Sunday, one mark per closed-out day (hook 8). It fills in one
 * close-out at a time. Days still to come and days with nothing logged look
 * the same - empty - because neither is anything to answer for.
 *
 * Read as one sentence by screen readers rather than fourteen fragments.
 */
export function WeekStrip({ week }: { week: WeekSummary }) {
  const spoken = week.days
    .filter((d) => !d.isFuture)
    .map((d) => `${formatDay(d.key, 'long').split(',')[0]}: ${d.mark == null ? 'nothing logged' : MARK_LABEL[d.mark]}`)
    .join('. ');

  return (
    <View style={styles.row} accessible accessibilityRole="text" accessibilityLabel={`This week. ${spoken}.`}>
      {week.days.map((d) => (
        <View key={d.key} style={styles.col}>
          <Text
            style={[styles.label, d.isToday && styles.labelToday]}
            maxFontSizeMultiplier={1.4}
          >
            {d.label}
          </Text>
          <View style={[styles.cell, d.isToday && styles.cellToday]}>
            <CloseMark mark={d.mark} size={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  col: { alignItems: 'center', flex: 1, gap: 6 },
  label: { fontFamily: fonts.body.semibold, fontSize: 11, color: colors.textFaint },
  labelToday: { color: colors.accent },
  cell: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.hairlineDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellToday: { borderWidth: 1, borderColor: colors.accentDim },
});
