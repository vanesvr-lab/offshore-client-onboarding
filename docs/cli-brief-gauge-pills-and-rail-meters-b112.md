# CLI Brief — B-112 Step-Pill Gauge Redesign + Right-Rail Progress Meters + Pending Card Resize

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches API:** No
**Touches AI verification:** No
**Builds on:** B-111 (step state computation + pill component + pending card)

---

## Pre-flight

Run `git pull origin main`. No specific feat to wait on — B-111 already landed.

---

## Why this batch exists

Three connected UI changes to the at-a-glance view on `/admin/services/[id]`:

1. **Pill colors from B-111 feel too loud.** Full-pill green/amber/red turned the row into a rainbow. Vanessa picked a quieter design (see `public/pill-mockups.html` — variant G-2): pill body stays brand-navy, step number moves into the label (`1: Company Setup`), and each pill carries two small SVG gauges on the right — one for completion %, one for review state with an icon (`✓` / `⚑` / `✕` / `○`).
2. **No top-level glance numbers in the right rail.** Today the rail shows the Status card + Pending list, but no "how far are we through this service" summary. Two circular progress meters at the top of the rail — `Completed n/5` and `Reviewed n/5` — give the one-second answer.
3. **Pending card is too long.** When there are many pending items, the card stretches the rail. Cap to 4 items visible with internal scroll for the rest.

---

## Hard rules

1. **One batch.** Commit + `git push origin HEAD:main` + CHANGES.md.
2. `npm run build` clean.
3. **No new endpoints, no migrations** — everything is derivation + UI rework.
4. **No `as any`.**
5. **Delete `public/pill-mockups.html`** as part of this commit — it was a prototyping aid for B-112, not a runtime asset.
6. **Don't restart the dev server.**

---

## Step 1 — Step pill gauge redesign (G-2 from the mockup)

### Step 1.1 — Update `AdminApplicationStepIndicator`

File: [`src/components/admin/AdminApplicationStepIndicator.tsx`](src/components/admin/AdminApplicationStepIndicator.tsx).

Extend `AdminStep`:

```ts
export interface AdminStep {
  id: string;
  label: string;
  sectionKeys: string[];
  state?: PillState;
  completionPct?: number;          // 0–100, drives the left gauge
  reviewState?: "reviewed" | "flagged" | "rejected" | "not_reviewed";
}
```

The pre-existing `state` and `countBadge` props from B-111 are no longer used by this redesign. Keep `state` (some other call sites might read it), but drop the existing color-by-state styling that B-111 introduced on the pill body. Drop `countBadge` from the render output.

Replace the per-pill render with two SVG gauges:

```tsx
function StepPill({ step, index, onClick }: { ... }) {
  const pct = clamp(step.completionPct ?? 0, 0, 100);
  const completionStrokeColor = pct >= 100 ? "#4ade80" : "#fbbf24"; // green / amber
  const reviewBg = {
    reviewed: "#16a34a",
    flagged: "#d97706",
    rejected: "#dc2626",
    not_reviewed: "#475569",
  }[step.reviewState ?? "not_reviewed"];
  const reviewIcon = {
    reviewed: "✓",
    flagged: "⚑",
    rejected: "✕",
    not_reviewed: "○",
  }[step.reviewState ?? "not_reviewed"];
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full bg-brand-navy py-1 pl-3 pr-1.5 text-sm text-white transition-colors hover:bg-brand-navy/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
    >
      <span className="font-medium leading-none">{index + 1}: {step.label}</span>
      <CompletionGauge pct={pct} strokeColor={completionStrokeColor} />
      <ReviewGauge bg={reviewBg} icon={reviewIcon} />
    </button>
  );
}
```

`CompletionGauge` and `ReviewGauge` are small dedicated components (or inline render functions) using the same SVG shapes as the mockup at `public/pill-mockups.html` — 26×26 viewport, 14r outer ring, stroke-width 4. The completion gauge shows the integer pct inside (`100`, `60`, `40`). The review gauge is a fully filled circle (16r) with the icon centered.

Reference styling:

```tsx
function CompletionGauge({ pct, strokeColor }: { pct: number; strokeColor: string }) {
  const dashTotal = 88;                 // 2π × 14, rounded to a clean dasharray base
  const dash = (pct / 100) * dashTotal;
  return (
    <svg width="26" height="26" viewBox="0 0 36 36" aria-label={`${pct}% complete`}>
      <circle cx="18" cy="18" r="14" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="4" />
      <circle
        cx="18" cy="18" r="14"
        fill="none"
        stroke={strokeColor}
        strokeWidth="4"
        strokeDasharray={`${dash} ${dashTotal}`}
        strokeLinecap="round"
        transform="rotate(-90 18 18)"
      />
      <text x="18" y="22" textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
        {pct}
      </text>
    </svg>
  );
}

function ReviewGauge({ bg, icon }: { bg: string; icon: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 36 36" aria-label="review state">
      <circle cx="18" cy="18" r="16" fill={bg} />
      <text x="18" y="23" textAnchor="middle" fontSize="14" fontWeight="700" fill="#fff">
        {icon}
      </text>
    </svg>
  );
}
```

### Step 1.2 — Source the props from `ServiceDetailClient`

In `ServiceDetailClient.tsx`, the existing `stepsWithState` memo (B-111) computes per-step `state` and `countBadge`. Replace its output to populate `completionPct` and `reviewState` instead:

```ts
const stepsWithState = useMemo<AdminStep[]>(
  () =>
    ADMIN_STEPS_SERVICES.map((step) => {
      const review = sectionReviews.find((r) => r.section_key === step.sectionKeys[0]);
      const pct = computeStepCompletionPct(step, /* …same deps as B-111 */);
      const reviewState = review
        ? (review.status as "reviewed" | "flagged" | "rejected")
        : "not_reviewed";
      return { ...step, completionPct: Math.round(pct), reviewState };
    }),
  [sectionReviews, /* completion deps */],
);
```

B-111's `state` + `countBadge` logic can stay where it computes (the data is still needed for the Pending card and the progress meters below) but no longer drives the pill's visuals.

### Step 1.3 — Tooltip

Each pill gains a hover tooltip with the full state in words:

> Company Setup
> 100% complete · Reviewed by Jane Doe on 12 May 2026

Use the existing `Tooltip` / `TooltipTrigger` pattern from B-100. The tooltip body assembles the completion % + the review state + reviewer name + reviewed_at (already in scope via the `sectionReviews` array — read the review row matching the step).

---

## Step 2 — Two circular progress meters at top of right rail

### Step 2.1 — Compute the numbers

In `ServiceDetailClient.tsx`, alongside `stepsWithState`:

```ts
const completedCount = stepsWithState.filter((s) => (s.completionPct ?? 0) >= 100).length;
const reviewedCount  = stepsWithState.filter((s) => s.reviewState === "reviewed").length;
const TOTAL_STEPS = 5;
```

### Step 2.2 — New component

File: `src/components/admin/ServiceProgressMeters.tsx`.

Two side-by-side circular gauges in a single card. Each gauge:

- 64×64 SVG (bigger than the pill gauges so the n/5 in the centre reads well)
- Outer light-gray track ring
- Filled arc proportional to the count
- Centre: bold `n/5` (e.g. `3/5`)
- Below the gauge: small uppercase label `Completed` / `Reviewed`

Suggested colors:
- Completed gauge fill: brand-blue (`#2563eb`) — neutral progress signal
- Reviewed gauge fill: green (`#16a34a`)
- If reviewed count > completed count (shouldn't normally happen, but a safety): fall back to neutral

```tsx
"use client";

interface Props {
  completedCount: number;
  reviewedCount: number;
  total: number;
}

export function ServiceProgressMeters({ completedCount, reviewedCount, total }: Props) {
  return (
    <div className="rounded-lg border bg-white p-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
        Progress
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <ProgressMeter count={completedCount} total={total} label="Completed" color="#2563eb" />
        <ProgressMeter count={reviewedCount}  total={total} label="Reviewed"  color="#16a34a" />
      </div>
    </div>
  );
}

function ProgressMeter({ count, total, label, color }: {
  count: number; total: number; label: string; color: string;
}) {
  const dashTotal = 220;                // 2π × 35
  const pct = total > 0 ? count / total : 0;
  const dash = pct * dashTotal;
  return (
    <div className="flex flex-col items-center">
      <svg width="80" height="80" viewBox="0 0 80 80">
        <circle cx="40" cy="40" r="35" fill="none" stroke="#e5e7eb" strokeWidth="8" />
        <circle
          cx="40" cy="40" r="35"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${dash} ${dashTotal}`}
          strokeLinecap="round"
          transform="rotate(-90 40 40)"
        />
        <text x="40" y="46" textAnchor="middle" fontSize="20" fontWeight="700" fill="#0f172a">
          {count}/{total}
        </text>
      </svg>
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500 mt-1">{label}</span>
    </div>
  );
}
```

### Step 2.3 — Mount above the existing right-rail cards

In `ServiceDetailClient.tsx`, in the right rail column, render `<ServiceProgressMeters>` as the first card — above the Pending card, Status card, and everything else.

---

## Step 3 — Pending card cap at 4 items

### Step 3.1 — Adjust the scroll container

File: [`src/components/admin/ServicePendingCard.tsx`](src/components/admin/ServicePendingCard.tsx).

The card's list currently uses `max-h-[60vh] overflow-y-auto`. Replace with a fixed-row height calculation so exactly ~4 items show before scroll kicks in. Each `PendingRow` is roughly 56px tall (label + detail + padding); cap the list at `max-h-[15rem]` (240px) so 4 rows fit comfortably and the 5th peeks at the bottom edge (a UX hint that more exists).

```tsx
<ul className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
  {items.map(…)}
</ul>
```

(`max-h-60` = 240px in Tailwind. The `pr-1` keeps the scrollbar from overlapping row content.)

If 4-rows-at-56px doesn't read well in practice (some rows are taller due to multi-line details), adjust to `max-h-[17rem]` or `max-h-[18rem]`. Eyeball it in the actual page.

The header stays: `PENDING · 7 items` with the count badge.

### Step 3.2 — Visual hint that there's more

When `items.length > 4`, append a tiny "scroll for more" affordance — either:
- A faint linear gradient on the bottom of the scroll container (`bg-gradient-to-t from-white to-transparent` overlay on the last few px), or
- A small `+ N more` row below the list

Pick the gradient — less DOM, cleaner. Add as a positioned overlay inside the card.

---

## Step 4 — Commit + push + CHANGES.md

```
feat: step-pill gauge redesign + right-rail Completed/Reviewed meters + Pending card 4-row cap
```

CHANGES.md under `## B-112`:

```
## B-112 — Pill gauges + rail progress meters + Pending resize (done <date>)

- AdminApplicationStepIndicator: pill body returns to uniform brand-navy. Step number moves into the label ("1: Company Setup"). Each pill now carries two SVG gauges — completion % (green when 100%, amber otherwise; pct in centre) and review state (fully-filled circle in green/amber/red/gray with ✓/⚑/✕/○ icon). Tooltip shows the full state including reviewer + date.
- ServiceProgressMeters: new component at the top of the right rail; two circular meters Completed n/5 (brand-blue) and Reviewed n/5 (green) with the count in the centre and the label below.
- ServicePendingCard: list now max-h-60 (~4 rows visible) with internal scroll + faint bottom gradient hint when items overflow.
- Deleted public/pill-mockups.html (prototyping aid for this brief, no longer needed).
```

---

## Acceptance criteria

- [ ] `npm run build` clean
- [ ] All five step pills are brand-navy with no full-pill color states (no green/amber/red pill bodies)
- [ ] Step number renders inline with the label (`1: Company Setup`)
- [ ] Each pill shows two gauges: completion (pct numeric centre, green when 100, amber otherwise) and review (icon centre, full color background)
- [ ] Right rail's top card shows two circular meters: Completed n/5 + Reviewed n/5; updates immediately after a save or mark-reviewed
- [ ] Pending card shows ~4 rows then scrolls internally; bottom gradient hint visible when overflow
- [ ] Hover on any pill shows the tooltip with state details
- [ ] `public/pill-mockups.html` is deleted
- [ ] CHANGES.md has a single B-112 entry

---

## After the batch

Final commit + push → tell Vanessa: "B-112 done — pill gauges + right-rail meters + Pending card resized." Stop.
