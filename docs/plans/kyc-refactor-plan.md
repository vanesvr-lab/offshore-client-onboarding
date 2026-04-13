# KYC Refactor — Implementation Plan

## Overview

Refactor the KYC onboarding to follow a **two-layer, risk-based approach**:

- **Layer 1: Basic KYC** — identity verification, always required, always first
- **Layer 2: Due Diligence** — admin assigns SDD/CDD/EDD level, which determines additional fields + documents required

The client experiences a **guided step wizard** on first-time onboarding, then an **accordion view** for subsequent edits. Directors, shareholders, and UBOs go through the **same journey** as the primary client.

Admin gets a **compliance scorecard** with numerical score + progress bars per section, plus **auto-flagging** of risk indicators with admin confirmation.

---

## Decisions (confirmed with stakeholder)

| # | Decision | Answer |
|---|----------|--------|
| 1 | Risk & due diligence | Two layers: Basic KYC always → admin assigns SDD/CDD/EDD |
| 2 | Client journey | Guided steps first time, accordion after |
| 3 | Directors/shareholders/UBOs | Same full journey, same due diligence level |
| 4 | Admin compliance view | Numerical score + per-section progress bars |
| 5 | Risk changes | Auto-flag + admin confirms |

---

## What each due diligence level requires

### Basic KYC (Layer 1 — everyone, always)

**Fields:**
- Full name, aliases
- Date of birth
- Nationality
- Passport country, number, expiry
- Residential address
- Personal phone, email
- Occupation

**Documents:**
- Certified Passport Copy
- Proof of Residential Address (< 3 months)

---

### SDD — Simplified Due Diligence (Low risk)

Everything in Basic KYC, plus:

**Fields:**
- Source of funds description (brief)

**Documents:**
- Declaration of Source of Funds

**Admin checks:**
- None additional (standard identity verification only)

---

### CDD — Standard Customer Due Diligence (Medium risk, DEFAULT)

Everything in Basic KYC, plus:

**Fields:**
- Source of funds description (detailed)
- Work address, work phone, work email
- Tax identification number
- PEP declaration (yes/no + details)
- Legal issues declaration (yes/no + details)

**Documents:**
- Declaration of Source of Funds
- Evidence of Source of Funds
- Bank Reference Letter
- PEP Declaration Form
- Curriculum Vitae / Resume

**Admin checks:**
- PEP verification
- Sanctions screening
- Risk rating assigned

---

### EDD — Enhanced Due Diligence (High risk)

Everything in CDD, plus:

**Fields:**
- Source of wealth description
- Customer relationship history (prior banks/institutions)
- Geographic risk assessment notes

**Documents:**
- Declaration of Source of Wealth
- Evidence of Source of Wealth
- Professional Reference Letter
- Tax Residency Certificate
- Proof of Occupation / Employment Letter
- Adverse Media Report

**Admin checks:**
- Adverse media screening
- Enhanced PEP verification (family + associates)
- Senior management approval (checkbox + name + date)
- Ongoing monitoring plan defined
- Geographic risk documented

---

## Database Changes

### 1. Add to `clients` table

```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS due_diligence_level text
  DEFAULT 'cdd' CHECK (due_diligence_level IN ('sdd', 'cdd', 'edd'));
```

### 2. New table: `due_diligence_requirements`

Maps each level to required fields and document types. Seeded, not user-editable (admin can't change what SDD/CDD/EDD means — that's regulatory).

```sql
CREATE TABLE IF NOT EXISTS due_diligence_requirements (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  level text NOT NULL CHECK (level IN ('basic', 'sdd', 'cdd', 'edd')),
  requirement_type text NOT NULL CHECK (requirement_type IN ('field', 'document', 'admin_check')),
  requirement_key text NOT NULL,
  label text NOT NULL,
  description text,
  document_type_id uuid REFERENCES document_types(id),
  sort_order int DEFAULT 0,
  UNIQUE(level, requirement_type, requirement_key)
);
```

### 3. Add to `kyc_records` table

```sql
ALTER TABLE kyc_records ADD COLUMN IF NOT EXISTS risk_flags jsonb DEFAULT '[]';
ALTER TABLE kyc_records ADD COLUMN IF NOT EXISTS senior_management_approval boolean DEFAULT false;
ALTER TABLE kyc_records ADD COLUMN IF NOT EXISTS senior_management_approved_by uuid REFERENCES profiles(id);
ALTER TABLE kyc_records ADD COLUMN IF NOT EXISTS senior_management_approved_at timestamptz;
ALTER TABLE kyc_records ADD COLUMN IF NOT EXISTS ongoing_monitoring_plan text;
ALTER TABLE kyc_records ADD COLUMN IF NOT EXISTS kyc_journey_completed boolean DEFAULT false;
```

### 4. Seed due_diligence_requirements

Insert rows for each level defining:
- Which `kyc_records` fields are required at each level
- Which `document_types` are required at each level
- Which admin checks are required at each level

Example seed data (abbreviated):

```sql
-- Basic KYC fields (required for ALL levels)
INSERT INTO due_diligence_requirements (level, requirement_type, requirement_key, label, sort_order) VALUES
('basic', 'field', 'full_name', 'Full legal name', 1),
('basic', 'field', 'date_of_birth', 'Date of birth', 2),
('basic', 'field', 'nationality', 'Nationality', 3),
('basic', 'field', 'passport_number', 'Passport number', 4),
('basic', 'field', 'passport_expiry', 'Passport expiry date', 5),
('basic', 'field', 'address', 'Residential address', 6),
('basic', 'field', 'email', 'Email address', 7),
('basic', 'field', 'occupation', 'Occupation', 8);

-- Basic KYC documents
INSERT INTO due_diligence_requirements (level, requirement_type, requirement_key, label, document_type_id, sort_order)
SELECT 'basic', 'document', 'passport', 'Certified Passport Copy', id, 1
FROM document_types WHERE name = 'Certified Passport Copy';
-- ... etc for Proof of Address

-- CDD additional fields
INSERT INTO due_diligence_requirements (level, requirement_type, requirement_key, label, sort_order) VALUES
('cdd', 'field', 'source_of_funds_description', 'Source of funds description', 1),
('cdd', 'field', 'tax_identification_number', 'Tax identification number', 2),
('cdd', 'field', 'is_pep', 'PEP declaration', 3),
('cdd', 'field', 'legal_issues_declared', 'Legal issues declaration', 4),
('cdd', 'field', 'work_address', 'Work address', 5),
('cdd', 'field', 'work_phone', 'Work phone', 6),
('cdd', 'field', 'work_email', 'Work email', 7);

-- CDD additional documents
-- ... Bank Reference, PEP Form, CV, Source of Funds declaration + evidence

-- CDD admin checks
INSERT INTO due_diligence_requirements (level, requirement_type, requirement_key, label, sort_order) VALUES
('cdd', 'admin_check', 'pep_verified', 'PEP verification', 1),
('cdd', 'admin_check', 'sanctions_checked', 'Sanctions screening', 2),
('cdd', 'admin_check', 'risk_rating', 'Risk rating assigned', 3);

-- EDD additional fields
INSERT INTO due_diligence_requirements (level, requirement_type, requirement_key, label, sort_order) VALUES
('edd', 'field', 'source_of_wealth_description', 'Source of wealth description', 1),
('edd', 'field', 'relationship_history', 'Customer relationship history', 2),
('edd', 'field', 'geographic_risk_assessment', 'Geographic risk assessment', 3);

-- EDD additional documents
-- ... Source of Wealth declaration + evidence, Professional Reference, Tax Residency Cert, Adverse Media Report

-- EDD admin checks
INSERT INTO due_diligence_requirements (level, requirement_type, requirement_key, label, sort_order) VALUES
('edd', 'admin_check', 'adverse_media_checked', 'Adverse media screening', 1),
('edd', 'admin_check', 'senior_management_approval', 'Senior management approval', 2),
('edd', 'admin_check', 'ongoing_monitoring_plan', 'Ongoing monitoring plan defined', 3);
```

---

## Client Portal — Step Wizard (first-time onboarding)

### Flow

```
[Step 1: Your Identity]  →  [Step 2: Financial Profile]  →  [Step 3: Declarations]  →  [Step 4: Review & Submit]
     Basic KYC                   SDD/CDD/EDD                   CDD/EDD                    All levels
```

### Step 1: Your Identity (all levels)

**Purpose:** "Let's verify who you are"

Fields:
- Full name, aliases
- Date of birth, nationality
- Passport country, number, expiry → inline upload: Certified Passport Copy
- Residential address → inline upload: Proof of Address
- Personal phone, email
- Occupation → inline upload: Proof of Occupation (CDD/EDD only)

**What the client sees:**
```
Step 1 of 4 — Your Identity
━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━━━━

We need to verify your identity. Please fill in your details 
and upload your passport and proof of address.

[form fields with inline uploads]

                                              [Save & Continue →]
```

### Step 2: Financial Profile (SDD: minimal, CDD: standard, EDD: enhanced)

**Purpose:** "Tell us about your financial background"

**SDD shows:**
- Source of funds description (brief) → inline upload: Declaration

**CDD adds:**
- Source of funds description (detailed) → inline upload: Declaration + Evidence
- Bank reference → inline upload: Bank Reference Letter
- CV → inline upload: CV/Resume

**EDD adds:**
- Source of wealth description → inline upload: Declaration + Evidence
- Professional reference → inline upload: Professional Reference Letter
- Tax ID → inline upload: Tax Residency Certificate

**What the client sees:**
```
Step 2 of 4 — Financial Profile
━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━━━━━━━━━

Help us understand the source of your funds and financial background.
This is required for regulatory compliance.

[form fields filtered by due diligence level, with inline uploads]

[← Back]                                     [Save & Continue →]
```

### Step 3: Declarations (CDD/EDD only — SDD skips this)

**Purpose:** "Important compliance declarations"

Fields:
- PEP declaration (yes/no + details) → inline upload: PEP Form
- Legal issues declaration (yes/no + details)
- Tax identification number

**EDD adds:**
- Customer relationship history
- Geographic risk information

**What the client sees:**
```
Step 3 of 4 — Declarations
━━━━━━━━━━━━━━━━━━━━━━━━━━●━━━━━━━━━━━━

Please complete these compliance declarations honestly and completely.

[PEP toggle + details if yes]
[Legal issues toggle + details if yes]
[Tax ID field]

[← Back]                                     [Save & Continue →]
```

### Step 4: Review & Submit (all levels)

**Purpose:** "Review everything before submitting"

Shows:
- Summary of all filled fields, grouped by step
- List of uploaded documents with verification status
- Missing items highlighted in red
- "Submit for Review" button (disabled until all required items complete)

**What the client sees:**
```
Step 4 of 4 — Review & Submit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━●

Review your information below. Once submitted, our compliance 
team will review your profile.

[Read-only summary of all data]
[Document checklist with status badges]
[Missing items warning if any]

[← Back]                                     [Submit for Review]
```

### After first completion → Accordion view

Once the client has completed all steps and submitted, the KYC page switches to an **accordion view** showing all sections (same as current but filtered by due diligence level). The client can expand any section to update their information.

Use the `kyc_journey_completed` boolean on `kyc_records` to determine which view to show.

---

## Admin Portal — Compliance Scorecard

### On client detail page

Replace the current KYC Summary Card with a full **Compliance Scorecard**:

```
┌─────────────────────────────────────────────────────────────┐
│ Compliance Scorecard                                        │
│                                                             │
│ Due Diligence: CDD (Standard)    [Change ▾]    Score: 72%   │
│ ████████████████████░░░░░░░░                                │
│                                                             │
│ ┌─ Identity (Basic KYC) ──────── ████████████░░ 85% ──────┐│
│ │ ✅ Full name          ✅ Passport verified               ││
│ │ ✅ DOB                ✅ Address verified                 ││
│ │ ✅ Nationality        ⚠️ Passport expires in 4mo         ││
│ │ ✅ Email              ✅ Occupation                      ││
│ └──────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Financial (CDD) ──────────── ██████░░░░░░░░ 50% ──────┐│
│ │ ✅ Source of funds declared    🔴 Evidence missing        ││
│ │ 🔴 Bank reference missing     ✅ CV uploaded             ││
│ └──────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Declarations (CDD) ──────── ████████░░░░░░ 67% ──────┐ │
│ │ ✅ PEP: Not a PEP (declared)  🔴 PEP: NOT VERIFIED     ││
│ │ ✅ Legal issues: None          ✅ Tax ID provided        ││
│ └──────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Admin Checks (CDD) ──────── ████░░░░░░░░░░ 33% ──────┐ │
│ │ 🔴 PEP verification           🔴 Sanctions screening    ││
│ │ 🔴 Risk rating not assigned                              ││
│ └──────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ Persons ──────────────────── ██████████░░░░ 75% ──────┐ │
│ │ 👤 Director 1: 85% (KYC 14/14 ✅, Docs 5/7 ⚠️)        ││
│ │ 👤 Shareholder 1: 50% (KYC 8/14 ⚠️, Docs 2/7 ⚠️)     ││
│ └──────────────────────────────────────────────────────────┘│
│                                                             │
│ ⛔ Cannot approve until:                                    │
│   • Source of funds evidence uploaded                       │
│   • Bank reference uploaded                                │
│   • PEP verification completed                             │
│   • Sanctions screening completed                          │
│   • Risk rating assigned                                   │
│   • Shareholder 1 KYC incomplete                           │
└─────────────────────────────────────────────────────────────┘
```

### Due diligence level selector

Admin can change the level via a dropdown on the scorecard. When changed:
- Requirements update immediately (new fields/docs appear in client's journey)
- Score recalculates
- Audit log entry: "Due diligence level changed from CDD to EDD"
- If upgrading (CDD→EDD): new required items appear as "missing"
- If downgrading (EDD→CDD): extra items become optional (don't delete data)

### Risk flag auto-detection

System auto-detects risk indicators and shows a warning banner:

```
⚠️ Risk indicator detected:
• Client declared PEP status — consider upgrading to EDD
• Client nationality: [high-risk jurisdiction] — verify geographic risk

[Upgrade to EDD]  [Dismiss — document reason]
```

Triggers:
- `is_pep = true` → suggest EDD
- Nationality or jurisdiction in FATF gray/black list → suggest EDD
- `legal_issues_declared = true` → suggest CDD minimum
- Large transaction values (from service details) → suggest EDD

The banner appears on:
- Admin client detail page
- Admin KYC review page
- Above the compliance scorecard

"Dismiss" requires admin to type a reason (stored in audit_log).

---

## Scoring Algorithm

### How the score is calculated

```typescript
function calculateComplianceScore(
  kycRecord: KycRecord,
  documents: DocumentRecord[],
  dueDiligenceLevel: 'sdd' | 'cdd' | 'edd',
  requirements: DueDiligenceRequirement[]
): { score: number; sections: SectionScore[] }
```

1. Get all requirements for levels: `basic` + the client's level (e.g., `basic` + `cdd`)
2. If level is `edd`, also include `cdd` requirements (EDD is cumulative)
3. If level is `cdd`, also include `sdd` requirements
4. For each requirement:
   - `field` type: check if `kycRecord[requirement_key]` is non-null and non-empty → 1 point
   - `document` type: check if a matching document exists with `is_active=true` → 1 point (bonus: +0.5 if AI verified)
   - `admin_check` type: check if the corresponding boolean/field is set → 1 point
5. Score = (points earned / total points) × 100
6. Group by section for per-section scores

Sections:
- **Identity** = basic level fields + documents
- **Financial** = sdd/cdd/edd financial fields + documents
- **Declarations** = cdd/edd declaration fields + documents
- **Admin Checks** = cdd/edd admin check requirements
- **Persons** = average score across all linked persons' KYC records

---

## Implementation Phases

### Phase 1: Database + Types + Scoring (CLI batch)

- Run DDL migrations (clients.due_diligence_level, due_diligence_requirements table, kyc_records new columns)
- Seed due_diligence_requirements for all 4 levels
- Update TypeScript types
- Build `calculateComplianceScore()` utility
- Update schema.sql

### Phase 2: Client Step Wizard (CLI batch)

- Create `KycStepWizard` component — 4-step guided journey
- Create individual step components (IdentityStep, FinancialStep, DeclarationsStep, ReviewStep)
- Each step filters fields/documents by due diligence level
- Rework `/kyc` page: if `kyc_journey_completed = false` → show wizard; else → show accordion
- Keep inline uploads + auto-save
- Update API routes if needed

### Phase 3: Admin Compliance Scorecard (CLI batch)

- Create `ComplianceScorecard` component
- Replace KycSummaryCard on client detail page
- Add due diligence level selector (dropdown + audit log)
- Build risk flag auto-detection logic
- Update approval gates in StageSelector to check compliance score
- API route for changing due diligence level

### Phase 4: Risk Flag System (CLI batch)

- Build risk flag detection rules (PEP, jurisdiction, legal issues, transaction values)
- Create `RiskFlagBanner` component
- Store flags in `kyc_records.risk_flags` JSONB
- "Dismiss with reason" flow + audit log
- Show on client detail + KYC review pages

### Phase 5: Persons Journey Parity (CLI batch)

- Directors/shareholders/UBOs use the same step wizard when added
- Their due diligence level inherits from the client
- Per-person compliance score feeds into the overall scorecard
- PersonsManager shows mini scorecard per person

---

## Files to Create/Modify

### New files:
- `src/components/kyc/KycStepWizard.tsx` — orchestrator for the 4-step journey
- `src/components/kyc/IdentityStep.tsx` — Step 1
- `src/components/kyc/FinancialStep.tsx` — Step 2
- `src/components/kyc/DeclarationsStep.tsx` — Step 3
- `src/components/kyc/ReviewStep.tsx` — Step 4
- `src/components/admin/ComplianceScorecard.tsx` — admin scorecard
- `src/components/admin/RiskFlagBanner.tsx` — risk flag warning
- `src/components/admin/DueDiligenceLevelSelector.tsx` — level dropdown
- `src/lib/utils/complianceScoring.ts` — scoring algorithm
- `src/lib/utils/riskFlagDetection.ts` — risk flag rules
- `src/app/api/admin/clients/[id]/due-diligence/route.ts` — change DD level
- `supabase/migrations/003-kyc-due-diligence.sql` — DDL

### Modified files:
- `src/app/(client)/kyc/page.tsx` — switch between wizard and accordion
- `src/app/(client)/kyc/KycPageClient.tsx` — pass DD level, handle journey state
- `src/app/(admin)/admin/clients/[id]/page.tsx` — replace KycSummaryCard with ComplianceScorecard
- `src/components/admin/StageSelector.tsx` — gate approval on compliance score
- `src/components/kyc/IndividualKycForm.tsx` — filter fields by DD level (accordion mode)
- `src/types/index.ts` — new types
- `supabase/schema.sql` — new tables + columns
