-- B-070 Batch 1 — Field provenance tracking.
--
-- Records where each KYC field value came from (AI extraction from a doc,
-- typed by the client, or admin override). Lets the admin defend
-- "passport_number = X12345 because it came from this passport scan, not
-- because the client typed it" — critical for FSC substance-assessment
-- defensibility.
--
-- History-preserving: a field can be re-extracted from a different doc
-- later. Older rows for the same (client_profile_id, field_key) get
-- `superseded_at` set when a newer extraction lands.

CREATE TABLE IF NOT EXISTS public.field_extractions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                        REFERENCES public.tenants(id),

  -- What was filled in
  client_profile_id   uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  field_key           text NOT NULL,
  extracted_value     text,

  -- Where it came from. The brief's `document_uploads` is named `documents`
  -- in this codebase; FK targets that table. ON DELETE SET NULL preserves
  -- the audit row even if the source doc is later removed.
  source_document_id  uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  source              text NOT NULL DEFAULT 'ai_extraction'
                        CHECK (source IN ('ai_extraction', 'manual', 'admin_override')),

  -- Audit
  ai_confidence       numeric(4,3),
  extracted_at        timestamptz NOT NULL DEFAULT now(),
  superseded_at       timestamptz
);

CREATE INDEX IF NOT EXISTS fe_profile_field_idx
  ON public.field_extractions(client_profile_id, field_key, extracted_at DESC);
CREATE INDEX IF NOT EXISTS fe_source_doc_idx
  ON public.field_extractions(source_document_id);
CREATE INDEX IF NOT EXISTS fe_tenant_idx
  ON public.field_extractions(tenant_id);

ALTER TABLE public.field_extractions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'field_extractions' AND policyname = 'fe_admin_read'
  ) THEN
    CREATE POLICY "fe_admin_read"  ON public.field_extractions FOR SELECT USING (public.is_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'field_extractions' AND policyname = 'fe_admin_write'
  ) THEN
    CREATE POLICY "fe_admin_write" ON public.field_extractions FOR ALL    USING (public.is_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'field_extractions' AND policyname = 'fe_client_read'
  ) THEN
    -- Clients can see their own extractions (read-only). The brief's
    -- `client_users` join doesn't apply here — in the v2 schema the link
    -- is `client_profiles.user_id`. RLS isn't actively enforced in this
    -- codebase (all server queries use the service role) but the policy
    -- is defined correctly for when it is.
    CREATE POLICY "fe_client_read" ON public.field_extractions FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM public.client_profiles cp
          WHERE cp.id = field_extractions.client_profile_id
            AND cp.user_id = auth.uid()
        )
      );
  END IF;
END$$;
