# B-123 — Modal sizing polish (Communications list + Reference form preview)

## Goal

Two small UX fixes on modals that today are too small for their content:

1. **"View All" Communications list dialog** — even after B-121's `max-w-7xl` bump and B-122's body-preview column, a horizontal scrollbar still appears inside the modal because the body-preview column is wide (384px) and squeezes the other columns. Rebalance the column widths so all columns fit at the existing max-width, and add a native horizontal resize handle so admin can widen further on large displays if they want.
2. **Reference form preview modal (`DocumentPreviewDialog`)** — when admin previews a reference form (FSC checklist, registration form, etc.), the modal is small and clips most of the document. Make the default size larger and add a two-axis resize handle so admin can adjust both width and height to read long forms comfortably.

## Context

### Communications list modal

`ServiceCommunicationsDialog.tsx:96` — the "View All" list dialog uses `max-w-7xl w-[min(100vw-2rem,80rem)]` so it caps at 1280px (or viewport minus 32px on smaller screens). On a 1440px laptop it's already ~89% of viewport. The scrollbar Vanessa sees in the screenshot is NOT from the modal being too narrow — it's from the internal column widths summing to more than the modal can hold.

Inspection: `ServiceCommunicationsDialog.tsx:178` shows one column with `max-w-[24rem]` (384px), which is most likely the body preview. Plus full-width sender (~180–220px), full-width recipient (~250+px), subject (~250px), date (~140px) — easily over 1280px combined.

The fix: shrink body preview, give other columns less per-column max but enough to show the meaningful information without truncation, total ≤ 1150px so everything fits with breathing room.

### Reference form preview modal

`DocumentPreviewDialog` is shared across the project (admin doc viewer, KYC doc preview, reference-form blank preview, submitted-form preview). Today's sizing makes sense for a small image/ID document but not for a multi-page PDF. Vanessa's screenshot shows FORM A — A CHECKLIST FOR GBC APPLICATION rendered in roughly a 600×400 viewport which clips the entire upper half of the document.

Both axes need to grow. Default size needs to be bigger. Native `resize: both` lets admin adjust per-document for long forms.

## Locked design decisions (from brainstorming)

### Communications list — column rebalance + horizontal resize

**Column widths (target):**

| Column | Today | Target |
|---|---|---|
| DATE | (no explicit max) | `w-[9rem]` (144px) |
| SENT BY | (no explicit max) | `w-[11rem]` (176px) |
| TO | (no explicit max) | `w-[14rem]` (224px) |
| SUBJECT | (no explicit max) | `max-w-[14rem]` (224px), `truncate` + `title` tooltip |
| BODY PREVIEW | `max-w-[24rem]` (384px) | `max-w-[12rem]` (192px), `truncate` + `title` tooltip |

Sum ≈ 960px + cell padding (~6px × 5 columns = 30px) + container padding (~32px) = ~1022px. Comfortably under the 1280px max-w-7xl cap, so no horizontal scroll under normal conditions.

CLI to confirm by inspecting the existing cell rendering — column ordering may differ from the screenshot's left-to-right read. Match the column widths to the actual cell elements regardless of order.

**Horizontal resize handle:**

- Add to the `DialogContent` className: `resize-x overflow-auto min-w-[60rem]`.
- Tailwind has `resize-x` for `resize: horizontal`. If the project's Tailwind config doesn't include it, add an inline style or extend tailwind.config. Most modern Tailwind setups have it; verify before assuming.
- `overflow-auto` is required for the resize handle to appear in browsers.
- `min-w-[60rem]` (960px) prevents admin from collapsing the modal narrower than the column widths can render. The existing `max-w-7xl` cap stays (admin can grow horizontally beyond it via the resize handle, since native `resize` is not constrained by `max-width`).
- No localStorage persistence — resets on close. If admin reopens later they get the default width again.
- Vertical sizing: unchanged. The list scrolls vertically as today.

### Reference form preview — both-axis resize + larger default

`DocumentPreviewDialog` lives at a shared path (CLI to locate; probably `src/components/admin/DocumentPreviewDialog.tsx`).

**Default size:**

- Change `DialogContent`'s width class from whatever it is today to `max-w-7xl w-[min(100vw-2rem,80rem)]` (same as Communications list).
- Add an explicit height: `h-[80vh] max-h-[80vh]`. 80% of the viewport height by default.
- The inner content (PDF iframe / image) needs to fill the available height — add `h-full` or `flex-1` on its container if not already.

**Resize handle (both axes):**

- Add to `DialogContent` className: `resize overflow-auto min-w-[60rem] min-h-[40rem]`.
- `resize` (without `-x` or `-y`) gives both axes.
- Mins: 60rem (960px) wide × 40rem (640px) tall — enough to read a typical form without it being a postage stamp.
- The shadcn `DialogContent` is typically fixed-positioned and centered; verify the resize handle still works in that mode (it should — `resize` works on any element with `overflow` set). If the centering math fights the resize, fall back to `position: relative` for the modal-inner-wrapper while keeping the overlay fixed.
- No localStorage persistence.

### Important: shared component impact

`DocumentPreviewDialog` is shared. Sizing changes affect every caller:
- Admin doc viewer (KYC document detail dialog)
- AI document viewer (admin applications [id] documents [docId] page)
- KYC long-form field provenance preview (B-070 / B-074 / B-117)
- Reference-form blank preview (B-120)
- Submitted-form preview (B-122)

Vanessa's primary use case is the reference-form preview, but bigger-default-size will improve all of them. If a specific caller needs a smaller preview (e.g., the inline KYC field-provenance click), they can pass a `size` prop variant — but this brief assumes the new bigger size is acceptable everywhere. **CLI: if any caller looks weird with the new default size, add a `size?: 'compact' | 'default'` prop and only the reference-form preview opts into the new larger size.** Default to applying the new size everywhere first; only narrow if a specific call site breaks visually.

## In scope

- Column-width rebalancing in the Communications list dialog.
- Horizontal resize handle on the Communications list dialog.
- Default size bump + both-axis resize handle on `DocumentPreviewDialog`.

## Out of scope

- Persistence of user's chosen modal size (localStorage / per-admin preference).
- Adding new columns to the Communications list.
- Changing the inner content of `DocumentPreviewDialog` (PDF rendering library, image zoom, etc.).
- Touching other modals beyond these two.

## Implementation — batched

Single batch (all changes are small and on adjacent components).

### Batch 1 — Modal sizing polish

**Files:**

- `src/components/admin/ServiceCommunicationsDialog.tsx` — locate the "View All" list dialog block (search for `max-w-7xl` around line 96). Update the column widths inline in the table render. Add `resize-x overflow-auto min-w-[60rem]` to the DialogContent className.
- `src/components/admin/DocumentPreviewDialog.tsx` (or wherever the shared preview dialog lives — CLI greps for `DocumentPreviewDialog` declaration). Update default size + add resize handle per the spec above.

**Order of work:**

1. Communications list — column rebalance first (smaller, contained change). Verify no horizontal scroll on a 1280px-cap modal after the column widths land.
2. Communications list — add the horizontal resize handle.
3. DocumentPreviewDialog — bump default size + add `resize` handle. Verify each caller still looks reasonable; if one breaks, introduce the `size` variant prop noted above.

**Manual verification:**

- Open `/admin/services/<gbc-id>`, click "View All" on the Communications card → confirm no horizontal scrollbar at the default modal size on a typical 1440px display. Drag the bottom-right corner to widen → modal grows past 1280px.
- Open any document preview (reference form blank in the action panel, or click any doc in the KYC review) → confirm default size shows the document at readable scale. Drag the corner to grow both ways.
- Visit each of the other `DocumentPreviewDialog` callers (KYC doc detail, AI viewer, field-provenance preview) → confirm none of them look broken at the new bigger default.

**No tests required** — these are pure CSS/sizing tweaks. If CLI wants to add a snapshot test for the new className, that's a bonus.

## Database changes

None.

## Tech-debt notes

Append to `docs/tech-debt.md` (newest at top) after the batch:

- Modal sizing has no persistence (admin's chosen size resets when modal closes). If admins find themselves repeatedly resizing in the same session, add localStorage persistence keyed on the dialog name.
- `DocumentPreviewDialog` is shared across many callers with one default size. If site-by-site sizing becomes a need, formalize the `size?: 'compact' | 'default' | 'large'` variant prop and migrate call sites.

## End-of-brief checklist for CLI

After the batch commits and pushes:

1. Confirm `git status` is clean and `git status -sb` says up-to-date with `origin/main`.
2. Confirm CHANGES.md tail has the batch entry with the right date.
3. Run the dev-server reset from the **main project root** (not the worktree — `.env.local` only lives at the project root):
   ```
   cd /Users/elaris/Documents/Claude_webapp_client_onboarding && pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. One-line chat summary back to Vanessa: "B-123 done — Communications list column rebalance + Reference form preview bigger/resizable."

## Worktree note

This brief was written in worktree `stupefied-bhabha-fb0c3f`. All commits during execution must land on `origin/main` via `git push origin HEAD:main` — CLI only pulls main. Do not push to the worktree branch.
