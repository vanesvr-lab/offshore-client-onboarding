# CLI Brief: Phase 2-5 Implementation

**Date:** 2026-04-17
**Prerequisite:** SQL migration `supabase/migrations/003-phase1-schema.sql` has been run in Supabase.
**Planning doc:** `docs/services-profiles-redesign.md` — read this FIRST for full context.
**Phase 1 is already complete** — auth, types, tenant helper, profiles list/detail pages, sidebar nav.

You are implementing the Services + Profiles redesign for a KYC/AML onboarding web app.
The old model (Client → Applications) is being replaced with (Profiles → Services).
Phase 1 created the new DB tables and migrated data. Now build the UI.

---

## PHASE 2: Services Page

### 2A: Services List Page

**Create:** `src/app/(admin)/admin/services/page.tsx` (redirect from `/admin/applications` to `/admin/services`)

Actually — the sidebar already points to `/admin/applications`. For backward compat, keep the existing `/admin/applications` page working but ALSO create `/admin/services/page.tsx` that queries the NEW `services` table.

**Create:** `src/app/(admin)/admin/services/page.tsx`
- Server component, `force-dynamic`
- Query `services` table with joins:
  ```
  services.select(`
    *,
    service_templates(name, description),
    profile_service_roles(
      id, role, can_manage,
      client_profiles(id, full_name, email, is_representative)
    )
  `)
  .eq("tenant_id", getTenantId(session))
  .eq("is_deleted", false)
  .order("created_at", { ascending: false })
  ```
- Pass to `ServicesPageClient`

**Create:** `src/app/(admin)/admin/services/ServicesPageClient.tsx`
- Search bar + status filter (all/draft/submitted/in_review/approved/rejected)
- Table columns: Service Name (from template), Status (badge), People (count + names), LOE (check/x), Created
- Row click → `/admin/services/[id]`
- "New Service" button → service creation wizard

**Update sidebar:** Change the Services href from `/admin/applications` to `/admin/services`.

### 2B: Service Detail Page

**Create:** `src/app/(admin)/admin/services/[id]/page.tsx`
- Server component fetching: service + template + profile_service_roles with client_profiles + client_profile_kyc + documents + service_section_overrides

**Create:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`

Layout from planning doc (section 4.2):
```
┌──────────────────────────────────┬──────────────────────────┐
│  LEFT: Wizard-style sections     │  RIGHT: People panel     │
│  (collapsible, RAG indicators)   │                          │
│                                  │  Per-profile:            │
│  § Company Details        🟢    │    Name — Roles          │
│  § Service Details        🟡    │    KYC: 🟢  Docs: 🟢    │
│  § Documents              🔴    │    [can_manage toggle]    │
│                                  │    [Send invite] button  │
│                                  │                          │
│                                  │  [+ Add profile]         │
│                                  │                          │
│                                  │  OVERALL STATUS          │
│                                  │  KYC:  2/3 complete      │
│                                  │  Docs: 4/7 uploaded      │
│                                  │                          │
│                                  │  LOE: ☐ received         │
│                                  │  Workflow milestones     │
└──────────────────────────────────┴──────────────────────────┘
```

**Left panel sections:**
Each section is collapsible with RAG indicator (green/amber/red).
- **Company Details**: from `services.service_details` — company names, type, country, address
- **Service Details**: from `services.service_details` via DynamicServiceForm (read `service_templates.service_fields` for field definitions)
- **Documents**: list of required + uploaded documents for the service

RAG logic:
- Auto-calculated: Green = all fields filled, Amber = partial, Red = missing required
- Admin can override via `service_section_overrides` table
- If override exists, show admin note (e.g., "Please re-upload passport")

**Right panel — People:**
For each profile linked via `profile_service_roles`:
- Name, role(s), is_representative badge
- KYC status: calculated from `client_profile_kyc` (green/amber/red) or "N/A" if rep
- Doc status: calculated from `documents` where `client_profile_id` matches
- `can_manage` toggle (PATCH `/api/admin/services/[id]/roles/[roleId]`)
- "Send invite" button (separate from can_manage — uses B-014 flow for non-login profiles, or primary invite for login profiles)
- [+ Add profile] button: opens dialog to search existing profiles or create new

**API routes needed:**
- `GET /api/admin/services/[id]` — full service + template + roles + profiles + docs
- `PATCH /api/admin/services/[id]` — update service_details, status, LOE, milestones
- `POST /api/admin/services/[id]/roles` — link a profile to this service
- `PATCH /api/admin/services/[id]/roles/[roleId]` — toggle can_manage, update role
- `DELETE /api/admin/services/[id]/roles/[roleId]` — unlink a profile
- `POST /api/admin/services/[id]/section-override` — admin sets RAG override + note
- `DELETE /api/admin/services/[id]/section-override/[key]` — remove override

### 2C: Service Creation Wizard

**Create:** `src/app/(admin)/admin/services/new/page.tsx` + `NewServiceWizard.tsx`

Wizard steps:
1. **Pick service type** — grid of service_templates cards
2. **Add people** — search existing profiles, create new, assign roles, toggle can_manage
3. **Service details** — DynamicServiceForm (driven by template's service_fields)
4. **Review** — summary of all selections

On submit: POST creates `services` row + `profile_service_roles` rows.

---

## PHASE 3: Admin Configurability

### 3A: Document Types CRUD

**Create:** `src/app/(admin)/admin/settings/document-types/page.tsx`
- List all document_types grouped by category
- Add/edit/delete document types
- Toggle is_active
- Edit verification_rules_text (plain English rules)

**API:** `POST/PATCH/DELETE /api/admin/document-types/[id]`

### 3B: DD Requirements Management

**Expand:** `src/app/(admin)/admin/settings/due-diligence/page.tsx`
Currently view-only. Expand to:
- Per DD level (SDD/CDD/EDD): list of requirements (document + field)
- Admin can add new requirements (pick document_type or field_key)
- Admin can remove requirements
- Admin can set `applies_to` (individual/organisation/both)
- Show cumulative view: "EDD includes all of CDD + SDD + these additional"

**API:** `POST/PATCH/DELETE /api/admin/due-diligence/requirements/[id]`

### 3C: Role Requirements Management

**Create:** `src/app/(admin)/admin/settings/role-requirements/page.tsx`
- Per role (director/shareholder/UBO/other): list of required document types
- Admin can add/remove document types per role

**API:** `POST/DELETE /api/admin/role-requirements/[id]`

### 3D: Profile Requirement Overrides UI

On the Profile detail page (`/admin/profiles/[id]`):
- Section showing "Requirements for this profile" = DD level requirements + role requirements
- Toggle button per requirement: "Waive this requirement" → creates `profile_requirement_overrides` row
- Reason text field for the waiver

---

## PHASE 4: Client Portal Rebuild

### 4A: Client Dashboard

**Rewrite:** `src/app/(client)/dashboard/page.tsx`

New logic:
- Query `profile_service_roles WHERE can_manage = true AND client_profile_id = session.user.clientProfileId`
- If exactly 1 service → auto-redirect to `/services/[id]`
- If 2+ services → show dashboard with service cards

Each service card shows:
- Service name (from template)
- Status
- Action count ("3 items need your attention")
- Specific pending actions listed (e.g., "Upload Proof of Address", "Complete Financial section")
- [Continue →] button

### 4B: Client Service Detail

**Create:** `src/app/(client)/services/[id]/page.tsx`

Same wizard-style sections as admin view BUT:
- No admin-only fields (risk assessment, etc.)
- Client can edit service_details fields
- Client can upload documents
- Admin notes/flags are VISIBLE to client
- RAG colors per section
- Clear action indicators

### 4C: Data-Driven KYC Wizard

**Rewrite the KYC step components** to be data-driven:
- Instead of hardcoded `IdentityStep.tsx`, `FinancialStep.tsx`, `DeclarationsStep.tsx`:
- One `DynamicKycStep.tsx` that reads required fields from `due_diligence_requirements` where `requirement_type = 'field'`
- Groups fields by section (add `section` column to `due_diligence_requirements` if needed, or derive from field_key prefix)
- Document upload slots driven by `due_diligence_requirements` where `requirement_type = 'document'`

Keep the wizard step-by-step UX, but each step's content comes from the DB.

### 4D: AI Auto-Populate on Document Upload

When a document is uploaded and AI extracts fields:
- Map extracted field names to `client_profile_kyc` column names
- Auto-fill empty KYC fields (don't overwrite existing values)
- Show "Auto-filled from [Document Name]" indicator next to pre-populated fields

Update `src/app/api/verify-document/route.ts` or the upload flow to write extracted fields back to `client_profile_kyc`.

---

## PHASE 5: Cleanup

### 5A: Fix Hardcoded Lists
- `src/components/kyc/IndividualKycForm.tsx`: Replace 11-country NATIONALITIES and COUNTRIES with full ISO list (reuse the 200+ list from `MultiSelectCountry.tsx`)
- `src/components/kyc/OrganisationKycForm.tsx`: Replace 12 JURISDICTIONS with full country list
- `src/lib/utils/completionCalculator.ts`: Replace hardcoded document names + field lists with DB-driven calculation

### 5B: Replace Hardcoded Document Lookups
All `documentTypes.find(dt => dt.name === "Certified Passport Copy")` patterns in:
- `IdentityStep.tsx`, `FinancialStep.tsx`, `DeclarationsStep.tsx`, `ReviewStep.tsx`
- `IndividualKycForm.tsx`
Replace with lookups by `due_diligence_requirements` for the profile's DD level.

### 5C: Update Compliance Scoring
- `src/lib/utils/complianceScoring.ts`: Remove hardcoded `LEVEL_INCLUDES` and `SECTION_FOR_LEVEL`. Read from DB.
- `src/lib/utils/profileDocumentRequirements.ts`: Same — remove duplicated `LEVEL_INCLUDES`.
- Consolidate into one shared utility.

### 5D: Update Dashboard Analytics
- `src/app/(admin)/admin/dashboard/page.tsx`: Update queries to use `services` table instead of `applications`
- Update stat cards: "Total Services" instead of "Total Applications"

---

## IMPORTANT RULES

1. **ALWAYS update CHANGES.md** as part of every commit
2. Run `npm run build` before committing — must pass clean
3. Use `getTenantId(session)` from `src/lib/tenant.ts` on EVERY new query
4. Use `createAdminClient()` for server-side queries (service role)
5. shadcn/ui uses `@base-ui/react` — no `asChild` prop, use `render` prop
6. `Select` `onValueChange` returns `string | null` — always coalesce
7. Supabase join type inference — cast via `unknown` first
8. Keep old pages working (backward compat) — don't delete old routes until Phase 5
9. Commit and push after each logical batch
10. Reference `docs/services-profiles-redesign.md` for full schema details and decisions

---

## PRIORITY ORDER

If you can't finish everything, prioritize in this order:
1. **Phase 2A + 2B** (Services list + detail page) — highest impact
2. **Phase 2C** (Service creation wizard) — enables new workflow
3. **Phase 4A** (Client dashboard auto-redirect) — quick win
4. **Phase 3A + 3B** (Doc types + DD requirements CRUD) — enables configurability
5. Everything else

---

## VERIFICATION

After implementation:
1. Admin login → sidebar shows Services / Profiles / Queue
2. `/admin/services` → shows migrated services from old applications
3. `/admin/services/[id]` → shows wizard-style sections + people panel with RAG indicators
4. `/admin/profiles` → shows all profiles with services count
5. `/admin/profiles/[id]` → shows KYC + linked services
6. Create new service via wizard → links profiles → appears in list
7. Client login → sees services they can manage
8. Old `/admin/clients` and `/admin/applications` pages still work
9. `npm run build` passes clean
