/**
 * Milestone badges and what each one marks (v1 plan section 7).
 *
 * Every line describes behaviour - what you did, and what people in recovery
 * commonly say they notice - and is hedged as such. No claims about brain
 * chemistry or measured changes: none of that is sourced, and an app that
 * congratulates someone should not make health claims it cannot back.
 */
export interface Milestone {
  days: number;
  title: string;
  body: string;
}

export const MILESTONES: Milestone[] = [
  {
    days: 1,
    title: 'First day clean',
    body: 'The hardest bet to skip is the first one. You just skipped a whole day of them.',
  },
  {
    days: 3,
    title: 'Three days',
    body: 'Many people say the first few days are the loudest. You got through them.',
  },
  {
    days: 7,
    title: 'One week',
    body: 'A full week of promos ignored. Plenty of people say they sleep better around now.',
  },
  {
    days: 14,
    title: 'Two weeks',
    body: 'For a lot of people, urges start showing up less often by now. The check-the-score reflex gets easier to ignore.',
  },
  {
    days: 28,
    title: 'Four weeks',
    body: 'A full month of deposits kept in your pocket. Many people say their days feel calmer without the swings.',
  },
  {
    days: 45,
    title: '45 days',
    body: 'Six weeks and change. Paydays have come and gone and the money stayed. Many people say the pull shows up less often by now.',
  },
  {
    days: 60,
    title: 'Two months',
    body: 'Two months of real wins: money kept, and games you get to just watch.',
  },
  {
    days: 90,
    title: 'Three months',
    body: 'Ninety days is a milestone a lot of recovery programs mark. Many people find games feel like games again.',
  },
  {
    days: 120,
    title: 'Four months',
    body: 'Four months. Whole weekends of games watched for the game. Plenty of people say the constant score-checking has quietly stopped.',
  },
  {
    days: 180,
    title: 'Six months',
    body: 'Half a year. The betting companies lost a customer; you got your money and your weekends back.',
  },
  {
    days: 270,
    title: 'Nine months',
    body: 'Nine months. A full season has come and gone without a deposit. Many people say big games start to feel like just games.',
  },
  {
    days: 365,
    title: 'One year',
    body: 'A whole year: every payday, every big game, every promo, and none of it went to the betting companies. That is a year you built.',
  },
];

const YEAR_WORDS = ['Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];

/**
 * The milestone for year `n` (2 and up). Anniversaries keep coming after the
 * first year, so the list never simply runs out.
 */
export function yearlyMilestone(n: number): Milestone {
  const word = YEAR_WORDS[n - 2];
  return {
    days: n * 365,
    title: word ? `${word} years` : `${n} years`,
    body:
      n === 2
        ? 'Two years. The betting companies have stopped expecting you back. Many people say this is when it stops feeling like something they are quitting and starts feeling like who they are.'
        : `${word ?? n} years of money kept and games watched for the game. The plan still works because you kept running it.`,
  };
}

/**
 * Every milestone up to and including `days`, plus the next one after it.
 * Ascending. Use this instead of MILESTONES wherever the list could run out
 * (MILESTONES stops at one year; this continues yearly).
 */
export function milestonesThrough(days: number): Milestone[] {
  // NaN or Infinity (a date that did not parse) would never end the loop.
  const limit = Number.isFinite(days) ? days : 0;
  const out = [...MILESTONES];
  for (let n = 2; ; n++) {
    const m = yearlyMilestone(n);
    out.push(m);
    if (m.days > limit) break;
  }
  return out;
}

/** The first milestone strictly after `days`. Never null: anniversaries continue. */
export function nextMilestoneAfter(days: number): Milestone {
  return milestonesThrough(days).find((m) => m.days > days)!;
}
