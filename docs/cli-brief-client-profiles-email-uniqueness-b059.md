# B-059 — Unique-email constraint on client_profiles + duplicate-prevention guard

## Why

The duplicate-Bruce and duplicate-Vanessa incidents (both QA-surfaced
on 2026-05-05) come from the same root cause: when adding a person to
a service, the API blindly INSERTs a new `client_profiles` row even
when an active row with the same email already exists in the tenant.

This batch:

1. Adds a database constraint that makes the duplicate physically
   impossible.
2. Adds a server-side guard in the profile-creation routes so they
   surface a clean error / link-to-existing path instead of crashing
   when the constraint fires.
3. Logs identity-level uniqueness (passport, name+DOB, tax ID) as a
   future tech-debt item.

KYC-level uniqueness is **deferred** per user direction. We're
shipping the email constraint as the first layer; identity-attribute
constraints can come later as a separate batch when the data model
discussion has matured.

## Scope

- **In**: 1 migration (unique partial index on
  `client_profiles(tenant_id, lower(email))`); guard logic in the
  profile-creation API routes; tech-debt entry.
- **Out**: any constraint or check on `client_profile_kyc` data
  (passport_number, date_of_birth, tax_identification_number). Logged
  as tech-debt only.

## Working agreement

Single batch. Per CLAUDE.md "Database Migration Workflow", CLI MUST
run `npm run db:push` and confirm `npm run db:status` is clean
before considering the batch done. Commit, push, update CHANGES.md.

---

## Step 1 — Migration: unique partial index on client_profiles

### 1.1 — Create the migration file

`npx supabase migration new client_profiles_email_uniqueness`

The new file will be at `supabase/migrations/<timestamp>_client_profiles_email_uniqueness.sql`. Contents:

```sql
-- B-059 — One active client_profiles row per (tenant_id, lower(email)).
--
-- Partial index so:
-- - Soft-deleted rows (is_deleted = true) are exempt — past duplicates
--   that were cleaned up don't need to be hard-deleted.
-- - Profiles without an email (e.g., company secretary added on the fly
--   before email is known) are exempt — adding email later is the
--   trigger for uniqueness.
--
-- Lowercase the email so "Foo@bar.com" and "foo@bar.com" can't both
-- coexist (matches how the API already normalizes elsewhere).
--
-- Idempotent.

CREATE UNIQUE INDEX IF NOT EXISTS client_profiles_tenant_email_uq
  ON public.client_profiles (tenant_id, lower(email))
  WHERE is_deleted = false AND email IS NOT NULL AND email <> '';
```

### 1.2 — Pre-flight check before pushing

Before `npm run db:push`, sanity-check that no remaining duplicate
groups exist in production. Run this query in the Supabase SQL editor:

```sql
SELECT tenant_id, lower(email) AS email_norm, count(*) AS n
FROM client_profiles
WHERE is_deleted = false AND email IS NOT NULL AND email <> ''
GROUP BY 1, 2
HAVING count(*) > 1;
```

Expected: zero rows. If any rows are returned, the migration will
fail. Fix the data manually (rename + soft-delete the duplicates as
in the Vanessa cleanup) and re-check before proceeding.

If you find duplicates that aren't documented in CHANGES.md, **stop
and flag them** — don't blindly soft-delete; the user needs to pick
which one to keep.

### 1.3 — Apply the migration

```
npm run db:push
npm run db:status
```

Both must show all migrations applied + zero drift. If `db:push`
fails, check the pre-flight query — there's almost certainly a
remaining duplicate.

---

## Step 2 — Server-side guard in profile-create routes

The migration is the safety net; the app should never trigger it
under normal flow. Add a "lookup-then-insert" pattern to every route
that creates a `client_profiles` row.

### 2.1 — Routes to update

Audit these (the ones that currently INSERT into client_profiles):

- [`src/app/api/services/[id]/persons/route.ts`](src/app/api/services/[id]/persons/route.ts)
  — adds a person to a service. Today it inserts a fresh
  client_profiles row when `body.full_name` is provided
  (line 65-79).
- [`src/app/api/admin/profiles-v2/create/route.ts`](src/app/api/admin/profiles-v2/create/route.ts)
  — admin-side profile creation. Same pattern.
- [`src/app/api/admin/create-profile/route.ts`](src/app/api/admin/create-profile/route.ts)
  — older admin profile creation route. Confirm it's still used; if
  not, flag for deletion in tech-debt.
- [`src/app/api/profiles/create/route.ts`](src/app/api/profiles/create/route.ts)
  — client-side profile creation (representative invite path).

`grep -rn "client_profiles" src/app/api/ | grep -i "insert"` to
confirm full list.

### 2.2 — Lookup-then-insert pattern

For each route, before the INSERT, add:

```ts
if (body.email && body.email.trim() !== "") {
  const { data: existing } = await supabase
    .from("client_profiles")
    .select("id, full_name")
    .eq("tenant_id", tenantId)
    .ilike("email", body.email.trim())
    .eq("is_deleted", false)
    .maybeSingle();

  if (existing) {
    // Profile already exists — link to it instead of creating a duplicate.
    // Use existing.id wherever the new profile.id would have been used
    // (e.g., to insert into profile_service_roles).
    return /* the route's existing happy-path response, using existing.id */;
  }
}

// fall through to INSERT
```

The exact response shape and downstream insert (e.g.,
`profile_service_roles`) varies per route. Read each route's current
flow and adapt — don't blindly copy-paste.

### 2.3 — Surface a clear error if INSERT fails on the constraint

If the lookup-then-insert race somehow loses (two requests hit at
the same time), the DB constraint will reject the second insert. The
Postgres error code is `23505` (unique violation). Catch it and
return a clean response:

```ts
if (insertError) {
  if (insertError.code === "23505") {
    // Race: another request created the same email-keyed profile first.
    // Fall back to a fresh lookup.
    const { data: existing } = await supabase
      .from("client_profiles")
      .select("id, full_name")
      .eq("tenant_id", tenantId)
      .ilike("email", body.email.trim())
      .eq("is_deleted", false)
      .maybeSingle();
    if (existing) return /* link-to-existing response */;
  }
  return NextResponse.json({ error: insertError.message }, { status: 500 });
}
```

This is belt-and-suspenders — the lookup before insert handles the
common case; the catch handles the rare race.

### 2.4 — Don't normalize email on display

The `lower()` in the index is for matching only. Keep storing the
email as the user typed it (`Foo@Bar.com` stays as is). The lookup
uses `ilike` (case-insensitive) so the user's case preference is
preserved while the constraint is case-blind.

---

## Step 3 — Tech-debt entry for KYC-level uniqueness

Add to `CHANGES.md` Tech Debt → Open section:

```markdown
| 2X | **No identity-attribute uniqueness constraints** | Medium | B-059 added a unique-email constraint on `client_profiles`. Identity-level checks (passport_number, tax_identification_number, legal_name + date_of_birth) live on `client_profile_kyc` and aren't constrained — meaning two profiles could legitimately end up with the same passport number through two separate flows. Revisit when the data model around manager-vs-KYC roles is settled. Strongest candidates for a future constraint: (tenant_id, passport_number) WHERE passport_number IS NOT NULL, and a soft warning on (tenant_id, full_name, date_of_birth). |
```

(Replace `2X` with the next available number — check the tech-debt
table when you write the entry.)

---

## Step 4 — Verification

1. **Migration applied**:
   ```
   npm run db:status
   ```
   Shows the new migration paired Local + Remote. No pending.

2. **Constraint actually fires** — manually attempt an INSERT that
   would violate it via the Supabase SQL editor:
   ```sql
   INSERT INTO client_profiles (tenant_id, full_name, email, due_diligence_level)
   VALUES ('a1b2c3d4-0000-4000-8000-000000000001', 'Test Duplicate',
           'vanes.vr@gmail.com', 'cdd');
   ```
   Expected: `ERROR: duplicate key value violates unique constraint
   "client_profiles_tenant_email_uq"`. Roll back / abort.

3. **App-level guard works** — using the admin or client UI, try to
   add a person with an email that already exists in the tenant.
   Expected: instead of an error, the existing profile is reused
   (the new role row is added to it). No duplicate appears in
   `client_profiles`.

4. **Existing flows still work** — add a person with a new email →
   creates new profile + role. Add a person with no email → creates
   new profile (constraint ignores null emails). Soft-delete an
   existing profile → can re-create one with the same email
   (because the partial index excludes deleted rows).

5. **`npm run lint && npm run build && npm test`** — all green.

---

## CHANGES.md

```markdown
### 2026-05-XX — B-059 — Email uniqueness on client_profiles + dedup guard (Claude Code)

Resolves the recurring duplicate-profile bug class (Bruce Banner,
Vanessa Rangasamy, "Vanessa R", "PANIKEN VANESSA" all came from the
same root cause: API blindly INSERTs a new client_profiles row when
adding a person, even when an active row with the same email already
exists).

- Migration `<timestamp>_client_profiles_email_uniqueness.sql`:
  partial unique index on `(tenant_id, lower(email))` where
  `is_deleted = false AND email IS NOT NULL AND email <> ''`.
  Idempotent. Pushed to prod via `npm run db:push`.
- Server-side guard in `services/[id]/persons`,
  `admin/profiles-v2/create`, and `profiles/create` routes:
  lookup-then-insert pattern. If an active profile with the same
  `(tenant_id, email)` exists, link to it instead of creating a
  duplicate. Belt-and-suspenders catch on Postgres error 23505 to
  handle race conditions.
- New tech-debt entry: identity-attribute uniqueness (passport,
  tax ID, name + DOB) is not yet constrained. Email-level constraint
  is layer 1; identity-level is deferred to a future batch.
```

---

## Things to flag to the user

- 1 DB migration (single ALTER TABLE-equivalent — additive index).
  Per CLAUDE.md, CLI runs `npm run db:push` and `npm run db:status`
  before marking the batch done.
- The pre-flight check (Step 1.2) is critical — if there are
  remaining duplicate emails in prod beyond the Vanessa cleanup,
  the migration will fail. Stop and flag, don't blindly resolve.
- Server-side guard changes affect every flow that creates a
  client_profiles row. Test the admin AND client paths before
  pushing.

## Rollback

`git revert` the commit. Drop the index manually if needed:

```sql
DROP INDEX IF EXISTS client_profiles_tenant_email_uq;
```

The lookup-then-insert guard is purely additive — reverting the
code restores the prior behavior with no data side-effects.
