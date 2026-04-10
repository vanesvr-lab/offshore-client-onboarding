# Batch 1: Schema + Types + Seed Files

Read CHANGES.md and CLAUDE.md first. This is Batch 1 of 6 for the onboarding redesign. DO NOT touch any UI or pages — only schema files, types, and seed SQL.

## Context

The database migration has ALREADY been run in Supabase. The tables exist. Your job is to update the codebase to match.

## Tasks

### 1. Update supabase/schema.sql

Append all new table definitions after the existing tables, under a clear comment block `-- ONBOARDING REDESIGN v2`. Tables to add (in FK order):
- document_types
- kyc_records
- application_persons
- application_details_gbc_ac
- documents
- document_links
- process_templates
- process_requirements
- client_processes
- process_documents

Also add the ALTER TABLE statements for clients (client_type, loe_sent_at, invoice_sent_at, payment_received_at, portal_link_sent_at, kyc_completed_at, application_submitted_at).

Copy the exact SQL from `docs/batches/migration.sql` if it exists, otherwise use the table definitions from this prompt.

### 2. Create supabase/seed-document-types.sql

INSERT 32 document types. Categories: identity (6), corporate (9), financial (7), compliance (6), additional (4). Use ON CONFLICT DO NOTHING.

### 3. Create supabase/seed-process-templates.sql

INSERT 2 process templates (Corporate Bank Account, Individual Bank Account) with their requirements. Requirements reference document_types by name via JOIN.

### 4. Update src/types/index.ts

Add these new interfaces (match the SQL column names exactly):

```typescript
export interface DocumentType {
  id: string;
  name: string;
  category: 'identity' | 'corporate' | 'financial' | 'compliance' | 'additional';
  applies_to: 'individual' | 'organisation' | 'both';
  description: string | null;
  validity_period_days: number | null;
  ai_verification_rules: Record<string, unknown> | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface KycRecord {
  id: string;
  client_id: string;
  profile_id: string | null;
  record_type: 'individual' | 'organisation';
  // Common
  full_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  // Individual-only
  aliases: string | null;
  work_address: string | null;
  work_phone: string | null;
  work_email: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  passport_country: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  occupation: string | null;
  legal_issues_declared: boolean | null;
  legal_issues_details: string | null;
  tax_identification_number: string | null;
  source_of_funds_description: string | null;
  source_of_wealth_description: string | null;
  is_pep: boolean | null;
  pep_details: string | null;
  // Organisation-only
  business_website: string | null;
  jurisdiction_incorporated: string | null;
  date_of_incorporation: string | null;
  listed_or_unlisted: 'listed' | 'unlisted' | null;
  jurisdiction_tax_residence: string | null;
  description_activity: string | null;
  company_registration_number: string | null;
  industry_sector: string | null;
  regulatory_licenses: string | null;
  // Admin risk assessment
  sanctions_checked: boolean;
  sanctions_checked_at: string | null;
  sanctions_notes: string | null;
  adverse_media_checked: boolean;
  adverse_media_checked_at: string | null;
  adverse_media_notes: string | null;
  pep_verified: boolean;
  pep_verified_at: string | null;
  pep_verified_notes: string | null;
  risk_rating: 'low' | 'medium' | 'high' | 'prohibited' | null;
  risk_rating_justification: string | null;
  risk_rated_by: string | null;
  risk_rated_at: string | null;
  geographic_risk_assessment: string | null;
  relationship_history: string | null;
  // Tracking
  completion_status: 'incomplete' | 'complete';
  filled_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApplicationPerson {
  id: string;
  application_id: string;
  kyc_record_id: string;
  role: 'director' | 'shareholder' | 'ubo' | 'contact';
  shareholding_percentage: number | null;
  created_at: string;
}

export interface ApplicationDetailsGbcAc {
  id: string;
  application_id: string;
  proposed_names: string[] | null;
  proposed_business_activity: string | null;
  geographical_area: string | null;
  transaction_currency: string | null;
  estimated_turnover_3yr: string | null;
  requires_mauritian_bank: boolean | null;
  preferred_bank: string | null;
  estimated_inward_value: string | null;
  estimated_inward_count: string | null;
  estimated_outward_value: string | null;
  estimated_outward_count: string | null;
  other_mauritius_companies: string | null;
  balance_sheet_date: string | null;
  initial_stated_capital: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentRecord = {
  id: string;
  client_id: string;
  kyc_record_id: string | null;
  document_type_id: string;
  file_path: string;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
  verification_status: VerificationStatus;
  verification_result: VerificationResult | null;
  expiry_date: string | null;
  notes: string | null;
  is_active: boolean;
  uploaded_by: string | null;
  uploaded_at: string;
  verified_at: string | null;
}

export interface DocumentLink {
  id: string;
  document_id: string;
  linked_to_type: 'application' | 'process' | 'kyc';
  linked_to_id: string;
  required_by: string | null;
  linked_at: string;
  linked_by: string | null;
}

export interface ProcessTemplate {
  id: string;
  name: string;
  description: string | null;
  client_type: 'individual' | 'organisation' | 'both' | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface ProcessRequirement {
  id: string;
  process_template_id: string;
  document_type_id: string;
  is_required: boolean;
  per_person: boolean;
  applies_to_role: string[] | null;
  sort_order: number;
}

export interface ClientProcess {
  id: string;
  client_id: string;
  process_template_id: string;
  status: 'draft' | 'collecting' | 'ready' | 'submitted' | 'complete';
  notes: string | null;
  started_by: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ProcessDocument {
  id: string;
  process_id: string;
  requirement_id: string;
  kyc_record_id: string | null;
  source: 'kyc_reused' | 'uploaded' | 'requested' | null;
  document_id: string | null;
  status: 'available' | 'missing' | 'requested' | 'received';
  requested_at: string | null;
  received_at: string | null;
}
```

Also update the existing Client interface to include:
```typescript
client_type: 'individual' | 'organisation' | null;
loe_sent_at: string | null;
invoice_sent_at: string | null;
payment_received_at: string | null;
portal_link_sent_at: string | null;
kyc_completed_at: string | null;
application_submitted_at: string | null;
```

Add a deprecation comment on the UBO interface and Application.ubo_data: `/** @deprecated Use application_persons + kyc_records instead */`

### 5. Verify

Run `npm run build` — must pass clean. No UI changes, just types + schema files.

### 6. Git

Follow Git Workflow Rule in CLAUDE.md. Commit + push. Update CHANGES.md.
