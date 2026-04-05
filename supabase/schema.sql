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
  action text not null,
  detail jsonb,
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
