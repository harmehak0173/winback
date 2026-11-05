import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { HoldToCommitButton } from '@/components/HoldToCommitButton';
import { Screen } from '@/components/Screen';
import { getDisplayOffers, PLAN_IDS, type OffersResult, type PlanId } from '@/lib/purchases';
import { useAppState } from '@/state/AppState';
import { colors, fonts, tracking } from '@/theme/tokens';

/**
 * Commitment moment. Sets quit date to now, then routes to the safety
 * interstitial when flagged (Q7 debt + Q8 yes), otherwise to the reminders
 * screen the first time, and straight to Home after that.
 *
 * The free week of Premium starts here, so it is disclosed here, before the
 * hold: how long it lasts, that nothing is charged, what locks when it ends
 * and what stays free after, and what Premium costs once it does (App Store
 * 3.1.1 / 3.1.2, app-managed free trials: the downstream charge is part of the
 * disclosure). The prices are the store's own, in the storefront's currency,
 * and only once the store has answered - never a hard-coded figure. Nothing is
 * sold on this screen. A quiz redo has already had its week (the first-commit
 * stamp survives a redo), so it is not offered again.
 */

const PER: Record<PlanId, string> = { yearly: '/yr', monthly: '/mo' };

/** "$39.99/yr or $3.99/mo" from the tiers the store offers, else null. */
function priceLine(store: OffersResult | null): string | null {
  if (store?.status !== 'ready') return null;
  const parts = PLAN_IDS.flatMap((id) => {
    const offer = store.offers[id];
    return offer ? [`${offer.price}${PER[id]}`] : [];
  });
  if (!parts.length) return null;
  const last = parts.pop();
  return parts.length ? `${parts.join(', ')} or ${last}` : (last ?? null);
}
export default function Commit() {
  const router = useRouter();
  const { commit, hideFlag, freeWeekStarted, remindersPrimed } = useAppState();
  const [store, setStore] = useState<OffersResult | null>(null);
  const [viewHeight, setViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);

  // Consent was given on Welcome, so asking the store is allowed here. The
  // line simply stays out until (unless) the store answers.
  useEffect(() => {
    if (freeWeekStarted) return;
    let live = true;
    void getDisplayOffers().then((r) => {
      if (live) setStore(r);
    });
    return () => {
      live = false;
    };
  }, [freeWeekStarted]);
  const prices = priceLine(store);

  const onCommit = () => {
    commit();
    // Straight into the app. Everyone gets a free week of Premium, so putting
    // a paywall here would be asking for money for something they already
    // have. The paywall now appears when the week actually ends.
    //
    // The reminders screen (which asks for notification permission) comes
    // next, once. Never stacked on the safety screen: after that one, Home
    // offers the reminders screen instead.
    if (hideFlag) router.replace('/onboarding/safety');
    else if (!remindersPrimed) {
      router.replace({ pathname: '/reminders-intro', params: { from: 'commit' } });
    } else router.replace('/(tabs)');
  };

  return (
    <Screen style={styles.screen}>
      {/* Everything scrolls, so at the largest text sizes the disclosure and
          both ways to commit stay reachable; before, only the headline
          scrolled and the buttons were pushed off the screen. It scrolls only
          when it has to: a drift during the press-and-hold would otherwise
          start a scroll and cancel the hold. */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        onLayout={(e) => setViewHeight(e.nativeEvent.layout.height)}
        onContentSizeChange={(_, h) => setContentHeight(h)}
        scrollEnabled={contentHeight > viewHeight + 1}
        bounces={false}
      >
        <View style={styles.center}>
          <Text style={styles.headline} accessibilityRole="header">
            I'm done letting the betting companies win.
          </Text>
          <Text style={styles.sub}>Press and hold to commit. This sets your quit date to today.</Text>
        </View>
        {!freeWeekStarted && (
          <Text style={styles.freeWeek}>
            Your first 7 days of Premium are free. No card, no charge, nothing to cancel. After
            day 7, game-day check-ins, trigger insights, the full daily read and extra goals need
            a subscription - plans are shown before you pay. The panic button, helplines, your
            streak and daily close-outs stay free.
            {prices ? ` Premium after that: ${prices}, only if you choose it.` : ''}
          </Text>
        )}
        <HoldToCommitButton onCommit={onCommit} />
        <Pressable
          onPress={onCommit}
          hitSlop={8}
          accessibilityRole="button"
          // The spoken name is the words on screen, so Voice Control can say it.
          accessibilityLabel="Or just tap, I'm in"
          accessibilityHint="Sets your quit date to today"
        >
          <Text style={styles.tapFallback}>or just tap - I&apos;m in</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { paddingHorizontal: 30, paddingBottom: 34 },
  scroll: { flex: 1 },
  content: { flexGrow: 1 },
  // flexGrow, not flex: a zero basis would let the headline collapse when
  // large text makes the page taller than the screen.
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  headline: {
    fontFamily: fonts.display.black,
    fontSize: 38,
    lineHeight: 38 * 1.1,
    letterSpacing: tracking(38),
    color: colors.text,
    textAlign: 'center',
  },
  sub: {
    fontFamily: fonts.body.regular,
    fontSize: 15,
    lineHeight: 15 * 1.5,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 18,
    maxWidth: 280,
  },
  freeWeek: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.textDim,
    textAlign: 'center',
    marginBottom: 18,
  },
  tapFallback: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 16,
  },
});
