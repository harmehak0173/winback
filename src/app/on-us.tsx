import { Redirect, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { ModalBar, useLeave } from '@/components/ModalBar';
import { Screen } from '@/components/Screen';
import { HARDSHIP_DAYS, HARDSHIP_MAX_PER_YEAR, onUsDate } from '@/lib/hardship';
import { useAppState } from '@/state/AppState';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

const DAY = 86_400_000;
const COUNT_WORD: Record<number, string> = { 1: 'one', 2: 'two', 3: 'three' };
const countWord = (n: number) => COUNT_WORD[n] ?? String(n);

/** The paywall's own sentence: what never costs anything. */
const FREE_LINE =
  'The panic button, helplines, close-outs and your record, Today’s move, Today’s play, Cut the lines, one goal, lights out, reps and the weekly recap stay free.';

/**
 * "Premium is too much right now?" - a month of Premium on us (lib/hardship).
 *
 * Reached from a quiet link on the paywall and in You -> Membership, only
 * when there is nothing else: not subscribed, not in the free week, no month
 * already running. It asks for nothing - no card, no reason, no form - and
 * says plainly what it is. When none are left this year it says so, with the
 * date the next one opens and what stays free, and nothing else: no
 * countdown, no nudge toward the plans.
 */
export default function OnUs() {
  const router = useRouter();
  const leave = useLeave();
  const { ready, quitDate, storeChecked, subscribed, inFreeWeek, hardship, startHardship } =
    useAppState();
  const [starting, setStarting] = useState(false);

  if (!ready) return <Screen edges={['top']}>{null}</Screen>;
  if (!quitDate) return <Redirect href="/" />;

  const start = () => {
    if (starting) return;
    setStarting(true);
    if (!startHardship()) {
      setStarting(false);
      return;
    }
    AccessibilityInfo.announceForAccessibility(
      `Premium is on us until ${onUsDate(new Date(Date.now() + HARDSHIP_DAYS * DAY))}.`,
    );
    // Back to the tabs, past the paywall when it was opened from there.
    router.dismissTo('/(tabs)');
  };

  let headline: string;
  let body: string[];
  let canStart = false;
  if (subscribed) {
    headline = 'You already have Premium.';
    body = ['Your subscription is active, so there is nothing to start here.'];
  } else if (inFreeWeek) {
    headline = 'You are in your free week.';
    body = [
      'Premium is already on. If it is too much once the week ends, you can take 30 days on us then.',
    ];
  } else if (hardship.active && hardship.endsAt) {
    headline = `Premium is on us until ${onUsDate(hardship.endsAt)}.`;
    body = ['Nothing to do and nothing to pay. When it ends, the free version stays yours.'];
  } else if (hardship.paused) {
    // The clock guard in lib/hardship.ts: a month does not run while the
    // phone's date is set back, or it could be kept at its start for ever.
    headline = 'Check the date on your phone.';
    body = [
      'It reads earlier than a date Winback has already seen, so your 30 days on us are paused. Set the date to automatic and Premium comes back on.',
    ];
  } else if (!storeChecked) {
    // Until the store answers, "not subscribed" is only a default, and a
    // subscriber who started a month here would use one up for nothing.
    headline = 'One moment.';
    body = [
      'Winback has not heard back from your app store yet, so it cannot tell whether you already subscribe. Check your connection and try again in a moment.',
    ];
  } else if (hardship.remaining <= 0) {
    headline = 'You have taken all three months on us this year.';
    body = [
      hardship.nextOpensAt
        ? `Another one opens on ${onUsDate(hardship.nextOpensAt)}.`
        : 'Another one opens later in the year.',
      `${FREE_LINE} Nothing there runs out.`,
    ];
  } else if (hardship.clockBehind) {
    // Starting now would not run (the clock guard in lib/hardship.ts), so it
    // is not offered rather than quietly using one up.
    headline = 'Check the date on your phone.';
    body = [
      'It reads earlier than a date Winback has already seen, so 30 days on us cannot start right now. If the date is wrong, set it to automatic and try again.',
    ];
  } else {
    canStart = true;
    headline = 'Take 30 days of Premium on us.';
    body = [
      `No card, no catch, nothing to explain. You can do this up to ${countWord(HARDSHIP_MAX_PER_YEAR)} times a year.`,
      'When the 30 days end, nothing is charged and no plan starts. The free version stays yours.',
    ];
  }
  // Said once some have been taken, so the limit is never a surprise.
  const leftLine =
    canStart && hardship.used > 0
      ? hardship.remaining === 1
        ? 'This is the last one for this year.'
        : `You have ${countWord(hardship.remaining)} left this year.`
      : null;

  return (
    <Screen edges={['top', 'bottom']}>
      <ModalBar onClose={leave} />
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>Premium is too much right now?</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          {headline}
        </Text>
        {body.map((line) => (
          <Text key={line} style={styles.body}>
            {line}
          </Text>
        ))}
        {!!leftLine && <Text style={styles.quiet}>{leftLine}</Text>}
      </ScrollView>
      {/* Only when there is a choice to make; otherwise Close at the top is
          the one way out, so a screen reader does not meet two. */}
      {canStart && (
        <View style={styles.footer}>
          <EmberButton
            label="Start 30 days free"
            onPress={start}
            disabled={starting}
            accessibilityHint="Turns on Premium for 30 days. No card and no payment."
          />
          <Pressable onPress={leave} style={styles.secondary} accessibilityRole="button" hitSlop={8}>
            <Text style={styles.secondaryLabel}>Not now</Text>
          </Pressable>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenX, paddingTop: 12, paddingBottom: 24 },
  headline: {
    fontFamily: fonts.display.extrabold,
    fontSize: 27,
    lineHeight: 27 * 1.2,
    letterSpacing: tracking(27),
    color: colors.text,
    marginTop: 10,
  },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 15,
    lineHeight: 15 * 1.55,
    color: colors.textMuted,
    marginTop: 12,
  },
  quiet: { fontFamily: fonts.body.regular, fontSize: 13, color: colors.textDim, marginTop: 14 },
  footer: { paddingHorizontal: spacing.screenX, paddingTop: 8 },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  secondaryLabel: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});
