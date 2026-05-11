# CLI Brief — B-088 Section Header Pill: Match Section Card Size

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-080..B-083 (section pill iteration), B-085 (status label override)

---

## Why this batch exists

On `/admin/services/[id]`, each top-level step section (Company Setup, Financial, Banking, People & KYC, Documents) renders as a bordered Card with the blue header pill sitting inside it surrounded by horizontal + vertical gutter. Visually, the pill looks like it's floating inside the card rather than being the card. Vanessa wants the pill to span the **full card edge-to-edge**, so the card *is* the pill (no inner gutter) — chunkier, denser, cleaner.

The `Approved / Flagged / Not reviewed` badge + `Review` button currently render inside the same Card row as the pill. To make the pill edge-to-edge they need to move out of the card and become a sibling on the right of the card, on the page background.

Scope: only the `variant="step"` branch of `ServiceCollapsibleSection`. The default variant (Internal Notes, Risk Assessment, Milestones, Audit Trail — light header rows) is **untouched**.

After this brief: each of the five step sections renders as a single rounded rectangle of solid blue (the pill = the card), with the review badge + button as a sibling to the right, matching the layout pattern of person pill + aggregate badge inside profile cards (B-083).

---

## Hard rules

1. **One batch only.** Commit + push (`git push origin HEAD:main` — this worktree is on a feature branch; CLI pulls main) + update CHANGES.md.
2. **Only the `step` variant** of `ServiceCollapsibleSection`. Default variant rows on the same page (Internal Notes, Risk Assessment, Milestones, Audit Trail, KYC subsections via `KycLongFormSection`) keep their current layout.
3. **No prop API breaks for callers.** `ServiceDetailClient.tsx` consumes `ServiceCollapsibleSection` for all five step sections — the JSX call sites must keep working unchanged. Restructure is internal to the component.
4. **No new colours, no new design tokens.** Reuse `bg-[#06629c]` / `text-white` etc. that already drive the pill.
5. **Mobile breakpoint untouched.** All responsive-hide logic at `sm:` / `lg:` (progress bar, % number, Complete label) stays as-is — the change is purely about the pill's outer gutter, not its internal content.
6. `npm run build` clean.
7. **Don't refactor `SectionReviewControls` shape** — it's still rendered from inside `ServiceCollapsibleSection`, just at a different layout position. The function itself stays put. Callers don't change.

---

## Step 1 — Restructure the `step` variant in `ServiceCollapsibleSection`

File: [`src/components/admin/ServiceCollapsibleSection.tsx`](src/components/admin/ServiceCollapsibleSection.tsx)

The current `step` branch (lines ~77–187) wraps everything inside one `<Card>` and renders the pill as a `<span>` inside the row's padding box. Restructure so:

- The outer return wraps the Card in a **flex row** that contains the Card on the left (`flex-1`) and `SectionReviewControls` on the right (sibling, outside the card).
- The Card contains ONLY the header row + collapsible body. No outer `px-5 py-4` row padding — the pill provides its own vertical padding and sits edge-to-edge.
- The pill becomes the clickable button itself (no separate wrapper button). Its internal layout (title left, progress / % / dot / label / Show▾ right) is preserved.
- The pill's `rounded-md` class is removed — the Card's `rounded-lg overflow-hidden` (already on `<Card>` via the existing classes + overflow-hidden in the className) clips the pill cleanly at the corners.
- The `border border-gray-900` on the step variant Card stays — it's the section's outline.

**Suggested shape:**

```tsx
if (isStep) {
  return (
    <div id={anchorId} className="flex items-stretch gap-3 scroll-mt-24">
      <Card className="flex-1 overflow-hidden border border-gray-900 shadow-sm">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="block w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-accent"
        >
          <span className="flex w-full items-center justify-between gap-3 px-5 py-3 bg-[#06629c] text-white text-sm font-medium">
            {/* Left: title pinned to left edge */}
            <span className="inline-flex items-center gap-2 min-w-0">
              {icon && <span className="text-white/80 shrink-0">{icon}</span>}
              <span className="font-medium truncate">{title}</span>
            </span>
            {/* Right cluster — UNCHANGED from current step branch */}
            {percentage !== undefined && ragStatus && (
              <span className="inline-flex items-center gap-2.5 shrink-0">
                <div className={`${sectionKey ? "hidden lg:block" : ""} w-24 h-1.5 rounded-full bg-white/20 overflow-hidden shrink-0`}>
                  <div className={`h-full rounded-full transition-all ${fillColor}`} style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} />
                </div>
                <span className={`${sectionKey ? "hidden lg:inline" : ""} text-xs text-white w-8 text-right shrink-0`}>{percentage}%</span>
                <span className="inline-flex items-center gap-1 text-xs text-white shrink-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${RAG_DOT[ragStatus]}`} />
                  <span className="hidden sm:inline">{statusLabelOverride ?? RAG_LABEL[ragStatus]}</span>
                </span>
                <span className="inline-flex items-center gap-1 text-xs text-white/90 shrink-0">
                  {open ? "Hide" : "Show"}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
                </span>
              </span>
            )}
          </span>
        </button>
        {open && (
          <CardContent className="pt-3 pb-4 px-5 border-t border-gray-100">
            {children}
            {sectionKey && <ConnectedNotesHistory sectionKey={sectionKey} />}
          </CardContent>
        )}
      </Card>
      {sectionKey && (
        <div className="flex items-center shrink-0">
          <SectionReviewControls sectionKey={sectionKey} title={title} />
        </div>
      )}
    </div>
  );
}
// (default-variant branch — fall through to existing implementation, unchanged)
```

Specifically:
- Outer wrapper is `<div className="flex items-stretch gap-3 scroll-mt-24">` (anchor moves here so smooth-scroll lands on the row, not the inner card).
- `<Card>` gets `flex-1` so it takes the row's width minus the review-controls cluster + gap.
- The previous `<div className="flex items-center px-5 py-4 gap-2">` wrapper is **deleted** along with its `px-5 py-4` outer padding.
- The previous `<button>` wrapping the pill with `-mx-2 px-2 py-1 rounded` hit-area extension is **deleted**. The pill `<span>` becomes the inside of a `<button>` directly, with the button styled `block w-full text-left` so the entire pill is clickable.
- The pill's vertical padding shifts from `py-1` to `py-3` so the card height stays close to its current visible height (`py-1` + outer `py-4` ≈ `py-5` net; collapse to `py-3` standalone for similar visual mass — tune by eye if the screenshot lands too tall/thin).
- The pill's horizontal padding shifts from `px-3` to `px-5` so internal text doesn't kiss the rounded corners.
- The pill loses its own `rounded-md` (Card's `overflow-hidden` + the Card's own rounded corners clip it cleanly).
- The default-variant chevron-circle block at lines ~166–172 is no longer reachable when `isStep` is true (it lived after the button); confirm the `!isStep` guard is preserved, or that the new code path doesn't render it at all for `isStep`.
- The default branch (lines ~125–161, plus the `!isStep` chevron-circle) is left **completely as-is** — wrap it under an `else` so step and default are two clean returns.

## Step 2 — Sanity-check call sites

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx)

All five step sections (Company Setup, Financial, Banking, People & KYC, Documents) call `<ServiceCollapsibleSection variant="step" sectionKey="..." anchorId="step-..." ... />`. No JSX changes needed — the prop API is unchanged. Verify after the edit:

- All five sections render.
- The `anchor` link from the `AdminApplicationStepIndicator` at the top of the page still scrolls cleanly to each section (the anchor id moved from Card to the new outer wrapper, but the id string is identical, so href `#step-company-setup` etc. still resolve).
- Default-variant sections on the same page (Internal Notes, Risk Assessment, Milestones, Audit Trail) look **unchanged**.

## Step 3 — Visual + responsive smoke test (manual; document in CHANGES.md)

1. **Desktop ≥1024px (`lg`):** open `/admin/services/[id]` on Vanessa's Elarix LLC service. Each of the 5 step sections is a single rounded rectangle of solid blue (pill = card). The Approved/Flagged/Not reviewed badge + Review button sit to the right of each card, separated by the row's `gap-3`, on the page background.
2. **Tablet ~768px (`md`):** progress bar + % number hide (they're `hidden lg:block`/`hidden lg:inline` when `sectionKey` is set), ● Complete still shows. Pill still spans the full card width.
3. **Mobile 375px:** progress bar / % / Complete label all hidden, only title + Show▾ visible inside the pill. Pill still edge-to-edge. Review badge + button stay readable (may wrap below the card via the outer flex container's default behavior — confirm visually; if they squish, switch the outer wrapper to `flex-col sm:flex-row` and document).
4. **Expand / collapse:** click anywhere on the pill (or the Show▾) → body expands below the pill with a top border (`border-t border-gray-100`), still flush to the card edges via Card overflow-hidden.
5. **Step-indicator anchor:** click "3. Banking" in the top stepper → page scrolls smoothly to the Banking row, the row's `scroll-mt-24` keeps it below the sticky stepper.
6. **Default-variant rows unchanged:** Internal Notes, Risk Assessment, Milestones, Audit Trail still render with the light header, gray border, and the chevron-circle on the right.
7. **`npm run build` clean.**

If anything in 1–6 is off, fix in the same batch — don't ship half.

---

## CHANGES.md format

Append after the existing B-087 entry:

```md
### YYYY-MM-DD — B-088 — Section header pill spans full card width on step variant (Claude Code)

`/admin/services/[id]` — each of the 5 step section cards (Company Setup, Financial, Banking, People & KYC, Documents) is now a single rounded rectangle of solid blue: the pill spans the card edge-to-edge with no inner gutter. The Approved/Flagged/Not reviewed badge + Review button move out of the card and sit as a sibling on the right, on the page background.

- `ServiceCollapsibleSection`: rewrote the `variant="step"` branch only. Outer wrapper is now a flex row containing the Card (flex-1) and `SectionReviewControls` (sibling). The pill becomes the inside of a `block w-full` button; previous `<div className="flex items-center px-5 py-4 gap-2">` row + `-mx-2 px-2 py-1` hit-area wrapper deleted. Pill loses its own `rounded-md` (Card's overflow-hidden + rounded corners clip it). Pill padding shifts `px-3 py-1` → `px-5 py-3` so it provides its own vertical mass.
- `anchorId` moved from the Card to the outer flex wrapper so step-indicator anchors still resolve to the row.
- Default-variant branch (light header rows — Internal Notes, Risk Assessment, Milestones, Audit Trail) untouched.

Smoke test: <pass/fail + breakpoints checked>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT touch the default-variant branch. Only the `variant="step"` path changes.
- Do NOT change the prop API of `ServiceCollapsibleSection`. Call sites in `ServiceDetailClient.tsx` stay byte-identical.
- Do NOT change the pill's right-cluster logic (mini progress bar, % number, ● Complete dot, status text override, Show▾) — copy the existing JSX into the new structure verbatim.
- Do NOT change `bg-[#06629c]` to any other colour, even if a more "design-tokenish" name exists — keep the on-brand pill blue as-is.
- Do NOT introduce new design tokens / refactor the colour into a Tailwind theme entry as a side quest.
- Do NOT touch `KycLongFormSection` or its rendering (which sits inside the Documents / People & KYC bodies) — that's deeper hierarchy and uses its own styling.
- Do NOT change how `SectionReviewControls` itself is constructed — move WHERE it renders, not what it renders.
- Do NOT restart the dev server yourself; Vanessa restarts after CLI finishes.
