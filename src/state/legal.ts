/**
 * Terms, Privacy and the other legal pages, shipped INSIDE the binary.
 *
 * Both stores require a subscription paywall to link to terms and a privacy
 * policy. Those links used to render only when EXPO_PUBLIC_TERMS_URL /
 * EXPO_PUBLIC_PRIVACY_URL were set at build time, so a build that shipped
 * without them showed no legal links at all - an automatic rejection, and one
 * that is invisible in development. Bundling the text means the links always
 * exist; a hosted URL, when configured, is offered as well.
 *
 * This file is the single source of truth. `npm run sync:legal` regenerates
 * docs/privacy-policy.md, docs/terms.md and the hosted pages in site/ from it,
 * so never edit those by hand.
 *
 * Format rules (the sync script parses this file, it does not run it):
 *  - Constants are single-quoted strings. Texts are template literals that
 *    only interpolate those constants, as `${NAME}`.
 *  - In texts: "## " heading, "### " subheading, "- " bullet, blank line
 *    between paragraphs, and links as [label](target) where target is
 *    https://..., mailto:... or doc:<key> for another page in LEGAL_DOCS.
 */

/**
 * Who "we" are: the organization that operates this copy of the app.
 * Change it here and run `npm run sync:legal`; the texts below say "who",
 * so reword those too.
 */
// Set these to the organization that runs this copy of the app, then run
// npm run sync:legal. Production builds refuse the placeholders
// (scripts/check-build-env.mjs). See HANDOFF.md.
export const OPERATOR_NAME = 'YOUR ORGANIZATION NAME';
export const CONTACT_EMAIL = 'privacy@example.org';
export const GOVERNING_LAW =
  'the laws of the place where the operator is established, without regard to conflict-of-law rules';
/** The SMTP provider configured in Supabase Auth for sign-in codes. */
export const EMAIL_PROVIDER = 'Resend';
export const APPLE_EULA_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';

export const LAST_UPDATED = 'October 28, 2026';

export const PRIVACY_TEXT = `This policy explains what Winback collects, why, who it goes to, how long it is kept and how to delete it. Winback ("we", "us", "the app") is operated by ${OPERATOR_NAME}, who is responsible for your data (the "controller"). Contact: [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}).

The short version:

- You can use Winback without giving us your name, email or phone number.
- Your answers are tied to a random account ID, used only to run Winback, never sold and never used for advertising.
- Your answer about who you hide your betting from never leaves your phone.
- Nothing about you is sent to an AI service.
- You can delete everything, any time, in the app or by email.

## What we collect and why

- Random account ID. Created when you tap "Agree and start", so your progress can be saved without an account. No name, email or phone number is needed.
- Your quiz answers. How often you bet, which sports, how you bet, your monthly deposit range, your triggers, whether you have tried to stop or cut back before, what betting has cost you, your goal and your longest break so far. They are stored under your random ID with the figures worked out from them (your estimated monthly spend, sports, triggers, goal), and used to personalize Winback: your cost figures, reminders and game-day features. One answer is the exception: who you hide your betting from stays on your phone and is never uploaded. Our database refuses it even if something tried to send it.
- Your progress. Your quit date, your daily check-ins, the money kept in earlier streaks, your longest streak, how many daily reads you have finished, your plan (free or which subscription) and when your free week of Premium started. These are synced with your account. For check-ins, only the date of each day you closed out clean (or as a close call beaten) is sent, never a slip, a trigger or a note. Once you save an email, your quit date, money kept, longest streak, daily reads, plan and check-in days come back after a reinstall or on a new phone.
- Panic button sessions. When each panic session started and ended. Never what you type or say, and nothing is recorded.
- Usage events. Named events such as "paywall viewed", "check-in done" or "slip logged", with coarse details like a step number, a plan name, whether an urge or a slip was logged, a spending range, or a range for days since your quit date (like "8-30"). Our own crash reports record only the type of error and where it happened, never message text. These go to our own database so we can see how Winback is used and fix problems. If you are offline, they wait on your phone for up to 7 days and are sent when you are back online, or dropped.
- A smaller set of usage events goes to PostHog, our analytics provider: onboarding steps (which question, never your answer), paywall and purchase steps, sign-in and restore steps, restarting the quiz, app opens, notification taps, settings changes, screen views, and when you share your progress (never what you shared). They may carry some of the same coarse context (whether you have Premium or the free week, and whether you have changed the discreet mode setting yourself - never whether it is on or off, because its default comes from an answer that stays on your phone). Events about slips, urges, panic sessions, check-ins, triggers or spending, and the range for days since your quit date, are never sent to PostHog, and we tell PostHog not to work out a location from your connection.
- Optional email. If you choose "Save my progress", your email is stored by our sign-in provider and used to send you one-time sign-in codes, so you can sign in on a new phone and get your progress back. We never send marketing email.
- Purchases. RevenueCat, our subscription provider, receives your random ID when you start using Winback, so the app can check whether you have Premium. If you subscribe, Apple or Google takes the payment, and RevenueCat also receives the store's record of the purchase (product, dates, status, price and currency). We never see your card or bank details.
- Technical data. Any server the app talks to sees your IP address and basic details of the request (like the app version and operating system) while handling it. We do not keep IP addresses with your answers or usage events. Our sign-in provider (Supabase Auth) does record the IP address and device type of each sign-in session, for security; the session records are deleted with your account, and Supabase's own security and request logs, which include IP addresses, device type and your account ID, expire within 7 days.

You can turn usage data off: use the "Share usage data" switch in the You tab. When it is off, no usage events are sent anywhere, to us or to PostHog. The switch does not cover app update checks, which send a little technical data to Expo (below). It starts off if your phone is set to a region in the European Economic Area, the UK, Switzerland or Canada, and on everywhere else.

## Kept only on your phone

What you enter for these stays on your phone. If usage data is on, a usage event notes that you did one of these things and when, sometimes with a count (for example "lights out completed" or "a line cut, 3 so far"), never what you entered: no goal names or amounts, no sleep ratings, and no trigger, plan or team you chose.

- Your answer about who you hide your betting from.
- Your trigger log, your plans, your saved teams (only their team IDs go to TheSportsDB, to look up schedules) and your settings.
- Your goals and any money you log as moved to them, the urges you logged as ridden out, your cut-the-lines progress, your practice reps, the games you logged as watched clean, and your comeback week.
- Lights out: your sleep ratings. Sleep ratings are health information, and they never leave your phone.
- Your accountability partner's name and number, in the phone's secure storage. We never receive them; Winback only uses them to open a text message for you to send.
- Your reasons, if you write your own, in the phone's secure storage. We never receive them; Winback only shows them back to you on the panic screen.
- App lock. Face ID, fingerprint and passcode checks happen in your phone's operating system. We never receive any biometric data.
- Reminders. They are scheduled on your phone as local notifications. Winback does not use push notifications sent from a server, and does not collect a push token.
- Months of Premium on us. The record of when you took each one stays in your phone's secure storage, to apply the limit of three a year. If usage data is on, one usage event notes that you took one and when, with the same coarse details as other usage events, and it goes only to our own database, never to PostHog.

## What we do not collect

- No real name, contacts, photos, microphone recordings, precise location, advertising identifier, or tracking across other companies' apps and websites.
- No bank or transaction data. Your spend figures are your own estimates.

## Health information and your consent

Your answers and progress describe your betting and its effects on you. Some laws treat that as health data (for example "special category" data under the GDPR, and "consumer health data" in Washington, Nevada and some other US states). We collect it only with your consent, which you give when you tap "Agree and start" at the beginning of the app after reading what is collected. In Canada, that tap is your express consent to us collecting this sensitive information. We use it only to provide Winback to you. It is stored against a random ID rather than your identity, never sold, and never used for advertising.

You can withdraw consent at any time by deleting your account (see below), and you can stop usage data with the "Share usage data" switch. Withdrawing does not affect what was done before.

If you live in Washington, Nevada or another state with a consumer health data law, our [Consumer Health Data Privacy Policy](doc:health-data) sets out your rights in detail.

## AI

Winback does not use AI to process your data. The breathing and grounding voice is pre-recorded and AI-generated. Nothing you say or do is sent to an AI service.

## Legal bases (EEA, UK and Switzerland)

- To provide the app you asked for (contract): your account, syncing your progress, sign-in, subscriptions.
- Your explicit consent: your quiz answers, progress and panic sessions, which may be health data.
- Usage data: your consent. It starts off when your phone is set to a region in the EEA, the UK or Switzerland; wherever you are, you can switch it off in the You tab.
- Legal obligations: answering your privacy requests and any lawful request from an authority. Apple and Google keep their own purchase records for tax and accounting law, as separate controllers.

## Who we share it with

We do not sell your data, and we do not share it for advertising. It goes only to the service providers that run Winback for us, and only what each one needs:

- Supabase (database, sign-in and account deletion; servers in the United States): everything listed as synced above, and your email if you add one.
- ${EMAIL_PROVIDER} (email delivery for Supabase sign-in): your email address and the sign-in code.
- RevenueCat (subscriptions): your random ID and, if you subscribe, store purchase records.
- PostHog (product analytics; servers in the United States): the smaller set of usage events described above, with your random ID.
- Expo (app updates through EAS Update): when Winback checks for an update it sends the app version, platform and a random installation ID generated by the update system, and, if Winback crashed while starting, a short report of that crash (up to 1 KB, which can include the error message) and the IDs of any update that failed to start. This happens with every update check, whatever the usage data switch says.

Each of these providers processes the data only to provide its service to us, under a contract that requires it to protect the data to the same or an equal standard as this policy, and not to use it for its own purposes.

Two other services receive data when you use a feature that needs them, under their own terms rather than a contract with us:

- TheSportsDB, a sports-data service used for game-day mode: the team names you search for and the IDs of the teams you save, to look up schedules. Never your account ID or anything else about you.
- Apple App Store and Google Play: they handle billing and app distribution under their own privacy policies, as separate controllers.

We may also disclose data if the law requires it. If Winback is ever transferred to someone else, this policy keeps applying to your data and we will tell you in the app first.

## International transfers

Our providers store data in the United States. When data about people in the EEA, the UK or Switzerland is transferred there, we rely on the safeguards in each provider's data processing terms, such as the European Commission's Standard Contractual Clauses and the UK Addendum, or the provider's certification under the EU-US Data Privacy Framework where it has one.

If you are in Canada: your data is stored and processed in the United States by the providers above. While it is there, it is subject to US law and may be accessed by US courts, law enforcement and national security authorities.

## How long we keep it

- Your account, answers, progress and panic sessions: until you delete your account. An account without a saved email that has not been used for 12 months is deleted automatically from our database. That job does not reach RevenueCat or PostHog: PostHog events expire as below, and we delete the RevenueCat customer record if you email us.
- Usage events in our database: 24 months, then deleted automatically.
- Usage events in PostHog: deleted when you delete your account, and otherwise kept for up to 1 year.
- Your RevenueCat customer record and any purchase records in it: deleted when you delete your account. Apple and Google keep their own purchase records under their policies.
- Your email: until you delete your account.
- Deleted data can remain in our database provider's encrypted backups for up to 30 days before those backups expire.
- Our email provider (Resend) keeps a log of the sign-in and confirmation emails it sent, including your address, for up to 30 days.
- Our database provider's request and sign-in logs, which include IP addresses, expire within 7 days.
- Data on your phone: until you delete your account or erase it in the app. Uninstalling removes the rest, except that on iPhone the items in secure storage (your sign-in, your person's name and number, your own reasons, the app lock and the record of months on us) stay in the iOS Keychain until Winback is installed again, which clears them on first launch, or the phone is erased. To remove them sooner, delete or erase in the app before uninstalling.

## How we protect it

- Everything the app sends travels encrypted (HTTPS/TLS), and our database is encrypted at rest.
- Database rules ensure each account can only ever read or change its own data.
- Your sign-in token and your accountability partner's details are kept in your phone's secure storage (the iOS Keychain or Android Keystore).
- Server keys never ship inside the app. Account deletion runs on our server and only for the account that asks.
- You can lock the app with Face ID, fingerprint or your passcode.

No system is perfectly secure. If a breach affects your data, we will tell you and the authorities as the law requires.

## Deleting your data

In the app: You tab, then Account, then "Delete my account and data". This permanently deletes your account and everything tied to it from our database straight away, asks RevenueCat and PostHog to delete their records of you, and wipes everything Winback stored on your phone. It cannot be undone.

Deleting your account does not cancel a subscription. Cancel it first with "Manage subscription" in the You tab, or in your App Store or Google Play settings.

Without the app, or to delete only part of your data: see our [account deletion page](doc:delete-account). If you never saved an email, include your account ID, which the app shows in the You tab under Account.

## Your rights

Wherever you live, you can ask us to access, correct, export or delete your data, or to stop using it. Email [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). We may ask you to confirm the request from the email you saved or from the app, so we only act for the account's owner. Requests are free. We reply within 30 days (within one month in the EEA, UK and Switzerland, if that is sooner), or within 45 days where US state law sets that period.

- EEA, UK and Switzerland: you also have the right to object, to restrict use, to data portability, to withdraw consent, and to complain to your data protection authority (in Ireland the Data Protection Commission, in the UK the Information Commissioner's Office).
- California and other US states: you have the right to know, access, correct and delete your personal information, and to limit the use of sensitive personal information. We do not sell or share personal information for cross-context behavioural advertising, and we use sensitive personal information only to provide Winback. You can use an authorized agent, and we will not treat you differently for using your rights. If we refuse a request, you can appeal by replying to our answer; if you are still unhappy, you can contact your state attorney general.
- Washington, Nevada and other consumer health data laws: see the [Consumer Health Data Privacy Policy](doc:health-data).
- Canada: under PIPEDA and the provincial privacy laws, you can access and correct your personal information and withdraw your consent at any time (Winback cannot run without your data, so withdrawing means deleting your account). Our privacy officer, who is accountable for how Winback handles your information, is ${OPERATOR_NAME}: [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). If you are not satisfied with our answer, you can complain to the [Office of the Privacy Commissioner of Canada](https://www.priv.gc.ca). In Quebec, you can also ask for your data in a structured, commonly used format, and complain to the [Commission d'accès à l'information](https://www.cai.gouv.qc.ca).
- Australia: under the Privacy Act 1988 and the Australian Privacy Principles, if you think we have mishandled your information, complain to us first in writing at [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). We acknowledge it, look into it and reply in writing within 30 days. If you are not satisfied, or we have not replied in that time, you can complain to the [Office of the Australian Information Commissioner](https://www.oaic.gov.au).
- New Zealand: under the Privacy Act 2020 you can ask for and correct your information. If you are not satisfied with how we handle a request or complaint, you can complain to the [Privacy Commissioner](https://www.privacy.org.nz).

## Adults only

Winback is for adults aged 18 or over (or the age of majority where you live, if higher). It is not directed at children, and we do not knowingly collect data from anyone under 18. If you believe a child has used Winback, email us and we will delete the account.

## Crisis resources

Winback is a support tool, not medical treatment. If gambling is causing you serious harm, the app links to Find A Helpline (findahelpline.com), a free directory of gambling helplines by country, on the panic screen and in the You tab. Those services are free and independent of us. Contacting them shares nothing with Winback.

## Changes to this policy

When we change this policy we update the date at the top. We announce material changes in the app before they take effect, and ask for your consent again where the law requires it.

## Contact

${OPERATOR_NAME} (privacy officer), [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const TERMS_TEXT = `These Terms of Use are an agreement between you and ${OPERATOR_NAME} ("we", "us"), who operates the Winback app. By using Winback you agree to them. If you do not agree, please do not use the app.

## What Winback is - and is not

Winback is a self-help tool for people who want to stop sports betting. It is not a medical device, and it is not medical care, therapy, addiction treatment or crisis intervention. It does not replace professional help. If you are in immediate danger, call your local emergency number. For help with gambling, the app links to Find A Helpline (findahelpline.com), a free directory of gambling helplines by country.

## Eligibility

You must be at least 18 years old, or the age of majority where you live if that is higher, to use Winback. You confirm this when you tap "Agree and start". Use Winback only for yourself, not on behalf of someone else.

## Your account

Winback creates an anonymous account with a random ID when you tap "Agree and start". You can add an email with "Save my progress" to sign in on a new phone. If you lose your phone without saving an email, we cannot recover your progress. Keep your phone secure; you can also lock the app in the You tab.

## Your free week of Premium

Your first 7 days of Premium are free, starting when you commit to your quit date. No card, no charge. The free week is granted by Winback itself, not by the App Store or Google Play, so we never ask for payment details to start it and nothing is charged when it ends.

The free week belongs to an account. A new account starts its own week, and that includes the new account created when you reinstall Winback without signing back in.

After the week, Premium is optional. Premium features lock unless you subscribe or take a month on us (below), and the free version stays yours. If you subscribe during your free week, your paid plan starts that day and the rest of the free week ends.

## 30 days of Premium on us

If Premium is too much right now, you can take 30 days of it free: tap "Premium is too much right now?" on the plans screen or in the You tab. No card, no charge and nothing to explain. It is there when you are not subscribed, not in your free week and not already in a month on us.

- You can take up to three in any 365 days, one at a time. A new one can start once the last one has ended; when all three are used, another opens 365 days after the earliest of them.
- Like the free week, it is granted by Winback itself, not by the App Store or Google Play. Nothing is charged and no plan starts when it ends: Premium features lock again, and the free version stays yours.
- If you subscribe during one, your paid plan starts that day and replaces the rest of the 30 days.
- It runs on your phone's clock. While your phone's date reads earlier than a date Winback has already seen, it is paused and Premium features lock; once the date is right it carries on to the same end date.
- The record of when you took them is kept only on your phone. Reinstalling Winback, erasing it on this phone or deleting your account clears it.
- We may change or end this offer. If we do, a month you have already started still runs to its end.

## Subscriptions

- Winback Premium is an optional auto-renewing subscription, offered monthly or yearly as shown on the paywall. The price and billing period are shown before you buy and confirmed by the store.
- Payment is charged to your Apple ID or Google Play account when you confirm the purchase.
- Your subscription renews automatically at the end of each period unless you cancel. On the App Store, your account is charged for the next period within 24 hours before the current one ends, unless you cancel at least 24 hours before the end of the current period. On Google Play, you are charged on the renewal date unless you cancel before it.
- Manage or cancel any time with "Manage subscription" in the You tab, or in your App Store or Google Play account settings. Cancelling stops the next renewal; you keep Premium until the end of the period you paid for.
- Deleting the app or your Winback account does not cancel a subscription.
- Refunds are handled by Apple or Google under their policies, not by us.
- If the price changes, the store tells you in advance and, where its rules require it, asks you to agree before you are charged the new price.
- If you reinstall Winback or move to a new phone, use "Restore purchases" to get Premium back.

## The free version

The streak counter, daily check-ins, the panic button with its breathing and grounding exercises, logging a slip and starting again, and the helplines are free forever and are never placed behind the paywall.

## Your data

How we handle your data, including full account deletion, is described in the [Privacy Policy](doc:privacy).

## Acceptable use

You agree not to misuse Winback: do not attempt to break its security, access other people's data, reverse engineer it where the law does not allow it, or use it to harm anyone. The figures Winback shows are estimates based on what you tell it, not financial advice.

## Our content

Winback, its content and its design belong to ${OPERATOR_NAME}. We give you a personal, non-transferable, revocable licence to use the app on devices you own or control, for your own non-commercial use.

## Other services

Winback links to helplines, support groups and self-exclusion programs, and uses sports schedules from TheSportsDB. Those services are run by others, and we are not responsible for them. Game times can change or be wrong.

## No guarantee

We do not guarantee any particular outcome. Recovery is personal and results vary. We work to keep Winback available and accurate, but we do not promise it will always be uninterrupted or error-free.

## Liability

To the fullest extent the law allows, Winback is provided "as is", we are not liable for indirect or consequential losses arising from your use of it, and our total liability to you is limited to the amount you paid for Winback in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law, or your rights as a consumer under the law where you live.

## Ending

You can stop using Winback at any time and delete your account in the You tab. We may suspend or end access for anyone who breaks these terms. The sections on our content, liability and governing law continue after the terms end.

## If you got Winback from the App Store

These terms are between you and ${OPERATOR_NAME}, not Apple. Your use of Winback on Apple devices is also subject to Apple's standard [Licensed Application End User License Agreement](${APPLE_EULA_URL}). Apple has no obligation to provide maintenance or support for Winback, is not responsible for any claims about it (including product liability, legal compliance or intellectual property claims), and, if Winback fails to meet any applicable warranty, you may notify Apple for a refund of the purchase price, if any. Apple and its subsidiaries are third-party beneficiaries of these terms and may enforce them against you. You confirm you are not in a country subject to a US Government embargo and are not on a US Government list of prohibited or restricted parties.

## Changes

We may update these terms. We announce material changes in the app before they take effect, and the date at the top always shows the current version.

## Governing law

These terms are governed by ${GOVERNING_LAW}. If you are a consumer, you keep the protection of the mandatory laws of the country or state where you live, and you can bring a claim in your local courts.

## Contact

${OPERATOR_NAME}, [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const HEALTH_DATA_TEXT = `This Consumer Health Data Privacy Policy applies to people in Washington State (under the My Health My Data Act), Nevada and other US states with consumer health data laws. It adds to our [Privacy Policy](doc:privacy), which covers everyone. Winback is operated by ${OPERATOR_NAME}.

## The consumer health data we collect

Winback helps people stop sports betting, so some of what it holds can say something about your health:

- Your quiz answers: how often you bet, how you bet, your monthly deposit range, your triggers (for example drinking or chasing losses), whether you have tried to stop or cut back before, what betting has cost you (for example debt or relationships), your goal and your longest break so far.
- What we work out from them: your estimated monthly spend.
- Your recovery progress: your quit date, daily check-ins, slips you log, and when your panic button sessions started and ended.
- Usage events that reflect your recovery (for example "slip logged"), if usage data is on.
- The fact that you use Winback, your random account ID and, if you add one, your email.

Your answer about who you hide your betting from is kept only on your phone. We never receive it.

## Why we collect it

Only to provide Winback to you: to personalize your cost figures, reminders and game-day features, to keep your progress safe and recoverable, and, if usage data is on, to understand how Winback is used and fix problems. We never sell it and never use it for advertising.

## Where it comes from

From you, through what you enter in the app, and from how you use the app.

## Who we share it with

We do not have affiliates. We share consumer health data only with service providers that process it for us under contract (processors):

- Our database and sign-in provider (Supabase): all of the data above.
- Our subscription provider (RevenueCat): your random ID, which shows that you use Winback, and your purchase records if you subscribe.
- Our email delivery provider (${EMAIL_PROVIDER}): your email address, if you add one, to send sign-in codes.
- Our analytics provider (PostHog): app usage events such as paywall and screen views, which show that you use Winback. It never receives your answers, slips, urges, panic sessions, check-ins or spending.
- Our app update service (Expo): a random installation ID, which shows that you use Winback, and, after a crash while starting, a short report of that crash.

We would ask for your separate consent before sharing consumer health data for any other purpose, and we never sell it. We do not use geofencing.

## Your consent

We collect consumer health data only with your consent, which you give when you tap "Agree and start" at the beginning of the app. You can withdraw it at any time by deleting your account.

## Your rights

- Confirm whether we collect, share or sell your consumer health data, and see it.
- Get a list of all third parties and affiliates we have shared it with, and how to contact them.
- Withdraw your consent.
- Have your consumer health data deleted, including by our service providers.
- Appeal if we refuse a request: reply to our answer and say you are appealing. We will answer the appeal within 45 days. If you are still unhappy, you can contact the Washington State Attorney General (or your own state's attorney general).

We will not treat you differently for using these rights.

## How to use your rights

- Delete everything in the app: You tab, then Account, then "Delete my account and data". This also asks RevenueCat and PostHog to delete their records of you.
- Or email [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) from the email you saved, or with your account ID, which the app shows in the You tab under Account. See our [account deletion page](doc:delete-account).

We respond within 45 days. We may extend that once by another 45 days where the law allows, and we will tell you why.

## Contact

${OPERATOR_NAME}, [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const DELETE_ACCOUNT_TEXT = `This page explains how to delete your Winback account and data. Winback is made by ${OPERATOR_NAME}.

## Delete in the app (fastest)

- Open Winback and go to the You tab.
- If you subscribe, tap "Manage subscription" first and cancel. Deleting your account does not cancel a store subscription.
- Scroll to Account and tap "Delete my account and data", then confirm.

Your account and data are deleted from our database straight away, and everything Winback stored on your phone is wiped.

## Delete without the app

If you subscribe, cancel first in [Apple subscriptions](https://apps.apple.com/account/subscriptions) or [Google Play subscriptions](https://play.google.com/store/account/subscriptions?package=com.winback.app). Deleting your account does not cancel a store subscription.

Email [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}) with the subject "Delete my account". So we can find your account, either:

- send it from the email address you saved in Winback, or
- include your account ID, which the app shows in the You tab under Account, or
- if you subscribed, include the order number from your Apple or Google Play receipt email.

We confirm and delete within 30 days, usually much sooner.

If you never saved an email and no longer have the phone, we cannot tell which account is yours. Accounts without a saved email that have not been used for 12 months are deleted automatically from our database. That does not reach RevenueCat or PostHog: PostHog events expire within a year, and we delete the RevenueCat customer record if you email us.

## What is deleted

- Your account ID and, if you saved one, your email.
- Your quiz answers and the figures worked out from them.
- Your quit date, check-ins, money kept, plan and free-week record.
- Your panic session times and the usage events in our database.
- Your customer record at RevenueCat, our subscription provider.
- Your person record and events at PostHog, our analytics provider (removed in the background, usually within a few days).
- When you delete in the app: everything Winback stored on your phone, including your accountability partner's details.

## What is kept, and for how long

- Apple and Google keep their own records of your purchases under their policies. We cannot delete those.
- The store connection on your phone starts over with a new, empty anonymous RevenueCat ID. It is not linked to you or to the deleted account, and it holds nothing unless you subscribe again.
- Deleted data can remain in our database provider's encrypted backups for up to 30 days, until those backups expire.
- Our email provider (Resend) keeps a log of the sign-in and confirmation emails it sent, including your address, for up to 30 days.
- Our database provider's request and sign-in logs, which include IP addresses, expire within 7 days.

## Deleting only some data

You do not have to delete your account to delete data. You can turn off usage data with the "Share usage data" switch in the You tab, or email us to delete your usage events or any other part of your data. We handle those requests within 30 days as well.

Questions: [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const SUPPORT_TEXT = `Winback helps you stop sports betting. It counts every day you stay clear of the betting companies, shows the money you keep, and has a panic button with breathing and grounding exercises for the moments an urge hits. You can use it without giving us your name, email or phone number.

## Get help now

Winback is a support tool, not treatment. If gambling is causing you serious harm, find a free gambling helpline in your country at [findahelpline.com](https://findahelpline.com/topics/gambling). Those services are independent of us.

If you are in immediate danger, call your local emergency number.

## Support

Email [${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL}). We usually reply within a few days.

- Premium, your free week and months on us: see the [Terms of Use](doc:terms).
- Cancel a subscription: "Manage subscription" in the You tab, or [Apple subscriptions](https://apps.apple.com/account/subscriptions) or [Google Play subscriptions](https://play.google.com/store/account/subscriptions?package=com.winback.app).
- Moving to a new phone: tap "Save my progress" in the You tab on your old phone, then "Sign in" on the new one.

## Your privacy

- [Privacy Policy](doc:privacy)
- [Consumer Health Data Privacy Policy](doc:health-data)
- [Delete your account](doc:delete-account)

Winback is made by ${OPERATOR_NAME}. It is not affiliated with any betting company.`;

export type LegalDoc = 'privacy' | 'terms' | 'health-data' | 'delete-account' | 'support';

/** Every page, by the key used in doc: links, the /legal route and site/ file names. */
export const LEGAL_DOCS: Record<LegalDoc, { title: string; body: string }> = {
  privacy: { title: 'Privacy Policy', body: PRIVACY_TEXT },
  terms: { title: 'Terms of Use', body: TERMS_TEXT },
  'health-data': { title: 'Consumer Health Data Privacy Policy', body: HEALTH_DATA_TEXT },
  'delete-account': { title: 'Delete your account', body: DELETE_ACCOUNT_TEXT },
  support: { title: 'Winback support', body: SUPPORT_TEXT },
};
