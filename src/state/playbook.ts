/**
 * The Playbook: CBT-grounded plays for the moments that break streaks.
 * Static content, written once, free forever (v1 plan section 9).
 *
 * Figures must say where they come from and what they measure. The figures
 * in 'real-odds' are published findings, quoted as their sources state them:
 * - 96% and 4% of 717,724 US online gamblers: Taylor, McCarthy and Wilbur,
 *   MSI working paper (2024); UC San Diego Rady School release, 2024-07-23.
 * - Frequent bettors' 56% cut in investment deposits (183,821 households):
 *   Baker, Balthrop, Johnson, Kotter and Pisciotta, "Gambling Away
 *   Stability", 2026 version (BYU ScholarsArchive; first NBER w33108, 2024).
 * - Credit scores, the 10% rise in bankruptcy likelihood and the 8% rise in
 *   debt collections with online access: Hollenbeck, Larsen and Proserpio,
 *   "The Financial Consequences of Legalized Sports Gambling" (2025).
 */
export interface Play {
  id: string;
  title: string;
  tagline: string;
  body: string;
  /**
   * Region-specific detail shown under the body (src/state/selfExclusion.ts):
   * the self-exclusion programs, or the bank gambling blocks.
   */
  regional?: 'exclusion' | 'bank';
}

export const PLAYBOOK: Play[] = [
  {
    id: 'urge-surfing',
    title: 'Urge surfing',
    tagline: 'The 20-minute rule',
    body: "An urge is a wave: it builds, peaks, and breaks. Many people find the worst of it passes within 20 or 30 minutes. You don't have to beat it, just outlast it. Name it out loud ('this is an urge, not a decision'), notice where you feel it in your body, and set a 20-minute timer before you're allowed to do anything about it. By the time it rings, the worst of it has often eased. The panic button in this app is built exactly for those 20 minutes.",
  },
  {
    id: 'payday-plan',
    title: 'The payday play',
    tagline: 'Move the money before the betting companies ask for it',
    body: "The betting companies time their promos to paydays because fresh money is loose money. Beat them to it: the morning your pay lands, move your set amount to savings or debt payments automatically, before you open anything else. Money that already has a job is hard to bet. If your bank supports scheduled transfers, set them for payday morning and let the decision make itself.",
  },
  {
    id: 'watching-with-friends',
    title: 'Watching games with betting friends',
    tagline: 'Keep the crew, change the game',
    body: "You don't have to give up game day or your friends. Decide your line before you arrive: 'I'm off betting, not off the game.' Say it once, early - most people drop it immediately. Give yourself a role that isn't betting: run the grill, track the fantasy league, be the one who actually watches the game. If someone pushes twice, that tells you something about them, not about you.",
  },
  {
    id: 'group-chat',
    title: 'The group-chat parlay',
    tagline: 'Surviving pick culture',
    body: "The group chat is a slot machine in your pocket: everyone posts wins, nobody posts the losses that paid for them. You don't have to leave the chat - mute it on game days, and never tap a bet link inside 20 minutes of seeing it (urge rule applies). When someone posts a winning slip, remember you're seeing one ticket out of the pile they tore up.",
  },
  {
    id: 'the-chase',
    title: 'Why chasing never works',
    tagline: 'The math the betting companies count on',
    body: "Chasing feels logical: you're 'down' and one win gets it back. But the hole was dug at negative expected value, and the shovel is the same one. Every chase bet is placed at the worst possible moment - emotional, rushed, and sized too big. The betting companies' entire risk model is built on the chase. The only guaranteed way to stop losing money tonight is to stop tonight. The loss is real, but it's also already spent - tomorrow's money is still yours.",
  },
  {
    id: 'real-odds',
    title: 'The real odds',
    tagline: 'What the research on legal betting shows',
    body: "In a 2024 UC San Diego study of the payment records of more than 700,000 US online gamblers, 96% appeared to lose money. Only 4% came out ahead. The losses do not stay inside the betting app. Where US states legalized online sports betting, frequent bettors cut the money they put into investment accounts by 56% (Baker and colleagues, 2026, bank data from 183,821 households). Where betting moved online, credit scores fell, the chance of bankruptcy rose about 10% and debt sent to collections rose 8% (Hollenbeck and colleagues, 2025). Skill was not the missing ingredient; the margin built into every price was. Volume just pays that margin more often. You are not one system away from beating it. Nobody is.",
  },
  {
    id: 'self-exclusion',
    title: 'Self-exclusion, explained',
    tagline: 'The strongest block there is',
    body: "Self-exclusion means you ban yourself, and the betting companies have to enforce it. Many places run one program that covers every licensed company at once, and most licensed apps have their own in their responsible-gaming settings. It feels drastic - that's the point. You make one good decision that outvotes a thousand future bad moments.",
    regional: 'exclusion',
  },
  {
    id: 'block-the-apps',
    title: 'Put a lock on the apps',
    tagline: 'Friction beats willpower at 1am',
    body: "Winback is the coach, not the lock: it adds no VPN and filters nothing, so the rest of your phone works as it always has. For the lock, use a blocker built for it. BetBlocker is free, run by a charity, needs no account, and blocks hundreds of thousands of gambling sites and thousands of apps for a period you choose - and once it is on, you cannot switch it off until that period ends. Gamban is paid and covers all your devices on one licence. Count prediction markets and the predictions tab in trading apps as betting apps too: if it pays out on a game, it is a bet, whatever the app calls it. Either blocker puts real friction between you and a deposit at the exact moment your judgment is worst. Stack it: blocker on the phone, self-exclusion with the betting companies, and a gambling block from your bank if it offers one. No single layer is bypass-proof. Three layers is a wall. Then give your person the key: let them set the passcode on your phone's Screen Time or Parental controls, so lifting a lock means asking them first. And if you catch yourself about to switch a block off, open the panic button first: that is an urge talking, and urges pass.",
    regional: 'bank',
  },
];
