import { Redirect, useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatDay } from '@/components/CloseMark';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { HelplineRow } from '@/components/HelplineRow';
import { MessageIcon } from '@/components/icons';
import { ModalBar, useLeave, useOpenPlay } from '@/components/ModalBar';
import { Screen } from '@/components/Screen';
import { WeekStrip } from '@/components/WeekStrip';
import { track } from '@/lib/analytics';
import { addDays } from '@/lib/day';
import { formatDollars } from '@/lib/format';
import { deviceDirectoryLine, deviceHelplines } from '@/lib/helplines';
import { smsPartner } from '@/lib/partner';
import { pickPlays } from '@/lib/todaysPlay';
import { TRIGGER_SHORT } from '@/lib/triggers';
import { useAppState } from '@/state/AppState';
import { planSentence } from '@/state/plans';
import { PLAYBOOK } from '@/state/playbook';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * The week, Monday to Sunday (hook 8), computed on the device. Reached from
 * the Sunday close-out, Home on a Sunday and the Streak tab's week strip.
 *
 * It leads with what was kept and logged. Slips are a neutral count with the
 * way back, never a grade, and a blank day is not counted at all. The one
 * Premium line - what actually set urges off this week, against what the quiz
 * predicted - is simply absent for free users; nothing is blurred or teased.
 * The partner text is always started by the user and never includes money.
 *
 * A zero is not shown as a score: rows with nothing in them yet are left out,
 * and a week with no close-outs yet says so in one line instead of a column
 * of zeros. It ends with one play to keep in mind for tomorrow.
 */
export default function Recap() {
  const router = useRouter();
  const leave = useLeave();
  const openPlay = useOpenPlay();
  const {
    ready,
    quitDate,
    week,
    lifetime,
    nextMilestone,
    todayKey,
    isPremium,
    triggerLabels,
    partner,
    comebackDay,
    comebackStartedDay,
    playContext,
  } = useAppState();

  useEffect(() => {
    track('recap_viewed');
  }, []);

  if (!ready) return <Screen edges={['top']}>{null}</Screen>;
  if (!quitDate) return <Redirect href="/" />;

  // Only what has something in it: a zero on the page reads as a score.
  const rows: { label: string; value: string }[] = [];
  if (week.cleanDays > 0) rows.push({ label: 'Clean days logged', value: String(week.cleanDays) });
  if (week.closeCalls > 0) rows.push({ label: 'Close calls beaten', value: String(week.closeCalls) });
  if (week.urgesRiddenOut > 0) rows.push({ label: 'Urges ridden out', value: String(week.urgesRiddenOut) });
  if (week.plansAnswered > 0) {
    rows.push({ label: 'Plans held', value: `${week.plansHeld} of ${week.plansAnswered}` });
  }
  if (week.nightsClosed > 0) rows.push({ label: 'Nights closed out', value: String(week.nightsClosed) });
  if (week.gamesWatchedClean > 0) {
    rows.push({ label: 'Games watched clean', value: String(week.gamesWatchedClean) });
  }
  if (lifetime.linesCut > 0) rows.push({ label: 'Lines cut, all time', value: String(lifetime.linesCut) });
  const firstWeek = week.cleanDays + week.closeCalls + week.slipDays === 0;
  const showMoney = week.moneyKept >= 1;

  // The way back from a slip, on this screen: comeback week while it runs,
  // otherwise the region's first line.
  const comebackOn = comebackDay != null || comebackStartedDay === todayKey;
  const directory = deviceDirectoryLine();
  const helpLine = deviceHelplines()[0] ?? directory;

  // One play to keep in mind for tomorrow, from the same picker Home uses.
  // Read-only: a pin is always for today, and tomorrow's list is made fresh.
  const tomorrowPlan = pickPlays(addDays(todayKey, 1), playContext).plans[0] ?? null;

  const top = isPremium ? week.topTrigger : null;
  const topPredicted = top ? triggerLabels.includes(top.label) : false;
  const topPlay = top?.playId ? PLAYBOOK.find((p) => p.id === top.playId) : undefined;

  const range = `${formatDay(week.start)} - ${formatDay(week.end)}`;

  const textPartner = () => {
    track('recap_partner_text');
    const body = `My week: ${plural(week.cleanDays, 'clean day')} logged, ${plural(
      week.urgesRiddenOut,
      'urge',
    )} ridden out. Thanks for being in my corner.`;
    void smsPartner(partner, body);
  };

  return (
    <Screen edges={['top']}>
      <ModalBar onClose={leave} />
      <ScrollView contentContainerStyle={styles.content}>
        <Eyebrow>Your week</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          {week.cleanDays > 0 ? `${plural(week.cleanDays, 'clean day')} logged.` : 'Here is your week.'}
        </Text>
        <Text style={styles.range}>{range}</Text>

        <View style={styles.card}>
          <WeekStrip week={week} />
        </View>
        {firstWeek && (
          <Text style={styles.first}>Your first close-out starts this week&apos;s record.</Text>
        )}

        {showMoney && (
          <View style={styles.moneyCard} accessible accessibilityRole="text">
            <Eyebrow>Kept from betting this week (estimated)</Eyebrow>
            <Text style={styles.money} maxFontSizeMultiplier={1.25} numberOfLines={1} adjustsFontSizeToFit>
              {formatDollars(week.moneyKept)}
            </Text>
          </View>
        )}

        <View style={styles.rows}>
          {rows.map((r) => (
            <View
              key={r.label}
              style={styles.row}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`${r.label}: ${r.value}`}
            >
              <Text style={styles.rowLabel}>{r.label}</Text>
              <Text style={styles.rowValue} maxFontSizeMultiplier={1.3}>
                {r.value}
              </Text>
            </View>
          ))}
        </View>

        {week.slipDays > 0 && (
          <>
            <Text style={styles.slips}>
              {plural(week.slipDays, 'day')} logged as a slip. Logging it is the part that works, and you
              know the way back.
            </Text>
            {comebackOn ? (
              <Pressable
                onPress={() => router.push('/comeback')}
                style={styles.linkHit}
                accessibilityRole="button"
                accessibilityHint="Opens comeback week"
              >
                <Text style={styles.quietLink}>Open comeback week</Text>
              </Pressable>
            ) : (
              !!helpLine && <HelplineRow line={helpLine} style={styles.helpline} />
            )}
          </>
        )}

        {!!nextMilestone && (
          <Text style={styles.next}>
            Next up: {nextMilestone.title}, on {formatDay(addDays(todayKey, nextMilestone.inDays), 'long')}.
          </Text>
        )}

        {top && (
          <View style={styles.insight}>
            <Eyebrow>What set it off this week</Eyebrow>
            <Text style={styles.insightText}>
              {TRIGGER_SHORT[top.label] ?? top.label}, {plural(top.count, 'time')}.{' '}
              {topPredicted
                ? 'You called that one in your quiz.'
                : 'Not one you predicted. Worth knowing.'}
            </Text>
            {topPlay && (
              <Pressable
                onPress={() => openPlay(topPlay.id, 'recap')}
                hitSlop={8}
                style={styles.linkHit}
                accessibilityRole="link"
              >
                <Text style={styles.link}>The play for it: {topPlay.title}</Text>
              </Pressable>
            )}
          </View>
        )}

        {!!tomorrowPlan && (
          <View style={styles.insight}>
            <Eyebrow>A play for tomorrow</Eyebrow>
            <Text style={styles.insightText}>{planSentence(tomorrowPlan)}</Text>
            <Text style={styles.quietNote}>Tomorrow&apos;s plays are on Home in the morning.</Text>
          </View>
        )}

        {!!partner && (
          <Pressable
            style={styles.partner}
            onPress={textPartner}
            accessibilityRole="button"
            accessibilityLabel={`Text ${partner.name} your week`}
            accessibilityHint="Opens Messages with the text filled in. You press send."
          >
            <MessageIcon color={colors.accent} />
            <Text style={styles.partnerLabel}>Text {partner.name} your week</Text>
          </Pressable>
        )}

        <View style={styles.footer}>
          <EmberButton label="Done" onPress={leave} />
        </View>
      </ScrollView>
    </Screen>
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
  range: { fontFamily: fonts.body.regular, fontSize: 13, color: colors.textDim, marginTop: 6 },
  first: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: colors.textMuted,
    marginTop: 14,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    padding: 16,
    marginTop: 20,
  },
  moneyCard: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    padding: 18,
    marginTop: 12,
  },
  money: {
    fontFamily: fonts.display.extrabold,
    fontSize: 34,
    letterSpacing: tracking(34),
    color: colors.text,
    marginTop: 6,
    fontVariant: ['tabular-nums'],
  },
  rows: { marginTop: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  rowLabel: { flex: 1, fontFamily: fonts.body.regular, fontSize: 14.5, color: colors.textMuted },
  rowValue: { fontFamily: fonts.display.bold, fontSize: 16, color: colors.text, fontVariant: ['tabular-nums'] },
  slips: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
    color: colors.textMuted,
    marginTop: 16,
  },
  next: { fontFamily: fonts.body.medium, fontSize: 13.5, color: colors.accentDim, marginTop: 16 },
  insight: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    padding: 16,
    marginTop: 20,
  },
  insightText: {
    fontFamily: fonts.body.medium,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.5,
    color: colors.text,
    marginTop: 6,
  },
  linkHit: { minHeight: 44, justifyContent: 'center' },
  quietLink: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  quietNote: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textDim, marginTop: 8 },
  helpline: { marginTop: 12, marginBottom: 0 },
  link: { fontFamily: fonts.display.bold, fontSize: 13.5, color: colors.accent },
  partner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 20,
  },
  partnerLabel: { flexShrink: 1, fontFamily: fonts.display.bold, fontSize: 14.5, color: colors.text },
  footer: { marginTop: 26 },
});
