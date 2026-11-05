# Winback

A phone app for adults who want to stop betting on sports. Keep the game.
Lose the bets.

Winback is open source under the MIT license. Nobody operates this copy: to
publish it, you set up your own accounts and your own legal details
([HANDOFF.md](HANDOFF.md)).

## What it does

- **The safety layer, free for good.** A panic button for an urge: breathing
  with a calm voice, grounding, an urge timer, your reasons in your own words,
  your person one tap away, and a link to find a helpline in your country.
  Help after a slip, with a comeback week. Step-by-step help to close betting
  accounts and join self-exclusion programs and bank blocks.
- **Premium (optional).** Game-day check-ins for the teams you follow,
  trigger insights and more. Every new account gets a free week of Premium
  with no card, and anyone can take 30 days on us when money is tight.
- **Nothing else on the phone changes.** No VPN, no filter, no blocker.

## Privacy

- Offline-first: the app works with no account and no network. Every backend
  call is skipped when its environment variables are missing.
- Anonymous by default. An email is needed only to keep progress on a new
  phone.
- "Share usage data" (in the You tab) can be switched off at any time, and
  it starts off in the EEA, the UK, Switzerland and Canada. While it is on,
  usage events go to the operator's own Supabase table, and a short
  allowlist of product events goes to PostHog if a PostHog key is set.
- What is stored where, and for how long: [docs/data-map.md](docs/data-map.md).

## Safety

Winback is a self-help tool, not medical care, and it does not replace
professional help. Instead of phone numbers, the help screens link to Find A
Helpline, a free directory of gambling helplines by country. The helpline and
self-exclusion data has to stay accurate: read [SAFETY.md](SAFETY.md) before
changing it or shipping the app.

## Run it

You need Node 22 and npm.

```sh
npm ci
npx expo start
```

With no `.env` the app runs on the phone only: no account, no purchases, no
analytics, and game-day check-ins use TheSportsDB's free test key. Copy
`.env.example` to `.env` to connect your own services. The app uses native
modules, so run it in a development build (`npx expo run:ios`,
`npx expo run:android`, or `eas build --profile development`), or on the web
with `npm run web`.

## Checks

| Command | What it checks |
| --- | --- |
| `npx tsc --noEmit` | Types |
| `npm run lint` | Lint |
| `npm test` | Unit and component tests (Jest) |
| `npm run check:copy -- --all-docs` | The copy rules and the reminder engine |
| `npm run test:sql` | The database schema and row-level security, on an in-memory Postgres |
| `npm run test:e2e` | End-to-end tests on an offline web build, with accessibility scans (Playwright) |

## Layout

- `src/app` screens (expo-router), `src/components`, `src/hooks`,
  `src/lib` logic, `src/state` app state, content and legal text,
  `src/theme`, `src/widgets` (the Android widget)
- `supabase/` the schema, migrations, SQL tests and the `delete-account`
  edge function
- `scripts/` the legal page generator, build checks and copy rules
- `__tests__/` and `e2e/` tests
- `design/` the design system and the onboarding quiz
- `docs/` the data map and the test plan

## The name

"Winback" may conflict with a pending US trademark application (serial
99309478). If you publish the app, choose and clear your own name and icon.

## License

MIT: see [LICENSE](LICENSE). Contributions are welcome:
[CONTRIBUTING.md](CONTRIBUTING.md). Security reports: [SECURITY.md](SECURITY.md).
