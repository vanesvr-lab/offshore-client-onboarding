export type UserRole = "client" | "admin";
export type ClientUserRole = "owner" | "member";

export type ApplicationStatus =
  | "draft"
  | "submitted"
  | "in_review"
  | "pending_action"
  | "verification"
  | "approved"
  | "rejected";

export type VerificationStatus = "pending" | "verified" | "flagged" | "manual_review";

export type DocumentCategory = "corporate" | "kyc" | "compliance";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  company_name: string;
  // Onboarding redesign v2 fields
  client_type: 'individual' | 'organisation' | null;
  loe_sent_at: string | null;
  invoice_sent_at: string | null;
  payment_received_at: string | null;
  portal_link_sent_at: string | null;
  kyc_completed_at: string | null;
  application_submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientUser {
  id: string;
  client_id: string;
  user_id: string;
  role: ClientUserRole;
  invited_by: string | null;
  created_at: string;
}

export interface ClientAccountManager {
  id: string;
  client_id: string;
  admin_id: string;
  started_at: string;
  ended_at: string | null;   // null = currently active
  notes: string | null;
  assigned_by: string | null;
  created_at: string;
  profiles?: Pick<Profile, "full_name" | "email">;
}

export interface ServiceTemplate {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  document_requirements?: DocumentRequirement[];
}

export interface DocumentRequirement {
  id: string;
  template_id: string;
  name: string;
  description: string | null;
  category: DocumentCategory;
  is_required: boolean;
  sort_order: number;
  verification_rules: VerificationRules | null;
  created_at: string;
}

export interface VerificationRules {
  extract_fields: string[];
  match_rules: MatchRule[];
  document_type_expected?: string;
  notes?: string;
}

export interface MatchRule {
  field: string;
  match_against?: string;
  check?: string;
  required: boolean;
  description: string;
}

/** @deprecated Use application_persons + kyc_records instead */
export interface UBO {
  full_name: string;
  nationality: string;
  date_of_birth: string;
  ownership_percentage: number;
  passport_number: string;
}

export interface Application {
  id: string;
  client_id: string;
  template_id: string;
  status: ApplicationStatus;
  reference_number: string | null;
  business_name: string | null;
  business_address: string | null;
  business_country: string | null;
  business_type: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  /** @deprecated Use application_persons + kyc_records instead */
  ubo_data: UBO[] | null;
  admin_notes: string | null;
  rejection_reason: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: Profile;
  service_templates?: ServiceTemplate;
}

export interface DocumentUpload {
  id: string;
  application_id: string;
  requirement_id: string;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  verification_status: VerificationStatus;
  verification_result: VerificationResult | null;
  admin_override: "pass" | "fail" | null;
  admin_override_note: string | null;
  uploaded_at: string;
  verified_at: string | null;
  document_requirements?: DocumentRequirement;
}

export interface VerificationResult {
  can_read_document: boolean;
  document_type_detected: string;
  extracted_fields: Record<string, string>;
  match_results: {
    field: string;
    expected: string;
    found: string;
    passed: boolean;
    note: string;
  }[];
  overall_status: "verified" | "flagged" | "manual_review";
  confidence_score: number;
  flags: string[];
  reasoning: string;
}

export interface AuditLogEntry {
  id: string;
  application_id: string;
  actor_id: string | null;
  actor_role: "client" | "admin" | "system" | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  detail: Record<string, unknown> | null;
  created_at: string;
  profiles?: Profile;
}

export interface EmailLogEntry {
  id: string;
  application_id: string;
  sent_by: string;
  to_email: string;
  subject: string;
  body: string;
  resend_id: string | null;
  sent_at: string;
  profiles?: Profile;
}

// ── Onboarding Redesign v2 ────────────────────────────────────────────────────

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
  // Admin risk assessment (admin-only, not visible to client)
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
