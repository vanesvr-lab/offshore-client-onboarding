# CLI Brief — B-110 Force Review When Section Is Incomplete

**Status:** Hold until B-109 lands
**Estimated batches:** 1
**Touches migrations:** Yes (one column on `application_section_reviews`)
**Touches API:** Yes (section-reviews POST)
**Touches AI verification:** No
**Builds on:** B-068/B-098 (section review feature), B-109 (which wires the wizard's Mark-as-Reviewed into `SectionReviewPanel`)

---

## Hold rule

Do not start until commit `feat: …per-profile sub-wizard…` (B-109 batch 3) is on `origin/main`. B-109 batch 1 finishes wiring `SectionReviewPanel` into the wizard; B-110 edits the panel itself. Hold avoids merge conflicts.

---

## Why this batch exists

When admin marks a section `reviewed` on `/admin/services/[id]` (either inline `Review` button or the wizard's `Mark as Reviewed`), the action goes through with no friction even if the section is incomplete (e.g. some required fields blank). There's no audit trail of *why* admin overrode the incomplete state.

Vanessa's rule: when admin selects status `reviewed` AND the section's completion is < 100%, the dialog must require:

1. A `Force review (section is incomplete)` checkbox — explicit acknowledgment of override.
2. A non-empty `Notes` field — record of *why* the override is acceptable.

Both required to enable Save. The choice is persisted on `application_section_reviews.force_reviewed` so the audit trail shows the override happened.

When the section is complete (≥ 100%), the existing flow applies unchanged (notes optional on `reviewed`, required only on `flagged` / `rejected`).

---

## Hard rules

1. **One batch.** Commit + `git push origin HEAD:main` + CHANGES.md.
2. `npm run build` clean.
3. **Migration**: `npm run db:push` + `npm run db:status`.
4. **No `as any`.**
5. **Don't restart the dev server.**

---

## Step 1 — Migration

File: `supabase/migrations/<timestamp>_section_review_force_reviewed.sql`.

```sql
ALTER TABLE public.application_section_reviews
  ADD COLUMN IF NOT EXISTS force_reviewed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.application_section_reviews.force_reviewed IS
  'B-110 — true when admin marked a section reviewed despite incomplete fields. Forces a notes-required + override-checkbox flow in SectionReviewPanel.';
```

Run `npm run db:push` + `npm run db:status`. Clean.

Update `ApplicationSectionReview` in `src/types/index.ts` to include `force_reviewed: boolean`.

---

## Step 2 — API: accept + validate `force_reviewed`

File: `src/app/api/admin/applications/[id]/section-reviews/route.ts`.

- Extend the POST body type to add `force_reviewed?: boolean` (default `false`).
- Validation rules (return 400 with a clear message if violated):
  - If `status === 'reviewed'` AND `force_reviewed === true` AND `notes` empty (or whitespace) → 400 with `error: "Notes are required when force-reviewing an incomplete section."`
  - Existing rule unchanged: if `status` is `flagged` or `rejected` and `notes` empty → 400.
- Persist `force_reviewed` on insert.
- Surface it on the returned row.
- Audit log: include `force_reviewed` in `detail.metadata` so the trail shows the override happened.

---

## Step 3 — `SectionReviewPanel` UI

File: [`src/components/admin/SectionReviewPanel.tsx`](src/components/admin/SectionReviewPanel.tsx).

### Step 3.1 — New prop

```ts
interface Props {
  // … existing
  /**
   * When true, the parent considers this section incomplete (completion < 100%).
   * Drives the Force review checkbox + required notes when admin chooses `reviewed`.
   */
  sectionIncomplete?: boolean;
}
```

Default `false` (existing call sites that don't pass it keep working unchanged — they implicitly treat the section as complete).

### Step 3.2 — Local state

```ts
const [forceReview, setForceReview] = useState(false);
useEffect(() => {
  if (open) {
    setStatus(null);
    setNotes("");
    setForceReview(false);
  }
}, [open]);
```

### Step 3.3 — Render the override checkbox conditionally

After the status picker grid, before the Notes textarea — show an inline warning card ONLY when `status === "reviewed"` and `sectionIncomplete`:

```tsx
{status === "reviewed" && sectionIncomplete && (
  <div className="mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2">
    <p className="text-sm font-medium text-amber-900">
      This section is incomplete
    </p>
    <p className="text-xs text-amber-700">
      Some required fields are blank. To mark this section reviewed
      anyway, confirm the override and explain why in the notes below.
    </p>
    <label className="inline-flex items-center gap-2 text-sm font-medium text-amber-900 cursor-pointer">
      <input
        type="checkbox"
        checked={forceReview}
        onChange={(e) => setForceReview(e.target.checked)}
        className="h-4 w-4 rounded border-amber-400 text-amber-700 focus:ring-amber-500"
      />
      Force review (section is incomplete)
    </label>
  </div>
)}
```

### Step 3.4 — Compute `notesRequired` + `canSave`

Replace the existing `notesRequired`:

```ts
const isForceReviewPath =
  status === "reviewed" && sectionIncomplete;
const notesRequired =
  status === "flagged" || status === "rejected" || isForceReviewPath;
const canSave =
  !!status &&
  !saving &&
  (!notesRequired || notes.trim().length > 0) &&
  (!isForceReviewPath || forceReview);
```

The `notes` label "(optional)" / "*" rendering already keys off `notesRequired` — no change needed.

### Step 3.5 — POST `force_reviewed` in the save handler

In `handleSave`, extend the body:

```ts
body: JSON.stringify({
  section_key: sectionKey,
  status,
  notes: notes.trim() || null,
  force_reviewed: isForceReviewPath && forceReview ? true : false,
}),
```

The server will 400 if validation fails; existing toast surfacing handles the error.

---

## Step 4 — Thread `sectionIncomplete` from every call site

Every place that mounts `<SectionReviewPanel>` (or `<SectionReviewButton>`, which wraps it) needs to compute and pass the flag.

`grep -rn "SectionReviewPanel\|SectionReviewButton" src/` will list them. Expected call sites:

- `ServiceDetailClient.tsx` line ~1199 — the inline `SectionReviewButton` rendered inside `KycLongFormSection`. Pass `sectionIncomplete = sectionCompletionPct < 100` using the same completion data that drives the per-section pct chip on that header.
- The wizard's `Mark as Reviewed` dialog wiring from B-109 batch 1 — pass `sectionIncomplete` based on the current step's completion. The step-level pct already exists for the form steps (Company Setup, Financial, Banking) + People & KYC + Documents.
- Per-profile sub-wizard from B-109 batch 3 (`AdminPerProfileReviewWizard`) — pass `sectionIncomplete = profileSubStepPct < 100` for the sub-step's section.
- `SectionReviewButton` — propagate the prop through (`sectionIncomplete?: boolean` → forwarded to `SectionReviewPanel`).

For the inline buttons that already have a completion percentage in scope (every section card on the scroll page shows one), this is a one-line addition per call site. For sub-wizard substeps, reuse the same per-section completion data that the existing pct chip uses.

If a particular call site doesn't have a completion concept (e.g. `Internal Notes` or `Risk Assessment` — these aren't "sectioned" the same way), omit the prop entirely; default `false` keeps the existing flow.

---

## Step 5 — Commit + push + CHANGES.md

```
feat: SectionReviewPanel requires Force review checkbox + notes when admin marks an incomplete section reviewed
```

CHANGES.md under `## B-110`:

```
## B-110 — Force review on incomplete section (done <date>)

- Migration `<timestamp>_section_review_force_reviewed.sql` adds `force_reviewed boolean NOT NULL DEFAULT false` on `application_section_reviews`. `db:push` + `db:status` clean.
- `/api/admin/applications/[id]/section-reviews` POST accepts + validates `force_reviewed`. Notes required when `force_reviewed === true`. Audit detail surfaces the flag.
- `SectionReviewPanel` shows a Force review override card with checkbox + required notes when status=`reviewed` AND parent passes `sectionIncomplete = true`. Existing flow (notes optional for clean `reviewed`, notes required for `flagged`/`rejected`) unchanged.
- Every existing call site of `SectionReviewPanel`/`SectionReviewButton` threads `sectionIncomplete` computed from the same per-section completion percentage the page already renders.
```

---

## Acceptance criteria

- [ ] `npm run build` clean
- [ ] `npm run db:status` clean
- [ ] On a section with completion < 100%, opening the review dialog and selecting `Reviewed` shows the amber Force-review card with checkbox + makes Notes required; Save disabled until both filled
- [ ] On a section at 100%, the Force-review card does not appear; Save enabled on Reviewed with no notes (existing behaviour)
- [ ] Selecting `Flagged` or `Rejected` requires notes regardless of completion (existing behaviour, unchanged)
- [ ] DB row written after a forced review has `force_reviewed = true` and a non-null notes value
- [ ] `audit_log` row's detail metadata includes `force_reviewed: true` when applicable
- [ ] Trying to POST `{ status: 'reviewed', force_reviewed: true, notes: '' }` returns 400 with a clear error
- [ ] CHANGES.md has a single B-110 entry

---

## After the batch

Final commit + push → tell Vanessa one line: "B-110 done — force-review checkbox + required notes when section is incomplete." Stop.
