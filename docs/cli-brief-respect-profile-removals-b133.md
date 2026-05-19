# B-133 — Respect `service_profile_removals` in queue + service detail

## Why

"Remove from service" already works correctly server-side — `POST /api/admin/services/[id]/profiles/[profileId]/remove` upserts a row into `service_profile_removals` with `(service_id, client_profile_id)`. The underlying `profile_service_roles` row stays intact (so future re-add restores roles cleanly per B-101 Batch 3's intent), but two display surfaces don't consult the removals table:

1. **`/admin/queue`** — the "MANAGERS" column still shows the removed profile as the can_manage party.
2. **Service detail page (`/admin/services/[id]`)** — the People & KYC section still lists the removed profile as a Director.

Vanessa removed Bruce Banner from GBC-0003 and GBC-0002, but he still appears as Manager on both rows in the queue. The data is correct; the queries just don't filter.

## Out of scope (do NOT do in B-133)

- **Un-remove ("Restore") UI** — already flagged as tech debt in the original removal route's comments. If you re-add the profile through the AddDirector modal, the existing `profile_service_roles` row + a new removal lookup would surface them again — but there's no explicit "undo removal" affordance. Out of scope here.
- **Filter `client_profiles.is_deleted = true`** — a different concept (global soft-delete on the profile entity itself). Not what was reported. If it's still an issue, separate brief.
- **Profile search filters** (AddDirector modal, new-service wizard Step 2) — search should still find removed-from-service profiles since they're valid candidates for OTHER services. The removal is service-specific.

## The pattern

For every surface that lists `client_profiles` joined through `profile_service_roles` scoped to a service, **also** load `service_profile_removals.client_profile_id` for that service and filter the results client-side.

```ts
// Pseudocode pattern — apply in every affected query
const removedProfileIds = new Set(
  (serviceRemovals ?? []).map((r) => r.client_profile_id),
);
const activeRoles = profileServiceRoles.filter(
  (r) => !removedProfileIds.has(r.client_profile_id),
);
```

Alternative pure-SQL approach (faster but harder to read): subquery filter via a single `NOT EXISTS`. Either works; the JS-side filter is cleaner given the existing query shape and is what this brief assumes.

---

## Batch 1 — Queue page

### Update `src/app/(admin)/admin/queue/page.tsx`

The current services query (around lines 40-57) selects `profile_service_roles` with `client_profiles`. Add `service_profile_removals` to the select and filter client-side.

```ts
// Updated select
const { data: rawServices } = await supabase
  .from("services")
  .select(`
    id,
    service_number,
    status,
    service_details,
    created_at,
    updated_at,
    assigned_admin_id,
    assigned_admin:users!services_assigned_admin_id_fkey(id, full_name, email),
    service_templates(name),
    profile_service_roles(
      client_profile_id,
      can_manage,
      client_profiles(id, full_name, email)
    ),
    service_profile_removals(client_profile_id)
  `)
  .eq("tenant_id", tenantId)
  .eq("is_deleted", false)
  .neq("status", "draft")
  .order("updated_at", { ascending: false });
```

Then in the rows mapping (around line 72), filter the roles:

```ts
const services: ServiceRow[] = (rawServices as unknown as RawServiceRow[] | null ?? []).map((s) => {
  const removedIds = new Set(
    (s.service_profile_removals ?? []).map((r: { client_profile_id: string }) => r.client_profile_id),
  );
  const activeRoles = (s.profile_service_roles ?? []).filter(
    (r) => r.client_profile_id && !removedIds.has(r.client_profile_id),
  );
  const primary =
    activeRoles.find((r) => r.can_manage)?.client_profiles ??
    activeRoles[0]?.client_profiles ??
    null;
  return {
    id: s.id,
    service_number: s.service_number,
    status: s.status,
    created_at: s.created_at,
    updated_at: s.updated_at,
    assigned_admin_id: s.assigned_admin_id,
    assigned_admin_name: s.assigned_admin?.full_name ?? null,
    template_name: s.service_templates?.name ?? null,
    primary_profile_name: primary?.full_name ?? null,
  };
});
```

Also update the `RawServiceRow` type (top of the file) to include `service_profile_removals: Array<{ client_profile_id: string }>` and `profile_service_roles[].client_profile_id`.

### Verification (Batch 1)

Manual:
1. On a service with two attached profiles (e.g. Bruce + someone else), remove Bruce via the "Remove from service" button on the service detail page.
2. Navigate to `/admin/queue`. The MANAGERS column for that row should now show the OTHER profile (or "—" if the other profile is also removed / there's no can_manage left).
3. Re-add Bruce via the AddDirector modal. Confirm he reappears in the MANAGERS column.

### Commit message (Batch 1)

```
fix: queue respects service_profile_removals (B-133)

The services queue's MANAGERS column joined through
profile_service_roles → client_profiles but never consulted
service_profile_removals. Profiles "removed from a service" still
appeared. Fix: load the removals alongside the roles and filter
client-side. The role rows themselves stay intact (so a future
re-add restores roles cleanly per B-101's intent); the
queue display just hides the per-service-removed ones.
```

---

## Batch 2 — Service detail page

### Update `src/app/(admin)/admin/services/[id]/loadServiceDetail.ts`

This file queries `profile_service_roles` to drive the People & KYC section on the service detail page. Same pattern:

1. Add `service_profile_removals` to the loadServiceDetail batch (it may already query the table for related purposes — CLI: grep for `service_profile_removals` in the file first; if already present, just reuse).
2. When mapping the profiles for the People & KYC section, filter out roles where the profile_id is in the removals set for THIS service.

```ts
// If service_profile_removals isn't already loaded in the batch:
supabase
  .from("service_profile_removals")
  .select("client_profile_id")
  .eq("service_id", serviceId)
  .eq("tenant_id", tenantId),
```

Then in the assembly step that builds the People & KYC list, filter:

```ts
const removedProfileIds = new Set(
  (serviceProfileRemovals ?? []).map((r) => r.client_profile_id),
);
const activeRoles = profileServiceRoles.filter(
  (r) => !removedProfileIds.has(r.client_profile_id),
);
// Use activeRoles for the People & KYC list, KYC progress %, document
// inheritance lookups (B-132's attached profile set), and the section
// review aggregates.
```

**Important — knock-on effects to verify:**

- **B-132 document inheritance** (just shipped): the "attached profile set" used to surface inherited personal documents should use `activeRoles`, not raw `profileServiceRoles`. Otherwise a removed director's passport still inherits onto the service — wrong.
- **B-127 review request flow**: the section list / profile chooser for peer review should also exclude removed profiles.
- **Section review aggregation**: per-profile review state should ignore removed profiles when computing whether "all KYC sections have been reviewed".

CLI: search for all callsites of `profileServiceRoles` / the assembled profiles list within `ServiceDetailClient.tsx` and confirm they're using the filtered set, not raw. If multiple consumers exist, refactor `loadServiceDetail.ts` to return the already-filtered roles so consumers can't accidentally use the raw set.

### Verification (Batch 2)

Manual:
1. On a service with Bruce + another director attached, remove Bruce.
2. Service detail page should no longer show Bruce in People & KYC.
3. KYC progress percentage updates (no longer counts Bruce's KYC).
4. Bruce's personal docs (passport etc., inherited per B-132) no longer surface on this service.
5. Request a peer review — Bruce's per-profile People & KYC section is NOT in the picker.
6. Re-add Bruce → all four points reverse cleanly.

### Commit message (Batch 2)

```
fix: service detail respects service_profile_removals (B-133)

loadServiceDetail.ts now loads service_profile_removals alongside
profile_service_roles and returns roles filtered to exclude
removed profiles. Knock-on consumers updated:
- People & KYC list hides removed directors
- KYC progress aggregation no longer counts them
- B-132 document inheritance attached-profile set is filtered
  (removed director's personal docs no longer inherit)
- Peer review section picker excludes them
- Section review aggregation ignores them
```

---

## Batch 3 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-133 — Respect service_profile_removals (done YYYY-MM-DD)`. One sub-entry per batch.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Open entry already exists** (from the original removal route's TODO comment): "No UI to restore removed profiles" — leave as-is. Adding a "restore" affordance is out of scope here.
- **Add new Open entry**: "Audit consistency for hide-vs-cascade in B-133 — the queue and service detail now HIDE per-service-removed profiles, but their `profile_service_roles` rows are still intact in the DB. If someone reads `profile_service_roles` directly outside the central `loadServiceDetail` path (e.g. a future report query, an external integration), they'll see the removed profile. Consider a DB-level view that pre-joins the exclusion, OR document the convention loudly in the schema."
- **Add new Open entry**: "Same removals-filter pattern likely applies to a few other admin surfaces I didn't audit in B-133. CLI's verification step in Batch 2 covers the high-value ones (queue, service detail, doc inheritance, peer review). If a removed profile pops up anywhere else (audit log readouts, communications dialog recipient picker, etc.), fix in a small follow-up."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **Per-batch commits:** three commits. Stage by filename — never `git add .` or `git add -A`.
2. **No migration in this brief** — pure query / app-code fix.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No "Restore" UI for removed profiles.
- No filter on `client_profiles.is_deleted` — different concept, not this bug.
- No audit of every minor admin surface — Batch 2's verification covers the major ones; isolated regressions get follow-up fixes.
