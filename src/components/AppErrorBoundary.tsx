import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HelplineName } from '@/components/HelplineRow';
import { recordFatal, track } from '@/lib/analytics';
import { deviceHelplines, openHelpline } from '@/lib/helplines';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * First-party error reporting, and nothing more.
 *
 * We deliberately do not ship a third-party crash reporter: a crash report
 * from a gambling-recovery app carries the screen and state the user was in,
 * and that is not ours to hand to another company. But with no signal at all,
 * a crash on the first real devices would go unnoticed. So errors go to our
 * own events table as `app_error` with three fields: the error's class name
 * (TypeError, RangeError...), where it was caught, and whether it was fatal.
 * No message text and no stack - either can carry user data. `app_error` is
 * not on the PostHog allowlist, so it never leaves our backend, and like every
 * event it is dropped when "Share usage data" is off.
 */
function errorClass(error: unknown): string {
  const raw = error instanceof Error ? error.name : typeof error;
  return /^[A-Za-z0-9_$]{1,40}$/.test(raw) ? raw : 'Error';
}

export function reportAppError(error: unknown, where: string, fatal: boolean): void {
  try {
    track('app_error', { name: errorClass(error), where, fatal });
  } catch {
    // Reporting must never be the second crash.
  }
}

/**
 * The fatal variant: written to the offline outbox before the process dies,
 * and sent on the next launch. Resolves once the write has settled, or after
 * `capMs` at the latest, so the crash it precedes is never held up for long.
 */
export function reportFatalError(error: unknown, where: string, capMs = 800): Promise<void> {
  let name = 'Error';
  try {
    name = errorClass(error);
  } catch {}
  return Promise.race([
    recordFatal('app_error', { name, where, fatal: true }),
    new Promise<void>((resolve) => setTimeout(resolve, capMs)),
  ]);
}

/**
 * Last line of defence for an uncaught render error.
 *
 * Without this a render bug is a white screen with no way out. Users get a way
 * to recover instead of a dead app, and we get an `app_error` event.
 *
 * The helplines are on this screen on purpose. Someone may be opening Winback
 * mid-craving; a crash must not be the thing that stands between them and
 * crisis support. Everything else here can fail - those numbers still dial.
 */
export function AppErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => reportAppError(error, 'render', false), [error]);
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.wordmark}>Winback</Text>
        <Text style={styles.title} accessibilityRole="header">
          Something broke on our end.
        </Text>
        <Text style={styles.body}>
          Your streak is safe - it is stored on this device and on our servers, not on this screen.
          Try again, and if it keeps happening, reopen the app.
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
            // openHelpline shows the number when this device cannot dial it.
            onPress={() => void openHelpline(line)}
          >
            <HelplineName line={line} style={styles.helpNumber} />
            <Text style={styles.helpSub}>{line.sub}</Text>
          </Pressable>
        ))}

        {__DEV__ && <Text style={styles.detail}>{String(error?.message ?? error)}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.screenX, paddingTop: 80, paddingBottom: 40 },
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
  detail: { fontFamily: fonts.body.regular, fontSize: 11, color: colors.textFaint, marginTop: 28 },
});
