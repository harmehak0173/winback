import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Eyebrow } from '@/components/Eyebrow';
import { BankBlockNote, SelfExclusionGuide } from '@/components/RegionGuide';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import {
  BLOCK_LABELS,
  DAY_LABELS,
  fetchUrgePattern,
  peakSentence,
  UrgePattern,
} from '@/lib/insights';
import {
  readTriggerLog,
  summarise,
  TRIGGER_PLAY,
  TRIGGER_SHORT,
  type TriggerEntry,
} from '@/lib/triggers';
import { PLAYBOOK } from '@/state/playbook';
import { useAppState } from '@/state/AppState';
import { colors, fonts, spacing } from '@/theme/tokens';

/** Heatmap cell color: ember, opacity scaled by how hot the cell is. */
function cellColor(count: number, max: number): string {
  if (count === 0) return colors.hairlineDim;
  const t = 0.28 + 0.72 * (count / Math.max(1, max));
  return `rgba(255,138,61,${t.toFixed(2)})`;
}

export default function Insights() {
  const router = useRouter();
  // Jumps rather than scrolls when Reduce Motion is on.
  const reduced = useReducedMotion();
  // "Goes with: <play>" links (Today's move, a daily read, a reminder) land
  // here with the play named, and it opens already expanded.
  const { play: linkedPlay } = useLocalSearchParams<{ play?: string }>();
  const { isPremium, triggerLabels } = useAppState();
  const [openId, setOpenId] = useState<string | null>(null);
  const [pattern, setPattern] = useState<UrgePattern | null>(null);
  const [log, setLog] = useState<TriggerEntry[]>([]);
  const scrollRef = useRef<ScrollView>(null);
  // Each playbook card's offset in the scroll content, for scrolling to it.
  const cardY = useRef<Record<string, number>>({});

  // Refetch every time the tab is focused. Fetching once per app launch meant
  // a panic session logged during this session never appeared until a restart,
  // which is exactly when the user is most likely to look.
  useFocusEffect(
    useCallback(() => {
      track('insights_viewed');
      if (isPremium) void fetchUrgePattern().then(setPattern);
      // The trigger log loads regardless of Premium. Locked users see how much
      // of their own pattern is already built, and the tags keep collecting
      // for free - only the analysis is paid. Local, so it works offline and
      // is current the moment they come back from a panic session.
      void readTriggerLog().then(setLog);
    }, [isPremium]),
  );

  // Open the linked play and bring it into view, then drop the param so a
  // later visit to the tab does not jump there again. Not tracked with the
  // play id, for the same reason as the trigger link below.
  useFocusEffect(
    useCallback(() => {
      if (!linkedPlay) return;
      if (!PLAYBOOK.some((pl) => pl.id === linkedPlay)) {
        router.setParams({ play: undefined });
        return;
      }
      setOpenId(linkedPlay);
      track('play_opened', { from: 'link' });
      // After the expanded card has laid out.
      const t = setTimeout(() => {
        const y = cardY.current[linkedPlay];
        if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 16), animated: !reduced });
        router.setParams({ play: undefined });
      }, 300);
      return () => clearTimeout(t);
    }, [linkedPlay, router, reduced]),
  );

  const toggle = (id: string) => {
    const next = openId === id ? null : id;
    setOpenId(next);
    // Where from, never which play (plays map almost one-to-one onto triggers).
    if (next) track('play_opened', { from: 'list' });
  };

  const hasData = !!pattern && pattern.total >= 3;
  const triggers = summarise(log, triggerLabels);
  const topTrigger = triggers.ranked[0];
  const maxTrigger = Math.max(1, ...triggers.ranked.map((r) => r.count));
  const topPlay = topTrigger
    ? PLAYBOOK.find((pl) => pl.id === TRIGGER_PLAY[topTrigger.label])
    : undefined;
  const insight = pattern ? peakSentence(pattern) : null;
  const max = pattern ? Math.max(1, ...pattern.grid.flat()) : 1;

  return (
    <Screen edges={['top']}>
      <ScrollView ref={scrollRef} contentContainerStyle={styles.content}>
        <Text style={styles.title} accessibilityRole="header">
          Trigger insights
        </Text>

        {!isPremium ? (
          <View style={styles.comingSoon}>
            {/* If they tagged triggers during the free week, that data is
                theirs and it is sitting right here. Saying so is not
                manufactured urgency - it is a fact about work they already
                did. The tags themselves keep being collected for free; only
                the analysis is paid. */}
            <Text style={styles.comingSoonText}>
              {triggers.total > 0
                ? `You tagged ${triggers.total} trigger${triggers.total === 1 ? '' : 's'} during your week. Your pattern is built and sitting here: which ones really fire, which ones you predicted that never show up, and the ones you never saw coming.`
                : 'You already told Winback when you thought you bet the most. Premium shows you what actually happens: which triggers really fire, which ones you named that never show up, and the ones you never saw coming. Plus the days and hours they land on, so the danger windows stop being a surprise.'}
            </Text>
            <Pressable
              style={styles.upsell}
              onPress={() => router.push('/onboarding/paywall')}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.upsellLabel}>Unlock trigger insights</Text>
            </Pressable>
          </View>
        ) : (
          <>
            {/* Triggers come first, and this block renders from day one. The
                heatmap needs three logged sessions before it says anything,
                which meant a subscriber saw an empty screen for their first
                week. The quiz answers are a real fact about them that the app
                already held and never showed back. */}
            {triggers.total > 0 ? (
              <>
                <View style={styles.insightCard}>
                  <Text style={styles.insightText}>
                    {`Most often, it is "${TRIGGER_SHORT[topTrigger.label] ?? topTrigger.label}". `}
                    {triggers.surprises.includes(topTrigger.label)
                      ? 'You did not name that one at the start.'
                      : 'You called that one at the start.'}
                  </Text>
                </View>
                {triggers.ranked.map((r) => (
                  <View
                    key={r.label}
                    style={styles.barRow}
                    accessible
                    accessibilityLabel={`${TRIGGER_SHORT[r.label] ?? r.label}: ${r.count}`}
                  >
                    <Text style={styles.barLabel}>{TRIGGER_SHORT[r.label] ?? r.label}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[styles.barFill, { width: `${(r.count / maxTrigger) * 100}%` }]}
                      />
                    </View>
                    <Text style={styles.barCount}>{r.count}</Text>
                  </View>
                ))}
                {triggers.surprises.length > 0 && (
                  <Text style={styles.triggerNote}>
                    Did not see coming:{' '}
                    {triggers.surprises.map((l) => TRIGGER_SHORT[l] ?? l).join(', ')}.
                  </Text>
                )}
                {triggers.predictedNotSeen.length > 0 && (
                  <Text style={styles.triggerNote}>
                    Named at the start but not showing up yet:{' '}
                    {triggers.predictedNotSeen.map((l) => TRIGGER_SHORT[l] ?? l).join(', ')}.
                  </Text>
                )}
                {/* Ends the insight in something to do. Naming someone's worst
                    trigger and stopping there is a diagnosis with no
                    prescription. */}
                {!!topPlay && (
                  <Pressable
                    style={styles.playLink}
                    accessibilityRole="button"
                    onPress={() => {
                      setOpenId(topPlay.id);
                      // Deliberately WITHOUT the play id. TRIGGER_PLAY is a
                      // near-injective map, so "play_opened {play:'payday-plan',
                      // from:'trigger'}" tells anyone reading the analytics
                      // that this person's dominant trigger is payday - the
                      // exact fact the data map promises never leaves the
                      // device. The product question here is only whether the
                      // link gets tapped, and that needs no play id.
                      track('play_opened', { from: 'trigger' });
                    }}
                  >
                    <Text style={styles.playLinkLabel}>
                      Your play for that: {topPlay.title}
                    </Text>
                  </Pressable>
                )}
              </>
            ) : (
              <View style={styles.insightCard}>
                <Text style={styles.insightText}>
                  {/* The short labels are noun phrases or clauses ("Just got
                      paid", "Late night"), so they are listed after a colon
                      rather than slotted into a sentence - "it hits just got
                      paid" is what the old template produced. */}
                  {triggerLabels.length > 0
                    ? `At the start you named: ${triggerLabels
                        .map((l) => (TRIGGER_SHORT[l] ?? l).toLowerCase())
                        .join(', ')}. Tag what is actually going on when an urge hits and this turns into your real pattern.`
                    : 'Tag what is going on when an urge hits and this turns into your real pattern.'}
                </Text>
              </View>
            )}

            {hasData && !!insight && (
              <View style={styles.insightCard}>
                <Text style={styles.insightText}>{insight}</Text>
              </View>
            )}
            {hasData && (
            <View
              style={styles.heatmap}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Urge map by day and time of day. ${insight ?? ''} ${pattern!.total} urge${pattern!.total === 1 ? '' : 's'} logged.`}
            >
              <View style={styles.heatRow}>
                <View style={styles.rowLabelSpacer} />
                {DAY_LABELS.map((d) => (
                  <Text key={d} style={styles.colLabel} maxFontSizeMultiplier={1.3}>
                    {d[0]}
                  </Text>
                ))}
              </View>
              {pattern!.grid.map((row, b) => (
                <View key={b} style={styles.heatRow}>
                  <Text style={styles.rowLabel} maxFontSizeMultiplier={1.3} numberOfLines={1}>
                    {BLOCK_LABELS[b]}
                  </Text>
                  {row.map((count, d) => (
                    <View key={d} style={[styles.cell, { backgroundColor: cellColor(count, max) }]} />
                  ))}
                </View>
              ))}
              <Text style={styles.heatCaption}>
                {pattern!.total} urge{pattern!.total === 1 ? '' : 's'} logged. Darker = more urges.
              </Text>
            </View>
            )}
            {!hasData && (
              <Text style={styles.triggerNote}>
                The day and hour map fills in after a few logged urges.
              </Text>
            )}
          </>
        )}

        <Eyebrow heading style={styles.sectionLabel}>The playbook</Eyebrow>
        {PLAYBOOK.map((play) => {
          const open = openId === play.id;
          // The header is the toggle and the body sits outside it, so the
          // links in a region guide are their own targets: VoiceOver reads a
          // button as one element and could never reach a link inside it.
          return (
            <View
              key={play.id}
              style={[styles.card, open && styles.cardOpen]}
              onLayout={(e) => {
                cardY.current[play.id] = e.nativeEvent.layout.y;
              }}
            >
              <Pressable
                style={styles.cardHeader}
                onPress={() => toggle(play.id)}
                accessibilityRole="button"
                aria-expanded={open}
              >
                <View style={styles.cardTitles}>
                  <Text style={styles.cardTitle}>{play.title}</Text>
                  <Text style={styles.cardTagline}>{play.tagline}</Text>
                </View>
                <Text style={styles.chevron} importantForAccessibility="no" accessibilityElementsHidden>
                  {open ? '−' : '+'}
                </Text>
              </Pressable>
              {open && (
                <View style={styles.cardOpenBody}>
                  <Text style={styles.cardBody}>{play.body}</Text>
                  {play.regional === 'exclusion' && <SelfExclusionGuide />}
                  {play.regional === 'bank' && <BankBlockNote />}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.screenX, paddingBottom: 40 },
  title: { fontFamily: fonts.display.extrabold, fontSize: 28, color: colors.text },
  comingSoon: {
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.surfaceWarmBorder,
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
  },
  comingSoonText: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
    color: colors.notice,
  },
  upsell: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  upsellLabel: { fontFamily: fonts.display.bold, fontSize: 14.5, color: colors.accent },
  insightCard: {
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 14,
    padding: 16,
    marginTop: 14,
  },
  insightText: {
    fontFamily: fonts.body.semibold,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.5,
    color: colors.text,
  },
  heatmap: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
  },
  heatRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 5, gap: 5 },
  rowLabel: {
    width: 70,
    fontFamily: fonts.body.regular,
    fontSize: 11,
    color: colors.textDim,
  },
  rowLabelSpacer: { width: 70 },
  colLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.body.semibold,
    fontSize: 10,
    color: colors.textFaint,
  },
  cell: { flex: 1, height: 26, borderRadius: 5 },
  heatCaption: {
    fontFamily: fonts.body.regular,
    fontSize: 11.5,
    color: colors.textFaint,
    marginTop: 10,
  },
  playLink: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingVertical: 13,
    alignItems: 'center',
    marginTop: 16,
  },
  playLinkLabel: { fontFamily: fonts.display.bold, fontSize: 14, color: colors.accent },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  barLabel: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textMuted, width: 118 },
  barTrack: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.hairlineDim,
    overflow: 'hidden',
  },
  barFill: { height: 8, borderRadius: 4, backgroundColor: colors.accent },
  barCount: { fontFamily: fonts.body.medium, fontSize: 12, color: colors.textDim, minWidth: 20, textAlign: 'right' },
  triggerNote: {
    fontFamily: fonts.body.regular,
    fontSize: 12,
    lineHeight: 12 * 1.5,
    color: colors.textDim,
    marginTop: 12,
  },
  sectionLabel: { marginTop: 26, marginBottom: 12 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    marginBottom: 10,
  },
  cardOpen: { borderColor: colors.accent },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  cardOpenBody: { paddingHorizontal: 16, paddingBottom: 16, marginTop: -16 },
  cardTitles: { flex: 1 },
  cardTitle: { fontFamily: fonts.display.bold, fontSize: 15.5, color: colors.text },
  cardTagline: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textDim, marginTop: 2 },
  chevron: { fontFamily: fonts.display.bold, fontSize: 20, color: colors.accent, marginLeft: 12 },
  cardBody: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.6,
    color: colors.textMuted,
    marginTop: 12,
  },
});
