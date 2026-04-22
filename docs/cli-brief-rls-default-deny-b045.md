# B-045 — Enable RLS default-deny on every public-schema table

**Type:** Security hardening (Supabase advisory)
**Scope:** Single batch. Write + apply migration, smoke-test, update tech debt, commit, push.

## Why now

Supabase's security advisor is flagging `rls_disabled_in_public` and `sensitive_columns_exposed` on this project. The `NEXT_PUBLIC_SUPABASE_ANON_KEY` is, by design, shipped to the browser bundle. Anyone on the internet can hit `https://<ref>.supabase.co/rest/v1/<table>` with that key and, because RLS is off on public-schema tables, read / write / delete every row.

This is tech-debt item #3 in CLAUDE.md. We're addressing the specific, exploitable piece of it — not the broader "move app traffic off service role" project.

## Why the fix is safe for the app

Every server-side query in the app uses `src/lib/supabase/admin.ts` → `createAdminClient()`, which authenticates with `SUPABASE_SERVICE_ROLE_KEY`. The service role **bypasses RLS entirely**. Therefore, enabling RLS with *no policies* (default-deny) on every public-schema table:

- Blocks the anon key from reading/writing raw tables → closes the advisory.
- Leaves the service role unaffected → all app traffic keeps working.

This is explicitly the POC-appropriate fix. A real RLS policy set is a bigger project (tracked as tech-debt #3).

## What to do

### Step 1 — Generate the migration

Create `supabase/migrations/005-rls-default-deny.sql`. Content pattern:

```sql
-- B-045 — Enable RLS default-deny on every table in `public` schema.
-- The app uses the service role (bypasses RLS), so this blocks the anon
-- key from hitting raw tables without breaking server-side queries.
--
-- Add new tables here as they're introduced; the equivalent default-deny
-- should be part of every table-creation migration going forward.

ALTER TABLE public.<table1> ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.<table2> ENABLE ROW LEVEL SECURITY;
…
```

**You need to enumerate every table in `public`.** Preferred: connect to Supabase and run:

```sql
select tablename
from pg_tables
where schemaname = 'public'
order by tablename;
```

Grab the list and produce an `ALTER TABLE public.<name> ENABLE ROW LEVEL SECURITY;` line for each. Include ALL of them — do not cherry-pick. Tables that are "non-sensitive" today can become sensitive tomorrow, and default-deny costs nothing when the app uses the service role.

If you cannot connect directly, derive the list from `supabase/schema.sql` and/or the migrations in `supabase/migrations/`. Cross-check that the list matches reality (ask the user to confirm no tables are missed if unsure).

**Important — do NOT add any policies.** No-policies-on-RLS-enabled-table means "nobody can read or write via the anon/authenticated role." That's the whole point.

### Step 2 — Apply the migration

Per CLAUDE.md, migrations don't auto-apply. Two options:

**Option A (preferred)** — run the SQL directly in the Supabase SQL editor and copy-paste `005-rls-default-deny.sql`.

**Option B** — add a one-shot admin endpoint `POST /api/admin/migrations/enable-rls-default-deny` following the existing pattern in `src/app/api/admin/migrations/*`. Admin auth only. Hits every `ALTER TABLE … ENABLE ROW LEVEL SECURITY`. User runs it once from Postman/curl. Delete the route or leave it — your call; note the choice in CHANGES.md.

**Flag the migration loudly in CHANGES.md BEFORE the user tests** (per user's MEMORY rule "Always Flag Supabase Migrations").

### Step 3 — Smoke-test that the app still works

After applying, the user needs to:

- Load `/dashboard` as a client — application list should render.
- Load `/admin/dashboard` as an admin — stats + recent activity render.
- Register a new test user → succeeds (auto-create triggers run as the DB role, which bypasses RLS).
- Upload a document on an in-progress application → still works.

If any of those break, the most likely cause is a DB trigger or function that was silently relying on anon access. Fix by setting `SECURITY DEFINER` on the function so it runs as the owner, not the caller. Document any such adjustments in the migration file itself.

### Step 4 — Verify the advisory is actually closed

From a terminal, run with the anon key (found in `.env.local` as `NEXT_PUBLIC_SUPABASE_ANON_KEY`):

```bash
curl -s "https://<ref>.supabase.co/rest/v1/profiles?select=*" \
  -H "apikey: <ANON_KEY>" \
  -H "Authorization: Bearer <ANON_KEY>" | head -c 500
```

Expected: `[]` or `{"code":"42501", "message":"permission denied for table profiles"}` or similar — NOT rows of data.

Pick 3–4 tables to spot-check, including at least one that the advisory specifically flagged as "sensitive columns exposed" (likely `profiles`, `client_profiles`, `kyc_records`, or `documents`). Paste the actual responses into CHANGES.md for the record.

Also reload the Supabase advisor page — the `rls_disabled_in_public` / `sensitive_columns_exposed` findings should clear within a minute.

### Step 5 — Update CLAUDE.md tech-debt

In `CLAUDE.md`, find the "Tech Debt Tracker" section (or if it's in `CHANGES.md` now — check both). Item #3 currently reads:

> **RLS bypassed app-wide** | High | Every server-side query uses `createAdminClient()` (service role). Security is enforced at the API/page layer via NextAuth session checks only. Fine for POC, must add RLS or per-tenant filtering before production SaaS launch.

Amend it to note the partial fix:

> **RLS bypassed app-wide (partial)** | Medium | The anon key can no longer hit raw tables — RLS is enabled default-deny on every public-schema table (B-045). The service role still bypasses everything. Before production SaaS launch we need real per-tenant policies so we can move app queries off the service role.

Severity drops from High → Medium because the exploitable path is closed.

### Step 6 — Commit + push

Per the Git Workflow Rule: stage `supabase/migrations/005-rls-default-deny.sql`, the admin route (if you added one), `CLAUDE.md`, and `CHANGES.md`. Clean commit message like `security: enable RLS default-deny on all public tables`.

## Done criteria

- [ ] `supabase/migrations/005-rls-default-deny.sql` exists and enumerates every public-schema table.
- [ ] Migration applied to the Supabase instance — flagged in CHANGES.md with applied/not-applied status.
- [ ] `npm run build` passes.
- [ ] Curl with anon key returns no data for at least 3 spot-checked tables — evidence pasted into CHANGES.md.
- [ ] App smoke-tests pass (client dashboard, admin dashboard, register, upload).
- [ ] CLAUDE.md tech-debt #3 amended.
- [ ] `CHANGES.md` has a `## B-045 — RLS default-deny on public tables (done YYYY-MM-DD)` entry.
- [ ] Committed and pushed to `origin main`.

## Notes for the implementer

- Single-batch brief.
- Commit message: no batch ID prefix.
- If a specific table is genuinely meant to be world-readable (there aren't any in this app, but just in case), flag it separately in CHANGES.md and leave RLS off for that single table with a one-line justification. Default is RLS-on for everything.
- **Do not** add permissive policies "just to be safe." Empty-policies-on-RLS-enabled is the exact behaviour we want.
- If you add an admin migration endpoint, protect it with the standard admin-only guard (see `src/app/api/admin/migrations/*` for the pattern). Don't ship it unprotected.
- The `auth` schema (Supabase Auth tables) and the `storage` schema are managed by Supabase itself — do NOT alter those. Only `public` schema tables.
