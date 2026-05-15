# B-124 — Review Requests card tabular layout + Milestones card redesign

## Goal

Two right-rail cards take more vertical space than the information they convey warrants. Compress both so more of the rail fits on screen without scrolling:

1. **Review Requests card (B-118)** — replace card-per-request body with a tight 3-column table. Closed history moves out of an inline collapsed list into its own popup. Detail modal is now opened via an explicit view button instead of an implicit row click.
2. **Milestones card** — redesign from row-per-milestone (with set/clear/edit controls visible) into a 3-column side-by-side layout (LOE / INV / PAY) showing label on top and ✓+date or em-dash below. Inline popover for editing. Card adopts the standard `border rounded-xl` treatment to match the rest of the rail.

## Context

### Review Requests card today (B-118)

`ReviewRequestsCard` renders in the right rail above the Pending card. Each open request is its own block showing requester / time / reviewer chips / section count / status pill / action button. Click anywhere on the row opens a detail dialog. Closed history is a collapsible fold at the bottom of the card.

Problem: each open request takes ~80–120px of vertical space. Two open requests + the collapsed-but-present closed history label fill most of the rail's natural height before scrolling kicks in.

### Milestones card today

`milestones` state lives in `ServiceDetailClient.tsx:4402+`. The right-rail rendering (search for "MILESTONES" or the related JSX block) shows each milestone (LOE / Invoice / Payment / etc.) as its own row with full label + status + date + controls. Even after B-119's "compact layout" pass, each milestone still occupies its own vertical row. Plus the card's outer wrapper doesn't match the other rail cards' `border rounded-xl bg-white` treatment, so it looks visually different.

Vanessa wants all three core milestones (LOE / Invoice / Payment) on essentially one line of content inside the card, with the card itself styled like the rest of the rail.

## Locked design decisions (from brainstorming)

### Review Requests card — 3-column tabular

**Header** (unchanged structure, two affordances side-by-side):

- Existing "Request Peer/Manager Review" button — opens the create-request modal (B-118).
- **New:** "View closed history (N)" text link, where N = count of closed requests for this service. Clicking opens a popup listing closed requests.

**Body** — `<table>` with 3 columns:

| Column | Content |
|---|---|
| **Requester** | Requester display name (or "You" if current admin is the requester) + relative time underneath in `text-xs text-gray-500` (e.g., "Vanessa · 2h ago"). |
| **Reviewers + sections** | `{N} reviewers · {M} sections` with reviewer names shown on hover via a `title` tooltip. Compact, no chips. |
| **Actions** | Two icons / mini-buttons inline: `👁` (Eye, view) and contextual second affordance — for the requester it's `X` (close); for an invited reviewer it's `✓` (mark as reviewed). The current implicit row click does NOT trigger anything anymore — explicit button only. |

Row height target: ~36px. The whole open list should fit in 2–3 rows of card height for typical usage (1–2 open requests).

If there are zero open requests, render `"No open review requests"` in the body and keep the header affordances visible (so admin can still create one or view history).

### Detail modal — reuse existing

Clicking 👁 opens the same detail dialog B-118 built (note text + full section list with anchor links + close button if permitted + audit timestamps). No new modal; no rewrite of the dialog content. Just rewire the trigger from "row click" → "eye-icon click".

### Closed history popup

A new dialog component (or a variant of the existing one — CLI picks the cleaner approach). Triggered by the header link. Contents:

- Title: "Closed review requests"
- A table with columns: Requester · Reviewers + sections · Closed by · Closed at · Reason · `👁` view
- Sort: most recent first
- Paginated or capped at 50 — CLI: if there's an existing pattern for this in the project, use it; otherwise just cap at 50 with a "Showing 50 of N" footer if N > 50.
- Same 👁 click → opens the existing B-118 detail modal (the modal already handles closed requests correctly).

### Milestones card redesign

Card wrapper: `bg-white border rounded-xl px-4 py-3` to match the other rail cards (Status, Pending, Communications). No more visual outlier.

Body — three columns side-by-side:

```
┌──────────────────────────────────────┐
│ MILESTONES                           │
│  LOE       INV       PAY             │
│  ✓ 12 May  —         —               │
└──────────────────────────────────────┘
```

- Header row: small `text-xs font-semibold text-gray-500 uppercase tracking-wider` label "MILESTONES" (matches the visual rhythm of the Status card header).
- Column header row: three equal-width cells. Labels: "LOE", "INV", "PAY". `text-xs text-gray-500 text-center` (or `text-left`, CLI picks based on visual balance).
- Status row: three equal-width cells. When set: `✓` in `text-emerald-600` + the date in a short format ("12 May" — strip the year unless the year differs from current). When unset: em-dash `—` in `text-gray-400` centered.
- Click any column (the whole cell) → open an inline popover (anchored to the cell) with the existing milestone controls: a date picker for setting/editing, "Mark complete" toggle, "Clear" button. Save closes the popover and re-renders the cell.

For "edit" of an already-set milestone: the same popover opens, pre-filled with the existing date. Save updates; Clear unsets.

CLI: the LOE-INV-PAY trio is what the current data model exposes. If there are additional milestone columns (e.g., `loe_signed_at`, `engagement_letter_at`), keep them OUT of the new layout — they can come back as a "more milestones" disclosure if she asks later. This brief is explicitly about the LOE / INV / PAY trio.

### Other rail cards — no change

This brief touches only the Review Requests card and the Milestones card. Status, Pending, Communications, Audit Trail, Progress Meters, View Summary stay as they are.

## In scope

- Review Requests card body rewrite (3-column table + 👁 view button + closed history link in header).
- New "Closed review requests" popup dialog.
- Milestones card redesign (3-column side-by-side, standard card wrapper, inline edit popover).

## Out of scope

- New milestones beyond LOE / INV / PAY (audit-letter-sent / engagement-letter-received / etc. — keep them in the existing data model but don't render in the new card).
- Editing the underlying milestone field set on `services` (no schema change).
- Renaming review-request statuses or changing the close workflow from B-118.
- Touching any other right-rail card.

## Implementation — batched

Single batch — both cards are small UI changes on the right rail. Commit together so the rail's visual rhythm changes as one unit.

### Batch 1 — Review Requests tabular + Milestones redesign

**Files (non-exhaustive):**

- `src/components/admin/ReviewRequestsCard.tsx` (B-118) — rewrite body as `<table>`. Add header link "View closed history (N)" alongside the existing trigger button.
- Possibly new: `src/components/admin/ReviewRequestsClosedHistoryDialog.tsx` — if the closed history popup warrants its own component. Alternatively, render in-line inside `ReviewRequestsCard.tsx` if it's <100 lines.
- Whatever component renders the right-rail Milestones block — CLI greps for "MILESTONES" in `ServiceDetailClient.tsx` (likely an inline JSX block since the milestones state lives in the parent). Extract to `src/components/admin/MilestonesCard.tsx` if not already extracted, or rewrite in place.
- `MilestonesCard` (or the inline equivalent) needs to import or reuse the existing milestone-edit popover logic if any. If today's edit affordance is inline buttons + date inputs, build a small `<MilestoneEditPopover>` that wraps the existing PATCH endpoint.

**Order of work within the batch:**

1. Review Requests card tabular rewrite — biggest change, do first.
2. Closed history popup wiring.
3. Milestones card redesign (smaller change, easier verification).

**Manual verification:**

- Open `/admin/services/<gbc-id>` with at least one open review request → confirm the Review Requests card body shows the new 3-column table, eye click opens the detail dialog, the close/mark-reviewed icon works.
- Confirm closed history link in the header opens the new popup with the right rows.
- Confirm the Milestones card renders with the new 3-column layout, the standard `border rounded-xl` wrapper, and the click-to-popover edit flow works for each milestone.
- Right rail overall — should be noticeably shorter than before. If both cards drop ~80px combined, the rail's natural height matches or exceeds the viewport less often.

## Database changes

None. Pure UI refactor on existing data shapes.

## Testing

- Unit / integration on the new Review Requests card row rendering (B-118 tests should still pass; add coverage for the new view-button click → modal-open path and for the closed-history popup).
- Manual visual check per "Manual verification" above.

## Tech-debt notes

Append to `docs/tech-debt.md` (newest at top) after the batch:

- Closed review requests popup is paginated/capped at 50 (or 100 — CLI to pick). If services accumulate many review requests over time, add real pagination.
- The Milestones card hides any milestones beyond LOE / INV / PAY. If we add new milestones (audit letter, engagement letter, etc.), this card will need to either expand horizontally (more columns), add a "more" disclosure, or move to a vertical layout for >3 milestones.
- The right-rail layout has evolved through B-091 / B-111 / B-112 / B-118 / B-119 / B-120 / B-121 / B-123 / B-124. Once it stabilizes, extract a `<RightRail>` component with a typed prop for ordered card slots, so future reorders are a one-line config change instead of a JSX shuffle.

## End-of-brief checklist for CLI

After the batch commits and pushes:

1. Confirm `git status` is clean and `git status -sb` says up-to-date with `origin/main`.
2. Confirm CHANGES.md tail has the batch entry with the right date.
3. Run the dev-server reset from the **main project root** (not the worktree — `.env.local` only lives at the project root):
   ```
   cd /Users/elaris/Documents/Claude_webapp_client_onboarding && pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. One-line chat summary back to Vanessa: "B-124 done — Review Requests tabular + Milestones redesign. Right rail noticeably shorter."

## Worktree note

This brief was written in worktree `stupefied-bhabha-fb0c3f`. All commits during execution must land on `origin/main` via `git push origin HEAD:main` — CLI only pulls main. Do not push to the worktree branch.
