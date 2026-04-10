-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- -------------------------------------------------------
-- CORE IDENTITY TABLES
-- -------------------------------------------------------

-- PROFILES: one row per auth user — personal info only, no role
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  email text,
  phone text,
  created_at timestamptz default now()
);

-- CLIENTS: the company entity — independent of who logged in
create table if not exists clients (
  id uuid primary key default uuid_generate_v4(),
  company_name text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CLIENT_USERS: who belongs to which company, and in what capacity
-- A user's role (owner vs member) is determined here, not on profiles
create table if not exists client_users (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references clients(id) on delete cascade not null,
  user_id   uuid references profiles(id) on delete cascade not null,
  role      text not null default 'owner' check (role in ('owner', 'member')),
  invited_by uuid references profiles(id),
  created_at timestamptz default now(),
  unique(client_id, user_id)
);

-- ADMIN_USERS: portal admins — completely separate from client users
create table if not exists admin_users (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references profiles(id) on delete cascade unique not null,
  created_at timestamptz default now()
);

-- -------------------------------------------------------
-- SERVICE CONFIGURATION
-- -------------------------------------------------------

create table if not exists service_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists document_requirements (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references service_templates(id) on delete cascade,
  name text not null,
  description text,
  category text not null check (category in ('corporate', 'kyc', 'compliance')),
  is_required boolean default true,
  sort_order int default 0,
  verification_rules jsonb,
  created_at timestamptz default now()
);

-- -------------------------------------------------------
-- KNOWLEDGE BASE
-- Regulatory knowledge base used by AI preliminary verification.
-- Admins manage entries (rules, required-document lists, regulatory text
-- excerpts). When a document is verified, relevant KB entries are included
-- in the prompt so the AI can reference the actual regulatory context.
-- -------------------------------------------------------

create table if not exists knowledge_base (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text not null check (category in ('rule', 'document_requirement', 'regulatory_text', 'general')),
  content text not null,
  -- applies_to structure: { "template_ids": ["uuid",...], "document_type": "passport", "tags": ["aml","pep"] }
  applies_to jsonb default '{}'::jsonb,
  source text,                               -- e.g. "FSC Rules 2022 Section 3.1", "Mauritius FIAMLA Act"
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references profiles(id)
);

create index if not exists knowledge_base_category_idx on knowledge_base(category) where is_active;

-- -------------------------------------------------------
-- APPLICATIONS
-- client_id references clients — not the individual user
-- Multiple users from the same company all see the same applications
-- -------------------------------------------------------

create table if not exists applications (
  id uuid primary key default uuid_generate_v4(),
  client_id    uuid references clients(id),
  template_id  uuid references service_templates(id),
  status text not null default 'draft'
    check (status in ('draft','submitted','in_review','pending_action','verification','approved','rejected')),
  business_name    text,
  business_address text,
  business_country text,
  business_type    text,
  contact_name     text,
  contact_email    text,
  contact_phone    text,
  contact_title    text,
  ubo_data         jsonb,
  admin_notes      text,
  rejection_reason text,
  submitted_at     timestamptz,
  reviewed_at      timestamptz,
  approved_at      timestamptz,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now()
);

-- -------------------------------------------------------
-- DOCUMENT UPLOADS
-- -------------------------------------------------------

create table if not exists document_uploads (
  id uuid primary key default uuid_generate_v4(),
  application_id  uuid references applications(id) on delete cascade,
  requirement_id  uuid references document_requirements(id),
  file_path       text,
  file_name       text,
  file_size       int,
  mime_type       text,
  verification_status text default 'pending'
    check (verification_status in ('pending','verified','flagged','manual_review')),
  verification_result jsonb,
  admin_override  text check (admin_override in ('pass', 'fail')),
  admin_override_note text,
  uploaded_by     uuid references profiles(id),
  uploaded_at     timestamptz default now(),
  verified_at     timestamptz
);

-- -------------------------------------------------------
-- AUDIT LOG
-- -------------------------------------------------------

create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id),
  actor_id       uuid references profiles(id),
  actor_role     text check (actor_role in ('client', 'admin', 'system')),
  actor_name     text,
  action         text not null,
  entity_type    text,
  entity_id      uuid,
  previous_value jsonb,
  new_value      jsonb,
  detail         jsonb,
  created_at     timestamptz default now()
);

-- CLIENT ACCOUNT MANAGERS
-- Tracks which admin is responsible for a client account over time.
-- ended_at IS NULL means currently active. When a new manager is assigned,
-- the current row gets ended_at = now() and a new row is inserted.
-- Any admin can assign/reassign for now (no ownership check).
create table if not exists client_account_managers (
  id          uuid primary key default uuid_generate_v4(),
  client_id   uuid references clients(id) on delete cascade not null,
  admin_id    uuid references profiles(id) not null,   -- the admin taking responsibility
  started_at  timestamptz not null default now(),
  ended_at    timestamptz,                              -- null = currently active
  notes       text,
  assigned_by uuid references profiles(id),            -- who made this assignment
  created_at  timestamptz default now()
);

-- EMAIL LOG
create table if not exists email_log (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id),
  sent_by        uuid references profiles(id),
  to_email       text,
  subject        text,
  body           text,
  resend_id      text,
  sent_at        timestamptz default now()
);

-- -------------------------------------------------------
-- ROW LEVEL SECURITY
-- -------------------------------------------------------

alter table profiles                  enable row level security;
alter table clients                   enable row level security;
alter table client_users              enable row level security;
alter table admin_users               enable row level security;
alter table client_account_managers   enable row level security;
alter table applications              enable row level security;
alter table document_uploads          enable row level security;
alter table audit_log                 enable row level security;
alter table email_log                 enable row level security;
alter table service_templates         enable row level security;
alter table document_requirements     enable row level security;

-- Helper: returns true if the calling user has an admin_users record
-- Used in RLS policies so admins can see all data
create or replace function public.is_admin()
returns boolean as $$
  select exists(select 1 from public.admin_users where user_id = auth.uid())
$$ language sql security definer stable;

-- profiles: own row, or admins can read any profile (e.g. to show names)
create policy "users_own_profile" on profiles
  for all using (auth.uid() = id);
create policy "admins_read_all_profiles" on profiles
  for select using (public.is_admin());

-- clients: members see their own company; admins see all
create policy "client_members_read" on clients
  for select using (
    id in (select client_id from client_users where user_id = auth.uid())
  );
create policy "admins_read_all_clients" on clients
  for select using (public.is_admin());
-- Any authenticated user can create a client (during registration)
create policy "authenticated_create_client" on clients
  for insert with check (auth.uid() is not null);
-- Owners or admins can update a client
create policy "client_owners_update" on clients
  for update using (
    id in (select client_id from client_users where user_id = auth.uid() and role = 'owner')
    or public.is_admin()
  );

-- client_users: users see their own; admins see all
create policy "users_own_client_users" on client_users
  for select using (user_id = auth.uid());
create policy "admins_read_all_client_users" on client_users
  for select using (public.is_admin());
create policy "users_insert_own_client_user" on client_users
  for insert with check (user_id = auth.uid());

-- admin_users: admins see all records (needed to populate manager dropdown)
create policy "admins_read_all_admin_users" on admin_users
  for select using (public.is_admin());

-- client_account_managers: admins can do everything; clients can read their own
create policy "admins_manage_account_managers" on client_account_managers
  for all using (public.is_admin());
create policy "clients_read_own_account_manager" on client_account_managers
  for select using (
    client_id in (select client_id from client_users where user_id = auth.uid())
  );

-- applications: company members or admins
create policy "clients_own_applications" on applications
  for all using (
    client_id in (select client_id from client_users where user_id = auth.uid())
  );
create policy "admins_read_all_applications" on applications
  for select using (public.is_admin());

-- document_uploads: through application → client membership, or admin
create policy "clients_own_uploads" on document_uploads
  for all using (
    application_id in (
      select a.id from applications a
      inner join client_users cu on cu.client_id = a.client_id
      where cu.user_id = auth.uid()
    )
  );
create policy "admins_read_all_uploads" on document_uploads
  for select using (public.is_admin());

-- audit_log: clients read their own; admins read all
create policy "clients_read_own_audit" on audit_log
  for select using (
    application_id in (
      select a.id from applications a
      inner join client_users cu on cu.client_id = a.client_id
      where cu.user_id = auth.uid()
    )
  );
create policy "admins_read_all_audit" on audit_log
  for select using (public.is_admin());

-- service_templates and requirements: readable by all authenticated users
create policy "authenticated_read_templates" on service_templates
  for select using (auth.uid() is not null);
create policy "authenticated_read_requirements" on document_requirements
  for select using (auth.uid() is not null);

-- -------------------------------------------------------
-- AUTO-CREATE PROFILE ON REGISTRATION
-- -------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.email
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- -------------------------------------------------------
-- AUTOMATIC AUDIT TRIGGERS
-- -------------------------------------------------------

-- Helper: resolve actor info from auth context
-- Role is derived from admin_users / client_users, not profiles
create or replace function public.get_actor_info(
  out v_actor_id uuid,
  out v_actor_role text,
  out v_actor_name text
) as $$
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    v_actor_role := 'system';
    v_actor_name := 'system';
    return;
  end if;

  select coalesce(full_name, email)
  into v_actor_name
  from public.profiles
  where id = v_actor_id;

  if exists(select 1 from public.admin_users where user_id = v_actor_id) then
    v_actor_role := 'admin';
  elsif exists(select 1 from public.client_users where user_id = v_actor_id) then
    v_actor_role := 'client';
  else
    v_actor_role := 'system';
  end if;
end;
$$ language plpgsql security definer;


-- 1. Log every application status change automatically
create or replace function public.log_application_status_change()
returns trigger as $$
declare
  actor_id   uuid;
  actor_role text;
  actor_name text;
begin
  select * into actor_id, actor_role, actor_name from public.get_actor_info();

  if (TG_OP = 'INSERT') then
    insert into public.audit_log (
      application_id, actor_id, actor_role, actor_name,
      action, entity_type, entity_id, new_value
    ) values (
      NEW.id, actor_id, actor_role, actor_name,
      'application_created', 'application', NEW.id,
      jsonb_build_object('status', NEW.status, 'business_name', NEW.business_name)
    );

  elsif (TG_OP = 'UPDATE') then
    if NEW.status <> OLD.status then
      insert into public.audit_log (
        application_id, actor_id, actor_role, actor_name,
        action, entity_type, entity_id, previous_value, new_value
      ) values (
        NEW.id, actor_id, actor_role, actor_name,
        'status_changed', 'application', NEW.id,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status)
      );
    end if;

    if NEW.admin_notes is distinct from OLD.admin_notes then
      insert into public.audit_log (
        application_id, actor_id, actor_role, actor_name,
        action, entity_type, entity_id, previous_value, new_value
      ) values (
        NEW.id, actor_id, actor_role, actor_name,
        'notes_updated', 'application', NEW.id,
        jsonb_build_object('admin_notes', OLD.admin_notes),
        jsonb_build_object('admin_notes', NEW.admin_notes)
      );
    end if;

    if NEW.rejection_reason is distinct from OLD.rejection_reason
       and NEW.rejection_reason is not null then
      insert into public.audit_log (
        application_id, actor_id, actor_role, actor_name,
        action, entity_type, entity_id, new_value
      ) values (
        NEW.id, actor_id, actor_role, actor_name,
        'rejection_reason_set', 'application', NEW.id,
        jsonb_build_object('rejection_reason', NEW.rejection_reason)
      );
    end if;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_application_change on public.applications;
create trigger on_application_change
  after insert or update on public.applications
  for each row execute procedure public.log_application_status_change();


-- 2. Log document admin overrides and AI verification
create or replace function public.log_document_override()
returns trigger as $$
declare
  actor_id   uuid;
  actor_role text;
  actor_name text;
begin
  select * into actor_id, actor_role, actor_name from public.get_actor_info();

  if NEW.admin_override is distinct from OLD.admin_override then
    insert into public.audit_log (
      application_id, actor_id, actor_role, actor_name,
      action, entity_type, entity_id, previous_value, new_value, detail
    )
    select
      a.id, actor_id, actor_role, actor_name,
      'document_override', 'document_upload', NEW.id,
      jsonb_build_object('admin_override', OLD.admin_override),
      jsonb_build_object('admin_override', NEW.admin_override),
      jsonb_build_object('file_name', NEW.file_name, 'override_note', NEW.admin_override_note)
    from public.applications a
    where a.id = NEW.application_id;
  end if;

  if NEW.verification_status is distinct from OLD.verification_status
     and OLD.verification_status = 'pending' then
    insert into public.audit_log (
      application_id, actor_id, actor_role, actor_name,
      action, entity_type, entity_id, previous_value, new_value, detail
    )
    select
      a.id, actor_id, coalesce(actor_role, 'system'), coalesce(actor_name, 'system'),
      'document_verified', 'document_upload', NEW.id,
      jsonb_build_object('verification_status', OLD.verification_status),
      jsonb_build_object('verification_status', NEW.verification_status),
      jsonb_build_object('file_name', NEW.file_name)
    from public.applications a
    where a.id = NEW.application_id;
  end if;

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_document_upload_change on public.document_uploads;
create trigger on_document_upload_change
  after update on public.document_uploads
  for each row execute procedure public.log_document_override();


-- 3. Log new document uploads
create or replace function public.log_document_upload()
returns trigger as $$
declare
  actor_id   uuid;
  actor_role text;
  actor_name text;
begin
  select * into actor_id, actor_role, actor_name from public.get_actor_info();

  insert into public.audit_log (
    application_id, actor_id, actor_role, actor_name,
    action, entity_type, entity_id, new_value
  ) values (
    NEW.application_id, actor_id, actor_role, actor_name,
    'document_uploaded', 'document_upload', NEW.id,
    jsonb_build_object(
      'file_name', NEW.file_name,
      'file_size', NEW.file_size,
      'mime_type', NEW.mime_type,
      'requirement_id', NEW.requirement_id
    )
  );

  return NEW;
end;
$$ language plpgsql security definer;

drop trigger if exists on_document_upload_insert on public.document_uploads;
create trigger on_document_upload_insert
  after insert on public.document_uploads
  for each row execute procedure public.log_document_upload();


-- ============================================================
-- ONBOARDING REDESIGN v2
-- ============================================================

-- Alter clients table with new workflow milestone columns
alter table public.clients
  add column if not exists client_type text check (client_type in ('individual', 'organisation')),
  add column if not exists loe_sent_at timestamptz,
  add column if not exists invoice_sent_at timestamptz,
  add column if not exists payment_received_at timestamptz,
  add column if not exists portal_link_sent_at timestamptz,
  add column if not exists kyc_completed_at timestamptz,
  add column if not exists application_submitted_at timestamptz;

-- Master list of document kinds
create table if not exists public.document_types (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  category         text not null check (category in ('identity', 'corporate', 'financial', 'compliance', 'additional')),
  applies_to       text not null default 'both' check (applies_to in ('individual', 'organisation', 'both')),
  description      text,
  validity_period_days int,
  ai_verification_rules jsonb,
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

-- Unified individual + organisation KYC records
create table if not exists public.kyc_records (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  profile_id       uuid references public.profiles(id),
  record_type      text not null check (record_type in ('individual', 'organisation')),
  -- Common fields
  full_name        text,
  email            text,
  phone            text,
  address          text,
  -- Individual-only
  aliases          text,
  work_address     text,
  work_phone       text,
  work_email       text,
  date_of_birth    date,
  nationality      text,
  passport_country text,
  passport_number  text,
  passport_expiry  date,
  occupation       text,
  legal_issues_declared    boolean,
  legal_issues_details     text,
  tax_identification_number text,
  source_of_funds_description  text,
  source_of_wealth_description text,
  is_pep           boolean,
  pep_details      text,
  -- Organisation-only
  business_website              text,
  jurisdiction_incorporated     text,
  date_of_incorporation         date,
  listed_or_unlisted            text check (listed_or_unlisted in ('listed', 'unlisted')),
  jurisdiction_tax_residence    text,
  description_activity          text,
  company_registration_number   text,
  industry_sector               text,
  regulatory_licenses           text,
  -- Admin risk assessment (admin-only, not visible to client)
  sanctions_checked             boolean not null default false,
  sanctions_checked_at          timestamptz,
  sanctions_notes               text,
  adverse_media_checked         boolean not null default false,
  adverse_media_checked_at      timestamptz,
  adverse_media_notes           text,
  pep_verified                  boolean not null default false,
  pep_verified_at               timestamptz,
  pep_verified_notes            text,
  risk_rating                   text check (risk_rating in ('low', 'medium', 'high', 'prohibited')),
  risk_rating_justification     text,
  risk_rated_by                 uuid references public.profiles(id),
  risk_rated_at                 timestamptz,
  geographic_risk_assessment    text,
  relationship_history          text,
  -- Tracking
  completion_status  text not null default 'incomplete' check (completion_status in ('incomplete', 'complete')),
  filled_by          uuid references public.profiles(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Links persons (KYC records) to applications with roles
-- Replaces ubo_data JSONB column on applications
create table if not exists public.application_persons (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references public.applications(id) on delete cascade,
  kyc_record_id    uuid not null references public.kyc_records(id),
  role             text not null check (role in ('director', 'shareholder', 'ubo', 'contact')),
  shareholding_percentage numeric(5,2),
  created_at       timestamptz not null default now()
);

-- GBC/AC-specific application detail fields
create table if not exists public.application_details_gbc_ac (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null unique references public.applications(id) on delete cascade,
  proposed_names                text[],
  proposed_business_activity    text,
  geographical_area             text,
  transaction_currency          text,
  estimated_turnover_3yr        text,
  requires_mauritian_bank       boolean,
  preferred_bank                text,
  estimated_inward_value        text,
  estimated_inward_count        text,
  estimated_outward_value       text,
  estimated_outward_count       text,
  other_mauritius_companies     text,
  balance_sheet_date            date,
  initial_stated_capital        text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

-- Document library: client-level, tagged by type, reusable across processes
create table if not exists public.documents (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients(id) on delete cascade,
  kyc_record_id    uuid references public.kyc_records(id),
  document_type_id uuid not null references public.document_types(id),
  file_path        text not null,
  file_name        text not null,
  file_size        bigint,
  mime_type        text,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'verified', 'flagged', 'manual_review')),
  verification_result jsonb,
  expiry_date      date,
  notes            text,
  is_active        boolean not null default true,
  uploaded_by      uuid references public.profiles(id),
  uploaded_at      timestamptz not null default now(),
  verified_at      timestamptz
);

-- Junction: connects documents to applications / processes / KYC records
create table if not exists public.document_links (
  id               uuid primary key default gen_random_uuid(),
  document_id      uuid not null references public.documents(id) on delete cascade,
  linked_to_type   text not null check (linked_to_type in ('application', 'process', 'kyc')),
  linked_to_id     uuid not null,
  required_by      uuid references public.document_types(id),
  linked_at        timestamptz not null default now(),
  linked_by        uuid references public.profiles(id)
);

-- Templates defining what documents each process needs
create table if not exists public.process_templates (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  description      text,
  client_type      text check (client_type in ('individual', 'organisation', 'both')),
  is_active        boolean not null default true,
  sort_order       int not null default 0,
  created_at       timestamptz not null default now()
);

-- Document requirements per process template
create table if not exists public.process_requirements (
  id                   uuid primary key default gen_random_uuid(),
  process_template_id  uuid not null references public.process_templates(id) on delete cascade,
  document_type_id     uuid not null references public.document_types(id),
  is_required          boolean not null default true,
  per_person           boolean not null default false,
  applies_to_role      text[],
  sort_order           int not null default 0
);

-- Active processes per client
create table if not exists public.client_processes (
  id                   uuid primary key default gen_random_uuid(),
  client_id            uuid not null references public.clients(id) on delete cascade,
  process_template_id  uuid not null references public.process_templates(id),
  status               text not null default 'draft' check (status in ('draft', 'collecting', 'ready', 'submitted', 'complete')),
  notes                text,
  started_by           uuid references public.profiles(id),
  started_at           timestamptz not null default now(),
  completed_at         timestamptz
);

-- Documents collected for a specific process
create table if not exists public.process_documents (
  id               uuid primary key default gen_random_uuid(),
  process_id       uuid not null references public.client_processes(id) on delete cascade,
  requirement_id   uuid not null references public.process_requirements(id),
  kyc_record_id    uuid references public.kyc_records(id),
  source           text check (source in ('kyc_reused', 'uploaded', 'requested')),
  document_id      uuid references public.documents(id),
  status           text not null default 'missing' check (status in ('available', 'missing', 'requested', 'received')),
  requested_at     timestamptz,
  received_at      timestamptz
);
