# CLI Brief — B-095 Audit-Log Coverage Sweep + Service-Created Backfill

**Status:** Ready for CLI
**Estimated batches:** 1 (large)
**Touches migrations:** Yes — one migration that backfills `service_created` (and `client_created` / `profile_created`) audit rows. CLI MUST run `npm run db:push` + `npm run db:status` per CLAUDE.md.
**Touches AI verification:** No
**Touches API:** Yes — every Tier A + Tier B admin mutation route gets a `writeAuditLog` call. No prop/payload changes; pure additive.
**Builds on:** B-093 (right-rail Status card), B-094 (writeAuditLog now requires `actor_name`).

---

## Why this batch exists

After B-094, audit-trail entries that were getting written all carry the correct `actor_name`. But a large number of admin mutation routes don't write **any** audit row — so the affected actions never appear in the audit trail at all, and the B-093 right-rail Status card falls back to its hardcoded `"Created on <date> by system"` string when there's no relevant audit row to display.

The most visible symptom: open a service that's never had a status change → Status card reads **"Created on 12 Apr 2026 by system"** (Vanessa's screenshot). The "system" wording is misleading — the service was created by an admin user, just not logged.

Diagnosis from `grep`: 37 mutation routes under `src/app/api/admin/` perform a write but don't call `writeAuditLog`. Vanessa wants the full sweep — Tier A (operational/compliance-relevant) + Tier B (configuration management) — plus the service-created backfill so the existing services in the DB read sensibly from B-093's Status card.

After this brief:
- Every operational mutation (services, clients, profiles, roles, invites, application/process state, document-update requests) writes an audit row with full actor identity.
- Every configuration mutation (templates, document types, KB, role requirements, due diligence) also writes an audit row. Configuration changes show up in admin-only audit views going forward.
- Existing services get a backfilled `service_created` audit row attributed to `Jane Doe`. Existing clients and client_profiles get the same. (Testing data — Vanessa's call.)
- The B-093 Status card no longer falls back to "by system"; it reads the new `service_created` row when no status change exists.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main` — worktree is on a feature branch; CLI pulls main) + update CHANGES.md.
2. `npm run build` clean.
3. **Migration MUST be pushed.** After creating the migration file, run `npm run db:push` then `npm run db:status` and confirm both Local + Remote columns match for the new file. If not, STOP and document the mismatch in CHANGES.md.
4. **One uniform `writeAuditLog` call per route**, slotted in **after** the mutation succeeds (don't block the response on an audit failure — `writeAuditLog` is best-effort by design).
5. **Use `session.user.name ?? session.user.email ?? "Unknown user"`** for `actor_name` everywhere. Never do a DB lookup to fetch the actor's name when the session already carries it.
6. **Don't change the existing `writeAuditLog` signature.** It already accepts what we need after B-094.
7. **Don't touch:**
   - Anything under `src/app/api/admin/migrations/*` — those are one-time setup helpers; not user actions; not auditable.
   - `src/app/api/admin/clients/[id]/audit-trail/route.ts` (read-only) and similar read endpoints.
   - Routes that already audit (the 16 listed under "already-audited" below) — leave their existing audit writes intact. If they're inconsistent in any way, that's tech debt, not this brief.
8. **No `actor_role` other than `"admin"`** in these routes — every route in scope is gated to admins (`if (!session || session.user.role !== "admin") return forbidden`). Don't introduce conditional role detection.
9. **Don't restart the dev server.**

---

## Step 1 — The pattern (template for every route)

Inside each route handler, **after** the primary mutation succeeds, add:

```ts
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

// ... after the mutation succeeds:
await writeAuditLog(supabase, {
  actor_id: session.user.id,
  actor_role: "admin",
  actor_name: session.user.name ?? session.user.email ?? "Unknown user",
  action: "<see table below>",
  entity_type: "<see table below>",
  entity_id: <the affected row's id, or null if the action isn't tied to a single row>,
  previous_value: <for PATCH/DELETE: snapshot of changed fields before the mutation; for POST: null>,
  new_value: <for POST/PATCH: snapshot of changed fields after the mutation; for DELETE: null>,
  detail: <optional: any extra context that helps the audit reader (e.g., file_name, note)>,
});
```

Rules of thumb:

- **POST (create)** — `previous_value: null`, `new_value: { id, ...key fields of the new row }`.
- **PATCH (update)** — `previous_value: <only the fields that changed, pre-state>`, `new_value: <same fields, post-state>`. Don't dump the entire row; capture what actually changed.
- **DELETE** — `previous_value: <the row that was deleted (key fields)>`, `new_value: null`.
- Audit is best-effort: catch its error internally (the utility already does this), don't fail the request if the audit write fails.
- Order: do the audit write **after** the mutation has committed (or after the API has decided success). Don't block the success path on the audit.

## Step 2 — Tier A route list (operational data — must audit)

For each row, add the audit pattern with the listed `action` + `entity_type`. Tier A routes are the priority because they affect client / service / profile data that compliance reviewers actually care about.

| Route | HTTP | `action` | `entity_type` | `entity_id` source |
|---|---|---|---|---|
| `src/app/api/admin/services/route.ts` | POST | `service_created` | `service` | new service id |
| `src/app/api/admin/services/[id]/roles/route.ts` | POST | `service_role_assigned` | `service` | service id; `detail: { role, profile_id }` |
| `src/app/api/admin/services/[id]/roles/[roleId]/route.ts` | PATCH | `service_role_updated` | `service` | service id; `detail: { role_id, changes }` |
| `src/app/api/admin/services/[id]/roles/[roleId]/route.ts` | DELETE | `service_role_removed` | `service` | service id; `detail: { role_id }` |
| `src/app/api/admin/services/[id]/section-override/route.ts` | POST/PATCH | `service_section_override_set` | `service` | service id; `detail: { section_key, override }` |
| `src/app/api/admin/create-client/route.ts` | POST | `client_created` | `client` | new client id |
| `src/app/api/admin/create-profile/route.ts` | POST | `profile_created` | `client_profile` | new profile id |
| `src/app/api/admin/profiles-v2/create/route.ts` | POST | `profile_created` | `client_profile` | new profile id |
| `src/app/api/admin/profiles-v2/[id]/route.ts` | PATCH | `profile_updated` | `client_profile` | profile id |
| `src/app/api/admin/profiles-v2/[id]/route.ts` | DELETE | `profile_deleted` | `client_profile` | profile id |
| `src/app/api/admin/profiles-v2/[id]/kyc/route.ts` | PATCH | `profile_kyc_updated` | `client_profile` | profile id (matches existing convention in kyc-fields route) |
| `src/app/api/admin/profiles/roles/route.ts` | POST | `profile_role_added` | `client_profile` | profile id; `detail: { role }` |
| `src/app/api/admin/profiles/roles/[id]/route.ts` | PATCH | `profile_role_updated` | `client_profile` | profile id; `detail: { role_id, changes }` |
| `src/app/api/admin/profiles/roles/[id]/route.ts` | DELETE | `profile_role_removed` | `client_profile` | profile id; `detail: { role_id }` |
| `src/app/api/admin/profiles/[id]/requirement-overrides/route.ts` | POST | `requirement_override_added` | `client_profile` | profile id |
| `src/app/api/admin/profiles/[id]/requirement-overrides/[reqId]/route.ts` | DELETE | `requirement_override_removed` | `client_profile` | profile id |
| `src/app/api/admin/profiles/[id]/send-invite/route.ts` | POST | `profile_invite_sent` | `client_profile` | profile id; `detail: { email }` |
| `src/app/api/admin/clients/[id]/route.ts` | PATCH | `client_updated` | `client` | client id |
| `src/app/api/admin/clients/[id]/account-manager/route.ts` | PATCH | `account_manager_changed` | `client` | client id; `detail: { previous_manager_id, new_manager_id }` |
| `src/app/api/admin/clients/[id]/send-invite/route.ts` | POST | `client_invite_sent` | `client` | client id; `detail: { email }` |
| `src/app/api/admin/applications/upsert/route.ts` | POST | `application_upserted` | `application` | application id |
| `src/app/api/admin/processes/start/route.ts` | POST | `process_started` | `process` | new process id |
| `src/app/api/admin/processes/[id]/route.ts` | PATCH | `process_updated` | `process` | process id |
| `src/app/api/admin/processes/[id]/upload/route.ts` | POST | `process_document_uploaded` | `process` | process id; `detail: { file_name }` |
| `src/app/api/admin/processes/[id]/request-documents/route.ts` | POST | `process_documents_requested` | `process` | process id |
| `src/app/api/admin/documents/[id]/request-update/route.ts` | POST | `document_update_requested` | `document` | document id |

## Step 3 — Tier B route list (configuration changes)

Same pattern, lower priority (config changes — admins managing the system itself, not client/service data).

| Route | HTTP | `action` | `entity_type` |
|---|---|---|---|
| `src/app/api/admin/document-types/route.ts` | POST | `document_type_created` | `document_type` |
| `src/app/api/admin/document-types/[id]/route.ts` | PATCH | `document_type_updated` | `document_type` |
| `src/app/api/admin/document-types/[id]/route.ts` | DELETE | `document_type_deleted` | `document_type` |
| `src/app/api/admin/document-types/[id]/rules/route.ts` | POST/PATCH | `document_type_rules_updated` | `document_type` |
| `src/app/api/admin/knowledge-base/route.ts` | POST | `kb_entry_created` | `kb_entry` |
| `src/app/api/admin/knowledge-base/[id]/route.ts` | PATCH | `kb_entry_updated` | `kb_entry` |
| `src/app/api/admin/knowledge-base/[id]/route.ts` | DELETE | `kb_entry_deleted` | `kb_entry` |
| `src/app/api/admin/role-requirements/route.ts` | POST | `role_requirement_created` | `role_requirement` |
| `src/app/api/admin/role-requirements/[id]/route.ts` | PATCH | `role_requirement_updated` | `role_requirement` |
| `src/app/api/admin/role-requirements/[id]/route.ts` | DELETE | `role_requirement_deleted` | `role_requirement` |
| `src/app/api/admin/settings/templates/route.ts` | POST | `service_template_created` | `service_template` |
| `src/app/api/admin/settings/templates/[id]/route.ts` | PATCH | `service_template_updated` | `service_template` |
| `src/app/api/admin/settings/templates/[id]/route.ts` | DELETE | `service_template_deleted` | `service_template` |
| `src/app/api/admin/settings/templates/[id]/requirements/route.ts` | POST | `template_requirement_added` | `service_template` |
| `src/app/api/admin/settings/requirements/[id]/route.ts` | PATCH | `template_requirement_updated` | `service_template` |
| `src/app/api/admin/settings/requirements/[id]/route.ts` | DELETE | `template_requirement_removed` | `service_template` |
| `src/app/api/admin/due-diligence/requirements/route.ts` | POST | `dd_requirement_created` | `due_diligence_requirement` |
| `src/app/api/admin/due-diligence/requirements/[id]/route.ts` | PATCH | `dd_requirement_updated` | `due_diligence_requirement` |
| `src/app/api/admin/due-diligence/requirements/[id]/route.ts` | DELETE | `dd_requirement_deleted` | `due_diligence_requirement` |
| `src/app/api/admin/due-diligence/settings/[level]/route.ts` | PATCH | `dd_settings_updated` | `due_diligence_settings` |

If a file you encounter doesn't exist or has a different shape than the table implies, skip that row and note it in CHANGES.md (the table was generated from a `grep` — minor drift is OK).

## Step 4 — Verify and **don't double-audit** routes that already log

These 16 routes **already** call `writeAuditLog` or have an inline `audit_log` insert. **Don't add a second write** to them. If you spot any that don't pass `actor_name` (post-B-094 we expect all to pass it), fix in this brief — that's a B-094 gap not a duplicate:

```
src/app/api/admin/applications/[id]/route.ts
src/app/api/admin/applications/[id]/section-reviews/route.ts
src/app/api/admin/applications/[id]/stage/route.ts
src/app/api/admin/clients/[id]/delete/route.ts
src/app/api/admin/clients/[id]/due-diligence/route.ts
src/app/api/admin/documents/[id]/admin-status/route.ts
src/app/api/admin/documents/[id]/override/route.ts
src/app/api/admin/documents/[id]/rerun-ai/route.ts
src/app/api/admin/documents/library/[id]/review/route.ts
src/app/api/admin/profiles/[id]/kyc-fields/route.ts
src/app/api/admin/profiles/[id]/route.ts
src/app/api/admin/services/[id]/actions/route.ts
src/app/api/admin/services/[id]/documents/upload/route.ts
src/app/api/admin/services/[id]/route.ts
src/app/api/admin/services/[id]/substance/route.ts
```

(`audit-trail/route.ts` is read-only — also leave it alone.)

## Step 5 — Backfill migration

Create `supabase/migrations/<YYYYMMDDHHMMSS>_audit_backfill_entity_created.sql`:

```sql
-- B-095 — Backfill `*_created` audit rows so the right-rail Status
-- card (B-093) and audit trail no longer fall back to "by system" on
-- entities that pre-date audit logging. Testing data — attribute all
-- to Jane Doe (Vanessa's call).

DO $$
DECLARE
  jane_id uuid;
BEGIN
  -- Find Jane Doe's profile (admin user)
  SELECT id INTO jane_id FROM public.profiles
  WHERE email = 'vanes.vr@gmail.com'
  LIMIT 1;

  IF jane_id IS NULL THEN
    RAISE NOTICE 'B-095 backfill: Jane Doe profile not found; skipping';
    RETURN;
  END IF;

  -- Services: insert a service_created audit per service that doesn't
  -- already have one.
  INSERT INTO public.audit_log (
    application_id, actor_id, actor_role, actor_name,
    action, entity_type, entity_id, new_value, created_at
  )
  SELECT
    NULL, jane_id, 'admin', 'Jane Doe',
    'service_created', 'service', s.id,
    jsonb_build_object('service_number', s.service_number, 'status', s.status),
    s.created_at
  FROM public.services s
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_log a
    WHERE a.entity_type = 'service'
      AND a.entity_id = s.id
      AND a.action = 'service_created'
  );

  -- Clients
  INSERT INTO public.audit_log (
    application_id, actor_id, actor_role, actor_name,
    action, entity_type, entity_id, new_value, created_at
  )
  SELECT
    NULL, jane_id, 'admin', 'Jane Doe',
    'client_created', 'client', c.id,
    jsonb_build_object('company_name', c.company_name),
    c.created_at
  FROM public.clients c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_log a
    WHERE a.entity_type = 'client'
      AND a.entity_id = c.id
      AND a.action = 'client_created'
  );

  -- Client profiles
  INSERT INTO public.audit_log (
    application_id, actor_id, actor_role, actor_name,
    action, entity_type, entity_id, new_value, created_at
  )
  SELECT
    NULL, jane_id, 'admin', 'Jane Doe',
    'profile_created', 'client_profile', cp.id,
    jsonb_build_object('full_name', cp.full_name, 'record_type', cp.record_type),
    cp.created_at
  FROM public.client_profiles cp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.audit_log a
    WHERE a.entity_type = 'client_profile'
      AND a.entity_id = cp.id
      AND a.action = 'profile_created'
  );

END $$;
```

If the `email` column or any referenced column doesn't match the actual schema (verify against live data), adjust accordingly — but keep the backfill scoped to the three entity types (services, clients, client_profiles). Other entities don't surface "by system" in any UI we're touching, so backfilling them is unnecessary.

After saving:
```bash
npm run db:push
npm run db:status
```

## Step 6 — B-093 Status card display fix

File: `src/app/(admin)/admin/services/[id]/page.tsx` — the query that finds `lastStatusChange` (added in B-093).

Currently the query looks for `action ILIKE '%status%'`. Broaden it to also match `service_created` so newly-backfilled rows surface in the Status card when no status change has happened yet:

```ts
const { data: lastActivity } = await supabase
  .from("audit_log")
  .select("created_at, actor_id, actor_name, action, new_value, previous_value")
  .eq("entity_type", "service")
  .eq("entity_id", service.id)
  .in("action", ["status_changed", "service_created"])  // or .or(...) — whichever matches the existing predicate idiom
  .order("created_at", { ascending: false })
  .limit(1)
  .maybeSingle();
```

Rename the prop from `lastStatusChange` to `lastActivity` (or keep the old name with a clarifying comment — your call).

File: `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — the JSX that renders the "Status updated on … by …" / "Created on … by system" line.

Replace the fallback `"system"` string with a smarter label that uses the audit row's action to decide whether to render "Status updated" or "Created":

```tsx
{lastActivity ? (
  <>
    {lastActivity.action === "status_changed" ? "Status updated" : "Created"} on{" "}
    <span className="text-gray-700">{formatDate(lastActivity.created_at)}</span> by{" "}
    <span className="text-gray-700">{lastActivity.actor_name ?? "Unknown user"}</span>
  </>
) : (
  <>Created on <span className="text-gray-700">{formatDate(service.created_at)}</span></>
)}
```

The fallback `"by system"` is **removed entirely** — if for any reason no audit row exists (would only happen for a brand-new service mid-creation), just render the date without an actor. This is the regression flag: if "by Unknown user" appears in the UI, a new code path forgot to call `writeAuditLog` and we want to notice.

## Step 7 — Tech debt note

Append to `docs/tech-debt.md` (newest at top — same 2026-05-12 cluster as B-093 and B-094):

> **Audit `previous_value` / `new_value` payloads are inconsistent across routes.**
> *Spawned by:* [B-095](cli-brief-audit-coverage-sweep-b095.md).
> *What:* Each route added in B-095 captures `previous_value` / `new_value` based on the developer's judgment of which fields are interesting for that mutation. There's no shared utility for "diff this record's fields and write a snapshot". Audit consumers (compliance review, future analytics) would benefit from a uniform convention — probably a small `buildAuditDiff(before, after, fields)` helper.
> *Why deferred:* B-095 is already a large brief covering ~37 routes. The current ad-hoc snapshots are good enough for the audit trail UI; a future brief can introduce the helper and refactor each call site.

## Step 8 — Smoke test (manual; document in CHANGES.md)

1. **Backfill landed.** Run via Supabase: confirm there's now a `service_created` audit row for every service in `services`; same for `clients` and `client_profiles`. New audit rows say `actor_name = 'Jane Doe'`, `actor_role = 'admin'`.

   ```sql
   SELECT COUNT(*) FROM services s WHERE NOT EXISTS (
     SELECT 1 FROM audit_log a WHERE a.entity_type='service' AND a.entity_id=s.id AND a.action='service_created'
   );
   -- Expect: 0
   ```

2. **B-093 Status card no longer reads "by system".** Open `/admin/services/[id]` on GBC-0002 (the service that triggered this brief). The right-rail Status card reads `Created on 12 Apr 2026 by Jane Doe` (or whoever's logged-in name displays via session).

3. **Status card after a status change.** Click `Move to <next>` on the right-rail card. The line flips to `Status updated on <today> by <you>`.

4. **Forward-write smoke (Tier A — high signal):**
   - Create a new service via the admin UI. Audit trail shows a new `service_created` row attributed to you.
   - Assign a role to a profile in People & KYC. Audit trail shows `service_role_assigned`.
   - Update a client (change a field on `/admin/clients/[id]`). Audit shows `client_updated`.
   - Send a KYC invite. Audit shows `profile_invite_sent` (or `client_invite_sent`).

5. **Forward-write smoke (Tier B — sanity):**
   - Edit a service template under `/admin/settings/templates/[id]`. Audit shows `service_template_updated`.
   - Add a knowledge-base entry. Audit shows `kb_entry_created`.

6. **No double-audits.** Pick one route from the "already-audited" list (Step 4) and exercise it; the audit trail shows exactly **one** new row (not two). For example: change a service status — should produce one `status_changed` row, not also a duplicate `service_updated`.

7. **`npm run build` clean.**

8. **`npm run db:status` clean** — Local + Remote columns match for the new migration with no drift.

---

## CHANGES.md format

```md
### 2026-05-12 — B-095 — Audit-log coverage sweep + service-created backfill (Claude Code)

Closed the audit-coverage gap that caused the right-rail Status card to read "Created on <date> by system" on existing services.

- Added `writeAuditLog` calls to every admin mutation route that didn't already audit — Tier A (operational data: services, clients, profiles, roles, invites, applications, processes, document-update requests) and Tier B (configuration: document types, KB, role requirements, templates, due diligence). ~37 routes updated; full action-name table in the brief.
- Skipped: `migrations/*` (one-time setup), `audit-trail/*` (read-only), and the 16 routes that already audit.
- New migration `<YYYYMMDDHHMMSS>_audit_backfill_entity_created.sql`: inserts `service_created`, `client_created`, and `profile_created` audit rows for every existing row that doesn't already have one, attributed to `Jane Doe`, timestamped at `entity.created_at` (testing data per Vanessa's call). Pushed via `npm run db:push`; `db:status` confirms paired Local + Remote.
- B-093 Status card query broadened from `action ILIKE '%status%'` to `action IN ('status_changed', 'service_created')`. Display label flips between "Status updated" and "Created" based on the action. The hardcoded fallback "by system" string is **removed** — if no audit row is found at all (only happens mid-create), the line just shows the date without an actor.

Tech debt: deferred a `buildAuditDiff(before, after, fields)` helper to standardise `previous_value` / `new_value` snapshots across routes — entry added to `docs/tech-debt.md`.

Smoke test: <pass/fail from Step 8>.
`npm run build` clean. `npm run db:status` confirms migration pushed.
```

---

## What NOT to do

- Do NOT double-audit a route that already calls `writeAuditLog` or inserts to `audit_log` directly. The "already-audited" list in Step 4 is authoritative.
- Do NOT do a DB lookup to fetch the actor's `full_name`. Use `session.user.name`.
- Do NOT change `writeAuditLog`'s signature.
- Do NOT add audit logs to anything under `migrations/*` or to `audit-trail/route.ts`.
- Do NOT introduce a generic diff utility for `previous_value` / `new_value` payloads in this brief. That's the deferred tech-debt item.
- Do NOT skip `npm run db:push` + `npm run db:status`. Migration-touching briefs require both per CLAUDE.md.
- Do NOT backfill audit rows for entities beyond services / clients / client_profiles. Other entity types don't surface "by system" in any UI we care about right now.
- Do NOT restart the dev server.
- Do NOT touch the writeAuditLog utility — B-094 already shipped its required-actor_name version.
