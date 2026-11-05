# Handoff: Winback - Onboarding, Home & Panic (Instrument design system)

## Overview
Winback is a phone app that helps adults quit sports betting. Positioning: **"Keep the game. Lose the bets."** This package covers the full first-run experience - a 10-question diagnostic quiz, an animated cost-reveal sequence, a commitment moment, a conditional safety interstitial, and the paywall - followed by the core app: the **Home** screen (live streak + money counters) and the **Panic** screen (breathing exercise, urge timer, "your reasons" card).

All screens follow the **Instrument** visual direction: near-black, one ember accent, data read like a precision instrument (Whoop/Strava-adjacent, deliberately *not* coded like a betting app - no casino green, neon, odds-board type, or money-rain).

## About the Design Files
The files in this bundle are **design references created in HTML** - prototypes showing intended look and behavior, **not** production code to copy directly. The task is to **recreate these designs in the target codebase's environment**. For a native iOS app this means **SwiftUI** (recommended) using the app's own components, navigation, and state patterns. Treat the HTML/React-style logic as a behavior spec, not shippable code. Where the HTML uses web idioms (CSS animations, DOM), map them to the platform equivalent (SwiftUI `withAnimation`, `TimelineView`, `@State`).

## Fidelity
**High-fidelity.** Final colors, typography, spacing, copy, and interactions are specified. Recreate the UI pixel-accurately. Frame reference: **390 × 844 pt** (iPhone 14/15 logical size). Exact copy is authoritative - use it verbatim (it was written to precise tone rules: direct, second person, sports language, zero shame; the enemy is the betting companies, never the user). Where the shipped copy differs on purpose, the **Copy decisions log** at the end of this file records it; the copy quoted below is already the shipped wording.

---

## Design Tokens

### Color
| Token | Hex | Use |
|---|---|---|
| `bg` | `#0A0B0D` | App background (near-black) |
| `bg-deep` | `#050506` | Behind device / darkest |
| `surface` | `#131519` | Cards, option rows, inputs |
| `surface-warm` | `#1a120b` | Selected option / risk-zone card (ember-tinted) |
| `hairline` | `#20242B` | Card borders, dividers |
| `hairline-dim` | `#191C22` | Ring track, tab-bar top border |
| `accent` | `#FF8A3D` | Ember - the single accent (ring, CTAs, active states, key numbers) |
| `accent-dim` | `#8A6a45` | Muted ember (money decimals) |
| `text` | `#F2F3F5` | Primary text |
| `text-muted` | `#8A8F98` | Secondary text |
| `text-dim` | `#7a8089` | Labels, captions |
| `text-faint` | `#5c626b` | Inactive tabs, fine print |
| `on-accent` | `#0b0b0d` | Text/icons on ember fills |

Accent is used **sparingly** - one ember element per view is the rule. Everything else is greyscale.

### Typography
Two families only:
- **Archivo** - display, all numerals, headings, buttons, wordmark. Weights 600/700/800/900. Tight tracking on large sizes (`letter-spacing: -0.02em`).
- **Hanken Grotesk** - body copy, labels, option text, captions. Weights 400/500/600.

| Role | Font / weight | Size | Notes |
|---|---|---|---|
| Streak number | Archivo 800 | 88-104px | `tabular-nums`, line-height .9 |
| Money number | Archivo 800 | 44-66px | `tabular-nums` |
| Screen headline | Archivo 800 | 24-38px | line-height 1.1-1.25 |
| Live HH:MM:SS | Archivo 600 | 18-20px | accent, letter-spacing .14-.16em, `tabular-nums` |
| Body | Hanken Grotesk 400/500 | 14-16px | line-height 1.5-1.55 |
| Eyebrow label | Hanken Grotesk 600 | 11-12px | uppercase, letter-spacing .2-.32em, `text-dim` |
| Option row | Hanken Grotesk 500 | 16px | - |

Map to iOS: register both fonts (Google Fonts). If substituting system fonts, Archivo ≈ a tightly-tracked grotesk display; do **not** fall back to SF Pro rounded.

### Spacing, radius, shadow
- Screen horizontal padding: **26-30px** (26 default, 30 on emotional/reveal screens).
- Card padding: **18-22px**. Gap between stacked cards: **12-14px**.
- Radius: cards/buttons **16px**; large hero cards **20-22px**; option rows **16px**; pills/chips **full**; device screen **44px**.
- Buttons: full-width, **17px** vertical padding, radius 16, Archivo 700.
- Ring stroke width: 8-9px. Track `hairline-dim`, progress `accent`, `stroke-linecap: round`, rotated −90°.
- Device shadow: `0 50px 110px -35px rgba(0,0,0,.95)`.

---

## Screens / Views

### Global chrome
- **Status bar**: 46px tall, "9:41" left (Archivo 600, 15px), signal glyphs right. Dynamic-island pill (118×34, black) centered at top.
- **Tab bar** (Home & app screens only): 82px, `rgba(10,11,13,.94)` with `hairline-dim` top border. Four items - Home / Streak / Insights / You - 20px stroke icons + 10.5px label. Active item ember, others `text-faint`.

### 0 - Welcome
- **Purpose**: Set the frame, start the quiz.
- **Layout**: Full-height flex column, 32/30px padding. Wordmark top-left. Headline block vertically centered. Start button pinned bottom, tagline below.
- **Copy**: Headline "Let's see what betting has really taken from you." (Archivo 800, 34px). Sub "10 quick questions. No judgment. Takes about a minute." (`text-muted`, 16px). Button **Start** (ember). Footer "Keep the game. Lose the bets." (`text-faint`, 12px, centered).

### Quiz (Q1-Q10)
- **Purpose**: Diagnostic; every question answerable in one tap; rising emotional stakes; target < 90s to reveal.
- **Layout**: Fixed header (back chevron + progress bar + "Question N of 10" eyebrow), scrollable option list, optional Continue button pinned bottom (multi-select only).
- **Progress bar**: 6px track `hairline-dim`, fill `accent`, width = `(qi+1)/10`, `transition: width .3s`.
- **Option rows**: full-width buttons, `surface` bg, 1.5px `hairline` border, radius 16, 17×18px padding, 12px gap. **Selected**: bg `surface-warm`, border `accent`, plus a 22px ember circle with a check (`on-accent`) on the right.
- **Single-select** questions auto-advance ~260ms after tap. **Multi-select** questions (Q2 sports, Q5 triggers, Q7 cost) toggle and require **Continue** (disabled/greyed until ≥1 selected: bg `hairline`, text `text-faint`).
- **Q6 → Q7 conditional note**: if Q6 = "I stop for a while, but I always come back", show an ember-tinted callout above Q7's title: "That cycle isn't a willpower problem. The apps are built to pull you back. Winback is built to break the loop."
- **Exact questions & options**: see `winback-onboarding-quiz.md` in this bundle (authoritative source).

### Interlude - "Building your profile"
- ~3.3s auto-advancing. Spinner (70px, `hairline-dim` ring with ember top, 1s linear spin). Cycling text (Archivo 700, 19px) every ~1.05s: "Analyzing your betting pattern…" → "Adding up what goes to the betting companies…" → "Building your Winback plan…" → auto-navigate to Cost Reveal 1.

### Cost Reveal (3 screens - the emotional peak)
Driven by `monthly_spend` = midpoint of the Q4 range: `[Under $100→50, $100-500→300, $500-1,000→750, $1,000-2,500→1750, Over $2,500→3000]`.
1. **The number**: eyebrow "At your current pace"; animated counter rolling 0 → **yearly = monthly_spend × 12** (Archivo 900, 66px, ember, ~1.6s ease-out cubic); "is roughly what you deposit with the betting companies every year."; sub "Over the next five years, that's **$[monthly_spend × 60]**."
2. **The anchor**: one full-bleed line (Archivo 800, 38px) chosen by Q4 tier - Under $100 "That's a vacation. Every year. Gone." / $100-500 "That's a used car every three years." / $500-1,000 "That's rent. Months of it. Every year." / $1,000-2,500 "That's a house down payment this decade." / $2,500+ "That's a second income - paid to the betting companies."
3. **The flip**: "Here's the good news: every dollar of that is winnable back."; sub "Your Winback plan starts today. First milestone: 3 days clean. By **[Month Year, one year out]**, your counter could read **$[yearly]**."; a `surface` card previewing the **money-won-back** counter at $0.00 ticking up; if Q9 answered, a line "That's your [debt paid down / trip fund / investment account] - not their revenue." (omitted for "Just stopping the bleeding").
- Each reveal has an ember **Continue**.

### Commitment
- Centered "I'm done letting the betting companies win." (Archivo 900, 38px). Sub explains press-and-hold.
- **Hold-to-commit button**: `surface` with 1.5px ember border; on `pointerdown` an ember fill sweeps left→right over 1.3s (`width` 0→100%); completing fires commit. `pointerup`/`pointerleave` before completion resets. Fallback text button "or just tap - I'm in".
- Commit **sets quit date to now** (`quit_date`) and routes to Safety (if flagged) else Paywall.

### Safety interstitial (conditional)
- Shown **only** when Q7 includes "Savings or debt" **AND** Q8 = "Yes" (`hide_flag`, never surfaced back to the user otherwise). Shield glyph, headline "Quitting is harder when you're carrying it alone.", supportive body, a helpline card (Find A Helpline), "Free, confidential, 24/7." Single **Got it** button → Paywall. Helplines also live permanently in Settings and on the Panic screen.

### Paywall
- Header "Win it back." (Archivo 900, 32px). Sub "Try Winback Premium free for 3 days. Cancel anytime."
- Five benefit rows (ember check + text), two personalized: "Game-day protection for **[Q2 picks]**, scheduled automatically" and "Savings goal tracking toward **[Q9 answer]**".
- **Plan toggle**: two side-by-side cards. Yearly $29.99/yr, badge "Less than one losing bet" (default selected). Monthly $6.99/mo. Selected card gets the ember border.
- Pinned bottom: ember **Start my 3-day free trial**; always-visible underlined text link **Continue with the free version** (streak counter, panic button, helplines are free forever); fine print "Auto-renews. Cancel anytime in Settings." Both CTA paths route to Home.

### Home
- **Purpose**: Daily anchor - the two hero counters.
- **Layout**: scrollable column above the tab bar. Header (wordmark + tagline + settings gear). **Streak ring** (236px, ember arc; progress toward first 3-day milestone) with centered "DAYS CLEAN" eyebrow, big day count (Archivo 800, 88px), live HH:MM:SS (ember). **Money-won-back card** (`surface`) with share glyph, "$X.XX" (Archivo 800, 44px), sub "$[daily]/day you would've wagered - now yours" where daily = monthly_spend/30. Ember **I stayed clean today** button. Outlined **Feel an urge? Get through it** button with a slow ember pulse (`box-shadow` 2.4s) → Panic.
- Both counters tick live off `quit_date` (1s cadence).

### Panic
- **Purpose**: In-the-moment urge support. Reachable free, always.
- **Layout**: close (X) top-right → Home. Headline "The urge is here. Ride it out." Sub "Urges build, peak and pass. You don't have to beat this one, just outlast it." **Breathing animation**: 88px ember circle + soft radial halo, both `scale .8↔1.06 opacity .55↔1` over a **6s** ease-in-out loop (inhale/exhale). Below it a live "Riding it out · M:SS" timer counting up from entry. **Your reasons card** (`surface`): "You're doing this for **[Q7 selections, up to 3]**." + "And the money's going toward **[Q9 answer]** - not their revenue." **Helpline row**: phone glyph + "Talk to someone now / Find a helpline in your country". Ember **I'm past it** button → Home.

---

## Interactions & Behavior
- **Navigation**: single-stack state machine. Phases: `welcome → quiz(0..9) → interlude → reveal1 → reveal2 → reveal3 → commit → (safety?) → paywall → home ↔ panic`. Back chevron only within the quiz.
- **Auto-advance**: single-select quiz taps advance after 260ms (gives selection feedback). Interlude auto-advances after 3.3s.
- **Animated counter** (reveal 1): 0 → yearly, cubic ease-out, ~1.6s, `tabular-nums` to prevent width jitter.
- **Hold-to-commit**: 1.3s fill; cancel on release before full.
- **Live counters**: 1s tick; streak = floor(elapsed since quit_date), money = elapsed_days × daily_rate.
- **Breathing loop** & **panic timer** start on entering Panic.
- Buttons: subtle `border-color`/`background` transitions (.15s); no bouncy/springy motion - the brand is calm.

## State Management
Captured for personalization (persist locally; sync if there's a backend):
- `monthly_spend` (Q4 midpoint) - drives cost reveal, daily save rate, savings goal.
- `sports[]` (Q2) - game-day mode + paywall personalization.
- `triggers[]` (Q5) - notification timing + trigger insights.
- `goal` (Q9) - savings goal feature + reveal/panic/paywall copy.
- `baseline_streak` (Q10) - first-milestone calibration.
- `hide_flag` (Q7 debt + Q8 "Yes") - shows the safety interstitial once; **never surfaced back to the user**.
- `quit_date` - set at commit; source of both live counters.
- `plan` - yearly | monthly (paywall selection).

Runtime UI state: current phase, quiz index, selected answers, reveal-counter value, hold progress, interlude line, live clock tick, panic start time.

## Assets
- **Fonts**: Archivo & Hanken Grotesk (Google Fonts) - bundle for offline/iOS.
- **Icons**: simple 2px-stroke line icons drawn inline (home, flame, bars, user, share, phone, shield, gear, chevron, check, X). Replace with the codebase's icon set (SF Symbols equivalents: `house`, `flame`, `chart.bar`, `person`, `square.and.arrow.up`, `phone`, `shield`, `gearshape`, `chevron.left`, `checkmark`, `xmark`).
- No photography or third-party imagery. No logos beyond the Winback wordmark (text).

## Files
- The design tool's interactive prototypes are not published (there is no license to redistribute that tool's runtime). This README and the app itself are the reference.
- `winback-onboarding-quiz.md` - authoritative copy & question flow.

---

## Implementation deltas (shipping app vs this spec)

This spec is still authoritative for layout, palette, typography and tone. The
points below are places where the shipped app deliberately differs, each for a
store-compliance, accessibility, privacy or correctness reason. **Do not
"restore" them to match the spec** - several were rejection risks.

### Flow
- The spec's `commit -> (safety?) -> paywall -> home` is now
  `commit -> (safety) -> reminders-intro -> Home`. Every new account gets a
  7-day free week of Premium from the app, so there is no paywall in
  onboarding: asking for money for something the user already has is the wrong
  moment. The paywall opens from Home's free-week banner, from You ->
  Membership, and once when the free week ends - never over panic, a slip or
  the lock screen, and not within 10 minutes of a panic session.
- After the safety screen, Home offers the reminders screen instead of
  stacking it on top.
- `reminders-intro` is shown once, before the system notification prompt, and
  always continues to that prompt.

### Welcome
- The primary button is **Agree and start**, not Start, above a short consent
  notice: answers tied to a random ID, used only to run Winback, never sold or
  used for ads, the secrecy answer never leaves the phone, delete any time, and
  what usage data goes where (with the "Share usage data" state for the
  device's region). The quiz collects behavioural-health answers, so consent
  has to come before the first question.
- A fine-print line confirms 18+ and agreement to the Terms and Privacy
  Policy, with both as separate tappable links (a screen reader cannot reach a
  link nested inside a sentence).
- "Saved your progress before? Sign in" sits under the links: a reinstall is a
  clean anonymous start, so this is the way back.

### Commitment
- Before the hold button, while the free week has not started, the screen
  discloses it: "Your first 7 days of Premium are free. No card, no charge,
  nothing to cancel. After day 7, game-day check-ins, trigger insights, the
  full daily read and extra goals need a subscription - plans are shown before
  you pay. The panic button, helplines, your streak and daily close-outs stay
  free." plus the store's prices when the store has answered.

### Cost reveal
- Reveal 3's headline is "Here's the good news: from today, that money stays
  with you." (the spec's "every dollar of that is winnable back" promised
  money back that was already lost). The first milestone is one day clean.
- Reveal 2 adds a sourced line under the anchor: a published finding (more
  than 700,000 US online gamblers, UC San Diego, 2024), stated as the source
  states it.

### Paywall
- **Two tiers, no weekly.** Yearly and Monthly, stacked as full-width rows
  with radio selection, so the price and its annualised line stay readable at
  390pt and under large text. Yearly is first, preselected, and carries "BEST
  VALUE". The Monthly row also says what it comes to over a year ("$48 a year
  at this rate"). A weekly tier was dropped on purpose: a small price repeated
  every week is the shape of the spending this app exists to undo.
- **Prices come only from the store.** The spec's $29.99/yr and $6.99/mo are
  gone; prices live only in the store consoles (see HANDOFF.md). A production build shows no price until the RevenueCat offering loads,
  hides any tier the offering lacks, and disables buying with honest copy when
  purchases are unavailable. Placeholder prices exist only in development.
- **Benefits are the Premium split**, word for word the same as the store
  listing: "Game-day check-ins for the teams you follow", "Trigger insights -
  when and why urges hit, and your week against your quiz", "The full daily
  read, one short piece a day, plus every past read", "More than one goal for
  the money you keep". Then a quiet line naming what stays free.
- **No unconditional trial claim.** A store trial is only mentioned if the
  selected product actually carries one (none is configured). During the free
  week the sub-line says how many days are left and "Subscribing now starts
  your plan today."
- **Fuller fine print**: price, period, auto-renewal until cancelled, and the
  platform's own place to cancel. Terms, Privacy and Restore purchases are
  always present.
- "Feel an urge? Get through it" sits at the top of the paywall too, and the
  free path reads "Not now" during the free week.

### Home
- The settings gear and the share glyph are real controls (gear -> You tab,
  share -> system share sheet with days clean, never an amount).
- The money card is labelled "Kept from betting (estimated)". It is an
  estimate from the quiz, and the label says so.
- The check-in button closes out the day ("I stayed clean today", with a
  "Was it close?" path for a close call beaten). A closed day turns the button
  into a confirmation.
- Up to three contextual cards sit under the counters, in a fixed priority
  (comeback week, Today's play, the sleep rating, Cut the lines, Today's read
  or Today's move, a big-game plan, the daily rep). The goal bar sits with the
  money card.
- **The urge button is always on screen without a scroll.** The spec's order
  (ring, money card, check-in, urge) is kept whenever it fits. When it does
  not - an iPhone SE, the free-week banner, the goal bar with a checkpoint
  note, larger text - the urge button moves up one step at a time: first above
  the check-in, then directly under the ring. Home measures its own layout to
  choose (`URGE_SPOTS` in `src/app/(tabs)/index.tsx`), because the space
  depends on what is showing, not only on the screen size. On windows under
  700pt tall the ring is 184pt instead of 236pt and the money card is
  tighter. Help that needs a scroll to find is not "reachable, always".
- Animations honour Reduce Motion (the urge pulse and the milestone glow hold
  still; the breathing circle fades instead of scaling).

### Panic
- Headline "The urge is here. Ride it out." with the sub "Urges build, peak
  and pass. You don't have to beat this one, just outlast it." The spec's
  "usually in under 20 minutes" was an unsourced timing claim.
- The breathing guide has three patterns (calm, 4-7-8, box) and remembers the
  user's go-to; grounding is a second exercise. The bundled voice is
  pre-recorded and AI-generated, and a small caption "Voice is AI-generated"
  sits by the mute control.
- "I'm past it" logs an urge ridden out and can offer an opt-in "Still past
  it?" reminder after longer sessions.

### Streak and milestones
- Milestone blurbs describe behaviour and what many people report, hedged.
  The spec-era "rewiring" timeline and every physiological claim are gone.
- The calendar marks clean days (ember dot), close calls beaten (ember
  outline) and slips (neutral grey). A blank day is blank, never red and never
  "missed". Lifetime counts only go up.

### Helpline rows
- The name and the number sit on separate lines, and the number never wraps, so it is never split when
  read off to dial from another phone. One shared row
  (`src/components/HelplineRow.tsx`) is used on every screen that lists the
  lines. Lines that take texts offer both Call and Text; a device that cannot
  dial shows the number in an alert.

### Premium gating
- Gated on `isPremium` (a live store-verified subscription or an active free
  week, never the saved plan name): trigger insights, the full daily read and
  past reads, the recap's trigger-versus-prediction line, game-day team search
  and reminders, and goals beyond the first.
- Free forever: the streak and close-outs, the monthly streak freeze, the
  panic button with breathing and grounding, helplines, the slip flow and
  comeback week, Today's move, Today's play, Cut the lines, one goal, lights
  out, reps, the weekly recap, reminders, the playbook and the Android widget.

### Colour tokens (contrast)
- `text-dim` is `#80868F` (spec `#7a8089`), `text-faint` is `#7A8089` (spec
  `#5c626b`, 3.20:1), `accent-dim` is `#A07A50` (spec `#8A6a45`), and a new
  `finePrint` `#767C85` is used on the plain background only. Every text colour
  now meets 4.5:1 on `#0A0B0D`; the spec's greys were too dim for the
  subscription terms and the consent line. Source: `src/theme/tokens.ts`.

### Screens added after this spec
- Close-out (`/closeout`), Today's play (`/plan`), weekly recap (`/recap`),
  goal (`/goal`), Cut the lines (`/cut-lines`), comeback week (`/comeback`),
  lights out (`/lights-out`), daily rep (`/rep`), reminders intro
  (`/reminders-intro`), sign in by code (`/signin`), legal pages (`/legal`).
  They use the same tokens, type and one-ember rule. Their copy was written in
  the launch build under the house rules below, reviewed against them, and is
  checked by `npm run check:copy`.

---

## Copy decisions log

Intentional differences from the copy above, and the house rules they follow.
Record every future change here, with the reason.

House rules (all user-facing copy, notifications, docs and store text):
plain hyphens only; second person, calm, plain, sports language; the betting
companies are the opponent, never the user; no shame words; no unsourced
physiological or medical claims; no money amounts in any notification; in
discreet mode, no money, day count, team name or betting word on any lock
screen, widget or notification. `npm run check:copy` enforces the mechanical
parts.

| # | Where | Decision | Why |
|---|---|---|---|
| 1 | Everywhere (welcome, interlude, reveals, commit, curriculum, notifications, store copy) | Say **"the betting companies"** for the operators, "betting apps" for the apps on the phone, "betting" for the activity. The spec's bettor slang for the operators and the industry word for them are both gone | A deliberate decision, made twice: many people do not know the industry vocabulary, and the slang reads as insider talk. "Sports bettors", the people, stays |
| 2 | Welcome headline | Kept as **"Let's see what betting has really taken from you."** | The review suggested reframing "taken" as deposits. Kept on purpose as hero copy: "taken" is not only about money (time, sleep, attention), and the reveal that follows is framed as deposits. This is the one place the loss framing stays |
| 3 | Welcome button and consent | **"Agree and start"** with the consent notice, 18+ line and Terms / Privacy links, instead of "Start" | Explicit, in-context consent before behavioural-health answers are collected (GDPR special category data, US consumer health data laws) |
| 4 | Free week wording | Always **"free week of Premium"** ("Your first 7 days of Premium are free. No card, no charge."), never "trial" | It is granted by the app, not a store trial: no card and no automatic conversion. "Trial" would promise store-trial mechanics and reads like a charge is coming |
| 5 | Commit headline | "I'm done letting the betting companies win." | Rule 1 |
| 6 | Interlude line 2 | "Adding up what goes to the betting companies…" | Rule 1, and deposit framing rather than "taken" |
| 7 | Reveal 1 line | "is roughly what you deposit with the betting companies every year." | It is an estimate from the user's own answers; "roughly" and "deposit" say so |
| 8 | Reveal 3 headline | "Here's the good news: from today, that money stays with you." | "Winnable back" implied recovering past losses, which the app cannot do |
| 9 | Panic sub-headline | "Urges build, peak and pass. You don't have to beat this one, just outlast it." | The spec's timing claim was unsourced |
| 10 | Milestones | Behaviour and what many people report, hedged ("Many people say...", "For a lot of people...") | No physiological claims the app cannot back |
| 11 | Paywall benefits and the store listing | The four Premium lines, identical in the paywall, the store descriptions and the commit disclosure; game day is "Game-day check-ins for the teams you follow" | Store rules require the listing and the paywall to describe the same thing; the old "every game" promise was more than the schedule data supports |
| 12 | Money card label | "Kept from betting (estimated)" | The figure is an estimate; the old "won back" wording on Home sounded like a measurement |
| 13 | Panic voice caption | "Voice is AI-generated" | The voice is pre-recorded text-to-speech; the vendor requires disclosure, and people deserve to know |
| 14 | Wave B screens (close-out, plan, recap, goal, Cut the lines, comeback, lights out, reps, reminders intro, reminder lines) | New copy, written to the house rules, with no spec original. Slips are neutral ("You know the way back"), counts only go up, pushes never carry amounts, and discreet variants are neutral | Engagement features must never punish a slip or turn into a pressure mechanic |
| 15 | Statistics | "Of more than 700,000 US online gamblers in a 2024 UC San Diego study, only 4% made money": a published finding, with its source and scope on screen ("online gamblers", not sports bettors alone) | Taylor, McCarthy and Wilbur, MSI working paper (2024); UC San Diego release, 2024-07-23. The household figures in the playbook come from Baker and colleagues (2026) and Hollenbeck and colleagues (2025) |
