-- B-011 Feature 4: Update geographical_area service field to multi_select_country
-- Apply to GBC (11111111-1111-1111-1111-111111111111) and AC (22222222-2222-2222-2222-222222222222) templates
--
-- This changes the field:
--   key: "geographical_area"
--   label: "Countries of operations (select applicable countries)"
--   type: "multi_select_country"
--   required: true
--   tooltip: "Select all countries where the company will operate or source revenue."
--
-- Run via: POST /api/admin/migrations/update-geographical-field
-- or apply directly to Supabase via the SQL editor.

UPDATE service_templates
SET service_fields = (
  SELECT jsonb_agg(
    CASE
      WHEN (field ->> 'key') = 'geographical_area' THEN
        (field - 'label' - 'type' - 'tooltip' - 'required')
          || jsonb_build_object(
              'label',    'Countries of operations (select applicable countries)',
              'type',     'multi_select_country',
              'required', true,
              'tooltip',  'Select all countries where the company will operate or source revenue.'
             )
      ELSE field
    END
    ORDER BY ordinality
  )
  FROM jsonb_array_elements(service_fields) WITH ORDINALITY AS t(field, ordinality)
)
WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
