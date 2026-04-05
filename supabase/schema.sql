-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- PROFILES (extends Supabase auth.users)
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  role text not null check (role in ('client', 'admin')),
  full_name text,
  company_name text,
  email text,
  phone text,
  created_at timestamptz default now()
);

-- SERVICE TEMPLATES
create table if not exists service_templates (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- DOCUMENT REQUIREMENTS
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

-- APPLICATIONS
create table if not exists applications (
  id uuid primary key default uuid_generate_v4(),
  client_id uuid references profiles(id),
  template_id uuid references service_templates(id),
  status text not null default 'draft'
    check (status in ('draft','submitted','in_review','pending_action','verification','approved','rejected')),
  business_name text,
  business_address text,
  business_country text,
  business_type text,
  contact_name text,
  contact_email text,
  contact_phone text,
  ubo_data jsonb,
  admin_notes text,
  rejection_reason text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  approved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- DOCUMENT UPLOADS
create table if not exists document_uploads (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id) on delete cascade,
  requirement_id uuid references document_requirements(id),
  file_path text,
  file_name text,
  file_size int,
  mime_type text,
  verification_status text default 'pending'
    check (verification_status in ('pending','verified','flagged','manual_review')),
  verification_result jsonb,
  admin_override text check (admin_override in ('pass', 'fail')),
  admin_override_note text,
  uploaded_at timestamptz default now(),
  verified_at timestamptz
);

-- AUDIT LOG
create table if not exists audit_log (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id),
  actor_id uuid references profiles(id),
  actor_role text check (actor_role in ('client', 'admin', 'system')),
  actor_name text,
  action text not null,
  entity_type text,                -- 'application' | 'document_upload' | 'profile'
  entity_id uuid,
  previous_value jsonb,            -- snapshot before change
  new_value jsonb,                 -- snapshot after change
  detail jsonb,                    -- any extra context
  created_at timestamptz default now()
);

-- EMAIL LOG
create table if not exists email_log (
  id uuid primary key default uuid_generate_v4(),
  application_id uuid references applications(id),
  sent_by uuid references profiles(id),
  to_email text,
  subject text,
  body text,
  resend_id text,
  sent_at timestamptz default now()
);

-- ROW LEVEL SECURITY
alter table profiles enable row level security;
alter table applications enable row level security;
alter table document_uploads enable row level security;
alter table audit_log enable row level security;
alter table email_log enable row level security;
alter table service_templates enable row level security;
alter table document_requirements enable row level security;

-- RLS POLICIES
create policy "clients_own_profile" on profiles for all using (auth.uid() = id);
create policy "clients_own_applications" on applications for all using (auth.uid() = client_id);
create policy "clients_own_uploads" on document_uploads for all
  using (application_id in (select id from applications where client_id = auth.uid()));

-- Service templates and requirements readable by all authenticated users
create policy "authenticated_read_templates" on service_templates for select
  using (auth.role() = 'authenticated');
create policy "authenticated_read_requirements" on document_requirements for select
  using (auth.role() = 'authenticated');

-- Auto-create profile on user registration
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'role', 'client'),
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

-- 1. Log every application status change automatically
create or replace function public.log_application_status_change()
returns trigger as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_actor_name text;
begin
  -- Try to get the calling user from Supabase auth context
  v_actor_id := auth.uid();

  -- Look up their role and name
  select role, coalesce(full_name, email)
  into v_actor_role, v_actor_name
  from public.profiles
  where id = v_actor_id;

  -- Fall back to 'system' if no authenticated user (e.g. service role)
  if v_actor_id is null then
    v_actor_role := 'system';
    v_actor_name := 'system';
  end if;

  if (TG_OP = 'INSERT') then
    insert into public.audit_log (
      application_id, actor_id, actor_role, actor_name,
      action, entity_type, entity_id,
      previous_value, new_value
    ) values (
      NEW.id, v_actor_id, v_actor_role, v_actor_name,
      'application_created', 'application', NEW.id,
      null,
      jsonb_build_object('status', NEW.status, 'business_name', NEW.business_name)
    );

  elsif (TG_OP = 'UPDATE') then
    -- Always log status changes
    if NEW.status <> OLD.status then
      insert into public.audit_log (
        application_id, actor_id, actor_role, actor_name,
        action, entity_type, entity_id,
        previous_value, new_value
      ) values (
        NEW.id, v_actor_id, v_actor_role, v_actor_name,
        'status_changed', 'application', NEW.id,
        jsonb_build_object('status', OLD.status),
        jsonb_build_object('status', NEW.status)
      );
    end if;

    -- Log if admin_notes changed
    if NEW.admin_notes is distinct from OLD.admin_notes then
      insert into public.audit_log (
        application_id, actor_id, actor_role, actor_name,
        action, entity_type, entity_id,
        previous_value, new_value
      ) values (
        NEW.id, v_actor_id, v_actor_role, v_actor_name,
        'notes_updated', 'application', NEW.id,
        jsonb_build_object('admin_notes', OLD.admin_notes),
        jsonb_build_object('admin_notes', NEW.admin_notes)
      );
    end if;

    -- Log rejection reason
    if NEW.rejection_reason is distinct from OLD.rejection_reason
       and NEW.rejection_reason is not null then
      insert into public.audit_log (
        application_id, actor_id, actor_role, actor_name,
        action, entity_type, entity_id,
        new_value
      ) values (
        NEW.id, v_actor_id, v_actor_role, v_actor_name,
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


-- 2. Log every document admin override automatically
create or replace function public.log_document_override()
returns trigger as $$
declare
  v_actor_id uuid;
  v_actor_role text;
  v_actor_name text;
begin
  v_actor_id := auth.uid();

  select role, coalesce(full_name, email)
  into v_actor_role, v_actor_name
  from public.profiles
  where id = v_actor_id;

  if v_actor_id is null then
    v_actor_role := 'system';
    v_actor_name := 'system';
  end if;

  -- Only fire when admin_override actually changes
  if NEW.admin_override is distinct from OLD.admin_override then
    insert into public.audit_log (
      application_id, actor_id, actor_role, actor_name,
      action, entity_type, entity_id,
      previous_value, new_value, detail
    )
    select
      a.id, v_actor_id, v_actor_role, v_actor_name,
      'document_override', 'document_upload', NEW.id,
      jsonb_build_object('admin_override', OLD.admin_override, 'verification_status', OLD.verification_status),
      jsonb_build_object('admin_override', NEW.admin_override, 'verification_status', NEW.verification_status),
      jsonb_build_object(
        'document_id', NEW.id,
        'file_name', NEW.file_name,
        'override_note', NEW.admin_override_note
      )
    from public.applications a
    where a.id = NEW.application_id;
  end if;

  -- Log when AI verification completes
  if NEW.verification_status is distinct from OLD.verification_status
     and OLD.verification_status = 'pending' then
    insert into public.audit_log (
      application_id, actor_id, actor_role, actor_name,
      action, entity_type, entity_id,
      previous_value, new_value, detail
    )
    select
      a.id, v_actor_id, coalesce(v_actor_role, 'system'), coalesce(v_actor_name, 'system'),
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
  v_actor_id uuid;
  v_actor_role text;
  v_actor_name text;
begin
  v_actor_id := auth.uid();

  select role, coalesce(full_name, email)
  into v_actor_role, v_actor_name
  from public.profiles
  where id = v_actor_id;

  if v_actor_id is null then
    v_actor_role := 'system';
    v_actor_name := 'system';
  end if;

  insert into public.audit_log (
    application_id, actor_id, actor_role, actor_name,
    action, entity_type, entity_id, new_value
  ) values (
    NEW.application_id, v_actor_id, v_actor_role, v_actor_name,
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
