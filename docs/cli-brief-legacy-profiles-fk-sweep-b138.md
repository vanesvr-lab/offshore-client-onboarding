# B-138 — Repoint legacy `profiles(id)` FKs to `users(id)` for admin-actor columns

## Why

B-127's auth refactor moved admins to `public.users` (with `admin_users.user_id` repointed via migration `20260513014208`). But B-118 (peer/manager reviews) shipped BEFORE that repoint and defined `review_request_reviewers.admin_id` against the LEGACY `public.profiles(id)`:

```sql
-- supabase/migrations/20260515040305_review_requests.sql line 5
admin_id   uuid NOT NULL REFERENCES public.profiles(id),
```

Today, any admin trying to attach a reviewer to a peer review request fails with:

> `Failed to attach reviewers: insert or update on table "review_request_reviewers" violates foreign key constraint "review_request_reviewers_admin_id_fkey"`

The admin's session has a `user_id` that exists in `public.users` but NOT in `public.profiles` (because they were created via the modern invite flow, or via the SQL-only path we documented in CLAUDE.md's Admin Setup section). FK validation rejects the insert.

This is part of a broader legacy-FK sweep. Other tables likely have the same shape and may be hitting silent failures or are simply unused. B-138 audits and repoints all admin-actor FKs in one pass so we close this category of bug.

## Out of scope (do NOT do in B-138)

- **`client_users` legacy junction** — not an FK issue; that table is part of the deprecated client-owner model. Leave alone.
- **Non-admin actor FKs** — some tables legitimately reference `profiles` for client-side actors (e.g. the legacy `applications.profile_id` for the client owner). Don't touch those.
- **Application-level row cleanups** — if the audit finds orphan rows (an FK whose target no longer exists), document them in CHANGES.md but don't auto-delete. Vanessa decides what to do.
- **Schema renames** — if a column is named `profile_id` but should now be `user_id`, leave the name. Just point its FK at the right table. Renaming is bigger surgery.

## The pattern

Same as `20260513014208_admin_users_fk_repoint_to_users.sql`:

```sql
DO $$
DECLARE
  cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.<TABLE>'::regclass
      AND contype = 'f'
      AND EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.<TABLE>'::regclass
          AND attname = '<COLUMN>'
          AND attnum = ANY(conkey)
      )
  LOOP
    EXECUTE format('ALTER TABLE public.<TABLE> DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;

ALTER TABLE public.<TABLE>
  ADD CONSTRAINT <TABLE>_<COLUMN>_fkey
  FOREIGN KEY (<COLUMN>) REFERENCES public.users(id);
```

Drops any existing FK on the column (regardless of name), then adds a fresh one targeting `users(id)`. Idempotent — re-running finds the FK already pointed at users and re-adds an identical constraint.

---

## Batch 1 — Audit + migration

### Step 1 — Audit

CLI runs this query against prod (via `node` + Supabase service-role, same pattern as our earlier inspection scripts) to find every column where the FK still points to `public.profiles`:

```sql
SELECT
  tc.table_name,
  kcu.column_name,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc
  ON tc.constraint_name = rc.constraint_name
JOIN information_schema.key_column_usage ccu
  ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND ccu.table_name = 'profiles';
```

List the results in the brief's CHANGES.md entry so we have a record. Expected to include at minimum:

- `review_request_reviewers.admin_id` ← the reported bug
- Possibly `review_requests.requester_id`
- Possibly `review_requests.closed_by`
- Possibly `service_profile_removals.removed_by`
- Possibly `application_section_reviews.reviewed_by`
- Possibly `client_account_managers.account_manager_id`
- Possibly audit-log actor columns

### Step 2 — Categorize each finding

For each `<table>.<column> → profiles(id)` FK:

| Category | What it means | Action |
|---|---|---|
| **Admin actor** | Column captures the user_id of an admin performing an action (reviewer, requester, closer, reviewed_by, assigned admin, etc.) | Repoint to `users(id)` |
| **Client actor / owner** | Column captures the client-side profile id (the person who OWNS the data — legacy `applications.profile_id`, etc.) | LEAVE — those still legitimately reference profiles in legacy code paths |
| **Ambiguous** | Could go either way | Document in CHANGES.md, leave for a follow-up |

Default judgment: any column named `*_by`, `admin_*`, `requester_*`, `assigned_*`, `reviewer_*`, `closed_by`, `actor_*` is an admin-actor and gets repointed. Columns named `profile_id`, `client_profile_id`, `account_holder_id` are client-side and stay.

### Step 3 — Orphan check (per repointed FK)

Before repointing, validate no orphan rows exist:

```sql
-- For each repointed FK, run:
SELECT COUNT(*) FROM public.<TABLE> t
WHERE t.<COLUMN> IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.<COLUMN>);
```

If count > 0: STOP. Document the orphan count in CHANGES.md. Most likely cause: the legacy admin existed only in `profiles` and was never mirrored to `users`. Either:
- Mirror that admin to `users` (insert from profiles, preserving the id), OR
- NULL out the orphan rows (lose audit attribution but unblock the FK repoint)

Vanessa picks the approach. Don't auto-pick.

### Step 4 — Migration

`<timestamp>_repoint_profiles_fks_to_users.sql`. Use `npx supabase migration new repoint_profiles_fks_to_users`.

The migration:

1. Block 1: assertions / orphan checks (RAISE EXCEPTION if any orphan exists, so the migration can't silently corrupt data)
2. For each admin-actor FK identified in Step 2: drop the legacy FK + add the new one targeting `users(id)`

Example layout (CLI fills in the actual list from the audit):

```sql
-- B-138 — Repoint admin-actor FKs from legacy profiles(id) to users(id).
-- Same pattern as 20260513014208_admin_users_fk_repoint_to_users.sql.

-- Orphan check: every repointed column must have all non-null values
-- already present in public.users.
DO $$
DECLARE
  orphan_count int;
BEGIN
  -- For review_request_reviewers.admin_id
  SELECT count(*) INTO orphan_count
  FROM public.review_request_reviewers t
  WHERE t.admin_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.admin_id);
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'B-138 — % orphan rows in review_request_reviewers.admin_id (no matching users row). Resolve before re-running.', orphan_count;
  END IF;

  -- … repeat for each FK to be repointed …
END$$;

-- Repoint review_request_reviewers.admin_id (the reported bug)
DO $$
DECLARE
  cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.review_request_reviewers'::regclass
      AND contype = 'f'
      AND EXISTS (
        SELECT 1 FROM pg_attribute
        WHERE attrelid = 'public.review_request_reviewers'::regclass
          AND attname = 'admin_id'
          AND attnum = ANY(conkey)
      )
  LOOP
    EXECUTE format(
      'ALTER TABLE public.review_request_reviewers DROP CONSTRAINT %I',
      cons_record.conname
    );
  END LOOP;
END$$;

ALTER TABLE public.review_request_reviewers
  ADD CONSTRAINT review_request_reviewers_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES public.users(id);

-- … repeat each block for each FK to be repointed …
```

### Migration lifecycle (CLI is responsible for the full cycle)

Per CLAUDE.md "Database Migration Workflow":

1. Write the migration file.
2. Commit + push the migration file.
3. `npm run db:push` to apply to prod.
4. `npm run db:status` — confirm Local + Remote pair with no drift.
5. CHANGES.md entry noting the migration filename + that it was pushed.

**If the orphan check raises an exception:** STOP, document the orphan rows in CHANGES.md, and ask Vanessa (via a status message) which resolution path she wants before proceeding.

### Verification (Batch 1)

```sql
-- Confirm the FKs now target users
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS target_table,
  ccu.column_name AS target_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.referential_constraints rc ON tc.constraint_name = rc.constraint_name
JOIN information_schema.key_column_usage ccu ON rc.unique_constraint_name = ccu.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_schema = 'public'
  AND tc.table_name IN (
    -- repointed tables from step 2 …
    'review_request_reviewers'
    -- …
  );
-- Every repointed (table, column) should now show target_table = 'users'
```

Manual:
1. As an admin (Vanessa), open a service detail page → Peer / Manager Review card → Request Review.
2. Pick yourself + another admin → add a section + a note → click Send.
3. The request creates successfully (no FK violation toast).
4. Repeat for any other previously-broken admin-actor flow.

### Commit message (Batch 1)

```
feat(db): repoint legacy profiles FKs to users for admin actors (B-138)

B-118's review_request_reviewers.admin_id FK pointed at the legacy
public.profiles table, predating B-127's auth refactor. Admins
created via the modern invite flow or SQL-only path have a row in
public.users but not public.profiles → adding reviewers failed
with a FK violation.

This migration audits every admin-actor FK still pointing at
profiles(id) (review_request_reviewers, review_requests,
service_profile_removals, application_section_reviews, …) and
repoints them to users(id) using the same DO-block pattern as
admin_users_fk_repoint_to_users (20260513014208). Pre-flight
orphan check RAISEs if any column has a value not in users, so
the migration can't silently break data.

Client-actor / owner FKs (applications.profile_id, etc.) intentionally
unchanged — they still reference the legacy profiles for that flow.
```

---

## Batch 2 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-138 — Legacy profiles FK sweep (done YYYY-MM-DD)`. Include:
- The full list of repointed FKs (from Batch 1 step 1's audit query)
- Any FKs identified but explicitly left alone (with reasoning)
- Any orphan rows found + how they were resolved (or that none were found)

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Mark resolved** (or add resolution note to) "Auth: legacy profiles table" — this sweep closes the remaining FK debt from that migration.
- **Add new Open entry** (if any ambiguous FKs were found): "Ambiguous profiles FKs from B-138 audit — see CHANGES.md for the list. Decide column-by-column whether they're admin-actor or client-actor and repoint accordingly."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **Migration lifecycle (Batch 1):** write, commit + push file, `db:push`, `db:status`, CHANGES.md.
2. **Per-batch commits:** two commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No application-code changes (the API routes already insert the correct user_id; only the schema constraint was wrong).
- No column renames.
- No automatic data healing — orphans require a manual decision.
- No client-actor FK changes — leave applications/profile_id and friends alone.
