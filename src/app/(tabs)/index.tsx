import { useIsFocused, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  type LayoutChangeEvent,
  AppState as RNAppState,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useAnimatedValue } from '@/hooks/useAnimatedValue';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { countdownText } from '@/components/CountdownLabel';
import { CutLinesCard } from '@/components/CutLinesCard';
import { EmberButton } from '@/components/EmberButton';
import { Eyebrow } from '@/components/Eyebrow';
import { currentGoal, GoalBar } from '@/components/GoalBar';
import { HomeCard } from '@/components/HomeCard';
import { GearIcon, ShareIcon } from '@/components/icons';
import { useLockCover } from '@/components/LockGate';
import { MilestoneCelebration } from '@/components/MilestoneCelebration';
import { PlanCard } from '@/components/PlanCard';
import { QuickUrgeSheet } from '@/components/QuickUrgeSheet';
import { Screen } from '@/components/Screen';
import { RING_SIZE, StreakRing } from '@/components/StreakRing';
import { TodayMoveCard } from '@/components/TodayMoveCard';
import { useNow } from '@/hooks/useNow';
import { track } from '@/lib/analytics';
import { addDays } from '@/lib/day';
import { DAY_MS, hmsWithinDay, splitMoney } from '@/lib/format';
import { onUsDate } from '@/lib/hardship';
import { msSincePanic } from '@/lib/panicSession';
import { checkPremium } from '@/lib/purchases';
import { maybeAskForReview } from '@/lib/review';
import { shareMessage } from '@/lib/share';
import { trialLabel } from '@/lib/trial';
import { useAppState } from '@/state/AppState';
import { milestonesThrough, nextMilestoneAfter } from '@/state/milestones';
import { colors, fonts, spacing, tracking } from '@/theme/tokens';

/** No sales screen within this long of the panic screen being open. */
const PANIC_QUIET_MS = 10 * 60_000;
/** Home must be on screen, with the app in front, this long before the prompt. */
const PROMPT_SETTLE_MS = 1500;
/** Contextual cards shown at once. More than this and Home stops being calm. */
const MAX_CARDS = 3;
/** Cut the lines ranks high for the first two weeks of a run, then drops back. */
const CUT_LINES_EARLY_DAYS = 14;
/**
 * Below this window height (an iPhone SE is 667) the ring and the money card
 * tighten, so more of Home fits without a scroll.
 */
const COMPACT_HEIGHT = 700;
const COMPACT_RING = 184;

/**
 * Where the urge button sits, most faithful to the design first:
 *  - 'design': ring, money, check-in, urge (design/README's order).
 *  - 'afterMoney': ring, money, urge, check-in.
 *  - 'underRing': ring, urge, money, check-in.
 * Home measures itself and uses the first spot that keeps the whole urge
 * button above the tab bar without a scroll, whatever else is showing: the
 * free-week banner, the goal bar, a checkpoint note, a two-line label, larger
 * text. A fixed breakpoint cannot promise that, because those come and go;
 * on an iPhone SE with the banner and a checkpoint note, only 'underRing'
 * fits. placeUrge() below keeps the choice from flip-flopping.
 */
const URGE_SPOTS = ['design', 'afterMoney', 'underRing'] as const;
type UrgeSpot = (typeof URGE_SPOTS)[number];
/** The gaps above the blocks the placement moves (their marginTop). */
const GAP = { money: 22, checkIn: 14, urgeAfterCheckIn: 6, urge: 14 };
const GAP_COMPACT = { money: 12, checkIn: 10, urgeAfterCheckIn: 6, urge: 12 };
/** Clear space kept between the urge button and the tab bar. */
const FOLD_MARGIN = 12;
/**
 * The design order also leaves room for the line that appears under the
 * check-in once the day is closed, so tapping "I stayed clean today" never
 * pushes the urge button under the tab bar.
 */
const CHECK_IN_GROWTH = 32;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Once per app process, not per mount: the lock overlay no longer remounts
// Home, but a tab re-render or a fast refresh still must not count as a view.
let homeViewTracked = false;
// Also once per process: Continue on the priming screen marks it seen, so
// this guards against a second push before that lands, and against pushing
// it again in the same session after a back swipe.
let remindersIntroOffered = false;

/**
 * Home - the daily anchor. The run (ring), what it has kept (money and the
 * goal it is going toward), today's close-out, the urge button, and at most
 * three contextual cards. Both counters tick live off quit_date at 1s.
 *
 * Card priority, highest first (then anything whose job is done today drops
 * below anything still open, and only the top MAX_CARDS show):
 *   1. Comeback week - the answer to a slip, so it is never crowded out.
 *   2. Today's play - the plan for the day's risk; the morning push lands here.
 *   2b. The morning after a lights-out, the one-tap sleep rating (gone once
 *      answered, or by noon).
 *   3. Cut the lines, in the first two weeks of a run - stimulus control does
 *      the most good early, while motivation is highest.
 *   4. Today's read (Premium) or Today's move (free).
 *   5. A big-game plan, when one is near. On its prep days it moves up to
 *      just under comeback week: the morning push that day names the prep,
 *      and a push must land on the screen it talks about.
 *   6. The daily rep - practice while calm, useful but never urgent.
 *   7. Cut the lines after the first two weeks, while tasks remain.
 * The urge button is not a card: it sits in a fixed place above them, so how
 * many cards are showing never pushes help further down the screen.
 */
export default function Home() {
  const router = useRouter();
  const {
    ready,
    quitDate,
    remindersPrimed,
    dailyRate,
    moneyKeptBefore,
    plan,
    trial,
    trialExpired,
    trialPromptShown,
    markTrialPromptShown,
    refreshPremium,
    subscribed,
    storeChecked,
    hardship,
    hardshipNote,
    dismissHardshipNote,
    lastMilestoneSeen,
    markMilestoneSeen,
    isPremium,
    closeDay,
    todayKey,
    todayMark,
    lifetime,
    week,
    todaysMove,
    todaysPlays,
    todayPlanItem,
    planOutcomes,
    comebackDay,
    comebackStartedDay,
    comebackDone,
    goalProgress,
    markGoalCheckpointSeen,
    nextCutLine,
    cutLineMarkedToday,
    bigEvent,
    logUrgeWin,
    todaysRep,
    repDoneToday,
    nightsClosed,
    sleep,
    scheduleInput,
  } = useAppState();
  const now = useNow();
  const [urgeSheet, setUrgeSheet] = useState(false);
  const { height: windowHeight } = useWindowDimensions();
  const compact = windowHeight < COMPACT_HEIGHT;
  const gap = compact ? GAP_COMPACT : GAP;

  // --- Urge button placement (see URGE_SPOTS) ---
  // Heights are measured, not assumed, and none of them depends on the order
  // the blocks are in, so moving the button never changes the answer.
  const layout = useRef({ viewport: 0, ringBottom: 0, money: 0, checkIn: 0, urge: 0 });
  // The viewport height the current spot was chosen for.
  const placedFor = useRef(0);
  const [spotIndex, setSpotIndex] = useState<number | null>(null);
  const placeUrge = () => {
    const m = layout.current;
    if (!m.viewport || !m.ringBottom || !m.money || !m.checkIn || !m.urge) return;
    const limit = m.viewport - FOLD_MARGIN;
    const afterMoney = m.ringBottom + gap.money + m.money;
    const fits = [
      afterMoney + gap.checkIn + m.checkIn + CHECK_IN_GROWTH + gap.urgeAfterCheckIn + m.urge,
      afterMoney + gap.urge + m.urge,
    ].findIndex((bottom) => bottom <= limit);
    const needed = fits < 0 ? URGE_SPOTS.indexOf('underRing') : fits;
    // Once chosen, the button only ever moves up, toward the ring, for as
    // long as Home is mounted: a checkpoint note being dismissed must not send
    // it back down, and a button that keeps swapping places is harder to find
    // in a hurry. A new window height (rotation, split screen) starts over.
    const fresh = placedFor.current !== m.viewport;
    placedFor.current = m.viewport;
    setSpotIndex((cur) => (cur == null || fresh ? needed : Math.max(cur, needed)));
  };
  const onViewport = (e: LayoutChangeEvent) => {
    layout.current.viewport = e.nativeEvent.layout.height;
    placeUrge();
  };
  const onRingLayout = (e: LayoutChangeEvent) => {
    // Everything above the ring (header, free-week banner) counts too.
    layout.current.ringBottom = e.nativeEvent.layout.y + e.nativeEvent.layout.height;
    placeUrge();
  };
  const onMoneyLayout = (e: LayoutChangeEvent) => {
    layout.current.money = e.nativeEvent.layout.height;
    placeUrge();
  };
  const onCheckInLayout = (e: LayoutChangeEvent) => {
    layout.current.checkIn = e.nativeEvent.layout.height;
    placeUrge();
  };
  const onUrgeLayout = (e: LayoutChangeEvent) => {
    layout.current.urge = e.nativeEvent.layout.height;
    placeUrge();
  };
  // Until Home has measured itself (its first frame), a guess by window size.
  const spot: UrgeSpot = URGE_SPOTS[spotIndex ?? (compact ? 1 : 0)];

  // Highest milestone reached but not yet celebrated. Reached-but-unseen rather
  // than exactly-today, so a milestone crossed while the app was closed still
  // gets its moment when they next open it. milestonesThrough continues
  // yearly, so this never runs out after the first year.
  const daysNow = quitDate
    ? Math.floor(Math.max(0, now - new Date(quitDate).getTime()) / DAY_MS)
    : 0;
  const pendingMilestone = quitDate
    ? [...milestonesThrough(daysNow)]
        .reverse()
        .find((m) => daysNow >= m.days && m.days > lastMilestoneSeen)
    : undefined;

  // TRIAL_DAYS is 7 and there is a 7-day milestone, so the free week ends on
  // precisely the day someone is congratulated for their first week clean.
  // If a celebration was waiting when this session started, the free-week
  // paywall sits out the WHOLE session - not just until the modal closes.
  // Checking `pendingMilestone` alone was not enough: dismissing the
  // celebration clears it, the effect re-runs immediately, and the paywall
  // lands on top of the congratulation anyway, one beat later.
  const sessionOpenedOnMilestone = useRef(false);
  const capturedLaunchState = useRef(false);
  useEffect(() => {
    // Wait for hydration: before it, quitDate is null and nothing is pending.
    if (capturedLaunchState.current || !quitDate) return;
    capturedLaunchState.current = true;
    sessionOpenedOnMilestone.current = !!pendingMilestone;
  }, [quitDate, pendingMilestone]);

  // The free week has ended: show the plans once, then never interrupt again -
  // the Home banner carries it from there. Free features stay free regardless.
  // Monetising the exact moment of maximum emotional investment is the move a
  // betting company would make, so it waits for the next launch instead. The Home
  // banner still says the week has ended, so nothing is concealed.
  //
  // Home stays mounted under the panic and slip screens (root full-screen
  // modals), so this used to be able to push the paywall on top of someone
  // mid-urge. It now fires only while Home itself is the focused screen, with
  // the app in the foreground (not behind a Face ID sheet), never within ten
  // minutes of a panic session, and only after the store has confirmed there
  // is no subscription - at cold start `subscribed` is still false for a
  // paying user until RevenueCat answers. The minute tick re-checks, so a
  // prompt held back by the panic cooldown still arrives later.
  const isFocused = useIsFocused();
  // Never behind the app lock either: a paywall waiting under the cover would
  // be the first thing seen on unlocking.
  const { covered: lockCovered } = useLockCover();
  const minute = Math.floor(now / 60_000);
  useEffect(() => {
    // Nor over the "I just beat one" sheet: someone logging an urge is the
    // last person to show a price list.
    if (!trialExpired || trialPromptShown || !isFocused || lockCovered || urgeSheet) return;
    if (pendingMilestone || sessionOpenedOnMilestone.current) return;
    // Never during a month on us, and never after one: someone who said
    // Premium is too much right now has seen the plans and answered. When
    // the month ends, Home's one quiet note is all there is.
    if (hardship.active || hardship.taken) return;
    // The reminders question goes first (below); the plans can wait a screen.
    if (!remindersPrimed) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (cancelled || RNAppState.currentState !== 'active') return;
      if ((await msSincePanic()) < PANIC_QUIET_MS) return;
      const paying = await checkPremium();
      if (cancelled || RNAppState.currentState !== 'active') return;
      if (paying !== false) {
        // Paying (state was just stale) or unknown (store unreachable): no
        // prompt now. Refreshing lets a real subscription clear the banner.
        if (paying) refreshPremium();
        return;
      }
      markTrialPromptShown();
      track('trial_ended');
      router.push('/onboarding/paywall');
    }, PROMPT_SETTLE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    trialExpired,
    trialPromptShown,
    isFocused,
    lockCovered,
    urgeSheet,
    minute,
    pendingMilestone,
    remindersPrimed,
    hardship.active,
    hardship.taken,
    markTrialPromptShown,
    refreshPremium,
    router,
  ]);

  // Commit shows the reminders priming screen itself. This catches everyone
  // who reached Home another way: past the safety screen (commit sends
  // hideFlag users there instead, so the two never stack), or signed in on a
  // new phone, where the OS permission - and so the flag - is per device.
  // Without it, those people would never be asked at all.
  useEffect(() => {
    if (!ready || !quitDate || remindersPrimed || remindersIntroOffered) return;
    if (!isFocused || lockCovered || urgeSheet || pendingMilestone) return;
    const timer = setTimeout(() => {
      if (remindersIntroOffered || RNAppState.currentState !== 'active') return;
      remindersIntroOffered = true;
      router.push('/reminders-intro');
    }, PROMPT_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [ready, quitDate, remindersPrimed, isFocused, lockCovered, urgeSheet, pendingMilestone, router]);

  const quitMs = quitDate ? new Date(quitDate).getTime() : now;
  const elapsed = Math.max(0, now - quitMs);
  const days = Math.floor(elapsed / DAY_MS);
  // Lifetime: what is kept during this streak, plus every streak before it.
  const money = moneyKeptBefore + (elapsed / DAY_MS) * dailyRate;
  const [intPart, decPart] = splitMoney(money);
  // Progress toward the next milestone, measured from the last one passed,
  // so the ring always has somewhere to go - including after the first year.
  const passedDays =
    [...milestonesThrough(days)].reverse().find((m) => m.days <= days)?.days ?? 0;
  const upcoming = nextMilestoneAfter(days);
  const ringProgress = Math.min(
    1,
    Math.max(0, (elapsed / DAY_MS - passedDays) / (upcoming.days - passedDays)),
  );
  const countdown = countdownText({
    days: upcoming.days,
    title: upcoming.title,
    inDays: upcoming.days - days,
  });

  useEffect(() => {
    if (homeViewTracked) return;
    homeViewTracked = true;
    track('home_viewed');
  }, []);

  // Nothing identifying and no amount leaves the app: the day count, and how
  // far along the goal is as a percentage when there is one.
  const goalItem = currentGoal(goalProgress);
  const goalPct = goalItem?.fraction != null ? Math.floor(goalItem.fraction * 100) : null;
  const onShare = () => {
    track('share_progress', { from: 'home' });
    const lead = `${plural(days, 'day')} clean of sports betting`;
    const body = goalPct != null ? `${lead}, and ${goalPct}% of the way to my goal.` : `${lead}.`;
    Share.share({ message: shareMessage(body) }).catch(() => {});
  };

  const closed = todayMark != null;
  const onCheckIn = () => {
    if (closed) return;
    // A physical buzz makes the daily ritual land - the greyed button alone
    // read as "nothing happened".
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    closeDay('clean');
  };
  const checkInLabel =
    todayMark === 1
      ? 'Close call beaten - locked in'
      : todayMark === 0
        ? 'Clean today - locked in'
        : 'I stayed clean today';
  const playUnanswered = !!todayPlanItem && planOutcomes[todayKey] == null;
  // Lights out, for people who named late nights as a trigger: offered from
  // 8pm until 4am (after midnight it is still last night), once per night.
  const hour = new Date(now).getHours();
  const nightOf = hour < 4 ? addDays(todayKey, -1) : todayKey;
  const lightsOut =
    scheduleInput.lateNightUser && (hour >= 20 || hour < 4) && !nightsClosed.includes(nightOf);

  // Slow ember pulse on the urge button (calm, no bouncy motion).
  // Held still under Reduce Motion; the button reads the same without it.
  const pulse = useAnimatedValue(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    if (reducedMotion) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);

  // --- Contextual cards, in priority order (see the component comment) ---
  const cards: { key: string; done: boolean; node: React.ReactNode }[] = [];
  if (quitDate) {
    const comebackTomorrow = comebackDay == null && comebackStartedDay === todayKey;
    if (comebackDay != null || comebackTomorrow) {
      const doneToday = comebackDay != null && comebackDone.includes(todayKey);
      cards.push({
        key: 'comeback',
        done: doneToday,
        node: (
          <HomeCard
            eyebrow={comebackDay != null ? `Comeback week · Day ${comebackDay} of 7` : 'Comeback week'}
            title={
              comebackTomorrow
                ? 'Starts tomorrow. One short step each morning.'
                : doneToday
                  ? 'Today’s step is done.'
                  : 'Today’s step is ready.'
            }
            sub={comebackTomorrow ? 'You know the way back.' : undefined}
            done={doneToday}
            onPress={() => router.push('/comeback')}
            hint="Opens comeback week"
          />
        ),
      });
    }

    let eventCard: (typeof cards)[number] | null = null;
    if (bigEvent) {
      // Names are phrases like "the NFL playoffs", so the copy is built to
      // need no verb agreement.
      const name = bigEvent.event.name;
      const title =
        bigEvent.phase === 'prep'
          ? bigEvent.daysToGo <= 1
            ? `Tomorrow: ${name}.`
            : `${bigEvent.daysToGo} days to ${name}.`
          : bigEvent.phase === 'live'
            ? `Now on: ${name}.`
            : `That was ${name}. You had a plan for it.`;
      eventCard = {
        key: 'event',
        done: bigEvent.phase === 'after',
        node: (
          <HomeCard
            eyebrow="Big game plan"
            title={title}
            sub={bigEvent.phase === 'after' ? undefined : bigEvent.prep.text}
            done={bigEvent.phase === 'after'}
            onPress={() =>
              router.push({ pathname: '/(tabs)/insights', params: { play: bigEvent.prep.playId } })
            }
            hint="Opens the play that goes with it"
          />
        ),
      };
    }
    const eventFirst = bigEvent?.phase === 'prep';
    if (eventCard && eventFirst) cards.push(eventCard);

    cards.push({
      key: 'play',
      done: false,
      node: <PlanCard plays={todaysPlays} pinned={todayPlanItem} onPress={() => router.push('/plan')} />,
    });

    // The morning after lights out: one optional tap, answered on that screen.
    const lastNight = addDays(todayKey, -1);
    if (hour >= 4 && hour < 12 && nightsClosed.includes(lastNight) && sleep[lastNight] == null) {
      cards.push({
        key: 'sleep',
        done: false,
        node: (
          <HomeCard
            eyebrow="Good morning"
            title="How did you sleep?"
            sub="One tap, or skip it. It stays on this phone."
            onPress={() => router.push('/lights-out')}
            hint="Opens the one-tap sleep rating"
          />
        ),
      });
    }

    const cutCard = nextCutLine
      ? {
          key: 'cut',
          done: cutLineMarkedToday,
          node: (
            <CutLinesCard
              next={nextCutLine}
              linesCut={lifetime.linesCut}
              markedToday={cutLineMarkedToday}
              onPress={() => router.push('/cut-lines')}
            />
          ),
        }
      : null;
    if (cutCard && days < CUT_LINES_EARLY_DAYS) cards.push(cutCard);

    if (todaysMove) {
      cards.push({
        key: 'daily',
        done: todaysMove.readToday,
        node: <TodayMoveCard move={todaysMove} isPremium={isPremium} onPress={() => router.push('/daily')} />,
      });
    }

    if (eventCard && !eventFirst) cards.push(eventCard);

    cards.push({
      key: 'rep',
      done: repDoneToday,
      node: (
        <HomeCard
          eyebrow={`Daily rep · ${Math.max(1, Math.round(todaysRep.seconds / 60))} min`}
          title={todaysRep.title}
          sub={repDoneToday ? `Done. ${plural(lifetime.repsDone, 'rep')} in the bank.` : todaysRep.skill}
          done={repDoneToday}
          onPress={() => router.push('/rep')}
          hint="Opens today's practice"
        />
      ),
    });

    if (cutCard && days >= CUT_LINES_EARLY_DAYS) cards.push(cutCard);
  }
  // Stable: open cards keep their priority order, finished ones follow.
  const shownCards = [...cards.filter((c) => !c.done), ...cards.filter((c) => c.done)].slice(
    0,
    MAX_CARDS,
  );

  // A lapsed subscriber's plan ended; telling them their "free week" ended
  // would be wrong twice over.
  const lapsed = trialExpired && plan != null && plan !== 'free';
  // A month on us running: a calm line in the free-week banner's place, with
  // no button - there is nothing to do about it.
  const onUsUntil =
    hardship.active && hardship.endsAt && !subscribed ? onUsDate(hardship.endsAt) : null;
  const checkpoint = goalProgress.pendingCheckpoint;
  const checkpointItem = checkpoint
    ? goalProgress.goals.find((g) => g.goal.id === checkpoint.goalId)
    : undefined;

  // The urge button and its quiet log. Where it goes is `spot`, above.
  const urgeBlock = (
    <>
      <Animated.View
        onLayout={onUrgeLayout}
        style={[
          styles.urgePulse,
          { marginTop: spot === 'design' ? gap.urgeAfterCheckIn : gap.urge },
          {
            shadowColor: colors.accent,
            shadowOpacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0] }),
            shadowRadius: pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }),
            shadowOffset: { width: 0, height: 0 },
          },
        ]}
      >
        <Pressable
          style={styles.urgeButton}
          onPress={() => router.push('/panic')}
          accessibilityRole="button"
          accessibilityLabel="Feel an urge? Get through it"
          accessibilityHint="Opens breathing and grounding exercises and your helplines"
        >
          <View style={styles.urgeDot} />
          <Text style={styles.urgeLabel}>Feel an urge? Get through it</Text>
        </Pressable>
      </Animated.View>
      <View style={styles.winsRow}>
        {/* Shown once there is one: a zero on day one would read as a score. */}
        {lifetime.urgesRiddenOut > 0 ? (
          <Text style={styles.winsText}>Urges ridden out: {lifetime.urgesRiddenOut}</Text>
        ) : (
          <View style={styles.winsSpacer} />
        )}
        <Pressable
          onPress={() => setUrgeSheet(true)}
          hitSlop={8}
          style={styles.linkHit}
          accessibilityRole="button"
          accessibilityLabel="I just beat one. Log an urge ridden out"
        >
          <Text style={styles.link}>I just beat one</Text>
        </Pressable>
      </View>
    </>
  );

  return (
    <Screen edges={['top']}>
      {pendingMilestone && (
        <MilestoneCelebration
          milestone={pendingMilestone}
          moneyWonBack={`$${intPart}`}
          onDismiss={() => {
            track('milestone_celebrated', { days: pendingMilestone.days });
            markMilestoneSeen(pendingMilestone.days);
            // The one moment in this app we know someone feels good about it.
            // Fire and forget - a rating sheet must never delay or block the
            // celebration closing.
            void maybeAskForReview(pendingMilestone.days);
          }}
        />
      )}
      <QuickUrgeSheet
        visible={urgeSheet}
        total={lifetime.urgesRiddenOut}
        onLog={() => logUrgeWin('quick')}
        onClose={() => setUrgeSheet(false)}
      />
      <ScrollView contentContainerStyle={styles.content} onLayout={onViewport}>
        <View style={styles.header}>
          <View>
            <Text style={styles.wordmark} accessibilityRole="header">
              Winback
            </Text>
            <Text style={styles.tagline}>Keep the game. Lose the bets.</Text>
          </View>
          <Pressable
            style={styles.gear}
            onPress={() => router.push('/(tabs)/you')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <GearIcon color={colors.textMuted} />
          </Pressable>
        </View>

        {/* The free week is stated plainly from day one. A countdown the user
            has watched all week cannot feel like a trap when it ends. */}
        {/* Never shown to a paying subscriber - a countdown of a free week
            they already replaced with a subscription reads as a bug. */}
        {onUsUntil ? (
          <View style={styles.trialBar} accessible accessibilityRole="text">
            <Text style={styles.trialText}>Premium is on us until {onUsUntil}.</Text>
          </View>
        ) : hardship.paused && !subscribed ? (
          // The phone's date is set back, so the month is paused (lib/hardship).
          <Pressable
            style={styles.trialBar}
            onPress={() => router.push('/on-us')}
            accessibilityRole="button"
            accessibilityHint="Explains why Premium on us is paused"
          >
            <Text style={styles.trialText}>Premium on us is paused. Check the date on your phone.</Text>
          </Pressable>
        ) : hardshipNote ? (
          // The month on us has ended. One quiet note, never a paywall, and
          // gone for good once dismissed.
          <View style={styles.onUsNote}>
            <Text style={styles.onUsNoteText}>
              {hardship.remaining > 0
                ? 'Your 30 days on us ended. Take another month, subscribe, or keep the free version.'
                : 'Your 30 days on us ended. Subscribe, or keep the free version.'}
            </Text>
            <View style={styles.onUsNoteLinks}>
              {hardship.remaining > 0 && (
                <Pressable
                  onPress={() => router.push('/on-us')}
                  hitSlop={8}
                  style={styles.linkHit}
                  accessibilityRole="button"
                  accessibilityLabel="Take another month of Premium on us"
                >
                  <Text style={styles.onUsNoteLink}>Another month</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => router.push('/onboarding/paywall')}
                hitSlop={8}
                style={styles.linkHit}
                accessibilityRole="button"
                accessibilityHint="Opens the Premium plans"
              >
                <Text style={styles.onUsNoteLink}>See plans</Text>
              </Pressable>
              <Pressable
                onPress={dismissHardshipNote}
                hitSlop={8}
                style={styles.linkHit}
                accessibilityRole="button"
                accessibilityHint="Dismisses this note. The free version stays yours."
              >
                <Text style={styles.onUsNoteLink}>Keep free</Text>
              </Pressable>
            </View>
          </View>
        ) : // After a month on us, Home's one note (above) is all there is:
        // the free week ended long before, and a banner about it would be
        // a paywall nudge by another name.
        !subscribed && storeChecked && trial.known && !hardship.taken && (
          <Pressable
            style={[styles.trialBar, trialExpired && styles.trialBarEnded]}
            onPress={() => router.push('/onboarding/paywall')}
            accessibilityRole="button"
            accessibilityHint="Opens the Premium plans"
          >
            <Text style={[styles.trialText, trialExpired && styles.trialTextEnded]}>
              {lapsed ? 'Your Premium plan has ended' : trialLabel(trial)}
            </Text>
            <Text style={styles.trialCta}>{trialExpired ? 'See plans' : 'View plans'}</Text>
          </Pressable>
        )}

        <View
          style={[styles.ringWrap, compact && styles.ringWrapCompact]}
          onLayout={onRingLayout}
        >
          <StreakRing
            progress={ringProgress}
            days={days}
            hms={hmsWithinDay(elapsed)}
            size={compact ? COMPACT_RING : RING_SIZE}
          />
          {!!countdown && <Text style={styles.milestone}>{countdown}</Text>}
        </View>

        {spot === 'underRing' && urgeBlock}
        <View
          style={[styles.moneyCard, { marginTop: gap.money }, compact && styles.moneyCardCompact]}
          onLayout={onMoneyLayout}
        >
          <View style={styles.moneyHeader}>
            <Eyebrow>Kept from betting (estimated)</Eyebrow>
            <Pressable
              onPress={onShare}
              style={styles.shareHit}
              accessibilityRole="button"
              accessibilityLabel="Share your progress"
            >
              <ShareIcon color={colors.textMuted} />
            </Pressable>
          </View>
          <View
            style={styles.moneyRow}
            accessible
            accessibilityRole="text"
            accessibilityLabel={`About $${intPart} kept from betting, estimated`}
          >
            <Text style={styles.moneyInt} maxFontSizeMultiplier={1.25} numberOfLines={1} adjustsFontSizeToFit>
              ${intPart}
            </Text>
            <Text style={styles.moneyDec} maxFontSizeMultiplier={1.25}>
              .{decPart}
            </Text>
          </View>
          <GoalBar progress={goalProgress} dailyRate={dailyRate} onPress={() => router.push('/goal')} />
          {checkpoint && checkpointItem && (
            <View style={styles.checkpoint}>
              <Text style={styles.checkpointText} accessibilityLiveRegion="polite">
                {checkpointLine(
                  checkpoint.checkpoint,
                  checkpointItem.fraction,
                  checkpointItem.goal.name,
                )}
              </Text>
              <Pressable
                onPress={() => markGoalCheckpointSeen(checkpoint.goalId, checkpoint.checkpoint)}
                hitSlop={10}
                style={styles.checkpointOk}
                accessibilityRole="button"
                accessibilityLabel="Nice. Dismiss"
              >
                <Text style={styles.checkpointOkLabel}>Nice</Text>
              </Pressable>
            </View>
          )}
        </View>

        {spot === 'afterMoney' && urgeBlock}
        <View style={[styles.checkIn, { marginTop: gap.checkIn }]} onLayout={onCheckInLayout}>
          {todayMark === 2 ? (
            // A slip day is closed too. No clean button to stare at, no "you
            // missed it" - just the truth and the way forward.
            <Text style={styles.slipDay}>Today is logged. Tomorrow is a fresh close-out.</Text>
          ) : (
            <EmberButton label={checkInLabel} disabled={closed} onPress={onCheckIn} />
          )}
          {closed && todayMark !== 2 && (
            <Text style={styles.checkInConfirm} accessibilityLiveRegion="polite">
              Locked in. {plural(lifetime.cleanDaysLogged, 'clean day')} logged.
            </Text>
          )}
          <View style={styles.links}>
            {!closed && (
              <Pressable
                onPress={() => router.push('/closeout')}
                hitSlop={8}
                style={styles.linkHit}
                accessibilityRole="button"
                accessibilityLabel="Was it close? Close out today with more options"
              >
                <Text style={styles.link}>Was it close? More options</Text>
              </Pressable>
            )}
            {closed && playUnanswered && (
              <Pressable
                onPress={() => router.push('/closeout')}
                hitSlop={8}
                style={styles.linkHit}
                accessibilityRole="button"
              >
                <Text style={styles.link}>Did today&apos;s play hold?</Text>
              </Pressable>
            )}
            {/* After the one-tap close-out, the rest of it (a close call, a
                game watched clean) is still one tap away. */}
            {closed && todayMark !== 2 && !playUnanswered && (
              <Pressable
                onPress={() => router.push('/closeout')}
                hitSlop={8}
                style={styles.linkHit}
                accessibilityRole="button"
                accessibilityLabel="Add to today: a close call or a game watched clean"
              >
                <Text style={styles.link}>Add to today</Text>
              </Pressable>
            )}
            {lightsOut && (
              <Pressable
                onPress={() => router.push('/lights-out')}
                hitSlop={8}
                style={styles.linkHit}
                accessibilityRole="button"
                accessibilityHint="A one-minute wind-down that also closes out today"
              >
                <Text style={styles.link}>Lights out</Text>
              </Pressable>
            )}
            {closed && week.isRecapDay && (
              <Pressable
                onPress={() => router.push('/recap')}
                hitSlop={8}
                style={styles.linkHit}
                accessibilityRole="button"
              >
                <Text style={styles.link}>See your week</Text>
              </Pressable>
            )}
          </View>
        </View>

        {spot === 'design' && urgeBlock}
        {shownCards.map((c) => (
          <React.Fragment key={c.key}>{c.node}</React.Fragment>
        ))}
      </ScrollView>
    </Screen>
  );
}

const CHECKPOINT_MARK: Record<25 | 50 | 75, { at: string; past: string }> = {
  25: { at: 'A quarter of the way', past: 'Past the quarter mark' },
  50: { at: 'Halfway', past: 'Past halfway' },
  75: { at: 'Three quarters of the way', past: 'Past three quarters' },
};

/**
 * Calm, one line: where the goal stands. Never an amount, never a nudge.
 *
 * It names the highest mark crossed, and it must agree with the bar right
 * above it. After a jump (a restore, a goal that starts part full) the bar can
 * already read 45% when the mark is the quarter, so once past the mark the
 * note says so and gives the bar's own percentage.
 */
function checkpointLine(checkpoint: number, fraction: number | null, name: string): string {
  if (checkpoint >= 100) return `${name}: filled. That money has a job.`;
  const mark = CHECKPOINT_MARK[checkpoint >= 75 ? 75 : checkpoint >= 50 ? 50 : 25];
  // The same floor GoalBar uses for its label, so the two never disagree.
  const pct = fraction == null ? null : Math.floor(fraction * 100);
  if (pct == null || pct <= checkpoint) return `${mark.at} to ${name}.`;
  return `${mark.past}: ${pct}% of the way to ${name}.`;
}

const styles = StyleSheet.create({
  content: { paddingBottom: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 22,
    paddingHorizontal: spacing.screenX,
  },
  wordmark: {
    fontFamily: fonts.display.extrabold,
    fontSize: 19,
    letterSpacing: tracking(19, -0.01),
    color: colors.text,
  },
  tagline: { fontFamily: fonts.body.regular, fontSize: 11.5, color: colors.textDim, marginTop: 2 },
  gear: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trialBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 14,
    marginHorizontal: 22,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.surfaceWarmBorder,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  trialBarEnded: { borderColor: colors.accent },
  trialText: { flex: 1, fontFamily: fonts.body.medium, fontSize: 12.5, color: colors.notice },
  trialTextEnded: { color: colors.text },
  trialCta: { fontFamily: fonts.display.bold, fontSize: 12.5, color: colors.accent },
  onUsNote: {
    marginTop: 14,
    marginHorizontal: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingTop: 10,
    paddingHorizontal: 14,
  },
  onUsNoteText: {
    fontFamily: fonts.body.medium,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.5,
    color: colors.textMuted,
  },
  onUsNoteLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 },
  onUsNoteLink: {
    fontFamily: fonts.body.medium,
    fontSize: 12.5,
    color: colors.text,
    textDecorationLine: 'underline',
  },
  ringWrap: { alignItems: 'center', marginTop: 14 },
  ringWrapCompact: { marginTop: 4 },
  milestone: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textDim, marginTop: 12 },
  // The money card's, the check-in's and the urge button's marginTop come
  // from GAP, which the urge placement measures with.
  moneyCard: {
    marginHorizontal: 22,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: spacing.radiusHero,
    paddingVertical: 20,
    paddingHorizontal: 22,
  },
  moneyCardCompact: { paddingVertical: 14 },
  moneyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  // The icon is 18pt; the target around it is the full 44.
  shareHit: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginVertical: -12,
  },
  moneyRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 8 },
  moneyInt: {
    flexShrink: 1,
    fontFamily: fonts.display.extrabold,
    fontSize: 44,
    letterSpacing: tracking(44),
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  moneyDec: {
    fontFamily: fonts.display.bold,
    fontSize: 22,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  checkpoint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  checkpointText: { flex: 1, fontFamily: fonts.body.medium, fontSize: 13, color: colors.accent },
  checkpointOk: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  checkpointOkLabel: { fontFamily: fonts.display.bold, fontSize: 13, color: colors.text },
  checkIn: { marginHorizontal: 22 },
  checkInConfirm: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    color: colors.accentDim,
    textAlign: 'center',
    marginTop: 8,
  },
  slipDay: {
    fontFamily: fonts.body.medium,
    fontSize: 14,
    lineHeight: 14 * 1.5,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: 8,
  },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 18 },
  linkHit: { minHeight: 44, justifyContent: 'center' },
  link: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  urgePulse: { marginHorizontal: 22, borderRadius: spacing.radius },
  urgeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderWidth: 1.5,
    borderColor: colors.surfaceWarmBorder,
    backgroundColor: colors.surface,
    paddingVertical: 15,
    paddingHorizontal: 12,
    borderRadius: spacing.radius,
  },
  urgeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  urgeLabel: { flexShrink: 1, fontFamily: fonts.display.bold, fontSize: 15, color: colors.text },
  winsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginHorizontal: 24,
  },
  winsText: { flex: 1, fontFamily: fonts.body.medium, fontSize: 12.5, color: colors.textDim },
  winsSpacer: { flex: 1 },
});
