# CLI Brief — B-099 Step-Pill Accordion + Stage Strip Polish

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-093 (Status card), B-096 (pill buttons), B-098 (status overhaul + step pill styling)

---

## Why this batch exists

Three small UX improvements on `/admin/services/[id]`:

1. **Click a step pill → accordion-style expand.** Today clicking a step pill in the header (e.g. `1. Company Setup`) smooth-scrolls to that section but the section card stays collapsed — admin still has to click `Show`. Vanessa wants: clicking a step pill **expands the target section card AND collapses every other top-level form section card**. Scope is the 3 form section cards (Company Setup, Financial, Banking) — People & KYC and Documents have their own internal expansion mechanics and stay independent.
2. **All step pills look uniformly clickable.** Drop the per-pill "active" detection from B-098 + drop the `1/1` / `0/1 reviewed` counts after each label — every pill renders in the same brand-navy/white pill style. Cleaner header, no per-step "active" tracking.
3. **Stage strip text bigger; Start chevron narrower.** Stage strip labels (`Start`, `Document Collection`, `Verification & Screening`, …) currently render at `fontSize="11"` inside the SVG — too small relative to the step pill labels below. Bump to 14 to match `text-sm`. If the longer labels (e.g. `Verification & Screening`) don't fit at the larger font, narrow the **first** chevron (`Start` — short word) so the others have more room.

After this brief: clicking a step pill expands that section + collapses the other two form sections. All step pills are the same brand-navy/white shape with no badges or counts. The stage strip labels read at the same size as the step pill labels.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main`) + update CHANGES.md.
2. `npm run build` clean.
3. **Accordion applies to the 3 form sections only** (Company Setup, Financial, Banking). People & KYC and Documents step pills still scroll-to-anchor but don't try to expand anything inside them. The People & KYC section already has its own per-profile expand state; the Documents section has internal tabs (B-097). Don't change either.
4. **Section's own Show/Hide chevron stays functional** — clicking it on an open section collapses (sets the accordion to `null`); clicking on a collapsed section opens it (and closes any other open form section).
5. **No new state library / context.** Use one local `useState<"company_setup" | "financial" | "banking" | null>` at the page root and thread `open` + `onToggle` props down to each ServiceCollapsibleSection. Optional props with safe defaults so existing non-step callers (Internal Notes, Risk Assessment, etc.) keep using internal state.
6. **Don't change the underlying status enum, stage chain, or section IDs.** Strict UI/UX polish.
7. **Don't restart the dev server.**

---

## Step 1 — Make `ServiceCollapsibleSection` support controlled mode

File: [`src/components/admin/ServiceCollapsibleSection.tsx`](src/components/admin/ServiceCollapsibleSection.tsx).

Extend the props interface:

```ts
interface Props {
  // ...existing props
  /** When provided, parent controls the open/closed state. Component falls
   *  back to internal state if both are undefined. */
  open?: boolean;
  onToggle?: () => void;
}
```

Inside the component, replace the internal `useState` toggle with a hybrid:

```ts
const [internalOpen, setInternalOpen] = useState(autoOpen);
const isControlled = open !== undefined && onToggle !== undefined;
const isOpen = isControlled ? open : internalOpen;
const handleToggle = () => {
  if (isControlled) {
    onToggle();
  } else {
    setInternalOpen((v) => !v);
  }
};
```

Replace every reference to the old `open` state variable with `isOpen`, every `setOpen(...)` call with `handleToggle()`. The component preserves behavior for non-controlled callers (Internal Notes / Risk Assessment / Milestones / Audit Trail in the default variant — those keep using internal state).

## Step 2 — Lift state for the 3 form sections to the page root

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx).

Near the top of `ServiceDetailClient`, add:

```ts
type FormStepKey = "company_setup" | "financial" | "banking";
const [openStepSection, setOpenStepSection] = useState<FormStepKey | null>(null);

function toggleStepSection(key: FormStepKey) {
  setOpenStepSection((current) => (current === key ? null : key));
}
```

Then thread props into the three `ServiceCollapsibleSection` call sites:

```tsx
<ServiceCollapsibleSection
  title="Company Setup"
  /* ...existing props... */
  open={openStepSection === "company_setup"}
  onToggle={() => toggleStepSection("company_setup")}
>
  …
</ServiceCollapsibleSection>
```

Same for Financial + Banking — different keys. **Don't** add `open`/`onToggle` props to the People & KYC or Documents `ServiceCollapsibleSection` (or whatever wrapper they use) — they remain self-managed.

## Step 3 — Step pill click → set openStepSection + scroll

File: [`src/components/admin/AdminApplicationStepIndicator.tsx`](src/components/admin/AdminApplicationStepIndicator.tsx).

Currently each step pill is rendered as an `<a href="#...">`. Change to a `<button>` that:
1. Calls the parent-provided `onStepClick(stepId)` handler.
2. The parent in `ServiceDetailClient` translates the step's `id` to the matching form-section key and calls `setOpenStepSection(...)`; if the step isn't one of the three form keys, it skips the state update and just scrolls.
3. Smooth-scrolls to the anchor.

Pass `onStepClick` down via the `AdminApplicationStepIndicator` props:

```ts
interface Props {
  steps: AdminStep[];
  onStepClick?: (stepId: string) => void;
}
```

In `ServiceDetailClient`:

```ts
function handleStepClick(stepId: string) {
  // Map step.id → form-section key. step IDs are "step-company-setup",
  // "step-financial", "step-banking", "step-people-kyc", "step-documents".
  const FORM_STEP_KEY_BY_ID: Record<string, FormStepKey> = {
    "step-company-setup": "company_setup",
    "step-financial": "financial",
    "step-banking": "banking",
  };
  const key = FORM_STEP_KEY_BY_ID[stepId];
  if (key) setOpenStepSection(key);
  // Smooth-scroll on the next frame so the expansion DOM lands first.
  requestAnimationFrame(() => {
    document.getElementById(stepId)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

// ...
<AdminApplicationStepIndicator steps={ADMIN_STEPS_SERVICES} onStepClick={handleStepClick} />
```

The accordion works because `setOpenStepSection("financial")` (for example) makes Financial open AND every other form key (`company_setup`, `banking`) collapsed (their `open={openStepSection === "company_setup"}` evaluates to false).

## Step 4 — Step pill styling: uniform + remove counts

Same `AdminApplicationStepIndicator.tsx`.

Inside `StepPill`:

- Remove the `isActive` branching. Every pill renders with the same brand-navy active styling.
- Remove the `{reviewedCount}/{totalCount} reviewed` text. Drop the `useAggregateStatus` hook call if the only thing it was used for was the counts.
- The numbered badge inside the pill (the small `1`, `2`, …) stays but uses the same color regardless.

Suggested updated render:

```tsx
function StepPill({ step, index, onClick }: { step: AdminStep; index: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm bg-brand-navy text-white hover:bg-brand-navy/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
    >
      <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-white text-brand-navy text-xs font-semibold">
        {index + 1}
      </span>
      <span className="font-medium">{step.label}</span>
    </button>
  );
}
```

The `<ChevronRight>` separator between pills stays. Click handler is wired via the new `onStepClick` prop.

## Step 5 — Stage strip: bump font + narrow Start chevron

File: [`ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) — the SVG-path stage strip (around line ~3412-3426).

Two changes:

### 5a. Bump label font size

```diff
-fill={textColor} fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif"
+fill={textColor} fontSize="14" fontWeight="600" fontFamily="system-ui, sans-serif"
```

The SVG viewBox is `"0 0 200 36"` with `className="w-full h-9"` (h-9 = 36 px tall, matches viewBox). 14 px font fits inside 36 px height.

### 5b. Narrow the Start chevron

The chevrons live inside a flex row where each is `<div key={step} className="relative flex-1">`. The first chevron (`step === "start"`) gets a tighter flex value so the rest of the row has more horizontal room for the longer labels:

```tsx
<div
  key={step}
  className={cn("relative", step === "start" ? "flex-[0.55]" : "flex-1")}
  style={{ marginRight: idx < arr.length - 1 ? "2px" : 0 }}
>
```

`flex-[0.55]` halves the Start chevron's width relative to the others. Adjust to `flex-[0.6]` or `flex-[0.5]` if it looks wrong — visual call. The label `Start` is short enough to fit at any of these values.

If after the font bump some labels (e.g. `Verification & Screening`) still get truncated in the SVG (text doesn't wrap automatically in SVG `<text>`), reduce their flex slightly OR shorten the label in `stepLabels` (e.g., `Verification & Screening` → `Screening` with a tooltip). Prefer adjusting flex first.

## Step 6 — Smoke test (manual; document in CHANGES.md)

1. **Accordion behavior.** Open `/admin/services/[id]`. All 3 form section cards (Company Setup / Financial / Banking) load collapsed (no auto-open). Click pill `1. Company Setup` → Company Setup section expands smoothly, the other two stay collapsed. Click pill `2. Financial` → Financial expands AND Company Setup collapses. Click pill `2. Financial` again → Financial collapses (none open).
2. **Section's own Show/Hide still works.** With Banking open via the pill, click the Show/Hide chevron on Banking's header pill → Banking collapses. Click again → it reopens. State is consistent with the accordion (only one open at a time).
3. **People & KYC + Documents independent.** Pills `4. People & KYC` and `5. Documents` smooth-scroll without affecting the form-section accordion state. Their internal expansion (per-profile cards / Service vs KYC tabs) works as before.
4. **Step pill styling.** Every step pill is brand-navy/white, no `1/1` or `0/1` text after the label, all chevron separators preserved.
5. **Stage strip.** Labels (`Start`, `Document Collection`, `Verification & Screening`, `Risk Assessment`, `Final Review`, `Approved`, `Registration`, `Active`) are noticeably larger than before. Start chevron is narrower than the others. No truncation visible.
6. **Mobile sanity (375 px).** Stage strip still readable; step pills wrap (chevron separators flow with them).
7. **Build + lint clean.** `npm run build` is green.

If any of 1–6 fails, fix in the same batch.

---

## CHANGES.md format

```md
### 2026-05-13 — B-099 — Step-pill accordion + uniform pill styling + stage strip font (Claude Code)

`/admin/services/[id]` three UX polishes.

- **Step pills now drive an accordion** over the 3 form section cards (Company Setup, Financial, Banking). Clicking a pill opens its section and collapses the other two; clicking the same pill again collapses it (none open). People & KYC + Documents pills still scroll-to-anchor but don't toggle anything. `ServiceCollapsibleSection` got optional `open` + `onToggle` props so the parent can control the 3 form cards while default/internal state still drives Internal Notes / Risk Assessment / Milestones / Audit Trail. Page root holds `openStepSection: "company_setup" | "financial" | "banking" | null` state.
- **Step pills look uniform.** Removed B-098's `isActive` branching and the `{reviewedCount}/{totalCount} reviewed` text after each label. Every pill is brand-navy/white with the numbered badge. Cleaner, no per-step active-tracking.
- **Stage strip font bumped 11 → 14** to match the step-pill text size. Start chevron's flex shrunk to `flex-[0.55]` so the longer downstream labels (Verification & Screening, Risk Assessment, Final Review, Document Collection) have room without truncation.

Smoke test: <pass/fail from Step 6>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT lift expand/collapse state for People & KYC or Documents. They have their own mechanics (per-profile cards / tabs) — leave alone.
- Do NOT add a new design token, layout primitive, or context provider. One local state at the page root + 2 new optional props on the existing component.
- Do NOT change the `step.id` strings (`step-company-setup` etc.) — anchors elsewhere depend on them.
- Do NOT change the underlying status chain, stage labels, or `SERVICE_STATUS_LABELS`.
- Do NOT remove the per-pill numbered badge (`1`, `2`, `3`…). She didn't ask for that.
- Do NOT change the section card's own header pill styling (the blue band inside the card).
- Do NOT restart the dev server.
