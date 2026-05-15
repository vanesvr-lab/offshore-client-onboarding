-- B-117 — Make the source document the canonical expiry holder.
--
-- Two idempotent operations:
--
-- 1. Tag the "expiry_date" entry in Certified Passport Copy's
--    `ai_extraction_fields` with `is_document_expiry: true`. This is the
--    config flag `recordAiExtractionProvenance` reads to decide whether
--    to write OCR-extracted values back to `documents.expiry_date` on
--    future uploads. Other identity-style doc types (Driver's Licence,
--    Residence Permit, etc.) don't yet ship an expiry extraction in
--    `ai_extraction_fields`; when they do, add the same flag to the
--    relevant entry in `seed-ai-defaults`.
--
-- 2. Backfill `documents.expiry_date` for existing uploads where OCR
--    already populated the corresponding `field_extractions` row but no
--    one wrote it back. Only fills NULLs — never overwrites a manually
--    set expiry. Filters extracted values through a strict YYYY-MM-DD
--    regex so we never feed garbage into a `date` cast.

-- Step 1 — flag is_document_expiry on Passport's expiry_date entry.
UPDATE document_types
SET ai_extraction_fields = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'prefill_field'
       AND elem->>'prefill_field' = 'passport_expiry'
       AND (elem->>'is_document_expiry') IS DISTINCT FROM 'true'
        THEN elem || '{"is_document_expiry": true}'::jsonb
      ELSE elem
    END
  )
  FROM jsonb_array_elements(coalesce(ai_extraction_fields, '[]'::jsonb)) AS elem
)
WHERE ai_extraction_fields IS NOT NULL
  AND jsonb_array_length(ai_extraction_fields) > 0
  AND lower(name) = 'certified passport copy';

-- Step 2 — backfill documents.expiry_date from prior OCR extractions.
WITH expiry_keys AS (
  SELECT dt.id AS document_type_id,
         elem->>'prefill_field' AS field_key
  FROM document_types dt,
       jsonb_array_elements(coalesce(dt.ai_extraction_fields, '[]'::jsonb)) AS elem
  WHERE (elem->>'is_document_expiry') = 'true'
    AND elem->>'prefill_field' IS NOT NULL
),
candidates AS (
  SELECT DISTINCT ON (d.id)
         d.id AS document_id,
         fe.extracted_value
  FROM documents d
  JOIN field_extractions fe ON fe.source_document_id = d.id
  JOIN expiry_keys ek ON ek.document_type_id = d.document_type_id
                     AND ek.field_key = fe.field_key
  WHERE fe.source = 'ai_extraction'
    AND fe.extracted_value IS NOT NULL
    AND d.expiry_date IS NULL
    -- Strict ISO date guard to avoid casting garbage values.
    AND fe.extracted_value ~ '^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])'
  ORDER BY d.id, fe.extracted_at DESC
)
UPDATE documents d
SET expiry_date = (left(c.extracted_value, 10))::date
FROM candidates c
WHERE d.id = c.document_id
  AND d.expiry_date IS NULL;
