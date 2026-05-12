# CLI Brief — B-094 Eliminate "System" Attribution from Audit Trail

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** Yes — one migration with `get_actor_info()` update + backfill of existing null `actor_name` rows. CLI MUST run `npm run db:push` + `npm run db:status` per CLAUDE.md.
**Touches AI verification:** No
**Touches API:** No new routes; updates 5 existing routes that use the `writeAuditLog` utility, plus the inline status-change audit insert in `services/[id]/route.ts`.

---

## Why this batch exists

The right-rail Audit Trail and the standalone Audit Trail panel on `/admin/services/[id]` show many entries attributed to **"System"** — confusing for compliance-style review and not actually true (the rows were written by an admin acting through an admin API route).

Cause confirmed against live data:

| Path | `actor_name` populated? |
|---|---|
| Inline insert in [src/app/api/admin/services/\[id\]/route.ts:73-82](src/app/api/admin/services/[id]/route.ts:73) for status changes | ✓ Yes (does an extra DB lookup to fetch `full_name`) |
| [src/lib/audit/writeAuditLog.ts](src/lib/audit/writeAuditLog.ts) — used by 5 routes (section-reviews, kyc-fields, substance, actions, documents/upload) | ✗ The utility doesn't have an `actor_name` parameter, so every caller writes `actor_name = null` |
| DB trigger `log_application_status_change` → `get_actor_info()` at [supabase/schema.sql:330](supabase/schema.sql:330) | ✓ when `auth.uid()` resolves; ✗ when service-role bypasses it (returns `'system'`/`'system'`) |

The UI fallback at [AuditTrail.tsx:82](src/components/admin/AuditTrail.tsx:82) — `entry.actor_name || entry.profiles?.full_name || "System"` — surfaces the null as **"System"**.

Vanessa's call: design (a) — **keep both `actor_id` AND `actor_name`**. Snapshot the name at write time (historically accurate). Don't switch to ID-only with a display-time join.

Per session shape: `session.user.name` is already on every server-side `auth()` result (set in [src/lib/auth.ts:110-116](src/lib/auth.ts:110)). No extra DB lookup needed — just use `session.user.name`.

After this brief:
- `writeAuditLog` requires `actor_name` and all 5 callers pass it from the session.
- The inline insert in `services/[id]/route.ts` drops its redundant `users` table lookup and uses `session.user.name`.
- `get_actor_info()` falls back to a session config variable when `auth.uid()` returns null, so future DB-trigger writes from service-role can be attributed correctly when admin routes set the variable.
- The 5 existing rows with `actor_name = null` are backfilled to `'Jane Doe'` (test data).

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main` — worktree is on a feature branch; CLI pulls main) + update CHANGES.md.
2. `npm run build` clean.
3. **Migration MUST be pushed.** After the migration file is created, run `npm run db:push` then `npm run db:status` and confirm both local + remote show the new file with no drift. Add a CHANGES.md entry noting the migration filename + that it was pushed (per the migration workflow rule in CLAUDE.md).
4. **Don't change the audit_log schema.** No new columns, no column drops. `actor_id` + `actor_role` + `actor_name` stay as the three actor fields.
5. **Don't change the AuditTrail UI's "System" fallback string** in this brief. The fallback should never trigger after this fix — leaving it as `"System"` makes it a useful regression flag if a new code path forgets to pass `actor_name` in the future.
6. **Use `session.user.name`** as the primary source for `actor_name`. Fallback chain: `session.user.name ?? session.user.email ?? "Unknown user"`. Never do a DB lookup just to fetch the actor's name when the session already has it.

---

## Step 1 — Update `writeAuditLog` to require `actor_name`

File: [src/lib/audit/writeAuditLog.ts](src/lib/audit/writeAuditLog.ts).

Add `actor_name: string` to `WriteAuditLogParams` (required, not optional). Include it in the `.insert(...)` payload.

```diff
 export interface WriteAuditLogParams {
   actor_id: string;
   actor_role?: "admin" | "client" | "system";
+  actor_name: string;
   action: string;
   ...
 }
```

```diff
   const { error } = await supabase.from("audit_log").insert({
     actor_id: params.actor_id,
     actor_role: params.actor_role ?? "admin",
+    actor_name: params.actor_name,
     action: params.action,
     ...
   });
```

Update the JSDoc header comment to mention `actor_name` in the column list.

The TypeScript type system will then immediately flag every caller that doesn't pass `actor_name` — which is the next step's todo list.

## Step 2 — Update all 5 callers of `writeAuditLog`

Files (each currently calls `writeAuditLog` without `actor_name`):

1. [src/app/api/admin/applications/[id]/section-reviews/route.ts](src/app/api/admin/applications/[id]/section-reviews/route.ts) (~line 85)
2. [src/app/api/admin/profiles/[id]/kyc-fields/route.ts](src/app/api/admin/profiles/[id]/kyc-fields/route.ts) (~line 333)
3. [src/app/api/admin/services/[id]/substance/route.ts](src/app/api/admin/services/[id]/substance/route.ts)
4. [src/app/api/admin/services/[id]/actions/route.ts](src/app/api/admin/services/[id]/actions/route.ts)
5. [src/app/api/admin/services/[id]/documents/upload/route.ts](src/app/api/admin/services/[id]/documents/upload/route.ts)

In each, add `actor_name` to the `writeAuditLog` call:

```ts
actor_name: session.user.name ?? session.user.email ?? "Unknown user",
```

Each of these routes already has `session` in scope (they call `await auth()` near the top). If a route has `session` shadowed or named differently, use whatever variable holds the NextAuth session — don't introduce new auth calls.

## Step 3 — Simplify the inline status-change insert

File: [src/app/api/admin/services/[id]/route.ts](src/app/api/admin/services/[id]/route.ts), lines ~64-86.

Replace the `users` table lookup + the `actor` variable + the `actorName` computation with a direct read of `session.user.name`:

```diff
   if ("status" in patch && previousStatus !== patch.status) {
-    const { data: actor } = await supabase
-      .from("users")
-      .select("full_name")
-      .eq("id", session.user.id)
-      .maybeSingle();
-    const actorName =
-      (actor as { full_name: string | null } | null)?.full_name?.trim() || null;
-
     const { error: auditError } = await supabase.from("audit_log").insert({
       actor_id: session.user.id,
       actor_role: "admin",
-      actor_name: actorName,
+      actor_name: session.user.name ?? session.user.email ?? "Unknown user",
       action: "status_changed",
       entity_type: "service",
       entity_id: id,
       previous_value: { status: previousStatus },
       new_value: { status: patch.status as string },
     });
```

This both fixes correctness (no more null when `users.full_name` is null but session has a name) and saves one DB round-trip per status change.

## Step 4 — Sanity-grep for other inline audit_log inserts

Run:

```bash
grep -rn "from(\"audit_log\").insert\|from('audit_log').insert" src/ --include='*.ts'
```

Anything beyond the two paths handled in Steps 1-3 should also pass `actor_name`. Most likely candidates: `clients/[id]/delete/route.ts` (saw earlier — it already passes `actor_name`), `applications/[id]/route.ts` (also already passes it). Verify each.

If any other inline insert exists that doesn't pass `actor_name`, fix it the same way: pull from `session.user.name ?? session.user.email ?? "Unknown user"`.

## Step 5 — Migration: harden `get_actor_info()` + backfill nulls

Generate the migration:

```bash
npx supabase migration new audit_actor_name_fix
```

Edit the new file to contain:

```sql
-- B-094 — Audit trail actor attribution
--
-- Two fixes in one migration:
--   1) Backfill existing audit_log rows where actor_name is null.
--      All current data is testing — set them to 'Jane Doe' (per
--      Vanessa's call) so the UI stops showing 'System'.
--   2) Harden get_actor_info() so when auth.uid() is null (e.g., a
--      service-role connection that bypasses RLS), the function falls
--      back to a session-local config variable that admin routes can
--      set before mutations. This prevents future trigger-driven audit
--      writes from defaulting to 'system'.

-- 1. Backfill
UPDATE audit_log
SET actor_name = 'Jane Doe'
WHERE actor_name IS NULL;

-- 2. Harden get_actor_info
CREATE OR REPLACE FUNCTION public.get_actor_info(
  out v_actor_id uuid,
  out v_actor_role text,
  out v_actor_name text
) AS $$
DECLARE
  cfg_actor_id text;
  cfg_actor_role text;
  cfg_actor_name text;
BEGIN
  v_actor_id := auth.uid();

  -- Service-role / non-RLS connections: auth.uid() is null.
  -- Try session config fallback (set by admin routes when needed).
  IF v_actor_id IS NULL THEN
    cfg_actor_id := current_setting('app.actor_id', true);

    IF cfg_actor_id IS NOT NULL AND cfg_actor_id <> '' THEN
      v_actor_id := cfg_actor_id::uuid;
      cfg_actor_role := current_setting('app.actor_role', true);
      cfg_actor_name := current_setting('app.actor_name', true);
      v_actor_role := COALESCE(NULLIF(cfg_actor_role, ''), 'admin');
      v_actor_name := COALESCE(NULLIF(cfg_actor_name, ''), 'Unknown user');
      RETURN;
    END IF;

    -- Last-resort fallback (no session config either) — keep the
    -- existing 'system' attribution so we can still spot it in QA.
    v_actor_role := 'system';
    v_actor_name := 'system';
    RETURN;
  END IF;

  -- Standard auth.uid() path: look up profile name + role.
  SELECT COALESCE(full_name, email)
  INTO v_actor_name
  FROM public.profiles
  WHERE id = v_actor_id;

  IF EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = v_actor_id) THEN
    v_actor_role := 'admin';
  ELSIF EXISTS(SELECT 1 FROM public.client_users WHERE user_id = v_actor_id) THEN
    v_actor_role := 'client';
  ELSE
    v_actor_role := 'system';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

(Idempotent: the UPDATE is conditional on null; the function is `CREATE OR REPLACE`.)

After saving the file:

```bash
npm run db:push
npm run db:status
```

Confirm `db:status` shows both Local and Remote columns matching for the new file with no drift. If anything is mismatched, STOP and document the mismatch in CHANGES.md (per migration workflow rule).

## Step 6 — Tech debt note

Append an entry to [docs/tech-debt.md](docs/tech-debt.md) under a 2026-05-12 heading (alongside the B-093 entry — same day):

> **Admin routes don't set `app.actor_*` session config before mutations.**
> *Spawned by:* [B-094](cli-brief-audit-actor-name-b094.md).
> *What:* Add a small `setActorContext(supabase, session)` helper and call it at the top of every admin API route that uses `createAdminClient()` and performs a mutation that may fire a DB-side audit trigger. Today no service-table trigger writes audit_log, so the hardened `get_actor_info()` from this brief is purely defensive — but if a future migration adds a status-change trigger on `services` (or similar), admin routes will need to push the actor identity into the session config or those audits will revert to `'system'`.
> *Why deferred:* Currently unused — the app-layer `writeAuditLog` fix covers the symptom Vanessa observed. The session-config plumbing is a future-proofing layer; deferred to keep B-094 small.

## Step 7 — Smoke test (manual; document in CHANGES.md)

1. **Backfill check.** Open `/admin/services/[id]` for any service. The right-rail Audit Trail panel shows existing entries with the actor name **"Jane Doe"** (not "System") on every row.
2. **New write — section review.** Save a section review on a service. The Audit Trail picks up a new entry attributed to your logged-in user (the name shown should match what's in `session.user.name`, typically "Jane Doe").
3. **New write — KYC field.** Edit a KYC field on an admin profile and save. New audit entry attributed correctly.
4. **New write — status change.** Click the new B-093 `Move to <next>` button on the right-rail Status card. The audit entry for `status_changed` is attributed to the admin user (this exercises the inline insert in `services/[id]/route.ts` that Step 3 cleaned up).
5. **No "System" entries appear** in the audit trail UI after the above steps. Search across the visible entries — nothing should display as "System".
6. **TypeScript guards.** `npm run build` complains if any `writeAuditLog` call site doesn't pass `actor_name` — that's the type system catching a missed caller. Fix the call site, don't suppress the type error.
7. **DB regression.** Run a quick query (via Supabase dashboard or `npx supabase db query`) and confirm new rows have `actor_name` populated:
   ```sql
   SELECT actor_role, actor_name, action, created_at
   FROM audit_log
   ORDER BY created_at DESC LIMIT 10;
   ```
   Every recent row should have a non-null `actor_name`.

If 1–6 fails, fix in the same batch.

---

## CHANGES.md format

```md
### 2026-05-12 — B-094 — Eliminate "System" attribution from audit trail (Claude Code)

Audit trail was showing many entries as "System" because the `writeAuditLog` utility didn't accept an `actor_name` parameter — every caller wrote `actor_name = null`, and the UI fallback displayed null as "System".

- `writeAuditLog` utility now requires `actor_name: string`. All 5 callers (section-reviews, kyc-fields, substance, actions, documents/upload) pass `session.user.name ?? session.user.email ?? "Unknown user"`.
- Inline status-change insert in `services/[id]/route.ts` dropped its redundant `users` table lookup and uses `session.user.name` directly (saves one round-trip per status change).
- New migration `<YYYYMMDDHHMMSS>_audit_actor_name_fix.sql`: backfills `actor_name = 'Jane Doe'` on all existing rows where actor_name was null (testing data per Vanessa's call); hardens `get_actor_info()` to fall back to session config (`app.actor_id` / `app.actor_role` / `app.actor_name`) when `auth.uid()` returns null. Pushed via `npm run db:push`; `db:status` confirms paired Local + Remote with no drift.
- Schema design: kept option (a) — `actor_id + actor_name` snapshot at write time. Did NOT switch to ID-only with a display-time join (Vanessa's call: historical accuracy preferred).

UI fallback in `AuditTrail.tsx` (`actor_name || profiles?.full_name || "System"`) intentionally left as-is — it now serves as a regression flag if a future code path forgets to pass `actor_name`.

Tech debt: separate entry in `docs/tech-debt.md` for the session-config plumbing in admin routes (future-proofing for DB-trigger audit writes).

Smoke test: <pass/fail from Step 7>.
`npm run build` clean. `npm run db:status` confirms migration pushed.
```

---

## What NOT to do

- Do NOT change the audit_log schema (no new columns, no drops).
- Do NOT introduce a runtime DB lookup for the user's name. Use `session.user.name` from `auth()` — the JWT already carries it.
- Do NOT change the "System" fallback string in the UI. It's a regression flag now.
- Do NOT add the `setActorContext` helper in this brief — that's tech debt deferred.
- Do NOT switch to ID-only attribution. Vanessa explicitly chose option (a).
- Do NOT skip `npm run db:push` + `db:status`. Migration-touching briefs require both per CLAUDE.md.
- Do NOT backfill rows beyond actor_name. The other fields (actor_id, actor_role) on the existing rows are correct.
- Do NOT restart the dev server yourself.
