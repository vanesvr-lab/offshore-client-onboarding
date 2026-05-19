# B-132 — Profile-scoped documents (KYC docs follow the person, not the service)

## Why

Today the `documents` table requires `service_id` and the service detail page filters strictly by `service_id = current`. So Bruce Banner's passport uploaded against Service GBC-0001 is invisible on Service AC-0042, even though he's the same person on both. Admins re-collect identity / financial / compliance documents every time a director appears on a new service — wasteful, confusing, and bad UX for the pitch.

The conceptual fix: **documents follow the person, not the service**. A passport is Bruce's passport, period. If Bruce is added to a new service, the system surfaces his existing identity/financial/compliance docs automatically. If he replaces his passport on any service, the new one replaces it everywhere because there's only one canonical record per (person, document type).

The schema already supports the distinction via `document_types.category`. Identity / financial / compliance are personal categories. Corporate / service-entity docs (e.g. Certificate of Incorporation for a specific entity being formed) stay scoped to a single service.

## The model

| Category (from `document_types.category`) | Scope | `documents.service_id` |
|---|---|---|
| `identity` (passport, ID, proof of address) | Personal — follows the profile | NULL |
| `financial` (bank statement, SoF, SoW) | Personal — follows the profile | NULL |
| `compliance` (PEP declaration, sanctions screening) | Personal — follows the profile | NULL |
| Other categories (corporate, entity-specific, etc.) | Service-scoped | set to the service id |

**Rule:** `documents.service_id IS NULL ↔ document is a personal doc, tied only to `client_profile_id``. `documents.service_id IS NOT NULL ↔ document is a service-scoped doc (corporate / entity docs)`.

Replacing a personal doc (upload a new file) marks the old one `is_active = false` and inserts a new active row with `service_id = NULL`. Every service the profile is on shows the new active doc.

## Out of scope (do NOT do in B-132)

- **Per-service variants of personal docs** — explicitly NO. If Bruce wants a different passport for one service, he updates his passport (replaces it everywhere). There's no concept of "Bruce's passport for Service A" vs "Bruce's passport for Service B".
- **Sharing personal docs across tenants** — docs stay scoped to their tenant. Cross-tenant sharing (if/when multi-tenant launches) is a separate brief.
- **Document expiry alerts** — `document_types.valid_for_months` exists on the schema but no UI alerts admins when a doc is about to expire. Out of scope here; separate brief if needed.
- **Migrating service-scoped docs that "should have been" personal** — Batch 1's backfill is mechanical: any active row whose `document_types.category IN ('identity','financial','compliance')` gets `service_id = NULL`. Edge cases where the categorization was wrong in the source data are not fixed here.

---

## Batch 1 — Schema: make `documents.service_id` nullable + backfill personal docs

### Migration: `<timestamp>_documents_profile_scoped.sql`

Use `npx supabase migration new documents_profile_scoped` to generate the timestamp.

```sql
-- B-132 — Personal KYC documents follow the profile, not the service.
-- Make service_id nullable; backfill all existing personal-category docs
-- to service_id = NULL so they surface on every service the profile is on.

ALTER TABLE public.documents
  ALTER COLUMN service_id DROP NOT NULL;

-- Backfill: every active doc whose document_type.category is personal
-- gets service_id = NULL. Categories: identity, financial, compliance.
UPDATE public.documents d
SET service_id = NULL
FROM public.document_types dt
WHERE d.document_type_id = dt.id
  AND dt.category IN ('identity', 'financial', 'compliance')
  AND d.service_id IS NOT NULL;

-- Audit log entry per backfilled doc (one summary row, not per-doc, to
-- avoid flooding the log).
INSERT INTO public.audit_log (
  actor_role, action, entity_type, entity_id,
  previous_value, new_value
)
SELECT
  'system',
  'documents_profile_scoped_backfill',
  'migration',
  gen_random_uuid(),
  jsonb_build_object('migration', 'B-132'),
  jsonb_build_object(
    'backfilled_count', (
      SELECT count(*) FROM public.documents d2
      JOIN public.document_types dt2 ON d2.document_type_id = dt2.id
      WHERE dt2.category IN ('identity', 'financial', 'compliance')
        AND d2.service_id IS NULL
    )
  );

-- Index to speed up the profile-scoped query (load docs by profile + null service)
CREATE INDEX IF NOT EXISTS documents_profile_scoped_idx
  ON public.documents(client_profile_id)
  WHERE service_id IS NULL AND is_active = true;
```

### Migration lifecycle (CLI is responsible for the full cycle)

Per CLAUDE.md "Database Migration Workflow":

1. Write the migration file.
2. Commit + push the migration file.
3. `npm run db:push` to apply to prod.
4. `npm run db:status` — confirm Local + Remote pair with no drift.
5. CHANGES.md entry noting the migration filename + that it was pushed.

### Verification (Batch 1)

```sql
-- Check service_id is nullable
SELECT is_nullable FROM information_schema.columns WHERE table_name='documents' AND column_name='service_id';
-- Expect: YES

-- Backfill count
SELECT count(*) FROM public.documents d
JOIN public.document_types dt ON d.document_type_id = dt.id
WHERE dt.category IN ('identity','financial','compliance') AND d.service_id IS NULL;
-- Expect: > 0 (some non-zero number depending on existing data)

-- Audit row
SELECT new_value FROM public.audit_log WHERE action='documents_profile_scoped_backfill' ORDER BY created_at DESC LIMIT 1;

-- Index exists
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='documents' AND indexname='documents_profile_scoped_idx';
```

### Commit message (Batch 1)

```
feat(db): documents.service_id nullable + backfill personal docs (B-132)

Drops NOT NULL on documents.service_id; backfills all active
identity / financial / compliance docs to service_id = NULL so
they're profile-scoped. Audit_log captures the backfilled count.
New partial index documents_profile_scoped_idx on
client_profile_id WHERE service_id IS NULL AND is_active = true
to keep the new join-or-union query fast.
```

---

## Batch 2 — Upload routes: set `service_id` only for non-personal categories

Locate every document-upload endpoint in `src/app/api/`. Typical paths:

- `src/app/api/admin/services/[id]/documents/upload/route.ts` (likely)
- `src/app/api/services/[id]/documents/upload/route.ts` (client side, via wizard)
- Any `kyc` upload routes that write to `documents`

For each: before inserting into `documents`, look up `document_types.category` for the chosen `document_type_id`. If category is in `('identity', 'financial', 'compliance')`, set `service_id = NULL` in the INSERT regardless of which service the upload came from. Otherwise, set `service_id = currentServiceId`.

```ts
// Pseudocode for each upload route
const { data: docType } = await supabase
  .from("document_types")
  .select("category")
  .eq("id", document_type_id)
  .single();

const isPersonal = ["identity", "financial", "compliance"].includes(docType?.category);

const { data: newDoc, error } = await supabase
  .from("documents")
  .insert({
    file_name,
    file_path,
    document_type_id,
    client_profile_id,
    tenant_id,
    service_id: isPersonal ? null : currentServiceId,
    // …other fields…
  })
  .select("*")
  .single();
```

The "replace" pattern stays as-is: when uploading, mark all prior `is_active = true` rows for the same `(client_profile_id, document_type_id)` as `is_active = false`, then insert the new active one. The replace query already keys on `(client_profile_id, document_type_id)` (not service_id), so the cross-service replace just works.

### Verification (Batch 2)

Manual:
1. Open a service with Bruce attached. Upload a Certified Passport Copy (identity category) for Bruce.
2. Check the resulting `documents` row in Supabase: `service_id` is NULL, `client_profile_id` is Bruce's id.
3. Upload a Certificate of Incorporation (corporate / non-personal category) on the same service.
4. Check: `service_id` IS set (= the current service id).
5. From a second service Bruce is also attached to: upload a NEW passport for Bruce (replace flow).
6. Check Supabase: the new passport row has `service_id = NULL`, `is_active = true`; the previous passport row has `is_active = false`. Visit the first service's page → confirm the new passport is what shows (because the active row is the new one and `service_id IS NULL` matches across services).

### Commit message (Batch 2)

```
feat: document upload routes set service_id only for non-personal docs (B-132)

Every documents-insert path now reads the chosen document_type's
category. Personal categories (identity / financial / compliance)
insert with service_id = NULL; everything else stays
service-scoped. The replace pattern is unchanged — it keys on
(client_profile_id, document_type_id), which already works
correctly across services for personal docs.
```

---

## Batch 3 — Query rewrite: surface profile-scoped + service-scoped docs

Update `src/app/(admin)/admin/services/[id]/loadServiceDetail.ts` (around line 145-155) to load documents that match either:

- Current service's own docs (`service_id = currentServiceId`), **OR**
- Personal docs from any profile attached to this service (`service_id IS NULL` AND `client_profile_id IN <attached profile ids>`)

Approach: load the attached profile IDs first, then run the docs query with a Postgres `OR`:

```ts
// (Step 1) attached profile ids — already loaded elsewhere in this file
const attachedProfileIds = profileServiceRoles.map(r => r.client_profile_id);

// (Step 2) documents query
const docsQuery = supabase
  .from("documents")
  .select(`
    id, file_name, file_path, verification_status, verification_result,
    admin_status, admin_status_note, admin_status_by, admin_status_at,
    mime_type, uploaded_at, expiry_date, document_type_id,
    client_profile_id, service_id,
    document_types(id, name, category, valid_for_months),
    client_profiles(id, full_name)
  `)
  .eq("is_active", true)
  .or(
    `service_id.eq.${serviceId},and(service_id.is.null,client_profile_id.in.(${attachedProfileIds.join(",")}))`
  );

const { data: documents } = await docsQuery;
```

(PostgREST `or` filter with embedded `and` — confirm syntax matches the Supabase JS client's expectations. Alternative: run two queries and merge in JS. CLI's choice; the OR-string is more efficient.)

Same fix applies anywhere else `documents` is queried scoped to a service. CLI: grep for `.from("documents")` and `.eq("service_id"` to find the other call sites (e.g. `src/app/(admin)/admin/services/page.tsx`). Apply the same union pattern.

### Verification (Batch 3)

Manual:
1. Create two services: Service A (GBC-0001) and Service B (AC-0042).
2. Add Bruce Banner as a Director on both.
3. On Service A: upload Bruce's passport.
4. Open Service B's detail page → confirm Bruce's passport now appears in his KYC documents list, marked verified/uploaded.
5. On Service B: upload an entity-level Certificate of Incorporation (non-personal).
6. Open Service A → confirm Service B's Certificate does NOT appear (it's service-scoped to B).
7. Replace Bruce's passport on Service B with a new file.
8. Open Service A → confirm the new passport shows; the old one is gone.

### Commit message (Batch 3)

```
feat: service detail loads personal docs from attached profiles (B-132)

loadServiceDetail.ts (and any other service-scoped doc query)
now loads documents where service_id matches the current service
OR (service_id IS NULL AND client_profile_id IN attached
profiles). Effect: Bruce's passport uploaded on Service A
automatically surfaces on Service B without the admin needing
to re-upload. Replace on any service replaces everywhere.
```

---

## Batch 4 — UI: "Personal — shared across services" badge

Visual indicator so admins understand WHY a doc appears here even though they didn't upload it on this service.

In `src/components/admin/KycDocsByCategory.tsx` (or wherever the doc tile renders — CLI: grep for `verification_status` rendering to find), add a small badge next to docs where `service_id === null`:

```tsx
{document.service_id === null && (
  <span
    className="inline-flex items-center gap-1 text-[10px] font-medium text-purple-700 bg-purple-50 border border-purple-200 px-1.5 py-0.5 rounded-full"
    title="This document is attached to the person, not this service. Changes apply across every service they're on."
  >
    <Users className="h-3 w-3" />
    Personal
  </span>
)}
```

Position next to the document type label, before the verification status badge. Color choice: purple — distinct from the existing red/amber/green RAG colors so it doesn't visually clash.

### Verification (Batch 4)

Manual: open any service with personal docs uploaded for an attached director. Confirm the "Personal" badge appears next to identity/financial/compliance docs but NOT next to service-scoped corporate docs. Hover the badge → tooltip explains the behavior.

### Commit message (Batch 4)

```
feat: "Personal" badge on profile-scoped docs in the KYC docs grid (B-132)

Adds a small purple "Personal" badge next to documents where
service_id IS NULL — clarifies for the admin that the doc came
from the profile (shared across services) rather than being
uploaded against this specific service. Hover tooltip explains
the cross-service replace behavior.
```

---

## Batch 5 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-132 — Profile-scoped documents (done YYYY-MM-DD)`. One sub-entry per batch.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry**: "Document expiry alerts — `document_types.valid_for_months` defines how long a doc stays valid, but no UI alerts when a doc is approaching or past expiry. Useful for compliance refresh workflows. Estimate: ~half-day."
- **Add new Open entry**: "Document categorization may be wrong in legacy seed data — B-132's backfill assumed `document_types.category IN ('identity','financial','compliance')` correctly identifies personal docs. If any of the seeded categories are mislabeled (e.g. a corporate doc accidentally categorized as 'compliance'), it would have been backfilled to `service_id = NULL` and now surfaces on every service. Audit the document_types table after deploy and reclassify if needed. Estimate: ~1 hour."
- **Add new Open entry**: "Cross-service document audit trail — when a doc is replaced on Service A and the change is reflected on Service B, Service B's audit_log doesn't see the change. The replace event is logged once on the original service. If GWMS audit pressure requires per-service audit on every doc replace, augment the audit_log writer. Estimate: ~2 hours."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **Migration lifecycle (Batch 1):** write, commit + push file, `db:push`, `db:status`, CHANGES.md.
2. **Per-batch commits:** five commits total. Stage by filename — never `git add .` or `git add -A`.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No per-service variants of personal docs.
- No cross-tenant doc sharing.
- No expiry alerting UI (separate brief if needed).
- No re-categorization of misclassified document_types (audit + fix manually if found).
