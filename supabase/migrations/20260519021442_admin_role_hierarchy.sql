-- B-127 — Admin role hierarchy with 10 configurable permission flags.
-- Five system roles seeded: Super User, Manager, Officer, Junior Officer,
-- Auditor. Every existing admin_users row is backfilled to Super User so
-- nobody loses access; Vanessa can demote via the UI afterwards.

CREATE TABLE IF NOT EXISTS public.admin_roles (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                             REFERENCES public.tenants(id),
  name                     text NOT NULL,
  slug                     text NOT NULL,
  is_system                boolean NOT NULL DEFAULT false,

  -- 10 permission flags (see brief for semantics)
  settings_access          boolean NOT NULL DEFAULT false,
  admin_mgmt_access        boolean NOT NULL DEFAULT false,
  data_access              text NOT NULL DEFAULT 'none'
                             CHECK (data_access IN ('none','view','edit')),
  change_status            boolean NOT NULL DEFAULT false,
  approve_status_change    boolean NOT NULL DEFAULT false,
  send_communications      boolean NOT NULL DEFAULT false,
  destructive_actions      boolean NOT NULL DEFAULT false,
  view_audit_log           boolean NOT NULL DEFAULT false,
  export_data              boolean NOT NULL DEFAULT false,
  can_review               boolean NOT NULL DEFAULT false,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS admin_roles_tenant_idx ON public.admin_roles(tenant_id);

-- Seed 5 system roles with Vanessa-approved defaults
INSERT INTO public.admin_roles (
  name, slug, is_system,
  settings_access, admin_mgmt_access, data_access,
  change_status, approve_status_change, send_communications,
  destructive_actions, view_audit_log, export_data,
  can_review
) VALUES
  ('Super User',     'super_user',     true,  true,  true,  'edit', true,  true,  true,  true,  true,  true,  true),
  ('Manager',        'manager',        true,  false, false, 'edit', true,  true,  true,  false, true,  true,  true),
  ('Officer',        'officer',        true,  false, false, 'edit', true,  false, true,  false, true,  false, false),
  ('Junior Officer', 'junior_officer', true,  false, false, 'view', false, false, false, false, true,  false, false),
  ('Auditor',        'auditor',        true,  false, false, 'view', false, false, false, false, true,  true,  false)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Add role_id FK to admin_users (nullable for now; backfilled below,
-- then we add NOT NULL in a follow-up batch once the app code is live)
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.admin_roles(id);

CREATE INDEX IF NOT EXISTS admin_users_role_idx ON public.admin_users(role_id);

-- Backfill: every existing admin gets Super User
UPDATE public.admin_users
SET role_id = (SELECT id FROM public.admin_roles WHERE slug = 'super_user' LIMIT 1)
WHERE role_id IS NULL;

-- RLS — admin-only read/write on admin_roles (mirrors admin_users policy)
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_roles' AND policyname = 'admin_roles_admin_all'
  ) THEN
    CREATE POLICY "admin_roles_admin_all" ON public.admin_roles
      FOR ALL USING (public.is_admin());
  END IF;
END$$;

-- Audit-log trigger for permission changes
CREATE OR REPLACE FUNCTION public.log_admin_role_change() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.audit_log (
    actor_id, actor_role, action, entity_type, entity_id,
    previous_value, new_value
  ) VALUES (
    auth.uid(),
    'admin',
    'admin_role_permissions_changed',
    'admin_role',
    NEW.id,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS admin_role_change_audit ON public.admin_roles;
CREATE TRIGGER admin_role_change_audit
  AFTER UPDATE ON public.admin_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_role_change();
