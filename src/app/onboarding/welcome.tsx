import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { Screen } from '@/components/Screen';
import { getAnalyticsEnabled, recordConsent, track } from '@/lib/analytics';
import { useRegionKnown } from '@/lib/helplines';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * First screen, and the consent step.
 *
 * The quiz collects behavioural-health answers, so what happens to them is
 * said here, in plain words, BEFORE the first question - not only behind a
 * Privacy Policy link. Agreeing is an explicit tap. Nothing leaves the phone
 * before it: no account is created, the store SDK is not configured, and no
 * analytics event is sent (the view event below waits in memory and is
 * dropped if the user never agrees). The one exception is Welcome reached
 * again after an erase in the same session: the store SDK cannot be
 * unconfigured, so it sits on the new, empty anonymous RevenueCat ID that the
 * erase switched it to (the deletion page says so), and the app makes no call
 * of its own to it until the user agrees again. The third party that receives usage data
 * is named here too (App Store 5.1.2), not only in the Privacy Policy.
 *
 * The 18+ confirmation lives here for the same reason: the Terms require it,
 * and it has to be confirmed before the questions, not after.
 */
export default function Welcome() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // The region default (off in the EEA, UK, Switzerland and Canada), or the
  // setting as the user left it if they have been here before. Said as it
  // stands, since agreeing below is what lets it start. It depends on the
  // phone's region, so on the web it waits for hydration, as the helplines
  // do: the page is pre-rendered on the build machine, whose region is not
  // the reader's.
  const regionKnown = useRegionKnown();
  const usageOn = regionKnown ? getAnalyticsEnabled() : null;
  useEffect(() => track('funnel_welcome_viewed'), []);

  const agree = async (then: () => void) => {
    if (busy) return;
    setBusy(true);
    await recordConsent();
    track('funnel_consent_given');
    setBusy(false);
    then();
  };

  return (
    <Screen style={styles.screen}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.wordmark}>Winback</Text>
        <View style={styles.center}>
          <Text style={styles.headline} accessibilityRole="header">
            Let's see what betting has really taken from you.
          </Text>
          <Text style={styles.sub}>10 quick questions. No judgment. Takes about a minute.</Text>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            Your answers, check-ins and panic-button times are saved to your account on our
            servers, tied to a random ID, not your name. We use them only to run Winback - never
            sold, never used for ads. Whether you hide your betting never leaves this phone. You can
            delete everything any time. Winback adds no VPN or filter: the rest of your phone works
            as it always has.
          </Text>
          {usageOn !== null && (
            <Text style={[styles.noticeText, styles.noticeGap]}>
              {usageOn
                ? 'Usage data also comes to us: which screens you open, and when you log a check-in, an urge, a slip or a panic session - never what you typed. A smaller set, without slips, urges or panic sessions, goes to our analytics provider, PostHog. Turn it off any time in You.'
                : 'Sharing usage data (which screens you open, and when you log a check-in, an urge, a slip or a panic session) with us and our analytics provider, PostHog, is off. You can turn it on in You.'}
            </Text>
          )}
        </View>

        <EmberButton
          label="Agree and start"
          disabled={busy}
          onPress={() => void agree(() => router.push('/onboarding/quiz'))}
        />
        <Text style={styles.consent}>
          By tapping Agree and start or signing in, you confirm you are 18 or older and agree to
          our Terms and Privacy Policy.
        </Text>
        {/* Separate pressables, not links nested in the sentence: nested Text
            links are a few points tall and a screen reader cannot reach them
            on their own. */}
        <View style={styles.links}>
          <Pressable
            onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })}
            style={styles.linkHit}
            accessibilityRole="link"
          >
            <Text style={styles.consentLink}>Terms</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })}
            style={styles.linkHit}
            accessibilityRole="link"
          >
            <Text style={styles.consentLink}>Privacy Policy</Text>
          </Pressable>
        </View>
        {/* A reinstall starts a clean anonymous account, so this is the way
            back to saved progress for anyone who has been here before. */}
        <Pressable
          onPress={() => void agree(() => router.push('/signin'))}
          // A real 44pt target, like the links above: hitSlop alone left a
          // text-high button that a shaky thumb could miss.
          style={styles.linkHit}
          accessibilityRole="button"
        >
          <Text style={styles.signin}>
            Saved your progress before? <Text style={styles.signinLink}>Sign in</Text>
          </Text>
        </Pressable>
        <Text style={styles.tagline}>Keep the game. Lose the bets.</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 30, paddingBottom: 30 },
  scroll: { flexGrow: 1 },
  wordmark: {
    fontFamily: fonts.display.extrabold,
    fontSize: 20,
    letterSpacing: tracking(20, -0.01),
    color: colors.text,
    marginTop: 12,
  },
  center: { flexGrow: 1, justifyContent: 'center', paddingVertical: 28 },
  headline: {
    fontFamily: fonts.display.extrabold,
    fontSize: 34,
    lineHeight: 34 * 1.12,
    letterSpacing: tracking(34),
    color: colors.text,
  },
  sub: {
    fontFamily: fonts.body.regular,
    fontSize: 16,
    lineHeight: 16 * 1.55,
    color: colors.textMuted,
    marginTop: 18,
  },
  notice: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  noticeText: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
    color: colors.textMuted,
  },
  noticeGap: { marginTop: 8 },
  consent: {
    textAlign: 'center',
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.5,
    color: colors.finePrint,
    marginTop: 12,
  },
  links: { flexDirection: 'row', justifyContent: 'center', gap: 20 },
  linkHit: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 4 },
  consentLink: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    color: colors.textDim,
    textDecorationLine: 'underline',
  },
  signin: {
    textAlign: 'center',
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    marginTop: 4,
  },
  signinLink: { fontFamily: fonts.body.semibold, color: colors.text },
  tagline: {
    textAlign: 'center',
    fontFamily: fonts.body.regular,
    fontSize: 12,
    color: colors.textFaint,
    marginTop: 16,
  },
});
