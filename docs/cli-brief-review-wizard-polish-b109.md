# CLI Brief — B-109 Review Wizard Polish (Mark-as-Reviewed dialog + Step indicator + Per-profile sub-wizard)

**Status:** Hold until B-108 lands
**Estimated batches:** 3
**Touches migrations:** No
**Touches API:** No (reuses existing endpoints)
**Touches AI verification:** No
**Builds on:** B-102 (Review Wizard chrome), B-068/B-098 (section review endpoint), client's `PerPersonReviewWizard` as a structural reference

---

## Hold rule

Do not start B-109 until commit `feat: …service alerts…` (B-108 batch 3) is on `origin/main`. B-108 touches the same step-pill row that B-109 will adjust (step indicator inside the wizard chrome). Run `git pull origin main` and verify the three B-108 feat commits.

---

## Why this batch exists

Three corrections to the Review Wizard at `/admin/services/[id]/review`:

1. **`Mark as Reviewed` button silently writes `status='reviewed'`.** It bypasses the existing `SectionReviewPanel` dialog (the same popup the inline `Review` button opens on the scroll page) — so admin can't choose `flagged` / `rejected`, can't attach a note, and the review action feels different in the wizard vs the rest of the page. Should open the SAME popup; on save, auto-advance to the next step (or next profile, in sub-step mode).
2. **No step indicator at the top of the wizard.** The scroll page has the numbered step-pill strip, but inside the wizard chrome there's no visible breadcrumb of "step 2 of 5: Financial" with active/complete states. The client's `ServiceWizardStepIndicator` shows this pattern; admin wizard should match it.
3. **Step 3 (People & KYC) isn't sub-stepped.** Today the wizard renders the profile list; clicking a profile expands the full KYC content inline. Vanessa wants the same per-profile sub-wizard behaviour as the client portal: clicking a profile opens a sub-wizard with Identity → Address → Financial → Compliance → Documents sub-steps, each with a `Next` button. Return to the list when done.

---

## Hard rules

1. **Three batches, three commits.** After each: stage specific files → commit → `git push origin HEAD:main` → CHANGES.md sub-entry under `## B-109` → next.
2. `npm run build` clean after each batch.
3. **No new endpoints, no migrations.** Pure UI work that reuses what exists.
4. **No `as any`.**
5. **Don't touch the client's `PerPersonReviewWizard.tsx`** — Vanessa explicitly chose to build a fresh admin sub-wizard rather than parameterize the client one, to avoid regression risk on the client surface. Mirror its section ordering, but write new code in `src/components/admin/`.
6. **Don't restart the dev server.**

---

## Batch 1 — `Mark as Reviewed` opens `SectionReviewPanel` dialog

**Goal:** clicking `Mark as Reviewed` in the wizard's bottom nav opens the existing `SectionReviewPanel` (status picker + notes textbox); on save, auto-advance to the next step or next profile.

### Step 1.1 — Wire the dialog into the wizard nav

Edit [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) at the wizard nav (around line 3383, `handleMarkReviewed`).

Replace the direct POST with state that opens the dialog:

```ts
const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

async function openReviewDialog() {
  // Save dirty changes BEFORE opening so the dialog only deals with the
  // review action itself. If save fails, don't open — same UX as the
  // existing Next button.
  const saved = await flushIfDirty();
  if (!saved) {
    toast.error("Couldn't save changes — fix the errors and try again.");
    return;
  }
  setReviewDialogOpen(true);
}

async function handleReviewSaved(review: ApplicationSectionReview) {
  onReviewSaved(review);
  setReviewDialogOpen(false);
  toast.success(`Marked as ${review.status}.`);
  // Auto-advance: next profile if in sub-step mode, else next step.
  if (profileSubstep) {
    profileSubstep.onNextProfile();
  } else {
    await goTo(step + 1);
  }
}
```

Render the existing `SectionReviewPanel` alongside the nav row:

```tsx
<SectionReviewPanel
  applicationId={serviceId}
  sectionKey={sectionKey}
  sectionLabel={REVIEW_STEP_LABELS[step]}
  currentStatus={currentSectionStatus}
  open={reviewDialogOpen}
  onOpenChange={setReviewDialogOpen}
  onSaved={(r) => void handleReviewSaved(r)}
/>
```

`currentSectionStatus` comes from the same `useSectionReview(sectionKey)` hook the rest of the file uses. `REVIEW_STEP_LABELS` is a small lookup mapping step index → display name (`{ 0: "Company Setup", 1: "Financial", … }`); add the const where the existing `REVIEW_STEP_SECTION_KEYS` is defined.

The button now calls `openReviewDialog()` instead of `handleMarkReviewed()`. Delete the old `handleMarkReviewed` function and the `marking` state (no longer needed; the dialog owns submit state).

### Step 1.2 — Sub-step mode (profile substep)

When admin is reviewing a single profile (`profileSubstep` defined), the dialog still uses the same `sectionKey` (e.g. `people_kyc`) — section review status is currently at the step level, not per-profile. That's fine; B-074 already handles per-profile review separately via `application_section_reviews` with profile-scoped subject ids. For this batch:

- If `profileSubstep` is set, the dialog wires `sectionKey` to the same step-level key. The per-profile inline review affordance (existing inside the profile body) keeps working untouched.
- Document this in CHANGES.md so we don't get confused later.

A future brief can wire per-profile section reviews to the wizard's Mark button — defer.

### Step 1.3 — Commit + push + CHANGES.md

```
feat: Mark as Reviewed in Review Wizard opens SectionReviewPanel (status picker + notes); auto-advances on save
```

CHANGES.md under `## B-109` → batch 1.

---

## Batch 2 — Step indicator on top of the wizard

**Goal:** wizard chrome shows a visible step strip at the top so admin always sees "step N of 5: `<name>`" with active / complete states. Match the client's `ServiceWizardStepIndicator` visually.

### Step 2.1 — Build a thin wrapper around `ServiceWizardStepIndicator`

The client's component lives at `src/components/client/ServiceWizardStepIndicator.tsx`. It's small (numbered circles + labels + connector lines). Reuse it directly — if the file is OK to import from outside `(client)/`, just import. If it's tightly tied to client-only logic (check the imports), copy its rendering into a new component at `src/components/admin/AdminReviewWizardStepIndicator.tsx` (keep the visual treatment identical — same colors / sizes).

Steps for the admin wizard (5 total, matches `REVIEW_STEP_SECTION_KEYS`):
1. Company Setup
2. Financial
3. Banking
4. People & KYC
5. Documents

Each numbered circle reflects state:
- **Complete** — section has `status='reviewed'` in `application_section_reviews`
- **Active** — the current `step` in URL state
- **Pending** — neither

Step click should navigate (the wizard already has `goTo(stepIndex)` from B-102). Wire that to the indicator's onClick.

### Step 2.2 — Mount inside the wizard chrome

The wizard's top sticky band (in `ServiceDetailClient.tsx` around line 4093, `reviewMode && (...)`) renders the wizard header. Add the step indicator just below the title row and above the section content. Keep the existing `Exit Review` link top-right.

Layout sketch:

```
┌───────────────────────────────────────────────────────────┐
│ Review Wizard — Global Business Corporation     [Exit]    │
│ ① Company Setup ─ ② Financial ─ ③ Banking ─ ④ People …    │  ← new
└───────────────────────────────────────────────────────────┘
```

Use the same horizontal padding as the rest of the wizard chrome so it sits flush.

### Step 2.3 — Hide the scroll-page step pills when in wizard mode

If the scroll page's existing step-pill strip (B-103/B-107 work) is still rendering inside the wizard view, suppress it via the `reviewMode` flag. The new step indicator replaces it; keeping both would be redundant.

### Step 2.4 — Commit + push + CHANGES.md

```
feat: Review Wizard renders step indicator at top showing active + complete states
```

CHANGES.md under `## B-109` → batch 2.

---

## Batch 3 — Per-profile sub-wizard for step 3

**Goal:** in step 3 (People & KYC), clicking a profile from the list opens a sub-wizard that walks the admin through that profile's KYC sections with a `Next` button between each. Mirrors the client's per-person experience.

### Step 3.1 — New component `AdminPerProfileReviewWizard`

File: `src/components/admin/AdminPerProfileReviewWizard.tsx`.

Section ordering mirrors the client's `PerPersonReviewWizard` (check the client component for the exact order; below is the expected shape — verify and adjust):

**Individual record type:**
1. Identity (name, DOB, nationality, passport, address fields if not split)
2. Address (only if address is a separate sub-step in client today; otherwise rolled into Identity)
3. Financial (occupation, source of funds, employer)
4. Compliance / Declarations (PEP, legal issues, sanctions notes)
5. Documents (per-profile KYC document list with upload + waive buttons)

**Organisation record type:**
1. Identity (legal name, jurisdiction, registration number, dates)
2. Office Address
3. Activity / Financial (description, industry, tax residence)
4. Documents

Map each sub-step to one of the existing `KycLongFormSection`s. The form fields are already wired into `KycLongForm` — the sub-wizard is essentially a "show me one section at a time" view of `KycLongForm` with Next / Mark Profile Reviewed buttons at the bottom.

Props:

```ts
interface Props {
  profile: ClientProfile;
  kyc: KycFull;
  profileDocuments: ServiceDoc[];
  documentTypes: DocumentType[];
  serviceId: string;
  waivers: WaivedDocumentRequirement[];
  onWaiversChange: (next: WaivedDocumentRequirement[]) => void;
  fields: Record<string, unknown>;
  setFields: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  onAfterReapply: (patched: Record<string, unknown>) => void;
  onSave: () => Promise<boolean>; // calls the parent's handleKycBarSave
  onBackToList: () => void;
  onProfileReviewed: () => void;  // advance to next profile or back to list
  // For the sub-step nav strip + URL sync:
  subStepIndex: number;
  onSubStepChange: (next: number) => void;
}
```

URL sync: the parent already handles `?step=3&profile=<id>` (B-102). Extend to `?step=3&profile=<id>&substep=<n>` so refresh preserves the per-profile sub-step. Add `substep` to the existing search-params parsing in `ReviewWizardClient.tsx`.

### Step 3.2 — Render structure

Use `KycLongForm`'s section data (`KYC_SECTIONS_INDIVIDUAL` / `KYC_SECTIONS_ORGANISATION` from `src/lib/kyc/sections.ts`). Gate by `dueDiligenceLevel`. For each sub-step:

- Top: small sub-step indicator showing "Identity · Address · Financial · …" with active state.
- Body: render `KycLongFormSection` for the active sub-step only. Reuse the existing component as-is — pass the same `fields`, `setFields`, `extractionsByField`, etc.
- Bottom: nav row with `Back to list` (left), `Previous` (when sub-step > 0), `Next` (when not last sub-step), `Mark Profile Reviewed` (always, opens the dialog from Batch 1 with `sectionKey = 'people_kyc'` and a profile-scoped subject — defer subject wiring to a follow-up brief, per Batch 1 step 1.2 note).

Auto-save on Next: call `onSave()` (which routes through the existing `handleKycBarSave` that hits `/api/admin/profiles/[id]/kyc-fields`). If save fails, don't advance; show the error toast the existing flow uses.

### Step 3.3 — Wire into the wizard's step 3

In the wizard's step 3 rendering inside `ServiceDetailClient.tsx`:

- When `profileSubstep === null`, show the profile list (existing behaviour, keep as-is).
- When `profileSubstep` points at a profile, mount `AdminPerProfileReviewWizard` instead of the inline expanded card. The expanded card's existing UI doesn't apply in wizard sub-step mode.

The bottom nav strip already supports `profileSubstep` (Previous → Back to list, Next → Next Profile). With the sub-wizard mounted, that strip should suppress its own nav when the sub-wizard owns navigation. Easy gate: when the sub-wizard is active, hide the parent nav strip's Next/Mark buttons; keep only `Exit Review`. Or — even simpler — let the parent nav stay but make `Next` mean "next profile" (current behaviour); the sub-wizard's `Next` means "next sub-step within this profile". Both behaviours visible at once might confuse — pick one. **Lean: sub-wizard owns the inner nav, parent nav reduces to Exit Review only when sub-wizard is active.**

### Step 3.4 — Documents sub-step

The Documents sub-step shows the per-profile KYC documents (the existing `KycDocsByCategory` + `KycDocsSummary` from B-106/B-107 — same component, same waive/un-waive buttons). No new UI to build; just render that block as the sub-step body.

### Step 3.5 — Commit + push + CHANGES.md

```
feat: admin per-profile sub-wizard for People & KYC step (Identity → Address → Financial → Compliance → Documents)
```

CHANGES.md under `## B-109` → batch 3.

---

## Acceptance criteria

- [ ] `npm run build` clean after each batch
- [ ] In the Review Wizard at any step, clicking `Mark as Reviewed` opens the same dialog the inline `Review` button uses (status picker + notes); save advances to next step
- [ ] Status picker supports `reviewed` / `flagged` / `rejected` (existing); choosing flagged or rejected still triggers the auto-advance
- [ ] Wizard chrome shows a step indicator strip near the top with 5 steps; current step is highlighted; completed steps show the complete state; clicking a step navigates
- [ ] On step 3 (People & KYC), clicking a profile opens a sub-wizard that steps through Identity → Address → Financial → Compliance → Documents (individual) or Identity → Office Address → Activity → Documents (org); Next advances within the profile, auto-saving dirty changes
- [ ] After the last sub-step (Documents), the sub-wizard's `Mark Profile Reviewed` writes the review and returns to the profile list (or auto-jumps to the next profile)
- [ ] Refreshing the page at `?step=3&profile=<id>&substep=2` lands the admin back on the same sub-step
- [ ] CHANGES.md has three sub-entries under `## B-109`

---

## Tech debt to log

Append to `docs/tech-debt.md` after batch 3:

- **Wizard `Mark as Reviewed` writes a step-level review (e.g. `people_kyc`), not a per-profile review.** B-074 already supports per-profile section reviews via `application_section_reviews` with profile-scoped subject ids. The current sub-wizard click reuses the parent `sectionKey`. Wire profile-scoped subject id through the sub-wizard's `Mark Profile Reviewed` dialog so the per-profile review trail is accurate. ~half-day follow-up.
- **Address sub-step ordering depends on client's existing structure.** If `PerPersonReviewWizard` ever changes its sub-step order, the admin sub-wizard won't auto-follow. Worth abstracting the section ordering into `src/lib/kyc/sections.ts` so both wizards consume the same source.

---

## After all three batches

Final commit + push → tell Vanessa: "B-109 done — Review Wizard parity with client. Mark dialog wired, top step indicator, per-profile sub-wizard." Stop.
