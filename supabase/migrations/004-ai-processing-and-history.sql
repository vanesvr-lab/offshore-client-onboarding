-- ============================================================
-- B-033 Migration — AI processing, admin status, history tables
-- ============================================================
-- Run in Supabase SQL Editor as a single execution.

BEGIN;

-- 1. document_types — new AI processing columns
ALTER TABLE document_types
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_extraction_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_extraction_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN document_types.ai_enabled IS
  'When false, uploads skip AI call and land at pending admin review directly.';
COMMENT ON COLUMN document_types.ai_extraction_enabled IS
  'When true and ai_enabled is true, AI prompt asks for extracted_fields in response.';
COMMENT ON COLUMN document_types.ai_extraction_fields IS
  'Array of {key,label,ai_hint,type,prefill_field} — defines what AI should extract and which KYC column it optionally prefills.';

-- 2. documents — extend verification_status check, add 'not_run'
DO $$
DECLARE r record;
BEGIN
  FOR r IN (SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.documents'::regclass
              AND conname LIKE '%verification_status%') LOOP
    EXECUTE 'ALTER TABLE documents DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE documents
  ADD CONSTRAINT documents_verification_status_check
  CHECK (verification_status IN ('pending','verified','flagged','manual_review','not_run'));

-- admin_status — default pending_review, backfill nulls, enforce NOT NULL
ALTER TABLE documents
  ALTER COLUMN admin_status SET DEFAULT 'pending_review';

UPDATE documents SET admin_status = 'pending_review' WHERE admin_status IS NULL;

-- Also migrate any legacy 'pending' rows to 'pending_review' so the new check constraint accepts them.
UPDATE documents SET admin_status = 'pending_review' WHERE admin_status = 'pending';

DO $$
DECLARE r record;
BEGIN
  FOR r IN (SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.documents'::regclass
              AND conname LIKE '%admin_status%') LOOP
    EXECUTE 'ALTER TABLE documents DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE documents
  ALTER COLUMN admin_status SET NOT NULL,
  ADD CONSTRAINT documents_admin_status_check
    CHECK (admin_status IN ('pending_review','approved','rejected'));

-- prefill dismissal column
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS prefill_dismissed_at timestamptz;

-- 3. documents_history — full row snapshots (mirror documents columns)
CREATE TABLE IF NOT EXISTS documents_history (
  history_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid NOT NULL,
  operation           text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  changed_at          timestamptz NOT NULL DEFAULT now(),
  changed_by          uuid,
  changed_by_role     text,
  -- Snapshot mirrors every public.documents column (see schema.sql + 003 migration)
  client_id           uuid,
  kyc_record_id       uuid,
  document_type_id    uuid,
  client_profile_id   uuid,
  service_id          uuid,
  tenant_id           uuid,
  file_path           text,
  file_name           text,
  file_size           bigint,
  mime_type           text,
  verification_status text,
  verification_result jsonb,
  expiry_date         date,
  notes               text,
  is_active           boolean,
  uploaded_by         uuid,
  uploaded_at         timestamptz,
  verified_at         timestamptz,
  admin_status        text,
  admin_status_note   text,
  admin_status_by     uuid,
  admin_status_at     timestamptz,
  prefill_dismissed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_documents_history_doc
  ON documents_history(document_id, changed_at DESC);

-- 4. client_profile_kyc_history — full row snapshot as JSONB
CREATE TABLE IF NOT EXISTS client_profile_kyc_history (
  history_id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_kyc_id uuid NOT NULL,
  operation             text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  changed_at            timestamptz NOT NULL DEFAULT now(),
  changed_by            uuid,
  changed_by_role       text,
  row_data              jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cpk_history_kyc
  ON client_profile_kyc_history(client_profile_kyc_id, changed_at DESC);

-- Rationale: documents_history uses mirrored columns (small, stable); client_profile_kyc_history
-- uses JSONB (large, evolving) — trade-off is intentional and documented in CHANGES.md.

-- 5. Helper: infer actor role from session user
CREATE OR REPLACE FUNCTION public.get_history_actor_role(uid uuid) RETURNS text AS $$
DECLARE
  is_admin boolean;
BEGIN
  IF uid IS NULL THEN RETURN 'system'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = uid) INTO is_admin;
  IF is_admin THEN RETURN 'admin'; ELSE RETURN 'client'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger: documents_history
CREATE OR REPLACE FUNCTION public.log_documents_history() RETURNS trigger AS $$
DECLARE
  uid uuid;
BEGIN
  BEGIN
    uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    uid := NULL;
  END;

  INSERT INTO documents_history (
    document_id, operation, changed_by, changed_by_role,
    client_id, kyc_record_id, document_type_id, client_profile_id, service_id, tenant_id,
    file_path, file_name, file_size, mime_type,
    verification_status, verification_result,
    expiry_date, notes, is_active, uploaded_by, uploaded_at, verified_at,
    admin_status, admin_status_note, admin_status_by, admin_status_at,
    prefill_dismissed_at
  ) VALUES (
    COALESCE(NEW.id, OLD.id), TG_OP, uid, public.get_history_actor_role(uid),
    COALESCE(NEW.client_id, OLD.client_id),
    COALESCE(NEW.kyc_record_id, OLD.kyc_record_id),
    COALESCE(NEW.document_type_id, OLD.document_type_id),
    COALESCE(NEW.client_profile_id, OLD.client_profile_id),
    COALESCE(NEW.service_id, OLD.service_id),
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    COALESCE(NEW.file_path, OLD.file_path),
    COALESCE(NEW.file_name, OLD.file_name),
    COALESCE(NEW.file_size, OLD.file_size),
    COALESCE(NEW.mime_type, OLD.mime_type),
    COALESCE(NEW.verification_status, OLD.verification_status),
    COALESCE(NEW.verification_result, OLD.verification_result),
    COALESCE(NEW.expiry_date, OLD.expiry_date),
    COALESCE(NEW.notes, OLD.notes),
    COALESCE(NEW.is_active, OLD.is_active),
    COALESCE(NEW.uploaded_by, OLD.uploaded_by),
    COALESCE(NEW.uploaded_at, OLD.uploaded_at),
    COALESCE(NEW.verified_at, OLD.verified_at),
    COALESCE(NEW.admin_status, OLD.admin_status),
    COALESCE(NEW.admin_status_note, OLD.admin_status_note),
    COALESCE(NEW.admin_status_by, OLD.admin_status_by),
    COALESCE(NEW.admin_status_at, OLD.admin_status_at),
    COALESCE(NEW.prefill_dismissed_at, OLD.prefill_dismissed_at)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS documents_history_trg ON documents;
CREATE TRIGGER documents_history_trg
AFTER INSERT OR UPDATE OR DELETE ON documents
FOR EACH ROW EXECUTE PROCEDURE public.log_documents_history();

-- 7. Trigger: client_profile_kyc_history (JSONB row snapshot)
CREATE OR REPLACE FUNCTION public.log_client_profile_kyc_history() RETURNS trigger AS $$
DECLARE
  uid uuid;
  snapshot jsonb;
BEGIN
  BEGIN
    uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    uid := NULL;
  END;

  IF TG_OP = 'DELETE' THEN
    snapshot := to_jsonb(OLD);
  ELSE
    snapshot := to_jsonb(NEW);
  END IF;

  INSERT INTO client_profile_kyc_history (
    client_profile_kyc_id, operation, changed_by, changed_by_role, row_data
  ) VALUES (
    COALESCE(NEW.id, OLD.id), TG_OP, uid, public.get_history_actor_role(uid), snapshot
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS client_profile_kyc_history_trg ON client_profile_kyc;
CREATE TRIGGER client_profile_kyc_history_trg
AFTER INSERT OR UPDATE OR DELETE ON client_profile_kyc
FOR EACH ROW EXECUTE PROCEDURE public.log_client_profile_kyc_history();

-- 8. RLS on history tables — admin-only read, writes only via triggers
ALTER TABLE documents_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profile_kyc_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_read_documents_history" ON documents_history;
CREATE POLICY "admins_read_documents_history" ON documents_history
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "admins_read_cpk_history" ON client_profile_kyc_history;
CREATE POLICY "admins_read_cpk_history" ON client_profile_kyc_history
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- 9. Schema-drift guard — every documents column (except id) must exist in documents_history
CREATE OR REPLACE FUNCTION public.assert_documents_history_sync() RETURNS void AS $$
DECLARE missing_cols text[];
BEGIN
  SELECT array_agg(column_name) INTO missing_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'documents'
    AND column_name NOT IN ('id')
    AND column_name NOT IN (
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents_history'
    );
  IF array_length(missing_cols, 1) > 0 THEN
    RAISE EXCEPTION 'documents_history missing columns: %', missing_cols;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Run the guard immediately so the migration fails loudly if columns were missed.
SELECT public.assert_documents_history_sync();

COMMIT;
