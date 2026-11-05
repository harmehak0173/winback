import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { requestReminderPermission } from '@/lib/notifications';
import { useAppState } from '@/state/AppState';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * What reminders do, shown once, before the OS permission prompt.
 *
 * The OS asks exactly once. Asked cold at commit, stacked on the moment of
 * deciding to quit, it was a system dialog with no context and an easy "Don't
 * Allow" that could never be taken back from inside the app. This screen says
 * what the reminders are for, that they never carry money, and whether they
 * are discreet, then asks. There is one way forward and it always reaches the
 * system prompt: App Review (5.1.1(iv)) rejects a pre-permission screen with
 * an exit that skips the request. The OS dialog has its own "Don't Allow",
 * and You > Reminders can ask again (or open Settings) later.
 *
 * Shown after commit (commit.tsx), and from Home for anyone who reached it
 * another way - the safety screen, or a sign-in on a new phone, where the
 * permission is per device.
 */

const POINTS = [
  'A morning check-in and an evening close-out, at times you choose.',
  'A heads-up before the moments that tend to be hardest: payday, late nights, milestones.',
  'Never more than three a day. Each one opens the screen it talks about.',
  'No money amounts in any reminder, ever.',
];

export default function RemindersIntro() {
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { discreetNotifications, setDiscreetNotifications, markPrimed } = useAppState();
  const [busy, setBusy] = useState(false);

  // Straight after commit there is nothing underneath worth going back to.
  const next = () => {
    if (from !== 'commit' && router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const proceed = async () => {
    if (busy) return;
    setBusy(true);
    const granted = await requestReminderPermission();
    track('notification_permission', { granted });
    // Also rebuilds the schedule, now that permission may have changed.
    markPrimed();
    setBusy(false);
    next();
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Eyebrow>Reminders</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          A nudge at the moments that count.
        </Text>
        <View style={styles.points}>
          {POINTS.map((p) => (
            <View key={p} style={styles.point}>
              <View style={styles.dot} />
              <Text style={styles.pointText}>{p}</Text>
            </View>
          ))}
        </View>

        <View style={styles.discreet}>
          <Text style={styles.discreetText}>
            {discreetNotifications
              ? 'Discreet is on. Reminders never mention betting, your streak or your teams, so a glance at your lock screen shows nothing personal.'
              : 'Reminders can name your streak and your teams. If someone else might see your lock screen, use discreet reminders.'}
          </Text>
          {/* Named by what it does ("Use discreet reminders"), so the name
              spoken is the words on screen; the line above says the state. */}
          <Pressable
            style={styles.discreetButton}
            onPress={() => setDiscreetNotifications(!discreetNotifications)}
            accessibilityRole="button"
          >
            <Text style={styles.discreetLabel}>
              {discreetNotifications ? 'Use normal reminders' : 'Use discreet reminders'}
            </Text>
          </Pressable>
        </View>

        <Text style={styles.fine}>Change the times, or turn any of them off, in You.</Text>
      </ScrollView>

      <EmberButton
        label={busy ? 'One moment…' : 'Continue'}
        onPress={proceed}
        disabled={busy}
        accessibilityHint="Asks your phone for permission to send reminders"
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: spacing.screenX, paddingBottom: 30 },
  // On a short phone the list scrolls; keep its clipped edge off the button.
  scroll: { flex: 1, marginBottom: 14 },
  content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },
  headline: {
    fontFamily: fonts.display.black,
    fontSize: 32,
    lineHeight: 32 * 1.12,
    letterSpacing: tracking(32),
    color: colors.text,
    marginTop: 10,
  },
  points: { marginTop: 22, gap: 14 },
  point: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent, marginTop: 8 },
  pointText: {
    flex: 1,
    fontFamily: fonts.body.regular,
    fontSize: 15,
    lineHeight: 15 * 1.5,
    color: colors.textMuted,
  },
  discreet: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    padding: 16,
    marginTop: 26,
  },
  discreetText: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
    color: colors.textMuted,
  },
  discreetButton: {
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingVertical: 11,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  discreetLabel: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.text },
  fine: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    color: colors.textDim,
    marginTop: 18,
  },
});
