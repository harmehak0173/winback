import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Animated, Easing, ScrollView, StyleSheet, Text } from 'react-native';
import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { formatDollars } from '@/lib/format';
import { useAppState } from '@/state/AppState';
import { colors, fonts, tracking } from '@/theme/tokens';

const COUNT_MS = 1600;

/** Cost reveal 1 - the number, rolling 0 -> yearly with a cubic ease-out. */
export default function Reveal1() {
  const router = useRouter();
  const { yearlyLoss, monthlySpend } = useAppState();
  const anim = useAnimatedValue(0);
  const [value, setValue] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => track('funnel_reveal_viewed', { step: 1 }), []);

  useEffect(() => {
    const sub = anim.addListener(({ value: t }) => setValue(Math.round(yearlyLoss * t)));
    if (reduced) {
      // Reduce Motion: the number, without the roll.
      anim.setValue(1);
      return () => anim.removeListener(sub);
    }
    Animated.timing(anim, {
      toValue: 1,
      duration: COUNT_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(sub);
  }, [anim, yearlyLoss, reduced]);

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.center}>
        <Eyebrow heading size={13} letterSpacingEm={0.2} color={colors.textMuted}>
          At your current pace
        </Eyebrow>
        <Text
          style={styles.number}
          maxFontSizeMultiplier={1.2}
          adjustsFontSizeToFit
          numberOfLines={1}
          accessibilityLabel={formatDollars(yearlyLoss)}
        >
          {formatDollars(value)}
        </Text>
        {/* Deposits, not losses: the figure is built from what the user says
            they put in, and some of that comes back as winnings. Calling it
            what the betting companies "take" overstated it. */}
        <Text style={styles.line}>is roughly what you deposit with the betting companies every year.</Text>
        <Text style={styles.sub}>
          Over the next five years, that's{' '}
          <Text style={styles.subStrong}>{formatDollars(monthlySpend * 60)}</Text>.
        </Text>
      </ScrollView>
      <EmberButton label="Continue" onPress={() => router.push('/onboarding/reveal-2')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 30, paddingBottom: 30 },
  scroll: { flex: 1 },
  center: { flexGrow: 1, justifyContent: 'center', paddingVertical: 20 },
  number: {
    fontFamily: fonts.display.black,
    fontSize: 66,
    lineHeight: 66,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
    letterSpacing: tracking(66, -0.03),
    marginTop: 16,
    marginBottom: 8,
  },
  line: {
    fontFamily: fonts.display.bold,
    fontSize: 22,
    lineHeight: 22 * 1.3,
    color: colors.text,
  },
  sub: {
    fontFamily: fonts.body.regular,
    fontSize: 15.5,
    lineHeight: 15.5 * 1.5,
    color: colors.textMuted,
    marginTop: 20,
  },
  subStrong: {
    fontFamily: fonts.body.semibold,
    color: colors.text,
  },
});
