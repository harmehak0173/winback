# Winback test plan

How Winback is tested before a release, what is automated, and what still
needs a person and a phone. Cases are numbered by flow (F01...) and kind:
H happy path, E edge case, N negative case.

## Run it

| Command | What it checks | Time |
| --- | --- | --- |
| `npx tsc --noEmit` | types | ~20 s |
| `npm run lint` | lint, including the React hooks and compiler rules | ~30 s |
| `npm test` | unit tests (jest-expo): restore, sign-in, storage, usage data, helplines, content, your reasons | ~10 s |
| `npm run check:copy -- --all-docs` | copy rules, and the reminder engine over 3 time zones | ~60 s |
| `npm run test:sql` | database grants, row-level security and the retention job, on an in-memory Postgres | ~15 s |
| `npm run test:e2e` | builds the offline web export, then the Playwright suite | ~3 min |

The end-to-end suite runs against a web export built with no backend keys
(`scripts/e2e-build.mjs` fails the build if any live key is inlined). Every
test blocks requests that leave 127.0.0.1 and fails if one is attempted,
fails on console or page errors, and runs an axe WCAG 2.2 A/AA scan on each
screen it visits (critical and serious findings fail the test).

## Automated cases (Playwright, e2e/)

| Case | What | Result |
| --- | --- | --- |
| F01-H1 | Welcome, consent, 10 questions, interlude, 3 reveals, commit, reminders, Home | pass |
| F01-E1 | Back on a question goes back and keeps the answer | pass |
| F02-H1 | Panic opens from Home and closes back to it | pass |
| F02-E1 | A double tap opens one panic screen, not two | pass |
| F02-H2 | "About to switch off a block?" logs the moment once, on a tap | pass |
| F02-N1 | A link opened straight on the block card logs nothing | pass |
| F02-H3 | The panic screen links to the helpline directory | pass |
| F02-H4 | Your own reasons, saved in You, show on the panic screen in your words and stay on the phone | pass |
| F03-H1 | A slip resets the count, keeps the best streak and banks the money | pass |
| F04-H1 | The partner-lock task opens next; its link leads to the partner fields | pass |
| F04-H2 | Marking a line done counts it and opens the next | pass |
| F05-H1 | You shows the helpline directory link, peer support and labelled fields | pass |
| F06-H1 | The comeback week shows its lines and peer support | pass |
| F07-H1 | The privacy and terms pages render | pass |
| F08-H3 | The hosted support, privacy, terms and deletion pages render | pass |
| F08-H5 | A "Save my progress" confirmation link leaves no token in the address bar and says what happened | pass |

Axe scans: Welcome, quiz, reveal, commit, panic, slip, Cut the lines, You,
comeback, privacy, terms, and the hosted support, privacy, terms and
deletion pages.

## Unit cases (jest-expo, __tests__/)

95 tests. The ones that guard a past failure: a failed restore is never read
as an empty account; an unread sign-in does not survive a relaunch; a failed
storage read never shrinks urges ridden out, the trigger log or the panic
history; usage data never switches itself back on; helpline labels carry
region, cost and hours; Android is placed by its first language. Your own
reasons are cleaned before they are kept and reported as saved only when the
phone kept them. A failed refresh or keychain read never replaces the
account; a lost sign-in-marker clear is retried; game-day search tells a
refused key from no match, and the build gate refuses a free key; hold to
commit commits on an accessibility tap; Save your progress says saved,
pending or not saved.

## Manual, on a phone

These cannot be automated from this machine: push notifications arriving,
the store purchase sheets, Face ID / fingerprint app lock, VoiceOver and
TalkBack, Dynamic Type at the largest sizes, the Android widget, the
partner-lock menu names on iOS 26/27 and Android 17, sign-in email codes,
and account deletion against the real backend. Check them on real
devices before each release.

## Bugs found by the suite (2026-10-27)

| ID | Sev | Bug | Fix |
| --- | --- | --- | --- |
| B1 | S3 | Radios, checkboxes and expanders had no checked/expanded state on the web build: React Native Web drops `accessibilityState` | All 21 uses moved to `aria-*` props (the same state on a phone) |
| B2 | S3 | Welcome's "Sign in" was a text-high target (about 20px; hitSlop does not count) | 44pt target, like the links beside it |
| B3 | S3 | The reminder time stepper nested buttons inside an adjustable control and exposed no value | One adjustable with min, max, value and text; the minus/plus are touch-only |
| B4 | S4 | A helpline row's lines ran together as text, so its spoken name could not be matched to its words | Each line ends in a space |
| B5 | S4 | Three switch-style toggles were named differently from their words ("Voice guide" for "Mute voice") | Buttons named by their visible text |
| B6 | S4 | The web build logged a BackHandler error on every launch and question | Hardware back registered on Android only |

Known and accepted: the web export pre-renders each route without its query
string, so `/legal?doc=terms` and `/panic?moment=block` log a React hydration
error on load and re-render. Web only; the phone apps do not pre-render.
