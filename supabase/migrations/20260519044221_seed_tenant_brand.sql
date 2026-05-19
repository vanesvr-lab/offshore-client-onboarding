-- B-129 — Populate tenants.settings with the brand fields for the
-- existing tenant row. Idempotent: uses `||` merge so it preserves any
-- other settings keys that may have been added separately.
--
-- Seed values use "XYZ Ltd" as the neutral placeholder display name.
-- For a real GWMS pitch demo, Vanessa updates display_name +
-- portal_name + footer_text via SQL editor before the call.

UPDATE public.tenants
SET settings = settings || jsonb_build_object(
  'display_name',   'XYZ Ltd',
  'portal_name',    'XYZ Ltd Client Portal',
  'country',        'Mauritius',
  'support_email',  'support@elarix.io',
  'logo_url',       null,
  'footer_text',    '{portal_name} | {country}',
  'primary_color',  '#1e3a8a'
)
WHERE slug = 'gwms';
