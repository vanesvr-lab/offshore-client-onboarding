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
  business_name: string | null;
  business_address: string | null;
  business_country: string | null;
  business_type: string | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
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
