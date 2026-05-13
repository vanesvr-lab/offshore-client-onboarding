-- B-106 — extend waived_document_requirements to cover service-scope
-- documents (scope='application') in addition to KYC (scope='person').
--
-- Changes:
--   1. Allow client_profile_id to be NULL (service waivers have no profile).
--   2. Add explicit scope column with a CHECK that ties scope ↔ profile_id
--      nullness. Catches API misuse (person waiver without profile, or
--      service waiver with one) at write time.
--   3. Backfill scope = 'person' for all existing rows (B-100 only ever
--      created person-scope waivers).
--   4. Replace the existing UNIQUE (client_profile_id, service_id,
--      document_type_id) with two PARTIAL unique indexes — one per scope —
--      because Postgres treats NULLs as distinct in UNIQUE, so without
--      partial indexes we could store the same service waiver twice with
--      NULL profile.

BEGIN;

-- 1. Drop NOT NULL on client_profile_id.
ALTER TABLE public.waived_document_requirements
  ALTER COLUMN client_profile_id DROP NOT NULL;

-- 2. Add the scope column (defaults to 'person' for one-step backfill).
ALTER TABLE public.waived_document_requirements
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'person'
  CHECK (scope IN ('person', 'application'));

-- 3. Drop the default so future inserts must specify scope explicitly.
ALTER TABLE public.waived_document_requirements
  ALTER COLUMN scope DROP DEFAULT;

-- 4. Row-level CHECK linking scope to profile_id nullness.
ALTER TABLE public.waived_document_requirements
  DROP CONSTRAINT IF EXISTS waived_doc_reqs_scope_profile_consistent;
ALTER TABLE public.waived_document_requirements
  ADD CONSTRAINT waived_doc_reqs_scope_profile_consistent
  CHECK (
    (scope = 'person'      AND client_profile_id IS NOT NULL) OR
    (scope = 'application' AND client_profile_id IS NULL)
  );

-- 5. Replace the old composite UNIQUE constraint with partial indexes
--    so the (NULL profile, service, doc_type) case is also de-duplicated.
ALTER TABLE public.waived_document_requirements
  DROP CONSTRAINT IF EXISTS waived_document_requirements_client_profile_id_service_id_doc_key;
ALTER TABLE public.waived_document_requirements
  DROP CONSTRAINT IF EXISTS waived_document_requirements_client_profile_id_service_id_document_type_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS waived_doc_reqs_person_unique
  ON public.waived_document_requirements
  (client_profile_id, service_id, document_type_id)
  WHERE scope = 'person';

CREATE UNIQUE INDEX IF NOT EXISTS waived_doc_reqs_service_unique
  ON public.waived_document_requirements
  (service_id, document_type_id)
  WHERE scope = 'application';

COMMIT;

NOTIFY pgrst, 'reload schema';
