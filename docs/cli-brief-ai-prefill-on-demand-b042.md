# B-042 — On-demand AI prefill in KYC Identity step

**Type:** UX rework (client KYC wizard)
**Design spec:** `docs/superpowers/specs/2026-04-20-ai-prefill-on-demand-design.md` (read this first — full design lives there)
**Scope:** Single batch. Commit + push + update CHANGES.md when done.

## TL;DR for the implementer

Today, when a client uploads a passport in the People step, an `AiPrefillBanner` appears in the documents area forcing an Apply / Skip + conflict-mode decision *at upload time*. We're moving the prefill decision out of the upload moment and into the Identity step where the fields actually live. Read the design spec for the full reasoning — this brief is just the implementation checklist.

## Files involved

**Delete:**
- `src/components/shared/AiPrefillBanner.tsx`
- `src/app/api/documents/[id]/dismiss-prefill/route.ts`

**Modify:**
- `src/components/client/ServiceWizardPeopleStep.tsx` — drop the `<AiPrefillBanner />` block (~lines 553–585) and its import; pass `personDocs` + `personDocTypes` down through `KycStepWizard`
- `src/components/kyc/KycStepWizard.tsx` — accept new props `personDocs` + `personDocTypes`; render a ✨ sparkle on the Identity step indicator when `computePrefillableFields(...)` returns at least one row; pass props through to `IndividualKycForm`
- `src/components/kyc/IndividualKycForm.tsx` — accept new props; render the "✨ Fill from uploaded document" button at the top of the form body when there's something to fill; wire click handler

**Create:**
- `src/lib/kyc/computePrefillable.ts` — pure helper, signature in the spec under "Prefillability rule (single source of truth)"

**Keep untouched:**
- `src/lib/constants/prefillFields.ts` — reused by the helper
- `/api/profiles/kyc/save` — reused by the new button
- `documents.prefill_dismissed_at` DB column — no migration, just stop reading/writing it from the front end

## Implementation order

1. **Helper first.** Create `src/lib/kyc/computePrefillable.ts` per the spec. Pure function, no React, no fetch. Easy to reason about.
2. **Update `IndividualKycForm.tsx`** — add the button + click handler. Use `computePrefillableFields` to decide visibility and to compute the apply payload. POST to `/api/profiles/kyc/save`. Order: API call first → on success update local form state via `onChange` → toast. On error: error toast, no form state change, button stays visible.
3. **Update `KycStepWizard.tsx`** — accept new props, pass through, render the ✨ icon on the Identity step indicator using the same helper.
4. **Update `ServiceWizardPeopleStep.tsx`** — pass `personDocs` and `personDocTypes` for the active person down through `KycStepWizard`. Both already exist in this component (the `localDocs` array and the `dt` definitions used in the upload list). Remove `<AiPrefillBanner />` block and its import.
5. **Delete** `AiPrefillBanner.tsx` and the `dismiss-prefill` route handler. Run a final grep to confirm no lingering imports.

## Behaviour requirements

### Visibility (button + step-nav indicator share one rule)

Both surfaces use `computePrefillableFields(...)` and are shown iff the returned array is non-empty. Definition: at least one prefillable extracted field whose corresponding form field is currently empty (`null` / `undefined` / `""` after trim).

### Click on "Fill from uploaded document"

- Compute the payload via the helper (only fields where the form is empty — never overwrite).
- POST to `/api/profiles/kyc/save` with `{ kycRecordId, fields }`.
- On 2xx: update local form state by calling `onChange` for each filled field; toast `Filled N field${s} from your uploaded document.` (or `All extractable fields are already filled.` if the payload turned out empty).
- On error: toast `Couldn't fill from document — please try again.`; no form state change; button stays visible.
- While in flight: button shows a spinner and is disabled.

### Toasts

Use Sonner (already in the project — `import { toast } from "sonner"`).

### Step-nav indicator

Lucide `Sparkles` icon, `text-blue-500`, small (h-3 / w-3), absolute-positioned at top-right of the Identity step circle. Conditional render — does not occupy layout when absent. `title` attribute: `AI-extracted data is available — fill it in from the Identity step.`

## Out of scope

- `OrganisationKycForm` — leave untouched.
- Preview / pick-which-fields dialog — explicitly rejected in the design (single-action keeps it light).
- Removing the `documents.prefill_dismissed_at` column — leave it; no migration needed.

## Done criteria

- [ ] `npm run build` passes (lint + type check) — required before commit per CLAUDE.md.
- [ ] No remaining import of `AiPrefillBanner` anywhere (`grep -r AiPrefillBanner src/` returns no results).
- [ ] No remaining call to `/api/documents/.../dismiss-prefill` from the front end.
- [ ] Manually walk through the test plan in the spec ("Testing (manual)" section) — at minimum confirm: no banner at upload time, ✨ on Identity step nav, button fills empty fields and leaves filled ones alone, button hides once nothing left to fill, toast appears.
- [ ] `CHANGES.md` updated with a `## B-042 — On-demand AI prefill in KYC Identity step (done YYYY-MM-DD)` entry summarising the change and listing modified/deleted files.
- [ ] Committed and pushed to `origin main` per the Git Workflow Rule in CLAUDE.md.

## Notes for the implementer

- This is a single-batch brief. Do not split into multiple PRs.
- Commit message: clean and descriptive, no batch ID prefix (per CLAUDE.md).
- Restart hint to include in the handoff one-liner: `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev` (since `KycStepWizard.tsx` is changing and the .next cache can corrupt).
- If anything in this brief or the spec is ambiguous, document the question + the choice you made in CHANGES.md and continue — do not stop.
