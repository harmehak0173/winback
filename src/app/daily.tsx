import { Redirect, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { MessageIcon } from '@/components/icons';
import { ModalBar, useLeave, useOpenPlay } from '@/components/ModalBar';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { useNow } from '@/hooks/useNow';
import { todaysMove, todaysRead } from '@/lib/daily';
import { localDayKey } from '@/lib/day';
import { smsPartner } from '@/lib/partner';
import { DAILY_READS, type DailyRead } from '@/state/dailyReads';
import { PLAYBOOK } from '@/state/playbook';
import { useAppState } from '@/state/AppState';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * The day's piece of the 28-day curriculum.
 *
 * Premium (and the free week) get the one-minute read, plus the reads already
 * finished to look back on. Everyone else gets Today's move: the same day's
 * protective action on its own, its play, and a one-tap text when the move is
 * "tell your person". The action is the part that protects someone, so it is
 * free; the why behind it is what Premium adds, said in one quiet line.
 *
 * Marked done when they reach the end and say so, not on open - opening and
 * closing by accident must not burn the day, and "Done, see you tomorrow" is
 * the small completion beat the whole loop hangs on. One counter either way:
 * a move and a read advance the same curriculum.
 */
export default function Daily() {
  const router = useRouter();
  const leave = useLeave();
  const openPlay = useOpenPlay();
  const { ready, isPremium, dailyIndex, dailyLastReadDay, markDailyRead, partner } = useAppState();
  // Derived live, but only once hydration has finished: a mount-time capture
  // read the default index 0 whenever this screen opened before AsyncStorage
  // loaded, and served Day 1 to everyone regardless of progress. Live
  // derivation is safe mid-read because todaysRead keeps returning the piece
  // just read after markDailyRead advances the index - that is what its
  // readToday backstep exists for.
  const now = useNow(60_000);
  const todayKey = localDayKey(new Date(now));
  const progress = { index: dailyIndex, lastReadDay: dailyLastReadDay };
  const view = ready ? todaysRead(progress, todayKey, DAILY_READS) : null;
  const move = ready ? todaysMove(progress, todayKey, DAILY_READS) : null;

  const dayNumber = view?.dayNumber ?? 0;
  useEffect(() => {
    if (ready && dayNumber) track('daily_opened', { day: dayNumber, free: !isPremium });
    // Once per screen visit, not per re-render of the same day.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  // Hydration is fast; a blank beat beats a wrong Day 1.
  if (!ready) return <Screen edges={['top']}>{null}</Screen>;
  if (!view || !move) return <Redirect href="/(tabs)" />;

  const play = view.item.playId ? PLAYBOOK.find((p) => p.id === view.item.playId) : undefined;

  const done = () => {
    markDailyRead();
    leave();
  };

  const playLink = !!play && (
    <Pressable
      style={styles.playLink}
      onPress={() => openPlay(play.id, 'daily')}
      accessibilityRole="link"
      accessibilityHint="Opens the play in Insights"
    >
      <Text style={styles.playLinkLabel}>Goes with: {play.title}</Text>
    </Pressable>
  );

  const doneButton = (
    <View style={styles.footer}>
      <EmberButton label={view.readToday ? 'Done for today' : 'Done. See you tomorrow.'} onPress={done} />
    </View>
  );

  if (!isPremium) {
    const partnerText = move.partnerText;
    return (
      <Screen edges={['top']}>
        <ModalBar onClose={leave} />
        <ScrollView contentContainerStyle={styles.content}>
          <Eyebrow>{`Today's move · Day ${move.dayNumber}`}</Eyebrow>
          {/* The move is the whole point, so it is the headline. The read's
              title would only make sense next to the read. */}
          <Text style={[styles.headline, styles.moveHeadline]} accessibilityRole="header">
            {move.text}
          </Text>
          <Text style={styles.moveSub}>About a minute. If today is not the day, it waits for you.</Text>

          {!!partner && !!partnerText && (
            <Pressable
              style={styles.partner}
              onPress={() => {
                track('daily_partner_text');
                void smsPartner(partner, partnerText);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Text ${partner.name}`}
              accessibilityHint="Opens Messages with the text filled in. You press send."
            >
              <MessageIcon color={colors.accent} />
              <Text style={styles.partnerLabel}>Text {partner.name}</Text>
            </Pressable>
          )}

          {playLink}
          {doneButton}

          {/* The one mention of Premium on this screen, and a quiet one. */}
          <Pressable
            onPress={() => router.push('/onboarding/paywall')}
            hitSlop={8}
            style={styles.premiumHit}
            accessibilityRole="link"
            accessibilityHint="Opens the Premium plans"
          >
            <Text style={styles.premiumLine}>The why behind it is in the full read (Premium).</Text>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  return (
    <Screen edges={['top']}>
      <ModalBar onClose={leave} />
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>
          {view.pass > 1 ? `Second pass · day ${view.dayNumber} of 28` : `Day ${view.dayNumber} of 28`}
        </Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          {view.item.title}
        </Text>
        <Text style={styles.body}>{view.item.body}</Text>

        {!!view.item.action && (
          <View style={styles.actionCard}>
            <Eyebrow>Today</Eyebrow>
            <Text style={styles.actionText}>{view.item.action}</Text>
          </View>
        )}

        {!!partner && !!view.item.partnerText && (
          <Pressable
            style={styles.partner}
            onPress={() => {
              track('daily_partner_text');
              void smsPartner(partner, view.item.partnerText ?? '');
            }}
            accessibilityRole="button"
            accessibilityLabel={`Text ${partner.name}`}
            accessibilityHint="Opens Messages with the text filled in. You press send."
          >
            <MessageIcon color={colors.accent} />
            <Text style={styles.partnerLabel}>Text {partner.name}</Text>
          </Pressable>
        )}

        {playLink}
        {doneButton}

        <PastReads index={dailyIndex} current={view.item} />
      </ScrollView>
    </Screen>
  );
}

/**
 * Premium's library: every read already finished, newest first, each one
 * opening in place. Today's piece is above, so it is left out here.
 */
function PastReads({ index, current }: { index: number; current: DailyRead }) {
  const [open, setOpen] = useState<string | null>(null);
  const count = Math.min(Math.max(0, Math.trunc(index)), DAILY_READS.length);
  const past = DAILY_READS.slice(0, count)
    .filter((r) => r.id !== current.id)
    .reverse();
  if (!past.length) return null;

  return (
    <View style={styles.past}>
      <Eyebrow>Past reads</Eyebrow>
      {past.map((r) => {
        const isOpen = open === r.id;
        return (
          <View key={r.id} style={styles.pastItem}>
            <Pressable
              onPress={() => setOpen(isOpen ? null : r.id)}
              style={styles.pastHead}
              accessibilityRole="button"
              aria-expanded={isOpen}
              accessibilityLabel={`Day ${r.day}: ${r.title}`}
            >
              <Text style={styles.pastDay}>Day {r.day}</Text>
              <Text style={styles.pastTitle}>{r.title}</Text>
            </Pressable>
            {isOpen && (
              <View style={styles.pastBody}>
                <Text style={styles.pastText}>{r.body}</Text>
                {!!r.action && <Text style={styles.pastAction}>{r.action}</Text>}
              </View>
            )}
          </View>
        );
      })}
    </View>
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
  moveHeadline: { fontSize: 23, lineHeight: 23 * 1.3, letterSpacing: tracking(23) },
  moveSub: { fontFamily: fonts.body.regular, fontSize: 13.5, color: colors.textDim, marginTop: 12 },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 15.5,
    lineHeight: 15.5 * 1.65,
    color: colors.textMuted,
    marginTop: 16,
  },
  actionCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 18,
    padding: 18,
    marginTop: 24,
  },
  actionText: {
    fontFamily: fonts.body.medium,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.5,
    color: colors.text,
    marginTop: 6,
  },
  partner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 16,
  },
  partnerLabel: { flexShrink: 1, fontFamily: fonts.display.bold, fontSize: 14, color: colors.text },
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
  footer: { marginTop: 30 },
  premiumHit: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 10 },
  premiumLine: { fontFamily: fonts.body.regular, fontSize: 13, color: colors.textDim, textAlign: 'center' },
  past: { marginTop: 40 },
  pastItem: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  pastHead: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, minHeight: 48 },
  pastDay: { fontFamily: fonts.body.semibold, fontSize: 12, color: colors.textDim, minWidth: 50 },
  pastTitle: { flex: 1, fontFamily: fonts.display.bold, fontSize: 14.5, color: colors.text },
  pastBody: { paddingBottom: 16 },
  pastText: { fontFamily: fonts.body.regular, fontSize: 14, lineHeight: 14 * 1.6, color: colors.textMuted },
  pastAction: {
    fontFamily: fonts.body.medium,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
    color: colors.text,
    marginTop: 10,
  },
});
