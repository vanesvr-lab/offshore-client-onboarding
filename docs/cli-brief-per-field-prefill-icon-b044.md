# B-044 — Per-field AI prefill icon + diagnose proof-of-address bug

**Type:** Bugfix + UX enhancement
**Depends on:** B-042 (on-demand AI prefill), B-043 (wizard polish) — both already shipped
**Scope:** Single batch. Both items ship together. Commit + push + update CHANGES.md when done.

## Background

B-042 shipped the on-demand prefill UX:
- `src/lib/kyc/computePrefillable.ts` — pure helper that returns only fields where (extracted value exists) AND (form field is empty).
- `IndividualKycForm.tsx` and `KycStepWizard.tsx` consume the helper to show the top button and the ✨ indicator on the step nav.
- `ServiceWizardPeopleStep.tsx` lines 1582–1585 feed `personDocs` + `personDocTypes` down to the wizard.

There are two problems a real user hit:

1. **After uploading "Proof of Residential Address", the AI extracted the address successfully, but the "Fill from uploaded document" top button does NOT appear** even though the `address` form field is still empty (it's flagged red, "This field is required"). Passport extraction works fine in the same form — only the address one is broken. Diagnose and fix.
2. **There's no way to use an extracted value if the target form field is already filled.** Today the top button only fills empty fields — power users who want to override need an in-place affordance. Add a small ✨ icon next to each field with an available extract, with tooltip + one-click replace.

---

## Item 1 — Diagnose + fix "Fill from uploaded document" not showing for proof of residential address

### Triage the cause empirically

Open a Supabase SQL console (or a quick admin-only endpoint you add temporarily — delete before commit) and run these checks. **Do not guess — report each finding in CHANGES.md.**

**Check A — Live DB document-type config:**
```sql
select name, ai_extraction_enabled, ai_extraction_fields
from document_types
where name = 'Proof of Residential Address';
```
- `ai_extraction_enabled` must be `true`.
- `ai_extraction_fields` must contain an entry with `key = 'address_on_document'` and `prefill_field = 'address'`.

If `prefill_field` is missing or wrong, that's the bug. The defaults in `src/app/api/admin/migrations/seed-ai-defaults/route.ts` lines 31–42 have it correct — but an admin may have saved an override via `/admin/settings/rules` that cleared the field. Fix: either re-seed this one doc type via a small admin migration endpoint (pattern: see `src/app/api/admin/migrations/*`) or update the one row directly. Log the exact remedy in CHANGES.md.

**Check B — A real uploaded doc's extraction output:**
```sql
select d.id, d.verification_status, d.verification_result
from documents d
join document_types dt on dt.id = d.document_type_id
where dt.name = 'Proof of Residential Address'
order by d.uploaded_at desc limit 3;
```
- `verification_status` should be `passed` or `manual_review` (not `pending` / `failed`).
- `verification_result.extracted_fields.address_on_document` must be a non-empty string.

If the extracted_fields shape is different (e.g. nested differently, or using a different key like `address` rather than `address_on_document`), then `computePrefillableFields` won't find it. Either adjust the doc-type config to match what the AI is returning, or adjust the AI prompt in `src/lib/ai/verifyDocument.ts` to return the declared key.

**Check C — Wiring in the client:**
Add a temporary `console.debug` in `IndividualKycForm.tsx` right after line 213 (where `prefillable` is computed):
```ts
console.debug("[B-044 diag]", {
  formAddress: fields.address,
  docs: prefillSourceDocs.map(d => ({
    id: d.id,
    doc_type: d.document_type_id,
    extracted: d.verification_result?.extracted_fields,
  })),
  docTypes: prefillSourceDocTypes.map(t => ({
    id: t.id,
    name: t.name,
    extract_fields: t.ai_extraction_fields,
  })),
  prefillable,
});
```
Reload the Identity step with a proof-of-address doc uploaded. Inspect what's in each array. **Remove the debug log before commit.**

Once you know the actual cause, fix it and write up exactly what was broken in CHANGES.md.

### Likely outcomes (for orientation only — verify empirically)

| Finding | Fix |
|---|---|
| DB row has no `prefill_field: "address"` | Add a one-shot admin endpoint `POST /api/admin/migrations/reseed-proof-of-address-extraction` that updates that single doc type's `ai_extraction_fields` to match the seed. User runs it once. |
| AI returns a different key than `address_on_document` | Either update the doc-type config's `ai_extraction_fields[0].key` to match what the AI returns, or tighten the prompt in `verifyDocument.ts` to return the declared key. |
| `personDocs` filter drops the proof-of-address doc | Check `ServiceWizardPeopleStep.tsx` line 1582 — `documents.filter((d) => d.client_profile_id === profileId)`. If proof-of-address has a different `client_profile_id` (e.g. per-application vs per-profile), broaden the filter or store it differently. |
| Doc is there, extraction is there, wiring is right, but the helper's `seenTargets` logic is skipping address because passport also extracts `address` | Check `ordered` sort — oldest-first means a passport uploaded first with an empty `address` extract would NOT claim the target (empty values are filtered out). But if a passport extracts an address value, it would claim the slot. Unlikely for passport but check. |

---

## Item 2 — Per-field ✨ prefill icon with tooltip

### Design

Small ✨ Sparkles icon button rendered next to the label of each KYC form field that has an available extracted value. Works whether the form field is empty or already filled.

- **Visibility per field:** show the icon on a field iff some uploaded doc extracted a non-empty value whose `prefill_field` equals that field's key. Ignore whether the form field is currently empty or not.
- **Hover tooltip:** two-line content:
  - Line 1: `Extracted: "<value>"` (truncate long values to ~60 chars)
  - Line 2: `From: <doc type name> — click to use`
- **Click:** replace the form field's value with the extracted value. Same save path as the top button (POST `/api/profiles/kyc/save` with just that one field, then update local state). Toast on success (`Filled <field label> from <doc type>.`) and on error (`Couldn't fill from document — please try again.`). Spinner on the icon while the request is in flight.
- **Accessibility:** icon button must have `aria-label` like `Fill <field label> from uploaded document` and be keyboard-focusable.

### Helper changes

`src/lib/kyc/computePrefillable.ts`: add a sibling helper (or extend the existing one with an optional arg) that does **not** filter on whether the form field is empty. Signature:

```ts
/** Returns all extracted values available for prefill, regardless of whether the form field is already filled. */
export function computeAvailableExtracts(args: {
  docs: DocLike[];
  docTypes: DocTypeLike[];
}): PrefillableField[]
```

Same stable-sort + seenTargets logic. No `form` argument because we don't filter on form state.

Keep `computePrefillableFields` unchanged — the top button and step-nav indicator still use it as-is.

### Rendering

`src/components/kyc/IndividualKycForm.tsx` — render the icon inside `FieldRow`. Cleanest pattern:

1. Compute `availableByTarget: Map<string, PrefillableField>` once at the top of the component from `computeAvailableExtracts`.
2. Pass a new optional prop `prefillFrom?: PrefillableField` into `FieldRow` for each field that has one.
3. `FieldRow` renders the ✨ icon inline with the label, wrapped in a shadcn `Tooltip` (`@/components/ui/tooltip` — check whether it exists; if not, use the base-ui Tooltip from shadcn v2 and add it to `src/components/ui/`).
4. On click, call a new `onPrefillField(target, value)` handler on the parent.
5. Handler posts to `/api/profiles/kyc/save` with `{ kycRecordId, fields: { [target]: value } }` and updates local state on success. Reuse the existing per-field flow pattern — don't duplicate the whole `handlePrefillClick` function.

### Fields that should get the icon

The existing `KYC_PREFILLABLE_FIELDS` whitelist (`src/lib/constants/prefillFields.ts`) already lists the valid targets. Use it as the source of truth. Every `FieldRow` whose target key is in `availableByTarget` gets the icon.

### Coexistence with the top button

Both surfaces can coexist. The top button does bulk-fill-empties in one shot (unchanged). The per-field icon is the power-user affordance — granular, overrides. If after clicking the top button there are no extracts left that differ from the form, per-field icons for those targets should stay visible (user may have had a value, overwrote it manually, wants to restore).

### Visual spec

- Icon: Lucide `Sparkles`, size `h-3 w-3`, color `text-brand-blue`, positioned inline with the field label (e.g. `<Label>Residential address <button…>✨</button></Label>`).
- Button element: `<button type="button">` with `inline-flex align-middle ml-1` — NOT inside a `<Label for=…>` click area (else clicking the icon toggles the input focus).
- On hover: cursor pointer, subtle opacity bump.
- On loading: replace icon with a 3x3 spinner (`Loader2 animate-spin`).

---

## Done criteria

- [ ] `npm run build` passes (lint + type check).
- [ ] Writeup in CHANGES.md explains the **actual** cause of the proof-of-address prefill button being missing, and the fix.
- [ ] Manual test: upload a proof of residential address with extractable address → after AI completes, the top button "Fill from uploaded document" appears AND a ✨ icon appears next to the Residential address label.
- [ ] Manual test: click the ✨ icon on Residential address when the field has a value → field is replaced with the extracted value, toast confirms, no overwrite of other fields.
- [ ] Manual test: hover the ✨ icon → tooltip shows the extracted value + source doc.
- [ ] `CHANGES.md` updated with a `## B-044 — Per-field prefill icon + proof-of-address fix (done YYYY-MM-DD)` entry.
- [ ] Committed and pushed to `origin main` per Git Workflow Rule in CLAUDE.md.

## Notes for the implementer

- Single-batch brief. Both items ship together.
- Commit message: clean and descriptive (e.g. `feat: per-field prefill icon; fix proof-of-address prefill not appearing`). No batch ID prefix.
- Dev-server restart hint for the handoff one-liner:
  ```
  pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
  ```
- If the diagnosis in Item 1 reveals a deeper AI-prompt issue (e.g. the model returns address under a different key), fix it but keep scope tight — don't rework the whole verification flow. Flag any deferred cleanup in CHANGES.md as tech debt.
- If you need to add a shadcn `Tooltip` primitive (not already in `src/components/ui/`), use the base-ui pattern (no `asChild` prop — use `render` instead) per CLAUDE.md gotcha.
