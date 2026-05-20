# B-149 — /admin/services list reaches parity with /admin/queue (name, assigned officer, filters)

## Why

`/admin/queue` got modernized through B-130 (Assigned Officer + multi-select status + Assigned-to-me) and B-144 (Service Name). `/admin/services` (the services list view) stayed on the older `ServicesPageClient.tsx` from before those briefs and is now missing five capabilities the queue has:

- Service name as a column / line
- Assigned Officer as a column
- Multi-select status filter (currently single-select)
- Assigned-officer filter dropdown
- "Assigned to me" quick-filter chip

Vanessa wants the services list to feel like the queue does. Additive change — the existing per-section completion percentages (companySetup, financial, banking, peopleKyc, documents) STAY since they're useful + unique to this surface.

## Out of scope (do NOT do in B-149)

- **Replacing `ServicesPageClient` with `ServicesTable`.** The queue's `ServicesTable` doesn't render the per-section percentages. A future consolidation could merge both into one component, but B-149 keeps them separate and just back-fills the missing affordances into `ServicesPageClient`.
- **Touching the queue page.** It already has these features.
- **Section-percentage UI on the queue.** Reverse direction — keep them only on `/admin/services` for now.

---

## Batch 1 — Schema + page query updates

### Update `src/app/(admin)/admin/services/page.tsx`

Add fields to the services query so they're available to the client component:

```ts
.from("services")
.select(`
  id,
  service_number,
  name,                                    // ← NEW from B-144
  status,
  service_template_id,
  service_details,
  created_at,
  updated_at,
  assigned_admin_id,                       // ← NEW from B-130
  assigned_admin:users!services_assigned_admin_id_fkey(id, full_name, email),  // ← NEW
  service_templates(id, name, description, service_fields),
  profile_service_roles(…),
  service_profile_removals(client_profile_id)    // ← so we can respect B-133's removals
`)
```

Add `admins` loading (same pattern as queue):

```ts
const { data: rawAdmins } = await supabase
  .from("admin_users")
  .select("user_id, users!inner(full_name, email)");
const admins = ((rawAdmins as unknown as Array<{
  user_id: string;
  users: { full_name: string | null; email: string | null } | null;
}> | null) ?? []).map((a) => ({
  id: a.user_id,
  name: a.users?.full_name ?? a.users?.email ?? "Unnamed admin",
}));
```

### Extend the `AdminServiceRow` type

```ts
export type AdminServiceRow = {
  id: string;
  service_number: string | null;
  name: string | null;                      // ← NEW
  status: string;
  service_template_id: string;
  service_template_name: string;
  created_at: string;
  updated_at: string;
  assigned_admin_id: string | null;         // ← NEW
  assigned_admin_name: string | null;       // ← NEW
  managers: { id: string; full_name: string }[];
  sectionPcts: { …existing… };
  lastUpdatedAt: string;
  lastUpdatedBy: string | null;
};
```

Fill the new fields in the `rows.map()` step (around line 178+):

```ts
return {
  …,
  name: svc.name,
  assigned_admin_id: svc.assigned_admin_id ?? null,
  assigned_admin_name: svc.assigned_admin?.full_name ?? null,
  …,
};
```

### Filter through `service_profile_removals` (B-133 parity)

Currently `/admin/services/page.tsx` doesn't filter `profile_service_roles` against the removals table — same B-133 fix the queue got. Add the same client-side filter when building `managers`:

```ts
const removedIds = new Set(
  (svc.service_profile_removals ?? []).map((r) => r.client_profile_id),
);
const activeRoles = (svc.profile_service_roles ?? []).filter(
  (r) => r.client_profiles?.id && !removedIds.has(r.client_profiles.id),
);
// then derive managers from activeRoles instead of svc.profile_service_roles
```

### Pass `admins` + `currentUserId` to the client component

```tsx
<ServicesPageClient
  rows={rows}
  templateOptions={templateOptions}
  admins={admins}                          // ← NEW
  currentUserId={session.user.id as string} // ← NEW
/>
```

### Verification (Batch 1)

Manual: open `/admin/services` in dev — page still renders. Each row's data should be unchanged visually at this point; this batch only fills the data pipeline. Visual changes land in Batch 2 + 3.

### Commit message (Batch 1)

```
feat: extend /admin/services page query for B-149 parity work

Adds name, assigned_admin_id, and assigned_admin_name to
AdminServiceRow; loads the admins list for the filter dropdown;
respects B-133's service_profile_removals when deriving the
managers column. No visible UI change yet — sets up the data
pipeline for Batches 2 and 3 to consume.
```

---

## Batch 2 — Display name + Assigned Officer columns in `ServicesPageClient`

### Update `src/app/(admin)/admin/services/ServicesPageClient.tsx`

The current table has columns: REF · STATUS · MANAGERS · CO. SETUP · FINANCIAL · BANKING · PEOPLE & KYC · DOCS · LAST UPDATED (per the earlier screenshot of the services list — verify by reading the component).

Add the name as a secondary line under the service_number in the REF column (same pattern as the queue's ServicesTable Batch 3 in B-144):

```tsx
<td className="px-3 py-2">
  <Link href={`/admin/services/${row.id}`}>
    <div className="font-medium text-brand-navy">{row.service_number}</div>
    {row.name && (
      <div className="text-xs text-gray-500 truncate max-w-[260px]" title={row.name}>
        {row.name}
      </div>
    )}
  </Link>
</td>
```

Add an Assigned Officer column between MANAGERS and CO. SETUP:

```tsx
<th>ASSIGNED TO</th>
…
<td className="px-3 py-2 text-sm text-gray-700">
  {row.assigned_admin_name ?? "—"}
</td>
```

Extend the existing search filter to also match `name` (add `(row.name?.toLowerCase().includes(q))` to the OR chain).

### Verification (Batch 2)

Manual: open `/admin/services`. Each row's REF column now shows the service name on a smaller line below the service_number. New ASSIGNED TO column shows the admin name (or "—"). Search input matches against name too.

### Commit message (Batch 2)

```
feat: name + Assigned Officer columns on /admin/services list (B-149)

ServicesPageClient now renders the service name as a smaller
line below the service_number in the REF column (matching the
queue's ServicesTable pattern from B-144) and adds an
ASSIGNED TO column showing the admin's full name (B-130 column
on the queue, now on the services list too). Search input
extended to match against name in addition to ref + manager.
```

---

## Batch 3 — Multi-select status filter + Assigned-officer filter + "Assigned to me" chip

### Multi-select status filter

The current status filter is single-select (`statusFilter: StatusFilter`). Convert to multi-select with the same chip-row UX the queue uses (B-130 Batch 4):

```tsx
const [statusFilters, setStatusFilters] = useState<Set<string>>(new Set());

// Filter logic:
const filtered = rows.filter((row) => {
  if (statusFilters.size > 0 && !statusFilters.has(row.status)) return false;
  // …other filters…
});

// UI: chip row above the table:
<div className="flex flex-wrap gap-1.5 mb-3">
  {ALL_STATUSES.map((s) => (
    <button
      key={s}
      onClick={() => toggleStatus(s)}
      className={`text-xs px-3 py-1 rounded-full border ${
        statusFilters.has(s)
          ? "bg-brand-navy text-white border-brand-navy"
          : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
      }`}
    >
      {getStatusLabel(s)}
    </button>
  ))}
</div>
```

Use the same `getStatusLabel` helper currently imported from `@/lib/services/statusChain`.

### Assigned-officer filter dropdown

Add a dropdown above the table next to the search input:

```tsx
const [assignedFilter, setAssignedFilter] = useState<string>(""); // "" = all

// Filter logic:
if (assignedFilter === "unassigned" && row.assigned_admin_id !== null) return false;
if (assignedFilter && assignedFilter !== "unassigned" && row.assigned_admin_id !== assignedFilter) return false;

// UI:
<select value={assignedFilter} onChange={(e) => setAssignedFilter(e.target.value)}>
  <option value="">All assignees</option>
  <option value="unassigned">— Unassigned —</option>
  {admins.map((a) => (
    <option key={a.id} value={a.id}>{a.name}</option>
  ))}
</select>
```

### "Assigned to me" quick chip

```tsx
const [mine, setMine] = useState(false);

// Filter logic:
if (mine && row.assigned_admin_id !== currentUserId) return false;

// UI: chip near the filter bar
<button
  onClick={() => setMine((m) => !m)}
  className={`text-xs px-3 py-1 rounded-full border ${
    mine
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
  }`}
>
  {mine ? "✓ Assigned to me" : "Assigned to me"}
</button>
```

Mine + assigned-filter interaction: if `mine` is on, ignore the dropdown selection (don't double-filter). Or have them stack — pick whichever feels right.

### URL state preservation (matches queue's pattern)

Optional but nice: store `statusFilters`, `assignedFilter`, `mine` in URL params (`?status=start,kyc&assigned=<id>&mine=1`) so the filter state survives reloads. Use `useRouter` + `useSearchParams` from `next/navigation`. CLI's call on whether to include in this brief or defer.

### Verification (Batch 3)

Manual:
1. Status chip row visible above the table. Clicking chips multi-selects. Default = no filter (show all).
2. Assigned officer dropdown shows the admins list + "— Unassigned —".
3. "Assigned to me" chip toggles → narrows to services where assigned_admin_id matches the current user.
4. All three filters compose (chip-row narrows by status, dropdown by admin, chip by self).

### Commit message (Batch 3)

```
feat: multi-status + assignee filters on /admin/services (B-149)

Brings the services list filter UX in line with the queue: status
filter converts from single-select to a multi-select chip row;
Assigned Officer dropdown added next to search; "Assigned to me"
quick chip added. All three compose with the existing search +
service-type filters.
```

---

## Batch 4 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-149 — /admin/services reaches parity with queue (done YYYY-MM-DD)`. One sub-entry per batch.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry**: "Eventual consolidation of `/admin/services` and `/admin/queue` — both pages now share a substantial overlap of columns + filters. The queue's ServicesTable doesn't render per-section percentages; the services list does. Consider merging into a single component with optional `showSectionPercentages` prop, OR replacing `ServicesPageClient` entirely with `ServicesTable` augmented to render the percentages. ~half-day refactor; defer until both pages drift further."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure query + UI change.
2. **Per-batch commits:** four commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No section-percentage UI added to the queue page.
- No consolidation of ServicesPageClient and ServicesTable into one component (tech debt only).
- No queue-page changes.
- URL-param state preservation is OPTIONAL — skip if it bloats the diff.
