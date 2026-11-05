import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { HelplineRow } from '@/components/HelplineRow';
import { Screen } from '@/components/Screen';
import { TriggerPicker } from '@/components/TriggerPicker';
import { useNow } from '@/hooks/useNow';
import { track } from '@/lib/analytics';
import { DAY_MS, formatDollars } from '@/lib/format';
import {
  deviceDirectoryLine,
  deviceHelplines,
  isLongList,
  useRegionKnown,
} from '@/lib/helplines';
import { markPanicSession } from '@/lib/panicSession';
import { TRIGGER_PROMO } from '@/lib/triggers';
import { useAppState } from '@/state/AppState';
import { type IfThenPlan, PLANS, planSentence } from '@/state/plans';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * The relapse screen.
 *
 * This was an Alert.alert, which could not render a helpline row on the single
 * highest-risk moment the app is able to observe. It also styled the truthful
 * option as a destructive red action, which told the user that being honest was
 * the dangerous choice, and pushed back with "the betting companies count on you
 * giving up here. Don't." - pressure applied to someone already in shame.
 *
 * Nothing here is a condition of admitting the slip. The user has already told
 * the truth by arriving; the screen's only job is to make the next few minutes
 * survivable and let them choose what happens to the streak.
 *
 * After that choice comes an optional debrief of about a minute: what was
 * happening, what came first, and one if-then for next time. It asks what,
 * never why, and skipping it costs nothing. Either choice also starts
 * comeback week (one short thing each morning for seven days), which is free
 * like everything else that answers a slip.
 */

// Copy lives at the top so it can be revised without touching the layout.
//
// Written against what actually turns one bet into a run of them. The biggest
// risk in the next 24 hours is not despair, it is a second bet placed to chase
// the first - loss chasing is the one DSM-5 criterion unique to gambling, and
// this screen is exactly where "I can get it back" lives. So the body targets
// the chase, not the feelings.
//
// "The bet is done" rather than "the money is gone" on purpose: the app never
// asks whether they won or lost, so it cannot claim the money is gone, and
// telling someone who won that it is would cost the app credibility on the one
// subject where it has to be exact.
//
// Every evaluative sentence points at the behaviour, the money, or the betting companies.
// None of them point at the person. Shame produces hiding, and an app that only
// works when people log honestly cannot afford to teach them to hide.
const COPY = {
  headline: 'You slipped. Here is what is still true.',
  body: [
    'Logging it is the part that works. The number below is cumulative. Today does not move it.',
    'The bet is done. Trying to get it back is how one bet becomes a week of them. That is where the betting companies make their money: on the next bet, not the one you just placed. Nothing here deletes the bet. The only open question is the day count.',
  ],
  cancelLabel: 'Close. Nothing changes.',
  helplineIntro: 'If you would rather talk to a person',
  debriefIntro:
    'Comeback week starts tomorrow: one short thing each morning for seven days. First, a minute on what happened, if you want it. It is optional, and nothing here asks why.',
  dominoLabel: 'What came first?',
  dominoHelp: 'The first small step before the bet. Pick the closest one.',
  planLabel: 'An if-then for next time',
};

// Named by consequence rather than by moral weight, so neither reads as the
// safe option and neither reads as the coward's.
const freezeLabel = (days: number) => `Use my freeze. Day count stays at ${days}.`;
const RESET_LABEL = 'Reset to day 0. Count starts today.';

/**
 * The first domino: the small step that came before the bet. Each maps to the
 * TRIGGER_OPTIONS index its plans are tagged with (null = no one trigger).
 * Situations, not verdicts - none of these is a mistake in itself.
 */
const DOMINOES: { label: string; trigger: number | null }[] = [
  { label: 'Opened a betting app', trigger: null },
  { label: 'Checked a score', trigger: 0 },
  { label: 'The group chat', trigger: 0 },
  { label: 'Got a promo', trigger: TRIGGER_PROMO },
  { label: 'Pay landed', trigger: 1 },
  { label: 'Had a drink', trigger: 6 },
  { label: 'Up late', trigger: 2 },
  { label: 'A rough day', trigger: 5 },
  { label: 'Nothing to do', trigger: 4 },
];

/**
 * Plans for what was picked, best match first: the trigger counts double, the
 * first domino once. Deterministic, so "Show another" walks a fixed list.
 * Nothing picked, or nothing matching: the general plans.
 */
function plansFor(trigger: number | null, domino: number | null): IfThenPlan[] {
  const score = (p: IfThenPlan) =>
    (trigger != null && p.triggers.includes(trigger) ? 2 : 0) +
    (domino != null && p.triggers.includes(domino) ? 1 : 0);
  const matched = PLANS.filter((p) => score(p) > 0).sort((a, b) => score(b) - score(a));
  return matched.length ? matched : PLANS.filter((p) => p.triggers.length === 0);
}

export default function Slip() {
  const router = useRouter();
  // Opened from the close-out sheet: finishing goes all the way back to the
  // tabs, not to a close-out that now only says "Today is logged".
  const { from } = useLocalSearchParams<{ from?: string }>();
  const {
    currentStreakDays,
    freezeAvailable,
    freezeStreak,
    resetStreak,
    startComeback,
    pickPlan,
    todayPlanItem,
    moneyKeptBefore,
    dailyRate,
    quitDate,
  } = useAppState();

  // Reactive clock: React Compiler rejects Date.now() in render, and this is
  // read during render to work out the money kept.
  const now = useNow(60_000);
  // Region lines wait for the web's hydration (see useRegionKnown).
  const regionKnown = useRegionKnown();
  const directory = regionKnown ? deviceDirectoryLine() : null;
  const lines = regionKnown
    ? [...(directory ? [directory] : []), ...deviceHelplines()]
    : [];

  // What the user chose, which also opens the debrief. Null = still choosing.
  const [choice, setChoice] = useState<{ kind: 'freeze' | 'reset'; days: number } | null>(null);
  const [trigger, setTrigger] = useState<number | null>(null);
  const [domino, setDomino] = useState<number | null>(null);
  const [planStep, setPlanStep] = useState(0);
  const [pinnedId, setPinnedId] = useState<string | null>(null);

  // Nothing that sells may land right after a slip either: the end-of-free-
  // week paywall on Home honours the same quiet window as a panic session.
  // Marked on the way out, however the screen is left.
  useEffect(() => () => markPanicSession(), []);

  // The money kept is cumulative and survives a relapse, so it is the one
  // concrete, true, reassuring thing the app can say at this moment.
  const elapsed = quitDate ? Math.max(0, now - new Date(quitDate).getTime()) : 0;
  const moneyKept = moneyKeptBefore + (elapsed / DAY_MS) * dailyRate;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // AppState fires streak_freeze_used / streak_reset; tracking them here too
  // doubled every relapse count.
  const onFreeze = () => {
    const days = currentStreakDays;
    freezeStreak();
    startComeback();
    setChoice({ kind: 'freeze', days });
  };

  const onReset = () => {
    resetStreak();
    startComeback();
    setChoice({ kind: 'reset', days: 0 });
  };

  const dominoTrigger = domino != null ? DOMINOES[domino].trigger : null;
  const candidates = plansFor(trigger, dominoTrigger);
  const plan = candidates[planStep % candidates.length];
  const showPlan = trigger != null || domino != null;
  // Pinned here, or already today's play from Home: either way it is on Home.
  const planOnHome = !!plan && (pinnedId === plan.id || todayPlanItem?.id === plan.id);

  const pickDomino = (i: number) => {
    setDomino((d) => (d === i ? null : i));
    setPlanStep(0);
  };

  const pin = () => {
    pickPlan(plan.id);
    setPinnedId(plan.id);
  };

  const finish = () => {
    // Whether each part was used, never what was picked.
    track('slip_debrief', {
      tagged: trigger != null,
      domino: domino != null,
      pinned: pinnedId != null,
    });
    if (from === 'closeout' && router.canGoBack()) router.dismissTo('/(tabs)');
    else close();
  };

  return (
    <Screen edges={['top']} onEscape={choice ? finish : close}>
      <ScrollView contentContainerStyle={styles.content}>
        {!choice ? (
          <>
            <Text style={styles.headline} accessibilityRole="header">
              {COPY.headline}
            </Text>
            {COPY.body.map((p) => (
              <Text key={p} style={styles.body}>
                {p}
              </Text>
            ))}

            <View style={styles.factCard}>
              <Eyebrow>Kept so far</Eyebrow>
              <Text style={styles.factNumber}>{formatDollars(moneyKept)}</Text>
              <Text style={styles.factSub}>
                {currentStreakDays > 0
                  ? `Across ${currentStreakDays} day${currentStreakDays === 1 ? '' : 's'} not betting. It does not reset.`
                  : 'It does not reset.'}
              </Text>
            </View>

            {/* Both choices carry identical weight on purpose. Styling the reset
                as destructive told the user that honesty was the dangerous option;
                making the freeze the filled ember button says the same thing in
                reverse, that keeping the number is what the app wants. It has no
                preference. The labels carry the difference, and each is named by
                its consequence rather than its moral weight. */}
            <View style={styles.actions}>
              {freezeAvailable && (
                <Pressable style={styles.choiceButton} onPress={onFreeze} accessibilityRole="button">
                  <Text style={styles.choiceLabel}>{freezeLabel(currentStreakDays)}</Text>
                </Pressable>
              )}
              <Pressable style={styles.choiceButton} onPress={onReset} accessibilityRole="button">
                <Text style={styles.choiceLabel}>{RESET_LABEL}</Text>
              </Pressable>
              <Pressable onPress={close} style={styles.linkHit} accessibilityRole="button">
                <Text style={styles.cancelLink}>{COPY.cancelLabel}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Text style={styles.headline} accessibilityRole="header">
              {choice.kind === 'freeze'
                ? `Freeze used. Your count stays at ${choice.days}.`
                : 'Count reset. Day 0 starts now.'}
            </Text>
            <Text style={styles.body}>{COPY.debriefIntro}</Text>

            <TriggerPicker
              kind="slip"
              label="What was happening right before?"
              inset={false}
              onPick={(i) => {
                setTrigger(i);
                setPlanStep(0);
              }}
            />

            <Eyebrow style={styles.stepLabel}>{COPY.dominoLabel}</Eyebrow>
            <Text style={styles.stepHelp}>{COPY.dominoHelp}</Text>
            <View style={styles.chips}>
              {DOMINOES.map((d, i) => (
                <Pressable
                  key={d.label}
                  style={[styles.chip, domino === i && styles.chipOn]}
                  onPress={() => pickDomino(i)}
                  accessibilityRole="radio"
                  aria-checked={domino === i}
                  accessibilityLabel={d.label}
                >
                  <Text style={[styles.chipLabel, domino === i && styles.chipLabelOn]}>{d.label}</Text>
                </Pressable>
              ))}
            </View>

            {showPlan && !!plan && (
              <View style={styles.planCard}>
                <Eyebrow>{COPY.planLabel}</Eyebrow>
                <Text style={styles.planText} accessibilityLiveRegion="polite">
                  {planSentence(plan)}
                </Text>
                {planOnHome ? (
                  <Text style={styles.planDone}>On Home for today. It is yours to keep using.</Text>
                ) : (
                  <View style={styles.planActions}>
                    <Pressable
                      style={styles.planButton}
                      onPress={pin}
                      accessibilityRole="button"
                      accessibilityHint="Shows this plan on Home for the rest of today"
                    >
                      <Text style={styles.planButtonLabel}>Put it on Home today</Text>
                    </Pressable>
                    {candidates.length > 1 && (
                      <Pressable
                        onPress={() => setPlanStep((s) => s + 1)}
                        style={styles.linkHit}
                        accessibilityRole="button"
                      >
                        <Text style={styles.planAnother}>Show another</Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            )}

            <View style={styles.actions}>
              <EmberButton label="Done" onPress={finish} />
            </View>
          </>
        )}

        <Eyebrow style={styles.helpLabel}>{COPY.helplineIntro}</Eyebrow>
        {lines.map((line) => (
          <HelplineRow key={line.name + line.uri} line={line} compact={isLongList(lines)} />
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenX, paddingTop: 46, paddingBottom: 40 },
  headline: {
    fontFamily: fonts.display.extrabold,
    fontSize: 27,
    lineHeight: 27 * 1.2,
    letterSpacing: tracking(27),
    color: colors.text,
  },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.55,
    color: colors.textMuted,
    marginTop: 14,
  },
  factCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 18,
    marginTop: 26,
  },
  factNumber: {
    fontFamily: fonts.display.extrabold,
    fontSize: 34,
    color: colors.text,
    marginTop: 6,
  },
  factSub: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.5,
    color: colors.textDim,
    marginTop: 4,
  },
  actions: { marginTop: 28, gap: 12 },
  choiceButton: {
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  choiceLabel: {
    fontFamily: fonts.display.bold,
    fontSize: 15,
    color: colors.text,
    textAlign: 'center',
  },
  cancelLink: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    textDecorationLine: 'underline',
  },
  linkHit: { minHeight: 44, justifyContent: 'center' },
  stepLabel: { marginTop: 26 },
  stepHelp: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    color: colors.textDim,
    marginTop: 4,
    marginBottom: 10,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surfaceWarm },
  chipLabel: { fontFamily: fonts.body.medium, fontSize: 13, color: colors.text },
  chipLabelOn: { color: colors.accent },
  planCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 18,
    marginTop: 26,
  },
  planText: {
    fontFamily: fonts.display.semibold,
    fontSize: 16,
    lineHeight: 16 * 1.45,
    color: colors.text,
    marginTop: 8,
  },
  planActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginTop: 14 },
  planButton: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  planButtonLabel: { fontFamily: fonts.display.bold, fontSize: 13.5, color: colors.accent },
  planAnother: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  planDone: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 12,
  },
  helpLabel: { marginTop: 34, marginBottom: 10 },
});
