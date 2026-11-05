# Running your own Winback

Winback is handed over as is, and nobody operates this copy. This guide is
for an organization (a helpline, a nonprofit, a community) that wants to
publish it. Whoever publishes it becomes the operator: the legal controller
of its users' data, and responsible for the helpline data being right.

## 1. Accounts

| Service | What for | Needed |
| --- | --- | --- |
| Apple Developer Program and Google Play Console | Publishing | Yes |
| Expo (EAS) | Builds, store submission, over-the-air updates | Yes |
| Supabase | Anonymous accounts, sync to a new phone, account deletion, usage events | For accounts and sync; without it the app keeps everything on the phone |
| An email sender for Supabase Auth (custom SMTP) | Sign-in codes for "Save my progress" | With Supabase |
| TheSportsDB, paid key | Game-day check-ins | Production builds stop without one |
| RevenueCat | Premium purchases | Production builds require it unless you make everything free (section 6) |
| PostHog | Product analytics: an allowlist of usage events. "Share usage data" is on by default except in the EEA, the UK, Switzerland and Canada, and anyone can switch it off in You | Optional |
| A domain and a static host | The support, privacy, terms, consumer health data and account-deletion pages | Yes: the stores ask for them |

## 2. Your legal identity

1. In `src/state/legal.ts`, set `OPERATOR_NAME` and `CONTACT_EMAIL` (your
   privacy contact). Read the whole privacy policy and terms in that file and
   change whatever does not match how you run the app: the email provider,
   the regions, retention, and the governing law. The Terms say the app's
   content and design belong to the operator and give users a personal
   licence; the code is MIT, so adjust that section too.
2. Have a lawyer review them for your jurisdiction.
3. Run `npm run sync:legal`. It writes the pages into `site/` (support,
   privacy, terms, health-data and delete-account) and the markdown copies
   into `docs/privacy-policy.md` and `docs/terms.md`. They are git-ignored:
   each operator publishes its own. To host them, use `npm run sync:legal`
   as the build command and `site` as the output folder.
4. The generated pages link to `index.html`, and the app's share link points
   at the site root, but `sync:legal` writes no `index.html`. Add one to your
   hosted site (a short landing page, or a redirect to `support.html`), or
   point both at `support.html` (`scripts/sync-legal.mjs` and
   `src/lib/share.ts`).
5. Production builds and production updates stop while the placeholders are
   still there (`scripts/check-build-env.mjs`).

## 3. Backend (Supabase)

1. Create a project. In the SQL editor, run `supabase/setup-all.sql` once.
   It is the schema, analytics and retention in one paste, and it is safe to
   re-run. The dated `migrations-*.sql` files only update projects created
   before them; a new project does not need them.
2. Auth settings the code depends on:
   - Turn on anonymous sign-ins, leave CAPTCHA off for them (the app sends
     no captcha token), and raise the per-IP rate limit for anonymous
     sign-ins: the app signs in anonymously at "Agree and start".
   - Set the Site URL and the Redirect URLs to
     `https://<your host>/support.html`. The email confirmation link lands
     there, and the page clears the token from the address bar.
   - Set up custom SMTP. The Magic Link email template must contain
     `{{ .Token }}` and the OTP length must be 6: the app signs in on a new
     phone with a 6-digit code.
   - Turn off writing auth audit logs to the project database. Those rows
     keep account IDs and IP addresses that account deletion cannot remove.
3. Deploy the `delete-account` function: `npx supabase login`, then
   `.\supabase\deploy-functions.ps1 -ProjectRef <your-project-ref>` in
   PowerShell, or `npx supabase functions deploy delete-account --project-ref
   <your-project-ref>` anywhere. Keep JWT verification on: the function must
   only ever delete the account calling it.
4. Optional function secrets let account deletion also remove the person's
   RevenueCat customer and PostHog data: `REVENUECAT_SECRET_API_KEY`,
   `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID` and `POSTHOG_HOST`. Copy
   `supabase/functions/.env.example` to `supabase/functions/.env`, fill them
   in, and the deploy script pushes only those names. With the `npx`
   command, set them with `npx supabase secrets set`.

## 4. Analytics (PostHog, optional)

Without a PostHog key, usage events go only to your Supabase `events` table.
If you set `EXPO_PUBLIC_POSTHOG_KEY`, set these PostHog project settings,
which the privacy policy relies on:

- "Discard client IP data": on.
- The GeoIP transformation: off.
- Person processing: left on, because account deletion deletes the person.
- Event retention: 1 year or less.

## 5. The app

1. Run `npx eas init` to link your Expo project, and
   `npx eas update:configure` if you will send over-the-air updates. Once an
   update URL is set, the app checks for updates at launch, before "Agree
   and start": say so in your privacy policy, or turn automatic checks off.
2. Change the bundle identifier and package name `com.winback.app`
   everywhere it appears, unless an existing store record is transferred to
   you (Apple and Google both support app transfers): in `app.json`
   (`ios.bundleIdentifier`, `android.package` and `android.playStoreUrl`),
   `src/lib/purchases.ts` (the Android subscription link), `src/lib/share.ts`
   (the share link fallback) and `src/state/legal.ts` (the Google Play
   subscription links on the hosted pages).
3. Set the environment variables for each EAS environment with
   `eas env:create`. The full list is in `.env.example`: the Supabase URL and
   publishable key, the RevenueCat keys, PostHog, the TheSportsDB key and the
   URLs of your hosted pages. `scripts/check-build-env.mjs` runs before every
   EAS build and names anything a production build is missing.
4. In the stores: an 18+ age rating, privacy answers that match
   `docs/data-map.md`, your account-deletion page, and, if you keep Premium,
   the subscriptions `winback_yearly` and `winback_monthly` under the
   RevenueCat entitlement `premium`. The paywall reads the annual and monthly
   packages of the current RevenueCat offering.

## 6. Keep Premium, or make everything free

Premium is decided by `isPremium` in `src/state/AppState.tsx` (a
subscription, the free week, or 30 days on us). Making every feature free
takes more than setting it to true:

- `src/app/(tabs)/index.tsx`: the plans that open after the free week and
  the free-week banner (they read `trialExpired`, `subscribed` and
  `storeChecked`).
- `src/app/onboarding/commit.tsx`: the free-week and subscription copy.
- `src/app/(tabs)/you.tsx` and `src/app/on-us.tsx`: membership, "Premium is
  too much right now?" and 30 days on us.
- `src/state/legal.ts`: the Terms sections on the free week, 30 days on us
  and subscriptions.
- `scripts/check-build-env.mjs`: drop the RevenueCat key check.

The safety layer is free either way.

## 7. Open-source notices

The app has no licenses screen yet. Before you ship, add one that lists
Winback's `LICENSE`, the license of every JavaScript package in the bundle,
the OFL-1.1 text for the Archivo and Hanken Grotesk fonts, and Apache-2.0 for
Material Symbols (Android). Ship the native notices too (on Android, Google's
oss-licenses Gradle plugin or an equivalent; on iOS, the CocoaPods
acknowledgements), and regenerate them after every dependency update.

## 8. The helplines

This copy ships no phone numbers: every help screen links to Find A Helpline
(findahelpline.com). If you add local numbers, follow [SAFETY.md](SAFETY.md).

## 9. Before each release

- Run every check in the README.
- On real phones: VoiceOver and TalkBack, the largest text sizes, the
  Android widget, sign-in codes, and account deletion against your own
  backend ([docs/test-plan.md](docs/test-plan.md)).
- Decide about the Android widget: it renders a snapshot (the discreet
  setting is honoured) through a content provider that other apps on the
  phone can read ([docs/data-map.md](docs/data-map.md)).
