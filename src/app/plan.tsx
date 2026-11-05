import * as Haptics from 'expo-haptics';
import { Redirect } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { CheckIcon } from '@/components/icons';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { ModalBar, useLeave, useOpenPlay } from '@/components/ModalBar';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { pickPlays } from '@/lib/todaysPlay';
import { useAppState } from '@/state/AppState';
import { type IfThenPlan, planSentence } from '@/state/plans';
import { PLAYBOOK } from '@/state/playbook';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * Today's play (hook 5): three if-then plans for the day's risk, one tap to
 * pin one. The decision is made here, calmly, so it is already made when the
 * moment comes.
 *
 * Deterministic: the same day gives the same three, so there is nothing to
 * refresh for. A game on today can be said by hand - the automatic "game
 * today" only comes from saved teams, which are Premium, but the plans are
 * free for everyone. Nothing here is scored: at close-out "Not today" is as
 * good an answer as "Held".
 */
export default function PlanScreen() {
  const leave = useLeave();
  const openPlay = useOpenPlay();
  const { ready, quitDate, todayKey, todaysPlays, playContext, todayPlanItem, pickPlan } = useAppState();
  const [gameByHand, setGameByHand] = useState(false);

  useEffect(() => {
    track('plan_opened');
  }, []);

  if (!ready) return <Screen edges={['top']}>{null}</Screen>;
  if (!quitDate) return <Redirect href="/" />;

  const autoGame = todaysPlays.context === 'game';
  const plays = gameByHand && !autoGame ? pickPlays(todayKey, { ...playContext, gameToday: true }) : todaysPlays;
  // A plan pinned from the other list stays visible at the top.
  const pinnedElsewhere =
    todayPlanItem && !plays.plans.some((p) => p.id === todayPlanItem.id) ? todayPlanItem : null;
  const pinnedPlay = todayPlanItem ? PLAYBOOK.find((p) => p.id === todayPlanItem.playId) : undefined;

  const choose = (p: IfThenPlan) => {
    if (todayPlanItem?.id === p.id) return;
    Haptics.selectionAsync().catch(() => {});
    pickPlan(p.id);
    AccessibilityInfo.announceForAccessibility('Pinned for today.');
  };

  return (
    <Screen edges={['top']}>
      <ModalBar onClose={leave} />
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>Today&apos;s play</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          {plays.headline}
        </Text>
        <Text style={styles.body}>
          Pick one. Deciding now means the decision is already made when the moment comes.
        </Text>

        <View accessibilityRole="radiogroup" accessibilityLabel="Today's plans">
          {pinnedElsewhere && <PlanOption plan={pinnedElsewhere} selected onPress={() => {}} />}
          {plays.plans.map((p) => (
            <PlanOption
              key={p.id}
              plan={p}
              selected={todayPlanItem?.id === p.id}
              onPress={() => choose(p)}
            />
          ))}
        </View>

        {todayPlanItem && (
          <Text style={styles.pinned} accessibilityLiveRegion="polite">
            Pinned for today. It stays on Home, and tonight&apos;s close-out asks if it held.
          </Text>
        )}
        {pinnedPlay && (
          <Pressable
            style={styles.playLink}
            onPress={() => openPlay(pinnedPlay.id, 'plan')}
            accessibilityRole="link"
            accessibilityHint="Opens the play in Insights"
          >
            <Text style={styles.playLinkLabel}>Why it works: {pinnedPlay.title}</Text>
          </Pressable>
        )}

        {!autoGame && (
          <Pressable
            onPress={() => setGameByHand((v) => !v)}
            hitSlop={8}
            style={styles.quietLinkHit}
            accessibilityRole="button"
          >
            <Text style={styles.quietLink}>
              {gameByHand ? 'Back to today’s plans' : 'A game on today? See game-day plans'}
            </Text>
          </Pressable>
        )}

        <Text style={styles.hint}>
          &quot;Not today&quot; and &quot;Didn&apos;t come up&quot; are fine answers tonight. Nothing
          here is scored.
        </Text>

        <View style={styles.footer}>
          <EmberButton label="Done" onPress={leave} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function PlanOption({
  plan,
  selected,
  onPress,
}: {
  plan: IfThenPlan;
  selected: boolean;
  onPress: () => void;
}) {
  const sentence = planSentence(plan);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, selected && styles.optionOn]}
      accessibilityRole="radio"
      aria-checked={selected}
      accessibilityLabel={sentence}
    >
      <Text style={styles.optionText}>{sentence}</Text>
      {selected && (
        <View style={styles.check}>
          <CheckIcon color={colors.onAccent} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenX, paddingTop: 12, paddingBottom: 40 },
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
    marginBottom: 20,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 12,
  },
  optionOn: { backgroundColor: colors.surfaceWarm, borderColor: colors.accent },
  optionText: {
    flex: 1,
    fontFamily: fonts.body.medium,
    fontSize: 15,
    lineHeight: 15 * 1.45,
    color: colors.text,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinned: { fontFamily: fonts.body.medium, fontSize: 13, color: colors.accentDim, marginTop: 4 },
  playLink: {
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 13,
    paddingHorizontal: 14,
    alignItems: 'center',
    marginTop: 16,
  },
  playLinkLabel: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.accent, textAlign: 'center' },
  quietLinkHit: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 12 },
  quietLink: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  hint: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textDim, marginTop: 14 },
  footer: { marginTop: 26 },
});
