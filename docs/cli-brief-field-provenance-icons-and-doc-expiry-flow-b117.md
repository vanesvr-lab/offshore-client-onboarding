# B-117 — Field provenance icons, mismatch detection, and doc expiry source-of-truth

## Goal

Make the admin KYC long-form review tell the truth about where each field's value came from, whether it matches the source document, and whether the source document is expired. Specifically:

1. Collapse the confusing twin-sparkle UX into a single, state-driven icon vocabulary (with `eye` action when a doc exists).
2. Detect mismatches between the form value and the OCR-extracted value, surface them with a red flag, and offer a one-click "use uploaded value" popover.
3. Make the source document the single source of truth for its own expiry — fix the writeback so `service_documents.expiry_date` is populated from OCR, which then drives the doc-card badge AND the existing 60-day auto-alert.
4. Diagnose and fix the "Re-apply doesn't activate Save / nothing persists" bug.

## Context — what's broken today

Concrete view: `/admin/services/[id]?step=4`, expanding any individual profile's Identity section.

- The doc card "Certified Passport Copy" shows two orange icons (AI flagged + Pending admin review). Below the title it reads `Uploaded 20 Apr 2026 · Never expires`. That `Never expires` is wrong — the passport is expired. The reason: OCR extracted `passport_expiry` and wrote it to the form's `passport_expiry` column, but **never wrote it to `service_documents.expiry_date`**, so `computeDocumentExpiry` falls back to `valid_for_months` (also null), giving "Never expires". The 60-day auto-alert in `computeAutoAlerts` therefore has no data to act on.
- Every AI-extractable field shows **two icons** next to its label:
  - `<Sparkles>` hardcoded next to the `*` (capability marker "this field is AI-extractable") — `ServiceDetailClient.tsx:1257-1259`
  - `<FieldProvenanceMarker>` (dynamic) — sparkle for `ai_extraction`, pencil for `admin_override`, nothing for `manual` — `FieldProvenanceMarker.tsx:66-146`
  - Both render as identical-looking blue sparkles. Vanessa: "the icon is the same for both filled from extract and view".
- Editing an auto-filled field does not change the provenance marker — the sparkle persists even though the value no longer matches the OCR. There's no mismatch detection.
- Clicking "Re-apply" runs `handleReapplySection` (`ServiceDetailClient.tsx:734-779`). It POSTs to `/api/profiles/kyc/save` (which writes to `client_profile_kyc`), then calls `onAfterReapply(payload)` to sync `savedFields` so the dirty tracker doesn't re-flag. The Save button correctly stays inactive per B-078 Batch 1. **Vanessa reports the reapplied values don't actually persist** — needs root-cause diagnosis (Batch 3).

## Locked design decisions (from brainstorming)

### Icon vocabulary per field

Each field has **two icon slots** next to its label. Left = state, right = action.

| Situation | Left icon | Color | Right icon (only when a doc exists for the profile) | Tooltip on left |
|---|---|---|---|---|
| No doc uploaded, field empty | none | — | none | — |
| No doc uploaded, manually filled | `PenLine` | black (`text-gray-900`) | none | "Manually entered. Upload a {doc-type} to verify." |
| Doc uploaded, OCR couldn't extract this field | `ShieldOff` | amber (`text-amber-600`) | `Eye` (blue) | "Could not extract this field from {file}." |
| Doc uploaded, value came from OCR (untouched) | `Sparkles` | blue (`text-blue-500`) | `Eye` (blue) | "Auto-filled from {file}." |
| Doc uploaded, manually typed/edited, matches OCR (normalized) | `Check` | green (`text-green-600`) | `Eye` (blue) | "Matches {file}." |
| Doc uploaded, manually typed/edited, differs from OCR | `Flag` | red (`text-red-600`) | `Eye` (blue) | "Doesn't match {file}. Expected: {ocr-value}." |

**Removals:**

- Remove the hardcoded `<Sparkles>` capability marker on `ServiceDetailClient.tsx:1257-1259`.
- Remove the `admin_override` → amber pencil branch from `FieldProvenanceMarker`. In the new model, an admin edit that matches OCR shows green check; an edit that differs shows red flag. The provenance row's `source` field is still written as `admin_override` on save (audit-log integrity) but does not drive the icon — the icon is computed from `(latest extraction value, current form value, normalized)`.

**All icons get hover tooltips** via the existing `Tooltip`/`TooltipProvider`/`TooltipContent` primitives.

**Click affordances:**

- `Eye` (right slot): opens the existing `DocumentPreviewDialog` for the source doc. Same behaviour as the current sparkle's click in `FieldProvenanceMarker`.
- `Flag` (left slot, mismatch only): opens a **click-to-fix popover** (see "Click-to-fix popover" below).
- All other left-slot icons: no click action — display + tooltip only.

### Mismatch detection — timing + normalization

- **Timing:** compute on **`onBlur`** of the field. Not on every keystroke (too noisy), not deferred to save (admin could save mismatched data without knowing).
- **Normalization** before equality check:
  - Text fields: `trim()`, collapse internal whitespace, case-insensitive compare.
  - Date fields (`type: "date"`): parse both to `YYYY-MM-DD` and compare ISO strings.
  - Country fields (`type: "country"`): normalize to ISO-3 via the existing country list helper — handles `"Mauritius"` vs `"MUS"` vs `"MU"`.
  - Boolean/select fields: strict equality on normalized lowercase string.
- When the form value or extracted value is empty after normalization, treat as "no comparison" (fall back to the "auto-filled untouched" or "manual" icon depending on which is empty).
- Source of truth for the OCR value: most recent `field_extractions` row for `(client_profile_id, field_key)` with `source = 'ai_extraction'`, **regardless of `superseded_at`**. Superseding happens when admin saves an override, but the original OCR value is still the comparison baseline — so we pick by `extracted_at` across all `ai_extraction` rows.

### Match-state decision table

Computed each render of `FieldProvenanceMarker`. Pseudocode:

```
const ocrExtraction = latest ai_extraction row for (profile, field) by extracted_at   // may be null
const profileHasAnyDoc = sourceDocs.length > 0
const ocrValue = ocrExtraction?.extracted_value
const currentValue = props.currentValue
const normalizedEqual = ocrValue != null && normalize(currentValue, fieldType) === normalize(ocrValue, fieldType)
const currentIsEmpty = isEmpty(currentValue)

if (!profileHasAnyDoc) {
  return currentIsEmpty ? "empty_no_doc" : "manual_no_doc"      // none | PenLine black
}
if (!ocrExtraction) {
  return "extraction_skipped"                                    // ShieldOff amber
}
// doc(s) uploaded AND OCR did extract this field
if (currentIsEmpty)        return "extraction_skipped"           // OCR has value but form was cleared — treat as skipped
if (normalizedEqual) {
  const latestAnyRow = latest field_extractions row for (profile, field) by extracted_at
  return latestAnyRow.source === "ai_extraction"
    ? "auto_filled_untouched"                                    // Sparkles blue
    : "manual_match"                                             // Check green
}
return "manual_mismatch"                                         // Flag red
```

This is the only place the icon decision happens. Don't duplicate the logic elsewhere.

### Click-to-fix popover

When the admin clicks the red `Flag`:

- A small popover opens next to the icon (use the existing `Popover`/`PopoverContent` from shadcn/ui).
- Content:
  - Heading: `OCR says: "{ocr-value}"`
  - Subtext: `From {file_name}`
  - Single button: **"Use uploaded value"** (primary).
  - Cancel by clicking outside or pressing Esc.
- Clicking the button calls the field's `onChange` with the OCR-extracted value (post-normalization). The icon flips to green `Check` on next render. No save is triggered — admin still has to click Save to persist.
- The popover is **non-modal** — does not block the rest of the form.

### Doc expiry source-of-truth (the "passport is expired" bug)

**Principle:** the source document is canonical for its own expiry. The form field (`passport_expiry`, `residence_permit_expiry`, etc.) is a view onto the doc's expiry; admin edits to the form field that differ from the doc's expiry surface as mismatches (red flag), exactly like any other field.

**Writeback:** when `recordAiExtractionProvenance` (`src/lib/ai/recordProvenance.ts`) records an OCR extraction whose `prefill_field` is the configured "doc expiry" key for that document type, **also** update `service_documents.expiry_date` on the source document row. Mechanism (pick the cleaner option at implementation time):

- **Option A (preferred):** add a boolean `is_document_expiry` flag to each entry of `document_types.ai_extraction_fields`. `recordAiExtractionProvenance` checks this flag and updates `service_documents.expiry_date` when true. Backfill the flag on existing config rows for passport, residence permit, driver's license, visa, etc. (whichever doc types Vanessa wants — Batch 2 starts with passport and any other identity-style doc currently in the seed).
- **Option B (fallback if config flag is awkward):** a hardcoded mapping in `recordProvenance.ts` from `prefill_field` key to "this is a doc-expiry write". Simpler, less general. CLI picks A unless A turns out to require a migration that adds complexity disproportionate to the gain.

**Backfill of existing data:** one-shot migration (or admin route) that, for every `field_extractions` row with `source='ai_extraction'` and `field_key` in the doc-expiry set, copies `extracted_value` into `service_documents.expiry_date` on the row pointed to by `source_document_id` — only if `service_documents.expiry_date IS NULL`. Idempotent.

**Doc card display** (`KycDocRow.tsx`): once `expiry_date` is populated, `computeDocumentExpiry` already returns the right `status`. Update the badge to support a **third state**, `"expiring_soon"`, when:

```
status === "valid" AND expiresAt - now <= 60 days
```

Badge styles:

- `expired` (today: `bg-red-100 text-red-700`) — unchanged.
- `expiring_soon` (new) — `bg-amber-100 text-amber-700`, label `Expires in N days` or `Expires {date}` (pick the more readable; lean toward the days count when ≤ 60d).
- `valid` (today: `bg-emerald-50 text-emerald-700`) — unchanged, label stays `Valid`.
- `never_expires` — unchanged.

Don't add the `expiring_soon` derivation to `computeDocumentExpiry` itself (it returns the typed enum that other consumers rely on); compute the 60-day check at the display site in `KycDocRow`.

**Auto-alert / right-rail:** `computeAutoAlerts` already implements `≤30d → warning, 31–60d → info, expired → critical`. Once `service_documents.expiry_date` is populated, the Pending card on the right rail will surface these alerts automatically with no code change.

### Re-apply bug

Out of scope for design — the symptom is "Save stays inactive AND values aren't persisted." Diagnosis steps for Batch 3:

1. Repro: open `/admin/services/[id]?step=4`, expand a profile that has prior AI extractions, click `Re-apply` on a section. Capture the network tab (`/api/profiles/kyc/save` request + response), the DB state of `client_profile_kyc` for that row before/after, and the page state after `router.refresh()`.
2. Confirm whether the persist succeeds at the DB level. The endpoint writes to `client_profile_kyc` (`src/app/api/profiles/kyc/save/route.ts:20+`). If it succeeds, the bug is in client-side state sync; if it fails, the bug is in tenant scoping or the kyc-id mismatch between legacy `kyc_records.id` and modern `client_profile_kyc.id`.
3. Verify `onAfterReapply` is being passed through to PersonCard correctly so `savedFields` resets in sync with `setFields`. If `savedFields` doesn't update, the next user edit will diff against stale baseline.
4. Fix the root cause; don't paper over with a force-refresh.

## In scope

- All locked design decisions above.
- Field icon refactor, mismatch detection, click-to-fix popover (Batch 1).
- OCR → `service_documents.expiry_date` writeback + backfill migration + doc-card "Expiring soon" badge (Batch 2).
- Re-apply bug diagnosis and fix (Batch 3).

## Out of scope (and why)

- **Right-rail layout / Pending card content changes.** The existing 60-day rule in `computeAutoAlerts` and the Pending card wiring (`ServiceDetailClient.tsx:5727-5740`) already surface expiring-doc alerts. Once Batch 2 lands, alerts light up automatically. Vanessa will scope a separate brief if she wants additional right-rail changes after seeing this in action.
- **Doc-card mismatch chip** (a flag chip on the doc card when any tied field mismatches). Useful but adds visual noise on top of an already busy card; deferred until the field-level flags are observed in practice. Add a tech-debt entry pointing at this.
- **Renaming `field_extractions.source` enum.** The legacy `admin_override` source label stays in the DB for audit-log integrity even though the UI no longer renders a pencil for it.
- **Provenance-icon work on the client wizard.** B-070 explicitly scoped the marker to admin views; this brief keeps that boundary.

## Implementation — batched

Each batch ends with: stage specific files (never `git add -A`), commit with a descriptive message (no `B-117` in the commit message), `git push HEAD:main` (this is a worktree session — main is the only branch CLI pulls), update `CHANGES.md` with the batch outcome.

### Batch 1 — Field provenance icons + mismatch detection + click-to-fix popover

Files (non-exhaustive — CLI to confirm by reading):

- `src/components/admin/FieldProvenanceMarker.tsx` — rewrite. New props: `currentValue: unknown`, `fieldType: KycField["type"]`, plus the existing `extractions` and `sourceDocs`. Computes `matchState` internally. Renders left-slot icon + right-slot eye + flag popover.
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — remove the hardcoded `<Sparkles>` block on `1257-1259`. Pass `currentValue` and `field.type` to `FieldProvenanceMarker`. Wire the field's `onBlur` so the marker re-renders with the post-blur value (the current code re-renders on every state change anyway via `setFields`, but verify the blur timing matches design).
- Add normalization helpers in `src/lib/kyc/normalizeForCompare.ts` (or co-located with the marker). Pure functions, unit-test.
- Use existing `Popover` primitives (`@/components/ui/popover`) for the click-to-fix popover.

For the **hand-pencil for "manual, no doc uploaded"** state, use Lucide's `PenLine`. (Vanessa approved the trade-off — closer match to her clipart reference than `Pencil`/`Edit3`, no custom SVG needed.)

For the **"OCR couldn't extract this field" state**, use `ShieldOff` in amber. (Consistent with the doc-level "AI skipped" treatment in `DocumentStatusBadge`.)

Add unit tests for the normalization helpers covering: case-insensitive text, whitespace collapse, ISO-date parsing of `"05/25/1978"` vs `"1978-05-25"`, country code unification, empty-string handling.

### Batch 2 — OCR writeback to `service_documents.expiry_date` + doc-card "Expiring soon" badge + backfill

Files:

- `src/lib/ai/recordProvenance.ts` — extend `recordAiExtractionProvenance` to also write `service_documents.expiry_date` when the extraction maps to a doc-expiry field. Implement Option A (config flag `is_document_expiry` on `ai_extraction_fields`); fall back to Option B only if A blows up.
- `src/components/kyc/KycDocRow.tsx` — add the `expiring_soon` branch (60-day threshold, amber pill) to the existing expiry display block. Compute at display, not in `computeDocumentExpiry`.
- Seed updates (if Option A): update the `ai_extraction_fields` config for the relevant document types (Certified Passport Copy at minimum; Residence Permit, Driver's License, Visa if their configs already extract the expiry — CLI grep the seed to confirm). Set `is_document_expiry: true` on the right entry.
- **Migration**: `supabase/migrations/<timestamp>_backfill_service_documents_expiry_from_extractions.sql`. Backfill existing rows. Idempotent (only updates `WHERE service_documents.expiry_date IS NULL`).

**CLI must run `npm run db:push` and `npm run db:status` after creating the migration.** Migration-touching briefs that defer the push to the user are a known prod-500 cause (B-049 → B-054). Confirm Local/Remote pairing before moving to Batch 3.

### Batch 3 — Re-apply bug diagnosis and fix

- Repro per the steps in "Re-apply bug" above.
- Document the root cause in CHANGES.md.
- Fix at the root. No silent `router.refresh()` band-aids.
- Add a Playwright or integration test that covers Re-apply persistence so this doesn't regress.

## Database changes

- Possibly: add `is_document_expiry` boolean to entries in `document_types.ai_extraction_fields` (JSONB; no schema migration needed — just data update).
- Migration: backfill `service_documents.expiry_date` from existing `field_extractions` rows.

Per CLAUDE.md "Database Migration Workflow": **CLI runs `npm run db:push` AND `npm run db:status` as part of Batch 2.** Do not hand off the push to Vanessa.

## Testing

- Unit tests for normalization helpers (Batch 1).
- Vitest test for `recordAiExtractionProvenance` doc-expiry writeback path (Batch 2).
- Playwright spec or integration test for Re-apply persistence (Batch 3).
- All three batches: `npm run build` must pass before the batch commits.

## Tech-debt notes

Append to `docs/tech-debt.md` (newest at top) after Batch 2 lands:

- Doc-card title-level mismatch chip: when any field tied to a doc disagrees with its OCR value, the doc card itself shows a small red flag chip. Deferred until field-level flags are observed in practice — add only if Vanessa reports the per-field flags get lost in the form's visual density.
- The legacy `field_extractions.source = 'admin_override'` value is no longer rendered with its own icon (audit-log only). When confidence is high it's not surfacing anywhere user-visible, consider collapsing into `manual` in a follow-up.

## End-of-brief checklist for CLI

After Batch 3 commits and pushes:

1. Confirm `git status` is clean and `git status -sb` says up-to-date with `origin/main`.
2. Confirm CHANGES.md tail has one entry per batch with the right date.
3. Run the dev-server reset from the **main project root, not the worktree** (per Vanessa's preferences — `.env.local` only lives at the project root):
   ```
   cd /Users/elaris/Documents/Claude_webapp_client_onboarding && pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. One-line chat summary back to Vanessa: "B-117 done — field icons + doc expiry SoT + re-apply fix. {N} batches committed, migration pushed."

## Worktree note

This brief was written in worktree `stupefied-bhabha-fb0c3f`. All commits during execution must land on `origin/main` via `git push HEAD:main` — CLI only pulls main. Do not push to the worktree branch.
