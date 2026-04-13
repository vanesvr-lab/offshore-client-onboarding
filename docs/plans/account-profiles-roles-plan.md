# Account → Profiles → Roles — Implementation Plan

## Overview

Refactor the data model so that:
- A **Client Account** is the top-level entity (was "client/company")
- An account has multiple **Profiles** (each is a person with their own KYC)
- Each profile can have multiple **Roles** (primary, director, shareholder, UBO)
- KYC is per-profile — documents accumulate across roles, never duplicated
- The system only requests documents that are **missing** based on combined role requirements
- Primary profile manages the account; non-primary profiles only see their own KYC

## Decisions (confirmed with stakeholder)

| # | Decision |
|---|----------|
| 1 | One account, many profiles. First profile = primary (email required). |
| 2 | Primary fills all profiles by default. Only admin can send invite for a profile to self-fill. |
| 3 | Email optional for non-primary (required only if invite will be sent). |
| 4 | Account name defaults to primary's name, admin can change anytime. |
| 5 | Add director/shareholder → pick existing profile OR create new. |
| 6 | Documents are smart — only request what's missing per profile across all roles. |
| 7 | Each profile has its own DD level (inherits account default, admin can override). |
| 8 | Non-primary login sees ONLY their own KYC — no account details, no other profiles, no solutions. |
| 9 | Track invite_sent_at per profile. Admin can resend. |

---

## Database Changes

### 1. Modify `kyc_records` table (this IS the profiles table now)

```sql
ALTER TABLE kyc_records ADD COLUMN IF NOT EXISTS is_primary boolean DEFAULT false;
ALTER TABLE kyc_records ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz;
ALTER TABLE kyc_records ADD COLUMN IF NOT EXISTS invite_sent_by uuid REFERENCES profiles(id);
ALTER TABLE kyc_records ADD COLUMN IF NOT EXISTS due_diligence_level text
  CHECK (due_diligence_level IN ('sdd', 'cdd', 'edd'));
```

`kyc_records` already has: full_name, email, phone, all KYC fields, profile_id (links to portal login), client_id (links to account), completion_status, kyc_journey_completed.

The `due_diligence_level` on kyc_records **overrides** the account-level DD when set. If null, inherits from the account.

### 2. Create `profile_roles` table

Tracks what roles each profile has, potentially across multiple solutions.

```sql
CREATE TABLE IF NOT EXISTS profile_roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  kyc_record_id uuid REFERENCES kyc_records(id) ON DELETE CASCADE NOT NULL,
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('primary_client', 'director', 'shareholder', 'ubo')),
  shareholding_percentage numeric,
  created_at timestamptz DEFAULT now(),
  UNIQUE(kyc_record_id, application_id, role)
);
CREATE INDEX IF NOT EXISTS profile_roles_kyc_idx ON profile_roles(kyc_record_id);
CREATE INDEX IF NOT EXISTS profile_roles_app_idx ON profile_roles(application_id);
```

Notes:
- `application_id` is nullable — primary_client role has no application link
- A profile can have multiple roles for the same application (e.g., director + shareholder)
- A profile can have roles across multiple applications
- This replaces `application_persons` for new data (keep old table for backward compat)

### 3. Create `role_document_requirements` table

Defines what documents each role requires. Used by the smart delta logic.

```sql
CREATE TABLE IF NOT EXISTS role_document_requirements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  role text NOT NULL CHECK (role IN ('primary_client', 'director', 'shareholder', 'ubo')),
  document_type_id uuid REFERENCES document_types(id) NOT NULL,
  is_required boolean DEFAULT true,
  sort_order int DEFAULT 0,
  UNIQUE(role, document_type_id)
);
```

### 4. Seed role_document_requirements

```sql
-- Primary client: passport + proof of address (basic KYC docs, rest comes from DD level)
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'primary_client', id, 1 FROM document_types WHERE name = 'Certified Passport Copy'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'primary_client', id, 2 FROM document_types WHERE name = 'Proof of Residential Address'
ON CONFLICT DO NOTHING;

-- Director: passport + proof of address + source of funds + CV + bank reference
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'director', id, 1 FROM document_types WHERE name = 'Certified Passport Copy'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'director', id, 2 FROM document_types WHERE name = 'Proof of Residential Address'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'director', id, 3 FROM document_types WHERE name = 'Declaration of Source of Funds'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'director', id, 4 FROM document_types WHERE name = 'Curriculum Vitae / Resume'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'director', id, 5 FROM document_types WHERE name = 'Bank Reference Letter'
ON CONFLICT DO NOTHING;

-- Shareholder: passport + proof of address + source of funds + evidence of source of funds
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'shareholder', id, 1 FROM document_types WHERE name = 'Certified Passport Copy'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'shareholder', id, 2 FROM document_types WHERE name = 'Proof of Residential Address'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'shareholder', id, 3 FROM document_types WHERE name = 'Declaration of Source of Funds'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'shareholder', id, 4 FROM document_types WHERE name = 'Evidence of Source of Funds'
ON CONFLICT DO NOTHING;

-- UBO: passport + proof of address + source of funds + source of wealth + PEP form
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'ubo', id, 1 FROM document_types WHERE name = 'Certified Passport Copy'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'ubo', id, 2 FROM document_types WHERE name = 'Proof of Residential Address'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'ubo', id, 3 FROM document_types WHERE name = 'Declaration of Source of Funds'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'ubo', id, 4 FROM document_types WHERE name = 'Declaration of Source of Wealth'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'ubo', id, 5 FROM document_types WHERE name = 'Evidence of Source of Wealth'
ON CONFLICT DO NOTHING;
INSERT INTO role_document_requirements (role, document_type_id, sort_order)
SELECT 'ubo', id, 6 FROM document_types WHERE name = 'PEP Declaration Form'
ON CONFLICT DO NOTHING;
```

### 5. Rename UI labels

- "Company name" → "Account name" (on client detail page)
- "Company Details" → "Account Details"
- "Account Users" → "Account Profiles"
- "Client Name" (clients list table header) → keep as is (it's the account name)

---

## Smart Document Delta Logic

### Utility function

```typescript
// src/lib/utils/profileDocumentRequirements.ts

function getRequiredDocumentsForProfile(
  profileRoles: string[],           // ['primary_client', 'director', 'shareholder']
  roleDocRequirements: RoleDocReq[], // from role_document_requirements table
  ddLevel: DueDiligenceLevel,        // the profile's DD level
  ddRequirements: DueDiligenceRequirement[], // from due_diligence_requirements table
  existingDocuments: DocumentRecord[] // docs already uploaded for this profile
): {
  required: DocumentType[];    // all unique docs needed across all roles + DD level
  uploaded: DocumentType[];    // already uploaded
  missing: DocumentType[];     // the delta — what's still needed
}
```

Logic:
1. Collect document_type_ids from `role_document_requirements` for all the profile's roles
2. Collect document_type_ids from `due_diligence_requirements` for the profile's DD level (basic + level)
3. Merge into a unique set (no duplicates)
4. Check which ones the profile already has uploaded (match by document_type_id in existingDocuments where is_active=true)
5. Return: required (full set), uploaded (what exists), missing (the delta)

---

## Portal Experiences

### Primary profile login

Sees the full account:
- Dashboard with account-level progress + all profiles overview
- KYC step wizard (their own)
- All other profiles (can fill on their behalf)
- Solutions & Services
- Documents (all account documents)
- Full sidebar nav

### Non-primary profile login

Sees ONLY their own KYC:
- Simplified dashboard: "Welcome, Tony. Complete your KYC to proceed."
- Their KYC step wizard (filtered by their DD level + roles)
- Their documents only
- No account details, no other profiles, no solutions
- Minimal sidebar: just "My KYC" and "My Documents"

After completion: "Thank you — your profile has been submitted for review."

### How non-primary login works

When a profile with an email gets an invite:
1. Admin adds email to the profile → clicks send invite
2. System creates a `profiles` row (portal login) linked to the `kyc_records` row via `profile_id`
3. Invite email sent with set-password link
4. Person sets password → logs in
5. Middleware checks: is this user a primary? → full nav. Not primary? → restricted nav.

---

## Admin Client Detail Page

### Account Details section
- Account name (editable inline)
- Client type (individual / organisation)
- Account-level DD (dropdown, default for new profiles)

### Account Profiles section

```
Account Profiles                                              [+ Add Profile]
┌──────────────────────────────────────────────────────────────────────────────┐
│ Name              Roles                DD    KYC   Email              Invite │
│ Bruce Banner      Primary, Director,   CDD  72%   bruce@...          ✉ Sent │
│                   Shareholder (60%)     ▾                            10 Apr  │
│ Tony Stark        Director, UBO        EDD  45%   [+ Add email]     Not sent│
│                                         ▾                                   │
│ Natasha Romanoff  Shareholder (40%)    SDD  90%   nat@example.com   ✉ Sent │
│                                         ▾                            12 Apr │
└──────────────────────────────────────────────────────────────────────────────┘
```

Each row:
- Name (clickable → opens profile KYC detail)
- Roles (comma-separated, with shareholding % where applicable)
- DD level (inline dropdown, editable)
- KYC completion % (mini progress bar)
- Email (inline editable — click "+" to add, click email to edit)
- Invite status: "✉ Sent [date]" or "Not sent" or "✉ Resend"
  - Send button disabled if no email
  - Tracks invite_sent_at, invite_sent_by on kyc_records

### Compliance Scorecard

Shows overall account compliance + per-profile breakdown:
- Account overall: average of all profiles
- Per profile: their individual score based on their DD level + roles

---

## Implementation Phases

### Phase 1: Database + Types
- Run DDL (kyc_records new columns, profile_roles table, role_document_requirements table + seed)
- Update TypeScript types
- Build smart document delta utility
- Update schema.sql

### Phase 2: Admin Account Profiles Table
- Rework admin client detail page → account details + profiles table
- Inline DD level per profile
- Inline email editing
- Send invite per profile (reuse existing invite logic but per-profile)
- Track invite_sent_at on kyc_records
- Add Profile button → dialog to create new profile
- Profile name clickable → opens KYC detail

### Phase 3: Add Director/Shareholder with Profile Selection
- When user clicks "Add Director" in PersonsManager:
  - Show dropdown: "Select existing profile" (lists all account profiles) OR "Create new profile"
  - If existing: create profile_roles entry linking that kyc_record to the application with role=director. Pre-fill everything. Calculate document delta and show only missing docs.
  - If new: create new kyc_record + profile_roles entry. Open inline KYC form for the new person.
- Same for Add Shareholder (with % input) and Add UBO
- Smart document delta: after role assignment, show "X additional documents needed" based on what the profile already has vs what the new role requires

### Phase 4: Non-Primary Portal Experience
- Middleware: check if logged-in user's profile is primary or not
- If not primary: restrict to minimal layout (no sidebar solutions, no account details)
- Simplified dashboard: just their KYC progress + step wizard
- Their documents only (filtered by kyc_record_id)
- After KYC complete: "Thank you" page

### Phase 5: Primary Can Manage All Profiles
- Primary's dashboard shows all profiles with progress
- Primary can click into any profile's KYC and fill on their behalf
- Primary can add new profiles (creates kyc_record with is_primary=false)
- Primary cannot send invites (admin only)

### Phase 6: Invite Flow Per Profile
- Admin adds email to non-primary profile → save to kyc_records.email
- Admin clicks send invite → generates invite token (jose JWT with kyc_record_id), sends email
- Person clicks link → sets password → logs in as non-primary
- Profile's invite_sent_at updated, invite_sent_by set to admin
- Resend option available (regenerates token, updates timestamp)
- API: POST /api/admin/profiles/[kycRecordId]/send-invite

---

## Files to Create/Modify

### New files:
- `src/lib/utils/profileDocumentRequirements.ts` — smart delta logic
- `src/components/admin/AccountProfilesTable.tsx` — profiles table with inline DD, email, invite
- `src/components/admin/AddProfileDialog.tsx` — create new profile dialog
- `src/components/shared/ProfileSelector.tsx` — "pick existing or create new" for adding directors
- `src/app/api/admin/profiles/[id]/send-invite/route.ts` — per-profile invite
- `src/app/api/admin/profiles/[id]/route.ts` — PATCH profile (DD level, email)
- `src/app/api/profiles/roles/route.ts` — add/remove profile roles

### Modified files:
- `src/app/(admin)/admin/clients/[id]/page.tsx` — account details + profiles table
- `src/components/client/PersonsManager.tsx` — profile selector instead of raw KYC form
- `src/app/(client)/kyc/KycPageClient.tsx` — show smart delta documents
- `src/app/(client)/layout.tsx` — check primary vs non-primary for nav
- `src/components/shared/Sidebar.tsx` — minimal nav for non-primary
- `src/app/(client)/dashboard/page.tsx` — simplified for non-primary
- `middleware.ts` — handle non-primary route restrictions
- `src/types/index.ts` — new types
- `supabase/schema.sql` — new tables + columns
