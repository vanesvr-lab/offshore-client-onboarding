# Services + Profiles Redesign — Planning Document

**Created:** 2026-04-16
**Status:** Approved — ready for implementation
**Previous version:** v0.1.0-poc (tagged in git)

---

## 1. Overview

Major architectural redesign of the GWMS Client Onboarding Portal. The current Client/Application model is replaced with a Services + Profiles model that better reflects the real-world workflow.

### What changes
- **"Client" concept is removed** — replaced by Services (the billable engagement) and Profiles (the people involved)
- **Auth is separated from business data** — `users` table (login) is distinct from `client_profiles` (business/KYC data)
- **KYC data stays in its own table** — `client_profile_kyc` linked 1:1 to `client_profiles`
- **Requirements become fully data-driven** — DD requirements, role requirements, and field requirements all come from configurable DB tables
- **Admin can configure everything** — document types, DD requirements per level, role requirements, per-profile overrides

### What stays the same
- Service templates (GBC-AC, Trust, etc.) — admin-configurable as today
- DynamicServiceForm — template-driven, works on `services.service_details` JSONB
- AI document verification — same flow, updated FKs
- B-014 passwordless KYC — same mechanism, FK points to `client_profiles`
- Audit logging via DB triggers — same pattern, updated table names

---

## 2. Database Schema

### 2.1 `users` (replaces `profiles` for auth)

Pure auth/login table. No business data.

```sql
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  full_name text NOT NULL,
  phone text,
  password_hash text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Notes:**
- `role` is just `admin` or `user`. No client/representative distinction at login level.
- `admin_users` table kept as-is for admin-specific settings (FK → users.id).
- `is_active = false` disables login without deleting.

### 2.2 `client_profiles` (replaces `clients` + `kyc_records` identity portion)

All persons involved in any service — clients, representatives, directors, shareholders, UBOs.

```sql
CREATE TABLE client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id),
  -- NULLABLE: NULL = no login. Set when can_manage toggled + invite sent.
  -- UNIQUE: one user = one client_profile (1:1)

  record_type text NOT NULL DEFAULT 'individual'
    CHECK (record_type IN ('individual', 'organisation')),
  is_representative boolean NOT NULL DEFAULT false,
  -- true = no KYC required, just contact person

  -- Contact info (always filled)
  full_name text NOT NULL,
  email text,
  phone text,
  address text,

  -- Due diligence
  due_diligence_level text NOT NULL DEFAULT 'cdd'
    CHECK (due_diligence_level IN ('sdd', 'cdd', 'edd')),
  -- Per-profile. Admin can change during service onboarding.

  -- Tracking
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_client_profiles_user ON client_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_client_profiles_email ON client_profiles(email);
```

### 2.3 `client_profile_kyc` (replaces `kyc_records` KYC portion, 1:1 with client_profiles)

Separated from client_profiles to avoid a 60+ column table.

```sql
CREATE TABLE client_profile_kyc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL UNIQUE REFERENCES client_profiles(id) ON DELETE CASCADE,

  -- Individual identity
  aliases text,
  work_address text,
  work_phone text,
  work_email text,
  date_of_birth date,
  nationality text,
  passport_country text,
  passport_number text,
  passport_expiry date,
  occupation text,
  tax_identification_number text,

  -- Financial / compliance
  source_of_funds_description text,
  source_of_wealth_description text,
  is_pep boolean,
  pep_details text,
  legal_issues_declared boolean,
  legal_issues_details text,

  -- Organisation-only (when record_type='organisation')
  business_website text,
  jurisdiction_incorporated text,
  date_of_incorporation date,
  listed_or_unlisted text CHECK (listed_or_unlisted IN ('listed', 'unlisted')),
  jurisdiction_tax_residence text,
  description_activity text,
  company_registration_number text,
  industry_sector text,
  regulatory_licenses text,

  -- Admin risk assessment (admin-only, not visible to client)
  sanctions_checked boolean NOT NULL DEFAULT false,
  sanctions_checked_at timestamptz,
  sanctions_notes text,
  adverse_media_checked boolean NOT NULL DEFAULT false,
  adverse_media_checked_at timestamptz,
  adverse_media_notes text,
  pep_verified boolean NOT NULL DEFAULT false,
  pep_verified_at timestamptz,
  pep_verified_notes text,
  risk_rating text CHECK (risk_rating IN ('low', 'medium', 'high', 'prohibited')),
  risk_rating_justification text,
  risk_rated_by uuid REFERENCES users(id),
  risk_rated_at timestamptz,
  geographic_risk_assessment text,
  relationship_history text,

  -- EDD fields
  risk_flags jsonb,
  senior_management_approval boolean,
  senior_management_approved_by uuid REFERENCES users(id),
  senior_management_approved_at timestamptz,
  ongoing_monitoring_plan text,

  -- Progress
  completion_status text NOT NULL DEFAULT 'incomplete'
    CHECK (completion_status IN ('incomplete', 'complete')),
  kyc_journey_completed boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### 2.4 `services` (replaces `clients` + `applications` merged)

The billable engagement. The thing being formed (GBC-AC company, Trust, etc.).

```sql
CREATE TABLE services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_template_id uuid NOT NULL REFERENCES service_templates(id),
  service_details jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Proposed company names, turnover, bank prefs, etc.
  -- Driven by service_templates.service_fields schema

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'submitted', 'in_review', 'approved', 'rejected')),

  -- LOE
  loe_received boolean NOT NULL DEFAULT false,
  loe_received_at timestamptz,

  -- Workflow milestone dates (admin-managed)
  invoice_sent_at timestamptz,
  payment_received_at timestamptz,

  -- Tracking
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Key difference from old `applications`:** No `client_id` FK. People are linked via `profile_service_roles`.

### 2.5 `profile_service_roles` (replaces `client_users` + `profile_roles`)

Junction linking profiles to services with role and access control.

```sql
CREATE TABLE profile_service_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES client_profiles(id),
  service_id uuid NOT NULL REFERENCES services(id),

  role text NOT NULL CHECK (role IN ('director', 'shareholder', 'ubo', 'other')),
  can_manage boolean NOT NULL DEFAULT false,
  -- true = this person can log in and manage this service in the portal
  -- Toggling ON does NOT auto-send invite (separate admin action)

  shareholding_percentage numeric,

  -- Invite tracking
  invite_sent_at timestamptz,
  invite_sent_by uuid REFERENCES users(id),

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(client_profile_id, service_id, role)
);

CREATE INDEX idx_psr_profile ON profile_service_roles(client_profile_id);
CREATE INDEX idx_psr_service ON profile_service_roles(service_id);
CREATE INDEX idx_psr_can_manage ON profile_service_roles(can_manage) WHERE can_manage = true;
```

### 2.6 `due_diligence_requirements` (expanded — now tracks fields AND documents)

```sql
CREATE TABLE due_diligence_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  level text NOT NULL CHECK (level IN ('sdd', 'cdd', 'edd')),
  requirement_type text NOT NULL CHECK (requirement_type IN ('document', 'field')),

  document_type_id uuid REFERENCES document_types(id),
  -- Set when requirement_type = 'document'

  field_key text,
  -- Set when requirement_type = 'field'
  -- e.g. 'passport_number', 'source_of_funds_description', 'is_pep'

  applies_to text NOT NULL DEFAULT 'both'
    CHECK (applies_to IN ('individual', 'organisation', 'both')),

  is_required boolean NOT NULL DEFAULT true,
  description text,
  sort_order int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

**Cumulative:** EDD includes CDD includes SDD. The application code filters by `level IN ('sdd')` for SDD profiles, `level IN ('sdd','cdd')` for CDD, etc.

**Admin-configurable:** Full CRUD via `/admin/settings/due-diligence`.

### 2.7 `role_document_requirements` (unchanged schema, now admin-configurable)

```sql
-- Existing table, no schema change
role_document_requirements (
  id, role, document_type_id, is_required, sort_order
);
-- NEW: Admin CRUD via /admin/settings/role-requirements
```

### 2.8 `profile_requirement_overrides` (new)

Per-profile override of DD or role requirements.

```sql
CREATE TABLE profile_requirement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_id uuid NOT NULL REFERENCES client_profiles(id),
  requirement_id uuid NOT NULL REFERENCES due_diligence_requirements(id),

  is_required boolean NOT NULL,
  -- false = "this profile doesn't need this even though their DD level requires it"
  -- true  = "this profile needs this even though their DD level doesn't require it"

  reason text,
  overridden_by uuid REFERENCES users(id),
  overridden_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(client_profile_id, requirement_id)
);
```

### 2.9 `service_section_overrides` (new — for RAG indicators)

Only rows that admin has overridden exist. If no row, auto-calculated status applies.

```sql
CREATE TABLE service_section_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id uuid NOT NULL REFERENCES services(id),
  section_key text NOT NULL,
  -- e.g. 'company_details', 'people', 'documents', or a document_type_id

  override_status text NOT NULL CHECK (override_status IN ('green', 'amber', 'red')),
  admin_note text,
  -- "Please re-upload certified passport copy"

  overridden_by uuid REFERENCES users(id),
  overridden_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(service_id, section_key)
);
```

### 2.10 `documents` (updated FKs)

```sql
-- Key changes from current:
documents (
  id uuid PK,
  client_profile_id uuid FK → client_profiles,  -- was: client_id → clients + kyc_record_id → kyc_records
  service_id uuid FK → services (NULLABLE),      -- for service-level docs
  document_type_id uuid FK → document_types,
  file_path, file_name, file_size, mime_type,
  verification_status, verification_result jsonb,
  admin_status, admin_status_note, admin_status_by, admin_status_at,
  uploaded_by uuid FK → users (NULLABLE),
  uploaded_at, verified_at,
  is_active boolean
);
```

### 2.11 `verification_codes` (updated FK)

```sql
-- Key change: kyc_record_id → client_profile_id
verification_codes (
  id uuid PK,
  client_profile_id uuid FK → client_profiles,  -- was: kyc_record_id → kyc_records
  access_token text UNIQUE,
  code text,
  email text,
  verified_at timestamptz,
  expires_at timestamptz,
  attempts int DEFAULT 0,
  created_at timestamptz
);
```

### 2.12 Tables unchanged

```
service_templates          — same (GBC-AC, Trust, etc.)
document_types             — same schema, now admin CRUD-able
due_diligence_settings     — same (auto_approve, requires_senior_approval per level)
knowledge_base             — same
admin_users                — same (FK updated to users.id)
audit_log                  — same structure, updated FKs
```

### 2.13 Tables removed

```
clients                    — GONE (absorbed into services + client_profiles)
client_users               — GONE (replaced by profile_service_roles.can_manage)
kyc_records                — GONE (split into client_profiles + client_profile_kyc)
profile_roles              — GONE (replaced by profile_service_roles)
applications               — GONE (replaced by services)
profiles (old auth table)  — GONE (replaced by users)
```

---

## 3. Decisions Log

All decisions made during brainstorming session on 2026-04-16:

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | Auth separated from business data (`users` vs `client_profiles`) | Avoid coupling login concerns with KYC/business data. Future-proofs for auth provider changes. |
| 2 | KYC in separate table (`client_profile_kyc`, 1:1) | Avoids 60+ column table. KYC is its own concern, can be versioned/audited independently. |
| 3 | User role is just `admin` or `user` | Client vs representative is a profile attribute, not a login attribute. Both see the same portal; they just see different services. |
| 4 | `is_representative` flag on `client_profiles` | Same table, just a boolean. If someone needs to be both client and rep, create a second profile. |
| 5 | Profiles are global and reusable across services | One John Smith row. Linked to N services via `profile_service_roles`. |
| 6 | Standalone profiles allowed (no service required) | Admin can create a profile as a prospect. Services come later. |
| 7 | Profiles can be individual or organisation | `record_type` flag. Org KYC has different fields. |
| 8 | LOE is per-service, tracks "received" not "sent" | Admin checks a box when LOE comes back. Doesn't track who received it. |
| 9 | `can_manage` and "send invite" are separate actions | Toggling `can_manage` grants permission. Admin separately clicks "Send invite" when ready. |
| 10 | Multiple profiles can manage a single service | E.g., director + lawyer rep both have login access. |
| 11 | Auto-redirect if only 1 service | If a user manages exactly 1 service, skip dashboard and go to service detail. |
| 12 | DD level lives on `client_profiles`, default CDD | Per-profile. Admin can override during onboarding. |
| 13 | DD requirements cumulative (EDD = SDD + CDD + EDD) | Standard compliance model. |
| 14 | DD requirements control both docs AND fields | `requirement_type: 'document' | 'field'` in same table. |
| 15 | Per-profile requirement overrides | Admin can waive specific docs/fields for a specific profile. |
| 16 | Admin can create custom document types | Full CRUD on `document_types` + assign to DD levels. |
| 17 | Admin can configure role requirements | `role_document_requirements` becomes admin-configurable. |
| 18 | RAG status = auto-calculated + admin override | Green/amber/red per section. Admin can override any section with a note. |
| 19 | Soft-delete decoupled | Delete profile = only that profile. Delete service = only that service + role associations. Independent. |
| 20 | KYC wizard stays step-by-step but data-driven | Keep wizard UX, but each step reads from DB to know what to show. No more hardcoded field lists. |
| 21 | Dropdown lists use standard complete lists | Full ISO country list everywhere. Not admin-configurable. Just fix inconsistency. |
| 22 | AI auto-populates KYC fields from document uploads | Extracted fields (passport number, expiry, etc.) write back to `client_profile_kyc`. |
| 23 | Profile requirements are additive and follow the profile | DD level requirements + role requirements (from ALL services) = total requirement set. Upload once, satisfies all. |

---

## 4. UI Layout

### 4.1 Admin Sidebar

```
Dashboard
Services        (was: Clients + Applications)
Profiles        (new top-level)
Queue           (review queue)
Settings
  ├── Templates          (service templates)
  ├── Document Types     (NEW: CRUD for doc types)
  ├── Due Diligence      (expanded: CRUD for DD requirements + role requirements)
  ├── Rules              (AI verification rules)
  ├── Workflow           (workflow stages)
  └── Knowledge Base
```

### 4.2 Service Detail Page (admin)

```
┌──────────────────────────────────┬──────────────────────────┐
│  LEFT: Wizard-style sections     │  RIGHT: People panel     │
│  (collapsible, RAG indicators)   │                          │
│                                  │  Alice — Dir, SH         │
│  § Company Details        🟢    │    KYC: 🟢  Docs: 🟢    │
│    ▸ (collapsed — all done)      │    [can_manage ✅]        │
│                                  │    [Send invite] [Resend] │
│  § Service Details        🟡    │                          │
│    ▾ (expanded — partial)        │  Bob — Rep               │
│    Proposed names: Acme Ltd      │    KYC: n/a  Docs: n/a   │
│    Turnover: ___                 │    [can_manage ✅]        │
│    Bank: ___                     │                          │
│                                  │  Charlie — UBO           │
│  § Documents              🔴    │    KYC: 🔴  Docs: 🟡    │
│    ▾ (expanded — needs action)   │    [can_manage ☐]        │
│    ⚠️ Admin: "Passport not       │                          │
│       legible, re-upload"        │  [+ Add profile]         │
│                                  │                          │
│  § Financial Info         🟢    ├──────────────────────────┤
│    ▸ (collapsed — all done)      │  OVERALL STATUS          │
│                                  │  KYC:  2/3 profiles done │
│                                  │  Docs: 4/7 uploaded      │
│                                  │                          │
│                                  ├──────────────────────────┤
│                                  │  LOE: ☐ received         │
│                                  │  Workflow milestones     │
│                                  │  Audit trail             │
└──────────────────────────────────┴──────────────────────────┘
```

### 4.3 Profile Detail Page (admin)

```
┌─ Alice Smith ── Individual ── Client ────────────────────┐
│  Email / Phone / Address                                  │
│  DD Level: [CDD ▾]   [Edit KYC]  [Send invite]  [Delete] │
├───────────────────────────────────────────────────────────┤
│  KYC Details (collapsible sections)                       │
│    § Identity      🟢                                    │
│    § Financial     🟡                                    │
│    § Declarations  🟢                                    │
├───────────────────────────────────────────────────────────┤
│  Services                                                 │
│  • GBC-AC #1 — Director, Shareholder  [can_manage ✅]     │
│  • Trust #2  — UBO                    [can_manage ☐]      │
│  [Start new service]                                      │
├───────────────────────────────────────────────────────────┤
│  Documents (across all services)  │  Audit trail          │
└───────────────────────────────────────────────────────────┘
```

### 4.4 Client Portal (after login)

```
IF user manages 1 service → auto-redirect to that service
IF user manages 2+ services → show dashboard:

┌─────────────────────────────────────────────────────────────┐
│  Welcome, Alice                                              │
│                                                              │
│  ┌──────────────────────────────────┐                       │
│  │ GBC-AC — Acme Holdings Ltd       │                       │
│  │ 🟡 3 items need your attention   │                       │
│  │   • Upload Proof of Address      │                       │
│  │   • Complete Financial section    │                       │
│  │   • Re-upload Passport (flagged)  │                       │
│  │ [Continue →]                      │                       │
│  └──────────────────────────────────┘                       │
│                                                              │
│  ┌──────────────────────────────────┐                       │
│  │ Trust — Family Trust              │                       │
│  │ 🟢 All sections complete          │                       │
│  │ [View →]                          │                       │
│  └──────────────────────────────────┘                       │
└─────────────────────────────────────────────────────────────┘

SERVICE DETAIL (client view):
  Same wizard-style collapsible sections as admin
  BUT: no admin-only fields (risk assessment, etc.)
  Admin notes/flags are VISIBLE to client (e.g., "Please re-upload passport")
  Clear action indicators per section
  RAG colors per section
```

---

## 5. Configurability Audit — What Must Change

### RED — Must become data-driven (currently hardcoded)

| File | What's hardcoded | Fix |
|------|-----------------|-----|
| `completionCalculator.ts` | Document type names, required field lists, section groupings | Replace with DB-driven calculation from `due_diligence_requirements` |
| `ReviewStep.tsx:57-66` | Which docs per DD level | Read from `due_diligence_requirements` |
| `IdentityStep.tsx`, `FinancialStep.tsx`, `DeclarationsStep.tsx` | `documentTypes.find(dt => dt.name === "...")` lookups | Steps become data-driven: read required docs from DB, render dynamically |
| `IndividualKycForm.tsx`, `OrganisationKycForm.tsx` | Same doc name lookups | Replace with dynamic rendering |
| No admin UI for document types | Seed SQL only | Build `/admin/settings/document-types` CRUD page |
| No admin UI for DD requirements | View-only | Build full CRUD in `/admin/settings/due-diligence` |
| No admin UI for role requirements | No UI at all | Build `/admin/settings/role-requirements` CRUD page |

### AMBER — Fix to use standard lists

| File | What's hardcoded | Fix |
|------|-----------------|-----|
| `IndividualKycForm.tsx` | 11 nationalities + 11 countries | Use full ISO 3166 country list (200+) — same as `MultiSelectCountry.tsx` |
| `OrganisationKycForm.tsx` | 12 jurisdictions | Use full country list |
| `KycStepWizard.tsx` | Step labels, SDD skip logic | Make step definitions data-driven from DD requirements |

### GREEN — Already configurable (no change needed)

| What | How |
|------|-----|
| Service templates | Admin UI at `/admin/settings/templates` |
| Service form fields | `service_templates.service_fields` JSONB |
| AI verification rules | `document_types.verification_rules_text` |
| DD settings (auto-approve) | Admin UI at `/admin/settings/due-diligence` |

---

## 6. KYC Completeness Calculation

Profile-level. Additive. Follows the profile everywhere.

```
function calculateProfileRequirements(profile, allServices):

  1. Get DD level requirements:
     SELECT * FROM due_diligence_requirements
     WHERE level IN (cumulative levels for profile.due_diligence_level)
     AND applies_to IN (profile.record_type, 'both')

  2. Get role requirements (from ALL services this profile is linked to):
     For each profile_service_roles row:
       SELECT * FROM role_document_requirements WHERE role = psr.role
     Union all, deduplicate by document_type_id

  3. Apply overrides:
     SELECT * FROM profile_requirement_overrides
     WHERE client_profile_id = profile.id
     Remove items where override.is_required = false
     Add items where override.is_required = true

  4. Split result into:
     field_requirements: [{field_key, is_required}]
     document_requirements: [{document_type_id, is_required}]

  5. Check completion:
     For fields: is client_profile_kyc.[field_key] non-null?
     For docs: does documents table have a row for that type
               with verification_status != 'rejected'?

  6. Return:
     { fields_complete: X/Y, docs_complete: X/Y, overall: 'green'|'amber'|'red' }
```

---

## 7. Login / Invite Flow

```
1. Admin creates client_profile (no user row yet)
2. Admin links profile to service via profile_service_roles
3. Admin toggles can_manage = true
   → Permission granted, but no invite sent yet
4. Admin clicks "Send invite" button
   → IF profile has no user_id:
       Create users row (email, temp password_hash)
       Set client_profiles.user_id = new user.id
   → Send email with password-set link
   → Set profile_service_roles.invite_sent_at
5. Person clicks link → sets password → logs in
   → Sees all services where they have can_manage = true
6. For non-login KYC (profiles without can_manage):
   → B-014 flow: verification code + /kyc/fill/[token]
   → No users row created
```

---

## 8. Soft Delete

```
Delete a PROFILE:
  → client_profiles.is_deleted = true
  → Services are NOT affected (other profiles may be on them)
  → profile_service_roles rows stay (but profile is hidden in UI)
  → If profile had a user_id, set users.is_active = false

Delete a SERVICE:
  → services.is_deleted = true
  → profile_service_roles rows for this service are removed
  → Profiles are NOT affected
  → Documents linked to this service are soft-deleted (is_active = false)
```

---

## 9. AI Auto-Populate on Document Upload

When a document is uploaded and AI extracts fields:

```
1. AI verification runs (existing flow)
2. AI returns extracted_fields: { passport_number: "A1234567", expiry: "2030-01-01", ... }
3. NEW: Map extracted fields to client_profile_kyc columns:
   - "passport_number" → client_profile_kyc.passport_number
   - "expiry" → client_profile_kyc.passport_expiry
   - "full_name" → client_profile_kyc.full_name (only if currently empty)
   - etc.
4. Write back to client_profile_kyc (only fill empty fields, don't overwrite existing)
5. Client sees pre-populated fields on next page load
6. Client can still edit manually
```

---

## 10. Migration Strategy

### Phase 1: Schema + Profiles page
- Create new tables (`users`, `client_profiles`, `client_profile_kyc`, `services`, `profile_service_roles`, etc.)
- Migrate existing data from old tables to new
- Build `/admin/profiles` list page
- Build `/admin/profiles/[id]` detail page
- Update auth (NextAuth) to use `users` table

### Phase 2: Services page
- Build `/admin/services` list page
- Build `/admin/services/[id]` detail page (wizard-style sections + people panel)
- Service creation wizard (Path B)
- RAG status indicators

### Phase 3: Configurability
- Build admin CRUD for document types
- Expand DD requirements management (add field requirements, role requirements)
- Build profile requirement overrides UI
- Build service section override UI (admin flagging)

### Phase 4: Client portal
- Rebuild client dashboard (service list with action indicators)
- Rebuild client service detail (wizard-style, data-driven)
- Auto-redirect for single-service users
- AI auto-populate on document upload

### Phase 5: Cleanup
- Remove old tables and code
- Remove hardcoded field/doc lists
- Update all utility functions to be fully data-driven
- Comprehensive testing

---

## 11. Data Migration SQL (high-level)

```sql
-- 1. Create users from old profiles (that have password_hash)
INSERT INTO users (id, email, full_name, phone, password_hash, role, is_active)
SELECT id, email, full_name, phone, password_hash,
  CASE WHEN EXISTS (SELECT 1 FROM admin_users WHERE user_id = p.id) THEN 'admin' ELSE 'user' END,
  NOT is_deleted
FROM profiles p;

-- 2. Create client_profiles from kyc_records
INSERT INTO client_profiles (id, user_id, record_type, is_representative, full_name, email, phone, address, due_diligence_level)
SELECT kr.id, kr.profile_id, kr.record_type, false, kr.full_name, kr.email, kr.phone, kr.address,
  COALESCE(kr.due_diligence_level, 'cdd')
FROM kyc_records kr WHERE kr.is_deleted IS NOT TRUE;

-- 3. Create client_profile_kyc from kyc_records (40+ fields)
INSERT INTO client_profile_kyc (client_profile_id, aliases, work_address, ..., completion_status, kyc_journey_completed)
SELECT id, aliases, work_address, ..., completion_status, kyc_journey_completed
FROM kyc_records WHERE is_deleted IS NOT TRUE;

-- 4. Create services from applications
INSERT INTO services (id, service_template_id, service_details, status, ...)
SELECT id, service_template_id, service_details, status, ...
FROM applications WHERE is_deleted IS NOT TRUE;

-- 5. Create profile_service_roles from profile_roles + client_users
INSERT INTO profile_service_roles (client_profile_id, service_id, role, can_manage, ...)
SELECT pr.kyc_record_id, pr.application_id, pr.role,
  EXISTS (SELECT 1 FROM client_users cu WHERE cu.user_id = kr.profile_id AND cu.role = 'owner'),
  ...
FROM profile_roles pr
JOIN kyc_records kr ON kr.id = pr.kyc_record_id;

-- 6. Update documents FKs
ALTER TABLE documents ADD COLUMN client_profile_id uuid REFERENCES client_profiles(id);
UPDATE documents SET client_profile_id = kyc_record_id; -- kyc_record_id maps 1:1 to client_profile_id
ALTER TABLE documents ADD COLUMN service_id uuid REFERENCES services(id);
```

Detailed migration SQL will be written during implementation.
