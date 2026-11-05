# Contributing

Thank you for helping. Contributions are accepted under the MIT license, the
same as the project (no separate agreement to sign).

## Set up

```sh
npm ci
```

The app runs with no accounts: see the README.

## Before a pull request

Run every check and make sure each passes:

```sh
npx tsc --noEmit
npm run lint
npm test
npm run check:copy -- --all-docs
npm run test:sql
npm run test:e2e
```

## Writing rules

The people using Winback may be in a hard moment. Every word in the app and
the docs follows these rules, and `npm run check:copy` enforces most of them:

- Plain hyphens only: no en or em dashes.
- Say "the betting companies".
- Never use: "the books", "sportsbook", "addict" or "addicts", "brain",
  "dopamine", "rewire", "wiring", "nervous system".
- No medical claims, and no shame.

## Safety data

Changes to helplines, self-exclusion programs or peer support groups need an
official source for every entry. Read [SAFETY.md](SAFETY.md) first.
