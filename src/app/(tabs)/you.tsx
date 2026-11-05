import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as StoreReview from 'expo-store-review';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  AppState as RNAppState,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { Eyebrow } from '@/components/Eyebrow';
import { HelplineRow } from '@/components/HelplineRow';
import { PeerSupportGuide } from '@/components/RegionGuide';
import { XIcon } from '@/components/icons';
import { Screen } from '@/components/Screen';
import { getAnalyticsEnabled, setAnalyticsEnabled, track } from '@/lib/analytics';
import { onUsDate } from '@/lib/hardship';
import { isLockEnabled, isLockSupported, requestUnlock, setLockEnabled } from '@/lib/applock';
import {
  deviceDirectoryLine,
  deviceHelplines,
  HELPLINE_DIRECTORY,
  isLongList,
  otherHelplines,
} from '@/lib/helplines';
import {
  getReminderPermission,
  openNotificationSettings,
  type ReminderPermission,
  requestReminderPermission,
} from '@/lib/notifications';
import {
  getRenewalInfo,
  openManageSubscription,
  restorePurchases,
  type RenewalInfo,
} from '@/lib/purchases';
import {
  cleanReasons,
  MAX_REASON_LENGTH,
  MAX_REASONS,
  saveReasons,
  useMyReasons,
} from '@/lib/reasons';
import { getScheduleProvider } from '@/lib/schedule/ScheduleProvider';
import type { League, Team } from '@/lib/schedule/ScheduleProvider';
import type { ReminderType, TimeOfDay } from '@/lib/scheduleInput';
import {
  deleteAccount,
  lastKnownAccountId,
  supabase,
  upgradeToEmail,
  withTimeout,
} from '@/lib/supabase';
import { maskEmail, readSaveState, type SaveState } from '@/lib/saveState';
import { MAX_TEAMS, useAppState } from '@/state/AppState';
import { CONTACT_EMAIL } from '@/state/legal';
import { colors, fonts, spacing } from '@/theme/tokens';

const STORE_NAME = Platform.OS === 'ios' ? 'the App Store' : 'Google Play';

/** Hosted deletion page, when one is published. Email always works. */
const DELETE_URL = process.env.EXPO_PUBLIC_DELETE_URL;

/**
 * Quiz sport -> leagues the team search keeps. College teams are listed under
 * both their own leagues and the pro ones, because the schedule source files
 * college football under American football.
 */
const LEAGUES_FOR_SPORT: Record<string, League[]> = {
  NFL: ['nfl'],
  NBA: ['nba'],
  'NHL / MLB': ['nhl', 'mlb'],
  'College football / basketball': ['ncaaf', 'ncaab', 'nfl', 'nba'],
  Soccer: ['soccer'],
  'UFC / boxing': ['ufc', 'boxing'],
};

/**
 * One example per sport, each checked against the free schedule source: a
 * full name finds the right team where a nickname often does not ("Lakers"
 * returns a high-school football side).
 */
const EXAMPLE_FOR_SPORT: Record<string, string> = {
  NFL: 'Buffalo Bills',
  NBA: 'Boston Celtics',
  'NHL / MLB': 'New York Yankees',
  'College football / basketball': 'Alabama',
  Soccer: 'Arsenal',
};

const TEAM_SEARCH_TIMEOUT_MS = 8000;

/** One prompt per reason field, MAX_REASONS of them. */
const REASON_PLACEHOLDERS = [
  'Who you are doing this for',
  'What you want back',
  'One more, if you like',
] as const;

/** Reminder times move in quarter hours, within a sensible window for each. */
const TIME_STEP_MIN = 15;
const TIME_RANGES = {
  morning: { min: 5 * 60, max: 11 * 60 + 45 },
  evening: { min: 17 * 60, max: 23 * 60 + 30 },
  lateNight: { min: 21 * 60, max: 23 * 60 + 45 },
} as const;

/** "9:00 AM" or "21:00", in the phone's own style where it can tell. */
function formatTime(t: TimeOfDay): string {
  try {
    return new Date(2000, 0, 1, t.hour, t.minute).toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    const h = t.hour % 12 || 12;
    return `${h}:${String(t.minute).padStart(2, '0')} ${t.hour < 12 ? 'AM' : 'PM'}`;
  }
}

/**
 * A reminder time as an accessible stepper: earlier and later by a quarter
 * hour. One adjustable control for screen readers (swipe up or down), two
 * plain buttons for everyone else. Works the same on every platform, which a
 * native picker would not, and needs nothing typed.
 */
function TimeStepper({
  label,
  value,
  range,
  onChange,
}: {
  label: string;
  value: TimeOfDay;
  range: { min: number; max: number };
  onChange: (t: TimeOfDay) => void;
}) {
  const minutes = value.hour * 60 + value.minute;
  const step = (delta: number) => {
    const next = Math.min(range.max, Math.max(range.min, minutes + delta));
    if (next !== minutes) onChange({ hour: Math.floor(next / 60), minute: next % 60 });
  };
  const text = formatTime(value);
  // One adjustable control: a screen reader swipes it earlier or later, and
  // hears the time. The minus and plus are for touch only, hidden from
  // assistive tech so they are not buttons nested inside the control.
  const touchOnly = {
    focusable: false,
    importantForAccessibility: 'no-hide-descendants' as const,
    accessibilityElementsHidden: true,
  };
  return (
    <View
      style={styles.timeRow}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${label} reminder`}
      aria-valuemin={range.min}
      aria-valuemax={range.max}
      aria-valuenow={minutes}
      aria-valuetext={text}
      accessibilityActions={[
        { name: 'increment', label: 'Later' },
        { name: 'decrement', label: 'Earlier' },
      ]}
      onAccessibilityAction={(e) =>
        step(e.nativeEvent.actionName === 'increment' ? TIME_STEP_MIN : -TIME_STEP_MIN)
      }
    >
      <Text style={styles.timeLabel}>{label}</Text>
      <Pressable
        style={[styles.stepButton, minutes <= range.min && styles.stepButtonOff]}
        onPress={() => step(-TIME_STEP_MIN)}
        disabled={minutes <= range.min}
        hitSlop={6}
        {...touchOnly}
      >
        <Text style={styles.stepLabel}>−</Text>
      </Pressable>
      <Text style={styles.timeValue}>{text}</Text>
      <Pressable
        style={[styles.stepButton, minutes >= range.max && styles.stepButtonOff]}
        onPress={() => step(TIME_STEP_MIN)}
        disabled={minutes >= range.max}
        hitSlop={6}
        {...touchOnly}
      >
        <Text style={styles.stepLabel}>+</Text>
      </Pressable>
    </View>
  );
}

/** A reminder type the user can switch off on its own. */
function TypeRow({
  label,
  sub,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  sub: string;
  value: boolean;
  onChange: (on: boolean) => void;
  /** Shown off and not switchable (a Premium type for a free user). */
  disabled?: boolean;
}) {
  return (
    <View style={styles.typeRow}>
      <View style={styles.typeText}>
        <Text style={styles.typeLabel}>{label}</Text>
        <Text style={styles.typeSub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.hairline, true: colors.accent }}
        // Left to the platform, the thumb takes the theme accent on Android
        // and teal on web: a second brand colour on every row.
        thumbColor={colors.text}
        {...(Platform.OS === 'web' ? { activeThumbColor: colors.text } : null)}
        ios_backgroundColor={colors.hairline}
        accessibilityLabel={label}
        accessibilityHint={sub}
      />
    </View>
  );
}

/** The signed-in account's id from the stored session, or null. Never signs in. */
async function readAccountId(): Promise<string | null> {
  if (!supabase) return null;
  const client = supabase;
  const session = await withTimeout(
    client.auth.getSession().then(({ data }) => data.session),
    3000,
    null,
  );
  return session?.user.id ?? null;
}

/**
 * You / Settings. Two things live here permanently and outside the paywall:
 * the helplines (safety layer is non-negotiable) and the email upgrade that
 * turns the anonymous account into a permanent one.
 */
export default function You() {
  const router = useRouter();
  // Jumps rather than scrolls when Reduce Motion is on.
  const reduced = useReducedMotion();
  const {
    plan,
    partner,
    teams,
    sportsLabels,
    freezeAvailable,
    isPremium,
    subscribed,
    hideFlag,
    discreetNotifications,
    setDiscreetNotifications,
    trial,
    trialUnverified,
    hardship,
    hardshipOffered,
    refreshPremium,
    choosePlan,
    restartOnboarding,
    eraseAllLocalData,
    setPartner,
    setTeams,
    reminderPrefs,
    setReminderPrefs,
    remindersPrimed,
    markPrimed,
    refreshReminders,
    setUrgeFollowUp,
    scheduleInput,
  } = useAppState();
  // Somewhere we have no verified local line: the directory row goes first.
  const directoryLine = deviceDirectoryLine();
  const helplines = directoryLine ? [directoryLine, ...deviceHelplines()] : deviceHelplines();
  const otherLines = otherHelplines();
  const [showOtherLines, setShowOtherLines] = useState(false);
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [partnerName, setPartnerName] = useState(partner?.name ?? '');
  const [partnerPhone, setPartnerPhone] = useState(partner?.phone ?? '');
  // The fields show what is saved until the person types; null = untouched.
  const myReasons = useMyReasons();
  const [reasonEdits, setReasonEdits] = useState<string[] | null>(null);
  const reasonDrafts =
    reasonEdits ?? Array.from({ length: MAX_REASONS }, (_, i) => myReasons[i] ?? '');
  const [teamQuery, setTeamQuery] = useState('');
  const [teamResults, setTeamResults] = useState<Team[]>([]);
  const [teamSearchNote, setTeamSearchNote] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [lockOn, setLockOn] = useState(false);
  const [lockSupported, setLockSupported] = useState(false);
  const [usageData, setUsageData] = useState(() => getAnalyticsEnabled());
  // The random account id, shown so a deletion request by email can name the
  // account. Read from the stored session only - never creates an account.
  const [accountId, setAccountId] = useState<string | null>(null);
  // Whether this phone lets Winback notify at all. Read again on every return
  // to the app, since the answer usually changes in the phone's settings.
  const [permission, setPermission] = useState<ReminderPermission | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    void isLockSupported().then(setLockSupported);
    void isLockEnabled().then(setLockOn);
    void readAccountId().then(setAccountId);
  }, []);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      const p = await getReminderPermission();
      if (alive) setPermission(p);
    };
    void check();
    // The schedule itself is rebuilt on every foreground by AppState.
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') void check();
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  const askPermission = async () => {
    if (asking) return;
    setAsking(true);
    const granted = await requestReminderPermission();
    track('notification_permission', { granted });
    if (!remindersPrimed) markPrimed();
    else refreshReminders();
    setPermission(await getReminderPermission());
    setAsking(false);
  };

  const setTypeOn = (type: ReminderType, on: boolean) => {
    setReminderPrefs({ types: { [type]: on } });
    // Switching the check-in off also cancels one already asked for.
    if (type === 'followUp' && !on) setUrgeFollowUp(null);
  };

  const lateNightUser = scheduleInput.lateNightUser;
  const typeRows: { type: ReminderType; label: string; sub: string; locked?: boolean }[] = [
    { type: 'rhythm', label: 'Morning and evening', sub: 'A morning check-in and the evening close-out.' },
    { type: 'milestones', label: 'Milestones', sub: 'The evening before one, and the morning of.' },
    { type: 'payday', label: 'Payday', sub: 'The 1st and the 15th: a plan before the money lands.' },
    ...(lateNightUser
      ? [
          {
            type: 'lateNight' as const,
            label: 'Lights out',
            sub: 'A one-minute wind-down at night, in place of the evening close-out.',
          },
          ...(reminderPrefs.types.lateNight
            ? [
                {
                  type: 'lateNightWeekends' as const,
                  label: 'Lights out on weekends',
                  sub: 'Friday and Saturday nights too. Off: the usual close-out on those nights.',
                },
              ]
            : []),
        ]
      : []),
    {
      type: 'gameDay',
      label: 'Game days',
      sub: isPremium
        ? 'Before, during and after games for the teams you save.'
        : 'Part of Premium, for the teams you save.',
      // Game-day reminders are never sent without Premium, so the switch
      // does not claim they are on. The stored choice is kept for an upgrade.
      locked: !isPremium,
    },
    { type: 'comeback', label: 'Comeback week', sub: 'Seven mornings after a slip is logged.' },
    { type: 'weekly', label: 'Weekly', sub: 'The Sunday recap, and a heads-up on your big game day.' },
    {
      type: 'followUp',
      label: 'Check-in after a long urge',
      sub: 'Only when you ask for one on the panic screen.',
    },
  ];

  // A paid plan on record counts too: a subscriber whose store check has not
  // answered yet, or whose plan just lapsed, still needs the way to cancel.
  const hasPaidPlan = plan === 'yearly' || plan === 'monthly';
  const showManage = subscribed || hasPaidPlan;
  const rateUrl = StoreReview.storeUrl();

  // When the paid period ends and whether it renews, straight from the store,
  // so a renewal is never a surprise. Shown only while subscribed: a stale
  // value from an earlier subscription is ignored rather than reset here.
  // Whether the progress is saved to an email. Read again on every return to
  // the app: the confirmation link is tapped in the mail app or a browser.
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'unknown' });
  useEffect(() => {
    let live = true;
    const read = () =>
      void readSaveState().then((next) => {
        if (live) setSaveState(next);
      });
    read();
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') read();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, []);

  // Read again on every return to the app: "Manage subscription" leaves for
  // the store, and a renewal cancelled or restarted there must show here.
  const [renewal, setRenewal] = useState<RenewalInfo | null>(null);
  useEffect(() => {
    if (!subscribed) return;
    let live = true;
    const read = () =>
      void getRenewalInfo().then((r) => {
        if (live) setRenewal(r);
      });
    read();
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') read();
    });
    return () => {
      live = false;
      sub.remove();
    };
  }, [subscribed]);
  const renewalLine =
    subscribed && renewal
      ? `${renewal.willRenew ? 'Renews on' : 'Ends on'} ${new Date(renewal.periodEndsAt).toLocaleDateString(
          undefined,
          { year: 'numeric', month: 'long', day: 'numeric' },
        )}${renewal.willRenew ? '.' : '. It will not renew.'}`
      : null;

  // The sports they told us they bet on decide which leagues team search keeps.
  const leagues = [...new Set(sportsLabels.flatMap((s) => LEAGUES_FOR_SPORT[s] ?? []))];
  const filterLeagues = leagues.length > 0 && !sportsLabels.includes('Other');
  const examples = sportsLabels.map((s) => EXAMPLE_FOR_SPORT[s]).filter(Boolean);
  const exampleList = examples.length ? examples : ['Buffalo Bills', 'Arsenal'];

  // Require an unlock before turning the lock OFF, so someone who picks up an
  // already-open phone cannot quietly disable it.
  // The switch shows what the phone actually stored. For someone who hides
  // their betting from whoever picks the phone up, "App lock on" when nothing
  // is locked is the one thing this must never say.
  const toggleLock = async () => {
    if (!(await requestUnlock())) return;
    const want = !lockOn;
    const stored = await setLockEnabled(want);
    setLockOn(stored);
    if (stored !== want) {
      Alert.alert(
        want ? "Couldn't turn on app lock" : "Couldn't turn off app lock",
        "This phone's secure storage didn't accept the change. Please try again.",
      );
    } else if (want) {
      Alert.alert('App lock on', 'Winback will ask to unlock whenever you come back to it.');
    }
  };

  const savePartner = async () => {
    const name = partnerName.trim();
    const phone = partnerPhone.trim();
    if (!name || phone.replace(/\D/g, '').length < 7) {
      Alert.alert('Enter a name and a valid phone number');
      return;
    }
    // "One tap away" only when it is true after a restart, not only today.
    if (await setPartner({ name, phone })) {
      Alert.alert('Saved', `${name} is one tap away on the panic screen.`);
    } else {
      Alert.alert(
        "Couldn't save to this phone",
        `${name} is on the panic screen for now, but this phone's secure storage didn't keep them, so they may be gone after Winback closes. Please try saving again.`,
      );
    }
  };

  const editReason = (index: number, text: string) =>
    setReasonEdits(reasonDrafts.map((draft, i) => (i === index ? text : draft)));

  const saveMyReasons = async () => {
    const count = cleanReasons(reasonDrafts).length;
    const kept = await saveReasons(reasonDrafts);
    setReasonEdits(null);
    if (!kept) {
      Alert.alert(
        "Couldn't save to this phone",
        "They're on the panic screen for now, but this phone's secure storage didn't keep them, so they may be gone after Winback closes. Please try saving again.",
      );
    } else if (count) {
      Alert.alert('Saved', 'The panic screen shows them when an urge hits.');
    } else {
      Alert.alert('Cleared', 'The panic screen shows the reasons from your quiz again.');
    }
  };

  const searchTeams = async () => {
    const q = teamQuery.trim();
    if (!q || searching) return;
    setSearching(true);
    setTeamSearchNote(null);
    // Bounded: a slow or dead schedule source must never leave the button
    // stuck on "Searching…".
    const search = await withTimeout(
      getScheduleProvider().searchTeams(q, filterLeagues ? leagues : undefined),
      TEAM_SEARCH_TIMEOUT_MS,
      { teams: [], ok: false },
    );
    setSearching(false);
    const kept = search.teams
      .filter((r) => !filterLeagues || leagues.includes(r.league))
      .filter((r) => !teams.some((t) => t.id === r.id))
      .slice(0, 6);
    setTeamResults(kept);
    // "No team found" only when the search really ran: a refused key, a
    // timeout or no network is the source's problem, not the spelling's.
    if (!search.ok) {
      setTeamSearchNote(
        "Team search isn't available right now. If you're offline, try again once you're connected.",
      );
    } else if (!kept.length) {
      setTeamSearchNote(`No team found for "${q}". Try the full name, like ${exampleList[0]}.`);
    }
  };

  const addTeam = (team: Team) => {
    if (teams.length >= MAX_TEAMS) {
      Alert.alert(`Up to ${MAX_TEAMS} teams`, 'Remove one to add another.');
      return;
    }
    setTeams([...teams, team]);
    setTeamResults((r) => r.filter((t) => t.id !== team.id));
  };

  const removeTeam = (team: Team) => {
    setTeams(teams.filter((t) => t.id !== team.id));
  };

  // A slip opens a real screen rather than an Alert: an Alert cannot show a
  // helpline row, and this is the highest-risk moment the app can observe.
  const openSlip = () => router.push('/slip');

  // Opened with section=corner (comeback week's "Add your person"): bring the
  // partner fields into view, then drop the param so the next visit does not
  // jump there again.
  const { section } = useLocalSearchParams<{ section?: string }>();
  const scrollRef = useRef<ScrollView>(null);
  const cornerY = useRef<number | null>(null);
  useFocusEffect(
    useCallback(() => {
      if (section !== 'corner') return;
      const t = setTimeout(() => {
        if (cornerY.current != null) {
          scrollRef.current?.scrollTo({ y: Math.max(0, cornerY.current - 16), animated: !reduced });
        }
        router.setParams({ section: undefined });
      }, 300);
      return () => clearTimeout(t);
    }, [section, router, reduced]),
  );

  const confirmRedoQuiz = () =>
    Alert.alert(
      'Redo the quiz?',
      // Android shows no destructive style, so the words carry the warning.
      'It clears your answers and runs onboarding again, and your streak starts again from the day you commit. The days and money so far stay in your record.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Redo quiz',
          style: 'destructive',
          onPress: () => {
            restartOnboarding();
            router.replace('/onboarding/welcome');
          },
        },
      ],
    );

  const eraseAndRestart = () => {
    eraseAllLocalData();
    router.replace('/onboarding/welcome');
  };

  /** How to get the server copy removed without the app. */
  const deletionRoute = DELETE_URL
    ? `email ${CONTACT_EMAIL} or use ${DELETE_URL}`
    : `email ${CONTACT_EMAIL}`;

  const shareAccountId = async (id: string, thenAsk: () => void) => {
    try {
      await Share.share({
        message: `My Winback account ID: ${id}\nTo delete it, ${deletionRoute} with this ID.`,
      });
    } catch {
      // Dismissed or unavailable. Fall back to the alert, which shows the ID.
    }
    thenAsk();
  };

  /**
   * The server call failed. Tell the truth: erasing this phone does NOT
   * remove the server copy, and an anonymous account cannot be signed back
   * into once this phone forgets it. So the account ID is shown, and can be
   * shared, before anything is erased, along with how to have it deleted.
   */
  const offerLocalErase = (id: string | null) => {
    const message = id
      ? `Your data is still on our servers. You can erase this phone now, but that does not remove the server copy. To have it deleted, ${deletionRoute} with your account ID:\n\n${id}\n\nSave the ID first - once this phone is erased it can't be shown again.`
      : `We couldn't confirm deletion on our servers. You can erase this phone now, but any server copy stays until it is deleted. To have it deleted, ${deletionRoute}.`;
    const ask = () =>
      Alert.alert("Couldn't reach our servers", message, [
        { text: 'Cancel', style: 'cancel' },
        ...(id ? [{ text: 'Share account ID', onPress: () => void shareAccountId(id, ask) }] : []),
        { text: 'Erase on this device', style: 'destructive' as const, onPress: eraseAndRestart },
      ]);
    ask();
  };

  const runDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    // Read before the attempt: a failed deletion must still be able to name
    // the account.
    const id = accountId ?? (await readAccountId());
    const { error, thirdPartyIncomplete } = await deleteAccount();
    setDeleting(false);
    if (!error && thirdPartyIncomplete) {
      // The account is gone; a third party's copy may not be. Say so, with
      // the id needed to finish it by hand, before this phone is erased.
      Alert.alert(
        'Account deleted',
        `Your account and its data are deleted from our servers. One of the services we use (purchases or usage data) did not confirm its copy was removed. Email ${CONTACT_EMAIL} with this ID and we will finish it by hand: ${id ?? 'not available'}`,
        [{ text: 'OK', onPress: eraseAndRestart }],
        { cancelable: false },
      );
      return;
    }
    if (!error) {
      eraseAndRestart();
      return;
    }
    if (!supabase) {
      // This build has no backend. If this phone never had an account on our
      // servers, nothing ever left it and erasing is the whole deletion. But
      // a bundle can lose its backend configuration (an update published
      // without it) on a phone whose account does exist - then this is the
      // same situation as an unreachable server, and says so.
      const known = await lastKnownAccountId();
      if (known) offerLocalErase(known);
      else eraseAndRestart();
      return;
    }
    // Raw backend errors mean nothing to a user and can leak detail; log only.
    console.warn('[you] account deletion failed:', error);
    offerLocalErase(id);
  };

  const askDelete = () =>
    Alert.alert(
      'Delete account and data?',
      'This permanently deletes your account, quiz answers, check-ins, streak history and urge logs from our servers. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete everything', style: 'destructive', onPress: () => void runDelete() },
      ],
    );

  // Deleting the account does not stop the store billing. Say so first, and
  // offer the way to cancel before going any further.
  //
  // Firm only when the store has confirmed a live subscription. A paid plan on
  // record without one has probably lapsed or been cancelled, and telling
  // that person the store "keeps billing" would be untrue - so it is worded
  // as a condition.
  const confirmDeleteAccount = () => {
    if (!showManage) {
      askDelete();
      return;
    }
    Alert.alert(
      subscribed ? 'Cancel your subscription first' : 'Check your subscription first',
      subscribed
        ? `Deleting your account does not cancel your subscription. ${STORE_NAME} keeps billing until you cancel it there. Cancel it in Manage subscription, then come back to delete.`
        : `If your subscription is still active, deleting your account does not cancel it - ${STORE_NAME} keeps billing until you cancel it there. Check in Manage subscription, then come back to delete.`,
      [
        { text: 'Manage subscription', onPress: () => void openManageSubscription() },
        { text: 'Delete anyway', style: 'destructive', onPress: askDelete },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const restore = async () => {
    if (restoring) return;
    setRestoring(true);
    const { status, plan: restoredPlan } = await restorePurchases();
    setRestoring(false);
    if (status === 'restored') {
      if (restoredPlan) choosePlan(restoredPlan);
      refreshPremium();
      Alert.alert('Restored', 'Welcome back to Premium.');
    } else if (status === 'none') {
      Alert.alert('Nothing to restore', `${STORE_NAME} has no Winback purchase for this account.`);
    } else if (status === 'unavailable') {
      Alert.alert('Restore unavailable', "Purchases aren't available in this build.");
    } else {
      // A failed check is not "nothing found": a paying user offline must
      // not be told they never bought anything.
      Alert.alert(
        "Couldn't check",
        `We couldn't reach ${STORE_NAME}. Check your connection and try again.`,
      );
    }
  };

  const toggleUsageData = () => {
    const next = !usageData;
    setUsageData(next);
    void setAnalyticsEnabled(next).then((saved) => {
      // The choice holds in memory either way; the person should know it
      // may not survive closing the app.
      if (!saved) {
        Alert.alert(
          "Couldn't save this setting",
          `Usage data is ${next ? 'on' : 'off'} until you close Winback, but this phone did not store the change. Try again in a moment.`,
        );
      }
    });
  };

  // A month on us, running or paused while the phone's date is set back.
  const onUsLine =
    hardship.active && hardship.endsAt
      ? `Premium is on us until ${onUsDate(hardship.endsAt)}.`
      : hardship.paused
        ? 'Premium on us is paused. Check the date on your phone.'
        : null;
  const membershipLine = subscribed
    ? plan === 'yearly'
      ? 'Winback Premium - yearly.'
      : plan === 'monthly'
        ? 'Winback Premium - monthly.'
        : 'Winback Premium is active.'
    : onUsLine
      ? onUsLine
      : trial.active
        ? trial.daysLeft <= 1
          ? 'Last day of your free week of Premium. No card needed.'
          : `Your free week of Premium: ${trial.daysLeft} days left. No card needed.`
        : hasPaidPlan
          ? // A paid plan on record and no live subscription: it lapsed, or the
            // store has not answered yet. Not "your free week has ended".
            'Your Premium plan is not active right now. Streak counter, panic button, breathing exercises, and helplines stay free.'
          : trialUnverified
            ? // Offline on first run, so the free week could not be read. The app
              // grants full access on trust in that state, and saying "Free plan"
              // here told people they had less than they actually had.
              'We could not reach our servers to check your free week, so you have full access for now. It will sort itself out next time you are online.'
            : 'Free plan. Streak counter, panic button, breathing exercises, and helplines are free forever.';

  const saveEmail = async () => {
    // The keyboard's return key is not disabled while saving, and a second
    // call can trip the email rate limit and overwrite the first one's result.
    if (saving) return;
    // An empty field while a save waits on its link sends that link again.
    const trimmed = email.trim() || (saveState.kind === 'pending' ? saveState.email : '');
    if (!trimmed.includes('@')) {
      Alert.alert('Enter a valid email');
      return;
    }
    setSaving(true);
    const { error } = await upgradeToEmail(trimmed);
    setSaving(false);
    // An email already in use gets the same answer as success. "Already
    // attached to another Winback account" told anyone typing someone else's
    // address that that person uses Winback. The one message covers both,
    // and points the real owner to signing in.
    const inUse = !!error && /already|registered|exists/i.test(error);
    if (error && !inUse) {
      // Supabase's raw strings leak backend detail and mean nothing to a user
      // ("Email address not authorized" is what its default mail service says
      // when custom SMTP has not been configured). Translate the ones we can
      // predict and keep the rest generic.
      const friendly = /not configured/i.test(error)
        ? "Saving your progress isn't available in this build."
        : /not authorized|rate limit|over_email/i.test(error)
          ? "We couldn't send the confirmation email just now. Please try again in a little while."
          : /invalid/i.test(error)
            ? 'That email address does not look right. Check it and try again.'
            : "We couldn't save that right now. Please try again.";
      Alert.alert("Couldn't save", friendly);
    } else {
      Alert.alert(
        'Check your inbox',
        'If that email can be used, we sent a link to confirm it and finish saving. If you have saved your progress with it before, use "Already saved it? Sign in on this phone" instead.',
      );
      setEmail('');
      void readSaveState().then(setSaveState);
    }
  };

  return (
    <Screen edges={['top']}>
      {/* The partner and team inputs sit low on a long page. iOS insets the
          scroll view by the keyboard itself; Android relies on the avoiding
          view. "handled" lets the first tap on Save or Search land instead of
          only dismissing the keyboard. */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? undefined : 'padding'}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Text style={styles.title} accessibilityRole="header">
            You
          </Text>

          <Eyebrow heading style={styles.sectionLabel}>Talk to someone</Eyebrow>
          {helplines.map((line) => (
            <HelplineRow key={line.name + line.uri} line={line} compact={isLongList(helplines)} />
          ))}
          {/* Travelling, or a phone set to the wrong region: the other lines
              stay reachable rather than being hidden behind a region guess. */}
          {otherLines.length > 0 && (
            <Pressable
              onPress={() => setShowOtherLines((v) => !v)}
              hitSlop={8}
              accessibilityRole="button"
              aria-expanded={showOtherLines}
            >
              <Text style={styles.textLink}>
                {showOtherLines ? 'Hide other regions' : 'Not in your country? See other regions'}
              </Text>
            </Pressable>
          )}
          {showOtherLines &&
            otherLines.map((line) => (
              <HelplineRow key={line.name + line.uri} line={line} compact={isLongList(otherLines)} />
            ))}
          {/* Anywhere else in the world: the directory, unless it is already
              at the top because this device has no verified local line. */}
          {showOtherLines && !directoryLine && <HelplineRow line={HELPLINE_DIRECTORY} />}
          <Text style={styles.safetyNote}>
            Winback is a support tool, not a medical device or treatment. For medical advice,
            diagnosis or treatment, talk to a doctor or other healthcare professional. These
            lines are always here, free, no subscription needed.
          </Text>

          {/* Peer support Winback points to rather than hosts: moderating a
              community is a safety job, and these groups already do it. */}
          <Eyebrow heading style={styles.sectionLabel}>People who&apos;ve been there</Eyebrow>
          <Text style={styles.body}>
            Groups where people quitting gambling help each other. Winback is not part of them.
          </Text>
          <PeerSupportGuide family />

          <Eyebrow heading style={styles.sectionLabel}>Save your progress</Eyebrow>
          <Text style={styles.body}>
            {saveState.kind === 'saved'
              ? `Your progress is saved to ${maskEmail(saveState.email)}. On a new phone, sign in with that email to bring your quit date, your answers, your plan and your check-in days with you.`
              : saveState.kind === 'pending'
                ? `Almost done: tap the link we sent to ${maskEmail(saveState.email)} to finish saving. Nothing there? Check your spam folder, or send it again below.`
                : saveState.kind === 'none'
                  ? "You're using Winback without an account. Adding an email lets you sign back in on a new phone and bring your quit date, your answers, your plan and your check-in days with you."
                  : 'Adding an email lets you sign back in on a new phone and bring your quit date, your answers, your plan and your check-in days with you. If you saved one already, it still works.'}{' '}
            Some things stay on this phone only, like your goals, reps and the urges you ride
            out. Signing in is all your email is used for.
          </Text>
          {saveState.kind !== 'saved' && (
            <>
              <TextInput
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={colors.textFaint}
                // A placeholder is not a name: it stops being read once text is typed.
                accessibilityLabel="Email address"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={saveEmail}
                style={styles.input}
              />
              <Pressable
                style={[styles.saveButton, saving && { opacity: 0.6 }]}
                onPress={saveEmail}
                disabled={saving}
                accessibilityRole="button"
              >
                <Text style={styles.saveLabel}>
                  {saving
                    ? 'Saving…'
                    : saveState.kind === 'pending' && !email.trim()
                      ? 'Send the link again'
                      : 'Save my progress'}
                </Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={() => router.push('/signin')} hitSlop={8} accessibilityRole="button">
            <Text style={styles.textLink}>Already saved it? Sign in on this phone</Text>
          </Pressable>

          {lockSupported && (
            <>
              <Eyebrow heading style={styles.sectionLabel}>Privacy</Eyebrow>
              <Text style={styles.body}>
                {hideFlag
                  ? 'You told us you keep your betting private. An app lock means someone picking up your phone cannot open Winback and see your streak or your answers.'
                  : 'Require your fingerprint, face, or device passcode to open Winback.'}
              </Text>
              <Pressable style={styles.saveButton} onPress={toggleLock} accessibilityRole="button">
                <Text style={styles.saveLabel}>
                  {lockOn ? 'Turn app lock off' : 'Turn app lock on'}
                </Text>
              </Pressable>
            </>
          )}

          {!lockSupported && <Eyebrow heading style={styles.sectionLabel}>Privacy</Eyebrow>}
          <View style={[styles.freezeRow, lockSupported && styles.rowSpaced]}>
            <View style={[styles.freezeDot, !discreetNotifications && styles.freezeDotUsed]} />
            <Text style={styles.freezeText}>
              {discreetNotifications
                ? 'Discreet reminders on. Notifications never mention betting or your streak.'
                : 'Reminders name your streak and betting. Turn on discreet mode if someone else might see your lock screen.'}
            </Text>
          </View>
          <Pressable
            style={styles.saveButton}
            onPress={() => setDiscreetNotifications(!discreetNotifications)}
            accessibilityRole="button"
          >
            <Text style={styles.saveLabel}>
              {discreetNotifications ? 'Use normal reminders' : 'Use discreet reminders'}
            </Text>
          </Pressable>

          <View style={[styles.freezeRow, styles.rowSpaced]}>
            <View style={[styles.freezeDot, !usageData && styles.freezeDotUsed]} />
            <Text style={styles.freezeText}>
              {usageData
                ? 'Sharing usage data. Winback records how the app is used - which screens you open, and when you log a check-in, an urge, a slip or a panic session (never what you typed) - tied only to a random ID. A smaller set, without slips, urges or panic sessions, goes to PostHog. Never sold, never used for ads. Your progress, check-in days and panic-button times sync to your account either way.'
                : 'Usage data is off. This phone sends no usage events - turning it on would share which screens you open, and when you log a check-in, an urge, a slip or a panic session (never what you typed). Your progress, check-in days and panic-button times still sync to your account, so you can bring them to a new phone.'}
            </Text>
          </View>
          {/* Named by what it does ("Stop sharing usage data"), so the name
              spoken is the words on screen; the line above says the state. */}
          <Pressable style={styles.saveButton} onPress={toggleUsageData} accessibilityRole="button">
            <Text style={styles.saveLabel}>
              {usageData ? 'Stop sharing usage data' : 'Share usage data'}
            </Text>
          </Pressable>

          <Eyebrow heading style={styles.sectionLabel}>Reminders</Eyebrow>
          {permission === 'granted' ? (
            <Text style={styles.body}>
              Never more than three a day, never a money amount, and each one opens the screen it
              names. {discreetNotifications ? 'Discreet mode is on.' : ''}
            </Text>
          ) : permission === 'undetermined' ? (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>
                Reminders aren&apos;t turned on for this phone yet.
              </Text>
              <Pressable
                style={styles.saveButton}
                onPress={() => void askPermission()}
                disabled={asking}
                accessibilityRole="button"
              >
                <Text style={styles.saveLabel}>{asking ? 'One moment…' : 'Turn on reminders'}</Text>
              </Pressable>
            </View>
          ) : permission === 'unavailable' ? (
            <Text style={styles.body}>
              Reminders can&apos;t be shown in this version of the app. Your settings below are
              kept for when they can.
            </Text>
          ) : permission === 'denied' ? (
            <View style={styles.permissionBox}>
              <Text style={styles.permissionText}>
                Notifications are off for Winback in your phone&apos;s settings, so none of these
                can reach you. Turn them on there and they start again.
              </Text>
              <Pressable
                style={styles.saveButton}
                onPress={() => void openNotificationSettings()}
                accessibilityRole="button"
                accessibilityHint="Opens this app's page in your phone's settings"
              >
                <Text style={styles.saveLabel}>Open settings</Text>
              </Pressable>
            </View>
          ) : null}
          <TimeStepper
            label="Morning"
            value={reminderPrefs.morning}
            range={TIME_RANGES.morning}
            onChange={(t) => setReminderPrefs({ morning: t })}
          />
          <TimeStepper
            label="Evening"
            value={reminderPrefs.evening}
            range={TIME_RANGES.evening}
            onChange={(t) => setReminderPrefs({ evening: t })}
          />
          {lateNightUser && reminderPrefs.types.lateNight && (
            <TimeStepper
              label="Lights out"
              value={reminderPrefs.lateNight}
              range={TIME_RANGES.lateNight}
              onChange={(t) => setReminderPrefs({ lateNight: t })}
            />
          )}
          <View style={styles.typeList}>
            {typeRows.map((r) => (
              <TypeRow
                key={r.type}
                label={r.label}
                sub={r.sub}
                value={!r.locked && reminderPrefs.types[r.type]}
                disabled={r.locked}
                onChange={(on) => setTypeOn(r.type, on)}
              />
            ))}
          </View>

          <View onLayout={(e) => (cornerY.current = e.nativeEvent.layout.y)}>
            <Eyebrow heading style={styles.sectionLabel}>Your corner</Eyebrow>
          </View>
          <Text style={styles.body}>
            Pick one person you trust. When an urge hits, they&apos;re one tap away from the panic
            screen - no explaining needed.
          </Text>
          <TextInput
            value={partnerName}
            onChangeText={setPartnerName}
            placeholder="Name"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Your person's name"
            returnKeyType="next"
            style={styles.input}
          />
          <TextInput
            value={partnerPhone}
            onChangeText={setPartnerPhone}
            placeholder="Phone number"
            placeholderTextColor={colors.textFaint}
            accessibilityLabel="Your person's phone number"
            keyboardType="phone-pad"
            style={styles.input}
          />
          <Pressable style={styles.saveButton} onPress={savePartner} accessibilityRole="button">
            <Text style={styles.saveLabel}>{partner ? 'Update my person' : 'Save my person'}</Text>
          </Pressable>

          <Eyebrow heading style={styles.sectionLabel}>Your reasons</Eyebrow>
          <Text style={styles.body}>
            In your own words: who or what you&apos;re doing this for. The panic screen shows them
            when an urge hits. They stay on this phone.
          </Text>
          {REASON_PLACEHOLDERS.map((placeholder, i) => (
            <TextInput
              key={placeholder}
              value={reasonDrafts[i]}
              onChangeText={(text) => editReason(i, text)}
              placeholder={placeholder}
              placeholderTextColor={colors.textFaint}
              accessibilityLabel={`Reason ${i + 1} of ${MAX_REASONS}`}
              maxLength={MAX_REASON_LENGTH}
              returnKeyType={i < MAX_REASONS - 1 ? 'next' : 'done'}
              style={styles.input}
            />
          ))}
          <Pressable
            style={styles.saveButton}
            onPress={() => void saveMyReasons()}
            accessibilityRole="button"
          >
            <Text style={styles.saveLabel}>
              {myReasons.length ? 'Update my reasons' : 'Save my reasons'}
            </Text>
          </Pressable>

          <Eyebrow heading style={styles.sectionLabel}>Game-day mode</Eyebrow>
          <Text style={styles.body}>
            Save your teams and Winback checks in on game days, before kickoff: watch it clean,
            keep the money.
          </Text>
          {/* Game-day check-ins are sold on the paywall, so they have to
              actually be gated. Saved teams stay visible when a subscription
              lapses - taking them away would look like data loss - but new
              ones need Premium. */}
          {!isPremium && (
            <Pressable
              style={styles.upsellRow}
              onPress={() => router.push('/onboarding/paywall')}
              hitSlop={8}
              accessibilityRole="button"
            >
              <Text style={styles.upsellText}>
                Game-day check-ins are part of Premium. Unlock to have Winback check in before your
                teams play.
              </Text>
            </Pressable>
          )}
          {teams.length > 0 && (
            <View style={styles.teamChips}>
              {teams.map((t) => (
                <Pressable
                  key={t.id}
                  style={styles.teamChip}
                  onPress={() => removeTeam(t)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${t.name}`}
                >
                  <Text style={styles.teamChipLabel}>{t.name}</Text>
                  <XIcon size={11} color={colors.textDim} />
                </Pressable>
              ))}
            </View>
          )}
          {isPremium && (
            <TextInput
              value={teamQuery}
              onChangeText={setTeamQuery}
              placeholder={`Search a team (e.g. ${exampleList.slice(0, 2).join(', ')})`}
              placeholderTextColor={colors.textFaint}
              accessibilityLabel="Search a team"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={searchTeams}
              style={styles.input}
            />
          )}
          {isPremium && (
            <Pressable
              style={styles.saveButton}
              onPress={searchTeams}
              disabled={searching}
              accessibilityRole="button"
            >
              <Text style={styles.saveLabel}>{searching ? 'Searching…' : 'Search teams'}</Text>
            </Pressable>
          )}
          {!!teamSearchNote && <Text style={styles.searchNote}>{teamSearchNote}</Text>}
          {teamResults.map((t) => (
            <Pressable
              key={t.id}
              style={styles.teamResult}
              onPress={() => addTeam(t)}
              accessibilityRole="button"
              accessibilityLabel={`Add ${t.name}`}
            >
              <Text style={styles.teamResultLabel}>{t.name}</Text>
              <Text style={styles.teamResultAdd}>Add</Text>
            </Pressable>
          ))}

          <Eyebrow heading style={styles.sectionLabel}>Your streak</Eyebrow>
          <View style={styles.freezeRow}>
            <View style={[styles.freezeDot, !freezeAvailable && styles.freezeDotUsed]} />
            <Text style={styles.freezeText}>
              {freezeAvailable
                ? 'Streak freeze ready - one slip this month keeps your streak.'
                : isPremium
                  ? 'Streak freeze used this month. Resets on the 1st.'
                  : 'Streak freeze used this month - it returns at the start of next month.'}
            </Text>
          </View>
          <Text style={styles.body}>
            Many people who stop betting slip at least once. Logging it keeps the picture honest,
            and nothing you have kept so far goes away.
          </Text>
          <Pressable style={styles.outlineButton} onPress={openSlip} accessibilityRole="button">
            <Text style={styles.outlineLabel}>I slipped</Text>
          </Pressable>
          <Pressable onPress={confirmRedoQuiz} hitSlop={8} accessibilityRole="button">
            <Text style={styles.textLink}>Redo the onboarding quiz</Text>
          </Pressable>

          <Eyebrow heading style={styles.sectionLabel}>Membership</Eyebrow>
          {/* Must distinguish a paying subscriber from someone on the free
              week. `isPremium` is true for both, so using it here told trial
              users they had a subscription they had never bought - right above
              a "Restore purchases" link. */}
          <Text style={styles.body}>{membershipLine}</Text>
          {!!renewalLine && <Text style={styles.body}>{renewalLine}</Text>}
          {/* Play requires an in-app way to cancel, and nobody should have to
              hunt for one: the native sheet on iOS, Play's page on Android. */}
          {showManage && (
            <Pressable
              style={styles.saveButton}
              onPress={() => void openManageSubscription()}
              accessibilityRole="button"
            >
              <Text style={styles.saveLabel}>Manage subscription</Text>
            </Pressable>
          )}
          {!subscribed && (
            <Pressable
              style={styles.saveButton}
              onPress={() => router.push('/onboarding/paywall')}
              accessibilityRole="button"
            >
              <Text style={styles.saveLabel}>
                {trial.active || trialUnverified || hardship.active
                  ? 'See the plans'
                  : 'See what Premium adds'}
              </Text>
            </Pressable>
          )}
          {/* The same quiet offer as on the paywall, for someone who wants
              Premium and cannot pay for it right now. */}
          {hardshipOffered && (
            <Pressable
              onPress={() => router.push('/on-us')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityHint="Explains 30 days of Premium free, with no card"
            >
              <Text style={styles.textLink}>Premium is too much right now?</Text>
            </Pressable>
          )}
          {/* Both stores require an always-reachable restore path, not one
              that only exists during onboarding. */}
          <Pressable onPress={restore} hitSlop={8} disabled={restoring} accessibilityRole="button">
            <Text style={styles.textLink}>{restoring ? 'Restoring…' : 'Restore purchases'}</Text>
          </Pressable>
          {/* A plain link to the store page: the user chooses to rate, nothing
              is asked of them and nothing is unlocked by it. Hidden until the
              listing exists (storeUrl reads ios.appStoreUrl and
              android.playStoreUrl from app.json; null on the web). */}
          {!!rateUrl && (
            <Pressable
              onPress={() => void Linking.openURL(rateUrl).catch(() => {})}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.textLink}>
                {Platform.OS === 'ios' ? 'Rate Winback on the App Store' : 'Rate Winback on Google Play'}
              </Text>
            </Pressable>
          )}
          <View style={styles.legalRow}>
            <Pressable
              onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } })}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.legalLink}>Terms of Use</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } })}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: '/legal', params: { doc: 'health-data' } })}
              hitSlop={8}
              accessibilityRole="link"
            >
              <Text style={styles.legalLink}>Health data policy</Text>
            </Pressable>
          </View>

          <Eyebrow heading style={styles.sectionLabel}>Account</Eyebrow>
          <Text style={styles.body}>
            Deleting your account wipes everything from our servers: answers, check-ins, streak
            history, urge logs. It cannot be undone, and backup copies expire within 30 days.
            {subscribed
              ? ' It does not cancel your subscription - do that in Manage subscription first.'
              : showManage
                ? ' If your subscription is still active, deleting does not cancel it - check Manage subscription first.'
                : ''}
          </Text>
          {/* Selectable, so it can be copied into a deletion request. */}
          {!!accountId && (
            <Text style={styles.accountId} selectable>
              Account ID: {accountId}
            </Text>
          )}
          <Pressable
            onPress={confirmDeleteAccount}
            hitSlop={8}
            disabled={deleting}
            accessibilityRole="button"
          >
            <Text style={styles.dangerLink}>
              {deleting ? 'Deleting…' : 'Delete my account and data'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing.screenX, paddingBottom: 40 },
  title: { fontFamily: fonts.display.extrabold, fontSize: 28, color: colors.text },
  sectionLabel: { marginTop: 28, marginBottom: 12 },
  safetyNote: { fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textFaint, marginTop: 4 },
  body: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    lineHeight: 14 * 1.55,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    // textFaint: a field you can find (hairline was 1.26:1).
    borderColor: colors.textFaint,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.body.medium,
    fontSize: 15,
    marginTop: 14,
  },
  saveButton: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  saveLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.accent },
  outlineButton: {
    borderWidth: 1.5,
    borderColor: colors.hairline,
    backgroundColor: colors.surface,
    borderRadius: spacing.radius,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 14,
  },
  outlineLabel: { fontFamily: fonts.display.bold, fontSize: 15, color: colors.text },
  textLink: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: colors.textMuted,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 14,
  },
  teamChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  teamChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  teamChipLabel: { fontFamily: fonts.body.medium, fontSize: 13, color: colors.text },
  teamResult: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 14,
    paddingVertical: 13,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  teamResultLabel: { fontFamily: fonts.body.medium, fontSize: 14, color: colors.text },
  teamResultAdd: { fontFamily: fonts.display.bold, fontSize: 13, color: colors.accent },
  searchNote: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.textMuted,
    marginTop: 10,
  },
  accountId: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    color: colors.textMuted,
    marginTop: 10,
  },
  dangerLink: {
    fontFamily: fonts.body.regular,
    fontSize: 14,
    color: '#c96b5a',
    textDecorationLine: 'underline',
    marginTop: 12,
  },
  freezeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  rowSpaced: { marginTop: 16 },
  freezeDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#5FB98E' },
  freezeDotUsed: { backgroundColor: colors.textFaint },
  freezeText: { flex: 1, fontFamily: fonts.body.regular, fontSize: 12.5, color: colors.textMuted },
  legalRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 22,
    rowGap: 12,
    marginTop: 14,
  },
  upsellRow: {
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.surfaceWarmBorder,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginTop: 12,
  },
  upsellText: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.5,
    color: colors.notice,
  },
  legalLink: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    color: colors.textMuted,
    textDecorationLine: 'underline',
  },
  permissionBox: {
    backgroundColor: colors.surfaceWarm,
    borderWidth: 1,
    borderColor: colors.surfaceWarmBorder,
    borderRadius: 12,
    padding: 14,
  },
  permissionText: {
    fontFamily: fonts.body.regular,
    fontSize: 13,
    lineHeight: 13 * 1.5,
    color: colors.notice,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: 12,
    paddingVertical: 8,
    paddingLeft: 14,
    paddingRight: 8,
    marginTop: 10,
  },
  timeLabel: { flex: 1, fontFamily: fonts.body.medium, fontSize: 14, color: colors.text },
  timeValue: {
    minWidth: 76,
    textAlign: 'center',
    fontFamily: fonts.display.bold,
    fontSize: 15,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  stepButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonOff: { opacity: 0.4 },
  stepLabel: { fontFamily: fonts.display.bold, fontSize: 18, color: colors.accent },
  typeList: { marginTop: 12 },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  typeText: { flex: 1 },
  typeLabel: { fontFamily: fonts.body.medium, fontSize: 14, color: colors.text },
  typeSub: {
    fontFamily: fonts.body.regular,
    fontSize: 12.5,
    lineHeight: 12.5 * 1.45,
    color: colors.textDim,
    marginTop: 2,
  },
});
