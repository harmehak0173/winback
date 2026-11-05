import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  AccessibilityInfo,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import {
  currentUserId,
  ensureSession,
  requestSignInCode,
  setSignInPending,
  verifySignInCode,
} from '@/lib/supabase';
import { useAppState } from '@/state/AppState';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * Sign back in on a new phone with a one-time code.
 *
 * A code rather than a magic link: links need deep-link plumbing and break
 * when the mail app opens them in its own browser. A six-digit code typed into
 * the app works everywhere and needs no redirect handling.
 *
 * No Google or Microsoft sign-in on purpose. Signing into a gambling-recovery
 * app with a social account leaves a visible "connected app" entry in that
 * account, which is exactly the exposure some of these users are avoiding.
 * Email reaches Gmail and Outlook users anyway, and leaves only a message they
 * can delete.
 *
 * Taps go through while the keyboard is up (keyboardShouldPersistTaps), so
 * Send and Sign in work on the first tap - the number pad has no return key,
 * and the first tap used to be spent just closing the keyboard.
 */
export default function SignIn() {
  const router = useRouter();
  const { restoreAccount, abandonSignIn } = useAppState();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const humanError = (e: string) =>
    /not authorized|rate limit|over_email/i.test(e)
      ? "We couldn't send the code just now. Please try again in a few minutes."
      : /expired|invalid|token/i.test(e)
        ? 'That code was wrong or has expired. Request a new one.'
        : "Something went wrong. Please try again.";

  const sendCode = async () => {
    const trimmed = email.trim();
    if (!trimmed.includes('@')) return Alert.alert('Enter a valid email');
    setBusy(true);
    const { error } = await requestSignInCode(trimmed);
    setBusy(false);
    // An address with no account gets the same answer as one with an
    // account. "No Winback account for that email" told anyone holding the
    // app - a partner, an employer - whether a given person uses a
    // gambling-recovery app, the one fact the rest of the design protects.
    const unknownAddress = !!error && /not found|no user|signups not allowed/i.test(error);
    if (error && !unknownAddress) return Alert.alert("Couldn't send the code", humanError(error));
    track('signin_code_requested');
    setSent(true);
    AccessibilityInfo.announceForAccessibility('Check your email for a 6-digit code, then enter it.');
  };

  const verify = async () => {
    if (code.trim().length < 6) return Alert.alert('Enter the 6-digit code');
    setBusy(true);
    // Who this device was before the sign-in. verifySignInCode clears the
    // session cache, so after it runs this is unrecoverable - and without it
    // an identity change is undetectable and the previous user's data rides
    // along into the account being signed into.
    //
    // Read from the stored session first: ensureSession() answers null while
    // its failure backoff runs (after any offline moment), which looked like
    // "no previous account" and skipped the wipe. It is only the fallback for
    // a device with no stored session at all.
    const previousUserId = (await currentUserId()) ?? (await ensureSession());
    const { error } = await verifySignInCode(email, code);
    if (error) {
      setBusy(false);
      return Alert.alert("Couldn't sign in", humanError(error));
    }
    // Until the account has been read, a relaunch drops this sign-in rather
    // than letting onboarding upload over history nobody could see.
    await setSignInPending(true);
    await finishSignIn(previousUserId);
  };

  // Reads the account. Retried from its own alert with the same session, so a
  // dropped connection does not mean another code.
  const finishSignIn = async (previousUserId: string | null) => {
    setBusy(true);
    const outcome = await restoreAccount(previousUserId);
    setBusy(false);
    if (outcome === 'failed') {
      Alert.alert(
        "Couldn't load your history",
        'Your code worked, but your history did not load. Nothing on this phone has changed. Check your connection and try again.',
        [
          { text: 'Not now', style: 'cancel', onPress: () => void backOut() },
          { text: 'Try again', onPress: () => void finishSignIn(previousUserId) },
        ],
        // Dismissing it would leave the sign-in half done.
        { cancelable: false },
      );
      return;
    }
    const restored = outcome === 'restored';
    track('signin_succeeded', { restored });
    Alert.alert(
      restored ? 'Welcome back' : 'Signed in',
      restored
        ? 'Your streak and history are back.'
        : "You're signed in. We didn't find previous history on this account.",
      // Clear the stack, then let the entry gate decide: Home when there is a
      // quit date (restored, or kept), onboarding when signing in as another
      // account wiped this device. A bare replace stacked a second tab
      // navigator over the first (two Homes, both ticking), and dismissTo
      // from Welcome left the quiz underneath Home for Android back to find.
      [
        {
          text: 'OK',
          onPress: () => {
            router.dismissAll();
            router.replace('/');
          },
        },
      ],
    );
  };

  const backOut = async () => {
    setBusy(true);
    await abandonSignIn();
    setBusy(false);
    setSent(false);
    setCode('');
    Alert.alert('Not signed in', 'Nothing on this phone changed. You can sign in again any time.');
  };

  return (
    <Screen edges={['top']}>
      {/* iOS: the ScrollView insets itself for the keyboard. Android draws
          edge-to-edge, where the window no longer shrinks for the keyboard,
          so padding is added here instead. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'android' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
        >
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Text style={styles.close}>Close</Text>
          </Pressable>
          <Text style={styles.title} accessibilityRole="header">
            Get your streak back
          </Text>
          <Text style={styles.body}>
            {sent
              ? `If ${email.trim()} has a Winback account, a 6-digit code is on its way. Enter it below. Nothing after a few minutes? Check the address and your spam folder.`
              : 'Enter the email you saved your progress with and we will send you a sign-in code.'}
          </Text>

          {!sent ? (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textFaint}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="send"
                onSubmitEditing={() => {
                  if (!busy) void sendCode();
                }}
                accessibilityLabel="Email address"
                style={styles.input}
              />
              <EmberButton label={busy ? 'Sending…' : 'Send my code'} disabled={busy} onPress={sendCode} />
            </>
          ) : (
            <>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="123456"
                placeholderTextColor={colors.textFaint}
                // The form below replaced the one that had focus.
                autoFocus
                keyboardType="number-pad"
                maxLength={6}
                autoComplete="one-time-code"
                textContentType="oneTimeCode"
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (!busy) void verify();
                }}
                accessibilityLabel="Six-digit sign-in code"
                style={[styles.input, styles.codeInput]}
              />
              <EmberButton label={busy ? 'Checking…' : 'Sign in'} disabled={busy} onPress={verify} />
              <Pressable onPress={() => setSent(false)} hitSlop={8} accessibilityRole="button">
                <Text style={styles.link}>Use a different email</Text>
              </Pressable>
            </>
          )}

          <Text style={styles.note}>
            Your streak, your quit date, and your answers come back with you. Nothing is shared with
            anyone.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.screenX, paddingBottom: 40 },
  close: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent, textAlign: 'right' },
  title: {
    fontFamily: fonts.display.extrabold,
    fontSize: 28,
    letterSpacing: tracking(28),
    color: colors.text,
    marginTop: 8,
  },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.55,
    color: colors.textMuted,
    marginTop: 10,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    // textFaint: a field you can find (hairline was 1.26:1).
    borderColor: colors.textFaint,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body.medium,
    fontSize: 15,
    marginTop: 18,
    marginBottom: 14,
  },
  codeInput: { fontSize: 22, letterSpacing: 6, textAlign: 'center', fontFamily: fonts.display.bold },
  link: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 14,
  },
  note: {
    fontFamily: fonts.body.regular,
    fontSize: 12,
    lineHeight: 12 * 1.5,
    color: colors.textFaint,
    marginTop: 26,
  },
});
