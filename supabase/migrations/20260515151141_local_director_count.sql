-- B-121 — local director compliance count.
--
-- Two columns + one seed update:
--   • service_templates.min_local_directors: per-template threshold for
--     "minimum local resident directors required". GBC = 1 (FSC rule);
--     everything else stays at 0. Seeded via ILIKE on the template name
--     to match the existing seed style (service_template_actions, etc.).
--   • client_profile_kyc.is_local_resident_director: boolean flag on the
--     per-individual KYC row. The investigation in CHANGES.md confirmed
--     no existing "country of residence" column for individuals (only
--     nationality + passport_country) and no existing flag, so per the
--     brief's third branch ("If neither: add the column") we add it
--     here. Admins manage the value via SQL/Supabase editor for the
--     POC; a UI toggle is tech-debt for the next iteration.

ALTER TABLE public.service_templates
  ADD COLUMN IF NOT EXISTS min_local_directors integer NOT NULL DEFAULT 0;

ALTER TABLE public.client_profile_kyc
  ADD COLUMN IF NOT EXISTS is_local_resident_director boolean NOT NULL DEFAULT false;

-- Seed: GBC requires 1 local director per FSC rules. Match by name
-- pattern to stay in sync with existing seeded templates ("Global
-- Business Corporation (GBC)" / "Global Business Company / GBC" / etc.).
UPDATE public.service_templates
SET min_local_directors = 1
WHERE name ILIKE '%GBC%' OR name ILIKE '%Global Business%';

COMMENT ON COLUMN public.service_templates.min_local_directors IS
  'B-121 — minimum count of local (Mauritius-resident) directors required by the regulator for services on this template. 0 = no rule. Currently no admin UI; managed via SQL.';
COMMENT ON COLUMN public.client_profile_kyc.is_local_resident_director IS
  'B-121 — flag set when this individual is a Mauritius-resident director. Combined with service_templates.min_local_directors to drive the Pending row + People & KYC count chip on the service detail page.';
