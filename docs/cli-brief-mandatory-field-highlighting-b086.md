# CLI Brief — B-086 Mandatory-Field Completion + Red-Label Persistence

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No (pure UI / util fix)
**Builds on:** B-084 (auto-completion %), B-067 (proposed_names rendering)

---

## Why this batch exists

Two tightly coupled bugs, same root cause:

**Bug A — section completion % stays at 100% even when required fields are empty.**
On `/admin/services/[id]` (and the matching client-portal pages), clearing all three "Proposed Names" still shows Company Setup at `100% · Complete`. Same happens if Proposed Name 1 (the only required slot) is cleared but Name 2 or Name 3 still has a value. Reason: `calcSectionCompletion` treats *any* array with `length > 0` as "filled", and the form pads `proposed_names` to length 3 on every keystroke, so the array is `["", "", ""]` even when fully blank — still counted as filled.

**Bug B — empty mandatory fields don't show red labels after a save reloads.**
The expected behaviour: when a section has been saved with at least some data, every empty required field in that section shows its label in red so the admin can see what's still missing at a glance. Today:
- The shared `DynamicServiceForm` already has this heuristic (`anyFilled` → empty-required goes red) but it misfires on `proposed_names` because of the same broken array-emptiness check, and the per-slot labels for Proposed Name 1/2/3 have no red-when-empty styling at all.
- The KYC `OrgField` (Company Details step) has **no** red-when-empty logic — only a red asterisk. So fields like Registration number and Listed/Unlisted stay default-coloured even after the section is saved with other fields filled.

Both bugs are stateless and re-derive from saved values on every render, so the fix is purely client-side. No migrations, no API changes.

After this brief:
- Section % drops below 100 the moment any required field becomes empty (including all three Proposed Names cleared).
- On every page load, if a section has been saved with any data, empty required fields render their **label text in red** (the asterisk is already red today).
- This applies consistently to Company Setup / Financial / Banking sections on the admin service detail page, the matching client pages, AND the KYC Company Details / Tax & Financial steps for organisations.

---

## Hard rules

1. **One batch only.** Commit + push + update CHANGES.md when done.
2. **Out of scope, leave alone:**
   - The KYC document layout / per-section doc allow-list (B-084 Batch 3, B-085).
   - Top-level pill widths / colour bands (B-080, B-082, B-083).
   - The header text "Mauritius Offshore Client Portal" rename (separate item, low priority).
   - Any backend / API changes — this is pure UI.
3. `npm run build` must pass clean (lint + type check).
4. **Do not change the trigger semantics for `anyFilled`.** Keep it stateless: "any visible field in this section has a non-empty value → flip empty requireds to red." Saved data already hydrates the form, so on reload the heuristic correctly identifies sections that have been touched.
5. **No new state libraries.** No new context providers. The fix is local to `serviceCompletion.ts`, `DynamicServiceForm.tsx`, `PerPersonReviewWizard.tsx`, and `KycStepWizard.tsx`.
6. **Don't refactor `OrgField` into a shared component in this brief** — fix both copies in place (`PerPersonReviewWizard.tsx` and `KycStepWizard.tsx`). A future brief can consolidate. Mention the duplication in CHANGES.md as follow-up flag.

---

## Step 1 — Fix array-emptiness in `serviceCompletion.ts`

File: [`src/lib/utils/serviceCompletion.ts`](src/lib/utils/serviceCompletion.ts)

There are three spots that share the same broken check `Array.isArray(v) ? v.length > 0 : v != null && v !== ""`:

- `calcServiceDetailsCompletion` — both `anyFilled` (line ~22) and the `filled` filter (line ~30)
- `calcSectionCompletion` — both `anyFilled` (line ~115) and the `filled` filter (line ~121)

Replace **every** array branch with:

```ts
Array.isArray(v) ? v.some((x) => x != null && x !== "") : (v != null && v !== "")
```

Rationale: a padded array of empty strings (`["", "", ""]`) is semantically empty and must not count as filled. This single change resolves Bug A on every call site (admin services list, admin service detail, admin queue page, client dashboard, client service detail, and the `/api/services/[id]/validate` endpoint — they all import `calcSectionCompletion`).

Verify by grepping for the old check — there should be exactly **two** call sites left in `serviceCompletion.ts` after the change (the `Array.isArray(v) ? v.some(...)` form), and zero `v.length > 0` strings remaining in this file.

## Step 2 — Fix array-emptiness in `DynamicServiceForm.tsx`

File: [`src/components/shared/DynamicServiceForm.tsx`](src/components/shared/DynamicServiceForm.tsx)

Two spots use the same broken check (lines ~69 and ~77):

- `anyFilled` heuristic at the top of the component
- `isEmptyRequired(field)` helper

Replace both array branches with the `v.some((x) => x != null && x !== "")` form, matching Step 1.

After this step:
- Clearing all three Proposed Names drops Company Setup below 100%.
- The whole-field "is `proposed_names` empty?" check returns `true` when the array is `["", "", ""]`, so `isEmptyRequired(proposed_names)` now returns `true` and the field-level label (if there were one rendered for the whole field — there isn't for `proposed_names` because the per-slot labels are inside the text_array branch) would go red.

## Step 3 — Per-slot red label for Proposed Name 1

File: [`src/components/shared/DynamicServiceForm.tsx`](src/components/shared/DynamicServiceForm.tsx) — the `text_array` branch (lines ~240–298)

The per-slot label is rendered at lines ~273–280 inside the `isProposedNames` branch:

```tsx
{isProposedNames && (
  <Label className="text-sm flex items-center gap-1">
    {itemLabel(i)}
    {required && <span className="text-red-600">*</span>}
    {tooltip && <FieldTooltip content={tooltip} />}
  </Label>
)}
```

Update to render the label text in red when:
- This slot is `required` (today only index 0 — but compute it generically), AND
- This slot's current value is empty, AND
- `anyFilled` is true (matching the behaviour of every other field).

```tsx
{isProposedNames && (() => {
  const slotEmpty = v == null || v === "";
  const slotMissing = required && slotEmpty && anyFilled;
  return (
    <Label className={`text-sm flex items-center gap-1 ${slotMissing ? "text-red-600" : ""}`}>
      {itemLabel(i)}
      {required && <span className="text-red-600">*</span>}
      {tooltip && <FieldTooltip content={tooltip} />}
    </Label>
  );
})()}
```

Note that `v` here refers to the per-slot value inside the `padded.map` callback (already in scope as the `v` parameter to the map). Make sure the variable doesn't shadow `values` — rename to `slotVal` if needed for clarity.

**Do not change** the non-`isProposedNames` text_array branch (Option 1/2/...) — Vanessa hasn't asked for it and the only required-slot field we have today is `proposed_names`.

## Step 4 — Red labels in KYC `OrgField`

There are **two copies** of `OrgField` that must both be updated:

- [`src/components/client/PerPersonReviewWizard.tsx`](src/components/client/PerPersonReviewWizard.tsx) — lines ~330–371
- [`src/components/kyc/KycStepWizard.tsx`](src/components/kyc/KycStepWizard.tsx) — analogous `OrgField` definition

For each `OrgField` component, accept a new optional prop `sectionHasData: boolean` (or `anyFilled: boolean` to mirror the DynamicServiceForm naming — pick one and use it consistently in both files). When `sectionHasData && required && (value is empty)`, the label text goes red.

```tsx
function OrgField({
  label,
  fieldKey,
  form,
  onChange,
  type = "text",
  placeholder,
  required,
  sectionHasData,
}: {
  // ...existing props
  sectionHasData?: boolean;
}) {
  const v = form[fieldKey];
  const empty = v == null || v === "";
  const missing = required && empty && sectionHasData;
  return (
    <div className="space-y-1">
      <Label className={`text-sm font-medium ${missing ? "text-red-600" : "text-gray-900"}`}>
        {label}{required && <span className="text-red-600 ml-0.5" aria-hidden="true">*</span>}
      </Label>
      {/* unchanged input rendering */}
    </div>
  );
}
```

Then in each `*Step` component (`CompanyDetailsStep`, `TaxFinancialStep`, etc.), compute `sectionHasData` once at the top and pass it to every `OrgField`:

```tsx
function CompanyDetailsStep({ form, onChange }: { ... }) {
  const visibleKeys: (keyof KycRecord)[] = [
    "full_name", "company_registration_number", "jurisdiction_incorporated",
    "date_of_incorporation", "industry_sector", "listed_or_unlisted",
    "description_activity", // ...any others actually rendered in this step
  ];
  const sectionHasData = visibleKeys.some((k) => {
    const v = form[k];
    return Array.isArray(v) ? v.some((x) => x != null && x !== "") : v != null && v !== "";
  });
  return (
    <div className="space-y-5">
      {/* ... */}
      <OrgField label="Company name" fieldKey="full_name" form={form} onChange={onChange} required sectionHasData={sectionHasData} placeholder="Legal entity name" />
      {/* repeat for every OrgField in this step, passing sectionHasData */}
    </div>
  );
}
```

Apply to every step that uses `OrgField`. The list of visible keys must match what's actually rendered in that step (compute it from the JSX, not from the full `KycRecord` shape — Tax & Financial should not look at Company-Details keys and vice versa).

Both `PerPersonReviewWizard.tsx` and `KycStepWizard.tsx` need this treatment. They have near-duplicate `*Step` components — update each independently.

## Step 5 — Smoke test (manual, document result in CHANGES.md)

Use a service with mixed data. Vanessa's current test service (Elarix LLC) has Brief description = "Sell software" and Proposed Name 3 = "Shield3" — useful baseline.

**Service detail page (`/admin/services/[id]`):**

1. Open the page. Company Setup section pill shows correct % (not 100% if Proposed Name 1 is empty). Brief description filled → Company Setup is partial, Proposed Name 1 label is **red text** (not just red asterisk).
2. Clear Proposed Name 3, save. Section % drops further. Proposed Name 3 label stays default colour (not required), Proposed Name 1 still red.
3. Clear ALL three Proposed Names, save. If Brief description still has data → section is still partial (Name 1 red, others default). If Brief description is also cleared → section drops to 0% / "Not started" and `anyFilled` is now false → labels return to default colour (the heuristic gates on "section has been touched").
4. Type a name into Proposed Name 1 → label flips to default colour live (before save). Save → state persists across reload.

**KYC Company Details (open any organisation profile's KYC):**

5. Form has Company name + Date of incorporation + Business description saved, Registration number + Jurisdiction + Listed/Unlisted empty. On load, Registration number, Jurisdiction, Listed/Unlisted labels are **red text** (since `sectionHasData = true`).
6. Empty form on a brand-new KYC profile (no saved values): all labels default colour, only asterisks red. No red label noise on a fresh form.
7. Fill in Registration number, save, reload. Registration number label flips back to default; remaining empty requireds stay red.

**Client portal sanity check:**

8. Open the same service in the client portal (`/services/[id]` or the wizard). Section % matches the admin view (no longer stuck at 100% for empty Proposed Names).
9. Open the client KYC wizard for the same organisation (`/kyc/...`). Empty required fields in Company Details show red labels after the section has been saved.

**Build:**

10. `npm run build` is clean — no TS errors, no lint warnings introduced.

---

## CHANGES.md format

Append at top of CHANGES.md after the existing B-085 entry:

```md
### YYYY-MM-DD — B-086 — Mandatory-field completion + red-label persistence (Claude Code)

Fixed two related bugs with one underlying root cause (broken array-emptiness check `v.length > 0` treating `["", "", ""]` as filled).

- `calcSectionCompletion` / `calcServiceDetailsCompletion` ([src/lib/utils/serviceCompletion.ts](src/lib/utils/serviceCompletion.ts)): array branch now uses `v.some(x => x != null && x !== "")`. Section % drops correctly when all three Proposed Names are cleared, or when Proposed Name 1 (the only required slot) is cleared with Names 2/3 still set.
- `DynamicServiceForm` `anyFilled` + `isEmptyRequired`: same array-emptiness fix.
- `DynamicServiceForm` text_array (proposed_names branch): per-slot label for Proposed Name 1 now renders in red when the required slot is empty AND `anyFilled` is true (mirroring the rest of the form).
- KYC `OrgField` (both copies — `PerPersonReviewWizard.tsx` and `KycStepWizard.tsx`): added `sectionHasData` prop; label text goes red when `required && empty && sectionHasData`. Each `*Step` component computes `sectionHasData` from its own rendered field set.

**Follow-up flag:** `OrgField` is near-duplicated across `PerPersonReviewWizard.tsx` and `KycStepWizard.tsx`. Consolidation candidate for a future brief.

Smoke test: <pass/fail + brief notes from Step 5>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT change the trigger semantics — keep `anyFilled` / `sectionHasData` stateless (recomputed each render). Don't add a "has been saved" flag, persisted touched state, or anything that lives outside the form values.
- Do NOT add red-when-empty to the non-`isProposedNames` text_array branch (Option 1 / Option 2 / ...). Out of scope.
- Do NOT change the percentage display strings ("Complete" / "Partial" / "Not started") — that wording is correct as-is.
- Do NOT change the KYC validation logic in `/api/services/[id]/validate` or `/api/kyc/submit` — completion % may change but the validate rules don't.
- Do NOT consolidate the duplicated `OrgField`. Flag in CHANGES.md instead.
- Do NOT touch any migration / seed data.
- Do NOT restart the dev server yourself — let Vanessa restart after CLI finishes.
