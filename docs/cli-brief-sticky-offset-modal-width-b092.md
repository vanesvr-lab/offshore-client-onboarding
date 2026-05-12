# CLI Brief — B-092 Fix Scroll Landing + Widen Summary Modals

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-090 (sticky top bar + sticky right rail + per-profile View Summary), B-091 (service summary modal)

---

## Why this batch exists

After B-090 and B-091 landed, two visual bugs surfaced on `/admin/services/[id]`:

1. **Off-by-one scroll landing.** Clicking an Edit pencil in either the per-profile or service-level summary modal scrolls to a section that ends up **hidden behind the sticky top bar**, so the user visually lands on the *next* section. Clicking "Company Setup" → lands on Financial; clicking "Financial" → lands on Banking; clicking "Banking" → lands on People & KYC.
   Root cause: the sticky top bar (back link + title row + stage strip + step indicator + paddings) is roughly **290 px tall** on desktop, but section anchors only have `scroll-mt-52` (208 px). The target sits ~80 px behind the bar; what's visible at viewport-top is the next section.
   Same root cause for the right rail's `lg:top-[200px]` — it pins too high and overlaps the bottom of the sticky bar.
2. **Horizontal scrollbar inside the summary modals.** Both `PersonSummaryDialog` (today `max-w-3xl`) and `ServiceSummaryDialog` (today `max-w-4xl`) are too narrow for their content — long field labels in the read-only summary force a horizontal scrollbar at the bottom of the modal.

This brief is a narrow tactical pass: bump three CSS values + one modal width on each modal. No behavioural changes; no auto-expand of subsections on landing (deferred — Vanessa picked the smaller scope).

After this brief: Edit pencils scroll the page so the target section sits cleanly below the sticky bar; the right rail no longer overlaps the bar; both modals are wide enough that the horizontal scrollbar disappears at the current content widths.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main` — worktree is on a feature branch; CLI pulls main) + update CHANGES.md.
2. `npm run build` must pass clean.
3. **Don't auto-expand the target section** on landing — Vanessa explicitly chose the no-auto-expand option. Admin still clicks Show to expand the section after the scroll lands. This is option (a) from the open-question round; do not lift expansion state out of the cards.
4. **Don't change any behaviour.** Edit click → modal close → smooth-scroll is unchanged; only the scroll's *resting position* shifts because of the larger margin.
5. **Don't introduce CSS variables, ResizeObservers, or runtime measurement** of the sticky bar's height in this brief. The static-bump approach is fine for now — if the sticky bar's height changes meaningfully in a future brief, that brief updates these values. Keep it simple.
6. **Don't change the per-profile modal's per-section mapping logic** (`mapJumpTargetToSection` in `PersonSummaryDialog.tsx`) or the service modal's profile-row drill-down behaviour. Both shipped working correctly aside from the scroll landing.
7. **Don't restart the dev server.** Vanessa restarts after CLI finishes.

---

## Step 1 — Bump `scroll-mt` on all section anchors

Three files. Replace `scroll-mt-52` with `scroll-mt-80` (208 px → 320 px) everywhere it appears on a section anchor wrapper.

### 1a. `ServiceCollapsibleSection`

File: [`src/components/admin/ServiceCollapsibleSection.tsx`](src/components/admin/ServiceCollapsibleSection.tsx) — lines ~82-83.

```diff
-          ? "overflow-hidden scroll-mt-52 border border-gray-900 shadow-sm"
-          : "overflow-hidden scroll-mt-52 border border-gray-200 shadow-sm"
+          ? "overflow-hidden scroll-mt-80 border border-gray-900 shadow-sm"
+          : "overflow-hidden scroll-mt-80 border border-gray-200 shadow-sm"
```

Both branches (step + default) get the bump so the Internal Notes / Risk Assessment / Milestones / Audit Trail sections also scroll cleanly when anchored.

### 1b. `KycLongFormSection`

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) — line ~796.

```diff
-    <div className="border rounded-lg overflow-hidden scroll-mt-52" id={sectionAnchorId}>
+    <div className="border rounded-lg overflow-hidden scroll-mt-80" id={sectionAnchorId}>
```

This is the wrapper that holds each KYC subsection's anchor (`kyc-section-{profileId}-{categoryKey}`).

### 1c. `PersonCard`

Same file as 1b — line ~1881.

```diff
-      className="border rounded-xl overflow-hidden scroll-mt-52"
+      className="border rounded-xl overflow-hidden scroll-mt-80"
```

This is the profile-card wrapper that carries the `person-card-{profileId}` anchor.

After these three diffs, any `scrollIntoView` against these anchors will land the target ~320 px below the viewport top — clearing the sticky bar's full height.

## Step 2 — Bump the right rail's sticky offset

File: same `ServiceDetailClient.tsx` — line ~3634.

```diff
-      <div className="lg:sticky lg:top-[200px] lg:self-start lg:max-h-[calc(100vh-220px)] lg:overflow-y-auto space-y-3">
+      <div className="lg:sticky lg:top-[300px] lg:self-start lg:max-h-[calc(100vh-320px)] lg:overflow-y-auto space-y-3">
```

- `lg:top-[200px]` → `lg:top-[300px]`: the rail now pins 300 px from viewport top, just below the sticky bar.
- `lg:max-h-[calc(100vh-220px)]` → `lg:max-h-[calc(100vh-320px)]`: the rail's max height accounts for the new offset, so internal scrolling kicks in at the right point.

(`200`/`220` vs `300`/`320`: the original used a 20 px buffer between the rail top and the bar bottom for visual breathing room. Keep the same 20 px buffer at the new offset.)

## Step 3 — Widen both summary modals to `max-w-5xl`

### 3a. `PersonSummaryDialog`

File: [`src/components/shared/PersonSummaryDialog.tsx`](src/components/shared/PersonSummaryDialog.tsx) — line ~178.

```diff
-      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto z-[100]">
+      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto z-[100]">
```

(`max-w-3xl` = 768 px → `max-w-5xl` = 1024 px)

### 3b. `ServiceSummaryDialog`

File: [`src/components/admin/ServiceSummaryDialog.tsx`](src/components/admin/ServiceSummaryDialog.tsx) — line ~429.

```diff
-      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-[100]">
+      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto z-[100]">
```

(`max-w-4xl` = 896 px → `max-w-5xl` = 1024 px)

Both modals now share the same width — consistent visual rhythm regardless of which one the admin opens.

## Step 4 — Smoke test (manual; document in CHANGES.md)

Open `/admin/services/[id]` on Vanessa's Elarix LLC or GBC-0002.

**Service summary modal:**

1. Open the "View Summary for GBC-0002" button at the top of the right rail.
2. Click Edit on **Company Setup** → modal closes, page scrolls. Company Setup's blue pill is fully visible just below the sticky top bar. Not partly hidden, not behind it.
3. Click Edit on **Financial** → same. Financial pill visible directly below the bar.
4. Click Edit on **Banking** → same.
5. Click Edit on **Documents** → page scrolls; the Documents section's pill sits cleanly below the bar.
6. Inside the service modal, expand a profile row → click Edit on a sub-section (e.g. "Your Identity"). Modal closes; page scrolls to that profile card (via the `person-card-{id}` anchor per B-091's documented trade-off). Profile card top is visible below the sticky bar.

**Per-profile summary modal:**

7. From any profile card's quick-actions row, click **View Summary**.
8. Click Edit pencil next to **Your Identity** → modal closes, profile card expands (if collapsed), page scrolls. The Identity subsection's anchor (`kyc-section-{profileId}-identity`) is now visible below the sticky bar — not behind it. Note: the subsection itself may still be **collapsed** (admin clicks Show to see fields); that's intentional per Q1 = option (a).
9. Click Edit pencil next to **Financial Profile** → same. Subsection visible below the bar.
10. Bottom **"Open Review KYC to edit"** button → scrolls to the first kyc-section (identity) of that profile. Visible below the bar.

**Modal widths:**

11. With the service modal open, scroll vertically through its body — **no horizontal scrollbar** appears at the bottom. Long field labels ("Countries of operations (select applicable countries)", "Estimated value range of inward transactions", etc.) fit in the 2-col grid without forcing horizontal overflow.
12. Same for the per-profile modal — no horizontal scrollbar.
13. Both modals visually consistent in width.

**Right rail:**

14. Scroll the page. The right rail pins at ~300 px from viewport top — directly below the sticky top bar, not overlapping it.
15. Expand the Audit Trail panel until the rail content exceeds the viewport — internal scrollbar appears inside the rail (not the page). The rail's bottom doesn't run past the viewport bottom.

**Regression checks:**

16. Click any section in the **step indicator** (1. Company Setup ▸ 2. Financial ▸ …) — same off-by-one fix applies. Each section's pill is fully visible after the smooth-scroll lands.
17. `npm run build` clean.

If any of 1–16 fails, fix in the same batch.

---

## CHANGES.md format

Append after the most recent entry:

```md
### 2026-05-12 — B-092 — Fix scroll landing + widen summary modals (Claude Code)

Tactical visual fix following B-090 / B-091.

- `scroll-mt-52` → `scroll-mt-80` (208 px → 320 px) on every section anchor: `ServiceCollapsibleSection` (both step + default branches), `KycLongFormSection`, `PersonCard`. The sticky top bar is ~290 px tall, so the previous 208 px margin left the target section behind the bar — every Edit click visually landed on the next section. Bumping to 320 px clears the bar with a small buffer.
- Right rail offset: `lg:top-[200px]` → `lg:top-[300px]`, `lg:max-h-[calc(100vh-220px)]` → `lg:max-h-[calc(100vh-320px)]`. Same 20 px buffer between the bar bottom and the rail top, at the corrected offset.
- `PersonSummaryDialog` width: `max-w-3xl` → `max-w-5xl` (768 px → 1024 px).
- `ServiceSummaryDialog` width: `max-w-4xl` → `max-w-5xl` (896 px → 1024 px). Both modals now share one width; long field labels in the read-only grids no longer trigger horizontal scroll.

No auto-expand on landing — Vanessa explicitly chose the no-auto-expand option (B-092 Q1=a). Admin still clicks Show to expand the target subsection after the scroll lands.

Smoke test: <pass/fail notes from Step 4>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT auto-expand the target subsection / profile card on landing. Out of scope.
- Do NOT replace `scroll-mt-80` with a CSS variable, ResizeObserver, or runtime-measured offset. Static bump is the right approach for this brief.
- Do NOT change the modal beyond the width — typography, sections, edit pencils, close button all stay identical.
- Do NOT change the section anchor IDs (`step-company-setup`, `step-financial`, `step-banking`, `step-people-kyc`, `step-documents`, `person-card-{id}`, `kyc-section-{id}-{categoryKey}`).
- Do NOT introduce new design tokens or refactor the colour/sizing scale.
- Do NOT touch the step indicator's smooth-scroll wiring — same anchor IDs, same `scrollIntoView` call site, and the fix in Step 1 is what makes its targets land correctly too.
- Do NOT restart the dev server yourself.
