import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { Screen } from '@/components/Screen';
import { DAY_MS, splitMoney } from '@/lib/format';
import { useNow } from '@/hooks/useNow';
import { useAppState } from '@/state/AppState';
import { GOAL_REVEAL } from '@/state/quiz-data';
import { colors, fonts, tracking } from '@/theme/tokens';

/**
 * Cost reveal 3 - the flip. Previews the money-won-back counter at $0.00
 * ticking up live at the user's daily rate.
 *
 * The figure is the user's own estimate of what goes into betting, not a
 * measured loss, so the copy promises only what is true: from today it stays
 * with them. The first milestone named here is the first one in the list
 * (day 1), matching what the Streak tab will show.
 */
export default function Reveal3() {
  const router = useRouter();
  const { yearlyLoss, dailyRate, goalIndex, answers } = useAppState();
  const [startedAt] = useState(() => Date.now());
  const now = useNow();

  const ticking = ((now - startedAt) / DAY_MS) * dailyRate;
  const [intPart, decPart] = splitMoney(Math.max(0, ticking));

  const oneYearOut = new Date();
  oneYearOut.setFullYear(oneYearOut.getFullYear() + 1);
  const dateText = oneYearOut.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const goalPhrase = answers.goal != null ? GOAL_REVEAL[goalIndex] : null;

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.center}>
        <Text style={styles.headline} accessibilityRole="header">
          Here's the good news: from today, that money stays with you.
        </Text>
        <Text style={styles.sub}>
          Your Winback plan starts today. First milestone: one day clean. By {dateText}, your
          counter could read{' '}
          <Text style={styles.subStrong}>${yearlyLoss.toLocaleString('en-US')}</Text>.
        </Text>
        <View style={styles.card}>
          <Eyebrow>Money won back</Eyebrow>
          <View
            style={styles.moneyRow}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`$${intPart}.${decPart} won back so far`}
          >
            <Text style={styles.moneyInt} maxFontSizeMultiplier={1.2}>
              ${intPart}
            </Text>
            <Text style={styles.moneyDec} maxFontSizeMultiplier={1.2}>
              .{decPart}
            </Text>
          </View>
          {goalPhrase && (
            <Text style={styles.goalLine}>
              That's your {goalPhrase} - not their revenue.
            </Text>
          )}
        </View>
      </ScrollView>
      <EmberButton label="Continue" onPress={() => router.push('/onboarding/commit')} style={styles.cta} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 30, paddingBottom: 30 },
  scroll: { flex: 1 },
  center: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20 },
  headline: {
    fontFamily: fonts.display.extrabold,
    fontSize: 30,
    lineHeight: 30 * 1.18,
    letterSpacing: tracking(30, -0.01),
    color: colors.text,
  },
  sub: {
    fontFamily: fonts.body.regular,
    fontSize: 15,
    lineHeight: 15 * 1.55,
    color: colors.textMuted,
    marginTop: 16,
  },
  subStrong: { fontFamily: fonts.body.semibold, color: colors.text },
  card: {
    marginTop: 26,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
  },
  moneyRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 },
  moneyInt: {
    fontFamily: fonts.display.extrabold,
    fontSize: 44,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  moneyDec: {
    fontFamily: fonts.display.bold,
    fontSize: 22,
    color: colors.accentDim,
    fontVariant: ['tabular-nums'],
  },
  goalLine: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 10,
    textAlign: 'center',
  },
  cta: { marginTop: 12 },
});
