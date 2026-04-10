# Batch 3: KYC Forms + Inline Uploads

Read CHANGES.md first. This is Batch 3 of 6. Batches 1-2 must be complete.

## Context

The kyc_records table exists. The document library API + DocumentUploadWidget exist. Now we build the actual KYC forms that clients and admins use.

## UX Requirements (CRITICAL — read carefully)

1. **Single scrollable page** with collapsible accordion sections
2. **Inline document uploads** next to the fields they support (use DocumentUploadWidget in compact/inline mode)
3. **Auto-save** on every field change (debounce 500ms) — NO save button. Only a "Submit for Review" button when complete.
4. **Pre-fill indicators** — fields filled by admin show "ℹ️ Pre-filled by GWMS" in subtle text. Disappears when client edits.
5. **Completion indicators** on each section header: "✅ 12/14 complete" or "⚠️ 3 items need attention"
6. **Smart validation** — inline guidance, not just "required" errors. E.g., "Passport expires within 6 months" or "Proof of address must be dated within 3 months"

## Tasks

### 1. KYC API Routes

**GET /api/kyc/[clientId]**
- Returns all kyc_records for the client (both individual and organisation)
- Joins with documents table to get uploaded docs per field
- Returns completion counts per section

**POST /api/kyc/save**
- Body: `{ kycRecordId, fields: Record<string, unknown> }`
- Upserts the fields on the kyc_record
- Sets filled_by to the current user
- Sets updated_at
- Recalculates completion_status (all required fields filled = 'complete')
- Does NOT require all fields — partial save is the default
- revalidatePath

**POST /api/kyc/submit**
- Validates ALL required fields are filled for the record
- Sets completion_status = 'complete'
- If client_type is set on the client, checks that the matching KYC type is complete
- Returns validation errors if incomplete

### 2. Completion Calculator Utility

Create: `src/lib/utils/completionCalculator.ts`

```typescript
interface CompletionSection {
  name: string;
  filled: number;
  total: number;
  missingFields: string[];
}

interface CompletionResult {
  overallPercentage: number;
  sections: CompletionSection[];
  canSubmit: boolean;
  blockers: string[];
}

export function calculateKycCompletion(
  record: KycRecord,
  documents: DocumentRecord[]
): CompletionResult
```

Define which fields are required per record_type:
- Individual required: full_name, email, date_of_birth, nationality, passport_number, passport_expiry, address, occupation, source_of_funds_description, is_pep, legal_issues_declared
- Organisation required: full_name, email, address, jurisdiction_incorporated, date_of_incorporation, listed_or_unlisted, description_activity
- Document requirements: map certain document_types to sections (e.g., passport upload goes in the identity section completion)

Group into sections:
- Section 1: Personal Details (individual) or Company Details (organisation)
- Section 2: Funding & Financial Profile
- Section 3: Declarations & Verification (PEP, legal issues, TIN)
- Section 4: Supporting Documents

### 3. Individual KYC Form Component

Create: `src/components/kyc/IndividualKycForm.tsx` ("use client")

Single-page accordion form with 4 collapsible sections:

**Section 1: Personal Details**
- Full name*, aliases, date of birth*, nationality* (dropdown), passport country (dropdown), passport number*, passport expiry*
  - Inline upload: Certified Passport Copy (DocumentUploadWidget compact mode, documentTypeId = passport type)
- Residential address*
  - Inline upload: Proof of Residential Address
- Personal phone, personal email*
- Work address, work phone, work email
- Occupation*
  - Inline upload: Proof of Occupation (optional)
- Inline upload: CV / Resume (optional)

**Section 2: Funding & Financial Profile**
- Source of funds description*
  - Inline upload: Declaration of Source of Funds
  - Inline upload: Evidence of Source of Funds
- Source of wealth description
  - Inline upload: Declaration of Source of Wealth
  - Inline upload: Evidence of Source of Wealth
- Inline upload: Bank Reference Letter
- "➕ Add additional supporting document" button

**Section 3: Declarations**
- PEP declaration* (yes/no toggle). If yes → pep_details textarea + inline upload: PEP Declaration Form
- Legal issues declaration* (yes/no toggle). If yes → legal_issues_details textarea
- Tax ID / TIN
  - Inline upload: Tax Identification Document

**Section 4: Additional Documents**
- Inline upload: Professional Reference Letter
- Inline upload: Any other document (standalone DocumentUploadWidget with type selector)
- "➕ Add more" button

Each section header shows: section name + completion count + expand/collapse chevron. Completed sections auto-collapse. Next incomplete section auto-opens on page load.

### 4. Organisation KYC Form Component

Create: `src/components/kyc/OrganisationKycForm.tsx` ("use client")

Same accordion pattern, 3 sections:

**Section 1: Company Information**
- Company/entity name*, registration number
- Business address*, phone, email*, website
- Jurisdiction of incorporation* (dropdown), date of incorporation*
- Listed/unlisted* (radio)
- Tax residence jurisdiction
- Description of activity*
- Industry/sector classification
- Regulatory licenses
  - Inline upload: Certificate of Incorporation
  - Inline upload: Proof of Company Address
  - Inline upload: Company Registration Number Document

**Section 2: Corporate Documents**
- Inline upload: Memorandum & Articles of Association
- Inline upload: Certificate of Good Standing
- Inline upload: Register of Directors
- Inline upload: Register of Shareholders/Members
- Inline upload: Structure Chart
- Inline upload: AML/CFT Declaration Form
- "➕ Add additional corporate document"

**Section 3: Financial**
- Inline upload: Declaration of Source of Funds
- Inline upload: Evidence of Source of Funds
- Inline upload: Audited Financial Statements
- Inline upload: Business Plan (optional)
- "➕ Add more"

### 5. KYC Page (Client Portal)

Create: `src/app/(client)/kyc/page.tsx`

Server component that:
- Loads the client's kyc_records (individual + organisation if applicable)
- Loads existing documents for the client
- Shows a progress bar at top: "Your KYC Progress: 48% complete — Estimated time: ~15 minutes"
- If client_type is 'individual': shows IndividualKycForm only
- If client_type is 'organisation': shows IndividualKycForm (for the primary contact) + OrganisationKycForm below
- "Submit for Review" button at the bottom — disabled until completion calculator says canSubmit=true
- When submitted, updates client.kyc_completed_at

Add `/kyc` to the client sidebar nav (between Dashboard and New Application). Icon: UserCheck from lucide.

### 6. Auto-Save Hook

Create: `src/hooks/useAutoSave.ts`

```typescript
export function useAutoSave(
  kycRecordId: string,
  fields: Record<string, unknown>,
  debounceMs: number = 500
): { saving: boolean; lastSaved: Date | null; error: string | null }
```

Debounces field changes, POSTs to /api/kyc/save, shows a subtle "💾 Saved just now" indicator. Handles errors gracefully (toast + retry).

### 7. Middleware Update

Add `/kyc` to the client routes list in middleware.ts so it's protected:
```typescript
const isClientRoute = path.startsWith("/dashboard") || path.startsWith("/apply") ||
  path.startsWith("/applications") || path.startsWith("/kyc");
```

### 8. Verify + Git

Run `npm run build`. Follow Git Workflow Rule. Commit + push. Update CHANGES.md.
