-- B-119 — Promote `AdminServiceActionsSection` to a top-level service
-- section and add a fourth subsection: Company Registration.
--
-- Two additive changes:
--
-- 1. Three new columns on `service_actions` so the Company Registration
--    subsection has somewhere to persist its body fields. All nullable;
--    only the `company_registration` action_key uses them today, but the
--    columns are generic enough to absorb future action types without a
--    second migration.
--
-- 2. Template bindings: `company_registration` joins `substance_review`,
--    `bank_account_opening`, and `fsc_checklist` on whichever templates
--    already have action bindings (GBC + AC by default — same pattern
--    as the original B-072 seed). Existing seeds use ILIKE on template
--    name; this migration mirrors that so it stays in sync even when a
--    new GBC-shaped template is added later.
--
-- `action_key` is plain `text NOT NULL` with no CHECK constraint — see
-- `20260506172151_service_actions_tables.sql` — so adding a new value
-- needs no enum/constraint change.

-- Step 1 — additive columns on service_actions.
ALTER TABLE public.service_actions
  ADD COLUMN IF NOT EXISTS registration_date   date,
  ADD COLUMN IF NOT EXISTS registration_number text,
  ADD COLUMN IF NOT EXISTS registry_country    text;

-- Step 2 — bind `company_registration` to every template that already
-- has any binding (mirrors the B-072 seed pattern). sort_order=4 puts it
-- after Bank Account Opening, before Generate FSC Checklist as Vanessa
-- requested in the brief.
INSERT INTO public.service_template_actions
  (service_template_id, action_key, action_label, sort_order)
SELECT DISTINCT
       sta.service_template_id,
       'company_registration',
       'Company Registration',
       4
FROM public.service_template_actions sta
WHERE NOT EXISTS (
  SELECT 1 FROM public.service_template_actions sta2
  WHERE sta2.service_template_id = sta.service_template_id
    AND sta2.action_key = 'company_registration'
);

-- Make sure existing FSC Checklist rows move out of sort_order=4 so the
-- new Company Registration row reads in the right slot. Idempotent —
-- only touches rows where the FSC row currently sits at or before 4.
UPDATE public.service_template_actions
SET sort_order = 5
WHERE action_key = 'fsc_checklist'
  AND sort_order <= 4;

COMMENT ON COLUMN public.service_actions.registration_date IS
  'B-119 — Company Registration subsection: date the entity was registered.';
COMMENT ON COLUMN public.service_actions.registration_number IS
  'B-119 — Company Registration subsection: registry-issued number.';
COMMENT ON COLUMN public.service_actions.registry_country IS
  'B-119 — Company Registration subsection: ISO-3 country code (CountrySelect).';
