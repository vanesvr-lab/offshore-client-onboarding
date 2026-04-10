-- Migration 002: Fix service_fields labels for GBC and AC templates
-- Run once against production DB.
-- GBC template ID: 11111111-1111-1111-1111-111111111111
-- AC  template ID: 22222222-2222-2222-2222-222222222222

-- Fix "requires_mauritian_bank" label and convert "preferred_bank" to select
-- for both GBC and AC templates.

UPDATE service_templates
SET service_fields = (
  SELECT jsonb_agg(
    CASE
      WHEN field->>'key' = 'requires_mauritian_bank'
        THEN field || '{"label": "Require a Mauritius Bank Account?"}'::jsonb
      WHEN field->>'key' = 'preferred_bank'
        THEN field
          || '{"label": "Preferred bank name (optional)"}'::jsonb
          || '{"type": "select"}'::jsonb
          || '{"options": ["Mauritius Commercial Bank (MCB)", "SBM Bank (Mauritius) Ltd", "AfrAsia Bank Limited", "Bank One Limited", "ABC Banking Corporation Ltd", "HSBC Bank (Mauritius) Limited", "Absa Bank (Mauritius) Limited", "Standard Bank (Mauritius) Limited", "Other"]}'::jsonb
      ELSE field
    END
  )
  FROM jsonb_array_elements(service_fields) AS field
)
WHERE id IN (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);
