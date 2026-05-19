# B-140 — Remove duplicate Assigned Officer UI + fix AssignedOfficerCard display

## Why

`ServiceDetailClient.tsx` renders the Assigned Officer affordance in TWO places — a leftover from when B-130 introduced the proper column-backed flow but didn't remove the older JSON-stored version:

| Location | Component | Data path |
|---|---|---|
| Right rail, just below Peer/Manager Review (line ~6720) | B-130 `<AssignedOfficerCard />` (shadcn Select) | `services.assigned_admin_id` (proper FK column) |
| Right rail, lower down (line ~6896-6914) | Legacy inline `<select>` | `service_details._assigned_admin_id` (JSON path) |

In Vanessa's screenshot, the visible "ASSIGNED OFFICER" card shows the raw user_id (`4e71552a-7e24-48a2-a522-d1db02ee36ce`) instead of the admin's name. That's the B-130 component falling back to the raw value because the shadcn `<SelectValue>` can't resolve the user_id to a display label.

Vanessa wants the position kept (under Peer/Manager Review — exactly where the B-130 component already lives) but the legacy one removed and the display fixed.

## Out of scope (do NOT do in B-140)

- **Permissions changes** — B-130's `data_access = 'edit'` gate stays.
- **API changes** — the existing `PATCH /api/admin/services/[id]` endpoint handles assignment correctly. No changes there.
- **Schema changes** — the `services.assigned_admin_id` column from B-130 is the source of truth. `service_details._assigned_admin_id` JSON is being retired but not deleted (zero-risk: nothing reads it post-cleanup, so it just sits as orphan JSON until a future schema sweep).

---

## Batch 1 — Delete legacy + fix display

### Step 1 — Remove the legacy inline Assigned Officer block

In `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`:

1. **Delete the inline `<select>` block** at approximately lines 6896-6914:
   ```tsx
   {/* ── Assigned Officer ────────────────────────────────────────────── */}
   <div className="bg-white border rounded-xl px-4 py-3 space-y-3">
     <p className="text-xs font-semibold ...">Assigned Officer</p>
     <div className="relative">
       <select value={assignedAdminId ?? ""} onChange={...}>
         ...
       </select>
       <ChevronDown ... />
     </div>
   </div>
   ```

2. **Delete the supporting state + handler** at approximately lines 5815-5825 (or wherever they live — CLI: grep for `assignedAdminId` and `assignAdmin` to find them all):
   - The line that reads `const assignedAdminId = (serviceDetails._assigned_admin_id as string | null) ?? null;`
   - The `assignAdmin(userId: string | null)` function that PATCHes the JSON path
   - Any other reference to `_assigned_admin_id` in this file

3. **Don't touch the B-130 `<AssignedOfficerCard />`** at line 6720 — it stays.

### Step 2 — Fix the AssignedOfficerCard display

The component uses shadcn `<Select>` whose `<SelectValue placeholder="...">` should render the matched `<SelectItem>`'s text content. It's showing the raw user_id instead, which means either:

- **Most likely**: the `admins` list passed in doesn't include the currently-assigned admin's user_id (filter on the parent query is too strict, OR the assigned admin was removed from `admin_users` after assignment).
- **Less likely**: the shadcn/base-ui Select implementation needs an explicit child function or current-value lookup.

**Fix approach (handles both cases):**

In `src/components/admin/AssignedOfficerCard.tsx`, make the SelectValue explicitly render the resolved name:

```tsx
// Replace this:
<SelectValue placeholder="Select an officer" />

// With this:
<SelectValue placeholder="Select an officer">
  {(() => {
    if (value === UNASSIGNED) return "— Unassigned —";
    const match = admins.find((a) => a.user_id === value);
    if (match) return match.full_name ?? match.email ?? "Unnamed admin";
    // Fallback: show "Unknown admin" rather than the raw UUID so the UI
    // never leaks an internal id even when the assigned admin is no longer
    // in the admin_users list.
    return "Unknown admin";
  })()}
</SelectValue>
```

This guarantees the trigger area never shows the raw user_id, regardless of whether the `admins` list resolves the assigned user.

Also: at the parent query for `admins` (CLI: grep for where the `admins` prop is loaded for `AssignedOfficerCard`), make sure the query includes EVERY admin (no filters on `admin_users` other than tenant_id). If the query filters out admins for some reason (e.g. only "active" admins, or excluding the current user), broaden it so any historically-assigned admin still appears in the dropdown.

### Verification (Batch 1)

Manual:
1. Open a service detail page where an admin is already assigned. The card immediately below "PEER / MANAGER REVIEW" should now show the admin's full name (e.g. "Vanessa Paniken"), not the UUID.
2. The lower duplicate "ASSIGNED OFFICER" card should be gone from the right rail.
3. Open the dropdown — every admin in `admin_users` appears.
4. Pick a different admin → confirm the trigger area immediately updates to that admin's name (not the UUID).
5. Pick "— Unassigned —" → trigger shows "— Unassigned —".
6. As a non-edit role (Junior Officer): the dropdown is disabled; trigger still shows the assigned admin's name (not the UUID).

### Commit message (Batch 1)

```
fix: remove duplicate Assigned Officer + show name in trigger (B-140)

Two changes to ServiceDetailClient's right rail:

1. Deletes the legacy inline <select> that read service_details
   ._assigned_admin_id (JSON path) — superseded by B-130's
   column-backed AssignedOfficerCard immediately below Peer/Manager
   Review. The legacy state, handler, and JSON-read line are also
   removed.

2. AssignedOfficerCard's <SelectValue> now resolves the user_id to
   the admin's full_name explicitly via a children prop, instead of
   falling back to the raw UUID when shadcn's Select can't render
   the matching item. Worst-case fallback is "Unknown admin" — the
   UI never leaks internal ids.
```

---

## Batch 2 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-140 — Remove duplicate Assigned Officer UI (done YYYY-MM-DD)`. Note the two changes (delete legacy + fix display).

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry**: "Stale `_assigned_admin_id` JSON in `service_details` — B-140 stops reading from this path but doesn't clear it from existing rows. If any service has the JSON key set, it just sits unused. A future cleanup could `UPDATE services SET service_details = service_details - '_assigned_admin_id'` to remove the orphaned key. Cosmetic only — ~5 min. Estimate: half-hour."
- **Add new Open entry** (if Step 2's broader admin-list query change was needed): "Document the `admins` query rules for AssignedOfficerCard — to prevent regression, write down which filters are allowed (only tenant_id) so a future change doesn't accidentally re-narrow the list."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — code-only change.
2. **Per-batch commits:** two commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No permissions changes.
- No API changes.
- No DB schema migration (the orphaned JSON key stays for a future cosmetic cleanup).
- No relocation of the AssignedOfficerCard — it stays where B-130 put it (right under Peer/Manager Review, which is the position Vanessa wants kept).
