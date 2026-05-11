# CLI Brief — B-085 Service-Level Documents Section: Filter, Dedupe, Upload-Based Count

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** Possibly (only if `document_types.level` doesn't exist yet — see Step 1)
**Touches AI verification:** No
**Touches API:** Yes (extending what the page route returns)
**Builds on:** B-077 (Documents block), B-078 (admin save flows), B-084 (per-section doc filter for KYC subsections)

---

## Why this batch exists

The Documents section at the **service level** on `/admin/services/[id]` currently shows per-person KYC docs (Certified Passport Copy, Proof of Residential Address, Source of Funds declarations, etc.) — those belong inside each profile's per-profile Documents block (B-077/2), not at the service/company level. Vanessa's expectation is that the service-level section only shows docs tied to the company entity itself: Certificate of Incorporation, Draft Constitution, evidence of local office, corporate structure diagram, etc.

There are also two display bugs:
- **Duplicates** — the same doc type appears twice in the list (e.g. "Declaration of Source of Funds" listed two times)
- **Count mismatch** — header reads `Documents (0) · 17% · Partial` despite the list having content; "0" comes from one source while the bar/% comes from another

Single change, single batch. Scope is the service-level Documents section only — per-profile Documents blocks (B-077/2) are unchanged.

After this brief: service-level Documents section shows only company/service docs, no duplicates, with the header count reflecting upload state ("X of Y uploaded · Z%").

---

## Hard rules

1. **One batch only.** Commit + push + update CHANGES.md when done.
2. **Out of scope, leave alone:**
   - Per-profile Documents blocks (B-077/2) inside each profile's expanded view — must continue showing all KYC-level docs per person
   - Per-section doc rows inside KYC subsections (Identity / Address subdivider / etc.) — already covered in B-084 Batch 3, separate filter
   - The new B-083 section pill style on the Documents header — preserve it
   - Bottom Documents block in the *client* portal — unchanged
3. `npm run build` must pass.
4. **Reuse the existing `document_types` schema.** Don't create new tables. The `level` (or equivalent) field probably already exists — verify before adding a migration.
5. **Don't introduce a new state-management library.**

---

## Step 1 — Investigate the document_types schema (do this first, before coding)

Before touching anything, grep the schema and seed data to find the field that distinguishes KYC-level docs from service-level docs. Likely candidates by name:

- `document_types.level` — possible values like `'kyc' | 'service'`
- `document_types.scope` — same idea, different name
- `document_types.applies_to` — JSON column, may include level info
- `document_types.category` — already exists; categories like `'identity' | 'financial' | 'company' | 'substance'` could imply level (e.g. `company` and `substance` categories are service-level by default)

Steps:
1. Read `src/types/index.ts` for the `DocumentType` type
2. Grep `supabase/migrations/` for `document_types` to see all columns
3. Read seed files in `supabase/` if present to see actual values
4. Check API routes that return doc types (`src/app/api/document-types/...` or wherever) to understand the shape

**Decision tree:**

- **If a level field already exists** → use it. Skip Step 2 (no migration). Move directly to Step 3.
- **If no level field exists but `category` cleanly maps** → derive level from category. KYC-level categories: `identity`, `financial_personal`, `declarations` (or whatever the per-person ones are called). Service-level: `company`, `substance`, `corporate_structure`, `other`. Skip Step 2.
- **If neither exists** → add a level field via migration (Step 2).

Document your finding in CHANGES.md so the rest of the brief makes sense.

## Step 2 — Migration (only if Step 1 found no usable field)

Create migration `supabase/migrations/<YYYYMMDDHHMMSS>_document_types_add_level.sql`:

```sql
ALTER TABLE document_types
  ADD COLUMN IF NOT EXISTS level TEXT NOT NULL DEFAULT 'kyc'
  CHECK (level IN ('kyc', 'service'));

-- Backfill known service-level docs based on category or name
UPDATE document_types SET level = 'service'
WHERE category IN ('company', 'substance', 'corporate_structure', 'other')
   OR LOWER(name) LIKE '%incorporation%'
   OR LOWER(name) LIKE '%constitution%'
   OR LOWER(name) LIKE '%memorandum%'
   OR LOWER(name) LIKE '%articles of association%'
   OR LOWER(name) LIKE '%board meeting%'
   OR LOWER(name) LIKE '%lease agreement%'
   OR LOWER(name) LIKE '%corporate structure%'
   OR LOWER(name) LIKE '%auditor%';
```

Adjust the backfill logic based on what you find in actual data — print the rows pre/post-update before pushing.

**Then** run `npm run db:push` and `npm run db:status` per CLAUDE.md migration workflow. Add a CHANGES.md entry for the migration.

## Step 3 — Filter the service-level Documents section

Locate the service-level Documents block in [`ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx). It's the expanded section under the `Documents` step pill (separate from per-profile Documents blocks).

Change the doc-list query / filter to include only doc types where `level === 'service'`.

**Pseudocode:**
```ts
const serviceDocTypes = allDocumentTypes.filter(dt => dt.level === 'service');
const serviceLevelUploads = localDocs.filter(d =>
  serviceDocTypes.some(dt => dt.id === d.document_type_id)
);
```

Render rows for every entry in `serviceDocTypes`:
- If a matching upload exists → `KycDocRow` with `is_uploaded=true` (View / Replace / Approve / Revoke admin actions)
- If no match → `KycDocRow` with `is_uploaded=false` and Upload button (matching the empty-state pattern from B-078/4)

## Step 4 — Dedupe

After the filter, dedupe the doc list by `document_type.id`. If a doc type appears twice in the underlying data (likely a seed-data bug or accidental duplicate template entry), the rendered list shows it once. Document the dedupe in CHANGES.md and flag the duplicate in the underlying data — Vanessa should know there's a dedupe needed at the data layer (could be a follow-up brief).

If you find duplicates in `document_types` itself (same name, two rows), don't delete them in this brief — only dedupe in the rendered list. Flag for follow-up.

## Step 5 — Replace the count display

Today the header reads `Documents (N) · X% · Partial` where `N` and `X` are computed inconsistently.

Replace with: **`X of Y uploaded · Z%`** where:
- `X` = count of unique service-level doc types with at least one upload
- `Y` = count of unique service-level required doc types
- `Z` = `Math.round((X / Y) * 100)` if `Y > 0`, else `0`
- Keep the dot-status indicator before the count (●) using the existing color logic (red at 0%, amber for partial, green at 100%)
- Keep the "Partial" / "Complete" / "Not started" status text after the count, derived from `Z`:
  - `Z === 100` → `Complete`
  - `Z > 0 && Z < 100` → `Partial`
  - `Z === 0` → `Not started`

Final header reads, e.g.: `● 3 of 5 uploaded · 60% · Partial`.

This count format applies only to the service-level Documents pill — per-profile Documents blocks keep their existing format.

## Step 6 — Smoke test

Open `/admin/services/[id]` for a service with mixed uploads:

1. Service-level Documents section: list contains only company/service docs (Certificate of Incorporation, Constitution, lease agreement, corporate structure diagram, board meeting evidence, auditors info, etc.). No KYC-per-person docs (no Passport, no CV, no Proof of Address, no Source of Funds declarations).
2. No duplicate doc types in the list.
3. Header reads `● X of Y uploaded · Z% · Partial/Complete/Not started` with X, Y, Z reflecting actual data.
4. Open a profile inside People & KYC → expanded Documents block still shows ALL KYC-level docs for that person (Passport, CV, Driving Licence, National ID, Proof of Occupation, Proof of Residential Address, Source of Funds, Source of Wealth, etc.). Service-level docs DO NOT appear here.
5. Upload a service-level doc via the empty-state Upload button → row swaps to View, header count increments by 1, % updates.
6. Replace a service-level doc via Document detail dialog → row updates, count unchanged, audit_log entry written (B-085 reuses B-077/7's `writeAuditLog`).
7. `npm run build` passes.

Document smoke test result in CHANGES.md.

---

## CHANGES.md format

```md
### YYYY-MM-DD — B-085 — Service-level Documents filter + dedupe + upload-based count (Claude Code)

Service-level Documents section on `/admin/services/[id]` now filters to docs where `document_types.<level field>` resolves to service-level only. KYC-per-person docs (Passport, CV, Source of Funds declarations, etc.) drop out of this section and remain only in per-profile Documents blocks (B-077/2). List dedupes by `document_type.id`. Header count reads `X of Y uploaded · Z%` where X = unique uploaded service-level docs, Y = required service-level docs.

<Note which field was used / whether a migration was added>
<Flag if duplicates were found in document_types data needing follow-up>
```

---

## What NOT to do

- Do NOT touch per-profile Documents blocks (B-077/2) — must keep showing KYC-level docs per person
- Do NOT delete duplicate rows from `document_types` in this brief — only dedupe at render
- Do NOT change the bottom Documents block in the **client** portal
- Do NOT change the per-section doc rows inside KYC subsections (Identity etc.) — that's B-084 Batch 3's job
- Do NOT introduce React Query / Zustand / new state libraries
- Do NOT touch the section pill styling (B-083) — preserve as-is
