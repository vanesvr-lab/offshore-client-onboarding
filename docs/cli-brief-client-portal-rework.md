# CLI Brief: Client Portal Rework — Client View

**Date:** 2026-04-17
**Prerequisite:** All B-015 phases are complete and deployed. Bug fix for /services 404 is pushed.
**Scope:** Client-facing portal only. Do NOT touch admin pages.

---

## What You're Building

Rework the client portal to be warm, action-oriented, and clearly distinct from the admin portal. The client should see a greeting, pending actions, and a service detail page with people management + inline KYC.

## Key Decisions (already confirmed)

- Persons (Directors/Shareholders/UBOs): **client can add/remove**
- KYC: **embedded inline** per person (compact KycStepWizard)
- Dashboard: **always show** (no auto-redirect, even for 1 service)

---

## Phase 1: Utilities + Tokens

### 1A. Create `src/lib/utils/pendingActions.ts`
Computes pending action items for dashboard display.
```ts
export type PendingAction = {
  section: 'service_details' | 'documents' | 'people' | 'kyc';
  serviceId: string;
  serviceName: string;
  label: string;       // "3 required fields missing"
  personName?: string;
  anchor?: string;     // #section-people
};

export function computePendingActions(service, persons, documents): PendingAction[]
```
Logic:
- **Service Details**: count required fields in `service_templates.service_fields` missing from `service_details`
- **Documents**: count expected vs uploaded/verified
- **People**: flag if no directors linked, shareholding doesn't sum to ~100%
- **KYC per person**: check `client_profile_kyc` fields, list incomplete sections (Identity, Financial, Declarations)

### 1B. Create `src/lib/utils/serviceCompletion.ts`
```ts
type SectionCompletion = { percentage: number; ragStatus: 'green' | 'amber' | 'red' };

export function calcServiceDetailsCompletion(serviceFields, serviceDetails): SectionCompletion
export function calcDocumentsCompletion(documents): SectionCompletion
export function calcPeopleCompletion(persons): SectionCompletion
export function calcKycCompletion(persons): SectionCompletion
export function calcOverallCompletion(sections: SectionCompletion[]): SectionCompletion
```
- Service Details: % of required fields filled
- Documents: % of docs verified/uploaded vs expected
- People: green if 1+ director + shareholding OK, red if no people
- KYC: average of all persons' individual KYC field completion
- Overall: weighted average

### 1C. Create `src/lib/utils/clientLabels.ts`
```ts
export const CLIENT_STATUS_LABELS: Record<string, string> = {
  draft: "Getting started",
  in_progress: "In progress",
  submitted: "Submitted for review",
  in_review: "Under review",
  pending_action: "Action needed",
  approved: "Approved",
  rejected: "Needs attention",
};
export function getClientStatusLabel(status: string): string
```

### 1D. Update `tailwind.config.ts`
Add to `theme.extend.colors.brand`:
```
'client-primary': '#3b82f6',
'client-bg': '#f0f9ff',
```

---

## Phase 2: API Routes for Service Persons

### 2A. Create `src/app/api/services/[id]/persons/route.ts`

**POST** — Add person to service
```ts
// Body: { client_profile_id?: string, role: string, full_name?: string, shareholding_percentage?: number }
// If client_profile_id provided: insert profile_service_roles row
// If full_name provided (new person): create client_profiles + client_profile_kyc + profile_service_roles
// Auth: verify caller has can_manage=true for this service
// Always use getTenantId(session) and createAdminClient()
```

### 2B. Create `src/app/api/services/[id]/persons/[roleId]/route.ts`

**PATCH** — Update shareholding_percentage
```ts
// Body: { shareholding_percentage: number }
// Update profile_service_roles row
```

**DELETE** — Remove person from service
```ts
// Delete profile_service_roles row only (keep client_profiles data for reuse)
```

### 2C. Create `src/app/api/services/[id]/available-profiles/route.ts`

**GET** — Returns tenant's client_profiles not already linked to this service
```ts
// 1. Get all profile IDs already linked: profile_service_roles.client_profile_id WHERE service_id = id
// 2. Get all client_profiles WHERE tenant_id = tenantId AND id NOT IN (linked IDs)
// 3. Return: { id, full_name, email }[]
```

---

## Phase 3: Service Detail Page Enhancement

### 3A. Expand data fetching in `src/app/(client)/services/[id]/page.tsx`

Add to existing `Promise.all`:
```ts
// Persons linked to this service
supabase
  .from("profile_service_roles")
  .select(`
    id, role, shareholding_percentage, can_manage,
    client_profiles!inner(
      id, full_name, email, due_diligence_level,
      client_profile_kyc(*)
    )
  `)
  .eq("service_id", id)
  .eq("tenant_id", tenantId),

// DD requirements for KYC wizards
supabase
  .from("due_diligence_requirements")
  .select("*, document_types(id, name)")
  .eq("tenant_id", tenantId)
  .order("sort_order"),

// Document types
supabase
  .from("document_types")
  .select("*")
  .eq("tenant_id", tenantId)
```

Pass `persons`, `requirements`, `documentTypes` as new props to `ClientServiceDetailClient`.

### 3B. Create `src/components/client/ServicePersonsManager.tsx`

Adapts the pattern from `src/components/client/PersonsManager.tsx` (456 lines) for the services model:

- **Add buttons**: "Add Director", "Add Shareholder", "Add UBO"
- **ProfileSelector modal**: calls `/api/services/[id]/available-profiles` instead of `/api/clients/[clientId]/profiles`
- **PersonCard** per linked person:
  - Name, role badge, shareholding % (if shareholder)
  - KYC + Docs dual progress bars
  - Expandable → compact `KycStepWizard` inline
  - Delete button (calls DELETE `/api/services/[id]/persons/[roleId]`)
- **Shareholding tracker**: total %, alert if > 100% or incomplete
- **API calls**: POST/DELETE to new `/api/services/[id]/persons` routes

**Key**: Map `client_profiles.client_profile_kyc` to the `KycRecord`-compatible shape that `KycStepWizard` expects. The fields are the same — it's just a different table name.

**Reuse**: `src/components/shared/ProfileSelector.tsx` (pass different fetch URL), `src/components/kyc/KycStepWizard.tsx` (compact mode)

### 3C. Enhance `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx`

**Current**: 2 sections (Service Details, Documents)
**New**: 3 collapsible sections + overall completion bar

**Top area**: Overall completion percentage bar
```tsx
<div className="mb-6">
  <div className="flex items-center justify-between mb-1">
    <span className="text-sm font-medium text-brand-navy">Overall Progress</span>
    <span className="text-sm text-gray-500">{overallPct}%</span>
  </div>
  <div className="h-2 bg-gray-200 rounded-full">
    <div className="h-2 bg-blue-500 rounded-full" style={{ width: `${overallPct}%` }} />
  </div>
</div>
```

**Section 1 — Service Details** (`id="section-service-details"`)
- Existing DynamicServiceForm (edit mode for draft)
- RAG dot + completion %
- Admin note banners from overrides

**Section 2 — People & KYC** (`id="section-people"`)
- `ServicePersonsManager` component
- RAG dot + combined people + KYC completion %

**Section 3 — Documents** (`id="section-documents"`)
- Existing doc list with verification status
- RAG dot + completion %

**Section header pattern**:
```tsx
<button className="flex items-center w-full p-4" onClick={toggle}>
  <SectionIcon className="h-4 w-4 text-blue-500 mr-2" />
  <span className={`h-2 w-2 rounded-full mr-2 bg-${ragColor}-500`} />
  <span className="font-semibold text-brand-navy">{title}</span>
  <span className="ml-auto text-xs text-gray-400 mr-2">{pct}% complete</span>
  <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
</button>
```

Default open if RAG != green.

---

## Phase 4: Dashboard Rework

### 4A. Create `src/components/client/DashboardClient.tsx`

**Props**:
```ts
type Props = {
  userName: string;
  services: ServiceWithDetails[];
  pendingActions: PendingAction[];
  allComplete: boolean;
};
```

**Structure**:
1. **Greeting banner**:
   - Has actions: "Hi {userName}, please provide the missing information below to complete your application" (amber/warm background)
   - All complete: "All information provided! Your application is under review." (green background)

2. **Pending actions list** (if not all complete):
   - Grouped by service name
   - Each action item: left-border color by section type, clickable → `/services/{serviceId}#{anchor}`
   - Section colors: blue for service details, green for people, amber for KYC, purple for documents

3. **Service cards**: Always shown below, same card pattern as current but for 1+ services
   - Use `getClientStatusLabel()` for friendly status text

### 4B. Rewrite `src/app/(client)/dashboard/page.tsx`

- **Remove** the `if (services.length === 1) { redirect(...) }` block
- **Expand** data fetching: batch-fetch persons + documents for all services at once:
  ```ts
  const serviceIds = services.map(s => s.id);
  
  const [personsRes, docsRes] = await Promise.all([
    supabase.from("profile_service_roles")
      .select("service_id, role, client_profiles(id, full_name, client_profile_kyc(*))")
      .in("service_id", serviceIds)
      .eq("tenant_id", tenantId),
    supabase.from("documents")
      .select("id, service_id, verification_status, document_types(name)")
      .in("service_id", serviceIds)
      .eq("is_active", true),
  ]);
  ```
- **Compute** pending actions server-side: `computePendingActions()` per service
- **Render** `DashboardClient` with all data

---

## Phase 5: Visual Polish

### 5A. Update `src/components/shared/Header.tsx`
Add `variant?: "admin" | "client"` prop. Client variant:
- User initials avatar circle (blue-500 bg, white text)
- Extract initials: `name.split(' ').map(n => n[0]).join('').slice(0, 2)`

### 5B. Update `src/app/(client)/layout.tsx`
- Change `bg-gray-50` → `bg-sky-50/30` on main area
- Pass `variant="client"` to Header

### 5C. Apply friendly labels
- Dashboard: use `getClientStatusLabel()` on service cards
- Service detail: use friendly labels in status displays

---

## CRITICAL RULES

1. Read `CLAUDE.md` for all project conventions
2. `npm run build` must pass clean before every commit
3. Update `CHANGES.md` in every commit
4. Commit and push after each phase
5. Use `createAdminClient()` for server-side queries
6. Use `getTenantId(session)` on EVERY new query
7. shadcn/ui uses `@base-ui/react` — use `render` prop, not `asChild`
8. `Select` `onValueChange` returns `string | null` — always coalesce
9. Supabase join type inference — cast via `unknown` first
10. Keep old `/apply` wizard pages working
11. Do NOT touch admin pages — only client portal

## Don't ask — just build

The owner is working on admin portal changes in parallel. There are no open questions. Make reasonable choices and document in commit messages.

## Verification

After implementation:
1. Login as client (`vanes_vr@yahoo.com` / `Test1234!`) → dashboard shows (no redirect)
2. Greeting with pending action items visible
3. Click action → goes to `/services/[id]#section-people`
4. Service detail: 3 collapsible sections with RAG + percentages
5. People section: add Director/Shareholder/UBO works
6. Expand person → inline KYC wizard renders
7. Documents section shows status
8. Header has user initials avatar
9. Warmer visual feel than admin
10. Old `/apply` wizard pages still work
11. `npm run build` passes clean
