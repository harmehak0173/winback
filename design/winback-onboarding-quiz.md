# Winback — Onboarding Quiz (v1)

Goal: diagnostic feel, rising emotional stakes, ending in a personalized cost reveal that makes the paywall feel like the obvious next step. One question per screen, progress bar on top, everything answerable in one tap. Target: under 90 seconds to the reveal.

Tone rules: direct, second person, sports language, zero shame. Never call the user an addict or a loser. The enemy is always the sportsbooks, never the user.

---

## Screen 0 — Welcome
**Headline:** Let's see what the books have really taken from you.
**Sub:** 10 quick questions. No judgment. Takes about a minute.
**Button:** Start

## Q1 — Frequency
**How often do you bet?**
- Pretty much every day
- A few times a week
- Weekends and game days
- A few times a month

## Q2 — Sports (multi-select, powers game-day mode)
**What do you bet on?**
- NFL
- NBA
- NHL / MLB
- College football / basketball
- Soccer
- UFC / boxing
- Other

## Q3 — Style
**What's your usual play?**
- Parlays
- Straight bets / moneylines
- Live in-game bets
- Player props
- Whatever looks good that day
- Prediction markets / event contracts

## Q4 — Spend (feeds the cost reveal — the most important answer)
**In a typical month, how much do you deposit into betting apps?**
- Under $100
- $100 – $500
- $500 – $1,000
- $1,000 – $2,500
- Over $2,500
*(Store the midpoint of the selected range as `monthly_spend`; use $3,000 for the top bracket.)*

## Q5 — Triggers (multi-select, powers trigger heatmap + notification timing)
**When do you find yourself betting the most?**
- When my teams are playing
- Right after payday
- Late at night
- After a loss, trying to win it back
- When I'm bored
- When I'm stressed
- When I've been drinking

## Q6 — History
**Have you tried to stop or cut back before?**
- Never really tried
- Once or twice
- Many times
- I stop for a while, but I always come back
*(Copy note if last option selected, shown on next screen: "That cycle isn't a willpower problem. The apps are built to pull you back. Winback is built to break the loop.")*

## Q7 — Cost beyond money (multi-select)
**What has betting cost you besides money?**
- Sleep
- Focus at work
- Relationships
- Actually enjoying the games
- Savings or debt
- How I feel about myself
- Nothing yet — I want to stop before it does

## Q8 — Secrecy
**Do you keep your betting hidden from anyone?**
- Yes
- Sometimes
- No
*(If "Yes" AND "Savings or debt" in Q7: show a gentle interstitial after the quiz — see Safety interstitial below.)*

## Q9 — The goal (powers the savings goal feature)
**If that money stayed in your pocket, what would it go toward?**
- Paying off debt
- Saving for something big (trip, car, house)
- Investing it
- Just stopping the bleeding

## Q10 — Baseline
**What's the longest you've gone without a bet in the past year?**
- Less than a day
- A few days
- A week or two
- A month or more

## Interlude — "Building your profile"
3-second animated sequence: "Analyzing your betting pattern… Calculating what the books have taken… Building your Winback plan…"

---

## THE COST REVEAL (the emotional peak)

**Screen 1 — The number.**
Large animated counter rolling up to the yearly figure.
> **Headline:** At your current pace, the books take about **$[monthly_spend × 12]** from you every year.
> **Sub:** Over the next five years, that's **$[monthly_spend × 60]**.

**Screen 2 — The anchor.** Pick one comparison line by tier:
- Under $100/mo → "That's a vacation. Every year. Gone."
- $100–500/mo → "That's a used car every three years."
- $500–1,000/mo → "That's rent. Months of it. Every year."
- $1,000–2,500/mo → "That's a house down payment this decade."
- $2,500+/mo → "That's a second income — paid to the sportsbooks."

**Screen 3 — The flip.**
> **Headline:** Here's the good news: every dollar of that is winnable back.
> **Sub:** Your Winback plan starts today. First milestone: 3 days clean. By [date one year out], your counter could read **$[monthly_spend × 12]**.
Show a preview of the money-saved counter at $0.00, ticking.
If Q9 answered: "That's your [debt paid down / trip fund / investment account] — not their revenue."

**Screen 4 — Commitment.**
> **I'm done letting the books win.**
> Signature-style tap-and-hold to commit, or a simple "I'm in" button. Sets quit date to today.

---

## Safety interstitial (conditional, shown before paywall when Q7 includes debt + Q8 = Yes)
> Quitting is harder when you're carrying it alone. Winback will be with you every day — and if it ever feels like more than an app can help with, real people are ready to talk: Find A Helpline lists one in every country (findahelpline.com). Free, confidential, 24/7.
Single button: "Got it." Helpline access also lives permanently in Settings and on the Panic screen, outside the paywall.

---

## PAYWALL

**Header:** Win it back.
**Sub:** Try Winback Premium free for 3 days. Cancel anytime.

**Premium includes:**
- Game-day protection for your teams ([their Q2 picks], scheduled automatically)
- Trigger insights — see exactly when and why urges hit
- Savings goal tracking toward [their Q9 answer]
- Home-screen widget with your streak and money won back
- Streak freeze — one slip-up per month won't erase your progress

**Pricing (toggle):**
- Yearly: $29.99/year — badge: "Less than one losing bet"
- Monthly: $6.99/month

**Below the buttons, always visible:**
"Continue with the free version" (text link — streak counter, panic button, and helplines are free forever).

**Fine print:** Auto-renews. Cancel anytime in Settings.

---

## Data captured for personalization
`monthly_spend`, `sports[]` (game-day mode), `triggers[]` (notification timing + heatmap), `goal` (savings feature), `baseline_streak` (first milestone calibration), `hide_flag` (never surfaced back to the user; used only to show the safety interstitial once).

## A/B test queue (post-launch, via RevenueCat)
1. Yearly-first vs monthly-first pricing display
2. Cost reveal: yearly number vs five-year number as the headline
3. Commitment screen: signature vs button
4. Trial length: 3-day vs no trial with lower price
