import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { HelplineRow } from '@/components/HelplineRow';
import { ChevronLeftIcon, MessageIcon } from '@/components/icons';
import { useAddPerson } from '@/components/ModalBar';
import { PeerSupportGuide } from '@/components/RegionGuide';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { deviceDirectoryLine, deviceHelplines, isLongList } from '@/lib/helplines';
import { smsPartner } from '@/lib/partner';
import { useAppState } from '@/state/AppState';
import { COMEBACK_WEEK } from '@/state/comebackWeek';
import { DAILY_READS } from '@/state/dailyReads';
import { PLAYBOOK } from '@/state/playbook';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * Comeback week: one short thing on each of the seven mornings after a slip.
 *
 * Free forever - nothing that answers a relapse sits behind the paywall. The
 * helplines come first on the page, above the day's item, because the days
 * after a slip are when a person may want a human rather than an app.
 *
 * The tone matches the first-run days, not a reward for resetting: no count
 * of comebacks (that would make relapse a routine), no score, and a day that
 * is not opened is simply not shown - nothing here is ever "missed".
 *
 * Items reuse the reviewed curriculum (daily reads 3, 5, 12 and 27) and the
 * playbook, so the safety review behind them carries over; they live in
 * state/comebackWeek.ts with the push that names each one. Day N is N
 * calendar days after the slip; the slip day itself is day 0 ("starts
 * tomorrow").
 */

const readByDay = (day: number) => DAILY_READS.find((r) => r.day === day);

// Shared with that morning's reminder (lineBank), so the two always agree.
const DAYS = COMEBACK_WEEK;

export default function Comeback() {
  const router = useRouter();
  const { ready, comebackDay, comebackStartedDay, comebackDone, todayKey, markComebackDay, partner } =
    useAppState();
  const [open, setOpen] = useState(false);

  const directory = deviceDirectoryLine();
  const lines = [...(directory ? [directory] : []), ...deviceHelplines()];

  const item = comebackDay != null ? DAYS[comebackDay - 1] : null;
  const doneToday = comebackDone.includes(todayKey);
  const startsTomorrow = comebackStartedDay != null && comebackStartedDay === todayKey;
  const read = item?.readDay != null ? readByDay(item.readDay) : undefined;
  const play = item?.playId ? PLAYBOOK.find((p) => p.id === item.playId) : undefined;
  const next = comebackDay != null && comebackDay < 7 ? DAYS[comebackDay] : null;

  useEffect(() => {
    if (ready) track('comeback_viewed', { n: comebackDay ?? 0 });
  }, [ready, comebackDay]);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const addPerson = useAddPerson();

  // Opened cold from a comeback reminder, state is still loading: showing the
  // idle "if a slip is ever logged" page for that moment would be wrong.
  if (!ready) return <Screen>{null}</Screen>;

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={back}
          hitSlop={10}
          style={styles.back}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeftIcon color={colors.textMuted} />
        </Pressable>

        {/* First on the page, every day of the week. */}
        <Eyebrow heading style={styles.sectionLabel}>Talk to someone, any time</Eyebrow>
        {lines.map((line) => (
          <HelplineRow key={line.name + line.uri} line={line} compact={isLongList(lines)} />
        ))}

        {item ? (
          <View style={styles.card}>
            <Eyebrow color={colors.accent}>{`Comeback day ${comebackDay} of 7`}</Eyebrow>
            <Text style={styles.title} accessibilityRole="header">
              {item.title}
            </Text>
            <Text style={styles.body}>{item.text}</Text>
            <View style={styles.actionBox}>
              <Eyebrow>Today</Eyebrow>
              <Text style={styles.action}>{item.action}</Text>
            </View>

            {item.partnerText &&
              (partner ? (
                <Pressable
                  style={styles.outlineButton}
                  onPress={() => void smsPartner(partner, item.partnerText!)}
                  accessibilityRole="button"
                  accessibilityLabel={`Text ${partner.name}`}
                  accessibilityHint="Opens a text you can edit before sending"
                >
                  <MessageIcon size={16} color={colors.accent} />
                  <Text style={styles.outlineLabel}>Text {partner.name}</Text>
                </Pressable>
              ) : (
                <Pressable
                  onPress={addPerson}
                  style={styles.linkHit}
                  accessibilityRole="button"
                  accessibilityHint="Opens the partner fields in You"
                >
                  <Text style={styles.link}>No one saved yet? Add your person in You</Text>
                </Pressable>
              ))}

            {(read || play) && (
              <Pressable
                onPress={() => setOpen((o) => !o)}
                style={styles.linkHit}
                accessibilityRole="button"
                aria-expanded={open}
              >
                <Text style={styles.link}>
                  {open ? 'Hide it' : `Read: ${read ? read.title : play!.title}`}
                </Text>
              </Pressable>
            )}
            {open && <Text style={styles.readBody}>{read ? read.body : play!.body}</Text>}

            <View style={styles.footer}>
              {doneToday ? (
                <Text style={styles.doneText} accessibilityLiveRegion="polite">
                  {next ? `Done for today. Tomorrow: ${next.title.toLowerCase()}.` : 'That is the week. The plan keeps running.'}
                </Text>
              ) : (
                <EmberButton label="Done for today" onPress={() => markComebackDay(todayKey)} />
              )}
            </View>
          </View>
        ) : startsTomorrow ? (
          <View style={styles.card}>
            <Eyebrow color={colors.accent}>Comeback week</Eyebrow>
            <Text style={styles.title} accessibilityRole="header">
              It starts tomorrow.
            </Text>
            <Text style={styles.body}>
              One short thing each morning for seven days. Tonight there is only one job: no
              chasing. If the pull shows up, the panic button is one tap away.
            </Text>
            <View style={styles.footer}>
              <EmberButton label="Open the panic button" onPress={() => router.push('/panic')} />
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.title} accessibilityRole="header">
              Comeback week
            </Text>
            <Text style={styles.body}>
              If a slip is ever logged, a guided week starts here the next morning: one short thing
              a day, with these lines always at the top. Nothing to do today.
            </Text>
          </View>
        )}

        <Eyebrow heading style={styles.sectionLabel}>People who&apos;ve been there</Eyebrow>
        <PeerSupportGuide />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenX, paddingTop: 8, paddingBottom: 40 },
  back: { width: 44, height: 44, justifyContent: 'center', marginLeft: -8 },
  sectionLabel: { marginTop: 18, marginBottom: 10 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 20,
    padding: 20,
    marginTop: 18,
  },
  title: {
    fontFamily: fonts.display.extrabold,
    fontSize: 24,
    lineHeight: 24 * 1.2,
    letterSpacing: tracking(24),
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
  actionBox: {
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.surfaceWarmBorder,
    borderRadius: 14,
    padding: 14,
    marginTop: 16,
  },
  action: {
    fontFamily: fonts.body.semibold,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.5,
    color: colors.text,
    marginTop: 6,
  },
  outlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingVertical: 13,
    marginTop: 14,
  },
  outlineLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent },
  linkHit: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  link: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  readBody: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.6,
    color: colors.textMuted,
    marginTop: 10,
  },
  footer: { marginTop: 20 },
  doneText: {
    fontFamily: fonts.body.medium,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
