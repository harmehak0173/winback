# Helpline and safety data

Winback ships no phone numbers. Every screen that offers help (the panic
screen, You, a slip, the comeback week, the onboarding safety screen and the
error screen) links to Find A Helpline (findahelpline.com), a free directory
of gambling helplines by country, run by ThroughLine.

## Where it lives

- `src/lib/helplines-data.ts`: the directory link, and `BY_REGION`, the
  per-region lists of verified numbers. They are empty in this copy.
- `src/state/selfExclusion.ts`: self-exclusion programs and bank blocks, with
  links to each program's official site.
- `src/state/peerSupport.ts`: free peer support groups.

## If you add numbers

An operator who wants to show local lines adds them to `BY_REGION`; a region
with lines shows them in place of the directory link. A wrong number reaches
a person at their worst moment, so:

1. Every number must match the line's own site and a government or regulator
   source, hours and cost included. Put the source in a code comment next to
   the entry.
2. Mark a short code that only works inside its region as `localOnly`, so it
   never appears anywhere else.
3. Check every domain before linking it. Some former recovery-group domains
   now belong to gambling sites (gamblersanonymous.org.au and
   gamblersanonymous.org.nz); Gamblers Anonymous Australia is
   gaaustralia.org.au.
4. Check everything again before each release, and at least every three
   months.
5. If a published version shows a wrong number, fix it before anything else.
   An over-the-air update reaches phones fastest.
