-- B-072 Batch 2 — FSC §3.2/§3.3/§3.4 substance criteria per service.
--
-- Service-scoped (NOT application-scoped) — substance applies to GBC and
-- AC services in the modern data model. UNIQUE on service_id so each
-- service has at most one substance record (upsert semantics from the API).

CREATE TABLE IF NOT EXISTS public.service_substance (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                         uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                                      REFERENCES public.tenants(id),
  service_id                        uuid NOT NULL UNIQUE REFERENCES public.services(id) ON DELETE CASCADE,

  -- §3.2 mandatory criteria (booleans)
  has_two_mu_resident_directors     boolean,
  principal_bank_account_in_mu      boolean,
  accounting_records_in_mu          boolean,
  audited_in_mu                     boolean,
  board_meetings_with_mu_quorum     boolean,
  cis_administered_from_mu          boolean,

  -- §3.3 at-least-one criteria + evidence
  has_office_premises_in_mu         boolean,
  office_address                    text,
  has_full_time_mu_employee         boolean,
  employee_count                    int,
  arbitration_clause_in_mu          boolean,
  arbitration_clause_text           text,
  holds_mu_assets_above_100k_usd    boolean,
  mu_assets_value_usd               numeric(14,2),
  mu_assets_description             text,
  shares_listed_on_mu_exchange      boolean,
  exchange_listing_reference        text,
  has_reasonable_mu_expenditure     boolean,
  yearly_mu_expenditure_usd         numeric(14,2),
  expenditure_justification         text,

  -- §3.4 fallback
  related_corp_satisfies_3_3        boolean,
  related_corp_name                 text,

  -- Admin assessment
  admin_assessment                  text CHECK (admin_assessment IN ('pass','review','fail')),
  admin_assessment_notes            text,
  admin_assessed_by                 uuid REFERENCES public.profiles(id),
  admin_assessed_at                 timestamptz,

  -- Output (FK omitted for now; generated_documents table existence not confirmed)
  generated_pdf_id                  uuid,

  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ss_svc_idx     ON public.service_substance(service_id);
CREATE INDEX IF NOT EXISTS ss_tenant_idx  ON public.service_substance(tenant_id);

ALTER TABLE public.service_substance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'service_substance' AND policyname = 'ss_admin_all'
  ) THEN
    CREATE POLICY "ss_admin_all" ON public.service_substance FOR ALL USING (public.is_admin());
  END IF;
END$$;
-- No client policy → admin-only by design (per Vanessa's brainstorm)
