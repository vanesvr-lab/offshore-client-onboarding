# CLI Brief: Admin Services List Rework (B-018)

**Date:** 2026-04-17
**Scope:** Admin services list page only (`/admin/services`). Do NOT touch client pages.

---

## Overview

Rework the admin services list table to be more informative with reference numbers, mini progress bars per section, service managers, and last updated info.

---

## DB Changes

### Add `service_number` to services table

Run this SQL (or create a migration route):

```sql
-- Add service_number column
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_number text;

-- Create unique index
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_service_number ON services(service_number) WHERE service_number IS NOT NULL;
```

### Backfill existing services with reference numbers

```sql
-- Backfill: generate sequential numbers per template prefix
WITH numbered AS (
  SELECT 
    s.id,
    CASE 
      WHEN LOWER(st.name) LIKE '%global business%' THEN 'GBC'
      WHEN LOWER(st.name) LIKE '%authorised%' OR LOWER(st.name) LIKE '%authorized%' THEN 'AC'
      WHEN LOWER(st.name) LIKE '%domestic%' THEN 'DC'
      WHEN LOWER(st.name) LIKE '%trust%' OR LOWER(st.name) LIKE '%foundation%' THEN 'TFF'
      WHEN LOWER(st.name) LIKE '%relocation%' THEN 'RLM'
      ELSE 'SVC'
    END AS prefix,
    ROW_NUMBER() OVER (
      PARTITION BY 
        CASE 
          WHEN LOWER(st.name) LIKE '%global business%' THEN 'GBC'
          WHEN LOWER(st.name) LIKE '%authorised%' OR LOWER(st.name) LIKE '%authorized%' THEN 'AC'
          WHEN LOWER(st.name) LIKE '%domestic%' THEN 'DC'
          WHEN LOWER(st.name) LIKE '%trust%' OR LOWER(st.name) LIKE '%foundation%' THEN 'TFF'
          WHEN LOWER(st.name) LIKE '%relocation%' THEN 'RLM'
          ELSE 'SVC'
        END
      ORDER BY s.created_at
    ) AS seq
  FROM services s
  JOIN service_templates st ON s.service_template_id = st.id
  WHERE s.service_number IS NULL
)
UPDATE services SET service_number = numbered.prefix || '-' || LPAD(numbered.seq::text, 4, '0')
FROM numbered WHERE services.id = numbered.id;
```

### Create migration API route

**Create:** `src/app/api/admin/migrations/add-service-numbers/route.ts`

POST route that:
1. Adds the column if not exists
2. Runs the backfill logic via Supabase SDK
3. Returns count of updated rows

This is safer than raw SQL and follows the existing migration pattern (see `/api/admin/migrations/update-geographical-field/route.ts`).

### Auto-generate on new service creation

Update service creation logic to auto-assign `service_number` when a new service is created:
1. Find the template prefix (same CASE logic)
2. Query max existing number for that prefix
3. Increment and pad to 4 digits
4. Set on insert

Check `src/app/api/admin/services/route.ts` (POST handler) — add the auto-generation there.

### Update types

In `src/types/index.ts`, add to `ServiceRecord`:
```ts
service_number: string | null;
```

---

## UI Changes

### Filters Bar (top of page)

Replace the current status filter buttons with a more complete filter bar:

```
┌──────────────────────────────────────────────────────────────────────┐
│  🔍 Search (ref number, manager names)                              │
│                                                                      │
│  Service: [All ▾] [GBC] [AC] [DC] [TFF] [RLM]                      │
│  Status:  [All ▾] [Draft] [Submitted] [In Review] [Approved] [Rejected] │
└──────────────────────────────────────────────────────────────────────┘
```

- **Service type filter**: Driven by `service_templates` table. Show template name abbreviation as filter chips/buttons. Filter by `service_template_id`.
- **Status filter**: Same as current but styled consistently with service filter.
- **Search**: Searches `service_number` (case-insensitive) and manager names.

### Table Columns

Remove the "Service" (template name) column — it's now a filter. The ref number (GBC-0001) already indicates the type.

New column layout:

| Column | Width | Content |
|--------|-------|---------|
| **Ref** | ~100px | `service_number` (e.g., "GBC-0001"). Bold, monospace-ish. Click → `/admin/services/[id]` |
| **Status** | ~100px | Status badge (same style as current) |
| **Managers** | ~180px | Names of people with `can_manage=true`. Show first 2, "+N more" if overflow. |
| **Company Setup** | ~80px | Mini progress bar (colored) + percentage text below |
| **Financial** | ~80px | Mini progress bar + percentage |
| **Banking** | ~80px | Mini progress bar + percentage |
| **People & KYC** | ~80px | Mini progress bar + percentage |
| **Documents** | ~80px | Mini progress bar + percentage |
| **Last Updated** | ~120px | Date (relative, e.g., "2h ago") + "by {name}" below |

### Mini Progress Bar Component

Create a reusable component: `src/components/shared/MiniProgressBar.tsx`

```tsx
type Props = {
  percentage: number;  // 0-100
  tooltip?: string;    // e.g., "3/5 required fields complete"
};
```

Rendering:
- Bar: 60px wide, 4px tall, rounded-full
- Background: `bg-gray-200`
- Fill color based on percentage:
  - 80-100%: `bg-green-500`
  - 1-79%: `bg-amber-500`
  - 0%: `bg-red-500`
- Below bar: percentage in `text-[10px] text-gray-400`
- Wrap in a tooltip (title attribute or shadcn Tooltip) showing detail text

### Progress Calculation

Reuse `src/lib/utils/serviceCompletion.ts` (created in B-016/B-017) for section completion calculations. If that file doesn't exist yet, create it with these functions:

```ts
type SectionCompletion = { percentage: number; ragStatus: 'green' | 'amber' | 'red' };

// Steps 1-3: count required service_fields filled in service_details
// Group fields by section (company_setup, financial, banking)
export function calcSectionCompletion(
  serviceFields: ServiceField[],
  serviceDetails: Record<string, unknown>,
  sectionFilter: string
): SectionCompletion

// Step 4: People & KYC
// Green if 1+ director + all persons have KYC complete
export function calcPeopleKycCompletion(persons: ServicePerson[]): SectionCompletion

// Step 5: Documents
// Percentage of required docs uploaded
export function calcDocumentsCompletion(
  documents: { verification_status: string }[],
  expectedCount: number
): SectionCompletion
```

### Data Query Expansion

The server page (`src/app/(admin)/admin/services/page.tsx`) needs additional data for the progress bars and last updated info.

Expand the query:
```ts
const { data } = await supabase
  .from("services")
  .select(`
    *,
    service_templates(id, name, description, service_fields),
    profile_service_roles(
      id, role, can_manage,
      client_profiles(id, full_name, email, is_representative,
        client_profile_kyc(*)
      )
    )
  `)
  .eq("tenant_id", tenantId)
  .eq("is_deleted", false)
  .order("created_at", { ascending: false });
```

Also fetch documents per service for the Documents progress bar:
```ts
const serviceIds = (data ?? []).map(s => s.id);
const { data: allDocs } = await supabase
  .from("documents")
  .select("id, service_id, verification_status")
  .in("service_id", serviceIds)
  .eq("is_active", true);
```

For "Last Updated by" — check `audit_log` or use `services.updated_at`. If `audit_log` has the actor info:
```ts
const { data: lastUpdates } = await supabase
  .from("audit_log")
  .select("entity_id, created_at, actor_name")
  .eq("entity_type", "service")
  .in("entity_id", serviceIds)
  .order("created_at", { ascending: false });
// Take first per entity_id for most recent
```

If `audit_log` doesn't track service changes yet, use `services.updated_at` with no "by" name for now, and note it as a TODO.

---

## Files to Create

- `src/components/shared/MiniProgressBar.tsx` — reusable mini progress bar with tooltip
- `src/app/api/admin/migrations/add-service-numbers/route.ts` — migration route for service_number column + backfill
- `src/lib/utils/serviceCompletion.ts` — if not already created by B-016/B-017

## Files to Modify

- `src/app/(admin)/admin/services/page.tsx` — expand query with service_fields, KYC data, documents
- `src/app/(admin)/admin/services/ServicesPageClient.tsx` — complete rewrite of table columns and filter bar
- `src/types/index.ts` — add `service_number` to `ServiceRecord`
- `src/app/api/admin/services/route.ts` — auto-generate `service_number` on POST

## Files to Reuse

- `src/lib/utils/serviceCompletion.ts` — completion calculations (may already exist from B-016/B-017)

---

## CRITICAL RULES

1. Read `CLAUDE.md` for all project conventions
2. `npm run build` must pass clean before every commit
3. Update `CHANGES.md` in every commit
4. Commit and push after each logical batch
5. Use `createAdminClient()` for server-side queries
6. Use `getTenantId(session)` on EVERY new query
7. shadcn/ui uses `@base-ui/react` — use `render` prop, not `asChild`
8. Supabase join type inference — cast via `unknown` first
9. Do NOT touch client pages
10. The SQL migration for `service_number` column needs to be run manually — create the migration route AND document the SQL in CHANGES.md

## Verification

1. Run the migration route to add `service_number` and backfill
2. Admin login → `/admin/services` shows new table layout
3. Ref numbers visible (GBC-0001, etc.)
4. Service type filter works (filters by template)
5. Status filter works
6. Search finds by ref number and manager name
7. Mini progress bars show correct percentages with color coding
8. Hover on progress bar shows tooltip with detail
9. "Managers" column shows only can_manage=true people
10. "Last Updated" shows date + author
11. Create a new service → auto-generates next sequential number
12. `npm run build` passes clean
