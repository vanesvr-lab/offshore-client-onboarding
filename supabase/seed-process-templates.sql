-- Seed 2 process templates with requirements
-- Requires document_types to be seeded first.
-- Safe to re-run (ON CONFLICT DO NOTHING on templates; requirements use DELETE+INSERT per template).

-- ── Process templates ────────────────────────────────────────────────────────

insert into public.process_templates (id, name, description, client_type, is_active, sort_order)
values
  ('00000000-0000-0000-0000-000000000001',
   'Open Bank Account (Corporate)',
   'Document collection package for opening a corporate bank account in Mauritius',
   'organisation', true, 10),
  ('00000000-0000-0000-0000-000000000002',
   'Open Bank Account (Individual)',
   'Document collection package for opening a personal bank account in Mauritius',
   'individual', true, 20)
on conflict (name) do nothing;

-- ── Corporate Bank Account requirements (16) ────────────────────────────────

insert into public.process_requirements
  (process_template_id, document_type_id, is_required, per_person, applies_to_role, sort_order)
select
  '00000000-0000-0000-0000-000000000001',
  dt.id,
  true,
  false,
  null,
  row_number() over (order by dt.sort_order) * 10
from public.document_types dt
where dt.name in (
  'Certificate of Incorporation',
  'Memorandum & Articles of Association',
  'Business Registration Certificate',
  'Certificate of Good Standing',
  'Share Register',
  'Register of Directors',
  'Registered Office Certificate',
  'Company Profile',
  'Incumbency Certificate',
  'Bank Statement (6 months)',
  'Source of Funds Declaration',
  'Board Resolution',
  'Anti-Money Laundering Policy',
  'Organisation Chart',
  'Group Structure Chart',
  'CDD Questionnaire'
)
and not exists (
  select 1 from public.process_requirements pr
  where pr.process_template_id = '00000000-0000-0000-0000-000000000001'
    and pr.document_type_id = dt.id
);

-- Director/UBO identity docs (per_person = true)
insert into public.process_requirements
  (process_template_id, document_type_id, is_required, per_person, applies_to_role, sort_order)
select
  '00000000-0000-0000-0000-000000000001',
  dt.id,
  true,
  true,
  array['director', 'ubo'],
  (row_number() over (order by dt.sort_order) * 10) + 160
from public.document_types dt
where dt.name in (
  'Passport',
  'Proof of Address (Utility Bill)',
  'PEP Declaration'
)
and not exists (
  select 1 from public.process_requirements pr
  where pr.process_template_id = '00000000-0000-0000-0000-000000000001'
    and pr.document_type_id = dt.id
);

-- ── Individual Bank Account requirements (9) ────────────────────────────────

insert into public.process_requirements
  (process_template_id, document_type_id, is_required, per_person, applies_to_role, sort_order)
select
  '00000000-0000-0000-0000-000000000002',
  dt.id,
  true,
  false,
  null,
  row_number() over (order by dt.sort_order) * 10
from public.document_types dt
where dt.name in (
  'Passport',
  'National ID Card',
  'Driver''s Licence',
  'Proof of Address (Utility Bill)',
  'Proof of Address (Bank Statement)',
  'Bank Statement (3 months)',
  'Source of Funds Declaration',
  'Source of Wealth Declaration',
  'PEP Declaration'
)
and not exists (
  select 1 from public.process_requirements pr
  where pr.process_template_id = '00000000-0000-0000-0000-000000000002'
    and pr.document_type_id = dt.id
);
