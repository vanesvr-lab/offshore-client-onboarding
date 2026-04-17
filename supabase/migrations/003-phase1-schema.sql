-- ============================================================================
-- Phase 1: Services + Profiles Redesign + Multi-Tenancy Foundation
-- Run in Supabase SQL Editor as a single execution
-- ============================================================================
-- This migration:
-- 1. Creates tenants table with GWMS as the default tenant
-- 2. Creates new tables: users, client_profiles, client_profile_kyc, services,
--    profile_service_roles, profile_requirement_overrides, service_section_overrides
-- 3. Migrates data from old tables (profiles, kyc_records, applications, etc.)
-- 4. Adds new FK columns to documents + verification_codes
-- 5. Does NOT drop or rename old tables (backward compatibility)
-- ============================================================================

BEGIN;

-- ─── 0. Tenant foundation ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed GWMS as default tenant — capture the UUID for use in defaults
-- We use a fixed UUID so DEFAULT clauses can reference it
INSERT INTO tenants (id, name, slug)
VALUES ('a1b2c3d4-0000-4000-8000-000000000001', 'GWMS Ltd', 'gwms')
ON CONFLICT (slug) DO NOTHING;

-- ─── 1. Users table (pure auth — replaces profiles for login) ──────────────

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
    REFERENCES tenants(id),
  email text NOT NULL,
  full_name text NOT NULL DEFAULT '',
  phone text,
  password_hash text,
  role text NOT NULL DEFAULT 'user'
    CHECK (role IN ('admin', 'user')),
  is_active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, email)
);

CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(tenant_id, email);

-- ─── 2. Client profiles (all persons — replaces kyc_records identity part) ──

CREATE TABLE IF NOT EXISTS client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
    REFERENCES tenants(id),
  user_id uuid UNIQUE REFERENCES users(id),
  -- NULLABLE: NULL = no login. Set when can_manage toggled + invite sent.
  -- UNIQUE: one user = one client_profile (1:1)

  record_type text NOT NULL DEFAULT 'individual'
    CHECK (record_type IN ('individual', 'organisation')),
  is_representative boolean NOT NULL DEFAULT false,

  -- Contact info
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  address text,

  -- Due diligence
  due_diligence_level text NOT NULL DEFAULT 'cdd'
    CHECK (due_diligence_level IN ('sdd', 'cdd', 'edd')),

  -- Tracking
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_client_profiles_tenant ON client_profiles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_client_profiles_user ON client_profiles(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_client_profiles_email ON client_profiles(tenant_id, email);
CREATE INDEX IF NOT EXISTS idx_client_profiles_not_deleted ON client_profiles(tenant_id) WHERE is_deleted = false;

-- ─── 3. Client profile KYC (1:1 with client_profiles) ─────────────────────

CREATE TABLE IF NOT EXISTS client_profile_kyc (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
    REFERENCES tenants(id),
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

  -- Organisation-only
  business_website text,
  jurisdiction_incorporated text,
  date_of_incorporation date,
  listed_or_unlisted text CHECK (listed_or_unlisted IN ('listed', 'unlisted')),
  jurisdiction_tax_residence text,
  description_activity text,
  company_registration_number text,
  industry_sector text,
  regulatory_licenses text,

  -- Admin risk assessment (admin-only)
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
  risk_rated_by uuid,
  risk_rated_at timestamptz,
  geographic_risk_assessment text,
  relationship_history text,

  -- EDD fields
  risk_flags jsonb DEFAULT '[]'::jsonb,
  senior_management_approval boolean DEFAULT false,
  senior_management_approved_by uuid,
  senior_management_approved_at timestamptz,
  ongoing_monitoring_plan text,

  -- Progress
  completion_status text NOT NULL DEFAULT 'incomplete'
    CHECK (completion_status IN ('incomplete', 'complete')),
  kyc_journey_completed boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cpk_tenant ON client_profile_kyc(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cpk_profile ON client_profile_kyc(client_profile_id);

-- ─── 4. Services (replaces applications — billable engagements) ────────────

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
    REFERENCES tenants(id),
  service_template_id uuid NOT NULL REFERENCES service_templates(id),
  service_details jsonb NOT NULL DEFAULT '{}'::jsonb,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'submitted', 'in_review', 'pending_action', 'verification', 'approved', 'rejected')),

  -- LOE
  loe_received boolean NOT NULL DEFAULT false,
  loe_received_at timestamptz,

  -- Workflow milestone dates
  invoice_sent_at timestamptz,
  payment_received_at timestamptz,

  -- Tracking
  is_deleted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id);
CREATE INDEX IF NOT EXISTS idx_services_template ON services(tenant_id, service_template_id);
CREATE INDEX IF NOT EXISTS idx_services_status ON services(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_services_not_deleted ON services(tenant_id) WHERE is_deleted = false;

-- ─── 5. Profile ↔ Service junction ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS profile_service_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
    REFERENCES tenants(id),
  client_profile_id uuid NOT NULL REFERENCES client_profiles(id),
  service_id uuid NOT NULL REFERENCES services(id),

  role text NOT NULL CHECK (role IN ('director', 'shareholder', 'ubo', 'other')),
  can_manage boolean NOT NULL DEFAULT false,
  shareholding_percentage numeric,

  -- Invite tracking
  invite_sent_at timestamptz,
  invite_sent_by uuid,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(client_profile_id, service_id, role)
);

CREATE INDEX IF NOT EXISTS idx_psr_tenant ON profile_service_roles(tenant_id);
CREATE INDEX IF NOT EXISTS idx_psr_profile ON profile_service_roles(client_profile_id);
CREATE INDEX IF NOT EXISTS idx_psr_service ON profile_service_roles(service_id);
CREATE INDEX IF NOT EXISTS idx_psr_can_manage ON profile_service_roles(tenant_id, can_manage) WHERE can_manage = true;

-- ─── 6. Profile requirement overrides ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS profile_requirement_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
    REFERENCES tenants(id),
  client_profile_id uuid NOT NULL REFERENCES client_profiles(id),
  requirement_id uuid NOT NULL REFERENCES due_diligence_requirements(id),

  is_required boolean NOT NULL,
  reason text,
  overridden_by uuid,
  overridden_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(client_profile_id, requirement_id)
);

CREATE INDEX IF NOT EXISTS idx_pro_tenant ON profile_requirement_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pro_profile ON profile_requirement_overrides(client_profile_id);

-- ─── 7. Service section overrides (for RAG indicators) ─────────────────────

CREATE TABLE IF NOT EXISTS service_section_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
    REFERENCES tenants(id),
  service_id uuid NOT NULL REFERENCES services(id),
  section_key text NOT NULL,

  override_status text NOT NULL CHECK (override_status IN ('green', 'amber', 'red')),
  admin_note text,
  overridden_by uuid,
  overridden_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE(service_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_sso_tenant ON service_section_overrides(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sso_service ON service_section_overrides(service_id);

-- ============================================================================
-- DATA MIGRATION — Populate new tables from old (preserving UUIDs)
-- ============================================================================

-- ─── Migrate profiles → users ──────────────────────────────────────────────

INSERT INTO users (id, tenant_id, email, full_name, phone, password_hash, role, is_active, created_at)
SELECT
  p.id,
  'a1b2c3d4-0000-4000-8000-000000000001',
  COALESCE(p.email, ''),
  COALESCE(p.full_name, ''),
  p.phone,
  p.password_hash,
  CASE WHEN au.id IS NOT NULL THEN 'admin' ELSE 'user' END,
  NOT COALESCE(p.is_deleted, false),
  COALESCE(p.created_at, now())
FROM profiles p
LEFT JOIN admin_users au ON au.user_id = p.id
ON CONFLICT (id) DO NOTHING;

-- ─── Migrate kyc_records → client_profiles ─────────────────────────────────

INSERT INTO client_profiles (
  id, tenant_id, user_id, record_type, is_representative,
  full_name, email, phone, address,
  due_diligence_level, is_deleted, created_at, updated_at
)
SELECT
  kr.id,
  'a1b2c3d4-0000-4000-8000-000000000001',
  kr.profile_id,  -- nullable, links to users.id (same as old profiles.id)
  kr.record_type,
  false,  -- none are representatives in old data
  COALESCE(kr.full_name, ''),
  kr.email,
  kr.phone,
  kr.address,
  COALESCE(kr.due_diligence_level,
    (SELECT COALESCE(c.due_diligence_level, 'cdd') FROM clients c WHERE c.id = kr.client_id),
    'cdd'),
  false,
  COALESCE(kr.created_at, now()),
  COALESCE(kr.updated_at, now())
FROM kyc_records kr
ON CONFLICT (id) DO NOTHING;

-- ─── Migrate kyc_records → client_profile_kyc ──────────────────────────────

INSERT INTO client_profile_kyc (
  id, tenant_id, client_profile_id,
  -- Individual identity
  aliases, work_address, work_phone, work_email,
  date_of_birth, nationality, passport_country, passport_number, passport_expiry,
  occupation, tax_identification_number,
  -- Financial
  source_of_funds_description, source_of_wealth_description,
  is_pep, pep_details, legal_issues_declared, legal_issues_details,
  -- Organisation
  business_website, jurisdiction_incorporated, date_of_incorporation,
  listed_or_unlisted, jurisdiction_tax_residence, description_activity,
  company_registration_number, industry_sector, regulatory_licenses,
  -- Admin risk
  sanctions_checked, sanctions_checked_at, sanctions_notes,
  adverse_media_checked, adverse_media_checked_at, adverse_media_notes,
  pep_verified, pep_verified_at, pep_verified_notes,
  risk_rating, risk_rating_justification, risk_rated_by, risk_rated_at,
  geographic_risk_assessment, relationship_history,
  -- EDD
  risk_flags, senior_management_approval, senior_management_approved_by,
  senior_management_approved_at, ongoing_monitoring_plan,
  -- Progress
  completion_status, kyc_journey_completed,
  created_at, updated_at
)
SELECT
  gen_random_uuid(),
  'a1b2c3d4-0000-4000-8000-000000000001',
  kr.id,  -- client_profile_id = kyc_records.id (same as client_profiles.id)
  -- Individual
  kr.aliases, kr.work_address, kr.work_phone, kr.work_email,
  kr.date_of_birth, kr.nationality, kr.passport_country, kr.passport_number, kr.passport_expiry,
  kr.occupation, kr.tax_identification_number,
  -- Financial
  kr.source_of_funds_description, kr.source_of_wealth_description,
  kr.is_pep, kr.pep_details, kr.legal_issues_declared, kr.legal_issues_details,
  -- Organisation
  kr.business_website, kr.jurisdiction_incorporated, kr.date_of_incorporation,
  kr.listed_or_unlisted, kr.jurisdiction_tax_residence, kr.description_activity,
  kr.company_registration_number, kr.industry_sector, kr.regulatory_licenses,
  -- Admin risk
  COALESCE(kr.sanctions_checked, false), kr.sanctions_checked_at, kr.sanctions_notes,
  COALESCE(kr.adverse_media_checked, false), kr.adverse_media_checked_at, kr.adverse_media_notes,
  COALESCE(kr.pep_verified, false), kr.pep_verified_at, kr.pep_verified_notes,
  kr.risk_rating, kr.risk_rating_justification, kr.risk_rated_by, kr.risk_rated_at,
  kr.geographic_risk_assessment, kr.relationship_history,
  -- EDD
  COALESCE(kr.risk_flags, '[]'::jsonb), COALESCE(kr.senior_management_approval, false),
  kr.senior_management_approved_by, kr.senior_management_approved_at, kr.ongoing_monitoring_plan,
  -- Progress
  COALESCE(kr.completion_status, 'incomplete'), COALESCE(kr.kyc_journey_completed, false),
  COALESCE(kr.created_at, now()), COALESCE(kr.updated_at, now())
FROM kyc_records kr
WHERE EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.id = kr.id);

-- ─── Migrate applications → services ───────────────────────────────────────

INSERT INTO services (
  id, tenant_id, service_template_id, service_details, status,
  loe_received, loe_received_at,
  invoice_sent_at, payment_received_at,
  is_deleted, created_at, updated_at
)
SELECT
  a.id,
  'a1b2c3d4-0000-4000-8000-000000000001',
  a.template_id,
  COALESCE(a.service_details, '{}'::jsonb),
  a.status,
  -- LOE: derive from clients.loe_sent_at
  (c.loe_sent_at IS NOT NULL),
  c.loe_sent_at,
  c.invoice_sent_at,
  c.payment_received_at,
  COALESCE(a.is_deleted, false),
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM applications a
LEFT JOIN clients c ON c.id = a.client_id
WHERE a.template_id IS NOT NULL  -- skip any orphaned applications
ON CONFLICT (id) DO NOTHING;

-- ─── Migrate profile_roles + client_users → profile_service_roles ──────────

-- First: profile_roles (explicit role assignments)
INSERT INTO profile_service_roles (
  id, tenant_id, client_profile_id, service_id, role, can_manage, shareholding_percentage, created_at
)
SELECT
  pr.id,
  'a1b2c3d4-0000-4000-8000-000000000001',
  pr.kyc_record_id,  -- = client_profiles.id
  pr.application_id, -- = services.id
  CASE pr.role
    WHEN 'primary_client' THEN 'other'
    ELSE pr.role
  END,
  -- can_manage if this person's kyc_record is linked to an 'owner' in client_users
  EXISTS (
    SELECT 1 FROM client_users cu
    JOIN kyc_records kr ON kr.profile_id = cu.user_id AND kr.id = pr.kyc_record_id
    WHERE cu.role = 'owner'
  ),
  pr.shareholding_percentage,
  COALESCE(pr.created_at, now())
FROM profile_roles pr
WHERE pr.application_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM services s WHERE s.id = pr.application_id)
  AND EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.id = pr.kyc_record_id)
ON CONFLICT (client_profile_id, service_id, role) DO NOTHING;

-- ─── Add new FK columns to existing tables (backward compat) ───────────────

-- Documents: add client_profile_id and service_id
ALTER TABLE documents ADD COLUMN IF NOT EXISTS client_profile_id uuid REFERENCES client_profiles(id);
ALTER TABLE documents ADD COLUMN IF NOT EXISTS service_id uuid REFERENCES services(id);

-- Populate client_profile_id from kyc_record_id (same UUID)
UPDATE documents SET client_profile_id = kyc_record_id
WHERE kyc_record_id IS NOT NULL AND client_profile_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_documents_client_profile ON documents(client_profile_id);
CREATE INDEX IF NOT EXISTS idx_documents_service ON documents(service_id);

-- Verification codes: add client_profile_id
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'verification_codes') THEN
    EXECUTE 'ALTER TABLE verification_codes ADD COLUMN IF NOT EXISTS client_profile_id uuid REFERENCES client_profiles(id)';
    EXECUTE 'UPDATE verification_codes SET client_profile_id = kyc_record_id WHERE kyc_record_id IS NOT NULL AND client_profile_id IS NULL';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_vc_client_profile ON verification_codes(client_profile_id)';
  END IF;
END
$$;

-- Add tenant_id to existing tables that need it (for future RLS)
ALTER TABLE service_templates ADD COLUMN IF NOT EXISTS tenant_id uuid
  DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001' REFERENCES tenants(id);
ALTER TABLE document_types ADD COLUMN IF NOT EXISTS tenant_id uuid
  DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001' REFERENCES tenants(id);
ALTER TABLE due_diligence_requirements ADD COLUMN IF NOT EXISTS tenant_id uuid
  DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001' REFERENCES tenants(id);
ALTER TABLE due_diligence_settings ADD COLUMN IF NOT EXISTS tenant_id uuid
  DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001' REFERENCES tenants(id);
ALTER TABLE role_document_requirements ADD COLUMN IF NOT EXISTS tenant_id uuid
  DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001' REFERENCES tenants(id);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_id uuid
  DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001' REFERENCES tenants(id);

-- ─── Expand due_diligence_requirements for field tracking ──────────────────

ALTER TABLE due_diligence_requirements
  ADD COLUMN IF NOT EXISTS requirement_type text DEFAULT 'document'
    CHECK (requirement_type IN ('document', 'field')),
  ADD COLUMN IF NOT EXISTS field_key text,
  ADD COLUMN IF NOT EXISTS applies_to text DEFAULT 'both'
    CHECK (applies_to IN ('individual', 'organisation', 'both'));

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (run after migration to confirm data integrity)
-- ============================================================================
-- SELECT 'users' AS tbl, count(*) FROM users
-- UNION ALL SELECT 'client_profiles', count(*) FROM client_profiles
-- UNION ALL SELECT 'client_profile_kyc', count(*) FROM client_profile_kyc
-- UNION ALL SELECT 'services', count(*) FROM services
-- UNION ALL SELECT 'profile_service_roles', count(*) FROM profile_service_roles;
--
-- Compare with old table counts:
-- SELECT 'profiles_old' AS tbl, count(*) FROM profiles
-- UNION ALL SELECT 'kyc_records', count(*) FROM kyc_records
-- UNION ALL SELECT 'applications', count(*) FROM applications
-- UNION ALL SELECT 'profile_roles', count(*) FROM profile_roles;
