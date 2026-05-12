# CLI Brief — B-097 Document Validity Tracking + KYC Documents Tab

**Status:** Ready for CLI
**Estimated batches:** 1 (large)
**Touches migrations:** Yes — one migration adds `document_types.valid_for_months` + backfills defaults. CLI MUST run `npm run db:push` + `npm run db:status`.
**Touches AI verification:** No (the OCR pipeline already writes `documents.expiry_date` for passports etc. — leave it alone)
**Touches API:** Yes — extends the document admin-edit route to accept `expiry_date`; extends the document-types PATCH to accept `valid_for_months`. No new endpoints.
**Builds on:** B-077 / B-085 (Documents section), B-094 / B-095 (audit-log attribution)

---

## Why this batch exists

Today every document row in the admin portal shows filename + verification status. There's **no expiry tracking visible**, and there's **no way to view all KYC docs across all profiles** in one place — admins have to expand each profile card individually.

Vanessa wants:

1. **Per-doc expiry display.** Every document row shows: uploaded date, "good until" date, and a `Valid` / `Expired` badge (or no badge for never-expires). Expiry is derived as:
   - If `documents.expiry_date` is set (manual entry OR OCR-extracted for passports) → use it.
   - Else if the document type has `valid_for_months` set → `uploaded_at + valid_for_months months`.
   - Else → never expires.
2. **Manual expiry override** on every doc via the document detail dialog (date-picker). Admin can set or clear `documents.expiry_date` for any doc. Useful for docs that must be re-supplied at a specific date (e.g., beginning of the year) regardless of upload date.
3. **`valid_for_months` editable per document type** in the existing Document Types admin page.
4. **"KYC Documents" tab** in the service-level Documents section. Tabular view with sortable columns + filters (by profile, by doc type, by status). Lets admins audit who's missing what KYC doc across the whole service in one screen.

Vanessa's backfill defaults (Q2):

| Document type | valid_for_months |
|---|---|
| Passport / National ID | NULL (OCR populates `documents.expiry_date` directly) |
| Proof of Address / Utility Bill | 3 |
| Bank Reference Letter | 3 |
| Source of Funds Declaration | 12 |
| Certificate of Incorporation / Constitution | NULL (never expires) |
| CV / Resume | NULL (never expires) |

Admin can edit any of these via the Document Types page.

After this brief: every doc row everywhere shows validity status; admins can override per-doc; document types are editable; the Documents section gets a `Service Docs` / `KYC Documents` tab pair and the KYC tab is a filterable table.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main`) + update CHANGES.md + append a tech-debt note if anything is deferred.
2. `npm run build` clean.
3. **Migration MUST be pushed.** `npm run db:push` + `npm run db:status`. Confirm Local + Remote columns match.
4. **Don't touch the OCR pipeline.** It already writes `documents.expiry_date` for passports. The expiry computation reads `expiry_date` first; manual override and `valid_for_months` are layered behind it.
5. **Don't store computed expiry in `documents`.** Compute at display time using a single helper. Storing it would require recomputation when rules change.
6. **Don't add new columns beyond `document_types.valid_for_months`.** Everything else uses existing schema (`documents.expiry_date`, `documents.uploaded_at`, `document_types.id`).
7. **Don't break the existing per-profile Documents block (B-077/2).** The new expiry display is **additive** — rows get one more line for `Uploaded` / `Good until` / status badge. Don't restructure the per-profile rendering.
8. **Audit-log the manual expiry override** following B-095's pattern (`action: 'document_expiry_updated'`, entity_type `document`, entity_id = doc id, `previous_value: { expiry_date: <old> }`, `new_value: { expiry_date: <new> }`).
9. **Don't restart the dev server.**

---

## Step 1 — Migration: `document_types.valid_for_months` + backfill

Generate the migration:

```bash
npx supabase migration new document_validity_period
```

```sql
-- B-097 — Document expiry tracking
--
-- Adds valid_for_months (nullable int) to document_types so the UI can
-- compute "good until" as uploaded_at + N months. Manual overrides land
-- in the existing documents.expiry_date column.

ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS valid_for_months INT;

COMMENT ON COLUMN public.document_types.valid_for_months IS
  'How many months after upload a document remains valid. NULL = no fixed period (either never expires, or expiry comes from documents.expiry_date e.g. passport OCR).';

-- Backfill standard durations. Match by canonical name (case-insensitive).
-- Admin can adjust via the Document Types page after this lands.

UPDATE public.document_types SET valid_for_months = 3
WHERE LOWER(name) LIKE '%proof of address%'
   OR LOWER(name) LIKE '%proof of residential address%'
   OR LOWER(name) LIKE '%utility bill%'
   OR LOWER(name) LIKE '%bank reference%'
   OR LOWER(name) LIKE '%reference letter%';

UPDATE public.document_types SET valid_for_months = 12
WHERE LOWER(name) LIKE '%source of funds%'
   OR LOWER(name) LIKE '%source of wealth%'
   OR LOWER(name) LIKE '%declaration%';

-- Passports, IDs, certificates, constitutions, CVs left as NULL.
-- Passports/IDs: OCR populates documents.expiry_date directly.
-- Certificates/Constitutions/CVs: never expire by default.
```

If your `document_types` table uses a different name column (e.g. `display_name`), adjust the WHERE clauses. Verify against live data before running.

`npm run db:push` + `npm run db:status` after the file is saved.

## Step 2 — Compute-expiry helper

Create [`src/lib/documents/computeExpiry.ts`](src/lib/documents/computeExpiry.ts):

```ts
import type { DocumentType } from "@/types";

export type ExpiryStatus = "valid" | "expired" | "never_expires";

export interface DocumentExpiryInfo {
  expiresAt: Date | null;     // null when never_expires
  status: ExpiryStatus;
  source: "manual" | "valid_for_months" | "never";
}

/**
 * Resolves a document's effective expiry date + status from:
 *   1) documents.expiry_date if present (manual override OR OCR-extracted)
 *   2) document_types.valid_for_months computed against documents.uploaded_at
 *   3) Otherwise never expires
 */
export function computeDocumentExpiry(
  doc: { expiry_date: string | null; uploaded_at: string },
  type: { valid_for_months: number | null } | null,
  now: Date = new Date(),
): DocumentExpiryInfo {
  // 1. Manual / OCR expiry_date wins.
  if (doc.expiry_date) {
    const expiresAt = new Date(doc.expiry_date);
    return {
      expiresAt,
      status: expiresAt < now ? "expired" : "valid",
      source: "manual",
    };
  }

  // 2. Computed from valid_for_months.
  if (type?.valid_for_months != null) {
    const uploaded = new Date(doc.uploaded_at);
    const expiresAt = new Date(uploaded);
    expiresAt.setMonth(expiresAt.getMonth() + type.valid_for_months);
    return {
      expiresAt,
      status: expiresAt < now ? "expired" : "valid",
      source: "valid_for_months",
    };
  }

  // 3. Never expires.
  return { expiresAt: null, status: "never_expires", source: "never" };
}
```

Single source of truth for the rule. Every UI surface that displays validity uses this helper.

## Step 3 — Update TypeScript types

File: [`src/types/index.ts`](src/types/index.ts).

Add `valid_for_months: number | null` to the `DocumentType` interface (find its definition; add the field after `category` or wherever feels natural).

Don't widen the type's other fields. Don't add `expires_at` or `validity_status` — those are computed at display time, not stored.

## Step 4 — Display expiry on every document row

Touch every place a document row renders. The badge + good-until line should appear in all of these locations:

- **Service-level Documents** in [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) — the `KycDocRow` (used by both service-level and per-profile blocks).
- **Per-profile Documents** (B-077/2) — same `KycDocRow`, picks up the change automatically.
- **Per-section doc rows** inside KYC subsections (Identity / Address / Financial source docs) — same component.

In the `KycDocRow` JSX, add a small caption row under the filename/badge cluster:

```tsx
const expiry = computeDocumentExpiry(doc, documentType);
return (
  <div className="...existing row classes...">
    {/* existing filename / status / actions row stays as-is */}
    {/* NEW caption row: */}
    <div className="text-xs text-gray-500 flex items-center gap-2 mt-0.5">
      <span>Uploaded {formatShortDate(doc.uploaded_at)}</span>
      {expiry.status !== "never_expires" && expiry.expiresAt && (
        <>
          <span aria-hidden="true">•</span>
          <span>Good until {formatShortDate(expiry.expiresAt.toISOString())}</span>
          <span className={
            expiry.status === "expired"
              ? "bg-red-100 text-red-700 px-1.5 py-0.5 rounded text-[10px] font-medium"
              : "bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded text-[10px] font-medium"
          }>
            {expiry.status === "expired" ? "Expired" : "Valid"}
          </span>
        </>
      )}
      {expiry.status === "never_expires" && (
        <>
          <span aria-hidden="true">•</span>
          <span className="italic">Never expires</span>
        </>
      )}
    </div>
  </div>
);
```

Reuse the existing `formatShortDate` helper if it's in scope; otherwise pull from `date-fns` if available. Don't introduce a new date library.

## Step 5 — Manual expiry override on the document detail dialog

The document detail dialog opens when an admin clicks "View" on a document row. Find the dialog component (likely `DocumentDetailDialog.tsx` or similar — search if not obvious).

Add a small **Expiry** section inside the dialog body:

```tsx
<div className="space-y-2 border-t pt-3">
  <Label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
    Expiry
  </Label>
  <div className="flex items-center gap-2">
    <Input
      type="date"
      value={localExpiryDate ?? ""}
      onChange={(e) => setLocalExpiryDate(e.target.value || null)}
      className="text-sm w-44"
    />
    <Button
      size="sm"
      variant="outline"
      onClick={handleSaveExpiry}
      disabled={localExpiryDate === doc.expiry_date}
    >
      Save
    </Button>
    {doc.expiry_date && (
      <Button
        size="sm"
        variant="outline"
        className={BTN_DESTRUCTIVE_OUTLINE}
        onClick={() => { setLocalExpiryDate(null); handleSaveExpiry(); }}
      >
        Clear
      </Button>
    )}
  </div>
  <p className="text-xs text-gray-500">
    {doc.expiry_date
      ? `Manually set. Clear to fall back to ${type.valid_for_months ? `the ${type.valid_for_months}-month rule.` : 'never expires.'}`
      : type.valid_for_months
        ? `No manual override. Default: uploaded date + ${type.valid_for_months} months.`
        : `No manual override. This document never expires by default.`}
  </p>
</div>
```

`handleSaveExpiry` calls `PATCH /api/admin/documents/[id]/admin-status` (or the existing doc-edit route — see Step 6) with `{ expiry_date: localExpiryDate }`. On success, refresh the doc row via the existing refresh mechanism the dialog already uses.

If the existing detail dialog already has audit / save plumbing, hook in there instead of a separate save button. Goal: one save action, audit-logged.

## Step 6 — Extend the API route for `expiry_date`

The existing `admin-status` route at [`src/app/api/admin/documents/[id]/admin-status/route.ts`](src/app/api/admin/documents/[id]/admin-status/route.ts) handles per-doc admin updates. Extend the PATCH body to accept an optional `expiry_date: string | null`.

When `expiry_date` is in the body:

```ts
const updateData: Record<string, unknown> = {};
if ('admin_status' in body) updateData.admin_status = body.admin_status;
if ('expiry_date' in body) updateData.expiry_date = body.expiry_date;
// ... whatever else the route already handles

await supabase.from("documents").update(updateData).eq("id", id);

// audit
if ('expiry_date' in body && body.expiry_date !== existingDoc.expiry_date) {
  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "document_expiry_updated",
    entity_type: "document",
    entity_id: id,
    previous_value: { expiry_date: existingDoc.expiry_date },
    new_value: { expiry_date: body.expiry_date },
  });
}
```

If the existing audit-log call in that route covers any-update audit already, gate the new audit row only on the `expiry_date` changing so we don't double-audit.

## Step 7 — Document Types admin page: add `valid_for_months` input

File: [`src/app/(admin)/admin/settings/document-types/DocumentTypesManager.tsx`](src/app/(admin)/admin/settings/document-types/DocumentTypesManager.tsx).

For each document type's edit form, add an input:

```tsx
<div className="space-y-1">
  <Label className="text-xs">Valid for (months)</Label>
  <Input
    type="number"
    min="1"
    max="120"
    value={type.valid_for_months ?? ""}
    onChange={(e) => updateType({ valid_for_months: e.target.value ? Number(e.target.value) : null })}
    placeholder="e.g. 3 — leave blank for never expires"
    className="text-sm w-44"
  />
  <p className="text-[11px] text-gray-500">Blank = never expires (or expiry from OCR/manual, e.g. passport).</p>
</div>
```

Update the API route at [`src/app/api/admin/document-types/[id]/route.ts`](src/app/api/admin/document-types/[id]/route.ts) PATCH to accept and persist `valid_for_months`. Per B-095, this route should already write an audit row on update — make sure `valid_for_months` is captured in `previous_value` / `new_value` when it changes.

## Step 8 — Documents section tabs: "Service Docs" / "KYC Documents"

File: `ServiceDetailClient.tsx`, the Documents step section (around the `AdminDocumentsSection` rendering).

Wrap the current service-doc list in a tab structure. Use the existing shadcn/ui `Tabs` component if present in the codebase; otherwise use a simple two-button toggle + conditional render.

```tsx
const [docTab, setDocTab] = useState<"service" | "kyc">("service");

return (
  <div>
    <div className="flex gap-2 border-b mb-3">
      <button
        onClick={() => setDocTab("service")}
        className={docTab === "service" ? "border-b-2 border-brand-navy text-brand-navy px-3 py-2 text-sm font-medium" : "text-gray-500 px-3 py-2 text-sm"}
      >
        Service Docs ({serviceLevelDocs.length}/{serviceDocTypes.length})
      </button>
      <button
        onClick={() => setDocTab("kyc")}
        className={docTab === "kyc" ? "border-b-2 border-brand-navy text-brand-navy px-3 py-2 text-sm font-medium" : "text-gray-500 px-3 py-2 text-sm"}
      >
        KYC Documents ({kycDocs.length})
      </button>
    </div>
    {docTab === "service" ? <ExistingServiceDocList /> : <KycDocumentsTable ... />}
  </div>
);
```

The counts in parentheses use existing data (`serviceLevelDocs` already exists; `kycDocs` is the set of all docs across profiles with `document_types.scope === 'person'`).

## Step 9 — KYC Documents tab: filterable table

Create [`src/components/admin/KycDocumentsTable.tsx`](src/components/admin/KycDocumentsTable.tsx).

**Columns** (each header is a sortable button when feasible):

- Profile (name + role chip)
- Document Type
- Filename
- Uploaded
- Good Until
- Status (Valid / Expired / Never expires / Missing)
- Actions (View)

**Filters** (above the table):

- Profile dropdown — list every unique profile in the service + "All"
- Doc Type dropdown — list every unique doc type appearing in the table + "All"
- Status dropdown — Valid / Expired / Never expires / Missing / All
- (optional) Sort by upload date / good-until / profile

**Data shape:** flatten across profiles. One row per (profile × doc_type) pair, regardless of whether the doc has been uploaded. For unuploaded required doc-types, show:

- Filename column: `—`
- Uploaded column: `—`
- Good Until column: `—`
- Status column: red badge `Missing`
- Action column: `Upload` button that opens the existing per-profile upload flow

For uploaded docs, render the row exactly as the service-doc rows do (filename + status badges + view).

Use the `computeDocumentExpiry` helper for the Status column.

Implementation: build the rows in one pass by iterating profiles × scope=person doc types, joining with the actual `documents` array. Filtering is client-side state; sort uses simple `Array.sort` on the rendered rows.

Don't paginate — this is a POC and even 6 profiles × ~10 doc types = 60 rows max.

Keep the table styling consistent with the existing admin tables on `/admin/services` or `/admin/queue` (find one for reference, mirror the look).

## Step 10 — Document Types audit logging

The Document Types PATCH route already audits (per B-095). After this brief lands and `valid_for_months` is editable, that audit row's `previous_value` / `new_value` should naturally include `valid_for_months` when it changes. Verify by checking the route post-edit; if it only captures a fixed list of fields, add `valid_for_months` to the captured set.

## Step 11 — Smoke test (manual; document in CHANGES.md)

1. **Migration landed.** Run via Supabase: `SELECT name, valid_for_months FROM document_types ORDER BY name;` — Proof of Address / Utility Bill / Bank Reference Letter show `3`; Source of Funds Declaration shows `12`; Passport / Certificate / CV / Constitution show NULL.
2. **Per-doc display.** Open `/admin/services/[id]` on a service with mixed docs. Every document row shows the new caption line: `Uploaded <date> • Good until <date> [Valid|Expired|Never expires]`.
3. **Computed-vs-OCR.** A passport with `expiry_date` set by OCR shows that date as Good Until. A Proof of Address (no OCR expiry, `valid_for_months=3`) shows `uploaded + 3mo` as Good Until.
4. **Manual override.** Click View on a Proof of Address → set expiry date to 1 Jan 2027 → Save. Row caption updates to that date. Audit Trail shows `document_expiry_updated` attributed to you.
5. **Clear override.** Same doc → Clear. Caption reverts to the `uploaded + 3mo` computed date. Audit shows another `document_expiry_updated` with new_value `expiry_date: null`.
6. **Expired badge.** Find or force-create a doc with `expiry_date` in the past — its caption shows the red `Expired` badge.
7. **Never-expires display.** A Certificate of Incorporation row shows `Uploaded <date> • Never expires` (italic, no badge).
8. **Document Types admin page.** Open `/admin/settings/document-types`. Each doc type has a `Valid for (months)` input pre-filled per the migration backfill. Change Proof of Address from 3 → 6, save. Reload an existing service detail page — the row's Good Until shifts accordingly.
9. **Tabs.** Service detail page → Documents section → two tabs: `Service Docs (X/Y)` and `KYC Documents (N)`. Tab selection state is local to the section (doesn't persist across reloads).
10. **KYC Documents table.** Click the KYC tab. Table shows one row per (profile × KYC doc type). Filters at the top: Profile / Doc Type / Status / All. Test each filter combination. Sortable column headers work. "Missing" rows have an `Upload` button that opens the per-profile upload flow.
11. **No regressions in per-profile Documents block.** Inside each profile's expanded body, the existing per-profile Documents block (B-077/2) still works; it now also shows the expiry caption per row.
12. **`npm run build` clean.**
13. **`npm run db:status` clean** — Local + Remote match for the new migration.

---

## CHANGES.md format

```md
### 2026-05-12 — B-097 — Document validity tracking + KYC Documents tab (Claude Code)

Three additions on `/admin/services/[id]`:

- **Per-doc expiry display.** Every document row (service-level + per-profile + per-section) now shows `Uploaded <date> • Good until <date> [Valid|Expired|Never expires]`. Computation: `documents.expiry_date` (manual / OCR) wins → else `uploaded_at + document_types.valid_for_months` → else never expires. Single helper `computeDocumentExpiry` at `src/lib/documents/computeExpiry.ts`.
- **Manual expiry override.** Document detail dialog gets a date-picker + Save/Clear buttons that PATCH `documents.expiry_date` via the admin-status route. Audited as `document_expiry_updated` (action records previous + new expiry).
- **Document Types editor.** New `valid_for_months` input on the Document Types admin page. Pre-populated by migration (Proof of Address / Bank Reference Letter = 3; Source of Funds / Wealth / Declarations = 12; Passport / National ID / Certificates / CV = NULL).
- **Documents section tabs.** `Service Docs` / `KYC Documents`. KYC tab is a flat sortable + filterable table (profile / doc type / status filters) showing every KYC-level doc across all profiles. Missing required docs render with an Upload action.

Migration `<YYYYMMDDHHMMSS>_document_validity_period.sql` adds `document_types.valid_for_months` and backfills standard durations. Pushed via `npm run db:push`; `db:status` clean.

Smoke test: <pass/fail from Step 11>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT add a `validity_field_key` column or KYC-field-based expiry source. Vanessa explicitly chose option (a) — `valid_for_months` only.
- Do NOT change the OCR pipeline. It already writes `documents.expiry_date` for passport-like docs.
- Do NOT store computed expiry. Compute at display time only.
- Do NOT introduce a date library beyond what's already in package.json.
- Do NOT paginate the KYC Documents table — POC scale.
- Do NOT restructure the per-profile Documents block; only add the caption line.
- Do NOT change the service-level Documents header count format (B-085's `X of Y uploaded · Z%`).
- Do NOT skip `npm run db:push` / `db:status`.
- Do NOT restart the dev server.
