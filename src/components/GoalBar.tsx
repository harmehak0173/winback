import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatDollars } from '@/lib/format';
import type { GoalProgress, GoalProgressItem } from '@/state/AppState';
import { colors, fonts } from '@/theme/tokens';

/**
 * The goal jar under the money figure (hook 9): the estimate gets a
 * destination. A thin bar and one line, nothing more.
 *
 * The bar is filled from the ESTIMATE, and says so on the goal sheet; real
 * transfers ("I moved it") are shown on their own line and never mixed in,
 * so the estimate is never mistaken for a balance. There is no schedule to
 * fall behind and no "behind" message - a goal only fills.
 */
export function GoalBar({
  progress,
  dailyRate,
  onPress,
}: {
  progress: GoalProgress;
  dailyRate: number;
  onPress: () => void;
}) {
  // Whole dollars reads best, but a light bettor's $2.40 must not round to $2.
  const rate = dailyRate >= 10 ? formatDollars(dailyRate) : `$${dailyRate.toFixed(2)}`;
  const item = currentGoal(progress);

  if (!item) {
    return (
      <Pressable
        onPress={onPress}
        style={styles.wrap}
        accessibilityRole="button"
        accessibilityLabel={`${rate} a day you would have bet, now yours. Give it a job.`}
        accessibilityHint="Opens the goal sheet"
      >
        <Text style={styles.sub}>{rate}/day you would've bet - now yours</Text>
        <Text style={styles.link}>Give it a job</Text>
      </Pressable>
    );
  }

  const { goal, fraction, filled } = item;
  const pct = fraction == null ? null : Math.floor(fraction * 100);
  const line = filled ? `${goal.name}: filled.` : `+${rate} a day toward ${goal.name}`;

  return (
    <Pressable
      onPress={onPress}
      style={styles.wrap}
      accessibilityRole="button"
      accessibilityLabel={[
        `Goal: ${goal.name}`,
        pct != null ? `${pct} percent` : null,
        line,
        progress.moved > 0 ? `Actually moved: ${formatDollars(progress.moved)}` : null,
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint="Opens the goal sheet"
    >
      {pct != null && (
        <>
          <View style={styles.barHead}>
            <Text style={styles.goalName} numberOfLines={1}>
              {goal.name}
            </Text>
            <Text style={styles.pct}>{pct}%</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, Math.min(100, pct))}%` }]} />
          </View>
        </>
      )}
      <Text style={styles.sub}>{line}</Text>
      {progress.moved > 0 && (
        <Text style={styles.moved}>Actually moved: {formatDollars(progress.moved)}</Text>
      )}
    </Pressable>
  );
}

/**
 * The goal to show on Home: the first one still filling (goals fill in order),
 * or the last one once every goal is full.
 */
export function currentGoal(progress: GoalProgress): GoalProgressItem | null {
  const goals = progress.goals;
  if (!goals.length) return null;
  return goals.find((g) => !g.filled) ?? goals[goals.length - 1];
}

const styles = StyleSheet.create({
  wrap: { marginTop: 8, paddingVertical: 2 },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 6 },
  goalName: { flex: 1, fontFamily: fonts.body.medium, fontSize: 12.5, color: colors.textMuted },
  pct: { fontFamily: fonts.display.bold, fontSize: 12.5, color: colors.accent, fontVariant: ['tabular-nums'] },
  track: { height: 4, borderRadius: 2, backgroundColor: colors.hairlineDim, overflow: 'hidden' },
  fill: { height: 4, borderRadius: 2, backgroundColor: colors.accent },
  sub: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textDim, marginTop: 6 },
  link: { fontFamily: fonts.body.semibold, fontSize: 12.5, color: colors.accent, marginTop: 4 },
  moved: { fontFamily: fonts.body.medium, fontSize: 12, color: colors.textMuted, marginTop: 3 },
});
