# CLI Brief: Admin Service Detail Rework (B-021)

**Date:** 2026-04-17
**Scope:** Admin services list + admin service detail page. Do NOT touch client pages.

---

## Two changes:
1. Services list — add "by {name}" to Last Updated column
2. Service detail — rewrite to collapsible long-form with 9 sections + admin features

---

## Part 1: Services List — Last Modified By

### `src/app/(admin)/admin/services/page.tsx`

Add a query for the most recent audit_log entry per service:
```ts
const serviceIds = (data ?? []).map(s => s.id);
const { data: lastUpdates } = await supabase
  .from("audit_log")
  .select("entity_id, created_at, actor_name")
  .eq("entity_type", "service")
  .in("entity_id", serviceIds)
  .order("created_at", { ascending: false });

// Build map: serviceId → { lastUpdatedBy, lastUpdatedAt }
const updateMap = new Map<string, { by: string; at: string }>();
for (const row of lastUpdates ?? []) {
  if (!updateMap.has(row.entity_id)) {
    updateMap.set(row.entity_id, { by: row.actor_name, at: row.created_at });
  }
}
```

If `audit_log` doesn't have `entity_type = "service"` entries yet, fall back to `services.updated_at` with no author. Check what `entity_type` values exist in audit_log.

Pass `updateMap` (serialized as a Record) to `ServicesPageClient`.

### `src/app/(admin)/admin/services/ServicesPageClient.tsx`

Update the Last Updated column to show:
```
2h ago
by Jane Doe
```

Two lines — relative time on top (already exists), "by {name}" below in smaller gray text.

---

## Part 2: Admin Service Detail — Collapsible Long-Form

### Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ← Back to Services                                         │
│                                                             │
│  GBC-0001 · Global Business Corporation (GBC)               │
│  Status: [Draft ▾]  Manager: [Jane Doe ▾]                  │
│                                    [Save] [Cancel]          │
│                                                             │
│  ═══════════════════════════════════════════════════════════ │
│                                                             │
│  ▼ Company Setup                    ████████░░ 80%  🟡     │
│  ▼ Financial                        ██████████ 100% 🟢     │
│  ▼ Banking                          ██████████ 100% 🟢     │
│  ▼ People & KYC                     ████░░░░░░ 40%  🔴     │
│  ▼ Documents                        ██░░░░░░░░ 20%  🔴     │
│                                                             │
│  ═══════════════════════════════════════════════════════════ │
│  ADMIN                                                      │
│  ▼ Internal Notes                                           │
│  ▼ Risk Assessment                                          │
│  ▼ Milestones                                               │
│  ▼ Audit Trail                                              │
└─────────────────────────────────────────────────────────────┘
```

### Create reusable section component

**Create:** `src/components/admin/ServiceCollapsibleSection.tsx`

```tsx
type Props = {
  title: string;
  icon?: React.ReactNode;
  percentage?: number;     // 0-100, shown as progress bar
  ragStatus?: 'green' | 'amber' | 'red';
  defaultOpen?: boolean;
  adminOnly?: boolean;     // if true, show "Admin" badge
  children: React.ReactNode;
};
```

Renders a collapsible card with:
- Header: icon + RAG dot + title + progress bar + percentage + chevron
- Body: children (collapsed/expanded)
- Default open if ragStatus !== 'green' or if percentage < 100

### Header Area

**Status dropdown:**
- Dropdown showing current status with color badge
- On change: confirmation dialog with required notes field
- Calls `PATCH /api/admin/services/[id]` with `{ status, note }`
- Reuse pattern from `src/components/admin/StageSelector.tsx`

**Account Manager dropdown:**
- Show current manager name
- Dropdown of all admin users
- On change: calls `POST /api/admin/clients/[id]/account-manager` (or create service equivalent)
- Reuse pattern from `src/components/admin/AccountManagerPanel.tsx`
- Note: may need a new route `POST /api/admin/services/[id]/account-manager` if the old route only works with clients

**Save / Cancel buttons:**
- Save: patches `service_details` via `PATCH /api/admin/services/[id]`
- Cancel: resets form to original values
- Disabled when no changes pending

### Section 1-3: Company Setup / Financial / Banking

Same as client wizard steps 1-3 but:
- Always editable (no draft-only restriction)
- Use `DynamicServiceForm` from `src/components/shared/DynamicServiceForm.tsx`
- Filter fields by section (reuse the `getFieldsForStep()` logic from `src/components/client/ServiceWizard.tsx`)
- Progress % from `src/lib/utils/serviceCompletion.ts`

### Section 4: People & KYC

Same roster as client `ServiceWizardPeopleStep` but with admin extras:
- Admin can toggle `can_manage` per person (PATCH `/api/admin/services/[id]/roles/[roleId]`)
- Admin can edit ALL KYC fields (no restrictions)
- Deduplicate by profile ID, show combined role badges
- KYC % per person, "Review KYC" opens inline form
- "Request to fill and review KYC" invite button (same as client)
- Add Director / Add Shareholder / Add UBO buttons
- Shareholding tracker

### Section 5: Documents

- List all documents with verification status badges (verified ✓, flagged ⚠, rejected ✗, pending ○)
- **Admin Document Uploader** — reuse `src/components/admin/AdminDocumentUploader.tsx` or create inline upload
- **Flagged Discrepancies** — reuse `src/components/admin/FlaggedDiscrepanciesCard.tsx`
- **Re-verify button** per document — calls `/api/verify-document` to re-run AI verification
- File name, upload date, uploaded by, document type

### Section 6: Internal Notes (ADMIN ONLY)

- Textarea for admin-only notes
- Not visible to client portal
- Store in `services.service_details` under key `_admin_notes` (prefixed with underscore to distinguish from template fields)
- Auto-save or save with the main Save button

### Section 7: Risk Assessment (ADMIN ONLY)

Reuse and adapt existing components:
- **DD Level selector** — dropdown (SDD/CDD/EDD). Changes via `PATCH /api/admin/services/[id]` or a dedicated route
- **Compliance Scorecard** — reuse `src/components/admin/ComplianceScorecard.tsx` adapted for service model
  - Overall completion %
  - Section breakdown (Company, Financial, Banking, People, Documents, KYC)
  - Approval readiness blockers
- **Risk Flags** — reuse `src/components/admin/RiskFlagBanner.tsx`
  - Show active flags with dismiss option
  - PEP/Sanctions/AML check status per person

### Section 8: Milestones (ADMIN ONLY)

Three milestone rows, each with:
- Toggle switch (on/off)
- Label (LOE Received, Invoice Sent, Payment Received)
- **Date picker** — when toggled on, auto-fills today's date but is editable
- When toggled off, date clears

Reuse `src/components/admin/WorkflowMilestonesCard.tsx` but ensure dates are displayed and editable (not just toggle buttons).

Fields on `services` table: `loe_received` (boolean), `loe_received_at` (timestamp), `invoice_sent_at` (timestamp), `payment_received_at` (timestamp).

Save via `PATCH /api/admin/services/[id]`.

### Section 9: Audit Trail (ADMIN ONLY)

Full change history for this service. Reuse `src/components/admin/AuditTrail.tsx` or `ClientAuditTrailDialog.tsx`.

**Filters:**
- **By user** — dropdown of all actors who made changes to this service (query distinct `actor_name` from audit_log for this entity)
- **By action type** — status_change, field_edit, document_upload, person_added, person_removed, etc.
- **By date range** — start date / end date pickers

**Each entry shows:**
- Timestamp (relative + absolute on hover)
- Actor name + role badge
- Action description
- Old value → New value (if applicable)

Query: `audit_log WHERE entity_type = 'service' AND entity_id = {serviceId}` ordered by `created_at DESC`.

---

## Server Page Data Fetching

### `src/app/(admin)/admin/services/[id]/page.tsx`

Expand `Promise.all` to fetch:

```ts
// Existing:
- service + template
- profile_service_roles + client_profiles + client_profile_kyc
- service_section_overrides
- documents

// Add:
- admin_users (for manager dropdown)
  supabase.from("admin_users").select("user_id, users(full_name, email)")

- audit_log (for audit trail section)
  supabase.from("audit_log")
    .select("*")
    .eq("entity_type", "service")
    .eq("entity_id", id)
    .order("created_at", { ascending: false })
    .limit(100)

- current account manager (if client_account_managers is used for services)
  Check if services use the same manager table or need a new one

- due_diligence_requirements (for compliance scorecard)
  supabase.from("due_diligence_requirements")
    .select("*, document_types(id, name)")
    .eq("tenant_id", tenantId)

- document_types
  supabase.from("document_types").select("*").eq("tenant_id", tenantId)
```

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
10. Reuse existing admin components wherever possible — don't rebuild what exists
11. `documents.tenant_id` column exists (added in B-020)
12. Deduplicate persons by profile ID in People & KYC section (same pattern as client)

## Verification

1. Admin login → `/admin/services` — Last Updated shows "2h ago by Jane Doe"
2. Click service → 9 collapsible sections load
3. Sections 1-3: editable service fields with progress bars
4. Section 4: person roster with KYC %, add/remove, inline KYC review
5. Section 5: documents with admin upload, AI flags, re-verify
6. Section 6: internal notes save correctly
7. Section 7: DD level dropdown, compliance %, risk flags
8. Section 8: milestone toggles with date pickers
9. Section 9: audit trail with user/action/date filters
10. Status dropdown works with confirmation + notes
11. Account Manager dropdown works
12. Save/Cancel in header works
13. `npm run build` passes clean
