import { Redirect } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { HelplineName } from '@/components/HelplineRow';
import { Screen } from '@/components/Screen';
import { deviceHelplines, openHelpline } from '@/lib/helplines';
import { useAppState } from '@/state/AppState';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * Entry gate: users who have committed (quit date set) land on Home;
 * everyone else starts the onboarding quiz.
 *
 * If saved state could not be read at all, neither is true yet: sending that
 * user to Welcome would treat a committed user as a new one. They get a retry
 * instead, with the helplines, which never depend on saved state.
 */
export default function Index() {
  const { ready, quitDate, loadFailed, retryLoad } = useAppState();
  if (!ready) return loadFailed ? <LoadFailed retry={retryLoad} /> : null;
  return quitDate ? <Redirect href="/(tabs)" /> : <Redirect href="/onboarding/welcome" />;
}

function LoadFailed({ retry }: { retry: () => void }) {
  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.wordmark}>Winback</Text>
        <Text style={styles.title} accessibilityRole="header">
          Your progress didn&apos;t load.
        </Text>
        <Text style={styles.body}>
          This phone&apos;s storage didn&apos;t answer, so nothing was changed. Try again, and if it
          keeps happening, close Winback and open it again.
        </Text>
        <Pressable style={styles.button} onPress={retry} accessibilityRole="button">
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>

        <Text style={styles.helpLabel}>If you need someone right now</Text>
        {deviceHelplines().map((line) => (
          <Pressable
            key={line.name + line.uri}
            style={styles.helpRow}
            accessibilityRole="button"
            onPress={() => void openHelpline(line)}
          >
            <HelplineName line={line} style={styles.helpNumber} />
            <Text style={styles.helpSub}>{line.sub}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screenX, paddingTop: 48, paddingBottom: 40 },
  wordmark: { fontFamily: fonts.display.extrabold, fontSize: 20, color: colors.text },
  title: {
    fontFamily: fonts.display.extrabold,
    fontSize: 26,
    lineHeight: 26 * 1.2,
    letterSpacing: tracking(26),
    color: colors.text,
    marginTop: 22,
  },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.55,
    color: colors.textMuted,
    marginTop: 12,
  },
  button: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 22,
  },
  buttonLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent },
  helpLabel: {
    fontFamily: fonts.body.semibold,
    fontSize: 11,
    letterSpacing: 11 * 0.24,
    color: colors.textDim,
    marginTop: 34,
    marginBottom: 12,
    textTransform: 'uppercase',
  },
  helpRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    paddingVertical: 15,
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  helpNumber: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.text },
  helpSub: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textDim, marginTop: 2 },
});
