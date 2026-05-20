# B-145 — Wider profiles→users sweep for admin-name lookups

## Why

B-142 fixed three call sites where the app was reading admin names from the legacy `public.profiles` table instead of `public.users` (where modern-flow admins actually live). Six more call sites have the same pattern, surfacing as "Unknown" or blank labels in:

- Service-detail Audit Trail card (`actor_name` for modern admins)
- Service-detail People & KYC section reviews ("Reviewed by ___")
- Legacy Applications page (audit log + section reviews + admin lookups)
- Client audit-trail page

The fix is mechanical: PostgREST nested-select queries currently say `profiles:column(...)` or `profiles!column(...)` — change to `users:column(...)` / `users!column(...)` since B-138 repointed those FKs to `users(id)`. Column names (`full_name`, `email`) are identical on both tables.

This brief closes the read-side legacy-profiles debt for admin-name lookups. Write-side mirror writes + auth fallbacks stay as-is (intentional, see Out of Scope).

## Out of scope (do NOT do in B-145)

- **`src/lib/auth.ts:41`** — intentional auth fallback to `profiles` for legacy users. Leave alone.
- **`src/lib/filing-rep-invite.ts:67`, `src/app/api/admin/admins/route.ts:110`** — intentional invite-mirror writes that keep the auth fallback path working. Leave alone.
- **`src/app/api/admin/account/password/route.ts:69`** — intentional password-mirror write. Leave alone.
- **`src/app/api/admin/create-client/route.ts` + `src/app/api/admin/clients/[id]/delete/route.ts`** — legacy client-create / client-delete flow being phased out separately. Leave alone.
- **`src/app/api/admin/clients/[id]/send-invite/route.ts:31` + `src/app/api/admin/processes/[id]/request-documents/route.ts:43`** — join through `client_users → profiles` for the CLIENT user (not admin). Client side stays on profiles for now. Leave alone.
- **Schema changes** — purely query-side fixes; no migration.

## Known call sites to fix

From the audit Vanessa requested on 2026-05-20 (after B-142 shipped):

| File | Approx line | Current query | Effect |
|------|-------------|---------------|--------|
| `src/app/api/admin/clients/[id]/audit-trail/route.ts` | 48 | `profiles!actor_id(full_name, email)` | Audit trail actor names |
| `src/app/api/admin/applications/[id]/section-reviews/route.ts` | 22, 106 | `profiles:reviewed_by(full_name)` | Section review reviewer names |
| `src/app/(admin)/admin/applications/[id]/page.tsx` | 75 | `profiles(full_name)` (in audit log select) | Application audit log actor names |
| `src/app/(admin)/admin/applications/[id]/page.tsx` | 89 | `profiles:reviewed_by(full_name)` | Section reviews on application page |
| `src/app/(admin)/admin/applications/[id]/page.tsx` | 137 | `profiles!admin_id(full_name, email)` | Admin id → name lookup |
| `src/app/(admin)/admin/services/[id]/loadServiceDetail.ts` | 200 | `profiles:reviewed_by(full_name)` | Section reviews on service detail page |

Line numbers may drift slightly by the time CLI runs this. Use the file + the surrounding query as the locator, not the line number.

## The pattern

For each call site:

1. **Identify** the PostgREST nested-select syntax:
   - `profiles:<column>(...)` → use the default FK relationship targeting profiles, alias as the column
   - `profiles!<column>(...)` → explicit FK relationship name (rare in this codebase; usually used when there are multiple FKs to the same target)
   - `profiles(...)` (no column hint) → relies on PostgREST inferring the single FK relationship targeting profiles
2. **Change** to `users:<column>(...)` / `users!<column>(...)` / `users(...)` respectively. B-138 repointed the FKs from `profiles(id)` to `users(id)`; PostgREST now exposes the relationship under the new target table name.
3. **Test** by hitting the relevant page in the dev server (manual list in Verification below).

## Audit step (Batch 1, before editing)

Before making changes, CLI runs this audit to confirm the list above is complete:

```bash
grep -rn 'profiles[!:](' src/ --include="*.ts" --include="*.tsx" | grep -v 'client_users\|client_user_id'
grep -rn '"profiles[!:][a-z_]*("' src/ --include="*.ts" --include="*.tsx" | grep -v 'client_users\|client_user_id'
grep -rn '\.from("profiles")' src/ --include="*.ts" | grep -v 'auth.ts\|admins/route\|filing-rep-invite\|account/password\|create-client\|clients/\[id\]/delete'
```

If the audit surfaces files NOT in the known list above:

- If it's clearly an admin-name lookup that should switch to users → fix it in Batch 2
- If it's a client-side profile reference or one of the explicitly out-of-scope intentional uses → leave alone, document in CHANGES.md

---

## Batch 1 — Run the audit, capture the list

Capture the audit output to verify the known six. If the audit finds anything new:

- Add it to the fix list with reasoning, OR
- Add it to the "intentional / out of scope" list with reasoning

No code changes in this batch — pure documentation step. The commit message captures the audit result so the migration is reviewable.

### Commit message (Batch 1)

```
docs: B-145 audit — confirm read-side profiles→users sweep list

Pre-flight audit before making changes. Confirms the six known
admin-name-lookup queries that still target legacy public.profiles
(audit-trail route, application section-reviews route, applications
page audit/reviews/admin lookups, loadServiceDetail section
reviews). [Then list any additional findings.] Intentional uses
(auth fallback, invite mirrors, legacy client flows) explicitly
left alone.
```

(This is a docs-only commit. If you want to skip this batch to save round-trips, fold the audit + verification into Batch 2's commit message — CLI's call.)

---

## Batch 2 — Apply the swaps

Six edits (or whatever the audit settled on). Each is a one-line query swap. Examples:

```diff
- profiles!actor_id(full_name, email)
+ users!actor_id(full_name, email)
```

```diff
- profiles:reviewed_by(full_name)
+ users:reviewed_by(full_name)
```

```diff
  .select(`
    id, application_id, action, actor_id, actor_role, actor_name,
    entity_type, entity_id, previous_value, new_value, detail,
-   created_at, profiles(full_name)
+   created_at, users(full_name)
  `)
```

After each edit, ensure the surrounding TypeScript cast / type still resolves — the row shape returned from PostgREST changes the key from `profiles` to `users`, so any downstream code that reads `row.profiles?.full_name` becomes `row.users?.full_name`. CLI: grep for `.profiles?.` and `.profiles.full_name` near each edited query and adjust accordingly.

### Verification (Batch 2)

```bash
npm run build      # type check catches any rows where the .profiles? access wasn't updated
npm run lint       # any unused imports / leftover typings
```

Manual:
1. **Service detail Audit Trail**: open a service that's had recent activity by a modern-flow admin. The audit trail rows should show the admin's full_name in the "Actor" column instead of "Unknown" (or empty).
2. **Section reviews on service detail**: mark a section as reviewed by a modern admin → the "Reviewed by ___" label resolves to the admin's name.
3. **Application detail page** (legacy `/admin/applications/[id]`): audit log + section reviews + assigned admin all show real names instead of blanks.
4. **Client audit-trail page** (legacy `/admin/clients/[id]` audit area): actor names resolve.

### Commit message (Batch 2)

```
fix: repoint admin-name lookup queries from profiles to users (B-145)

Six PostgREST nested-select queries still resolved admin names
through the legacy public.profiles table. After B-138 repointed
those FKs to users(id), the relationship name in PostgREST
changes too — these queries silently returned null for any admin
created via the modern invite flow (or the SQL-only Super User
path), so the UI fell back to "Unknown" or blank labels in the
audit trail, section-review byline, and applications page.

Files updated:
- src/app/api/admin/clients/[id]/audit-trail/route.ts
- src/app/api/admin/applications/[id]/section-reviews/route.ts
  (two occurrences)
- src/app/(admin)/admin/applications/[id]/page.tsx (three
  occurrences: audit log select, section-review select, admin
  lookup select)
- src/app/(admin)/admin/services/[id]/loadServiceDetail.ts

Each swap is identical: profiles:column(...) → users:column(...)
(or profiles!column → users!column, or profiles(...) → users(...))
. Column names (full_name, email) are identical on both tables.
Downstream TypeScript that reads row.profiles?.full_name now
reads row.users?.full_name.

Intentional uses (auth fallback, invite-mirror writes, legacy
client-create/delete) explicitly untouched.
```

---

## Batch 3 — CHANGES.md + tech debt resolution

### CHANGES.md

Top-of-file entry under `## B-145 — Wider profiles→users read sweep (done YYYY-MM-DD)`. List the six files touched (or however many the audit settled on).

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Resolve** the open entry added in B-142: "Audit remaining read-side `profiles` queries for the same legacy-lookup pattern" — mark as done.
- **Add new Open entry** (only if the audit found ambiguous cases not yet decided): list them with the reasoning so a future brief picks them up.

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure query change.
2. **Per-batch commits:** three commits (audit doc, swap fixes, CHANGES.md).
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No auth.ts changes (intentional fallback stays).
- No invite-mirror write changes (filing-rep-invite + admins/route stay).
- No legacy client-flow changes (create-client + clients/[id]/delete stay).
- No client-side profile FK changes (clients/[id]/send-invite + processes/[id]/request-documents stay — they reference profiles for the CLIENT user, not admin).
- No schema migrations.
