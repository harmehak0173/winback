import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Animated, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { LockCover, useLockCover } from '@/components/LockGate';
import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { track } from '@/lib/analytics';
import { useOverlayHold } from '@/lib/overlayHold';
import { shareMessage } from '@/lib/share';
import { useAppState } from '@/state/AppState';
import { Milestone } from '@/state/milestones';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * The moment a milestone is crossed.
 *
 * The app had eight milestones with real copy behind them and nothing marked
 * reaching one - the number simply ticked over. Crossing day 3 or day 7 is the
 * strongest thing that happens to a user in their first month, and it was
 * passing in silence.
 *
 * Deliberately calm: an ember pulse and a haptic, not confetti. This is an
 * audience being congratulated for not gambling, and the Instrument direction
 * is precision, not a slot-machine payout - celebrating like a casino would be
 * exactly wrong here. With Reduce Motion on, the ring simply sits lit.
 *
 * A comeback run (a milestone reached before, in an earlier run) gets its own
 * words - "you have done this before" - in the same tone as the first time,
 * never compared against the old best. Its day 1 is quieter still: no pulse,
 * a lighter tap, no share. The day after a slip is not a party.
 *
 * An RN Modal is drawn above everything, the app-lock cover included, so it
 * carries its own copy of that cover.
 */

/** Comeback words for a milestone reached before. Behaviour only, no claims. */
function comebackCopy(m: Milestone): { eyebrow: string; title: string; body: string } {
  if (m.days === 1) {
    return {
      eyebrow: 'Day one',
      title: 'Day one, again.',
      body: 'One whole day. You know how the first stretch goes, and you know the way through it.',
    };
  }
  return {
    eyebrow: 'Back here',
    title: `${m.title}, again.`,
    body: `You have done this before, and you just did it again. ${m.body}`,
  };
}
export function MilestoneCelebration({
  milestone,
  moneyWonBack,
  onDismiss,
}: {
  milestone: Milestone;
  moneyWonBack: string;
  onDismiss: () => void;
}) {
  const glow = useAnimatedValue(0);
  const reduced = useReducedMotion();
  const { bestStreakDays } = useAppState();
  const { covered } = useLockCover();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  // A tapped reminder waits until this is dismissed: on iOS a modal pushed
  // over it closes it natively, without onDismiss (see lib/overlayHold).
  useOverlayHold(true);
  // bestStreakDays covers earlier runs only (it is banked when a run resets),
  // so this is true exactly when the milestone was reached in a previous run.
  const comeback = bestStreakDays >= milestone.days;
  const quiet = comeback && milestone.days === 1;
  const copy = comeback
    ? comebackCopy(milestone)
    : { eyebrow: 'Milestone reached', title: milestone.title, body: milestone.body };

  useEffect(() => {
    if (quiet) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    else Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [quiet]);

  useEffect(() => {
    if (reduced || quiet) {
      glow.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, { toValue: 1, duration: 1600, useNativeDriver: true }),
        Animated.timing(glow, { toValue: 0, duration: 1600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow, reduced, quiet]);

  const share = () => {
    track('share_progress', { from: 'milestone' });
    // The day count and a link, the same as Home's share: no money amount,
    // which says more to whoever receives it than the person may mean to.
    Share.share({
      message: shareMessage(`${milestone.days} ${milestone.days === 1 ? 'day' : 'days'} clean of sports betting.`),
    }).catch(() => {});
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onDismiss}>
      {/* VoiceOver's escape gesture dismisses it like "Keep going", but not
          under the app lock: that would mark the milestone seen behind it. */}
      <View style={styles.backdrop} onAccessibilityEscape={covered ? undefined : onDismiss}>
        {/* At the largest text sizes the card is taller than the screen, and
            its only ways out, the panic link included, sat below the edge.
            It scrolls now; when it fits, it stays centred. */}
        <ScrollView
          bounces={false}
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + spacing.screenX, paddingBottom: insets.bottom + spacing.screenX },
          ]}
        >
          {/* Under the app lock, hidden from TalkBack too: a Modal is its own
              window on Android, out of reach of LockGate's own hiding. */}
          <View
            style={styles.card}
            importantForAccessibility={covered ? 'no-hide-descendants' : 'auto'}
            accessibilityElementsHidden={covered}
          >
            <Eyebrow>{copy.eyebrow}</Eyebrow>
            <Animated.View
              style={[styles.ring, { opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) }]}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${milestone.days} ${milestone.days === 1 ? 'day' : 'days'}`}
            >
              <Text style={styles.days} maxFontSizeMultiplier={1.15} numberOfLines={1} adjustsFontSizeToFit>
                {milestone.days}
              </Text>
              <Text style={styles.daysLabel} maxFontSizeMultiplier={1.3}>
                {milestone.days === 1 ? 'DAY' : 'DAYS'}
              </Text>
            </Animated.View>
            <Text style={styles.title} accessibilityRole="header">
              {copy.title}
            </Text>
            <Text style={styles.body}>{copy.body}</Text>
            {/* Cumulative: it survived the slip, so it is true on a comeback too. */}
            <Text style={styles.money}>{moneyWonBack} won back so far.</Text>
            <EmberButton label="Keep going" onPress={onDismiss} />
            {!quiet && (
              <Pressable
                onPress={share}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Share this milestone"
              >
                <Text style={styles.shareLink}>Share this</Text>
              </Pressable>
            )}
            {/* It covers Home's urge button, so it offers the way out itself:
                no modal ever stands between someone and the panic button. */}
            <Pressable
              onPress={() => {
                onDismiss();
                router.push('/panic');
              }}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.shareLink}>Feel an urge? Get through it</Text>
            </Pressable>
          </View>
        </ScrollView>
        <LockCover />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(5,6,8,0.92)',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.screenX,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 24,
    padding: 26,
    alignItems: 'center',
  },
  ring: {
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 3,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 18,
  },
  days: {
    fontFamily: fonts.display.black,
    fontSize: 52,
    color: colors.text,
    letterSpacing: tracking(52),
  },
  daysLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 10,
    letterSpacing: 10 * 0.26,
    color: colors.accent,
    marginTop: -4,
  },
  title: { fontFamily: fonts.display.extrabold, fontSize: 22, color: colors.text, textAlign: 'center' },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.55,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 14,
  },
  money: {
    fontFamily: fonts.display.bold,
    fontSize: 15,
    color: colors.accent,
    marginBottom: 20,
  },
  shareLink: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 14,
  },
});
