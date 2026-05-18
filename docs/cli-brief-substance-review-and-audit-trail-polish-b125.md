# B-125 — Substance Review buttons fix + local director count fix + Milestones polish + Audit Trail enhancements

## Goal

Two bug fixes plus two UI polish passes, ordered so the critical bugs ship first:

1. **Bug: Substance Review buttons broken** — clicking yes/no/unknown answers in the Substance Review subsection opens a non-rendering page instead of saving the value to the DB. The button behaves like a hash anchor (URL ends with `#:text=Yes` text-fragment artifact), suggesting the click is hitting an `<a href="#">` or a button with a missing onClick handler. Wire each option to an inline PATCH that persists the answer to `service_substance` (or wherever the substance answers live) — no navigation, no fragment change.
2. **Bug: Local director count always 0** — the People & KYC header chip shows "2 DIRECTORS · 0 LOCAL" even when one of the directors (e.g., Bruce Banner) clearly has the "Local Director" badge. Root cause is two divergent data paths: the badge uses `passport_country === "MUS"`; the count uses `client_profile_kyc.is_local_resident_director` (a manually-managed flag that defaults to false). Unify the count to use the same logic as the badge.
3. **Milestones card polish** — labels should be spelled out ("Letter of Engagement" / "Invoice" / "Payment Received"), dates should include the year, and a calendar icon should appear next to each date to signal editability.
4. **Audit Trail card enhancements** — apply the standard `border rounded-xl` card wrapper (carry-over from B-121 that didn't land for this card), add a CSV download button, add a date range filter (presets: Today / 7 days / 30 days / All time + Custom), and switch from "Nd ago" to a full absolute date once the entry is older than 3 days.

## Context

### Substance Review buttons

The screenshot Vanessa shared lands on `https://offshore-client-onboarding.vercel.app/admin/services/<id>#:text=Yes`. The `#:text=Yes` is a Chrome text-fragment artifact — clicking the "Yes" option behaves like a navigation to a hash anchor. The page itself doesn't render anything because the URL fragment doesn't match a real anchor.

Locate the Substance Review answer buttons (likely in `src/components/admin/SubstanceReviewForm.tsx` or the new `SubstanceReviewSubsection.tsx` after B-119). The fix is to ensure each Yes/No/Unknown answer is a real `<button>` with an onClick handler that:

- PATCHes the answer to the existing endpoint (probably `/api/admin/services/[id]/substance` — CLI to confirm) with the question key + chosen value.
- Updates local state so the selected option shows visually as picked.
- No navigation, no `href`, no anchor.

CLI: before changing the button, repro the bug locally — click Yes and capture what the network tab shows. If the button DOES fire a PATCH but ALSO navigates (because it's inside a `<form>` that submits), prevent default + stop propagation. If the button doesn't fire anything (because it's a plain `<a href="#">` from the original implementation), replace with `<button type="button">` and wire the handler.

### Local director count fix

Two code paths today:

- **Badge** (`ServiceDetailClient.tsx:1988`): `passport_country === "MUS" AND role includes "director"` → "Local Director" pill renders.
- **Count** (`ServiceDetailClient.tsx:4768`): `client_profile_kyc.is_local_resident_director === true` → contributes to localDirectorCount.

Bruce passes the badge check (passport_country = MUS, role = Director) but `is_local_resident_director` defaults to false and was never flipped → count = 0, badge = visible.

**Fix:** change the count's predicate to match the badge:

```ts
const localDirectorCount = useMemo(() => {
  let n = 0;
  Array.from(profileRolesMap.values()).forEach((entry) => {
    if (!entry.roles.includes("director")) return;
    const rawKyc = entry.person.client_profiles?.client_profile_kyc;
    const kyc = (Array.isArray(rawKyc) ? rawKyc[0] ?? null : rawKyc) as
      | { passport_country?: string | null }
      | null;
    if (kyc?.passport_country === "MUS") n += 1;
  });
  return n;
}, [profileRolesMap]);
```

Drop the dependency on `is_local_resident_director` from the count. The column itself remains in the DB for now (don't drop) — flag it as deprecated in tech debt and remove in a follow-up after we confirm nothing else reads it.

### Milestones card polish

After B-124's redesign, the Milestones card shows:

```
LOE       INV       PAY
✓ 12 May  —         —
```

Vanessa wants:

- Spell out labels: "Letter of Engagement" / "Invoice" / "Payment Received" (use whatever the original labels were before B-119's abbreviation pass — CLI greps for those in git history if not obvious).
- Show year in the date: "12 May 2026" instead of "12 May".
- Add a small calendar icon next to the date so admin sees it's clickable / editable.

The 3-column side-by-side layout from B-124 stays — just the cell content gets richer. CLI will need to verify the cells still fit at the rail's typical width (~280px). If the spelled-out label is too wide for 280/3 ≈ 93px, allow a 2-line wrap on the label (`break-words`) — but keep the date row to one line.

### Audit Trail enhancements

The Audit Trail card today (CLI to locate — likely `src/components/admin/ServiceAuditTrailCard.tsx` or inline in `ServiceDetailClient.tsx`):

- Lives at the bottom of the right rail.
- Doesn't apply the `border rounded-xl bg-white` wrapper used by the other right-rail cards. B-121 was supposed to standardize this but the card may have been missed.
- Shows each entry with a relative date ("2h ago", "3d ago", "12d ago").
- No filtering, no export.

Four changes:

1. **Border consistency** — wrap the card in `bg-white border rounded-xl px-4 py-3` (or whatever the matching pattern is — match Status / Pending / Communications).
2. **CSV download button** — small icon button in the card header. Clicking exports the (filtered) audit log entries as CSV. Endpoint: `GET /api/admin/services/[id]/audit-log/export?from=<iso>&to=<iso>` returning a CSV body. Columns: timestamp · actor (admin name) · entity_type · entity_id · action · note · previous_value · new_value. Use existing audit-log schema; no new column.
3. **Date range filter** — small toolbar at the top of the audit list:
   - Preset chips: `Today` · `7 days` · `30 days` · `All time` (default = `30 days`).
   - "Custom" chip → opens a small popover with From/To date inputs and an Apply button.
   - Selected preset highlights (`bg-brand-blue text-white` or whatever the active style is on similar pills).
   - Filtering re-fetches via `GET /api/admin/services/[id]/audit-log?from=<iso>&to=<iso>` OR client-side filters if the audit log is already loaded in full. CLI picks based on the data volume; for a POC, client-side filtering is likely fine.
4. **Date display rule** — for each entry:
   - **≤3 days old:** relative time ("2h ago", "1d ago", "3d ago").
   - **>3 days old:** absolute date with year ("12 May 2026" or "12 May 2026, 14:30" — CLI: pick the more readable; pull from existing date formatters).
   - Use `formatDistanceToNow` from date-fns or whatever the project uses for relative times today.

## Locked design decisions (from brainstorming)

### Audit Trail date filter — presets + custom

Four preset chips: `Today` · `7 days` · `30 days` · `All time`. Default selection: `30 days`. Plus a `Custom` chip that opens a popover with From/To date inputs.

Filter state lives in React state on the Audit Trail card. Re-fetching vs client-filter is an implementation detail — CLI picks based on what's cleaner with the existing data flow. If the parent already loads the full log, just filter in the card.

### Local director count — unify with badge

Use the badge's predicate (`passport_country === "MUS"` + role includes "director"). The manual `is_local_resident_director` column is no longer consulted by app code. Don't drop the column in this brief (audit safety); tech-debt note for removal in a follow-up.

### Milestones labels

Spell out: "Letter of Engagement" / "Invoice" / "Payment Received". Year included in dates. Calendar icon (`Calendar` from Lucide) next to each date, `text-gray-400 hover:text-gray-600`, click-through is the existing edit affordance (same popover as B-124).

### Substance Review buttons

Wire to inline PATCH against the existing substance endpoint. No navigation. The selected option becomes visually picked (e.g., the chosen button gets a `bg-emerald-100 text-emerald-700` if it's "Yes", standard active style for the other options).

## In scope

- All four items above.
- The substance review PATCH endpoint already exists (B-072 / B-119); no schema change required.
- The audit log already has the fields needed for CSV export; no schema change.

## Out of scope

- Removing the `is_local_resident_director` column from `client_profile_kyc` — defer to a cleanup batch once we confirm nothing reads it.
- Per-actor / per-action-type audit log filters — date range only in this brief.
- Pagination of the audit log past the current loading pattern. If the log is heavy (>500 entries), revisit.
- CSV export of anything besides the audit log (no Communications CSV, no Review Requests CSV).
- Per-user CSV download preferences (column choices, format).

## Implementation — batched

### Batch 1 — Bug fixes (Substance Review buttons + Local director count)

**Substance Review buttons:**

- Locate the question/answer rendering in `SubstanceReviewSubsection.tsx` (or `SubstanceReviewForm.tsx` if it lives there). Replace any `<a>` or button-without-handler with a proper `<button type="button">` + onClick.
- onClick: call the existing PATCH endpoint with the question key + chosen answer. Optimistically update local state so the picked button shows as selected (background color, checkmark, or `aria-pressed="true"`).
- Add a tiny test or manual verification: clicking Yes triggers a network PATCH; clicking again with a different option overwrites; no URL change.

**Local director count:**

- Edit `ServiceDetailClient.tsx:4768` `localDirectorCount` `useMemo`. Replace the `is_local_resident_director` check with `kyc?.passport_country === "MUS"`.
- Update the TypeScript type for the inline cast accordingly.
- Update the B-121 comment block above the memo to reflect the new logic.
- Verify visually: open Bruce's service → header chip now reads "2 DIRECTORS · 1 LOCAL".

Add tech-debt entry pointing at the eventual `is_local_resident_director` column removal.

Commit + push at end of batch.

### Batch 2 — UI polish (Milestones + Audit Trail)

**Milestones card** (`src/components/admin/MilestonesCard.tsx`):

- Update labels: `"LOE"` → `"Letter of Engagement"`, `"INV"` → `"Invoice"`, `"PAY"` → `"Payment Received"`. (CLI: confirm the exact label spelling Vanessa wants if the original B-119 labels differ.)
- Update the date formatter from short-month-and-day to short-month-and-day-and-year. E.g., `formatDate(date, "d MMM yyyy")` → "12 May 2026". Use existing project formatters where possible.
- Add a `Calendar` icon (Lucide) inline next to the date, `h-3 w-3 text-gray-400` (`text-gray-600` on hover). The icon is purely visual; the existing click handler on the cell remains the edit affordance.
- Verify the cell content still fits at 280px rail width / 3 cells = ~93px each. If labels overflow, allow 2-line wrap on the label only; keep dates single-line.

**Audit Trail card:**

- Locate the card (CLI greps for "audit" in the right-rail block of `ServiceDetailClient.tsx`, likely an inline JSX block or `ServiceAuditTrailCard.tsx`).
- Apply `bg-white border rounded-xl px-4 py-3` wrapper to match the other rail cards. Drop any other wrapper (`<section>` with different styling, etc.).
- Add a CSV download button in the card header — small icon button (`Download` from Lucide) with a `title="Download CSV"`. Click → calls a new endpoint `GET /api/admin/services/[id]/audit-log/export?from=...&to=...` (CLI builds this), which returns a CSV body. Use the existing audit-log data + the current filter window for the export.
- Add the date filter toolbar below the header:
  - Pill chips: `Today` · `7 days` · `30 days` · `All time` · `Custom`.
  - Default: `30 days`.
  - Active chip has a brand-blue background.
  - `Custom` opens a popover with From/To date inputs and an Apply button.
- Update date formatting per entry:
  - Compute `daysOld = (now - entry.timestamp) / 86400`.
  - If `daysOld <= 3`: relative ("2h ago", "1d ago"). Use existing `formatDistanceToNow` helper.
  - Else: absolute ("12 May 2026, 14:30" — pick the format that's already used elsewhere in admin views for full dates).

**CSV export endpoint:**

- `GET /api/admin/services/[id]/audit-log/export?from=<isoOptional>&to=<isoOptional>`
- Auth: admin only (use existing `auth()` + role check).
- Server-side: query `audit_log` filtered by service_id + optional from/to.
- Return CSV with headers `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="audit-{service_number-or-id}-{yyyy-mm-dd}.csv"`.
- CSV columns: `timestamp`, `actor`, `entity_type`, `entity_id`, `action`, `note`, `previous_value`, `new_value`. Quote fields containing commas/newlines (use a tiny CSV escape helper, not a full library).

Commit + push at end of batch.

## Database changes

None. All four items work against existing tables.

## Testing

- Unit: `localDirectorCount` derivation — Bruce (passport_country = MUS, role = director) counts; non-MUS director doesn't; non-director MUS profile doesn't.
- Integration: substance-review PATCH endpoint accepts a Yes/No/Unknown answer and persists.
- Integration: audit-log CSV export returns expected columns + escapes correctly.
- Unit: date display rule — entry 2h old shows "2h ago"; entry 12d old shows "12 May 2026".
- Manual visual check on milestones card (labels readable, year visible, calendar icon present).

## Tech-debt notes

Append to `docs/tech-debt.md` (newest at top) after Batch 2:

- `client_profile_kyc.is_local_resident_director` column is no longer read by the local-director count. Remove the column in a cleanup batch once we confirm no other consumers (greppable references = 0).
- Audit Trail CSV export is unauthenticated against rate limits — heavy services with many entries could produce large downloads. If this becomes a problem, add a per-admin per-minute rate limit on the export endpoint.
- The Audit Trail date filter state is per-card-render — not URL-persisted. If admin wants to share a deep link to a filtered view, add URL query-param sync.
- Substance Review PATCH error handling: confirm the current behavior on PATCH failure (toast + revert local state?) and document the chosen pattern. If error toasts aren't shown today, add them.

## End-of-brief checklist for CLI

After Batch 2 commits and pushes:

1. Confirm `git status` is clean and `git status -sb` says up-to-date with `origin/main`.
2. Confirm CHANGES.md tail has one entry per batch with the right date.
3. Run the dev-server reset from the **main project root** (not the worktree — `.env.local` only lives at the project root):
   ```
   cd /Users/elaris/Documents/Claude_webapp_client_onboarding && pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. One-line chat summary back to Vanessa: "B-125 done — Substance Review fix + local director count fix + Milestones polish + Audit Trail enhancements. 2 batches committed."

## Worktree note

This brief was written in worktree `stupefied-bhabha-fb0c3f`. All commits during execution must land on `origin/main` via `git push origin HEAD:main` — CLI only pulls main. Do not push to the worktree branch.
