/**
 * Cut the lines: thirteen short tasks that shut a channel the betting
 * companies use to reach you (hook 6). Stimulus control, not a points game:
 * each task is Done or Skip, nothing is scored beyond "lines cut", and there
 * is deliberately no tally of promos let pass (that would reward staying
 * subscribed).
 *
 * Order matters. Marketing opt-outs come before self-exclusion, because an
 * excluded account can no longer be logged into to change them, and the
 * partner lock comes after the blocker it protects. Self-exclusion, a bank
 * block and the partner lock are big steps and are always skippable.
 *
 * Self-exclusion programs and bank blocks for each region live in
 * selfExclusion.ts (as of October 2026, with sources) and show under the
 * tasks marked `regional`.
 *
 * Platform steps are written as of September 2026, against the current iOS,
 * Android, Chrome, Google and Meta settings. Menus move between releases, so
 * every step names the setting as well as the path, and each task says what to
 * look for if the path has changed. Review them every release.
 */

export interface CutLine {
  id: string;
  /** Imperative, short. */
  title: string;
  /** One sentence: why this line matters. */
  why: string;
  /** Steps that do not depend on the phone. */
  steps?: string[];
  /** iPhone steps, when they differ. */
  ios?: string[];
  /** Android steps, when they differ. */
  android?: string[];
  /** Related playbook play, or empty string. */
  playId: string;
  /** Region-specific detail under the steps (see Play.regional). */
  regional?: 'exclusion' | 'bank';
  /**
   * A big step: longer than a minute and harder to undo, so Done carries no
   * extra emphasis over Skip.
   */
  big?: true;
  /** A one-tap text to the user's person, offered under the steps (partner.ts). */
  partnerText?: string;
}

/** Shown once under the steps of any platform-specific task. */
export const CUT_LINES_AS_OF = 'Steps as of September 2026. If a menu has moved, search Settings for the name in quotes.';

export const CUT_LINES: CutLine[] = [
  {
    id: 'delete-apps',
    title: 'Delete the betting apps',
    why: 'An app on your home screen is a deposit two taps away, and it pings you when you are most likely to answer.',
    ios: [
      'Touch and hold the app icon.',
      'Tap "Remove App", then "Delete App".',
      'Repeat for every betting app, including the ones you rarely open.',
    ],
    android: [
      'Touch and hold the app icon.',
      'Tap "Uninstall" (or drag it to Uninstall).',
      'Repeat for every betting app, including the ones you rarely open.',
    ],
    playId: 'block-the-apps',
  },
  {
    id: 'emails',
    title: 'Unsubscribe from their emails',
    why: 'Win-back offers are aimed at accounts that have gone quiet. Yours is about to get quieter.',
    steps: [
      'Search your inbox for each betting company\'s name.',
      'Open one of their emails and tap "Unsubscribe" at the very bottom.',
      'Then block the sender, or set a filter that sends their mail straight to trash.',
    ],
    playId: 'block-the-apps',
  },
  {
    id: 'texts',
    title: 'Stop their text messages',
    why: 'A text lands on your lock screen with no warning, which is exactly why they send them.',
    steps: ['Reply STOP to each betting company\'s marketing text.'],
    ios: ['Then in Messages, open the conversation, tap the sender at the top, and tap "Block Caller".'],
    android: ['Then in Messages, touch and hold the conversation and tap "Block".'],
    playId: 'block-the-apps',
  },
  {
    id: 'marketing-optout',
    title: 'Opt out of marketing in each account',
    why: 'Unsubscribing stops one list. The account setting stops them contacting you at all.',
    steps: [
      'Log in on their website (not the app).',
      'Find "Communication preferences" or "Marketing preferences", usually under Account or Settings.',
      'Turn off email, SMS, phone and push marketing, and save.',
      'Do this before self-excluding - an excluded account may lock you out of the settings.',
    ],
    playId: 'self-exclusion',
  },
  {
    id: 'fewer-ads',
    title: 'Ask for fewer gambling ads',
    why: 'You cannot turn off every ad, but you can tell the two biggest ad networks to stop aiming these at you.',
    steps: [
      'Google (Search, YouTube, Discover): open myadcenter.google.com, tap "Customize ads", open the "Sensitive" tab and limit "Gambling".',
      'Instagram and Facebook: Settings > Accounts Center > Ad preferences > Ad topics, then choose "See less" for gambling.',
      'Both are best effort: some ads may still get through.',
    ],
    playId: 'block-the-apps',
  },
  {
    id: 'unfollow',
    title: 'Unfollow the picks accounts',
    why: 'Picks accounts and betting company accounts keep a bet one tap from ready, every time you scroll.',
    steps: [
      'Go through who you follow on each social app.',
      'Unfollow every betting company, picks account and "lock of the day" page.',
      'Mute any friend who mostly posts bets. Muting is silent - nobody is told.',
    ],
    playId: 'group-chat',
  },
  {
    id: 'mute-chat',
    title: 'Mute the betting group chat',
    why: 'The chat posts every winning ticket and none of the losing ones. You can stay in it and still stop the pings.',
    ios: ['In Messages, open the chat, tap the group name at the top, and turn on "Hide Alerts".'],
    android: ['In Messages, open the chat, tap the three dots, then "Group details", and turn notifications off.'],
    steps: ['In WhatsApp or other chat apps, open the chat info and choose "Mute".'],
    playId: 'group-chat',
  },
  {
    // Checked October 2026: Kalshi's and Robinhood's own help pages, the
    // New York and Michigan regulators, SelfExclude.io, and outside the US
    // the CSA (Canada), ASIC (Australia) and the DIA (New Zealand). State
    // self-exclusion lists generally do not cover these apps, and Kalshi says
    // its own exclusion does not stop the same contracts bought through a
    // broker app. This market changes monthly: review it every release.
    id: 'prediction-apps',
    title: 'Close the prediction and pick\'em apps',
    why: 'As of October 2026, prediction markets and the "predictions" or "event contracts" tab in some trading and crypto apps let you put money on a game. Money on a game is money on a game, and the self-exclusion programs for betting companies mostly do not cover them.',
    steps: [
      'Check every money app you use, trading and crypto apps included, for anything that pays out on a sports result, whatever it calls it.',
      'Self-exclude inside each one before you delete it: look for "Self-exclusion", "Trading break" or "Responsible trading". Deleting the app leaves the account open.',
      'Hiding the markets is not the same as excluding. If a trading app only offers to hide them, ask its support to exclude you from event contracts.',
      'In the US, SelfExclude.io excludes you from some prediction markets at once (Kalshi and Novig as of October 2026). Excluding on one app may not stop the same contracts sold through another, so cover every app you have.',
      'In Canada, Australia and New Zealand no prediction market is licensed, so BetGuard, BetStop and the like do not reach them. Block the sites with your blocker instead.',
      'Unsubscribe from their emails the same way as the betting companies.',
    ],
    playId: 'block-the-apps',
  },
  {
    id: 'saved-cards',
    title: 'Remove your saved cards',
    why: 'A saved card turns a deposit into one tap. Typing the numbers back in is a few minutes of friction at the exact moment it counts.',
    steps: ['On each betting website still open to you, remove every saved card and bank account.'],
    ios: ['In Settings > Apps > Safari > AutoFill, turn off "Credit Cards".'],
    android: ['In Chrome, tap the three dots > Settings > "Payment methods", and turn off "Save and fill payment methods".'],
    playId: 'payday-plan',
  },
  {
    id: 'bank-block',
    title: 'Turn on a gambling block at your bank',
    why: 'Many banks and card issuers can decline gambling payments for you, and at many of them, switching the block back off takes 2 days or more.',
    steps: [
      'Open your banking app and search its settings or help for "gambling".',
      'If it offers a gambling block, turn it on for every card.',
      'If it does not, ask the bank by message or phone whether they can block gambling transactions.',
    ],
    playId: 'block-the-apps',
    regional: 'bank',
    big: true,
  },
  {
    id: 'blocker',
    title: 'Install a gambling blocker',
    why: 'A blocker stops betting sites and apps at the device level, even at 1am when your judgment is worst.',
    steps: [
      'Install a dedicated blocker. BetBlocker is free and run by a charity; Gamban is paid and covers all your devices.',
      'Pick the longest block period you can live with.',
      'Put it on every device you could bet from, not just your phone.',
      'Switched a blocker off before? Then do the bank block and self-exclusion in this list too. They are harder to undo in a bad moment: at many banks, lifting a gambling block takes 2 days or more, and self-exclusion is a ban the betting companies must enforce.',
    ],
    playId: 'block-the-apps',
  },
  {
    // Steps checked against Apple's iOS 26 and iOS 27 Screen Time pages and
    // Google's Android 17 Parental controls and Play content restrictions
    // pages, October 2026. Family Link is left out on purpose: it supervises
    // children, not adults. The recovery account is the whole point - if it
    // is the user's own, the user can reset the passcode alone.
    id: 'partner-key',
    title: 'Give your person the key',
    why: 'A lock you can undo yourself is only as strong as your worst minute. If your person holds the passcode, undoing it means asking someone who knows why you set it, and that pause gives an urge time to pass.',
    steps: ['Sit down together, once the betting apps are deleted and your blocker is on. Allow about ten minutes.'],
    ios: [
      'In Settings > Screen Time, turn on "App & Website Activity" if it is off.',
      'Open "Content & Privacy Restrictions" and turn it on. Under "iTunes & App Store Purchases", set "Installing Apps" and "Deleting Apps" to Don\'t Allow. Your blocker stays on the phone, and no betting app can come back without your person. The cost: new apps, and sometimes updates, wait until your person lifts it.',
      'Under "Web Content", choose "Limit Adult Websites" and add the betting sites you used to "Never Allow". Leave the "Apps" age limit as it is: Winback is rated 18+ too, so a limit below 18+ would lock it away along with the betting apps.',
      'Last, your person taps "Lock Screen Time Settings" and types a passcode you do not see and could not guess. At "Screen Time Passcode Recovery" they enter their own Apple Account, not yours, so only they can reset it. Do not skip that step.',
      'On iOS 27, look for "Installing Apps", "Deleting Apps" and "Web Content" under "Apps & Websites", and for the passcode under "Passcode & Management" (or "Manage Screen Time").',
      'Test it together: try to delete an app and to open a site you blocked, and check that Winback still opens.',
    ],
    android: [
      'On Android 17 or later, your person opens Settings > "Parental controls", sets up a PIN you could not guess, and adds their own Google Account as the recovery email under "Manage your PIN".',
      'Under "App store filters" > Google Play Store > "Apps & games", they choose an age limit below 18 and save. Real-money betting apps are adults-only, so they will not install.',
      'No "Parental controls" in Settings? In the Play Store, tap your profile picture > Settings > Family > "Content restrictions". Your person sets the PIN and the highest rating below adults-only. It is easier to get around than the Android 17 lock, so pair it with the bank block.',
    ],
    playId: 'block-the-apps',
    big: true,
    partnerText:
      "Could you help me lock down my phone? I'd like you to set a passcode only you know, so I can't undo my gambling blocks on a bad night. About 10 minutes, together.",
  },
  {
    id: 'self-exclude',
    title: 'Self-exclude',
    why: 'Self-exclusion bans you from the betting companies, and they are required to enforce it. One calm decision outvotes a thousand bad moments.',
    steps: [
      'Use the program for where you live, below. Some cover every licensed betting company at once.',
      'Or use "Responsible gaming" in each company\'s app or website.',
      'Choose the longest period you can commit to. In some places the longest (lifetime) cannot be undone.',
      'This is a big step. It is fine to skip it for now and come back.',
    ],
    playId: 'self-exclusion',
    regional: 'exclusion',
    big: true,
  },
];

export const CUT_LINE_IDS: ReadonlySet<string> = new Set(CUT_LINES.map((c) => c.id));

export function cutLineById(id: string): CutLine | undefined {
  return CUT_LINES.find((c) => c.id === id);
}
