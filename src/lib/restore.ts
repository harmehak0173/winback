import { addDays, isDayKey, localDayKey } from './day';
import { supabase, ensureSession, withTimeout } from './supabase';
import { AnswerMap, QUESTIONS, QuestionId } from '@/state/quiz-data';

/**
 * Rebuild local state from the server after signing in on a new device.
 *
 * Quiz answers are stored as option LABELS rather than indexes, so restoring
 * maps each label back to its position. Labels are unique within a question,
 * which makes this deterministic; anything that no longer matches (a reworded
 * option in a later release) is dropped rather than guessed, because a wrong
 * index would silently change the user's cost figures.
 */
export interface RestoredState {
  answers: AnswerMap;
  quitDate: string | null;
  plan: 'yearly' | 'monthly' | 'free' | null;
  monthlySpend: number | null;
  /** Money kept during streaks that ended before this restore. */
  moneyKeptBefore: number | null;
  /** Daily reads completed. null when the server has no such column yet. */
  dailyIndex: number | null;
  /** Longest clean streak ever, in days. null when the server has no such column yet. */
  bestStreakDays: number | null;
  /**
   * Days closed out clean (or as a close call beaten), from check_ins, within
   * the same window the device keeps. The server does not distinguish a close
   * call from a clean day, so every one comes back as clean.
   */
  checkInDays: string[];
  /** The user id this restore ran as, so callers can detect an identity change. */
  userId: string | null;
  /** True when the server had a profile for this user at all. */
  found: boolean;
  /**
   * True when the account could not be read at all (offline, a timeout, an
   * error). Nothing is known about it then - in particular, not that it is
   * empty.
   */
  failed: boolean;
}

export const EMPTY_RESTORE: RestoredState = {
  answers: {},
  quitDate: null,
  plan: null,
  monthlySpend: null,
  moneyKeptBefore: null,
  dailyIndex: null,
  bestStreakDays: null,
  checkInDays: [],
  userId: null,
  found: false,
  failed: false,
};

const FAILED_RESTORE: RestoredState = { ...EMPTY_RESTORE, failed: true };

/** The user is watching a spinner; a dead network must not keep them there. */
const RESTORE_TIMEOUT_MS = 12_000;

/**
 * How far back close-outs are kept on the device, in days. Restore reads the
 * same window, so a day the device already aged out can never come back and
 * be counted twice.
 */
export const CLOSEOUT_WINDOW_DAYS = 400;

function labelsToAnswer(id: QuestionId, labels: string[]): number | number[] | undefined {
  const q = QUESTIONS.find((x) => x.id === id);
  if (!q) return undefined;
  const idxs = labels
    .map((label) => q.options.indexOf(label))
    .filter((i) => i >= 0);
  if (!idxs.length) return undefined;
  return q.multi ? idxs : idxs[0];
}

/**
 * Only plans this build sells. An older row can still say 'weekly' (the
 * database allows it); that, or anything else, restores as no plan on record
 * rather than a label the app no longer has.
 */
const RESTORABLE_PLANS: readonly NonNullable<RestoredState['plan']>[] = ['yearly', 'monthly', 'free'];
const asPlan = (v: unknown): RestoredState['plan'] => RESTORABLE_PLANS.find((p) => p === v) ?? null;

const nonNegative = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

async function fetchRestore(): Promise<RestoredState> {
  if (!supabase) return EMPTY_RESTORE;
  try {
    const userId = await ensureSession();
    if (!userId) return FAILED_RESTORE;

    // `*` rather than a column list: columns added in later schema versions
    // (daily_index, best_streak_days) are read when present, and a database
    // that has not been migrated yet still restores everything else instead
    // of failing the whole select on an unknown column.
    const since = addDays(localDayKey(), -(CLOSEOUT_WINDOW_DAYS - 1));
    const [profileRes, rowsRes, checkInsRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
      supabase.from('quiz_answers').select('question_id, answer').eq('user_id', userId),
      supabase
        .from('check_ins')
        .select('day')
        .eq('user_id', userId)
        .gte('day', since)
        .order('day', { ascending: false })
        .limit(CLOSEOUT_WINDOW_DAYS),
    ]);
    // postgrest reports a failed request as `error`, never by throwing. Read
    // as "no data", a dropped connection told people their history was gone
    // and sent them to onboarding, whose upload then overwrote the account's
    // real quit date. Any one of the three failing means we do not know.
    if (profileRes.error || rowsRes.error || checkInsRes.error) return { ...FAILED_RESTORE, userId };
    const profile = profileRes.data;
    const rows = rowsRes.data;
    const checkIns = checkInsRes.data;

    const checkInDays = (checkIns ?? [])
      .map((r) => (r as { day?: unknown }).day)
      .filter(isDayKey);

    if (!profile && !(rows && rows.length) && !checkInDays.length) {
      return { ...EMPTY_RESTORE, userId };
    }

    const answers: AnswerMap = {};
    for (const r of rows ?? []) {
      const id = r.question_id as QuestionId;
      // Never restored, even if an old build uploaded it.
      if (id === 'secrecy') continue;
      const labels = Array.isArray(r.answer) ? (r.answer as string[]) : [];
      const value = labelsToAnswer(id, labels);
      if (value !== undefined) answers[id] = value;
    }

    const p = (profile ?? {}) as Record<string, unknown>;
    const monthly = nonNegative(p.monthly_spend);
    return {
      answers,
      quitDate: typeof p.quit_at === 'string' && Number.isFinite(Date.parse(p.quit_at)) ? p.quit_at : null,
      plan: asPlan(p.plan),
      monthlySpend: monthly && monthly > 0 ? monthly : null,
      moneyKeptBefore: nonNegative(p.money_kept_before),
      dailyIndex: nonNegative(p.daily_index),
      bestStreakDays: nonNegative(p.best_streak_days),
      checkInDays,
      userId,
      found: true,
      failed: false,
    };
  } catch {
    return FAILED_RESTORE;
  }
}

export function restoreFromServer(): Promise<RestoredState> {
  return withTimeout(fetchRestore(), RESTORE_TIMEOUT_MS, FAILED_RESTORE);
}
