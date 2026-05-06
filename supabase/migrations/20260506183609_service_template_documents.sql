-- B-071 Batch 1 — Service-template ↔ document-type binding.
--
-- Bind document types to specific service templates. If a service template
-- has rows here, ONLY these docs apply to its applications. If it has no
-- rows, fall back to the global DD-driven list (preserves current behavior
-- until a template is explicitly configured).
--
-- Service-scoped (FK to service_templates.id). Idempotent guards keep this
-- safe to re-run.

CREATE TABLE IF NOT EXISTS public.service_template_documents (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                            REFERENCES public.tenants(id),
  service_template_id     uuid NOT NULL REFERENCES public.service_templates(id) ON DELETE CASCADE,
  document_type_id        uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  is_required             boolean NOT NULL DEFAULT true,
  applies_to_role         text,    -- nullable: NULL = applies to whole application; else specific role like "director"
  sort_order              int NOT NULL DEFAULT 0,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_template_id, document_type_id, applies_to_role)
);

CREATE INDEX IF NOT EXISTS std_template_idx ON public.service_template_documents(service_template_id);
CREATE INDEX IF NOT EXISTS std_doc_type_idx ON public.service_template_documents(document_type_id);

ALTER TABLE public.service_template_documents ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_template_documents' AND policyname = 'std_admin_all'
  ) THEN
    CREATE POLICY "std_admin_all" ON public.service_template_documents FOR ALL USING (public.is_admin());
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_template_documents' AND policyname = 'std_client_read'
  ) THEN
    -- Read-only for clients (so the wizard can render the right list);
    -- writes are admin-only.
    CREATE POLICY "std_client_read" ON public.service_template_documents FOR SELECT USING (true);
  END IF;
END$$;
