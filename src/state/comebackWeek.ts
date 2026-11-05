import { DAILY_READS } from './dailyReads';

/**
 * Comeback week: the seven mornings after a slip (hook 12).
 *
 * One list for both places that talk about a comeback day - the /comeback
 * screen and that morning's reminder - so a push can never promise one thing
 * and open a screen about another. The reminder for day N is `push`, and it
 * describes exactly the item the screen shows on day N.
 *
 * Items reuse the reviewed curriculum (daily reads 3, 5, 12 and 27) and the
 * playbook, so the safety review behind them carries over. Asks "what",
 * never "why". Push copy follows lineBank's rules: no money amounts, no
 * betting-market words, nothing that claims the day went clean.
 */
export interface ComebackItem {
  title: string;
  /** Two or three sentences, read in under half a minute. */
  text: string;
  /** The one thing to do today. */
  action: string;
  /** A daily read whose full piece can be opened here (free in comeback week). */
  readDay?: number;
  /** A playbook play that can be opened here. */
  playId?: string;
  /** One-tap text to the saved person. */
  partnerText?: string;
  /** That morning's reminder body (the title is "Day N of your comeback."). */
  push: string;
}

const readByDay = (day: number) => DAILY_READS.find((r) => r.day === day);

/** Index 0 is comeback day 1. Always seven items. */
export const COMEBACK_WEEK: ComebackItem[] = [
  {
    title: 'Stop the chase',
    text: "The first days after a slip are when the win-it-back plan talks loudest. The bet is done. Tomorrow's money is still yours.",
    action: 'If the pull to get even shows up today, start a ten-minute timer before you do anything else.',
    playId: 'the-chase',
    push: 'Today is about the chase. If the pull to get even shows up, a ten-minute timer comes first.',
  },
  {
    title: 'Put the fence back',
    text: 'A slip usually finds a gap in a fence. Today is for closing it, while the reason is still fresh.',
    action: readByDay(3)?.action ?? 'Delete every betting app from your phone before tonight.',
    readDay: 3,
    push: 'Today: put the fence back. Close the gap the slip found, while it is fresh.',
  },
  {
    title: 'Tell your person',
    text: 'A slip kept secret is the one that grows. One plain text is enough. No details needed.',
    action: 'Send one line to the person you trust most.',
    partnerText: 'Had a slip this week. Back on plan now. Just wanted you to know.',
    push: 'Today: one plain text to the person you trust. No details needed.',
  },
  {
    title: 'The plan for next time',
    text: 'The first hour after a slip decides whether it stays one bet. That plan is best written on a calm day, like today.',
    action:
      readByDay(12)?.action ?? "Create a phone note titled 'If I slip' and write the three steps in it now.",
    readDay: 12,
    push: 'Today: write the plan for next time, while the day is calm. Two minutes.',
  },
  {
    title: 'A bigger fence',
    text: 'Self-exclusion puts a ban on your account that the betting company has to honor. It is a big step. Taking it today is a strong move, and so is coming back to it later.',
    action: readByDay(5)?.action ?? 'Look up self-exclusion on the betting app you used most.',
    readDay: 5,
    push: 'Today: a look at self-exclusion. A big step, and coming back to it later is fine too.',
  },
  {
    title: 'Talk to yourself like a teammate',
    text: 'A slip is one event with a date. Nobody benches a teammate for good over one bad play. Name what happened, take the lesson, run the next play.',
    action: 'Write one sentence you would say to a friend in your spot. Then read it to yourself.',
    push: 'Today: one sentence you would say to a teammate in your spot. Then say it to yourself.',
  },
  {
    title: 'The long game',
    text: 'A week back on plan. Urges thin out over months, not days, and a strong one can still show up. The money you kept before the slip is still kept.',
    action: readByDay(27)?.action ?? 'Write down one thing the money you kept has covered.',
    readDay: 27,
    push: "Last day of your comeback week. Today is about the long game, and what you've kept.",
  },
];
