# B-043 — Client wizard polish (6 fixes)

**Type:** UX polish + one security-config fix
**Scope:** Single batch. All six items below ship together. Commit + push + update CHANGES.md when done.

## Items

### 1. CSP blocks Supabase document preview iframes (most important — fixes a "nothing uploaded" bug)

**Symptom:** Uploading a document inside the KYC wizard succeeds and AI verification runs, but the preview area renders blank, giving the impression that nothing was uploaded. Browser console shows:

> Framing 'https://<ref>.supabase.co/' violates the following Content Security Policy directive: "frame-src 'self' blob:".

**Root cause:** `next.config.js` line 24 has `frame-src 'self' blob:`. `DocumentDetailDialog.tsx` (line 312), `DocumentPreviewDialog.tsx` (line 123), and `DocumentViewer.tsx` (line 58) all embed Supabase signed URLs in `<iframe>` elements.

**Fix:** In `next.config.js`, change the `frame-src` entry to:
```
"frame-src 'self' blob: https://*.supabase.co",
```
Same wildcard pattern already used on line 23 for `connect-src`.

**Verify:** After deploy, open any existing uploaded document inside the KYC doc list. The iframe should render the PDF / image. Console should no longer show the CSP violation.

---

### 2. Country-picker search field placeholder is unreadable gray

**File:** `src/components/shared/MultiSelectCountry.tsx`, line ~168.

**Symptom:** The search `<input>` inside the country-picker dropdown has `placeholder:text-gray-500` — on the client page's background the placeholder text is too light to read.

**Fix:** Change `placeholder:text-gray-500` → `placeholder:text-gray-700` (keeps it distinguishable from the typed value, which is `text-gray-900`, while being readable against the white dropdown background).

---

### 3. Sticky "Save & Continue" / Submit footer is hidden behind the macOS Dock

**File:** `src/components/client/ServiceWizardNav.tsx`, line 30.

**Symptom:** The `fixed bottom-0` footer sits flush at the bottom of the viewport. On laptops where the Dock auto-hides into the bottom strip, the Dock overlays the Submit / Next / Back row, making the buttons hard or impossible to click.

**Fix:** Raise the sticky footer by ~24px so it always sits above the Dock strip. Change line 30 from:
```tsx
<div className="fixed bottom-0 left-[260px] right-0 bg-white border-t px-6 py-3 flex items-center justify-between gap-3 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
```
to:
```tsx
<div className="fixed bottom-6 left-[260px] right-0 bg-white border-t border-x rounded-t-lg px-6 py-3 flex items-center justify-between gap-3 z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]">
```
(Add a small bottom gap, round the top corners so the floating footer looks intentional, add a left border so the rounded edge reads cleanly.)

**Also apply the same fix** to any other sticky wizard footer that sits `fixed bottom-0`. Quickly grep: `rg "fixed bottom-0" src/ -l`. If the KYC wizard's own step-nav footer (`src/components/kyc/KycStepWizard.tsx` around line 492–497) uses `fixed bottom-0` in its `fixedNav` branch, apply the same pattern (add `bottom-6` + rounded top + left border).

---

### 4. Review KYC sticky footer — Back button alignment is already correct, re-verify after #3

The same `ServiceWizardNav.tsx` already uses `left-[260px]` to offset for the sidebar — so the footer starts where the main content panel starts. After the fix in item #3, confirm the footer still aligns to the left edge of the main content area and not the viewport edge. No separate change required — this is a verification step.

If the wizard's internal KYC step nav (`KycStepWizard.tsx` `fixedNav` branch) uses `left-0 right-0`, fix it to match by computing the same 260px left offset, OR constrain the footer to the main column with `max-w-*` + `mx-auto` so the Back button aligns to the main content.

---

### 5. Final-review Submit button is silently disabled with no explanation

**Files:**
- `src/components/client/ServiceWizard.tsx` (line 116, where `canSubmit` is computed)
- `src/components/client/ServiceWizardNav.tsx` (line 51–60, where the Submit button is rendered)

**Current behaviour:** `canSubmit = steps 0–3 all complete`. When any are missing, Submit is disabled with zero feedback — user cannot tell why.

**Fix:**

**5a.** In `ServiceWizard.tsx`, alongside `canSubmit`, compute a `submitBlockers: string[]` array with a human-readable reason for each missing piece:
- If `!completedSteps.includes(0)` → push `"Service Details — section 1 is incomplete"` (or whatever the step 0 nav label is — re-use `STEP_LABELS` if one exists)
- Same for steps 1, 2
- For step 3:
  - If `!hasDirector` → push `"At least one director must be added in the People step"`
  - Else if `!allKycDone` → push `"All directors, shareholders, and UBOs must complete their KYC"`
- Pass `submitBlockers` into `<ServiceWizardNav>` as a new optional prop `submitBlockers?: string[]`.

**5b.** In `ServiceWizardNav.tsx`, when `isLast && !canSubmit && submitBlockers.length > 0`, wrap the disabled Submit button in a shadcn tooltip (use `@/components/ui/tooltip` — already in the project) whose content is:
```
Before submitting, please complete:
• <blocker 1>
• <blocker 2>
…
```
Use the base-ui pattern: `<Tooltip><TooltipTrigger render={<Button …/>} /><TooltipContent>…</TooltipContent></Tooltip>`. If wrapping a disabled button directly breaks hover events (common browser quirk), wrap in a `<span>` with `inline-block` and put the tooltip trigger on the span.

**5c.** Also render the blocker list **inline on the final review step** (above the sticky footer, inside the review step's page body) as a warning card titled "Before you can submit". Use an amber or yellow card. This way the user sees the blockers even without hovering the Submit button.

The review-step component is `src/components/client/ServiceWizardReviewStep.tsx` (or similar — find it by grepping for `currentStep === 4` or the last-step render in `ServiceWizard.tsx`). Pass `submitBlockers` down to it and render the card near the top.

---

### 6. KYC "Back to People" silently discards unsaved changes

**Files:**
- `src/components/client/ServiceWizardPeopleStep.tsx` around line 1518 — the Back button calls `() => setReviewingRoleId(null)` directly.
- `src/components/kyc/KycStepWizard.tsx` around line 315–320 — `handleBack` calls `saveCurrentStep()` but doesn't await the `useAutoSave` debounce flush in `IndividualKycForm`.
- `src/hooks/useAutoSave.ts` — the autosave hook.

**Fix strategy:** Expose a flush method from `useAutoSave` and await it before back-to-people.

**6a — `useAutoSave.ts`:** change the hook's return signature to include a `flush: () => Promise<void>` in addition to `{ saving, lastSaved }`. Internally, the flush should cancel any pending debounce timer, immediately run the save with the current latest values, and resolve when the save completes (or rejects on error, which the caller can decide to swallow).

**6b — `IndividualKycForm.tsx`:** accept an optional `onRequestFlush` callback prop, OR (cleaner) expose its flush via a forwarded ref / an imperative handle. Simpler approach: when the form mounts, register its `flush` with a parent-provided callback like `onFlushReady?: (flush) => void`. This lets the parent keep a ref to the latest flush function.

**6c — `ServiceWizardPeopleStep.tsx`:** before `setReviewingRoleId(null)` runs, await the flush. If flush fails, show a toast `Couldn't save your changes — please try again` and do NOT navigate away (keep the panel open).

**6d — `KycStepWizard.tsx`:** same inside `handleBack` — await the flush before dismissing. This covers the case of the user navigating backward through wizard steps too.

**Simpler alternative accepted** (use this if the flush-method refactor gets messy): on the Back handler in `ServiceWizardPeopleStep`, if `saving === true` OR the last-saved timestamp is older than the most recent form edit (heuristic: track `dirty` boolean), show a shadcn `<AlertDialog>` with options:
- **Save and exit** — waits for in-flight save, then navigates
- **Discard and exit** — navigates immediately without saving
- **Cancel** — keeps panel open

The dialog is the simpler, more robust path. Prefer the dialog approach unless the flush refactor is genuinely one-line clean.

---

## Done criteria

- [ ] `npm run build` passes (lint + type check). Required before commit per CLAUDE.md.
- [ ] CSP no longer blocks Supabase iframes — verified by opening an uploaded doc in the KYC wizard without browser-console errors.
- [ ] Country-picker search placeholder is clearly readable on the client page.
- [ ] Sticky Save & Continue / Submit footer is visible above the macOS Dock — test by hiding/showing the Dock.
- [ ] Disabled Submit button on the review step shows a tooltip listing blockers AND an inline blocker card is visible on the page.
- [ ] Back-to-People from the KYC wizard either flushes unsaved changes OR prompts with a save/discard/cancel dialog. No silent loss of input.
- [ ] `CHANGES.md` updated with a `## B-043 — Client wizard polish (done YYYY-MM-DD)` entry listing all 6 items and files changed.
- [ ] Committed and pushed to `origin main` per the Git Workflow Rule in CLAUDE.md.

## Notes for the implementer

- Single-batch brief. Do not split into multiple PRs.
- Commit message: clean and descriptive (e.g. `fix: CSP allow Supabase iframes + wizard footer, tooltip, autosave polish`). No batch ID prefix.
- Include the standard dev-server restart hint in the final handoff one-liner, since CSP changes require a dev server restart to take effect:
  ```
  pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
  ```
- If any item in this brief is more complex than expected, implement what's clean, document the skipped / deferred piece in CHANGES.md, and keep going. Do not stop.
