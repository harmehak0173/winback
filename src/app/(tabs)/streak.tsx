import { useRouter } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CleanCalendar } from '@/components/CleanCalendar';
import { countdownText } from '@/components/CountdownLabel';
import { CheckIcon, FlameIcon } from '@/components/icons';
import { Eyebrow } from '@/components/Eyebrow';
import { LifetimeStats } from '@/components/LifetimeStats';
import { Screen } from '@/components/Screen';
import { WeekStrip } from '@/components/WeekStrip';
import { useNow } from '@/hooks/useNow';
import { DAY_MS } from '@/lib/format';
import { useAppState } from '@/state/AppState';
import { milestonesThrough } from '@/state/milestones';
import { colors, fonts, spacing } from '@/theme/tokens';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The record: this week, the month calendar, the lifetime wins column and
 * the milestone badges.
 *
 * Two kinds of number live here and they are kept visibly apart. The run
 * (day N) resets on a slip, because that is what a run is. Everything else -
 * clean days logged, urges ridden out, badges earned - only ever goes up.
 * A badge earned in any run stays lit; the current run is shown beside it,
 * never instead of it.
 */
export default function Streak() {
  const router = useRouter();
  const { quitDate, bestStreakDays, closeouts, todayKey, lifetime, week } = useAppState();
  const now = useNow(60_000);

  const days = quitDate ? Math.floor(Math.max(0, now - new Date(quitDate).getTime()) / DAY_MS) : 0;
  // Everything reached in any run, plus the next one of this run.
  const milestones = milestonesThrough(Math.max(days, bestStreakDays));
  const next = milestones.find((m) => m.days > days) ?? null;
  const countdown = next
    ? countdownText({ days: next.days, title: next.title, inDays: next.days - days })
    : null;
  // The first year's badges always show, as something to look ahead to.
  // Anniversaries after that appear once reached, plus the next one.
  const reached = Math.max(days, bestStreakDays);
  const shown = milestones.filter((m) => m.days <= 365 || m.days <= reached || m === next);

  const weekLine = [
    week.cleanDays > 0 ? plural(week.cleanDays, 'clean day') : null,
    week.urgesRiddenOut > 0 ? `${plural(week.urgesRiddenOut, 'urge')} ridden out` : null,
    week.plansHeld > 0 ? `${plural(week.plansHeld, 'plan')} held` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Your record
        </Text>
        <Text style={styles.sub}>
          Day {days}.{countdown ? ` ${countdown}.` : ''}
        </Text>
        {/* A previous run is proof it can be done, so it is worth showing -
            never as a comparison the user is failing against. */}
        {bestStreakDays > 0 && (
          <Text style={styles.best}>
            {days >= bestStreakDays
              ? `Longest run yet: ${plural(days, 'day')}. You are at your best right now.`
              : `You have done ${plural(bestStreakDays, 'day')} before. You know the way back.`}
          </Text>
        )}

        <Eyebrow style={styles.section}>This week so far</Eyebrow>
        <Pressable
          style={styles.card}
          onPress={() => router.push('/recap')}
          accessibilityRole="button"
          accessibilityHint="Opens your week"
        >
          <WeekStrip week={week} />
          <View style={styles.weekFoot}>
            <Text style={styles.weekLine}>{weekLine || 'Each close-out adds a mark.'}</Text>
            <Text style={styles.weekLink}>See your week</Text>
          </View>
        </Pressable>

        <Eyebrow style={styles.section}>Your days</Eyebrow>
        <View style={styles.card}>
          <CleanCalendar closeouts={closeouts} todayKey={todayKey} />
        </View>

        <Eyebrow style={styles.section}>The wins column</Eyebrow>
        <Text style={styles.note}>These only go up. A slip resets the run, never these.</Text>
        <LifetimeStats lifetime={lifetime} />

        <Eyebrow style={styles.section}>Milestones</Eyebrow>
        {shown.map((m) => {
          const thisRun = days >= m.days;
          // Earned in an earlier run: still earned. Badges never un-earn.
          const before = !thisRun && bestStreakDays >= m.days;
          const earned = thisRun || before;
          const status = thisRun ? 'earned' : before ? `earned before, this run is on day ${days}` : 'ahead';
          return (
            <View
              key={m.days}
              style={[styles.badgeCard, earned && styles.badgeCardEarned]}
              accessible
              accessibilityLabel={`${m.title}, day ${m.days}, ${status}. ${m.body}`}
            >
              <View style={[styles.badge, earned && styles.badgeEarned]}>
                {earned ? (
                  <CheckIcon size={16} color={colors.onAccent} strokeWidth={3} />
                ) : (
                  <FlameIcon size={16} color={colors.textFaint} />
                )}
              </View>
              <View style={styles.cardText}>
                <View style={styles.cardHeader}>
                  <Text style={[styles.cardTitle, !earned && styles.cardTitleDim]}>{m.title}</Text>
                  <Eyebrow size={11} letterSpacingEm={0.18} color={earned ? colors.accent : colors.textFaint}>
                    {`Day ${m.days}`}
                  </Eyebrow>
                </View>
                {before && <Text style={styles.before}>Earned before. This run: day {days}.</Text>}
                <Text style={styles.cardBody}>{m.body}</Text>
              </View>
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screenX, paddingBottom: 40 },
  title: { fontFamily: fonts.display.extrabold, fontSize: 28, color: colors.text },
  sub: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: colors.textMuted,
    marginTop: 8,
  },
  best: {
    fontFamily: fonts.body.medium,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.accentDim,
    marginTop: 8,
  },
  section: { marginTop: 28, marginBottom: 10 },
  note: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textDim, marginTop: -4, marginBottom: 12 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    padding: 16,
  },
  weekFoot: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginTop: 14,
  },
  weekLine: { flexShrink: 1, fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textMuted },
  weekLink: { fontFamily: fonts.display.bold, fontSize: 13, color: colors.accent },
  badgeCard: {
    flexDirection: 'row',
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    padding: 16,
    marginBottom: 12,
  },
  badgeCardEarned: { borderColor: colors.accent, backgroundColor: colors.surfaceWarm },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.hairlineDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  badgeEarned: { backgroundColor: colors.accent },
  cardText: { flex: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  cardTitle: { flexShrink: 1, fontFamily: fonts.display.bold, fontSize: 15.5, color: colors.text },
  cardTitleDim: { color: colors.textMuted },
  before: { fontFamily: fonts.body.medium, fontSize: 12, color: colors.accentDim, marginTop: 4 },
  cardBody: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.textDim,
    marginTop: 5,
  },
});
