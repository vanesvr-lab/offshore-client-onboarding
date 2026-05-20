# B-146 — Review Wizard polish: rename, drop Actions, center bottom nav, add "Review Profiles" entry

## Why

Four UX changes Vanessa requested on the Review Wizard flow (per 2026-05-20 conversation):

1. **Rename "Review Wizard" → "Review/Update Wizard"** everywhere it appears in copy. The current name implies read-only review, but the wizard also lets admins edit fields on the way through.
2. **Drop Actions as a wizard step.** Today when a template has `hasActions = true`, the wizard becomes 6 steps (Company Setup → Financial → Banking → People & KYC → Documents → Actions). Vanessa wants the wizard to be 5 steps always: Actions stays accessible on the regular service page but isn't part of the review walk-through.
3. **Add a "Review Profiles" button on the People & KYC step (list view) that explicitly enters the per-profile iteration flow.** Today the wizard's per-profile flow exists (Next becomes "Next Profile" when you're inside a profile substep) but the entry point is implicit — admin has to scroll through the People & KYC list and click into each profile. Add a dedicated button next to Next that opens the first profile and iterates one-by-one.
4. **Center the bottom-nav action group.** The Mark as Reviewed + Next buttons sit flush right because of `justify-between`. Same kind of layout issue B-141 fixed on the non-wizard bar — apply the same centering pattern here so the actions sit closer to where the eye focuses, away from the chat bubble.

## Out of scope (do NOT do in B-146)

- **Top-bar layout** stays as is. Only the bottom-nav action group moves.
- **Actions surface removal** is wizard-only. The Actions step on the regular service detail page stays exactly as it is.
- **Wizard restart-from-Actions or re-add-Actions** — no toggle. The wizard is permanently 5 steps.
- **Per-profile iteration mechanics** (the existing Next Profile / Back to list pattern) are untouched. B-146 only adds a more visible entry point.
- **Top-of-page entry button copy** changes to "Review/Update Wizard" but the icon, color, and click behavior stay.

---

## Batch 1 — Rename: "Review Wizard" → "Review/Update Wizard"

### Files to update

Grep for every visible "Review Wizard" string and update to "Review/Update Wizard":

```bash
grep -rn "Review Wizard" src/ --include="*.tsx" --include="*.ts"
```

Known call sites:

- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` line ~4594 — wizard top-bar copy: `"...Service · Review Wizard"` → `"...Service · Review/Update Wizard"`
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` line ~6193 — the entry button label `"Review Wizard"` → `"Review/Update Wizard"`
- Anywhere else the literal appears in toast / aria-label / heading

**Leave code comments + commit history alone.** Don't try to rename `// B-102 — Review Wizard chrome` style comments; cosmetic, low value.

**Leave the route path alone.** The URL stays `/admin/services/[id]/review` — renaming routes would break bookmarks + audit trails.

### Verification (Batch 1)

```bash
grep -rn "Review Wizard" src/ --include="*.tsx" --include="*.ts" | grep -v "^.*//"
# Expected: zero visible-copy hits; only comments / commit annotations remain
```

Manual: open the service detail page → entry button reads "Review/Update Wizard"; click it → top bar reads "... · Review/Update Wizard".

### Commit message (Batch 1)

```
chore: rename "Review Wizard" → "Review/Update Wizard" (B-146)

The wizard supports edits as it walks through, not just reads —
the name "Review Wizard" understated that. Updated user-visible
copy in the entry button + top-bar subtitle. Route path
(/review), code comments, and audit-log entries unchanged.
```

---

## Batch 2 — Drop Actions from the wizard step list

### Locate the step builders

In `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`, three helpers shape the wizard:

```ts
buildAdminSteps(hasActions)
buildReviewStepSectionKeys(hasActions)
buildReviewStepLabels(hasActions)
```

They each accept `hasActions` and conditionally append an Actions step (step index 5) when true.

### The fix

Change each builder so it **always** returns the 5-step list, regardless of `hasActions`:

```ts
// Pseudocode
function buildAdminSteps(_hasActions: boolean): AdminStep[] {
  return [
    { id: "step-company-setup", label: "Company Setup", sectionKeys: ["company_setup"] },
    { id: "step-financial",     label: "Financial",     sectionKeys: ["financial"] },
    { id: "step-banking",       label: "Banking",       sectionKeys: ["banking"] },
    { id: "step-people-kyc",    label: "People & KYC",  sectionKeys: ["people"] },
    { id: "step-documents",     label: "Documents",     sectionKeys: ["documents"] },
    // Actions step intentionally dropped — wizard is permanently 5 steps.
  ];
}
```

Same shape change to `buildReviewStepSectionKeys` and `buildReviewStepLabels` — drop the Actions entry.

**Keep `hasActions` as a parameter** even though it's now unused inside the wizard builders — the gate is still used by `(!reviewMode || reviewStep === 5)` checks elsewhere in the file (around line 6556). Those keep working because `reviewStep === 5` will never be true after this change (wizard's `reviewSectionKeys.length` is now 5).

Then in `ServiceDetailClient`'s render path: find the block guarded by `hasActions && (!reviewMode || reviewStep === 5)` (around line 6556). Change the gate to `hasActions && !reviewMode` — so Actions still renders on the regular page when `hasActions=true`, but never inside the wizard.

### Step indicator visual

The top-bar step indicator (`AdminReviewWizardStepIndicator`) reads `sectionKeys.length` to decide how many circles to render. Since the builder now returns 5, the indicator naturally shrinks from 6 circles to 5. No separate change needed.

### Step-3 People & KYC stays at index 3

The Next-Profile / Back-to-list logic uses `reviewStep === 3` as the People & KYC marker. That still holds — Actions used to be at index 5, dropping it doesn't reindex the earlier steps. Sanity check the code path; nothing should break.

### Verification (Batch 2)

Manual:
1. Open Review/Update Wizard. The step indicator shows 5 steps (Company Setup → Financial → Banking → People & KYC → Documents). Actions does NOT appear in the wizard.
2. On the regular service detail page (outside the wizard), if the template has actions, the Actions section still renders as before.
3. Hit "Next" from step 5 (Documents) — wizard exits / finishes (router.replace to the regular service page), since Documents is now the last step.

### Commit message (Batch 2)

```
feat: drop Actions step from Review/Update Wizard (B-146)

Wizard is now permanently 5 steps (Company Setup → Financial →
Banking → People & KYC → Documents). The Actions section still
renders on the regular service detail page when the template has
action bindings; it's only excluded from the wizard walk-through.
buildAdminSteps / buildReviewStepSectionKeys / buildReviewStepLabels
no longer branch on hasActions for the wizard list. The
hasActions && !reviewMode gate around the page-level Actions block
preserves outside-the-wizard behaviour.
```

---

## Batch 3 — "Review Profiles" entry button on People & KYC step (list view)

### Where it lives

On the People & KYC wizard step, when the admin is in the LIST view (no profile selected yet, i.e. `reviewMode && reviewStep === 3 && !reviewProfileId`), the bottom nav currently shows:

- Previous button (left)
- Mark as Reviewed + Next buttons (right)

The "Next" button advances to step 4 (Documents) — but that skips per-profile review entirely. Admins have to click into each profile manually to review them.

Vanessa wants a dedicated "Review Profiles" button that explicitly enters the per-profile iteration: clicking it sets `?profile=<first-profile-id>` on the URL, the wizard renders the profile substep, and the existing "Next Profile" / "Back to list" flow takes over.

### The fix

In `ReviewWizardBottomNav` (around line 4625 onwards), detect the People & KYC list view (step 3, no profile substep, AND there are profiles to review). If so, render a third action button between Mark as Reviewed and Next:

```tsx
{step === 3 && !profileSubstep && firstProfileId && (
  <button
    type="button"
    onClick={() => router.replace(
      `/admin/services/${serviceId}/review?step=3&profile=${firstProfileId}`
    )}
    disabled={advancing}
    className="inline-flex items-center gap-1.5 rounded-full border border-brand-navy bg-white px-4 py-1.5 text-sm font-medium text-brand-navy hover:bg-gray-50 disabled:opacity-40"
  >
    <Users className="h-4 w-4" />
    Review Profiles ({totalProfilesInStep})
  </button>
)}
```

**Required new prop**: `firstProfileId: string | null` (the id of the first profile in the People & KYC list, in the same order the existing profile-list renders them). Pass it from `ServiceDetailClient` to `ReviewWizardBottomNav` — the parent already has the profile list assembled (around line 5222 onwards). Pick `profilesForStep[0]?.client_profile_id ?? null`.

### Behavior

- Visible only on step 3 list view (i.e. step === 3 AND !profileSubstep AND firstProfileId !== null).
- Clicking sets `?profile=<id>` on the URL via `router.replace`. The wizard re-renders with `reviewProfileId` set; the existing Next-Profile / Back-to-list logic takes over.
- The label includes the count: "Review Profiles (3)" so admin sees how many they're about to iterate through.

### Verification (Batch 3)

Manual:
1. Open the Review/Update Wizard on a service with 2+ directors. Advance to step 3 (People & KYC).
2. The bottom nav now shows: Previous · Mark as Reviewed · **Review Profiles (N)** · Next
3. Click "Review Profiles (N)" → wizard navigates into the first profile's substep. "Previous" becomes "Back to list", "Next" becomes "Next Profile".
4. Click Next Profile through to the last profile → after the last profile, Next Profile is disabled (already the case via `profileSubstep.profileIndex >= totalProfilesInStep - 1`).
5. Click "Back to list" → returns to the step 3 list view. The Review Profiles button is back.
6. On a service with zero profiles attached, the Review Profiles button does NOT render (firstProfileId is null).

### Commit message (Batch 3)

```
feat: "Review Profiles (N)" entry button on People & KYC wizard step (B-146)

The wizard's per-profile iteration was reachable only by clicking
each profile in the list. Now exposes an explicit "Review Profiles
(N)" button in the bottom nav on step 3's list view that enters
the first profile and lets the existing Next-Profile / Back-to-
list flow take over. Button hides when there are no profiles on
the service. The label includes the count so the admin knows the
scope of what they're about to iterate through.
```

---

## Batch 4 — Center the bottom-nav action group

### The current layout

The bottom-nav uses `justify-between` to push Previous to the left and the action group to the right. The action group (Mark Reviewed + Next + optionally Review Profiles) sits flush right where the chat bubble overlaps.

### The fix

Same pattern as B-141 for the non-wizard save bar: switch to `justify-center` with the action group centered, and let Previous float on the left independently.

```tsx
<div className="sticky bottom-0 z-30 bg-white border-t -mx-8 px-8 py-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
  <div className="relative flex items-center justify-center gap-2">
    {/* Previous floats on the absolute left */}
    <button
      type="button"
      onClick={() => void handlePrevious()}
      disabled={advancing || (!profileSubstep && isFirstStep)}
      className="absolute left-0 inline-flex items-center gap-1.5 rounded-full border border-brand-navy bg-white px-4 py-1.5 text-sm font-medium text-brand-navy hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
    >
      <ChevronLeft className="h-4 w-4" />
      {prevLabel}
    </button>

    {/* Centered action group */}
    <button type="button" onClick={() => void openReviewDialog()} … >{markLabel}</button>
    {step === 3 && !profileSubstep && firstProfileId && (
      <button type="button" onClick={...} … >Review Profiles ({totalProfilesInStep})</button>
    )}
    <button type="button" onClick={() => void handleNext()} … >{nextLabel}</button>
  </div>
</div>
```

The outer container becomes `relative`; Previous is absolutely positioned at the left; the action group sits as a centered flex row in the middle of the bar. Same `lg:mr-20` safety guard from B-141 if needed to clear the chat bubble — apply to the inner action group's wrapper.

### Verification (Batch 4)

Manual:
1. Open the wizard at any step. Bottom nav: Previous button anchored to the bottom-left edge of the bar; Mark Reviewed + (optional Review Profiles) + Next centered roughly in the horizontal middle.
2. The action group does NOT overlap the chat bubble at common viewport widths.
3. On step 3 with profiles, the centered group has three buttons (Mark Reviewed · Review Profiles · Next) — still centered.

### Commit message (Batch 4)

```
fix: center the Review/Update Wizard bottom-nav action group (B-146)

Same fix shape as B-141 applied to the wizard's bottom nav. Previous
absolutely-positions to the left of the bar; Mark Reviewed +
(optional Review Profiles) + Next sit as a centered flex group in
the horizontal middle. Avoids the chat-bubble collision on big
screens and aligns the primary actions with where the eye focuses.
```

---

## Batch 5 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-146 — Review/Update Wizard polish (done YYYY-MM-DD)` with one sub-entry per batch.

### Tech debt log

No new tech debt entries needed.

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure UI changes.
2. **Per-batch commits:** five commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- Route path stays `/review`.
- Actions step still renders OUTSIDE the wizard on regular service pages when `hasActions=true`.
- No changes to top-bar layout or step-indicator visuals beyond the step count shrinking from 6 → 5.
- No changes to the Next-Profile / Back-to-list mechanics — the new Review Profiles button is just an entry point into the existing flow.
