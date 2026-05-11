# CLI Brief — B-087 Admin KYC: Red Labels + Required-Only Subsection %

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-086 (mandatory-field completion + red-label persistence)

---

## Why this batch exists

Two related issues left over from B-086.

**Bug A — KYC long-form labels don't go red when empty.**
B-086 fixed `OrgField` in `PerPersonReviewWizard.tsx` and `KycStepWizard.tsx`, but the admin renders KYC subsections (Identity / Financial Profile / Declarations for individuals, Company Details / Tax & Financial for organisations) through a *separate* component — `KycLongFormField` in [`ServiceDetailClient.tsx:1033`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx:1033). That renderer never received the B-086 treatment, so empty required fields stay default-coloured even when the subsection has been saved with other data. Vanessa's QA screenshot: Financial Profile with Occupation + Industry + Additional context filled, but Current employer and Source of funds (both required + empty) are not red.

**Bug B — KYC subsection % counts optional fields.**
The per-subsection bar (e.g. "Financial Profile · 38%") comes from [`sectionPct` at ServiceDetailClient.tsx:632](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx:632). It currently computes `filled_visible / total_visible` over *every* visible field — required + optional. So filling "Additional context: Salary" pads the percentage even though no extra mandatory work was done.

Vanessa wants this aligned with the service-section convention (`calcSectionCompletion` in [`src/lib/utils/serviceCompletion.ts`](src/lib/utils/serviceCompletion.ts)), which counts required-only.

**Confirmed scope (after open-question check):**
- Aggregate `calcKycPct` (person-card header) — **leave as-is**, keep its hardcoded 10-field list.
- Subsections with zero required visible fields → render **0%** (not 100%, not "Complete"). Mirrors service sections.
- Same logic must serve **both admin and client**. Even though the client doesn't render per-subsection % today, the calculation must live in one shared utility so any future client surface aligns automatically.

---

## Hard rules

1. **One batch only.** Commit + push (`git push origin HEAD:main` — this worktree is on a feature branch but CLI pulls main) + update CHANGES.md when done.
2. **Out of scope:**
   - Aggregate `calcKycPct` (person-card header / aggregate). Do not touch — Vanessa explicitly excluded.
   - Service-section logic (Company Setup / Financial / Banking pills) — already correct after B-086.
   - The client KYC wizard's `ValidatedLabel` / `useFieldValidation` system — that already shows errors immediately (red on first paint). Don't refactor it.
   - Header rename ("Mauritius Offshore Client Portal" — separate item).
   - `IndividualKycForm.tsx` / `OrganisationKycForm.tsx` (legacy long-form view in client area) — only touch if Step 3's grep proves they render the same subsection % and could drift. Otherwise skip and flag in CHANGES.md.
3. `npm run build` must pass clean.
4. **Do not break the field-level review badges** that already render alongside each KYC field (`FieldProvenanceMarker`, AI sparkle icon, etc.). The label change is additive — only the className on the `<label>` element shifts based on the red condition.
5. **Don't change the trigger semantics.** "Section has data" is stateless — recomputed from current values each render. Saved data hydrates state, so on reload an in-progress section still flips empty requireds red.
6. **No new state libraries / context providers.** Compute `sectionHasData` inside `KycLongFormSection` and pass it down as a prop, exactly mirroring the B-086 pattern.

---

## Step 1 — Add a shared `calcKycSectionRequiredPct` utility

File: [`src/lib/utils/serviceCompletion.ts`](src/lib/utils/serviceCompletion.ts) (extend, do not replace existing exports).

Add (alongside the existing `calcKycCompletion`):

```ts
import type { KycField, KycSection } from "@/lib/kyc/sections";
import { visibleFields } from "@/lib/kyc/sections";

/**
 * Required-only completion % for a single KYC subsection (Identity, Financial
 * Profile, Declarations, Company Details, Tax & Financial). Mirrors the
 * service-section convention (`calcSectionCompletion`):
 *   - Counts only fields marked `required: true` and currently visible after
 *     `showWhen` gating (e.g. "Please specify" only when Source of funds = Other).
 *   - Returns 0 when the subsection has zero required visible fields, to match
 *     "nothing is mandatory yet" rather than "everything is done".
 *   - Required field with array value uses `v.some(x => x != null && x !== "")`,
 *     matching B-086's array-emptiness convention.
 *
 * DD-level gating (`cddOrAbove` / `eddOnly`) is the caller's job — pass a
 * section already filtered via `gateSectionForLevel`.
 */
export function calcKycSectionRequiredPct(
  section: KycSection,
  values: Record<string, unknown>,
): SectionCompletion {
  const visible = visibleFields(section.fields, values);
  const required = visible.filter((f) => f.required);
  if (required.length === 0) return { percentage: 0, ragStatus: "red" };
  const filled = required.filter((f) => {
    const v = values[f.key];
    if (Array.isArray(v)) return v.some((x) => x != null && x !== "");
    return v != null && v !== "";
  }).length;
  const pct = Math.round((filled / required.length) * 100);
  return { percentage: pct, ragStatus: toRag(pct) };
}
```

(`toRag` already exists in this file as a private helper.)

Export it from the same module — admin and any future client caller import from one place.

## Step 2 — Wire admin's `sectionPct` to the new util

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx)

Replace the inline `sectionPct` at line ~632 (inside `KycLongForm`) with a call to `calcKycSectionRequiredPct`:

```ts
function sectionPct(section: KycSection): number {
  return calcKycSectionRequiredPct(section, fields).percentage;
}
```

Add the import at the top of the file (the existing import of `calcSectionCompletion` from `@/lib/utils/serviceCompletion` is the right home — add the new name to that import list).

After this step Financial Profile in Vanessa's screenshot should drop from 38% to ~25% (2 of 4 required filled — Occupation + Industry — vs Current employer + Source of funds still empty). The "Salary" in Additional context no longer contributes.

**Do not** change the `KycLongFormSection`'s display logic, RAG colour mapping, or the way `pct` is passed in — only the source of the number changes. The `0% = "Not started"` label / red dot rendering already exists and will pick up the new value cleanly.

## Step 3 — Red labels in `KycLongFormField`

File: same as Step 2.

The `KycLongFormSection` (line ~706) already computes `pct` for its section. Add a sibling derived value `sectionHasData` and pass it to every `KycLongFormField` child:

```ts
const sectionHasData = visibleFields(section.fields, fields).some((f) => {
  const v = fields[f.key];
  if (Array.isArray(v)) return v.some((x) => x != null && x !== "");
  return v != null && v !== "";
});
```

(Reuse the import of `visibleFields` from Step 1.)

Then update `KycLongFormField` (line ~1033):

1. Add an optional prop `sectionHasData?: boolean`.
2. Compute `const empty = value == null || value === "" || (Array.isArray(value) && !value.some(x => x != null && x !== ""))`.
3. Compute `const missing = !!field.required && empty && !!sectionHasData`.
4. In the label render at line ~1059, apply red text conditionally:

```tsx
<label className={`flex items-center gap-1.5 text-sm font-medium ${missing ? "text-red-600" : "text-gray-900"}`}>
  <span>{field.label}</span>
  {field.required && <span className="text-red-600" aria-hidden="true">*</span>}
  {field.aiExtractable && <Sparkles className="h-3 w-3 text-blue-500" aria-label="AI-extractable" />}
  <FieldProvenanceMarker extractions={extractions} sourceDocs={sourceDocs} fieldLabel={field.label} />
</label>
```

Pass `sectionHasData` from `KycLongFormSection`'s render of `KycLongFormField` (the JSX block around line ~899).

**Apply identically to all four KYC subsections** rendered by `KycLongForm`: Your Identity, Financial Profile, Declarations (individuals); Company Details, Tax & Financial (organisations). Since they all flow through the same `KycLongFormSection` → `KycLongFormField` pipeline, one change covers them all.

## Step 4 — Audit client legacy long-forms (light touch)

File: [`src/components/kyc/IndividualKycForm.tsx`](src/components/kyc/IndividualKycForm.tsx), [`src/components/kyc/OrganisationKycForm.tsx`](src/components/kyc/OrganisationKycForm.tsx)

Grep these two files for any per-section % computation (`filled / total`, `sectionPct`, etc.). If none exists (likely — they render `ValidatedLabel` with `useFieldValidation` and don't display per-section %), **skip and document in CHANGES.md** that legacy client long-forms have no per-subsection % and don't need wiring.

If one of them *does* compute its own subsection %, replace that inline calc with a call to `calcKycSectionRequiredPct` so admin + client stay in sync.

Either way: do not change the `ValidatedLabel` / `useFieldValidation` red-on-touch behaviour in the client wizard. Those forms already show errors immediately on the client.

## Step 5 — Smoke test (manual; document result in CHANGES.md)

Use Vanessa's current test service (Elarix LLC) or any individual KYC with mixed data.

1. **Financial Profile labels (admin):** open an individual's KYC long-form on `/admin/services/[id]` with Occupation + Industry + Additional context filled, Current employer + Source of funds empty. Current employer and Source of funds labels render **red text** (not just red asterisk). Occupation and Industry labels render default colour.
2. **% number drops:** the Financial Profile subsection bar reads **25% · Partial** (or whatever `filled_required / total_required` evaluates to in this test data), not 38%. "Additional context" filled does not contribute.
3. **Fresh subsection (no data anywhere):** open a brand-new profile's KYC. Every subsection reads `0%`. No labels are red (because `sectionHasData = false`). Asterisks remain red.
4. **Edge — zero required visible:** if any subsection has zero required visible fields after `showWhen` gating (e.g. an EDD-only subsection at SDD level), the bar reads `0%` not `100%`.
5. **Identity + Declarations subsections:** check that empty required fields go red after the user has saved at least one field in the same subsection. Aggregate person-card KYC% is unchanged (still uses the hardcoded 10-field list).
6. **Organisations:** open an organisation profile and verify Company Details + Tax & Financial subsections behave the same way (red empty requireds when subsection has data; required-only %).
7. **Service sections unchanged:** Company Setup / Financial / Banking pills on the same service detail page still behave as B-086 left them — including the cleared-Proposed-Names scenario.
8. **Client portal sanity:** open the same KYC profile in the client KYC wizard (`/kyc`). Behaviour is unchanged — `ValidatedLabel` / `useFieldValidation` still drives red-on-error there (the client never imported `calcKycSectionRequiredPct` in this brief unless Step 4 found a real call site).
9. **`npm run build` clean.**

---

## CHANGES.md format

Append at top of CHANGES.md after the existing B-086 entry:

```md
### YYYY-MM-DD — B-087 — Admin KYC red labels + required-only subsection % (Claude Code)

Two follow-ups from B-086, applied to the admin's KYC long-form path (`KycLongFormField` in `ServiceDetailClient.tsx`).

- New shared util `calcKycSectionRequiredPct` in [src/lib/utils/serviceCompletion.ts](src/lib/utils/serviceCompletion.ts): required-only, visible-after-showWhen, 0% when no required field exists, array-aware via `v.some(x => x != null && x !== "")`. Mirrors service-section convention.
- Admin `KycLongForm.sectionPct` ([ServiceDetailClient.tsx](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx)): swapped from inline all-visible-fields calc to the new util. Financial Profile in Vanessa's QA case drops from 38% → 25%, reflecting only mandatory work.
- Admin `KycLongFormField`: added `sectionHasData` prop. Label renders red when `required && empty && sectionHasData`. Each `KycLongFormSection` computes `sectionHasData` from its visible fields and passes it through.
- Client legacy long-forms (`IndividualKycForm.tsx`, `OrganisationKycForm.tsx`): audited; <no per-section % to change / consolidated to shared util>. Client wizard's `ValidatedLabel` / `useFieldValidation` flow left alone — already shows errors immediately.

Aggregate `calcKycPct` (person-card header) intentionally untouched per Vanessa's call.

Smoke test: <pass/fail notes from Step 5>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT touch `calcKycPct` / `calcKycCompletion` aggregate logic. Out of scope.
- Do NOT add red-on-touch UI to the client wizard — it already has it via `useFieldValidation`.
- Do NOT change the colour or display of the subsection RAG dot / progress bar. Only the computed `pct` and the label className shift.
- Do NOT introduce a new state-management lib / context. `sectionHasData` is a derived value passed down as a prop.
- Do NOT silently broaden scope: leave service-section logic (`calcSectionCompletion`) alone — it's the reference for the new convention, not the target of changes.
- Do NOT skip `npm run build` — it's the only verification we have.
- Do NOT restart the dev server yourself; Vanessa restarts after CLI finishes.
