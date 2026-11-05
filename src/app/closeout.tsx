import * as Haptics from 'expo-haptics';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '@/components/Chip';
import { formatDay } from '@/components/CloseMark';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { ModalBar, useLeave } from '@/components/ModalBar';
import { Screen } from '@/components/Screen';
import { track } from '@/lib/analytics';
import { TRIGGER_OPTIONS, TRIGGER_SHORT } from '@/lib/triggers';
import type { PlanOutcome } from '@/lib/weekly';
import { closeoutDay, useAppState } from '@/state/AppState';
import { planById, planSentence } from '@/state/plans';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** None of these is a failure. "Not today" is as good an answer as "Held". */
const OUTCOMES: { value: PlanOutcome; label: string }[] = [
  { value: 0, label: 'Held' },
  { value: 1, label: "Didn't come up" },
  { value: 2, label: 'Not today' },
];

/**
 * Close the day (hook 2), reached from the evening push, the Android widget,
 * Home's "More options" and a saved team's post-game push.
 *
 * One tap closes it clean. Everything else is optional and skippable: was it
 * close (a close call beaten counts every bit as much, and is an urge ridden
 * out), what was happening, whether today's play held, and a game watched
 * clean. "Not clean today" is a quiet link into the slip flow, never a red
 * button - the slip flow marks the day, this screen never does.
 *
 * Params:
 * - `game=<id>`: the post-game variant. "Final. Watched it clean?" Skipping
 *   the game counts exactly the same as watching it clean. It never shows a
 *   score, a result or anything about the game beyond that it ended.
 * - `recap=1`: the Sunday push. After closing, carry on to the week's recap
 *   (it also does on any Sunday).
 *
 * The day it closes is fixed when the screen opens, by the lights-out rule:
 * before 4am it is still last night (closeoutDay). A push tapped after
 * midnight closes the day it was about, and says "yesterday".
 */
export default function Closeout() {
  const router = useRouter();
  const leave = useLeave();
  const params = useLocalSearchParams<{ game?: string; recap?: string }>();
  const game = typeof params.game === 'string' && params.game.trim() ? params.game.trim() : null;
  const recapParam = params.recap === '1';
  const {
    ready,
    quitDate,
    todayKey,
    closeouts,
    closeDay,
    todayPlan,
    todayPlanItem,
    planOutcomes,
    setPlanOutcome,
    cleanGames,
    logCleanGame,
    lifetime,
    week,
  } = useAppState();

  const [close, setClose] = useState(false);
  const [triggers, setTriggers] = useState<number[]>([]);
  const [outcome, setOutcome] = useState<PlanOutcome | null>(null);
  const [gameChip, setGameChip] = useState(false);
  const [gameAnswer, setGameAnswer] = useState<'watched' | 'skipped' | null>(null);
  const [done, setDone] = useState<null | 'clean' | 'close'>(null);
  const [openedAt] = useState(() => new Date());

  useEffect(() => {
    // Which way in, never what was answered.
    track('closeout_opened', { from: game ? 'game' : recapParam ? 'recap' : 'default' });
    // Once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydration is fast; a blank beat beats a form that forgets today's mark.
  if (!ready) return <Screen edges={['top']}>{null}</Screen>;
  // Opened from a stale widget or push before (or after undoing) a commit.
  if (!quitDate) return <Redirect href="/" />;

  const day = closeoutDay(openedAt, quitDate);
  const isToday = day === todayKey;
  const dayMark = closeouts[day] ?? null;
  const planItem = isToday
    ? todayPlanItem
    : todayPlan?.day === day
      ? (planById(todayPlan.planId) ?? null)
      : null;
  const manualId = `manual-${day}`;
  const manualLogged = cleanGames.some((g) => g.gameId === manualId);
  const loggedGame = game ? cleanGames.find((g) => g.gameId === game) : undefined;
  const gameOutcome = gameAnswer ?? loggedGame?.outcome ?? null;
  const shownOutcome = outcome ?? planOutcomes[day] ?? null;
  // Only when closing today: after midnight "this week" may already be the
  // next one.
  const recapNext = isToday && (recapParam || week.isRecapDay);
  const slipDay = dayMark === 2;
  const dayWord = isToday ? 'Today' : 'Yesterday';

  // Both answers are clean by definition, and this push stood in for
  // tonight's close-out, so answering it closes the day too. Someone who
  // answers the question they were asked and puts the phone down still has
  // today on the record. Anything below (a close call, the play) can still
  // be added: a clean day upgrades to a close call, never the other way.
  const answerGame = (o: 'watched' | 'skipped') => {
    if (!game) return;
    Haptics.selectionAsync().catch(() => {});
    setGameAnswer(o);
    logCleanGame(game, o, day);
    if (dayMark == null) closeDay('clean', { day });
  };

  const toggleTrigger = (i: number) =>
    setTriggers((t) => (t.includes(i) ? t.filter((x) => x !== i) : [...t, i]));

  const submit = () => {
    const kind = close ? 'close' : 'clean';
    if (!slipDay) closeDay(kind, { triggers: close ? triggers : [], day });
    if (planItem && outcome != null) setPlanOutcome(day, outcome);
    if (!game && gameChip && !manualLogged) logCleanGame(null, 'watched', day);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // A slip day never carries on into the weekly recap: someone who has just
    // logged a slip is not sent to look at their week.
    if (slipDay) {
      leave();
      return;
    }
    if (recapNext) {
      router.replace('/recap');
      return;
    }
    AccessibilityInfo.announceForAccessibility('Locked in.');
    setDone(kind === 'close' || dayMark === 1 ? 'close' : 'clean');
  };

  if (done) {
    return (
      <Screen edges={['top']}>
        <ModalBar onClose={leave} />
        <ScrollView contentContainerStyle={styles.content}>
          <Eyebrow>Closed out</Eyebrow>
          <Text style={styles.headline} accessibilityRole="header">
            {done === 'close' ? 'Close call beaten. Locked in.' : 'Locked in.'}
          </Text>
          <Text style={styles.body}>
            {plural(lifetime.cleanDaysLogged, 'clean day')} logged.
            {done === 'close' ? ` ${plural(lifetime.urgesRiddenOut, 'urge')} ridden out.` : ''}
            {gameOutcome || gameChip ? ` Games watched clean: ${lifetime.gamesWatchedClean}.` : ''}
          </Text>
          <Text style={styles.quiet}>These only go up. See you tomorrow.</Text>
          <View style={styles.footer}>
            <EmberButton label="Done" onPress={leave} />
          </View>
        </ScrollView>
      </Screen>
    );
  }

  const gamePending = !!game && gameOutcome == null;

  return (
    <Screen edges={['top']}>
      <ModalBar onClose={leave} />
      <ScrollView contentContainerStyle={styles.content}>
        {game && (
          <View style={styles.gameBlock}>
            <Eyebrow>Final</Eyebrow>
            <Text style={styles.headline} accessibilityRole="header">
              Final. Watched it clean?
            </Text>
            {gamePending ? (
              <>
                <Text style={styles.body}>
                  Skipping it counts exactly the same. Either way, the betting companies got nothing from
                  you tonight.
                </Text>
                {/* Equal weight: neither answer is the better one. */}
                <View style={styles.choices}>
                  <Pressable
                    style={styles.choiceButton}
                    onPress={() => answerGame('watched')}
                    accessibilityRole="button"
                  >
                    <Text style={styles.choiceLabel}>Watched it clean</Text>
                  </Pressable>
                  <Pressable
                    style={styles.choiceButton}
                    onPress={() => answerGame('skipped')}
                    accessibilityRole="button"
                  >
                    <Text style={styles.choiceLabel}>Skipped it (also clean)</Text>
                  </Pressable>
                </View>
                <Pressable
                  onPress={() => router.push({ pathname: '/slip', params: { from: 'closeout' } })}
                  hitSlop={8}
                  style={styles.quietLinkHit}
                  accessibilityRole="button"
                  accessibilityHint="Opens the slip screen. Nothing here is judged."
                >
                  <Text style={styles.quietLink}>I bet on it</Text>
                </Pressable>
              </>
            ) : (
              <Text style={styles.body} accessibilityLiveRegion="polite">
                {gameOutcome === 'skipped' ? 'Skipped it. ' : 'Watched it clean. '}
                Games watched clean: {lifetime.gamesWatchedClean}.
              </Text>
            )}
          </View>
        )}

        {!gamePending && (
          <>
            <Eyebrow style={game ? styles.sectionTop : undefined}>
              {isToday ? formatDay(day, 'long') : `Yesterday, ${formatDay(day, 'long')}`}
            </Eyebrow>
            <Text style={[styles.headline, game && styles.headlineSmall]} accessibilityRole="header">
              {slipDay
                ? `${dayWord} is logged.`
                : dayMark != null
                  ? `${dayWord} is closed out.`
                  : `Close out ${dayWord.toLowerCase()}.`}
            </Text>
            <Text style={styles.body}>
              {slipDay
                ? `You know the way back. ${isToday ? 'Tomorrow' : 'Today'} is a fresh close-out.`
                : dayMark != null
                  ? 'Anything to add? All of it is optional.'
                  : 'One tap is enough. Everything below is optional.'}
            </Text>

            {dayMark == null || dayMark === 0 ? (
              <>
                <Text style={styles.question}>Was it close?</Text>
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Was it close?">
                  <Chip label="No" selected={!close} onPress={() => setClose(false)} />
                  <Chip label="Close call, I beat it" selected={close} onPress={() => setClose(true)} />
                </View>
                {close && (
                  <>
                    <Text style={styles.question}>What was happening?</Text>
                    <View style={styles.chips}>
                      {TRIGGER_OPTIONS.map((option, i) => (
                        <Chip
                          key={option}
                          role="checkbox"
                          label={TRIGGER_SHORT[option] ?? option}
                          // Named by its visible words; the full phrase as the hint.
                          hint={option}
                          selected={triggers.includes(i)}
                          onPress={() => toggleTrigger(i)}
                        />
                      ))}
                    </View>
                    <Text style={styles.hint}>Optional. Pick any, or none.</Text>
                  </>
                )}
              </>
            ) : dayMark === 1 ? (
              <Text style={styles.note}>Close call beaten. It counts, and it is in your wins column.</Text>
            ) : null}

            {!!planItem && (
              <>
                <Text style={styles.question}>Did the play hold?</Text>
                <Text style={styles.planText}>{planSentence(planItem)}</Text>
                <View style={styles.chips} accessibilityRole="radiogroup" accessibilityLabel="Did the play hold?">
                  {OUTCOMES.map((o) => (
                    <Chip
                      key={o.value}
                      label={o.label}
                      selected={shownOutcome === o.value}
                      onPress={() => setOutcome(o.value)}
                    />
                  ))}
                </View>
              </>
            )}

            {!game && (
              <View style={styles.chipsSolo}>
                <Chip
                  role="checkbox"
                  label="Watched a game clean"
                  selected={manualLogged || gameChip}
                  onPress={() => {
                    if (!manualLogged) setGameChip((v) => !v);
                  }}
                  hint={
                    manualLogged
                      ? `Already logged ${dayWord.toLowerCase()}`
                      : 'Adds one to games watched clean'
                  }
                />
              </View>
            )}

            <View style={styles.footer}>
              <EmberButton
                label={slipDay ? 'Done' : dayMark != null ? 'Save' : `Close out ${dayWord.toLowerCase()}`}
                onPress={submit}
              />
            </View>

            {!slipDay && (
              <Pressable
                onPress={() => router.push({ pathname: '/slip', params: { from: 'closeout' } })}
                hitSlop={8}
                style={styles.quietLinkHit}
                accessibilityRole="button"
                accessibilityHint="Opens the slip screen. Nothing here is judged."
              >
                <Text style={styles.quietLink}>Not clean {dayWord.toLowerCase()}</Text>
              </Pressable>
            )}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: spacing.screenX, paddingTop: 12, paddingBottom: 40 },
  gameBlock: { marginBottom: 8 },
  headline: {
    fontFamily: fonts.display.extrabold,
    fontSize: 27,
    lineHeight: 27 * 1.2,
    letterSpacing: tracking(27),
    color: colors.text,
    marginTop: 10,
  },
  headlineSmall: { fontSize: 22, lineHeight: 22 * 1.2 },
  sectionTop: { marginTop: 28 },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 15,
    lineHeight: 15 * 1.55,
    color: colors.textMuted,
    marginTop: 12,
  },
  quiet: { fontFamily: fonts.body.regular, fontSize: 13, color: colors.textDim, marginTop: 10 },
  question: { fontFamily: fonts.display.bold, fontSize: 15.5, color: colors.text, marginTop: 26 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chipsSolo: { flexDirection: 'row', marginTop: 26 },
  hint: { fontFamily: fonts.body.regular, fontSize: 12, color: colors.textFaint, marginTop: 8 },
  note: { fontFamily: fonts.body.medium, fontSize: 13.5, color: colors.accentDim, marginTop: 20 },
  planText: {
    fontFamily: fonts.body.regular,
    fontSize: 13.5,
    lineHeight: 13.5 * 1.5,
    color: colors.textMuted,
    marginTop: 4,
  },
  choices: { marginTop: 22, gap: 12 },
  choiceButton: {
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius,
    paddingVertical: 15,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  choiceLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.text, textAlign: 'center' },
  footer: { marginTop: 30 },
  quietLinkHit: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', marginTop: 10 },
  quietLink: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
});
