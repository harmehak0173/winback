import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { CheckIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { onUsDate } from '@/lib/hardship';
import {
  DisplayOffer,
  getDisplayOffers,
  OffersResult,
  PLAN_IDS,
  PlanId,
  purchasePlan,
  restorePurchases,
} from '@/lib/purchases';
import { annualisedNote, priceInStakeDays } from '@/lib/pricing';
import { useAppState } from '@/state/AppState';
import { colors, fonts, tracking } from '@/theme/tokens';

/** Copy per tier. Prices never live here: they come from the store at
 *  runtime, and a tier the store does not offer is not shown at all. */
const PLAN_META: Record<PlanId, { name: string; note: string; unit: string }> = {
  // Neutral on purpose. "Less than one losing bet" was shown to everyone,
  // whatever their stake or storefront, and priced Premium in betting terms.
  // The honest stake comparison is stakeDaysLine, shown only when it holds.
  yearly: { name: 'Yearly', note: 'Billed once a year', unit: '/yr' },
  monthly: { name: 'Monthly', note: 'Flexible, cancel anytime', unit: '/mo' },
};

const PERIOD_WORD: Record<PlanId, string> = {
  yearly: 'per year',
  monthly: 'per month',
};

const STORE_NAME = Platform.OS === 'ios' ? 'App Store' : 'Google Play';

function Benefit({ children }: { children: React.ReactNode }) {
  return (
    <View style={styles.benefit}>
      <View style={styles.benefitCheck}>
        <CheckIcon size={18} color={colors.accent} strokeWidth={2.5} />
      </View>
      <Text style={styles.benefitText}>{children}</Text>
    </View>
  );
}

/**
 * The plans, with an always-visible free path - streak counter, panic button,
 * and helplines are free forever.
 */
export default function Paywall() {
  const router = useRouter();
  const {
    choosePlan,
    refreshPremium,
    trialExpired,
    trial,
    trialUnverified,
    plan: savedPlan,
    dailyRate,
    hardship,
    hardshipOffered,
  } = useAppState();
  const [plan, setPlan] = useState<PlanId>('yearly');
  const { fontScale } = useWindowDimensions();
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // What the store says. Until it answers we must not claim a price, a tier
  // or a trial the store will not honour, so nothing is purchasable yet.
  const [store, setStore] = useState<OffersResult | null>(null);

  const loadOffers = () => {
    setStore(null);
    void getDisplayOffers().then(setStore);
  };

  useEffect(() => {
    track('paywall_viewed');
    void getDisplayOffers().then(setStore);
  }, []);

  const offers = store?.offers ?? {};
  const shownPlans = PLAN_IDS.filter((id) => offers[id]);
  // The yearly tier may be missing from the offering; never leave a hidden
  // tier selected.
  const activePlan: PlanId | undefined = offers[plan] ? plan : shownPlans[0];
  const selected: DisplayOffer | undefined = activePlan ? offers[activePlan] : undefined;
  const canBuy = !!selected && !busy;

  const yearly = offers.yearly;
  const stakeDaysLine =
    yearly?.priceValue !== undefined
      ? priceInStakeDays(yearly.priceValue, dailyRate, yearly.currencyCode)
      : null;
  const trialDays = selected?.trialDays;

  // A paid plan on record with no live subscription means it lapsed. That is
  // not "your free week is up", which they may have used months ago.
  const lapsed =
    trialExpired && (savedPlan === 'yearly' || savedPlan === 'monthly');
  // An unverified week (first run offline, backend unreachable) is still the
  // free week: Premium is on, so the "starts today" disclosure applies and
  // "free version" would be the wrong thing to offer.
  const inFreeWeek = trial.active || trialUnverified;
  // A month on us is running: Premium is on, as in the free week.
  const onUsUntil = hardship.active && hardship.endsAt ? onUsDate(hardship.endsAt) : null;

  const ctaLabel = busy
    ? 'Starting…'
    : store === null
      ? 'Loading plans…'
      : store.status === 'unavailable'
        ? 'Purchases unavailable'
        : !selected
          ? 'Plans unavailable'
          : trialDays
            ? `Start my ${trialDays}-day free trial`
            : 'Start Winback Premium';

  // Back to wherever the paywall was opened from (Home, You, Insights, the
  // daily read). router.replace('/(tabs)') used to swap this screen for a
  // SECOND tab navigator on the root stack: two Homes mounted, both ticking,
  // and Android back landing in the old one. dismissTo pops to the existing
  // tabs, and only creates them when there are none underneath.
  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.dismissTo('/(tabs)');
  };

  /** Prefer the hosted page when one is configured; always fall back to the
   *  bundled copy so the disclosure can never go missing. */
  const openLegal = (doc: 'terms' | 'privacy') => {
    const url =
      doc === 'terms' ? process.env.EXPO_PUBLIC_TERMS_URL : process.env.EXPO_PUBLIC_PRIVACY_URL;
    const inApp = { pathname: '/legal' as const, params: { doc } };
    if (url) {
      Linking.openURL(url).catch(() => router.push(inApp));
      return;
    }
    router.push(inApp);
  };

  const subscribe = async () => {
    if (!canBuy || !activePlan) return;
    setBusy(true);
    track('purchase_started', { plan: activePlan });
    const result = await purchasePlan(activePlan);
    setBusy(false);
    if (result.ok) {
      track('purchase_succeeded', { plan: activePlan });
      choosePlan(activePlan);
      refreshPremium();
      leave();
      return;
    }
    // Only a stable status goes to analytics, never the store's own error
    // string: those can carry account and device detail.
    if (result.status === 'cancelled') {
      track('purchase_cancelled', { plan: activePlan });
      return;
    }
    track('purchase_failed', { plan: activePlan, status: result.status });
    if (result.status === 'pending') {
      Alert.alert('Waiting for approval', result.error);
    } else if (result.status === 'not_entitled') {
      // Charged, but no Premium. Silence here reads as "it failed" and sends
      // people to buy twice or ask for a refund.
      refreshPremium();
      Alert.alert('Almost there', result.error, [
        { text: 'Not now', style: 'cancel' },
        { text: 'Restore purchases', onPress: () => void restore() },
      ]);
    } else {
      Alert.alert('Purchase failed', result.error ?? "The purchase didn't go through. Please try again.");
    }
  };

  const continueFree = () => {
    if (inFreeWeek || onUsUntil) {
      // Still inside the free week (or a month on us): they are on Premium,
      // not the free plan. Writing plan='free' here mislabelled the account
      // mid-week.
      track('paywall_dismissed');
    } else if (lapsed) {
      // A paid plan on record, no live subscription seen. The store may only
      // be unreachable, so the paid plan on record is left alone: overwriting
      // it hid Manage subscription from someone who may still be billed.
      track('free_continued');
    } else {
      track('free_continued');
      choosePlan('free');
    }
    leave();
  };

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    const { status, plan: restoredPlan } = await restorePurchases();
    setRestoring(false);
    track('restore_attempted', { restored: status === 'restored', status });
    if (status === 'restored') {
      // Record what the store actually restored, not whichever card happens
      // to be selected on screen.
      if (restoredPlan) choosePlan(restoredPlan);
      refreshPremium();
      Alert.alert('Restored', 'Welcome back to Premium.');
      leave();
    } else if (status === 'none') {
      Alert.alert('Nothing to restore', `${STORE_NAME} has no Winback purchase for this account.`);
    } else if (status === 'unavailable') {
      Alert.alert('Restore unavailable', "Purchases aren't available in this build.");
    } else {
      // Not "nothing found": a paying user offline must not be told they
      // never bought anything.
      Alert.alert(
        "Couldn't check",
        `We couldn't reach ${STORE_NAME}. Check your connection and try again.`,
      );
    }
  };

  // Without the server clock the days left are unknown, so no count is given.
  const freeWeekText = !trial.known
    ? 'You are in your free week of Premium.'
    : trial.daysLeft <= 1
      ? 'This is the last day of your free week of Premium.'
      : `You have ${trial.daysLeft} days left of your free week of Premium.`;
  // After a month on us the free week is long past, so it is not mentioned.
  const onUsEnded = hardship.taken && !inFreeWeek;
  const subLine = onUsUntil
    ? `Premium is on us until ${onUsUntil}. Subscribing now starts your plan today.`
    : lapsed
      ? 'Your Premium plan has ended. Pick it back up any time - the free tools stay yours either way.'
      : hardship.paused
        ? 'Premium on us is paused. Check the date on your phone.'
        : onUsEnded
          ? 'Your 30 days on us ended. The free version stays yours.'
          : trialExpired
            ? 'Your free week of Premium is up. Keep the tools that got you through it.'
            : inFreeWeek
              ? `${freeWeekText} Subscribing now starts your plan today.`
              : trialDays
                ? `Try Winback Premium free for ${trialDays} days. Cancel anytime.`
                : 'Winback Premium. Cancel anytime.';

  // At the largest text sizes the pinned footer took most of the screen and
  // pushed the plans, the price and the renewal terms out of view. It then
  // scrolls with the plans instead, so the terms always sit next to them.
  const footerInScroll = fontScale >= 1.5;
  const footer = (
    <View style={[styles.footer, footerInScroll && styles.footerInScroll]}>
      <EmberButton label={ctaLabel} disabled={!canBuy} onPress={subscribe} />
      <Pressable onPress={continueFree} hitSlop={8} accessibilityRole="button">
        {/* Free forever, free week or not: streak, panic button, breathing,
            and the helplines are never taken away. */}
        <Text style={styles.freeLink}>
          {inFreeWeek || onUsUntil
            ? 'Not now'
            : trialExpired
              ? 'Keep using the free version'
              : 'Continue with the free version'}
        </Text>
      </Pressable>
      <View style={styles.legalRow}>
        <Pressable onPress={restore} hitSlop={8} disabled={restoring} accessibilityRole="button">
          <Text style={styles.legalLink}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
        </Pressable>
        {/* Always present. Both stores require these on a subscription
            paywall, so they must never depend on a build-time variable -
            the text is bundled and a hosted page is opened when set. */}
        <Pressable onPress={() => openLegal('terms')} hitSlop={8} accessibilityRole="link">
          <Text style={styles.legalLink}>Terms</Text>
        </Pressable>
        <Pressable onPress={() => openLegal('privacy')} hitSlop={8} accessibilityRole="link">
          <Text style={styles.legalLink}>Privacy</Text>
        </Pressable>
      </View>
      {/* The price here comes only from the store, like the rows above. */}
      {!!selected && !!activePlan && (
        <Text style={styles.finePrint}>
          {`${selected.price} ${PERIOD_WORD[activePlan]}, auto-renewing until cancelled.`}
          {trialDays
            ? ` Your ${trialDays}-day free trial converts to a paid subscription unless you cancel at least 24 hours before it ends.`
            : ''}
          {inFreeWeek && !trialDays ? ' Billing starts today and replaces the rest of your free week.' : ''}
          {onUsUntil && !inFreeWeek && !trialDays
            ? ' Billing starts today and replaces the rest of your 30 days on us.'
            : ''}
          {` Cancel anytime in your ${STORE_NAME} account settings.`}
        </Text>
      )}
    </View>
  );

  return (
    <Screen>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {/* The safety layer is never behind a sale, and never more than one
            tap away from one either. */}
        <Pressable
          onPress={() => router.push('/panic')}
          hitSlop={10}
          accessibilityRole="button"
          style={styles.urgeLink}
        >
          <Text style={styles.urgeLinkText}>Feel an urge? Get through it</Text>
        </Pressable>
        <Text style={styles.headline} accessibilityRole="header">
          Win it back.
        </Text>
        <Text style={styles.sub}>{subLine}</Text>
        {/* Their own arithmetic, not ours. The strongest honest line the
            paywall can say is the yearly price measured in days of what they
            used to stake - computed from their quiz answers, shown only when
            the comparison genuinely favours them. */}
        {!!stakeDaysLine && (
          <Text style={styles.stakeLine}>A year of Premium is {stakeDaysLine}.</Text>
        )}

        {/* Must match the store listing (Apple 2.3): what Premium adds, then
            what stays free, so nobody pays for something they already had. */}
        <View style={styles.benefits}>
          <Benefit>Game-day check-ins for the teams you follow</Benefit>
          <Benefit>Trigger insights - when and why urges hit, and your week against your quiz</Benefit>
          <Benefit>The full daily read, one short piece a day, plus every past read</Benefit>
          <Benefit>More than one goal for the money you keep</Benefit>
        </View>
        <Text style={styles.freeNote}>
          Free either way: the panic button, helplines, close-outs and your record, Today&apos;s
          move, Today&apos;s play, Cut the lines, one goal, lights out, reps and the weekly recap.
        </Text>

        {store === null && (
          <View style={styles.plans} accessibilityLabel="Loading plans">
            {PLAN_IDS.map((id) => (
              <View key={id} style={[styles.planRow, styles.planSkeleton]}>
                <View style={styles.radio} />
                <View style={styles.planText}>
                  <Text style={styles.planName}>{PLAN_META[id].name}</Text>
                  <View style={styles.skeletonBar} />
                </View>
              </View>
            ))}
          </View>
        )}

        {store?.status === 'unavailable' && (
          <Text style={styles.notice}>
            Purchases aren&apos;t available in this build. Everything free in Winback still works.
          </Text>
        )}

        {store?.status === 'error' && (
          <View style={styles.errorBox}>
            <Text style={styles.notice}>
              Plans couldn&apos;t load. Check your connection and try again.
            </Text>
            <Pressable onPress={loadOffers} hitSlop={8} accessibilityRole="button">
              <Text style={styles.retry}>Try again</Text>
            </Pressable>
          </View>
        )}

        {/* The tiers stack as rows rather than sitting side by side, so the
            price and the annualised line stay readable at phone width and
            under large text. Only tiers the store actually offers are listed. */}
        {shownPlans.length > 0 && (
          <View style={styles.plans} accessibilityRole="radiogroup">
            {shownPlans.map((id) => {
              const offer = offers[id]!;
              const isSelected = activePlan === id;
              const meta = PLAN_META[id];
              const annualised = annualisedNote(id, offer.priceValue, offer.currencyCode);
              return (
                <Pressable
                  key={id}
                  onPress={() => setPlan(id)}
                  accessibilityRole="radio"
                  aria-checked={isSelected}
                  // The yearly total is read out too: it is the point of
                  // showing it.
                  accessibilityLabel={`${meta.name}, ${offer.price} ${PERIOD_WORD[id]}${annualised ? `, ${annualised}` : ''}`}
                  style={[styles.planRow, isSelected && styles.planSelected]}
                >
                  <View style={[styles.radio, isSelected && styles.radioOn]}>
                    {isSelected && <View style={styles.radioDot} />}
                  </View>
                  <View style={styles.planText}>
                    <Text style={styles.planName}>{meta.name}</Text>
                    <Text style={styles.planNote}>{meta.note}</Text>
                    {/* What it comes to over a year. Shown because the people
                        this app is for are the ones who lost track of what a
                        small repeated amount adds up to, and a monthly price
                        is that shape too. */}
                    {!!annualised && <Text style={styles.planAnnual}>{annualised}</Text>}
                  </View>
                  <View style={styles.planPriceWrap}>
                    <Text style={styles.planPrice}>
                      {offer.price}
                      <Text style={styles.planUnit}>{meta.unit}</Text>
                    </Text>
                    {id === 'yearly' && shownPlans.length > 1 && (
                      <Text style={styles.planBadgeAccent}>BEST VALUE</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
        {store?.status === 'simulated' && (
          <Text style={styles.devNote}>Development build: placeholder prices, simulated store.</Text>
        )}
        {/* For someone who wants Premium and cannot pay for it right now: a
            month on us, no card. Quiet on purpose - an offer, not a pitch -
            and only when there is nothing else (no subscription, no free
            week, no month already running). */}
        {hardshipOffered && (
          <Pressable
            onPress={() => router.push('/on-us')}
            hitSlop={8}
            style={styles.onUsHit}
            accessibilityRole="button"
            accessibilityHint="Explains 30 days of Premium free, with no card"
          >
            <Text style={styles.onUsLink}>Premium is too much right now?</Text>
          </Pressable>
        )}
        {footerInScroll && footer}
      </ScrollView>

      {!footerInScroll && footer}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 18, paddingHorizontal: 28, paddingBottom: 12 },
  urgeLink: { alignSelf: 'flex-end', marginBottom: 10 },
  urgeLinkText: {
    fontFamily: fonts.body.medium,
    fontSize: 13,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  headline: {
    fontFamily: fonts.display.black,
    fontSize: 32,
    letterSpacing: tracking(32),
    color: colors.text,
  },
  stakeLine: {
    fontFamily: fonts.body.semibold,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: colors.accent,
    marginTop: 10,
  },
  sub: {
    fontFamily: fonts.body.regular,
    fontSize: 15,
    lineHeight: 15 * 1.5,
    color: colors.textMuted,
    marginTop: 8,
  },
  benefits: { marginTop: 22, gap: 14 },
  benefit: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  benefitCheck: { marginTop: 2 },
  benefitText: {
    flex: 1,
    fontFamily: fonts.body.regular,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.45,
    color: colors.text,
  },
  freeNote: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.5,
    color: colors.textDim,
    marginTop: 14,
  },
  plans: { marginTop: 22, gap: 10 },
  planRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  planSkeleton: { opacity: 0.6 },
  skeletonBar: {
    height: 10,
    width: '55%',
    borderRadius: 5,
    backgroundColor: colors.hairline,
    marginTop: 6,
  },
  planSelected: { borderColor: colors.accent, backgroundColor: colors.surfaceWarm },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.textFaint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.accent },
  planText: { flex: 1 },
  planName: { fontFamily: fonts.display.bold, fontSize: 15.5, color: colors.text },
  planAnnual: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    color: colors.textDim,
    marginTop: 3,
  },
  planNote: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textMuted, marginTop: 2 },
  planPriceWrap: { alignItems: 'flex-end' },
  planPrice: { fontFamily: fonts.display.extrabold, fontSize: 20, color: colors.text },
  planUnit: { fontFamily: fonts.body.medium, fontSize: 12.5, color: colors.textMuted },
  planBadgeAccent: {
    fontFamily: fonts.body.semibold,
    fontSize: 10,
    letterSpacing: 10 * 0.14,
    color: colors.accent,
    marginTop: 3,
  },
  notice: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: colors.notice,
    marginTop: 22,
  },
  errorBox: { alignItems: 'flex-start' },
  retry: {
    fontFamily: fonts.display.bold,
    fontSize: 14,
    color: colors.accent,
    marginTop: 10,
  },
  onUsHit: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', marginTop: 10 },
  onUsLink: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  devNote: {
    fontFamily: fonts.body.regular,
    fontSize: 12,
    color: colors.textDim,
    marginTop: 10,
  },
  footer: { paddingHorizontal: 28, paddingTop: 8 },
  // Inside the scroll, which already has the side padding.
  footerInScroll: { paddingHorizontal: 0, paddingTop: 16 },
  freeLink: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 14,
  },
  // Disclosure text, so it takes a text-grade colour: the price and renewal
  // terms must pass contrast, not just be present.
  finePrint: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    lineHeight: 11.5 * 1.4,
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 10,
  },
  // Wraps at large text sizes instead of clipping Restore, Terms or Privacy.
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 22,
    rowGap: 10,
    marginTop: 12,
  },
  legalLink: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});
