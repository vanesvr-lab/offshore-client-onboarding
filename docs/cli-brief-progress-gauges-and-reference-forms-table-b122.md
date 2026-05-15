# B-122 — Progress meters mini gauges + Reference Forms tabular layout + drop-zone upload

## Goal

Three follow-ups on top of B-119 / B-120, all UX refinements after Vanessa saw the live behavior:

1. **Progress meters — explicit Actions gauge** — today's card shows two aggregate gauges (Completed N/total, Reviewed N/total) and just bumps the `total` denominator when Actions is bound. Vanessa wants Actions surfaced as its own gauge, not buried in the aggregate. Add a third mini gauge labeled "Actions" alongside the existing two, and resize all three down so the card stays compact in the right rail.
2. **Reference Forms tabular layout** — the current card-per-form layout (one block per reference form with Download / Upload buttons) is too tall and hides information. Switch to a 4-column table with icons inline so each form occupies one row.
3. **Upload affordance is misleading** — the bare ↑ icon for "Upload submitted" doesn't read as "click to browse a file"; Vanessa clicked it expecting a file picker. Replace the empty-state cell with a dashed-border drop zone supporting both click-to-browse AND drag-and-drop.

## Context

### Progress meters gauge

The right-rail Progress card lives at `ServiceDetailClient.tsx:6117+` and renders `<ProgressMetersWithState>` which in turn renders `<ServiceProgressMeters>` (B-112). Today's component shows **two** circular gauges:

- "Completed" — count of sections at 100% / total sections
- "Reviewed" — count of sections marked `reviewed` / total sections

B-119 made `total` template-conditional (5 → 6 when Actions is bound), but didn't add a third gauge. So a user looking at the card sees a denominator change but no visual signal that "Actions" is what's being counted.

Vanessa wants three explicit gauges, but smaller, so the card height stays close to today's. CLI: pick a gauge size that fits three across the rail's ~280px width with the existing labels readable.

### Reference Forms tabular layout

`ReferenceFormsPanel` (B-120) renders inside each Action subsection's expanded body. Today's layout shows one `<ReferenceFormRow>` per form as a stacked card — form name + status + Download + Upload buttons + a separate "Submitted: filename or not yet uploaded" block below. Per the screenshot Vanessa shared, this takes a lot of vertical space for what's effectively a list of 1–4 reference forms.

New layout: one row per reference form in a real `<table>` (or grid) with icons inline.

### Upload affordance

Today's "Upload submitted" button is rendered as a small button with an ↑ Lucide icon. Clicking it should open the OS file picker (via a hidden `<input type="file">` and a programmatic click). Vanessa's complaint: the icon doesn't read as "click to browse" — it looks like a generic upload glyph. She wants the empty-state cell to be unambiguous about its purpose AND to support drag-drop in addition to click-to-browse.

## Locked design decisions (from brainstorming)

### Progress meters card — three mini gauges

Replace the two aggregate gauges with **three mini gauges**, in this order:

1. **Completed** — count of all top-level sections at 100% / total
2. **Reviewed** — count of all top-level sections marked `reviewed` in section_reviews / total
3. **Actions** — count of Action subsections at status `done` / total bound Action subsections

Important distinctions to avoid double-counting:

- The Actions step is ALSO one of the top-level sections (B-121). Its contribution to Completed/Reviewed is the **whole-section** state (Actions hits 100% when all its subsections are done). The Actions gauge specifically breaks out the **per-subsection** progress (e.g., 2/4 subsections done).
- Completed and Reviewed totals = number of top-level sections (5 or 6 depending on Actions binding).
- Actions total = number of bound Action subsections (1–4).
- When the template has no action bindings, the Actions gauge does **not** render. Only Completed and Reviewed show, sized at the new mini scale (NOT bumped back up to fill the space — keep them mini for visual consistency across services).

Mini gauge size: target ~64px diameter (down from today's ~96px). Labels stay readable at the smaller size. CLI: snap to the existing gauge component's sizing prop if it has one, else introduce a `size?: 'compact' | 'default'` variant on `ServiceProgressMeters`.

### Reference Forms tabular layout

Replace `<ReferenceFormRow>` with a real table. Columns:

| Column | Content (uploaded state) | Content (empty state) |
|---|---|---|
| **Reference form** | Form name + `👁` (Eye, preview blank) + `↓` (Download, download blank) | Same |
| **Status** | Active / Deactivated chip (existing color treatment) | Same |
| **Submitted file** | Filename + `👁` (preview submitted) + `↓` (download submitted) + `↑` (upload new version — replaces current as latest, old goes to history) | Drop-zone with "Click to browse or drop file" |
| **Submitted date** | Date of latest submission (`12 May 2026`) + small "view history" link when N > 1 | em-dash `—` |

Layout notes:

- Use a `<table>` element (semantic — admins use screen readers occasionally) with `tbody > tr` per form. Tailwind-styled, no separate library.
- Rows are tight (`py-2`, single line per row where possible). Truncate long filenames with `truncate` + tooltip.
- Header row is sticky if the panel grows past ~4 rows; otherwise non-sticky.
- All inline icons are 16px (`h-4 w-4`), in `text-gray-600` neutral, with `hover:text-gray-900` and proper `title` attribute for tooltip on hover.
- The icons in the Reference form column (👁 / ↓ for the blank) and the Submitted file column (👁 / ↓ / ↑ for the submitted) reuse the existing `DocumentPreviewDialog` for previews (no new viewer needed) and the existing signed-URL flow for downloads.

### Submitted file drop-zone (empty state)

When `submitted_file` is null for a given reference form, the **Submitted file** cell renders as a drop zone instead of a button. Visual:

```
┌─────────────────────────────────┐
│  📎  Click to browse or drop file │
└─────────────────────────────────┘
```

- Dashed border (`border-2 border-dashed border-gray-300`), rounded.
- Centered icon + text. `cursor-pointer` on hover.
- Click anywhere in the drop zone → triggers the file picker (programmatically click a hidden `<input type="file">`).
- Drag-over → swap border color to `border-blue-400` + light blue background (`bg-blue-50/50`) to signal "drop here".
- Drop → upload the dropped file as the submitted form. Same endpoint as the click-to-browse path (`POST /api/admin/services/[id]/submitted-forms`).
- Reject non-file drops gracefully; reject obviously wrong file types (only allow `.pdf`, `.png`, `.jpg`, `.docx` — match whatever the existing submitted-form endpoint accepts).

Once a file is uploaded, the cell switches to the "uploaded state" layout (`filename 👁 ↓ ↑`) — no longer a drop zone.

For the "upload a new version" affordance (`↑` in the uploaded state), keep the simple icon button. It does NOT become a drop zone; the empty-state drop zone is specifically the "no submitted file yet" treatment. Replacing an existing submission is a more deliberate action, so a button is appropriate.

## In scope

- All three items above.
- The mini-gauge variant on `ServiceProgressMeters` (or a separate `MiniGauge` if cleaner).
- The Reference Forms table refactor (`ReferenceFormsPanel` rewrite).
- The drop-zone component for the empty-state Submitted file cell.

## Out of scope

- **Drag-drop on reference-form blank uploads** (the settings page). The drop-zone is specifically for submitted-form uploads inside the Action subsection panel. The library upload modal stays click-only.
- **Per-row sort / filter** on the reference forms table. Rows are listed in `sort_order` (existing).
- **Sticky table header** unless rows exceed 4 (rarely the case in practice). CLI implements the threshold pragmatically.
- **Inline editing of any reference-form field** in the table (name, version_label, source_url). Editing stays in the library settings page.
- **Custom preview viewer for `.docx`** — DocumentPreviewDialog's existing handling is sufficient; if it can't render a `.docx` inline, the preview button just downloads. No new viewer in this brief.

## Implementation — batched

Each batch ends with: stage specific files (never `git add -A` or `git add .`), commit with a descriptive message (no `B-122` in the commit message), `git push origin HEAD:main` (worktree session — main is the only branch CLI pulls), update `CHANGES.md` with the batch outcome.

### Batch 1 — Mini gauges + Actions gauge

`src/components/admin/ServiceProgressMeters.tsx`:

- Add a `size?: 'compact' | 'default'` prop (default to `'default'` for backward compatibility). At `'compact'`, gauge diameter is ~64px and labels use `text-xs` instead of `text-sm`.
- Accept a third gauge input. Either:
  - Add a third optional input pair: `actionsCount?: number`, `actionsTotal?: number`. When both are defined and `actionsTotal > 0`, render the third gauge labeled "Actions". When undefined or `actionsTotal === 0`, don't render the third gauge.
  - OR refactor the prop shape to accept an array of `{count, total, label}` so future additions don't require new props each time. CLI picks the cleaner option.

`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`:

- In `ProgressMetersWithState` (around line 3986), compute:
  - `completedCount` = sections at 100% (same as today)
  - `reviewedCount` = sections marked reviewed in section_reviews (same as today)
  - **NEW:** `actionsDoneCount` and `actionsTotalCount` — derived from the bound action subsections (look at `actions` state in the parent or recompute from `service_actions` records where status='done').
- Pass `size="compact"` plus the new actions props down to `<ServiceProgressMeters>`.

Visual verification: open `/admin/services/<gbc-id>` (template with Actions bound) and confirm three mini gauges fit horizontally in the right rail without overflow. Then open a service whose template has NO action bindings and confirm only two mini gauges render (Completed + Reviewed), still at the compact size.

No migration in this batch.

### Batch 2 — Reference Forms tabular layout

Rewrite `src/components/admin/actions/ReferenceFormsPanel.tsx`:

- Replace the existing `<ReferenceFormRow>` mapping with a `<table>` element. Header row with the four column labels (Reference form / Status / Submitted file / Submitted date).
- Each `<tr>` corresponds to one `reference_forms` row.
- Cells render per the table in "Locked design decisions" above. Inline icons reuse existing handlers from `ReferenceFormRow` — minimal logic change, mostly layout shift.

Icon helpers — keep the click handlers identical to today:

- `👁` (Eye) on the Reference form column → opens `DocumentPreviewDialog` for the blank template.
- `↓` (Download) on the Reference form column → triggers the signed-URL download for the blank.
- `👁` (Eye) on the Submitted file column → opens `DocumentPreviewDialog` for the submitted file.
- `↓` (Download) on the Submitted file column → signed-URL download for the submitted file.
- `↑` (Upload, ArrowUpFromLine or similar) on the Submitted file column → opens the file picker to upload a NEW version (replaces current; old goes to history).

History affordance — the "view history" link in the Submitted date column opens a small popover or modal listing past submissions (date + filename + uploader + per-row preview + download). Reuse existing patterns; don't introduce a new dialog component if `DocumentPreviewDialog` or another existing dialog can be repurposed.

Edge cases:

- Empty list (no reference forms attached): render nothing (existing behavior; don't show an empty table).
- One-row list: still render the table headers — visual consistency matters more than space savings at the single-row case.
- Long filenames: `truncate` with `title` attribute carrying the full filename for hover preview.

No migration in this batch.

### Batch 3 — Drop-zone for empty submitted-file cell

Build `src/components/admin/actions/SubmittedFileDropZone.tsx`:

- Renders the dashed-border, click-or-drop cell described above.
- Props: `serviceId`, `actionKey`, `referenceFormId`, `onUploaded(submittedFormRow)`. On successful upload (drop or browse), calls `onUploaded` so the parent can splice the new row into local state and switch the cell to the uploaded layout.
- Uses a hidden `<input type="file" accept=".pdf,.png,.jpg,.docx">` and triggers its click on cell click.
- Drag handlers: `onDragEnter` / `onDragOver` (highlight), `onDragLeave` (un-highlight), `onDrop` (validate file type, upload).
- Loading state: while upload is in-flight, swap to a spinner + "Uploading…" text. Disable click/drop during upload.
- Error state: on failure, show toast.error with the server message (`/api/admin/services/[id]/submitted-forms` already returns a JSON error). Cell returns to drop-zone state.

Wire it into `ReferenceFormsPanel`'s Submitted file column — render `<SubmittedFileDropZone>` when no submitted file exists, the filename-with-icons row otherwise.

Add a small Playwright or integration test:

- Drop a file onto an empty submitted cell → row updates to filename + icons + date.
- Upload a new version via the `↑` icon → old file moves to history (verify via the GET endpoint returning the historical row).

No migration in this batch.

## Database changes

None. This brief is pure UI/UX on top of existing schemas.

## Testing

- Unit: gauge component renders correct number of gauges based on `actionsTotal` presence.
- Unit: drop zone validates file types client-side (reject `.exe` etc.).
- Integration: existing reference-forms list endpoint already covers the API surface; no new endpoints.
- Manual / visual: open `/admin/services/<gbc-id>` and verify three mini gauges fit in the rail without overflow; open `/admin/services/<trust-id>` and verify two mini gauges; verify the Reference Forms panel renders as a table; drop a file onto an empty Submitted file cell and confirm upload.

## Tech-debt notes

Append to `docs/tech-debt.md` (newest at top) after Batch 3:

- The drop zone is specific to the submitted-form upload context. If we add more "upload a file here" surfaces (e.g., the reference-form library upload modal or a future bulk-doc-upload feature), refactor `SubmittedFileDropZone` into a generic `<FileDropZone>` with a slot for the upload endpoint and accepted MIME types.
- The Progress Meters card has three mini gauges; if section counts expand further (e.g., new top-level section), revisit whether three remains the right shape or we should switch to a single horizontal bar with section breakdowns.
- The Reference Forms table is rendered with a manual `<table>` rather than a reusable `DataTable` component. If we add more admin tables of similar shape (which we probably will — e.g., audit log views), extract a shared `DataTable` and migrate.

## End-of-brief checklist for CLI

After Batch 3 commits and pushes:

1. Confirm `git status` is clean and `git status -sb` says up-to-date with `origin/main`.
2. Confirm CHANGES.md tail has one entry per batch with the right date.
3. Run the dev-server reset from the **main project root** (not the worktree — `.env.local` only lives at the project root):
   ```
   cd /Users/elaris/Documents/Claude_webapp_client_onboarding && pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. One-line chat summary back to Vanessa: "B-122 done — Actions gauge + Reference Forms table + drop-zone upload. 3 batches committed, no migrations."

## Worktree note

This brief was written in worktree `stupefied-bhabha-fb0c3f`. All commits during execution must land on `origin/main` via `git push origin HEAD:main` — CLI only pulls main. Do not push to the worktree branch.
