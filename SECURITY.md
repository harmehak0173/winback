# Security

## Reporting a vulnerability

Please report it privately through GitHub's private vulnerability reporting:
the Security tab of this repository, then "Report a vulnerability". Do not
open a public issue.

## Scope

- The app in `src/`.
- The database schema, row-level security and migrations in `supabase/`.
- The `delete-account` edge function in `supabase/functions/`.

This repository has no operator. Each organization that publishes the app is
responsible for the security of its own deployment: its Supabase project,
keys, hosted pages and store accounts.
