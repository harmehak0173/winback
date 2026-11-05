/**
 * The 28-day daily-read curriculum.
 *
 * GENERATED from a grounded, drafted and adversarially reviewed pass - every
 * item was checked for clinical safety (nothing that could trigger, no
 * character attributions, no shame moves), factual accuracy (the gambler's
 * fallacy, near-miss effect and odds mechanics stated correctly and
 * conservatively), and the house voice. Edit deliberately; the arc's order is
 * the point: acute week, boredom week, cognition week, consolidation week.
 */
export interface DailyRead {
  id: string;
  /** 1-28, position in the arc. */
  day: number;
  /** Max 34 characters. */
  title: string;
  /** 80-150 words. One idea. Reads in about a minute. */
  body: string;
  /** One concrete thing to do today, or empty string. */
  action: string;
  /** Related playbook entry id, or empty string. */
  playId: string;
  /**
   * The action shown on its own (Today's move, for free users), when `action`
   * only makes sense after reading the body or would work as a cue without it
   * - writing down the total you are down, the 5-5 math, your worst bad beat.
   * Same safety review as the rest. Use `freeAction ?? action`.
   */
  freeAction?: string;
  /**
   * Prefilled text for a one-tap SMS to the saved partner, for actions that
   * are "text your person". Sent only when the user taps; never automatic.
   */
  partnerText?: string;
}

export const DAILY_READS: DailyRead[] = [
  {
    id: 'the-urge-is-a-wave',
    day: 1,
    title: 'The urge has a shape',
    body: 'Tonight or tomorrow, an urge to bet will show up. Here is the most useful fact about it: an urge is a wave. It builds, it crests, and it falls. If you do not feed it - no app, no odds check, no deposit - for many people it passes on its own, often sooner than it feels like it will. It feels permanent while it is peaking. It is not. The betting companies need you to act during the crest. That is why their apps put a bet two taps away. Your job is not to fight the urge. Fighting it feeds it. Your job is to outlast it. Set a timer for ten minutes and watch the wave do what waves do. You do not have to feel good. You only have to not deposit until it drops.',
    action: 'The next time an urge hits, start a ten-minute timer before you do anything else.',
    playId: 'urge-surfing',
  },
  {
    id: 'loss-chasing',
    day: 2,
    title: 'The math that dug the hole',
    body: 'Somewhere in your head there is a number: what you are down. Next to it, a plan - the parlay or the hot week that wins it back. That arithmetic has a name. Loss chasing. It is the behavior that separates a bad month from a wrecked year. Chasing changes how you bet: bigger stakes, worse spots, live bets you never planned, deposits you swore off. Think back over your worst nights. The big losses did not come from the first bet of the night. They came from the bets after it, each one trying to fix the last. The money already lost is spent, the same as money spent on anything. The only thing left to lose is the next deposit. The betting companies know the win-it-back plan better than you do. It is their most reliable product.',
    action: 'Write the total you are down on paper once, so the number stops living in your head.',
    freeAction: 'Write down one thing next month\'s money is going to, and put the note where you will see it.',
    playId: 'the-chase',
  },
  {
    id: 'money-friction',
    day: 3,
    title: 'Put the friction back',
    body: 'Right now you have more motivation than you will have next week. That is not about character, it is how motivation works: highest in the first few days, fading after. So spend it on things an urge cannot undo. Today. Delete every betting app. Ask your bank about blocking gambling transactions - some can do it from their app. Move the money that matters, rent and the card payment, somewhere that takes a day or a second signature to reach. Day 1 was about outlasting an urge. An urge wants the bet now, and a barrier that takes twenty-four hours to cross turns now into tomorrow. That is the entire strategy: not willpower at midnight, fences at noon. The betting companies spent years making deposits frictionless - one tap, saved card, instant. Every piece of friction you add today is aimed straight back at that.',
    action: 'Delete every betting app from your phone before tonight.',
    playId: 'block-the-apps',
  },
  {
    id: 'wired-and-sleepless',
    day: 4,
    title: 'Wired, irritable, not sleeping',
    body: 'If you feel wired this week - short fuse, restless legs, awake at 2 a.m. - nothing has gone wrong. Restlessness and irritability when cutting back are so typical that clinicians use them as a marker of gambling problems. Betting kept you running hot. Every game a sweat, every night a swing, a result always pending. Take that away and things can run rough for a while. Many people describe sleeping badly for a while after they stop, too. The danger is not the feeling, it is the story attached to it: I feel worse, so quitting is not working. Read it the other way. This is what stopping something that filled every evening can feel like, and for many people it tends to ease. Bad sleep now is not a verdict. It is part of the adjustment, and it tends to pass.',
    action: 'Charge your phone outside the bedroom tonight.',
    playId: '',
  },
  {
    id: 'make-it-official',
    day: 5,
    title: 'A ban they have to honor',
    body: 'Day 3 was fences you built yourself. Today is fences with paperwork behind them. Every licensed betting company has self-exclusion, usually buried in settings under responsible gambling. You pick a period, the account closes, and the betting company is required to keep it closed. Many states run their own programs that cover every licensed betting company at once - one form instead of six. Blocking software works at the device level; BetBlocker is free and covers thousands of gambling sites and apps. Sign up on a calm afternoon, precisely so midnight-you, mid-urge, hits a wall instead of a login screen. None of this is an admission. It is an accurate read of the schedule: the resolve you feel in week one is real, and it is also at its peak. Convert some of it into something that cannot fade.',
    action: 'Start self-exclusion today on the betting app you used most, and pick the longest period you can commit to.',
    playId: 'self-exclusion',
  },
  {
    id: 'halt-check',
    day: 6,
    title: 'HALT: the ten-second scan',
    body: 'The urges have changed shape by now. The early ones ran on a schedule: game time, payday, the usual couch hour. This week\'s version is sneakier. It starts in the body and then invents a reason. You are not suddenly interested in a Tuesday night game because the matchup is good. You are hungry, angry, lonely, or tired, and the urge arrived wearing a betting slip. The check is called HALT and it takes ten seconds. Before acting on any urge, ask which of the four you are. Hungry: eat first, decide after. Angry: a bet has never once settled an argument. Lonely: text someone; tomorrow covers who. Tired: bed beats any bet. HALT does not kill the urge. It names the supplier. An urge with its real cause named is a smaller thing to outlast.',
    action: 'Write HALT on a sticky note and stick it where the urges usually find you.',
    playId: 'urge-surfing',
  },
  {
    id: 'tell-one-person',
    day: 7,
    title: 'One person, not an announcement',
    body: 'The losses compounded because nobody knew. That is not an accusation, it is mechanics. A problem nobody can see is a problem nobody can interrupt, and every deposit happened quietly because quiet is where this runs best. One week in, you have something plain to say: seven days, apps gone, money moved. Tell one person. Not a group, not a post, not a family meeting. One named person, one plain sentence: \'I was betting more than I could afford. I stopped a week ago. I wanted one person to know.\' You are not asking to be policed. You are removing the condition that let the losses compound, which is secrecy. The sentence is heavier to say than it is to hear. Once it is out, week two weighs less, because you are no longer carrying this alone and in silence.',
    action: 'Send the opening message today: \'Got a minute this week? There is something I want to tell you.\'',
    partnerText: 'Got a minute this week? There is something I want to tell you.',
    playId: '',
  },
  {
    id: 'boredom-new-opponent',
    day: 8,
    title: 'Boredom is the new opponent',
    body: 'The first week ran on adrenaline. The decision, the deleted apps, the blocked cards - quitting was an event, and events carry you. That energy fades right about now. What replaces it is a flat Tuesday at 9pm with nothing on. The week-two bet does not need a crisis. It needs an evening like that. Betting made every evening mean something because money was riding on it, and the betting companies aim their push notifications at those hours. So rename the risk before you feel it. The flatness is not a sign that quitting is failing. It is the gap where betting used to sit, and it closes with time. For now, treat a bored evening as the most dangerous hour of your week, and plan it like one.',
    action: 'Tonight, when the flat feeling shows up, write down the time it hit.',
    playId: 'urge-surfing',
  },
  {
    id: 'hours-you-got-back',
    day: 9,
    title: 'The hours you got back',
    body: 'The app\'s ledger counted money. It never counted time. Think about how much of a normal day the habit claimed. Mornings, lunch breaks, whole evenings spent tracking games that only mattered because money was riding on them. Added up, betting was a part-time job that cost you money instead of paying you. Those hours are back now, and unplanned hours are the risk: empty evenings drift toward the old routine, because the routine is still the easiest path on your phone. The fix this week is not a new hobby or a rebuilt life. It is scheduling. An evening with a specific job - gym at seven, a show at nine, a call at ten - is occupied ground. An evening labeled \'whatever\' is an open slot.',
    action: 'Write down what tonight\'s hours between dinner and bed are for, with start times.',
    playId: '',
  },
  {
    id: 'watching-clean',
    day: 10,
    title: 'Watching games without a bet',
    body: 'A game with no money on it can feel like nothing is happening. That is not because sports got worse. Betting retrained what you watched for. You were not watching the game - you were watching your number: the spread, the live line, the parlay leg still alive. Take the wager away and the game can feel flat, because the thing you learned to track is gone. Nobody warns sports bettors about this, and it matters, because sports are probably not leaving your life. Two things help. The flatness tends to fade - many people find that caring about the game itself comes back over weeks of clean watching, not days. And skipping games is allowed. You are not obligated to sit through every prime-time matchup as a test. Watch with people when you can. Alone with your phone is the version that ends in a betting app.',
    action: 'Pick one game this week to watch with someone, and pick one to skip entirely.',
    playId: 'watching-with-friends',
  },
  {
    id: 'what-a-lapse-is',
    day: 11,
    title: 'What a lapse is and is not',
    body: 'Define it now, while it is theoretical. A lapse is a bet. An event with a date and an amount. That is the entire definition. It is not proof you cannot stop, not a cancellation of the last ten days, and not a verdict on you. Research on quitting - gambling included - finds lapses are common on the way out, and that what a person believes a lapse means has a lot to do with what happens next. Read a slip as information - what state you were in, which fence failed, what needs patching - and it stays one event. Read it as proof of who you are, and it tends to become a night. This is not permission to bet. It is a definition, installed early, because definitions written at midnight after a loss are always wrong. Tomorrow: the exact plan for that first hour.',
    action: 'Text your person one line today: if I ever slip, I will tell you the same day.',
    partnerText: 'If I ever slip, I will tell you the same day.',
    playId: '',
  },
  {
    id: 'first-hour-after-slip',
    day: 12,
    title: 'The first hour after a slip',
    body: 'One bet turns into a bad night through one thought: already blown it, might as well. Researchers call this the abstinence violation effect. The slip feels like it ruined everything, so the whole night gets written off, and writing the night off is what does the real damage - the first bet costs fifty, the chase after it costs the month. So the first hour after a slip runs on a plan written today, while you are calm, not improvised at midnight with adrenaline up and money down. Three steps. Stop: no topping up the account, no getting it back tonight - that is the arithmetic that dug the hole. Tell your person: one text, same hour, because a secret slip is the one that grows. Move: away from the phone, out of the room, out of the apartment if it comes to that.',
    action: 'Create a phone note titled \'If I slip\' and write the three steps in it now.',
    playId: 'the-chase',
  },
  {
    id: 'cut-the-feed',
    day: 13,
    title: 'Cut the feed',
    body: 'Some habits look like being a fan and are actually betting with the last step removed. Following picks accounts. Checking a line on a game you have no money on. The odds toggle still on in your score app. Reading slips in the group chat, and the itch to post one. None of these is a bet. All of them are the pre-bet routine still running on schedule, keeping the numbers in your head current so a bet stays one tap from ready. In week two, this feed is what reopens the door - not an urge out of nowhere, but a piece of information built to create one. The line moved. The boost expires tonight. Your buddy\'s five-leg parlay hit. Cutting the feed is not dramatic. Mute is a setting, not an announcement, and unfollowing takes two taps.',
    action: 'Unfollow the picks accounts and mute the chat where slips get posted.',
    playId: 'group-chat',
  },
  {
    id: 'two-weeks-money-kept',
    day: 14,
    title: 'Two weeks, in money kept',
    body: 'Fourteen days. Count it in the only currency that does not lie: money that stayed. Open your old statements and find what a typical two weeks of betting cost you - deposits minus withdrawals, not wins remembered. Whatever that number is, you are holding it right now. That is the milestone, not the streak. A streak can break; money kept stays kept, lapse or no lapse. Now give it a destination, because cash sitting loose in checking is cash the next urge can reach in two taps. Move it today: a separate account, a payment against the card, the thing betting kept postponing. And know that the betting companies mark this calendar too - win-back offers tend to arrive once deposits stop. Two weeks of silence from you reads, to them, as a retention problem. Keep it that way.',
    action: 'Find what two weeks of betting used to cost you and move that amount somewhere harder to reach today.',
    playId: 'payday-plan',
  },
  {
    id: 'gamblers-fallacy',
    day: 15,
    title: 'Nothing is ever due',
    body: 'Five losses in a row feels like it means something. It feels like a win is due. It is not. The next game does not know about your last five. Each bet stands alone, the way each coin flip stands alone. A coin that lands tails ten straight is not building toward heads. A team that failed to cover four straight is not owed a cover. Statisticians call this the gambler\'s fallacy: treating independent events as if they were connected. \'Due\' is the belief that funded the chasing - the idea that enough bets, stacked fast enough, had to turn. They did not have to. They never do. This week is about the math they used on you. Start with the load-bearing error: nothing is ever due, because no game remembers the one before it.',
    action: 'Write it on a note where you will see it tonight: nothing is due.',
    playId: 'the-chase',
  },
  {
    id: 'knowing-ball',
    day: 16,
    title: 'Knowing the sport is not enough',
    body: 'Picking a side feels like skill. You know the injury report, the rest days, the matchup history. That knowledge feels like an advantage. The problem is that the odds already have all of it priced in. Oddsmakers price in everything you know and plenty you do not, then sharpen the number as money arrives. Whatever you knew, the market had it first, and the price moved. Psychologists call the feeling the illusion of control: add choice and involvement to a chance outcome, and people start treating it as a skill they hold. It matters more for sports bettors than anyone, because it is the belief that says this is not gambling, this is analysis. In a 2024 study of more than 700,000 US online gamblers, only 4% made money. Knowing ball was never the missing piece. The price was.',
    action: 'Tell your person about one lock you were sure of that lost anyway.',
    freeAction: 'If your score app has a setting to show odds or betting content, switch it off.',
    playId: 'real-odds',
  },
  {
    id: 'the-vig',
    day: 17,
    title: 'The fee never loses',
    body: 'The standard price is -110 on both sides. Bet 110 to win 100, whichever side you take. The extra 10 is the vig: the betting company\'s fee for taking your bet. It looks small. It decides everything. At -110 you need to win about 52.4 percent of your bets just to break even. Not to profit - to break even. Go exactly 5-5 on ten 110-dollar bets and you collect 500, pay 550, and walk away down 50 for picking as well as a coin. That is the machine. You were not losing because the reads were bad. Every ticket carried a fee, the fee was built into the price whether the ticket won or lost, and over hundreds of bets the fee is the house. It never has a bad week. It is the one thing on the board that cannot lose.',
    action: 'Run the 5-5 math once on your phone calculator: five wins at 100, five losses at 110.',
    freeAction: 'Look up whether your bank or card offers a gambling block, and note where the setting lives.',
    playId: 'real-odds',
  },
  {
    id: 'parlay-math',
    day: 18,
    title: 'A parlay is the vig, multiplied',
    body: 'A straight bet carries one fee. A parlay stacks several bets into one ticket, and every leg carries its own fee. The fees compound. That is the product. Two coin-flip games parlayed together pay +260 at most betting companies. Fair odds would be +300. The gap is the betting company\'s take, and it widens with every leg you add. This is why parlays get the ads, the boosts, and the push notifications: state revenue reports show the companies keep a far larger share of parlay money than straight-bet money, and same-game parlays are among the most profitable products they sell. Nobody promotes that hard at their own expense. A ten-leg parlay is not a lottery ticket with better odds. It is the vig taken ten times, from the same ticket, before kickoff. The longer the slip, the bigger their cut.',
    action: 'Write the two-leg gap on a note: fair pays 300, the betting company pays 260, the 40 is theirs.',
    freeAction: 'Turn off notifications from any sports app that sends you boosts or promos.',
    playId: 'real-odds',
  },
  {
    id: 'free-bets',
    day: 19,
    title: 'Free bets are not free',
    body: 'The win-back emails tend to arrive around now. A boost. A bonus bet. Fifty free, no deposit needed. Read the terms instead of the subject line. A bonus bet does not return the stake: win an even-money wager with a 100-dollar bonus bet and you get 100 back, not 200, so on a bet like that the \'free\' 100 is worth about half its face value. Deposit matches come with playthrough rules - wager the money several times over before you can withdraw a dollar. And the timing is not luck. The betting companies aim reactivation offers at accounts that have gone quiet, because winning back a lapsed customer costs less than finding a new one. That is what your silence looks like from their side: revenue that stopped. The email is not a gift. It is the price of you, printed in small type.',
    action: 'Unsubscribe from every betting company\'s emails today, then block the senders.',
    playId: 'block-the-apps',
  },
  {
    id: 'near-miss',
    day: 20,
    title: 'A near miss is still a loss',
    body: 'The cover dies on a meaningless free throw. The last leg of the parlay loses by a point. Lost by one feels different from lost by twenty, and there is a reason. In lab studies of gambling, near misses activated some of the same reward circuitry as wins and increased the urge to keep playing. Losing narrowly can feel like almost winning, and almost winning says go again. Sports betting manufactures near misses at scale: the point spread is built to make both sides a near coin flip, so narrow losses are constant. Every one of them feels like evidence that you nearly had it. You did not have it. A one-point loss and a twenty-point loss paid the same amount: nothing. Close is a feeling. The balance does not have a column for it.',
    action: 'Tell your person your worst bad beat today, and end the story with what it paid: nothing.',
    freeAction: 'Send your person a one-line check-in today, even if nothing happened.',
    partnerText: 'Quick check-in: still going, still on plan.',
    playId: 'the-chase',
  },
  {
    id: 'wins-remembered',
    day: 21,
    title: 'Your memory is a bad bookkeeper',
    body: 'Try to name your last ten losses. They blur. Your biggest wins would come back without trying, probably to the dollar. That gap is not a character flaw, it is how memory works: a big win is vivid and rare, the losses were small and constant, and the mind keeps the highlight and drops the drip. So the record in your head is not a record. It is an ad, edited by the same bias the group chat runs on - winning slips get posted, torn tickets do not. Your nostalgia is the last salesman the betting company still has in the building. There is one honest ledger: the account history. Deposits in, withdrawals out, dated and totaled. That number is what betting actually did, and it is the number to reach for whenever the remembered win starts talking.',
    action: 'Search your banking app for the betting company\'s name and write down the 12-month deposit total.',
    freeAction: 'Set up one automatic transfer to savings for the day after payday, even a small one.',
    playId: 'group-chat',
  },
  {
    id: 'widen-the-circle',
    day: 22,
    title: 'Widen the circle',
    body: 'Three weeks ago one person learned where the money went, and that one conversation carried more than expected. Today\'s move is adding structure while nothing is on fire. Help chosen in a calm week gets picked on its merits; help grabbed mid-crisis is whatever answers the phone. The options are plain: a Gamblers Anonymous meeting, an online group of ex-bettors, a counselor who knows gambling. These are tools, the same category as the app blocker, not verdicts on how bad it got. Walking into a meeting certifies exactly one thing - that you want the kept money to stay kept. Many people wait until a blown weekend forces the call. Setting it up in a quiet week means the support exists before the night it is needed. One person was the start, not the whole structure.',
    action: 'Look up one meeting, group, or counselor and put its next session time in your calendar.',
    playId: '',
  },
  {
    id: 'confidence-trap',
    day: 23,
    title: 'Feeling cured is the trap',
    body: 'Somewhere around week three a quiet thought arrives: this is handled. Urges are down, the apps are gone, the worst nights are behind. The feeling is real. It is also a classic setup for a return bet - not stress, confidence. The first thing feeling cured dismantles is the fences. The blocker comes off because it is annoying. A card gets unfrozen for convenience. The exclusion starts to look excessive. Then a boost email lands on a flat Tuesday and the friction that would have bought twenty minutes is gone. The barriers were never a measure of how bad it was. They are a measure of how good the betting company\'s re-entry machine is, and that machine has not changed since day one. The rule: the fences stay up longest exactly when they feel least necessary.',
    action: 'Open your blocker and exclusion settings and check every one is still switched on.',
    playId: 'block-the-apps',
  },
  {
    id: 'their-calendar',
    day: 24,
    title: 'Their calendar has circles on it',
    body: 'The sports calendar has dates circled on it, and the same dates are circled inside the betting companies. Season openers. Playoff rounds. The Super Bowl. March Madness. Around those dates the ads surge, the boosts get bigger, and quiet accounts get the warmest emails of the year, because the betting companies know casual money moves on big games. A vague plan to not bet does not survive contact with a specific Sunday. A named date can be planned for. Know which event is next. Decide now where you will watch it, and with whom, and expect the promos to arrive right on schedule. The game is still yours to watch clean. The days around it belong to their marketing department until you claim them back, one event at a time.',
    action: 'Write down the next big game date and where you will watch it.',
    playId: 'watching-with-friends',
  },
  {
    id: 'who-the-opponent-is',
    day: 25,
    title: 'Who the opponent actually is',
    body: 'The betting companies are not neutral platforms that happen to profit when customers lose. The revenue is concentrated: a small share of accounts, the ones losing the most, supplies a large share of the money. Inside the company those accounts get a name - VIPs - and staff assigned to keep them active with personal hosts, tailored bonuses, and credit toward the next deposit. If your deposits climbed and the perks climbed with them, you were not slipping through their system unnoticed. You were the system working as designed. The responsible-gambling messages sit beside this machinery, written by companies whose results depend on the advice not landing. Seeing this clearly is not about reopening anger for its own sake. It is about aiming it correctly: at an industry built to find the heaviest losers and keep them.',
    action: 'Unsubscribe from the betting companies\' emails and block the senders.',
    playId: 'self-exclusion',
  },
  {
    id: 'i-dont-bet',
    day: 26,
    title: 'I don\'t bet',
    body: 'There are two ways to turn down the same bet. \'I can\'t\' keeps the bettor alive and holds you back with a rule, so every invitation becomes a negotiation, and negotiations get lost on tired nights. \'I don\'t\' ends the conversation, including the one in your own head. Someone who does not bet is not resisting anything when the group chat posts a slip; there is nothing to resist. This is not wordplay. Research on refusal suggests that framing a choice as identity rather than restriction holds up better under pressure, and ordinary life agrees - nobody wears down a vegetarian by offering ribs a second time. Twenty-five days of kept money is enough of a record to say it plainly. Not \'I\'m trying to stop.\' Not \'I can\'t.\' Just: \'I don\'t bet.\'',
    action: 'Say \'I don\'t bet\' out loud once today so the words are ready when someone asks.',
    playId: 'group-chat',
  },
  {
    id: 'the-long-game',
    day: 27,
    title: 'The long game',
    body: 'Here is the honest map for months two through six. Urges do not vanish on a schedule. Many people find they thin out - further apart, shorter, weaker - and a strong one can still land in month three, often near a big game or a bad week. That is not evidence of failure. It is how an old habit loosens, slowly. So measure progress in real units: money still in your account, evenings that belonged to you, mornings without a score you had money on. The streak counter is a fine tool and a bad master. It turns one slip into the loss of everything counted, and that arithmetic is the betting companies\' favorite kind. Nothing erases twenty-six days of kept money. It went to rent, to debt, to nothing in particular - and none of it went to a betting company.',
    action: 'Write down the total you kept this month and one thing it covered.',
    playId: 'urge-surfing',
  },
  {
    id: 'day-29-exists',
    day: 28,
    title: 'Day 29 exists',
    body: 'Twenty-eight days is not a graduation, because there is nothing to graduate from. What four weeks actually built: the apps are blocked, the money moves slowly, one person knows, the pricing is visible, the urge has a known shape. That is infrastructure. It all stays up. The betting companies are patient in a way no single month can outlast - the win-back emails will still be arriving in month six, next season starts on schedule, and the betting companies will hold the door open for as long as the company exists. Their model counts on the fences coming down eventually. So they do not come down. The person stays told, the blocks stay on, the payday routine keeps running. Day 28 was never the point. The point is that day 29 looks like day 28, and then day 30 does. Tomorrow, same plan.',
    action: 'Message your person: four weeks done, nothing changes tomorrow.',
    partnerText: 'Four weeks done. Nothing changes tomorrow.',
    playId: 'payday-plan',
  },
];
