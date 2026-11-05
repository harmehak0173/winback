import { useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { BreathingGuide } from '@/components/BreathingGuide';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { HelplineRow } from '@/components/HelplineRow';
import { XIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { useNow } from '@/hooks/useNow';
import { useScreenReader } from '@/hooks/useScreenReader';
import { track } from '@/lib/analytics';
import { addDays, dayKeyToDate } from '@/lib/day';
import { deviceDirectoryLine, deviceHelplines, isLongList, useRegionKnown } from '@/lib/helplines';
import { closeoutDay, useAppState } from '@/state/AppState';
import { PATTERNS } from '@/state/breathing';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/**
 * Lights out: the late-night shutdown, about a minute long.
 *
 * Phone on the charger outside the bedroom, one calm breath, one first thing
 * for tomorrow, then "Lights out" - which also closes the day, so one ritual
 * replaces the evening close-out and the late-night nudge. Dark, no feed,
 * nothing to scroll into.
 *
 * "Can't tonight" is a plain answer, not a failure: shift workers, parents and
 * shared rooms exist. The next morning there is an optional one-tap sleep
 * rating, and a run of rough nights points to a doctor or a helpline rather
 * than to more time in the app. No claims about sleep itself.
 *
 * Before 4am it is still last night, matching closeNight(). Opened in the
 * daytime (a late tap on last night's reminder), it offers the morning
 * rating if there is one to give, and otherwise says it is for bedtime -
 * with a way to start anyway for anyone whose night is someone else's day.
 *
 * "Lights out" logs the day as clean when it is still open, and says so on
 * the last step, next to the same quiet "Not clean today" the close-out has:
 * nobody gets a clean mark for a day they did not call clean. On a Sunday the
 * ritual ends with a way into the week, since lights out stands in for the
 * Sunday recap push for late-night users.
 */

const CALM = PATTERNS.find((p) => p.id === 'calm') ?? PATTERNS[0];
/** One full calm cycle (in 4, out 6). */
const CYCLE_MS = CALM.phases.reduce((sum, p) => sum + p.seconds, 0) * 1000;

/** Small, ordinary first moves. Nothing here is stored. */
const FIRST_THINGS = [
  'A walk',
  'A proper breakfast',
  'Call someone',
  'The gym',
  'Start work early',
  'Something I planned',
];

const SLEEP_OPTIONS: { rating: 1 | 2 | 3; label: string }[] = [
  { rating: 1, label: 'Rough' },
  { rating: 2, label: 'Okay' },
  { rating: 3, label: 'Good' },
];

type Step = 'charger' | 'breathe' | 'first' | 'done';

/** Each step's headline, announced when the step changes on its own. */
const STEP_TITLE: Record<Step, string> = {
  charger: 'Phone on the charger, outside the bedroom.',
  breathe: 'One slow breath.',
  first: 'One first thing for tomorrow.',
  done: 'Goodnight.',
};

export default function LightsOut() {
  const router = useRouter();
  const { todayKey, quitDate, closeouts, nightsClosed, sleep, sleepConcern, closeNight, rateSleep } =
    useAppState();
  const now = useNow(60_000);
  const hour = new Date(now).getHours();
  const isNight = hour >= 17 || hour < 4;
  // The night this belongs to, the way closeNight() keys it.
  const night = closeoutDay(new Date(now), quitDate);
  const lastNight = addDays(todayKey, -1);

  const [startAnyway, setStartAnyway] = useState(false);
  const [step, setStep] = useState<Step>('charger');
  // How the screen was opened, fixed at mount, for the one view event.
  const [openedAtNight] = useState(() => {
    const h = new Date().getHours();
    return h >= 17 || h < 4;
  });
  const [firstThing, setFirstThing] = useState<string | null>(null);
  const [rated, setRated] = useState<1 | 2 | 3 | null>(null);

  // Region lines wait for the web's hydration (see useRegionKnown).
  const regionKnown = useRegionKnown();
  const directory = regionKnown ? deviceDirectoryLine() : null;
  const lines = regionKnown ? [...(directory ? [directory] : []), ...deviceHelplines()] : [];

  const ritual = isNight || startAnyway;
  // Whether "Lights out" will also log the day (it never overwrites a mark).
  const dayOpen = closeouts[night] == null;
  const sunday = dayKeyToDate(night).getDay() === 0;
  const alreadyClosed = nightsClosed.includes(night) && step !== 'done';
  // The morning after a lights-out, the one-tap rating (skippable).
  const canRate = !ritual && hour >= 4 && nightsClosed.includes(lastNight) && sleep[lastNight] == null;

  useEffect(() => {
    track('lights_out_viewed', { night: openedAtNight });
  }, [openedAtNight]);

  // One calm cycle, then on to tomorrow's first thing. "Next" skips ahead.
  // With a screen reader on it waits for "Next" instead: moving on by itself
  // would pull the page out from under someone still reading it.
  const readerOn = useScreenReader();
  useEffect(() => {
    if (step !== 'breathe' || readerOn) return;
    const t = setTimeout(() => setStep('first'), CYCLE_MS + 400);
    return () => clearTimeout(t);
  }, [step, readerOn]);

  // Say where the ritual is when it moves on, not only at the end.
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    AccessibilityInfo.announceForAccessibility(STEP_TITLE[step]);
  }, [step]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // Either answer moves on. Nothing is recorded: "Can't tonight" is an
  // answer, not a miss.
  const answerCharger = () => setStep('breathe');

  const lightsOut = () => {
    closeNight();
    setStep('done');
  };

  const rate = (r: 1 | 2 | 3) => {
    rateSleep(lastNight, r);
    setRated(r);
  };

  let body: React.ReactNode;
  if (canRate || rated != null) {
    body = (
      <>
        <Eyebrow>Good morning</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          How did you sleep?
        </Text>
        <Text style={styles.sub}>One tap, or skip it. It stays on this phone.</Text>
        <View style={styles.rateRow} accessibilityRole="radiogroup">
          {SLEEP_OPTIONS.map((o) => (
            <Pressable
              key={o.rating}
              style={[styles.rateChip, rated === o.rating && styles.chipOn]}
              onPress={() => rate(o.rating)}
              accessibilityRole="radio"
              aria-checked={rated === o.rating}
            >
              <Text style={[styles.chipLabel, rated === o.rating && styles.chipLabelOn]}>
                {o.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {rated != null && (
          <Text style={styles.note} accessibilityLiveRegion="polite">
            Noted. If sleep stays rough for more than a couple of weeks, it is worth talking to a
            doctor.
          </Text>
        )}
        <View style={styles.footer}>
          <EmberButton label={rated != null ? 'Close' : 'Skip'} onPress={close} />
        </View>
      </>
    );
  } else if (!ritual) {
    body = (
      <>
        <Eyebrow>Lights out</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          This one is for bedtime.
        </Text>
        <Text style={styles.sub}>
          A one-minute shutdown for the end of the day: phone away, one slow breath, one first
          thing for tomorrow.
        </Text>
        <View style={styles.footer}>
          <EmberButton label="Close" onPress={close} />
          <Pressable
            onPress={() => setStartAnyway(true)}
            style={styles.linkHit}
            accessibilityRole="button"
            accessibilityHint="For when your night is at a different time"
          >
            <Text style={styles.link}>My night is now. Start it</Text>
          </Pressable>
        </View>
      </>
    );
  } else if (alreadyClosed) {
    body = (
      <>
        <Eyebrow>Lights out</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          Tonight is already closed out.
        </Text>
        <Text style={styles.sub}>Nothing left to do. Goodnight.</Text>
        <View style={styles.footer}>
          <EmberButton label="Close" onPress={close} />
        </View>
      </>
    );
  } else if (step === 'charger') {
    body = (
      <>
        <Eyebrow>Lights out · 1 of 3</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          {STEP_TITLE.charger}
        </Text>
        <Text style={styles.sub}>
          The late-night urge needs the phone within reach. Across the room works too.
        </Text>
        <View style={styles.footer}>
          <EmberButton label="Done" onPress={answerCharger} />
          <Pressable
            style={styles.secondary}
            onPress={answerCharger}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryLabel}>Can&apos;t tonight</Text>
          </Pressable>
        </View>
      </>
    );
  } else if (step === 'breathe') {
    body = (
      <>
        <Eyebrow>Lights out · 2 of 3</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          {STEP_TITLE.breathe}
        </Text>
        <View style={styles.guide}>
          <BreathingGuide pattern={CALM} voiceOn={false} />
        </View>
        <Pressable
          onPress={() => setStep('first')}
          style={styles.linkHit}
          accessibilityRole="button"
          accessibilityLabel="Next"
        >
          <Text style={styles.link}>Next</Text>
        </Pressable>
      </>
    );
  } else if (step === 'first') {
    body = (
      <>
        <Eyebrow>Lights out · 3 of 3</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header">
          {STEP_TITLE.first}
        </Text>
        <Text style={styles.sub}>Pick one, or keep your own in mind. Then it is decided.</Text>
        <View style={styles.chips} accessibilityRole="radiogroup">
          {FIRST_THINGS.map((t) => (
            <Pressable
              key={t}
              style={[styles.chip, firstThing === t && styles.chipOn]}
              onPress={() => setFirstThing((f) => (f === t ? null : t))}
              accessibilityRole="radio"
              aria-checked={firstThing === t}
            >
              <Text style={[styles.chipLabel, firstThing === t && styles.chipLabelOn]}>{t}</Text>
            </Pressable>
          ))}
        </View>
        {dayOpen && (
          <Text style={styles.cleanNote}>&ldquo;Lights out&rdquo; also logs today as a clean day.</Text>
        )}
        <View style={styles.footer}>
          <EmberButton label="Lights out" onPress={lightsOut} />
          {dayOpen && (
            <Pressable
              onPress={() => router.push('/slip')}
              style={styles.linkHit}
              accessibilityRole="button"
              accessibilityHint="Opens the slip screen. Nothing here is judged."
            >
              <Text style={[styles.link, styles.linkFlat]}>Not clean today</Text>
            </Pressable>
          )}
        </View>
      </>
    );
  } else {
    body = (
      <>
        <Eyebrow color={colors.accent}>Day closed</Eyebrow>
        <Text style={styles.headline} accessibilityRole="header" accessibilityLiveRegion="polite">
          {STEP_TITLE.done}
        </Text>
        <Text style={styles.sub}>
          {firstThing
            ? `Today is closed out. Tomorrow starts with: ${firstThing.toLowerCase()}.`
            : 'Today is closed out. Tomorrow can wait until tomorrow.'}
        </Text>
        <View style={styles.footer}>
          <EmberButton label="Close" onPress={close} />
          {sunday && (
            <Pressable
              onPress={() => router.replace('/recap')}
              style={styles.linkHit}
              accessibilityRole="button"
              accessibilityHint="Opens this week's recap"
            >
              <Text style={[styles.link, styles.linkFlat]}>See your week</Text>
            </Pressable>
          )}
        </View>
      </>
    );
  }

  return (
    <Screen style={styles.screen} onEscape={close}>
      <View style={styles.closeRow}>
        <Pressable
          style={styles.closeButton}
          onPress={close}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <XIcon color={colors.textMuted} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {body}

        {/* A run of rough nights is a reason to talk to someone, not to
            spend more time in an app. */}
        {sleepConcern && (
          <View style={styles.concern}>
            <Text style={styles.concernText}>
              The last few nights have been rough. If that keeps up, a doctor is worth a visit. If
              betting is part of what keeps you up, these lines are free and open late.
            </Text>
            {lines.map((line) => (
              <HelplineRow key={line.name + line.uri} line={line} compact={isLongList(lines)} />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: colors.bgDeep },
  closeRow: { alignItems: 'flex-end', paddingHorizontal: spacing.screenX, paddingTop: 10 },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flexGrow: 1, paddingHorizontal: spacing.screenX, paddingTop: 24, paddingBottom: 28 },
  headline: {
    fontFamily: fonts.display.extrabold,
    fontSize: 27,
    lineHeight: 27 * 1.2,
    letterSpacing: tracking(27),
    color: colors.text,
    marginTop: 10,
  },
  sub: {
    fontFamily: fonts.body.regular,
    fontSize: 14.5,
    lineHeight: 14.5 * 1.55,
    color: colors.textMuted,
    marginTop: 12,
  },
  guide: { alignItems: 'center', marginTop: 18 },
  footer: { marginTop: 32, gap: 12 },
  secondary: {
    borderWidth: 1.5,
    borderColor: colors.hairline,
    borderRadius: spacing.radius,
    paddingVertical: 15,
    alignItems: 'center',
  },
  secondaryLabel: { fontFamily: fonts.display.bold, fontSize: 16, color: colors.text },
  link: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 14,
  },
  linkHit: { minHeight: 44, justifyContent: 'center', marginTop: 4 },
  linkFlat: { marginTop: 0 },
  cleanNote: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.textDim,
    marginTop: 18,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 18 },
  chip: {
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 15,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.surfaceWarm },
  chipLabel: { fontFamily: fonts.body.medium, fontSize: 14, color: colors.text },
  chipLabelOn: { color: colors.accent },
  rateRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  rateChip: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  note: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.textDim,
    marginTop: 16,
  },
  concern: { marginTop: 30 },
  concernText: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
    color: colors.textMuted,
    marginBottom: 12,
  },
});
