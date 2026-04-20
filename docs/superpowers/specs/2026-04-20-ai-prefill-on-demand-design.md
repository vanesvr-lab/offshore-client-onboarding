# On-Demand AI Prefill in Identity Step

**Date:** 2026-04-20
**Status:** Approved design, ready for implementation plan
**Scope:** Client KYC wizard — Individual KYC only (organisation KYC unchanged)

## Problem

Today, when a client uploads a passport (or other identity document) inside a person card in the People step of the service wizard, the AI extraction runs and an `AiPrefillBanner` immediately appears next to the document. The banner forces the user to choose **Apply / Skip** plus a "keep mine / overwrite all" conflict mode — at upload time, in the documents area, *before* the user has even seen the form fields the data would go into.

This is the wrong moment to ask for that decision. The user is busy uploading; the form they would prefill is on a different step of the wizard.

## Goal

Move the prefill decision out of the upload moment and into the Identity step where the fields actually live. Keep the AI's extraction silent at upload time. Surface a clear, opt-in **"Fill from uploaded document"** action on the Identity step itself, plus a subtle indicator in the step nav so users discover it.

## Non-Goals

- Organisation KYC (incorporation cert extraction) is out of scope. Same pattern can be added later if needed.
- The DB column `documents.prefill_dismissed_at` is not migrated away. It just stops being read/written from this surface.
- The reusable backend pieces (`/api/profiles/kyc/save`, `KYC_PREFILLABLE_FIELDS`, `ai_extraction_fields[].prefill_field` mapping) stay as-is.

## Design

### 1. Remove the forced banner at upload time

- Delete the `<AiPrefillBanner ... />` block in `src/components/client/ServiceWizardPeopleStep.tsx` (currently around lines 553–585) along with the `AiPrefillBanner` import.
- Delete `src/components/shared/AiPrefillBanner.tsx` (no other call sites — verified via grep).
- Delete the now-unused dismiss endpoint `src/app/api/documents/[id]/dismiss-prefill/route.ts` (it was only called from the banner).
- The document tile in the People step shows only its normal verification status (Verified / Processing / Failed). No prefill UI in the documents area.

### 2. Subtle indicator on the Identity step nav

- In `src/components/kyc/KycStepWizard.tsx`, render a small ✨ sparkle icon overlaying or beside the **Identity** step indicator.
- **Visible when:** the current person has at least one uploaded document with `verification_result.extracted_fields` containing at least one prefillable value that does **not** already match the corresponding form field. (See "Prefillability rule" below.)
- **Hidden when:** no extracted data is available, or every extractable value is already present in the form.
- Tooltip / `title`: "AI-extracted data is available — fill it in from the Identity step."

### 3. "Fill from uploaded document" button on the Identity step

- New button rendered at the **top of `IndividualKycForm.tsx`**, above the first section card.
- **Label:** "✨ Fill from uploaded document"
- **Subtitle:** "Uses values extracted from your passport / ID."
- **Visibility rules** — identical to the step-nav indicator:
  - Hidden if there is nothing prefillable right now.
  - Otherwise visible.
- **Click behavior — single action, no dialog, no conflict-mode select:**
  - For each prefillable extracted field, if the matching form field is empty (`null` / `undefined` / `""` after trim), set it to the extracted value.
  - If the matching form field already has a value, **leave it alone**. No overwrite, no prompt.
  - Update the form state via the existing `onChange` handler so the user immediately sees the populated fields.
  - Toast (Sonner):
    - On fields filled: `Filled N field{s} from your uploaded document.`
    - On nothing changed (edge case where rule matched but all fields turned out non-empty by the time of click): `All extractable fields are already filled.`
  - The button stays visible if some fields remain unfilled after the action; otherwise it disappears (visibility rule re-evaluates on render).
- **Persistence:** the same `/api/profiles/kyc/save` endpoint the old banner used.
  - **Order:** call the API first, then update local form state on success. This avoids a flash-then-revert if the save fails.
  - **On API failure:** show error toast (`Couldn't fill from document — please try again.`), do not update form state, button stays visible.
  - **Loading state:** while the request is in flight, the button shows a spinner and is disabled.

### 4. Prefillability rule (single source of truth)

A small pure helper, e.g. `src/lib/kyc/computePrefillable.ts`:

```ts
export interface PrefillableField {
  target: string;   // e.g. "passport_number"
  value: string;    // extracted value
  sourceDocId: string;
  sourceDocLabel: string; // doc type name, for telemetry/toast if needed
}

export function computePrefillableFields(args: {
  form: Record<string, unknown>;            // current IndividualKycForm values
  docs: Array<{                             // uploaded docs for this person
    id: string;
    document_type_id: string | null;
    verification_result: { extracted_fields?: Record<string, unknown> } | null;
  }>;
  docTypes: Array<{                         // doc-type definitions in scope
    id: string;
    name: string;
    ai_extraction_fields: AiExtractionField[];
  }>;
}): PrefillableField[]
```

Rules inside the helper:

- For each doc, look up its document type's `ai_extraction_fields`.
- For each field with a non-empty `prefill_field` that is also in `KYC_PREFILLABLE_FIELDS`, read `verification_result.extracted_fields[field.key]`.
- Skip if extracted value is `null` / `undefined` / `""`.
- Skip if `form[prefill_field]` already has a non-empty value (after trim).
- Otherwise emit a `PrefillableField` row.
- If multiple docs extract the same target, the first non-empty one wins (stable order — by upload time ascending).

This helper is consumed by:
- `KycStepWizard` (to decide whether to show the ✨ on the Identity step nav).
- `IndividualKycForm` (to decide whether to show the button, and to compute the apply payload on click).

### 5. Data flow

`ServiceWizardPeopleStep` already has `localDocs` (the list of uploaded documents) and the per-person `kycRecordId` / form values. It needs to pass two new pieces down through `KycStepWizard` → `IndividualKycForm`:

1. `personDocs: Array<UploadedDocSummary>` — the uploaded documents for this person, including `verification_result.extracted_fields` and `document_type_id`.
2. `personDocTypes: Array<DocTypeSummary>` — the document type definitions for those docs (so the helper can read their `ai_extraction_fields`). These are already loaded in the People step (`dt` objects in the doc list).

Both already live in `ServiceWizardPeopleStep`. No new fetches are needed.

### 6. Cleanup

- Remove the import of `AiPrefillBanner` from `ServiceWizardPeopleStep.tsx`.
- Remove `prefill_dismissed_at` from the in-memory `localDocs` shape if/where it's only used by the banner.
- Delete `src/app/api/documents/[id]/dismiss-prefill/route.ts`.
- Leave `documents.prefill_dismissed_at` column in the DB (no migration). Untouched, harmless.
- Keep `KYC_PREFILLABLE_FIELDS` in `src/lib/constants/prefillFields.ts` — reused by the helper.

## UX details

- Button styling: full-width, dashed-border outline button at the top of the form body, brand-blue accent. Visually similar to the old banner but action-only (no Apply/Skip/Select clutter).
- Indicator on step nav: small ✨ icon (Lucide `Sparkles`) absolutely-positioned at top-right of the Identity step circle, in `text-blue-500`. Hidden via conditional render — does not occupy layout when absent.
- Both surfaces re-render reactively as form values change (the helper is called on every render with current form state, so the button/indicator hide the moment the last extractable value is filled).

## Testing (manual)

1. Create a new application, reach the People step, add a director.
2. In the person card, upload a passport. Wait for AI extraction to complete.
3. Confirm: no banner appears in the documents area. Document tile shows verified status only.
4. Open the person's KYC wizard. Confirm a ✨ icon appears on the Identity step nav.
5. Navigate to the Identity step. Confirm the "✨ Fill from uploaded document" button is visible at the top.
6. Click the button. Confirm:
   - Empty fields (e.g. `passport_number`, `date_of_birth`) get filled.
   - Pre-existing values are not overwritten.
   - Toast appears: "Filled N fields from your uploaded document."
   - Button disappears (or stays if extracted data still has unfilled targets).
   - ✨ on step nav disappears once all extractable values are present.
7. Reload the page. Form state persists. Button remains hidden (because data is now in the form).
8. Manually clear a previously-prefilled field. Confirm the button re-appears on next render.
9. Edge: upload a doc with a failed extraction. Confirm no button, no indicator.

## Out of scope / future work

- Same pattern for `OrganisationKycForm` (incorporation cert extraction).
- A "preview / pick which fields to fill" dialog (deliberately rejected — single-action keeps the UX light).
- Re-extracting fields after a doc is replaced — already handled by the existing AI-poll path; this design just consumes whatever `verification_result.extracted_fields` currently holds.
