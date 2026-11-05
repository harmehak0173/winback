# Winback - Personal Data Map

Rebuilt from the code on September 27, 2026 (after the AI features and remote
push were removed). This is the source for the store privacy questionnaires, for answering access and deletion
requests, and for reviewing any new feature. The privacy policy
(`src/state/legal.ts`, published by `npm run sync:legal`) must say the same
thing; when one changes, change the other.

Update this file in the same commit as any new collection point, table,
event, third party or retention change.

## 1. Principles the code enforces

- **Offline first.** Every feature works with no network and no account.
  Every backend call is a timed no-op when the backend is not configured.
- **Random ID, not identity.** The account is an anonymous Supabase user
  created at "Agree and start". Email is optional and only for sign-in.
- **Consent before anything leaves.** Nothing is sent before "Agree and
  start". Usage data has its own switch ("Share usage data", You tab), off by
  default in the EEA, UK, Switzerland and Canada (device region), on elsewhere. Off
  means `track()` sends nothing anywhere, first party included.
- **Health context stays first party.** PostHog receives only an allowlist of
  product events (section 4). Slips, urges, panic sessions, triggers,
  check-ins, money and recovery progress never reach it.
- **No AI processing** of any user data. The panic-screen voice is a set of
  pre-recorded, AI-generated audio files bundled in the app.
- **No remote push.** Reminders are local notifications; there is no push
  token anywhere.

## 2. Inventory

"Phone" = where it lives on the device (AsyncStorage is app-sandboxed;
SecureStore is the iOS Keychain / Android Keystore). "Supabase" = our database
(US region), always keyed by the random account ID and protected by row-level
security.

| Data | Collected where | Phone | Supabase | Third parties | Retention | Deletion covers it |
|---|---|---|---|---|---|---|
| Random account ID (Supabase user UUID) | "Agree and start" (anonymous sign-in) | SecureStore (session, chunked); `winback:last-account-id` | `auth.users`; owner key of every table | RevenueCat app user ID; PostHog `distinct_id` (allowlisted events only) | Until deletion; anonymous accounts with no activity for 12 months are purged by the retention job | Yes (auth user deleted; RevenueCat customer and PostHog person deleted) |
| Session tokens | Sign-in | SecureStore (web: AsyncStorage) | `auth.sessions`, `auth.refresh_tokens` (with IP and user agent, kept by Supabase Auth for security) | - | Until sign-out or deletion | Yes (cascade) |
| Quiz answers (frequency, sports, style, deposit range, triggers, history, cost, goal, longest break) | Onboarding quiz | `winback:v1` | `quiz_answers` (question id + option labels) | None | Until deletion or 12-month purge | Yes |
| The `secrecy` answer (who they hide betting from) | Quiz Q8 | `winback:v1` | **Never.** Filtered in `syncQuizAnswers` and at call sites; a database trigger drops it and a check constraint refuses it | None | Phone only | Wiped with local data |
| `hide_flag` (secrecy + debt) | Derived | `winback:v1` | **Never** (column dropped) | None | Phone only | Wiped with local data |
| Derived profile: estimated monthly spend (exact), sports, triggers, goal, baseline streak | Quiz -> `estimateMonthlySpend` (on-device heuristic, clamped to the user's bracket) | `winback:v1` | `profiles` | None (PostHog never gets spend; first-party `funnel_committed` carries only `spend_bracket`) | Until deletion | Yes |
| Quit date, plan (free/yearly/monthly; an old 'weekly' value is read as no plan), money kept in earlier streaks, longest streak, daily-read position | Commit, slip, paywall, daily read | `winback:v1` | `profiles` (`quit_at`, `plan`, `money_kept_before`, `best_streak_days`, `daily_index`) | None | Until deletion | Yes |
| Free-week start | First profile write (commit) | Trial clock in SecureStore (`winback.freeweek.start`, `winback.freeweek.clock`) | `profiles.trial_started_at` (stamped by the database, client cannot write it) | None | Until deletion | Yes |
| Months of Premium on us (when each started; whether the "it ended" note was dismissed) | "Premium is too much right now?" (paywall, You -> Membership) | SecureStore `winback.hardship` (web: AsyncStorage); last 10 starts. Read on the free week's guarded clock (never earlier than the latest time seen) | **Never** (not synced; not on the widget, in reminders or in discreet copy) | None (first-party `hardship_grant` event only, no props) | Phone only | Wiped (erase, deletion and an iOS reinstall) |
| Check-in days | Close-out (clean or close call) | `closeouts` in `winback:v1` (400 days) | `check_ins` (`user_id`, `day` only; last 14 days mirrored; slip days never uploaded, and removed if a day becomes a slip) | None | Until deletion | Yes |
| Panic sessions (start and end time only) | Panic screen | `winback.urgeOpens` (last 500) | `urge_events` (`started_at`, `ended_at`) | None | Until deletion | Yes |
| Usage events | Throughout (only with "Share usage data" on, after consent) | Offline outbox `winback:analytics-outbox` (max 200 events, 7 days) | `events` (`name`, `props` jsonb, `created_at` clamped to server time) | PostHog: allowlisted names only, minus blocked props (section 4) | Supabase 24 months (retention job); PostHog up to 1 year | Supabase: yes (cascade). PostHog: person and events bulk-deleted by delete-account |
| Crash reports (`app_error`: error class, where, fatal; also non-fatal errors and the count of reminders that failed to schedule) | Error boundary and global handler | Outbox as above | `events` | None (not on the PostHog allowlist) | 24 months | Yes |
| Email (optional) | You -> "Save my progress" | Supabase SDK session | `auth.users` only | Resend (delivers confirmation and sign-in code emails, via Supabase Auth SMTP; keeps a sending log with the address for up to 30 days) | Until deletion (never purged by the anonymous rule) | Yes |
| Purchases (also purchase and restore funnel events, with "Share usage data") | Paywall, Restore | RevenueCat SDK cache | `profiles.plan` (label only, grants nothing) | RevenueCat: account ID, store receipts, product, dates, price, currency, plus SDK request metadata (platform, app version, store country). Apple / Google take payment | RevenueCat until deletion; Apple / Google keep their own records | RevenueCat customer deleted (does not cancel the store subscription; the app warns first) |
| Saved teams | You -> Game-day mode | `winback:v1` | Never | TheSportsDB: the search text and saved team IDs, no identifier | Phone only | Wiped with local data |
| Fetched games cache | Reminder engine | `winback.games` | Never | - | Replaced on each fetch | Wiped |
| Trigger log (which trigger, urge or slip, when) | Panic, slip, close-out | `winback.triggerLog` | **Never** | None | Phone only | Wiped |
| Urge wins ("I'm past it", quick log, close calls) | Panic, Home | `winback.urgeWins` (500) | Never | None | Phone only | Wiped |
| Goals, money moved to goals | Goal screen | `winback:v1` | **Never** | None | Phone only | Wiped |
| Sleep ratings, lights-out nights | Lights out | `winback:v1` | **Never** (health information) | None | Phone only | Wiped |
| Plans and outcomes, cut-the-lines progress, reps, games watched clean, comeback week, reminder settings, discreet setting, favourite breathing pattern | Home flows, You | `winback:v1` | Never | None | Phone only | Wiped |
| Accountability partner name and phone (third-party data) | You -> Your corner | SecureStore `winback.partner` | **Never** | None; used only to open the phone's own Messages app | Phone only | Wiped |
| The user's own reasons (up to 3 lines, their words) | You -> Your reasons | SecureStore `winback.reasons` (web: AsyncStorage) | **Never** | None; shown only on the panic screen, never on the widget or in reminders | Phone only | Wiped (also by the account-switch wipe and a fresh install) |
| App lock setting | You -> Privacy | SecureStore `winback.applock` | Never | None; Face ID / fingerprint handled by the OS, no biometric data reaches the app | Phone only | Wiped |
| Review-prompt timing, last panic / setback time | Internal | `winback.reviewUrgeAt`, `winback.reviewSetbackAt`, `winback.reviewAskedAt`, `winback.panicAt` | Never | None | Phone only | Wiped |
| Android widget snapshot | Streak changes | `winback.widget` (discreet flag honoured) | Never | None. The widget library renders it as an image served by a content provider it exports without a permission, so another app on the phone could read the rendered widget (days clean and money won back; discreet mode shows neither). Patching the library is an open decision (an operator decision: HANDOFF.md section 9) | Phone only | Wiped |
| Consent and usage-data switch | Welcome, You | `winback:consent`, `winback:analytics` | Never | None | Phone only | Wiped |
| Install marker | First launch | `winback:installed` (a missing marker on iOS means a reinstall: the Keychain session, partner and lock are wiped before the client starts) | Never | None | Phone only | - |
| EAS Update installation ID | expo-updates on each update check | expo-updates storage | Never | Expo (EAS Update): random installation ID, app version, platform, runtime version, and after a crash while starting a short error report (up to 1 KB, can include the message) and the failed update IDs, whatever the usage data switch says | Expo's policy | Not linked to the account; removed by uninstalling |
| IP address and request metadata | Any request | - | Supabase API and edge logs (plan log window: 1 day Free, 7 days Pro); Supabase Auth sessions | PostHog drops it when "Discard client IP data" is on (HANDOFF.md section 4); RevenueCat, TheSportsDB and Expo see it while serving the request | Short log windows | Session rows cascade; auth audit rows are avoided by turning off database audit logs (HANDOFF.md section 3) |

Not collected anywhere: real name, contacts, photos, microphone audio,
location (precise or coarse), advertising identifier (AD_ID permission is
removed on Android; no IDFA), bank or transaction data, passwords (sign-in is
by emailed code), cross-app tracking.

## 3. Third parties

| Service | Role | Receives | Contract |
|---|---|---|---|
| Supabase (US) | Database, auth, edge function `delete-account` | Everything marked "Supabase" above, the email if saved, request IPs in logs | Processor (DPA) |
| Resend | Email delivery for Supabase Auth | Email address, the sign-in code or confirmation link | Processor |
| RevenueCat | Subscriptions | Account ID, store purchase records, SDK metadata | Processor |
| PostHog (US cloud) | Product analytics | Allowlisted events with the account ID; no GeoIP; IP discarded by project setting | Processor |
| Expo (EAS Update) | App updates | Installation ID, app and runtime version, platform, and a short report of a crash while starting | Processor |
| TheSportsDB | Game schedules (Premium game-day) | Team search text and team IDs, no identifier | Public API, user-initiated, own terms |
| Apple App Store / Google Play | Distribution and billing | Their own purchase and install records | Separate controllers |

Retired and gone: the AI service behind `estimate-spend` and
`notification-lines` (functions deleted by `supabase/deploy-functions.ps1`,
`ai_usage` table dropped by the launch migration), and the Expo push service
(`profiles.expo_push_token` dropped, no token requested).

## 4. Analytics, exactly

Source: `src/lib/analytics.ts`.

Sinks:

1. Supabase `events` (first party): every event, when usage data is on.
2. PostHog `/capture/` over HTTPS (only when `EXPO_PUBLIC_POSTHOG_KEY` is set):
   only events whose name is in the allowlist.

PostHog allowlist: `app_foregrounded`, `home_viewed`, `insights_viewed`,
`free_continued`, `trial_ended`, `quiz_restarted`, `share_progress`,
`account_restored`, and any name starting with `funnel_`, `paywall_`,
`purchase_`, `restore_`, `signin_`, `settings_`, `notification_`, `screen_`.
Everything else is first party only (slip, reset, freeze, urge, panic,
trigger, checkin, closeout, spend, comeback, rep, plan, line_cut, milestone,
daily reads, goals, lights out, games, errors, and `hardship_grant`: a month
of Premium on us was taken, with no props).

Properties never sent to PostHog even on an allowlisted event:
`spend_bracket`, `days`, `day`, `seconds`, `kind`, `trigger`, `days_clean`.
Every PostHog event also carries `app: 'winback'`, `environment`
(development / preview / production) and `$geoip_disable: true`.

Super-properties on every event: `days_clean` (bucket `0-7`, `8-30`, `31-90`,
`90+`; first party only), `is_premium` (also true during a month on us,
with no separate flag), `free_week_active`, `discreet` (`default` or `set`,
never whether it is on).

Props are counts, booleans, step numbers, plan names, question ids (never the
chosen answer), and coarse buckets. Never free text, goal names, amounts,
team or trigger choices, play ids, email or phone.

Before consent the Welcome view event waits in memory and is dropped unless
the user agrees. Offline events wait in the outbox for up to 7 days.

## 5. Retention

Implemented by `supabase/retention.sql` (also in the launch migration and
`setup-all.sql`): function `purge_expired_data()`, run daily by the pg_cron
job `winback-retention`.

- Anonymous accounts (no email) are deleted when every activity signal is
  older than 12 months: account creation, last sign-in and update, every
  session's creation, update and refresh, and the newest row in `profiles`,
  `quiz_answers`, `check_ins`, `urge_events` and `events`. Deleting the auth
  user cascades to every table.
- `events` rows older than 24 months are deleted.
- Client-sent timestamps are clamped to server time on insert, so a phone set
  ahead cannot keep rows (or an account) out of reach.
- The job does not reach RevenueCat or PostHog: PostHog events expire at the
  project's retention (1 year or less), and the RevenueCat record is deleted on
  request.
- Supabase backups expire within 30 days (Pro keeps 7 days of daily backups).

## 6. Deletion

- **In the app** (You -> Account -> "Delete my account and data"): if the user
  has a subscription the app first warns that deletion does not cancel it and
  offers "Manage subscription". Then the `delete-account` edge function (JWT
  required, only ever deletes the caller) deletes the auth user, which
  cascades to `profiles`, `quiz_answers`, `check_ins`, `urge_events` and
  `events`. Best effort afterwards, never blocking: RevenueCat
  `DELETE /v1/subscribers/{id}` and PostHog persons `bulk_delete` (with
  events), each skipped when its secrets are not set. The app then signs out,
  wipes every local key listed above (SecureStore included), cancels every
  scheduled reminder and starts over with a new anonymous RevenueCat ID.
- **When the server cannot be reached**: "Erase on this device" wipes the
  phone, signs out, and says plainly that the server copy still exists. It
  shows the account ID (copyable and shareable) and points to the deletion
  page so the server copy can be removed by email.
- **By email** (`site/delete-account.html`): from the saved email, or quoting
  the account ID. Done within 30 days.
- **What remains**: Apple and Google purchase records (their own); encrypted
  backups until they expire (30 days at most); Supabase request logs for the
  plan's short window; PostHog deletion runs in the background, usually within
  days. `auth.audit_log_entries` has no foreign key to the user, so database
  audit logging must stay off (HANDOFF.md section 3).

## 7. Storage security

- Session tokens and the partner's details are in SecureStore
  (Keychain / Keystore). The session adapter chunks values to fit SecureStore
  limits. On iOS a reinstall (missing `winback:installed` marker) wipes the
  surviving Keychain items (session, partner, app lock, the local free-week
  clock and the months-on-us record) before the Supabase client reads them, so a reinstall is a clean
  anonymous start and progress comes back only through email sign-in.
- Android backups are disabled (`allowBackup: false`), so app data does not go
  into cloud backups.
- AsyncStorage is app-sandboxed on both platforms. Values read back from it are
  validated and clamped on hydrate.
- The web export is a test artifact, not a shipped product.

## 8. What the server exposes

All data access is Supabase PostgREST behind row-level security: each account
can read and change only its own rows (verified by cross-user and forged-write
probes). Clients cannot delete
their profile row (revoked), cannot write `trial_started_at`, and cannot store
the `secrecy` answer. The only edge function, `delete-account`, returns
`{ ok: true, cleanup: { revenuecat, posthog } }` (each `deleted`, `not_found`,
`skipped` or `failed`) and nothing else. Server keys
(service role, RevenueCat secret, PostHog personal key) exist only as Supabase
function secrets.
