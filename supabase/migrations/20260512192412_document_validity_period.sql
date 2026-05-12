-- B-097 — Document expiry tracking
--
-- Adds valid_for_months (nullable int) to document_types so the UI can
-- compute "good until" as uploaded_at + N months. Manual overrides land
-- in the existing documents.expiry_date column.

ALTER TABLE public.document_types
  ADD COLUMN IF NOT EXISTS valid_for_months INT;

COMMENT ON COLUMN public.document_types.valid_for_months IS
  'How many months after upload a document remains valid. NULL = no fixed period (either never expires, or expiry comes from documents.expiry_date e.g. passport OCR).';

-- Backfill standard durations. Match by canonical name (case-insensitive).
-- Admin can adjust via the Document Types page after this lands.

UPDATE public.document_types SET valid_for_months = 3
WHERE LOWER(name) LIKE '%proof of address%'
   OR LOWER(name) LIKE '%proof of residential address%'
   OR LOWER(name) LIKE '%utility bill%'
   OR LOWER(name) LIKE '%bank reference%'
   OR LOWER(name) LIKE '%reference letter%';

UPDATE public.document_types SET valid_for_months = 12
WHERE LOWER(name) LIKE '%source of funds%'
   OR LOWER(name) LIKE '%source of wealth%'
   OR LOWER(name) LIKE '%declaration%';

-- Passports, IDs, certificates, constitutions, CVs left as NULL.
-- Passports/IDs: OCR populates documents.expiry_date directly.
-- Certificates/Constitutions/CVs: never expire by default.
