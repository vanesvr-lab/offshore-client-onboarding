# CLI Brief — B-106 Waivers Everywhere (per-profile display + service-doc waivers + schema scope)

**Status:** Ready for CLI
**Estimated batches:** 3
**Touches migrations:** Yes (Batch 1)
**Touches API:** Yes (Batch 1)
**Touches AI verification:** No
**Builds on:** B-100 (initial waiver feature)

---

## Pre-flight

Run `git pull origin main` first. No specific feat commit to wait on — B-105 is already in.

---

## Why this batch exists

Two gaps + one structural improvement after B-100:

1. **Gap — admin per-profile expanded view doesn't reflect waivers.** On `/admin/services/[id]`, when admin expands a profile, the `KycDocsSummary` ("3 of 9 uploaded") and `KycDocsByCategory` list treat waived doc types as still-required. Same bug appears on the Review Wizard since it renders the same component tree. Vanessa: admin should always see the waived state with a badge; client should never see waived doc requirements.
2. **Gap — service-level docs (`document_types.scope = 'application'`) can't be waived today.** The Service Docs tab on `/admin/services/[id]` shows incorporation certs, bank statements, etc. — admin can't waive them. Same waive/un-waive UX as KYC docs but at the service level.
3. **Schema — `waived_document_requirements` has no explicit scope.** Today scope is derivable by joining `document_types`. Adding an explicit `scope` column + a CHECK constraint that links it to `client_profile_id` NULL/NOT-NULL makes the row tamper-proof: you literally cannot store a person-scope waiver without a profile_id, or a service-scope waiver with one. Catches a class of API misuse bugs that we'd otherwise have to police in route handlers.

---

## Hard rules

1. **Three batches, three commits.** After each: stage specific files → commit → `git push origin HEAD:main` → update `CHANGES.md` with one sub-entry under `## B-106` → next batch.
2. `npm run build` clean after each.
3. **Migration in Batch 1**: write to `supabase/migrations/<timestamp>_*.sql`, then `npm run db:push`, then `npm run db:status`. If drift, stop and document.
4. **No `as any`.**
5. **No batch ID in commit messages** (CLAUDE.md rule).
6. **Don't restart the dev server.**

---

## Batch 1 — Schema + API: scope column, nullable profile, service waivers allowed

### Step 1.1 — Migration

File: `supabase/migrations/<timestamp>_waiver_scope_and_service_waivers.sql`.

```sql
-- B-106 — extend waived_document_requirements to cover service-scope
-- documents (scope='application') in addition to KYC (scope='person').
--
-- Changes:
--   1. Allow client_profile_id to be NULL (service waivers have no profile).
--   2. Add explicit scope column with a CHECK that ties scope ↔ profile_id
--      nullness. Catches API misuse (person waiver without profile, or
--      service waiver with one) at write time.
--   3. Backfill scope = 'person' for all existing rows (B-100 only ever
--      created person-scope waivers).
--   4. Replace the existing UNIQUE (client_profile_id, service_id,
--      document_type_id) with two PARTIAL unique indexes — one for each
--      scope — because Postgres treats NULLs as distinct in UNIQUE, so
--      without a partial index you could store the same service waiver
--      twice with NULL profile.

BEGIN;

-- 1. Drop NOT NULL on client_profile_id.
ALTER TABLE public.waived_document_requirements
  ALTER COLUMN client_profile_id DROP NOT NULL;

-- 2. Add the scope column (defaults to 'person' for backfill in one step).
ALTER TABLE public.waived_document_requirements
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'person'
  CHECK (scope IN ('person', 'application'));

-- 3. Drop the default so future inserts must specify scope explicitly
--    (we want the API to be deliberate, not silently fall back).
ALTER TABLE public.waived_document_requirements
  ALTER COLUMN scope DROP DEFAULT;

-- 4. Row-level CHECK linking scope to profile_id nullness.
ALTER TABLE public.waived_document_requirements
  ADD CONSTRAINT waived_doc_reqs_scope_profile_consistent
  CHECK (
    (scope = 'person'      AND client_profile_id IS NOT NULL) OR
    (scope = 'application' AND client_profile_id IS NULL)
  );

-- 5. Replace the old composite UNIQUE constraint with partial indexes
--    so the (NULL profile, service, doc_type) case is also de-duplicated.
ALTER TABLE public.waived_document_requirements
  DROP CONSTRAINT IF EXISTS waived_document_requirements_client_profile_id_service_id_doc_key;
-- (Some Supabase installs name it slightly differently — also try the
--  generic auto-generated name just in case.)
ALTER TABLE public.waived_document_requirements
  DROP CONSTRAINT IF EXISTS waived_document_requirements_client_profile_id_service_id_document_type_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS waived_doc_reqs_person_unique
  ON public.waived_document_requirements
  (client_profile_id, service_id, document_type_id)
  WHERE scope = 'person';

CREATE UNIQUE INDEX IF NOT EXISTS waived_doc_reqs_service_unique
  ON public.waived_document_requirements
  (service_id, document_type_id)
  WHERE scope = 'application';

COMMIT;
```

After writing, run `npm run db:push` + `npm run db:status`. Both must come back clean.

Verify post-migration with a curl (uses the env vars from `.env.local`):

```bash
export $(grep -E "^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)" .env.local | xargs)
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/waived_document_requirements?select=id,scope,client_profile_id&limit=3" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

Every row should have `scope: "person"` and a non-null `client_profile_id`.

### Step 1.2 — API: accept service-scope waivers

File: [`src/app/api/admin/services/[id]/waive-document/route.ts`](src/app/api/admin/services/[id]/waive-document/route.ts).

Extend both `POST` and `DELETE` handlers:

```ts
type WaiveBody = {
  document_type_id: string;
  // Either profile waiver (scope='person') or service waiver (scope='application').
  scope: "person" | "application";
  client_profile_id?: string | null;
};
```

POST logic:

- Validate `scope === "person"` requires `client_profile_id`, `scope === "application"` requires `client_profile_id` is null/undefined. Return 400 with a clear error if mismatched.
- On insert, set both `scope` and `client_profile_id` (NULL for application). The DB CHECK is the last line of defence; the route check gives a friendlier 400.
- Audit-log key changes: include `scope` in the audit row's `metadata`.

DELETE logic:

- Accept the same body shape. Match on `(service_id, document_type_id, scope, client_profile_id)` for the delete.
- For service waivers, also match `client_profile_id IS NULL` correctly (the Supabase JS client's `.is("client_profile_id", null)` for the equality check).

Update the `WaivedDocumentRequirement` type in [`src/app/(admin)/admin/services/[id]/page.tsx`](src/app/(admin)/admin/services/[id]/page.tsx) to add `scope: "person" | "application"` and make `client_profile_id` nullable. Update any TS callers that destructure these fields.

### Step 1.3 — Commit + push + CHANGES.md

```
feat: waivers gain explicit scope column; service-level docs now waivable in schema
```

CHANGES.md entry under `## B-106` → batch 1, mention the migration filename + `db:push` + `db:status` clean.

---

## Batch 2 — Service Docs waive UI

**Goal:** In `AdminDocumentsSection` on `/admin/services/[id]`, the Service Docs tab gets the same waive / un-waive UX as the KYC Documents tab. Waived rows render muted with a "Waived on `<date>` by `<name>`" tooltip (same pattern as KYC). Hidden from client wizard step 4.

### Step 2.1 — Service docs table component

`AdminDocumentsSection` lives inside [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) (line 2631+). It already renders two tabs ("service" and "kyc") via internal state. The KYC tab uses `KycDocumentsTable` which has all the waive/un-waive plumbing.

In the Service tab's existing per-row render, add:

- Action menu / button: `Waive document` (when not waived) or `Un-waive` (when waived). Match the KycDocumentsTable's affordance — same button placement, same colors, same confirmation dialog text (`The client will no longer be asked to upload this document. You can un-waive it at any time.`).
- Waived row treatment: muted background, "Waived" pill replacing whatever status pill is there today, hover tooltip showing `Waived on <long date> by <reviewer name>` (mirror the SectionReviewBadge tooltip from B-100 batch 1 — same `<long date>` format).
- Optimistic update: when admin waives, splice into the local `waivers` array immediately via `onWaiversChange` (matches the KYC tab's pattern).

The POST/DELETE call uses the new API shape: `{ document_type_id, scope: "application", client_profile_id: null }`.

### Step 2.2 — Lift `waiverByTypeIdForService` lookup

In the Service Docs tab's row builder, build a Map `Map<document_type_id, WaivedDocumentRequirement>` filtered to `scope === "application"`. O(1) lookup per row to determine the waiver state.

### Step 2.3 — Client portal filtering for service waivers

The client wizard's Documents step (step 4) is `ServiceWizardDocumentsStep`. It already receives `waivers` via prop chain (B-100 wired). Today the filter probably keys on `(client_profile_id, document_type_id)`. Update it to ALSO filter on service-scope waivers:

- If a `documentTypes` row has `scope === "application"`, hide it from the upload list when any waiver row matches `{ scope: "application", service_id, document_type_id }`.
- For person-scope doc types, existing per-profile filter logic continues to apply.

Verify the same filter applies at:
- `ServiceWizardDocumentsStep` (client step 4) — service docs upload list
- `ServiceWizardPeopleStep` / `PerPersonReviewWizard` — already person-scope only, no change needed but verify the existing logic still works under the new union waiver shape

### Step 2.4 — Commit + push + CHANGES.md

```
feat: admin can waive service-level documents (Service Docs tab); client wizard filters service waivers
```

CHANGES.md entry under `## B-106` → batch 2.

---

## Batch 3 — Admin per-profile expanded view reflects waivers

**Goal:** On `/admin/services/[id]` (and the Review Wizard inheriting from it), the per-profile expanded view shows waived doc types as "Waived" rather than missing. Counts in `KycDocsSummary` account for waivers. Same treatment in `KycDocsByCategory`.

### Step 3.1 — Pass `waivers` down to PersonCard

In [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx), the parent already has `waivers` state lifted (line 3313). Thread it down to PersonCard (find the prop drilling path — `AdminApplicationSections` or similar wrapper, then PersonCard itself).

In PersonCard, compute a Set:

```ts
const waivedDocTypeIdsForProfile = useMemo(() => {
  const out = new Set<string>();
  for (const w of waivers ?? []) {
    if (w.scope === "person" && w.client_profile_id === profile.id) {
      out.add(w.document_type_id);
    }
  }
  return out;
}, [waivers, profile.id]);
```

### Step 3.2 — Build waiver-aware doc rows

Update the `kycDocsByCategory` block at line 1810-1841. Each doc row gains:

```ts
const waivedAt: string | null = waivedDocTypeIdsForProfile.has(dt.id)
  ? waivers.find((w) => w.scope === "person" && w.client_profile_id === profile.id && w.document_type_id === dt.id)?.waived_at ?? null
  : null;
return {
  // … existing fields
  is_waived: waivedAt !== null,
  waived_at: waivedAt,
  waived_by_name: /* look up via the waiver row + a users join — see step 3.3 */,
};
```

Update the `KycDocRowData` type to include `is_waived`, `waived_at`, `waived_by_name`.

### Step 3.3 — Reviewer name for waiver tooltips

The current `waivers` prop has `waived_by: uuid` but not the user's name. Two options:

- **Cheap:** add a parallel lookup map `Record<user_id, full_name>` built from existing data (the page already has `adminUsers` fetched, see `loadServiceDetail.ts`). Pass that map down to PersonCard, resolve the name on render.
- **More work:** extend the waivers fetch to join `users(full_name)`.

Lean cheap — the `adminUsers` map probably covers everyone who'd have waived.

### Step 3.4 — `KycDocsSummary` count + `KycDocsByCategory` row treatment

Two display rules:

- **Count adjustment:** in the summary text "`<N>` of `<M>` uploaded" — `M` excludes waived doc types, `N` includes uploaded ones (current). So if 1 of 9 is waived: "`<N>` of 8 uploaded". The waived count appears separately if useful: "`<N>` of 8 uploaded · 1 waived".
- **Row treatment:** in `KycDocsByCategory`, waived rows render with the muted "Waived" pill (mirror the KycDocumentsTable rendering — reuse the `waivedPill` helper if it's exportable, else add a small new helper in `KycDocsByCategory.tsx`).

Update [`src/components/kyc/KycDocsSummary.tsx`](src/components/kyc/KycDocsSummary.tsx) and [`src/components/kyc/KycDocsByCategory.tsx`](src/components/kyc/KycDocsByCategory.tsx) to accept the new fields on their row data types + render the waived treatment. Keep the components dumb — caller pre-computes counts.

The `totalKycDocs` / `totalKycUploaded` derived at line 1843-1847 needs an adjustment:

```ts
const waivedCount = kycDocsByCategory.reduce(
  (acc, c) => acc + c.docs.filter((d) => d.is_waived).length,
  0,
);
const totalKycDocsExcludingWaived = totalKycDocs - waivedCount;
```

Use `totalKycDocsExcludingWaived` for the summary M. Pass `waivedCount` to `KycDocsSummary` for the optional "· N waived" suffix.

### Step 3.5 — Same fix bleeds into Review Wizard automatically

The Review Wizard at `/admin/services/[id]/review` mounts `ServiceDetailClient` with `reviewMode` props (B-102). Same component tree → same fix. Verify after Step 3.4 by opening the wizard and stepping to People & KYC.

### Step 3.6 — Commit + push + CHANGES.md

```
feat: admin per-profile expanded view reflects waivers in counts + row badges
```

CHANGES.md entry under `## B-106` → batch 3.

---

## Acceptance criteria

- [ ] `npm run build` clean after each batch
- [ ] DB: every existing waiver row has `scope = 'person'` after migration; `client_profile_id` is nullable; partial unique indexes present (`\d+ waived_document_requirements` in psql confirms)
- [ ] POSTing a person waiver without `client_profile_id` returns 400 from the API (not 500 from the DB CHECK)
- [ ] POSTing a service waiver with `scope: "application"` and no profile id succeeds; row has `client_profile_id IS NULL`
- [ ] Service Docs tab in `AdminDocumentsSection` shows a Waive / Un-waive action on each row; waived rows have muted treatment + tooltip
- [ ] Client wizard step 4 doesn't show service-doc upload prompts for any waived service doc type
- [ ] On `/admin/services/[id]` with a profile that has 1 waived doc type out of 9 total: summary reads "`<N>` of 8 uploaded · 1 waived"; the waived row renders with the "Waived" pill
- [ ] Same display on `/admin/services/[id]/review` at the People & KYC step
- [ ] `npm run db:status` clean
- [ ] CHANGES.md has three sub-entries under `## B-106`

---

## Tech debt to log

Append to `docs/tech-debt.md` after batch 3:

- **Waiver `waived_by_name` is resolved client-side via a `users` map.** Works because the lookup data is already on the page, but if the schema ever drops `users` from the page's load, this breaks. Long-term, surface `waived_by_name` directly on the `waivers` row by extending the loader's select to include `users(full_name)` and a column-level alias.

---

## After all three batches

Final commit + push + CHANGES.md → tell Vanessa one line: "B-106 done — waivers visible everywhere admin sees, service-level docs waivable, hidden from client." Stop.
