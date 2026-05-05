-- ============================================================
-- B-045 — RLS default-deny on every table in the `public` schema
-- ============================================================
-- Supabase's advisor was flagging `rls_disabled_in_public` /
-- `sensitive_columns_exposed` because the browser-side anon key could
-- read any public table over PostgREST.
--
-- The app exclusively uses the service-role key on the server
-- (`src/lib/supabase/admin.ts` → `createAdminClient()`); the service role
-- bypasses RLS entirely. Enabling RLS **with no policies** closes the
-- anon-key path without touching any server query.
--
-- Rules this migration follows:
--   1. Enumerate every public-schema table explicitly (one line per
--      table) so the file is grep-able in code review.
--   2. End with a dynamic DO block that enables RLS on ANY remaining
--      public tables we might have missed — safety net for tables
--      created outside the tracked migrations (e.g. `verification_codes`
--      from a pre-repo migration).
--   3. Do NOT add any policies. Empty policies on RLS-enabled tables
--      means: anon + authenticated roles can read/write nothing. That's
--      the whole point.
--   4. Idempotent. `ALTER TABLE … ENABLE ROW LEVEL SECURITY` is a no-op
--      when already enabled (e.g. `documents_history`,
--      `client_profile_kyc_history` were enabled in migration 004).
--
-- Going forward: every new public-schema table must include
-- `ENABLE ROW LEVEL SECURITY` in its creation migration. See CLAUDE.md
-- tech-debt #3 — the broader move-off-service-role project still open.
-- ============================================================

BEGIN;

-- --- Original POC schema (supabase/schema.sql) --------------
ALTER TABLE public.profiles                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_requirements     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_base            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_uploads          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_account_managers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_log                 ENABLE ROW LEVEL SECURITY;

-- --- Onboarding redesign v2 / docs library (schema.sql) -----
ALTER TABLE public.document_types            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kyc_records               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_persons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_details_gbc_ac ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_links            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_templates         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_requirements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_processes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.process_documents         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.due_diligence_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.due_diligence_settings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_document_requirements ENABLE ROW LEVEL SECURITY;

-- --- Phase 1 redesign + multi-tenancy (migration 003) -------
ALTER TABLE public.tenants                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_profile_kyc        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_service_roles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_requirement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_section_overrides ENABLE ROW LEVEL SECURITY;

-- --- History tables (migration 004, already RLS-on) ---------
ALTER TABLE public.documents_history         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_profile_kyc_history ENABLE ROW LEVEL SECURITY;

-- --- Safety net: catch anything created outside this repo ---
-- (e.g. `verification_codes` referenced in migration 003 but never
-- CREATE'd in-repo — it exists in the live DB from an earlier
-- bootstrap). This loop enables RLS on every remaining public table.
-- Skips unlogged partitions, views, materialized views; pg_tables
-- already filters to regular / partitioned tables.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename NOT LIKE 'pg_%'
      AND tablename NOT LIKE '_prisma_%'  -- future-proof: don't touch ORM internals
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', r.schemaname, r.tablename);
  END LOOP;
END $$;

-- --- Verification: every public table must have RLS on ------
-- Raises loudly if any table still has RLS disabled (pg_class.relrowsecurity = false).
DO $$
DECLARE
  bad_tables text;
BEGIN
  SELECT string_agg(c.relname, ', ')
    INTO bad_tables
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind IN ('r', 'p')          -- regular + partitioned tables
    AND c.relrowsecurity = false;
  IF bad_tables IS NOT NULL THEN
    RAISE EXCEPTION 'RLS still disabled on public tables: %', bad_tables;
  END IF;
END $$;

COMMIT;
