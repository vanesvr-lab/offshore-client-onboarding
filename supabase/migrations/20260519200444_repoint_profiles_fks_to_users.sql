-- B-138 — Repoint admin-actor FKs from legacy public.profiles(id) to
-- public.users(id). Same DO-block pattern as
-- 20260513014208_admin_users_fk_repoint_to_users.sql.
--
-- B-118's review_request_reviewers.admin_id was the reported bug
-- (admins created via the modern invite flow exist in public.users
-- only, so the FK to profiles rejected the insert). The other 23
-- columns in this migration share the same shape and would surface
-- the same class of bug as the modern invite flow becomes the only
-- path used for new admins.
--
-- Two FKs were audited and explicitly LEFT ALONE because they still
-- refer to legacy client-actor identities, not admins:
--   * public.client_users.user_id      (the client themselves in the
--                                       deprecated client-owner model)
--   * public.kyc_records.profile_id    (the client owner of a legacy
--                                       kyc_records row)
--
-- Pre-flight: every column being repointed must have all non-null
-- values already present in public.users. The audit at brief time
-- (2026-05-19) reported zero orphans across all 24 columns; the
-- block below RAISEs at apply time too so the migration can't
-- silently corrupt data if a race inserted an orphan in between.

DO $$
DECLARE
  orphan_count int;
BEGIN
  SELECT count(*) INTO orphan_count FROM public.application_section_reviews t WHERE t.reviewed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.reviewed_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in application_section_reviews.reviewed_by (no matching public.users.id). Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.audit_log t WHERE t.actor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.actor_id);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in audit_log.actor_id. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.client_account_managers t WHERE t.admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.admin_id);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in client_account_managers.admin_id. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.client_account_managers t WHERE t.assigned_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.assigned_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in client_account_managers.assigned_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.client_processes t WHERE t.started_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.started_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in client_processes.started_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.client_users t WHERE t.invited_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.invited_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in client_users.invited_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.clients t WHERE t.deleted_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.deleted_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in clients.deleted_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.document_links t WHERE t.linked_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.linked_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in document_links.linked_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.document_uploads t WHERE t.uploaded_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.uploaded_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in document_uploads.uploaded_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.documents t WHERE t.uploaded_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.uploaded_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in documents.uploaded_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.email_log t WHERE t.sent_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.sent_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in email_log.sent_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.knowledge_base t WHERE t.created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.created_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in knowledge_base.created_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.kyc_records t WHERE t.filled_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.filled_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in kyc_records.filled_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.kyc_records t WHERE t.invite_sent_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.invite_sent_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in kyc_records.invite_sent_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.kyc_records t WHERE t.risk_rated_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.risk_rated_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in kyc_records.risk_rated_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.kyc_records t WHERE t.senior_management_approved_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.senior_management_approved_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in kyc_records.senior_management_approved_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.reference_forms t WHERE t.created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.created_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in reference_forms.created_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.review_request_reviewers t WHERE t.admin_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.admin_id);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in review_request_reviewers.admin_id. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.review_requests t WHERE t.closed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.closed_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in review_requests.closed_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.review_requests t WHERE t.requester_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.requester_id);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in review_requests.requester_id. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.service_actions t WHERE t.assigned_to IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.assigned_to);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in service_actions.assigned_to. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.service_actions t WHERE t.completed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.completed_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in service_actions.completed_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.service_substance t WHERE t.admin_assessed_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.admin_assessed_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in service_substance.admin_assessed_by. Resolve before re-running.', orphan_count; END IF;

  SELECT count(*) INTO orphan_count FROM public.submitted_forms t WHERE t.uploaded_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = t.uploaded_by);
  IF orphan_count > 0 THEN RAISE EXCEPTION 'B-138 — % orphan rows in submitted_forms.uploaded_by. Resolve before re-running.', orphan_count; END IF;
END$$;

-- ── Repoint each admin-actor FK ─────────────────────────────────────────
-- Pattern: drop any existing FK on the column (regardless of name), then
-- add a fresh one targeting public.users(id). Idempotent.

-- application_section_reviews.reviewed_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.application_section_reviews'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.application_section_reviews'::regclass AND attname = 'reviewed_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.application_section_reviews DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.application_section_reviews
  ADD CONSTRAINT application_section_reviews_reviewed_by_fkey
  FOREIGN KEY (reviewed_by) REFERENCES public.users(id);

-- audit_log.actor_id
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.audit_log'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.audit_log'::regclass AND attname = 'actor_id' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.audit_log DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_actor_id_fkey
  FOREIGN KEY (actor_id) REFERENCES public.users(id);

-- client_account_managers.admin_id
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.client_account_managers'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.client_account_managers'::regclass AND attname = 'admin_id' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.client_account_managers DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.client_account_managers
  ADD CONSTRAINT client_account_managers_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES public.users(id);

-- client_account_managers.assigned_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.client_account_managers'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.client_account_managers'::regclass AND attname = 'assigned_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.client_account_managers DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.client_account_managers
  ADD CONSTRAINT client_account_managers_assigned_by_fkey
  FOREIGN KEY (assigned_by) REFERENCES public.users(id);

-- client_processes.started_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.client_processes'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.client_processes'::regclass AND attname = 'started_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.client_processes DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.client_processes
  ADD CONSTRAINT client_processes_started_by_fkey
  FOREIGN KEY (started_by) REFERENCES public.users(id);

-- client_users.invited_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.client_users'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.client_users'::regclass AND attname = 'invited_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.client_users DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.client_users
  ADD CONSTRAINT client_users_invited_by_fkey
  FOREIGN KEY (invited_by) REFERENCES public.users(id);

-- clients.deleted_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.clients'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.clients'::regclass AND attname = 'deleted_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.clients DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.clients
  ADD CONSTRAINT clients_deleted_by_fkey
  FOREIGN KEY (deleted_by) REFERENCES public.users(id);

-- document_links.linked_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.document_links'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.document_links'::regclass AND attname = 'linked_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.document_links DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.document_links
  ADD CONSTRAINT document_links_linked_by_fkey
  FOREIGN KEY (linked_by) REFERENCES public.users(id);

-- document_uploads.uploaded_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.document_uploads'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.document_uploads'::regclass AND attname = 'uploaded_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.document_uploads DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.document_uploads
  ADD CONSTRAINT document_uploads_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES public.users(id);

-- documents.uploaded_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.documents'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.documents'::regclass AND attname = 'uploaded_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.documents DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.documents
  ADD CONSTRAINT documents_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES public.users(id);

-- email_log.sent_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.email_log'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.email_log'::regclass AND attname = 'sent_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.email_log DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.email_log
  ADD CONSTRAINT email_log_sent_by_fkey
  FOREIGN KEY (sent_by) REFERENCES public.users(id);

-- knowledge_base.created_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.knowledge_base'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.knowledge_base'::regclass AND attname = 'created_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.knowledge_base DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.knowledge_base
  ADD CONSTRAINT knowledge_base_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id);

-- kyc_records.filled_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.kyc_records'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.kyc_records'::regclass AND attname = 'filled_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.kyc_records DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.kyc_records
  ADD CONSTRAINT kyc_records_filled_by_fkey
  FOREIGN KEY (filled_by) REFERENCES public.users(id);

-- kyc_records.invite_sent_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.kyc_records'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.kyc_records'::regclass AND attname = 'invite_sent_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.kyc_records DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.kyc_records
  ADD CONSTRAINT kyc_records_invite_sent_by_fkey
  FOREIGN KEY (invite_sent_by) REFERENCES public.users(id);

-- kyc_records.risk_rated_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.kyc_records'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.kyc_records'::regclass AND attname = 'risk_rated_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.kyc_records DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.kyc_records
  ADD CONSTRAINT kyc_records_risk_rated_by_fkey
  FOREIGN KEY (risk_rated_by) REFERENCES public.users(id);

-- kyc_records.senior_management_approved_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.kyc_records'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.kyc_records'::regclass AND attname = 'senior_management_approved_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.kyc_records DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.kyc_records
  ADD CONSTRAINT kyc_records_senior_management_approved_by_fkey
  FOREIGN KEY (senior_management_approved_by) REFERENCES public.users(id);

-- reference_forms.created_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.reference_forms'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.reference_forms'::regclass AND attname = 'created_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.reference_forms DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.reference_forms
  ADD CONSTRAINT reference_forms_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.users(id);

-- review_request_reviewers.admin_id (the reported bug)
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.review_request_reviewers'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.review_request_reviewers'::regclass AND attname = 'admin_id' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.review_request_reviewers DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.review_request_reviewers
  ADD CONSTRAINT review_request_reviewers_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES public.users(id);

-- review_requests.closed_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.review_requests'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.review_requests'::regclass AND attname = 'closed_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.review_requests DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.review_requests
  ADD CONSTRAINT review_requests_closed_by_fkey
  FOREIGN KEY (closed_by) REFERENCES public.users(id);

-- review_requests.requester_id
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.review_requests'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.review_requests'::regclass AND attname = 'requester_id' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.review_requests DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.review_requests
  ADD CONSTRAINT review_requests_requester_id_fkey
  FOREIGN KEY (requester_id) REFERENCES public.users(id);

-- service_actions.assigned_to
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.service_actions'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.service_actions'::regclass AND attname = 'assigned_to' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.service_actions DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.service_actions
  ADD CONSTRAINT service_actions_assigned_to_fkey
  FOREIGN KEY (assigned_to) REFERENCES public.users(id);

-- service_actions.completed_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.service_actions'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.service_actions'::regclass AND attname = 'completed_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.service_actions DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.service_actions
  ADD CONSTRAINT service_actions_completed_by_fkey
  FOREIGN KEY (completed_by) REFERENCES public.users(id);

-- service_substance.admin_assessed_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.service_substance'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.service_substance'::regclass AND attname = 'admin_assessed_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.service_substance DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.service_substance
  ADD CONSTRAINT service_substance_admin_assessed_by_fkey
  FOREIGN KEY (admin_assessed_by) REFERENCES public.users(id);

-- submitted_forms.uploaded_by
DO $$
DECLARE cons_record record;
BEGIN
  FOR cons_record IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.submitted_forms'::regclass AND contype = 'f'
      AND EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.submitted_forms'::regclass AND attname = 'uploaded_by' AND attnum = ANY(conkey))
  LOOP
    EXECUTE format('ALTER TABLE public.submitted_forms DROP CONSTRAINT %I', cons_record.conname);
  END LOOP;
END$$;
ALTER TABLE public.submitted_forms
  ADD CONSTRAINT submitted_forms_uploaded_by_fkey
  FOREIGN KEY (uploaded_by) REFERENCES public.users(id);
