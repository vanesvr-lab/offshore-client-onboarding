# CLI Brief — B-111 At-a-Glance Pending View (Color-Coded Step Pills + Pending Card)

**Status:** Hold until B-110 lands
**Estimated batches:** 2
**Touches migrations:** No
**Touches API:** No (pure derivation from existing data)
**Touches AI verification:** No
**Builds on:** B-098 (status chain), B-103/B-107 (step pill row), B-106/B-107 (waiver-aware completion), B-108 (alerts feed), B-109/B-110 (section review state with force_reviewed)

---

## Hold rule

Don't start until commit `feat: …force review checkbox…` (B-110) is on `origin/main`. B-110 lands the `force_reviewed` column + `sectionIncomplete` plumbing that this brief reads from for the per-pill state. Run `git pull origin main` and verify before starting.

---

## Why this batch exists

Today, knowing what's left on a service requires scrolling the whole page and reading every section header. Vanessa needs a one-glance read of pending items + a one-click drill-down to the actual work. Two complementary pieces:

1. **Color-coded step pills.** The 5 step pills in the sticky header are uniform brand-navy today. Color them per readiness state — green when reviewed + at 100%, amber when in progress, red when rejected or blocking, gray when not started. Small inline count after the label when relevant (`4. People & KYC · 2 missing`). One scan = whole-service status.
2. **`Pending` card in the right rail.** Compact list of every actionable item across the service: incomplete sections, awaiting-review sections, missing docs, low-KYC profiles, flagged/rejected sections, doc expiry alerts. Each row clickable → scrolls to or opens the relevant section. Replaces the "scroll every section to figure out what's left" workflow.

These overlap with the B-108 Alerts feature deliberately — Alerts is for **post-Active ongoing monitoring** (doc expiry, KYC age); the Pending card is the **onboarding completion checklist** (drive the service to Active). Both surfaces re-use the same alert data where it makes sense.

---

## Hard rules

1. **Two batches, two commits.** After each: stage specific files → commit → `git push origin HEAD:main` → CHANGES.md sub-entry → next.
2. `npm run build` clean after each batch.
3. **No new endpoints, no migrations.** Everything is derived client-side from data the page already loads (section reviews, completion %, documents, waivers, alerts).
4. **No `as any`.**
5. **Don't restart the dev server.**

---

## Batch 1 — Color-coded step pills

**Goal:** the 5 pills in the step indicator render with state-driven colors + an optional count badge.

### Step 1.1 — Per-step state computation

In [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx), compute per-step state for the 5 steps:

```ts
type PillState = "complete" | "in_review" | "in_progress" | "flagged" | "rejected" | "not_started";

interface StepPillState {
  id: string;          // step id, e.g. "step-company-setup"
  label: string;       // human label
  state: PillState;
  count?: number;      // optional badge — e.g. "3 missing"
  countLabel?: string; // optional badge text (e.g. "missing", "%", "incomplete")
}
```

Per-step resolution rules (highest-priority match wins):

| State | Condition |
|---|---|
| `rejected` | section_review.status === 'rejected' |
| `flagged`  | section_review.status === 'flagged' |
| `complete` | section_review.status === 'reviewed' AND no `force_reviewed`, completion is 100% (or N/A for step) |
| `in_review` | completion === 100% AND no review row yet |
| `in_progress` | completion > 0% AND completion < 100% |
| `not_started` | completion === 0% AND no review |

Force-reviewed (`section_review.status === 'reviewed' AND force_reviewed === true`) is **amber** with a small "override" tooltip rather than green — the override is itself a signal worth surfacing at a glance.

Count badge rules (only show when actionable):
- **Company Setup / Financial / Banking**: if `state !== complete`, show `<pct>%` where pct is the section's completion (already computed for the header chip).
- **People & KYC**: count of profiles with KYC < 100%, e.g. "2 incomplete". If all at 100% but not reviewed → "ready".
- **Documents**: count of missing required doc types (uploaded + waived counts as done, per B-107 math).

### Step 1.2 — Extend `AdminApplicationStepIndicator`

File: [`src/components/admin/AdminApplicationStepIndicator.tsx`](src/components/admin/AdminApplicationStepIndicator.tsx). Currently every pill renders uniform brand-navy (per B-099 brief). Add state-driven styling.

Update `AdminStep`:

```ts
export interface AdminStep {
  id: string;
  label: string;
  sectionKeys: string[];
  state?: PillState;           // new
  countBadge?: string | null;  // new — e.g. "40%", "2 missing", "ready"
}
```

Render per-state pill colors:

```ts
const STATE_STYLES: Record<PillState, { bg: string; text: string; ring: string }> = {
  complete:    { bg: "bg-green-600",  text: "text-white",      ring: "ring-green-700" },
  in_review:   { bg: "bg-blue-600",   text: "text-white",      ring: "ring-blue-700" },
  in_progress: { bg: "bg-amber-500",  text: "text-white",      ring: "ring-amber-600" },
  flagged:     { bg: "bg-amber-600",  text: "text-white",      ring: "ring-amber-700" },
  rejected:    { bg: "bg-red-600",    text: "text-white",      ring: "ring-red-700" },
  not_started: { bg: "bg-gray-400",   text: "text-white",      ring: "ring-gray-500" },
};
```

Inside `StepPill`, apply the state's classes. The numbered badge stays white-on-state-color. Append the count badge inline after the label when present:

```tsx
<span className="font-medium">{step.label}</span>
{step.countBadge && (
  <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-medium">
    {step.countBadge}
  </span>
)}
```

Tooltip on hover shows the state + reasoning ("Reviewed on May 7 by Jane Doe", "Incomplete: 40% — fill source of funds", etc.) — match the B-100 SectionReviewBadge tooltip pattern.

Click behaviour: identical to today (delegated to `onStepClick`).

### Step 1.3 — Pass computed `steps` from ServiceDetailClient

Today the page passes a static `ADMIN_STEPS_SERVICES` constant. Replace with a memoized array that augments each step with `state` and `countBadge` based on Step 1.1's rules.

```ts
const stepsWithState = useMemo<AdminStep[]>(
  () => ADMIN_STEPS_SERVICES.map((step) => {
    const review = sectionReviews.find((r) => r.section_key === step.sectionKeys[0]);
    const pct = computeStepCompletionPct(step, /* … */);
    const state = resolvePillState(review, pct);
    const countBadge = resolveCountBadge(step, state, pct, /* … */);
    return { ...step, state, countBadge };
  }),
  [sectionReviews, /* completion deps */],
);
```

Implement `resolvePillState` and `resolveCountBadge` as small helpers in the same file (or in `src/lib/services/stepState.ts` if cleaner).

### Step 1.4 — Don't break the Review Wizard's step indicator (B-109)

B-109 introduced an in-wizard step indicator. Make sure that wrapper accepts the same `state`/`countBadge` props so the wizard's chrome matches the scroll page. The wizard already uses a different visual treatment (per-step circles); just pass the state through and let its renderer pick its own colors.

### Step 1.5 — Commit + push + CHANGES.md

```
feat: step pills color-coded by readiness state + optional count badge
```

CHANGES.md under `## B-111` → batch 1.

---

## Batch 2 — `Pending` card in the right rail

**Goal:** new right-rail card listing every actionable item, each clickable.

### Step 2.1 — Pending items computation

Create `src/lib/services/computePendingItems.ts`:

```ts
export interface PendingItem {
  id: string;                  // stable id (used as React key + anchor target)
  severity: "critical" | "warning" | "info";
  label: string;               // primary line
  detail?: string;             // secondary line
  // Action: where clicking takes the admin.
  actionType:
    | "scroll_to_section"      // section anchor
    | "scroll_to_profile"      // profile id
    | "open_document"          // document id
    | "open_alert";
  actionPayload: string;
}

export function computePendingItems(input: {
  sectionReviews: ApplicationSectionReview[];
  completionByStep: Record<string, number>;   // step id → pct
  profiles: ClientProfile[];
  documents: ServiceDoc[];
  documentTypes: DocumentType[];
  waivers: WaivedDocumentRequirement[];
  alerts: AutoAlert[];                        // from B-108
  manualAlerts: ServiceAlert[];               // from B-108
}): PendingItem[] {
  const items: PendingItem[] = [];

  // 1. Rejected sections — highest priority.
  for (const r of input.sectionReviews) {
    if (r.status === "rejected") {
      items.push({
        id: `rejected_${r.section_key}`,
        severity: "critical",
        label: `${formatSectionLabel(r.section_key)} — rejected`,
        detail: r.notes ?? undefined,
        actionType: "scroll_to_section",
        actionPayload: `step-${r.section_key}`,
      });
    }
  }

  // 2. Flagged sections — needs attention.
  for (const r of input.sectionReviews) {
    if (r.status === "flagged") {
      items.push({
        id: `flagged_${r.section_key}`,
        severity: "warning",
        label: `${formatSectionLabel(r.section_key)} — flagged`,
        detail: r.notes ?? undefined,
        actionType: "scroll_to_section",
        actionPayload: `step-${r.section_key}`,
      });
    }
  }

  // 3. Incomplete sections (no review yet).
  for (const [stepId, pct] of Object.entries(input.completionByStep)) {
    if (pct < 100) {
      const review = input.sectionReviews.find((r) => r.section_key === stepIdToSectionKey(stepId));
      if (!review || review.status === null) {
        items.push({
          id: `incomplete_${stepId}`,
          severity: "warning",
          label: `${formatStepLabel(stepId)} — ${pct}% complete`,
          detail: undefined,
          actionType: "scroll_to_section",
          actionPayload: stepId,
        });
      }
    }
  }

  // 4. Sections at 100% but not reviewed — ready-for-review pings.
  for (const [stepId, pct] of Object.entries(input.completionByStep)) {
    if (pct === 100) {
      const review = input.sectionReviews.find((r) => r.section_key === stepIdToSectionKey(stepId));
      if (!review) {
        items.push({
          id: `ready_${stepId}`,
          severity: "info",
          label: `${formatStepLabel(stepId)} — ready for review`,
          actionType: "scroll_to_section",
          actionPayload: stepId,
        });
      }
    }
  }

  // 5. Missing required docs (waiver-aware).
  const missingDocCount = computeMissingDocCount(input.documents, input.documentTypes, input.waivers);
  if (missingDocCount > 0) {
    items.push({
      id: "missing_documents",
      severity: "warning",
      label: `${missingDocCount} required document${missingDocCount === 1 ? "" : "s"} missing`,
      actionType: "scroll_to_section",
      actionPayload: "step-documents",
    });
  }

  // 6. Profile-level KYC gaps.
  for (const p of input.profiles) {
    const pct = computeProfileKycPct(p);
    if (pct < 100) {
      items.push({
        id: `profile_kyc_${p.id}`,
        severity: "info",
        label: `${p.full_name} — KYC ${pct}% complete`,
        actionType: "scroll_to_profile",
        actionPayload: p.id,
      });
    }
  }

  // 7. Auto alerts from B-108 (critical/warning severities only — info already covered elsewhere).
  for (const a of input.alerts) {
    if (a.severity === "info") continue;
    items.push({
      id: `auto_alert_${a.key}`,
      severity: a.severity,
      label: a.title,
      detail: a.note,
      actionType: a.sourceEntityType === "document" ? "open_document" : "scroll_to_profile",
      actionPayload: a.sourceEntityId,
    });
  }

  // 8. Open manual alerts from B-108.
  for (const m of input.manualAlerts) {
    if (m.status !== "open") continue;
    items.push({
      id: `manual_alert_${m.id}`,
      severity: m.severity,
      label: m.title,
      detail: m.note ?? undefined,
      actionType: "open_alert",
      actionPayload: m.id,
    });
  }

  // Sort: critical → warning → info, stable within tier.
  const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
  return items.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
```

Helpers (`formatSectionLabel`, `stepIdToSectionKey`, `computeMissingDocCount`, `computeProfileKycPct`) — reuse existing logic from `ServiceDetailClient.tsx` where it already lives; lift into the same `stepState.ts` module if it's reused.

### Step 2.2 — UI: `ServicePendingCard`

File: `src/components/admin/ServicePendingCard.tsx`.

Card structure:

```tsx
<div className="rounded-lg border bg-white p-4 space-y-3">
  <div className="flex items-center justify-between">
    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
      Pending
    </h3>
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">
      {items.length}
    </span>
  </div>

  {items.length === 0 ? (
    <p className="text-sm text-gray-500 italic">All clear — nothing pending.</p>
  ) : (
    <ul className="space-y-1.5 max-h-[60vh] overflow-y-auto">
      {items.map((item) => <PendingRow key={item.id} item={item} onAction={…} />)}
    </ul>
  )}
</div>
```

Each `PendingRow` renders a severity dot (red/amber/blue), the `label`, and the optional `detail` underneath in muted text. The whole row is a button — click triggers the right action via `onAction`:

- `scroll_to_section` → `document.getElementById(payload)?.scrollIntoView({ behavior: "smooth", block: "start" })`
- `scroll_to_profile` → scroll to `#person-card-<profileId>` and expand the card if collapsed
- `open_document` → open the existing `DocumentDetailDialog` for that document
- `open_alert` → open the B-108 `ServiceAlertsDialog` and scroll to that alert id

If the right rail is sticky-height-capped (B-103), the `Pending` card can scroll internally via the `max-h-[60vh] overflow-y-auto` on the list.

### Step 2.3 — Mount in right rail

In `ServiceDetailClient.tsx`, mount `<ServicePendingCard>` near the top of the right-rail column, above existing Status / Milestones cards. It's the highest-priority "what's next" surface.

### Step 2.4 — Stay in sync as data changes

`computePendingItems` is pure. Memoize it with all the dependent props as the dep list. Re-runs on save / waive / etc. — same data flow that drives the rest of the page.

### Step 2.5 — Commit + push + CHANGES.md

```
feat: right-rail Pending card lists every actionable item with one-click drill-down
```

CHANGES.md under `## B-111` → batch 2.

---

## Acceptance criteria

- [ ] `npm run build` clean after each batch
- [ ] Step pills render different colors per state — load a test service with one rejected, one flagged, one reviewed, two incomplete sections and verify visually
- [ ] Step pill count badges show: `40%` for partial completion, `2 missing` for People & KYC with incomplete profiles, `3 missing` for Documents with required types unsent
- [ ] Force-reviewed sections render amber (not green), with the override visible in the pill's hover tooltip
- [ ] Pending card lists items sorted critical → warning → info; clicking each navigates correctly (section scroll / profile expand / document open / alert open)
- [ ] When everything is at 100% + reviewed, Pending card shows "All clear — nothing pending"
- [ ] Pending card updates immediately after a save / waive / mark-reviewed without a page refresh
- [ ] CHANGES.md has two sub-entries under `## B-111`

---

## Tech debt to log

Append to `docs/tech-debt.md`:

- **`computePendingItems` is recomputed on every render.** Memoization keeps it cheap; if profile counts grow into the hundreds per service, lift to a `useMemo` with stable dep references or move to a server-side aggregate.
- **Pending card and Alerts feed overlap.** B-108's auto-alerts (doc expiry, KYC age) appear in both surfaces. Intentional for now (Pending = onboarding checklist + monitoring blockers; Alerts = monitoring history). Revisit if the duplication confuses users.

---

## After both batches

Final commit + push → tell Vanessa: "B-111 done — step pills color-coded + Pending card in right rail." Stop.
