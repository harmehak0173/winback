/**
 * Invariants of the static content the safety layer and the daily hooks are
 * built from. Each one guards a decision that has a reason behind it (see the
 * comments in the data files), so a later edit cannot quietly undo it.
 */
import { SUPPORTED } from '@/lib/helplines-data';
import { CUT_LINE_IDS, CUT_LINES } from '@/state/cutLines';
import { milestonesThrough } from '@/state/milestones';
import { GAM_ANON, PEER_SUPPORT, PEER_SUPPORT_FALLBACK } from '@/state/peerSupport';
import { PLAYBOOK } from '@/state/playbook';
import { estimateMonthlySpend, QUESTIONS, SPEND_BRACKETS } from '@/state/quiz-data';

const index = (id: string) => CUT_LINES.findIndex((c) => c.id === id);

describe('Cut the lines', () => {
  it('has unique ids', () => {
    expect(CUT_LINE_IDS.size).toBe(CUT_LINES.length);
  });

  it('keeps the marketing opt-outs before self-exclusion (an excluded account cannot be logged into)', () => {
    for (const id of ['emails', 'texts', 'marketing-optout']) {
      expect(index(id)).toBeLessThan(index('self-exclude'));
    }
  });

  it('puts the partner lock after the blocker it protects', () => {
    expect(index('partner-key')).toBeGreaterThan(index('blocker'));
  });

  it('marks exactly the big steps, so Done never outweighs Skip on them', () => {
    expect(CUT_LINES.filter((c) => c.big).map((c) => c.id).sort()).toEqual([
      'bank-block',
      'partner-key',
      'self-exclude',
    ]);
  });

  it('links every task to a play that exists', () => {
    for (const c of CUT_LINES) {
      if (c.playId) expect(PLAYBOOK.map((p) => p.id)).toContain(c.playId);
    }
  });

  it('offers a text to your person only where the task needs one', () => {
    expect(CUT_LINES.filter((c) => c.partnerText).map((c) => c.id)).toEqual(['partner-key']);
  });
});

describe('Peer support', () => {
  const every = [...Object.values(PEER_SUPPORT).flat(), ...PEER_SUPPORT_FALLBACK, GAM_ANON];

  it('has groups for every region the helplines cover', () => {
    for (const region of SUPPORTED) expect(PEER_SUPPORT[region].length).toBeGreaterThan(0);
  });

  it('links only https pages', () => {
    for (const g of every) expect(g.url).toMatch(/^https:\/\//);
  });

  it('never links the GA domains that now belong to gambling sites', () => {
    for (const g of every) {
      expect(g.url).not.toMatch(/gamblersanonymous\.org\.(au|nz)|gamblersanonymous\.(ca|com)\b/);
    }
  });
});

describe('Spend estimate', () => {
  const spendQ = QUESTIONS.find((q) => q.id === 'spend')!;
  const styleQ = QUESTIONS.find((q) => q.id === 'style')!;

  it('always stays inside the bracket the person chose', () => {
    for (let spend = 0; spend < spendQ.options.length; spend++) {
      for (let style = 0; style < styleQ.options.length; style++) {
        for (const freq of [0, 1, 2, 3]) {
          const [lo, hi] = SPEND_BRACKETS[spend];
          const e = estimateMonthlySpend({ spend, style, freq, triggers: [0, 3, 6], history: 3, baseline: 0 });
          expect(e).toBeGreaterThanOrEqual(lo);
          expect(e).toBeLessThanOrEqual(hi);
        }
      }
    }
  });

  it('treats prediction markets as neutral, neither fast nor straight', () => {
    const base = { spend: 2, freq: 2 };
    const predictions = styleQ.options.indexOf('Prediction markets / event contracts');
    const whatever = styleQ.options.indexOf('Whatever looks good that day');
    expect(predictions).toBeGreaterThan(-1);
    expect(estimateMonthlySpend({ ...base, style: predictions })).toBe(
      estimateMonthlySpend({ ...base, style: whatever }),
    );
  });
});

describe('Milestones', () => {
  it('ends for a streak that did not parse (NaN used to loop forever)', () => {
    expect(milestonesThrough(Number.NaN).length).toBeGreaterThan(0);
    expect(milestonesThrough(Number.POSITIVE_INFINITY).length).toBeGreaterThan(0);
  });

  it('reaches past the days asked for', () => {
    const list = milestonesThrough(800);
    expect(list[list.length - 1].days).toBeGreaterThan(800);
  });
});
