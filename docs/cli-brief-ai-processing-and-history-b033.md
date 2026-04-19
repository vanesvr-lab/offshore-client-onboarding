# B-033 — AI Processing, Two-Track Status, Prefill & History

**Scope:** Cross-portal. Makes AI processing per-doc-type configurable, introduces a two-track status model (AI + admin), adds an opt-in prefill banner for extracted data, and lays down history tables for `documents` and `client_profile_kyc` so regulatory audit snapshots are preserved.

**Execute all 5 batches autonomously. Do NOT stop between batches. Commit + push + update `CHANGES.md` after each batch. Continue until the whole brief is complete.**

---

## Context

- Today's AI verification = single Claude call on every doc upload, hard-coded flow. Rules are plain-English text per doc type.
- Today's status = one column `verification_status` (`pending | verified | flagged | manual_review`). Admin status exists on `documents` table but isn't universally shown to clients.
- `audit_log` captures events; there is no row-snapshot history table. Regulatory audit of "what did this document look like on 2026-03-14" requires replay.

## Goals (what changes)

1. **Per-doc-type admin config** — toggle AI on/off, define extraction fields, define prefill mappings. Verification rules textarea already exists; keep it.
2. **Two-track status** — every doc upload starts with `admin_status = 'pending_review'`. Client sees AI status (pass/fail/skipped) + admin status (pending/approved/rejected) as two distinct badges.
3. **Prefill banner** — when AI extracts fields that map to KYC form fields, show a one-document banner with apply-all / skip + `keep mine / overwrite all` toggle. Only shows fields with a mapped prefill target. Shows even when doc is flagged. Dismissed per upload.
4. **Re-run AI** — admin button on the doc review page overwrites prior AI result and resets `prefill_dismissed_at`.
5. **History tables** — full-row snapshots on every INSERT/UPDATE/DELETE for `documents` and `client_profile_kyc`. No UI — data only. Audit log continues to function as today (we keep both).

## Scope guard — what is NOT in this batch

- History UI (timeline viewer, collapsible panel). Defer.
- Admin-side prefill to `clients` / `applications`. Defer.
- Per-field Apply/Skip in prefill banner. Only apply-all. Defer granularity.
- Bulk admin approve. Defer.
- History tables for `services`, `clients`, `client_profiles`. Only `documents` + `client_profile_kyc` this batch.
- Email notifications on per-doc admin decisions. Defer.
- `ai_verification_rules` JSONB on `document_types` stays where it is; do not migrate existing data — the new fields (`ai_extraction_fields`, plain-text `verification_rules_text` already present) are the going-forward config.

---

## BATCH 1 — Schema migration

**Why first:** every other batch depends on these columns/tables existing.

### Create: `supabase/migrations/004-ai-processing-and-history.sql`

```sql
-- ============================================================
-- B-033 Migration — AI processing, admin status, history tables
-- ============================================================

-- 1. document_types — new AI processing columns
ALTER TABLE document_types
  ADD COLUMN IF NOT EXISTS ai_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ai_extraction_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_extraction_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN document_types.ai_enabled IS 'When false, uploads skip AI call and land at pending admin review directly.';
COMMENT ON COLUMN document_types.ai_extraction_enabled IS 'When true and ai_enabled is true, AI prompt asks for extracted_fields in response.';
COMMENT ON COLUMN document_types.ai_extraction_fields IS 'Array of {key,label,ai_hint,type,prefill_field} — defines what AI should extract and which KYC column it optionally prefills.';

-- 2. documents — extend verification_status check, add 'not_run'; ensure admin_status default
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.table_constraints
             WHERE table_name = 'documents' AND constraint_name LIKE '%verification_status%check%') THEN
    -- Drop old check constraint by finding its name
    FOR r IN (SELECT conname FROM pg_constraint
              WHERE conrelid = 'public.documents'::regclass
                AND conname LIKE '%verification_status%') LOOP
      EXECUTE 'ALTER TABLE documents DROP CONSTRAINT ' || quote_ident(r.conname);
    END LOOP;
  END IF;
END $$;

ALTER TABLE documents
  ADD CONSTRAINT documents_verification_status_check
  CHECK (verification_status IN ('pending','verified','flagged','manual_review','not_run'));

-- admin_status — ensure the column exists with the correct values + default
ALTER TABLE documents
  ALTER COLUMN admin_status SET DEFAULT 'pending_review';

-- Update existing rows: any doc without an admin_status gets pending_review
UPDATE documents SET admin_status = 'pending_review' WHERE admin_status IS NULL;

-- Now enforce NOT NULL + new check values (drop old check first)
DO $$
DECLARE r record;
BEGIN
  FOR r IN (SELECT conname FROM pg_constraint
            WHERE conrelid = 'public.documents'::regclass
              AND conname LIKE '%admin_status%') LOOP
    EXECUTE 'ALTER TABLE documents DROP CONSTRAINT ' || quote_ident(r.conname);
  END LOOP;
END $$;

ALTER TABLE documents
  ALTER COLUMN admin_status SET NOT NULL,
  ADD CONSTRAINT documents_admin_status_check
    CHECK (admin_status IN ('pending_review','approved','rejected'));

-- prefill dismissal column
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS prefill_dismissed_at timestamptz;

-- 3. documents_history — full row snapshots
CREATE TABLE IF NOT EXISTS documents_history (
  history_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id         uuid NOT NULL,
  operation           text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  changed_at          timestamptz NOT NULL DEFAULT now(),
  changed_by          uuid,                  -- auth.uid() at time of change; nullable for system
  changed_by_role     text,                  -- 'client' | 'admin' | 'system'
  -- Snapshot of the documents row. Mirror every documents column here.
  tenant_id           uuid,
  service_id          uuid,
  document_type_id    uuid,
  client_profile_id   uuid,
  kyc_record_id       uuid,                  -- legacy, keep for history fidelity
  file_name           text,
  file_path           text,
  verification_status text,
  verification_result jsonb,
  admin_status        text,
  admin_status_note   text,
  admin_status_by     uuid,
  admin_status_at     timestamptz,
  uploaded_at         timestamptz,
  uploaded_by         uuid,
  is_active           boolean,
  prefill_dismissed_at timestamptz,
  verified_at         timestamptz,
  created_at          timestamptz
);

CREATE INDEX IF NOT EXISTS idx_documents_history_doc
  ON documents_history(document_id, changed_at DESC);

-- 4. client_profile_kyc_history — full row snapshots
CREATE TABLE IF NOT EXISTS client_profile_kyc_history (
  history_id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_profile_kyc_id uuid NOT NULL,
  operation           text NOT NULL CHECK (operation IN ('INSERT','UPDATE','DELETE')),
  changed_at          timestamptz NOT NULL DEFAULT now(),
  changed_by          uuid,
  changed_by_role     text,
  -- Snapshot: mirror every client_profile_kyc column (see migration 003). Use SELECT * INTO pattern in trigger.
  -- Approach: store the whole row as JSONB to avoid schema drift for this table (it has 40+ columns).
  row_data            jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cpk_history_kyc
  ON client_profile_kyc_history(client_profile_kyc_id, changed_at DESC);

-- Rationale: documents_history uses mirrored columns (small, stable); client_profile_kyc_history
-- uses JSONB (large, evolving) — trade-off is intentional and documented in CHANGES.md.

-- 5. Helper: infer actor role from session user
CREATE OR REPLACE FUNCTION public.get_history_actor_role(uid uuid) RETURNS text AS $$
DECLARE
  is_admin boolean;
BEGIN
  IF uid IS NULL THEN RETURN 'system'; END IF;
  SELECT EXISTS(SELECT 1 FROM public.admin_users WHERE user_id = uid) INTO is_admin;
  IF is_admin THEN RETURN 'admin'; ELSE RETURN 'client'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Trigger: documents_history
CREATE OR REPLACE FUNCTION public.log_documents_history() RETURNS trigger AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  INSERT INTO documents_history (
    document_id, operation, changed_by, changed_by_role,
    tenant_id, service_id, document_type_id, client_profile_id, kyc_record_id,
    file_name, file_path, verification_status, verification_result,
    admin_status, admin_status_note, admin_status_by, admin_status_at,
    uploaded_at, uploaded_by, is_active, prefill_dismissed_at, verified_at, created_at
  ) VALUES (
    COALESCE(NEW.id, OLD.id), TG_OP, uid, public.get_history_actor_role(uid),
    COALESCE(NEW.tenant_id, OLD.tenant_id),
    COALESCE(NEW.service_id, OLD.service_id),
    COALESCE(NEW.document_type_id, OLD.document_type_id),
    COALESCE(NEW.client_profile_id, OLD.client_profile_id),
    COALESCE(NEW.kyc_record_id, OLD.kyc_record_id),
    COALESCE(NEW.file_name, OLD.file_name),
    COALESCE(NEW.file_path, OLD.file_path),
    COALESCE(NEW.verification_status, OLD.verification_status),
    COALESCE(NEW.verification_result, OLD.verification_result),
    COALESCE(NEW.admin_status, OLD.admin_status),
    COALESCE(NEW.admin_status_note, OLD.admin_status_note),
    COALESCE(NEW.admin_status_by, OLD.admin_status_by),
    COALESCE(NEW.admin_status_at, OLD.admin_status_at),
    COALESCE(NEW.uploaded_at, OLD.uploaded_at),
    COALESCE(NEW.uploaded_by, OLD.uploaded_by),
    COALESCE(NEW.is_active, OLD.is_active),
    COALESCE(NEW.prefill_dismissed_at, OLD.prefill_dismissed_at),
    COALESCE(NEW.verified_at, OLD.verified_at),
    COALESCE(NEW.created_at, OLD.created_at)
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS documents_history_trg ON documents;
CREATE TRIGGER documents_history_trg
AFTER INSERT OR UPDATE OR DELETE ON documents
FOR EACH ROW EXECUTE PROCEDURE public.log_documents_history();

-- 7. Trigger: client_profile_kyc_history (JSONB row snapshot)
CREATE OR REPLACE FUNCTION public.log_client_profile_kyc_history() RETURNS trigger AS $$
DECLARE
  uid uuid := auth.uid();
  snapshot jsonb;
BEGIN
  IF TG_OP = 'DELETE' THEN
    snapshot := to_jsonb(OLD);
  ELSE
    snapshot := to_jsonb(NEW);
  END IF;

  INSERT INTO client_profile_kyc_history (
    client_profile_kyc_id, operation, changed_by, changed_by_role, row_data
  ) VALUES (
    COALESCE(NEW.id, OLD.id), TG_OP, uid, public.get_history_actor_role(uid), snapshot
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS client_profile_kyc_history_trg ON client_profile_kyc;
CREATE TRIGGER client_profile_kyc_history_trg
AFTER INSERT OR UPDATE OR DELETE ON client_profile_kyc
FOR EACH ROW EXECUTE PROCEDURE public.log_client_profile_kyc_history();

-- 8. RLS on history tables — admin-only read, no one writes directly (triggers only)
ALTER TABLE documents_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profile_kyc_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins_read_documents_history" ON documents_history
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));
CREATE POLICY "admins_read_cpk_history" ON client_profile_kyc_history
  FOR SELECT USING (EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()));

-- 9. Schema-drift guard (will be used in CI later; define now so it exists)
CREATE OR REPLACE FUNCTION public.assert_documents_history_sync() RETURNS void AS $$
DECLARE missing_cols text[];
BEGIN
  SELECT array_agg(column_name) INTO missing_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'documents'
    AND column_name NOT IN ('id')  -- documents.id maps to documents_history.document_id
    AND column_name NOT IN (
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'documents_history'
    );
  IF array_length(missing_cols, 1) > 0 THEN
    RAISE EXCEPTION 'documents_history missing columns: %', missing_cols;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Run the guard immediately so migration fails loudly if columns are missed
SELECT public.assert_documents_history_sync();
```

### Apply

- Commit the migration file.
- Apply via existing pattern (either Supabase dashboard SQL editor or `POST /api/admin/migrations/...`).
- Optional: create `src/app/api/admin/migrations/apply-b033-schema/route.ts` that reads the SQL and executes via service role if that's the established flow — check how previous migrations (e.g. `update-turnover-fields`) were applied and match that pattern.

### Types — `src/types/index.ts`

```ts
export interface AiExtractionField {
  key: string;
  label: string;
  ai_hint?: string;
  type: 'string' | 'date';
  prefill_field: string | null;  // column on client_profile_kyc, or null
}

export type AiVerificationStatus = 'pending' | 'verified' | 'flagged' | 'manual_review' | 'not_run';
export type AdminReviewStatus = 'pending_review' | 'approved' | 'rejected';

export interface DocumentType {
  // ... existing fields
  ai_enabled: boolean;
  ai_extraction_enabled: boolean;
  ai_extraction_fields: AiExtractionField[];
}
```

Add `KYC_PREFILLABLE_FIELDS` constant in `src/lib/constants/prefillFields.ts`:

```ts
export const KYC_PREFILLABLE_FIELDS = [
  'full_name',
  'date_of_birth',
  'nationality',
  'passport_country',
  'passport_number',
  'passport_expiry',
  'address',
  'occupation',
  'tax_identification_number',
  'jurisdiction_tax_residence',
] as const;

export type KycPrefillableField = typeof KYC_PREFILLABLE_FIELDS[number];
```

### Verify
- `npm run build` clean
- `SELECT column_name FROM information_schema.columns WHERE table_name='documents' AND column_name IN ('prefill_dismissed_at')` returns a row
- `SELECT * FROM documents_history LIMIT 0` — table exists
- Trigger fires: manually update a doc row, then `SELECT count(*) FROM documents_history WHERE document_id = '...'` should be ≥ 2

### Commit
`feat: B-033 batch 1 — AI processing columns, admin status default, history tables`

Update `CHANGES.md` with a Batch 1 entry.

---

## BATCH 2 — Seed defaults + admin Settings → Rules page rework

**Why second:** data config must exist before AI prompt can use it.

### Seed defaults

Create `src/app/api/admin/migrations/seed-ai-defaults/route.ts`:

- POST endpoint (admin only).
- For each doc type name in the table below, set `ai_enabled`, `ai_extraction_enabled`, `ai_extraction_fields`. Do NOT overwrite `verification_rules_text` if one is already set — only insert if null.
- Idempotent — running twice shouldn't duplicate or corrupt data.

Defaults table (verbatim — use exactly these):

| doc type name | ai_enabled | ai_extraction_enabled | ai_extraction_fields (JSON) | verification_rules_text (only if null) |
|---|---|---|---|---|
| Certified Passport Copy | true | true | [{"key":"passport_number","label":"Passport number","ai_hint":"MRZ or printed number","type":"string","prefill_field":"passport_number"},{"key":"expiry_date","label":"Expiry date","ai_hint":"Expiry / date of expiry","type":"date","prefill_field":"passport_expiry"},{"key":"full_name","label":"Full name","ai_hint":"Name as printed in MRZ","type":"string","prefill_field":"full_name"},{"key":"nationality","label":"Nationality","ai_hint":"Country code or nationality","type":"string","prefill_field":"nationality"},{"key":"date_of_birth","label":"Date of birth","ai_hint":"DOB on passport","type":"date","prefill_field":"date_of_birth"},{"key":"passport_country","label":"Issuing country","ai_hint":"Country of issue","type":"string","prefill_field":"passport_country"}] | "1. Document must not be expired.\n2. The name on the passport must match the applicant's declared name.\n3. The document must be a certified copy (visible stamp/signature from solicitor, notary, or bank official)." |
| Proof of Residential Address | true | true | [{"key":"address_on_document","label":"Address","ai_hint":"Full address shown on document","type":"string","prefill_field":"address"},{"key":"document_date","label":"Document date","ai_hint":"Statement or issue date","type":"date","prefill_field":null},{"key":"account_holder_name","label":"Name on document","ai_hint":"Account holder / addressee","type":"string","prefill_field":null}] | "1. The name on the document must match the applicant's declared name.\n2. The document must be dated within the last 3 months.\n3. The address must include a country." |
| Bank Reference Letter | true | true | [{"key":"bank_name","label":"Bank name","ai_hint":"Issuing bank","type":"string","prefill_field":null},{"key":"letter_date","label":"Letter date","ai_hint":"Date of the reference letter","type":"date","prefill_field":null},{"key":"customer_name","label":"Customer name","ai_hint":"Name referenced in the letter","type":"string","prefill_field":null}] | "1. The letter must be dated within the last 3 months.\n2. The customer referenced must be the applicant.\n3. The letter should confirm account in good standing." |
| Curriculum Vitae / Resume | true | false | [] | "1. The name on the CV should match the applicant.\n2. The stated occupation should align with the applicant's declared occupation.\n3. No need to extract any fields." |
| Declaration of Source of Funds | true | false | [] | "1. Document must be signed and dated.\n2. The name must match the applicant." |
| Declaration of Source of Wealth | true | false | [] | "1. Document must be signed and dated.\n2. The name must match the applicant." |
| Evidence of Source of Funds | true | false | [] | "1. Document should corroborate the declared source of funds." |
| Evidence of Source of Wealth | true | false | [] | "1. Document should corroborate the declared source of wealth." |
| Professional Reference Letter | true | true | [{"key":"letter_date","label":"Letter date","ai_hint":"Date on letterhead","type":"date","prefill_field":null}] | "1. The letter must be dated within the last 3 months.\n2. The letter must reference the applicant by name." |
| PEP Declaration Form | true | false | [] | "1. Document must be signed and dated.\n2. The declared PEP status must match the applicant's answer on the form." |
| Tax Residency Certificate | true | true | [{"key":"tax_id","label":"Tax ID","ai_hint":"TIN or tax number","type":"string","prefill_field":"tax_identification_number"},{"key":"jurisdiction","label":"Jurisdiction","ai_hint":"Country of tax residency","type":"string","prefill_field":"jurisdiction_tax_residence"},{"key":"issue_date","label":"Issue date","ai_hint":"Date issued","type":"date","prefill_field":null}] | "1. Document must be dated within the last 12 months.\n2. Applicant must be named on the certificate." |
| Certificate of Incorporation | true | true | [{"key":"company_name","label":"Company name","ai_hint":"Legal entity name","type":"string","prefill_field":null},{"key":"registration_number","label":"Registration number","ai_hint":"Company number","type":"string","prefill_field":null},{"key":"incorporation_date","label":"Incorporation date","ai_hint":"Date of incorporation","type":"date","prefill_field":null},{"key":"jurisdiction","label":"Jurisdiction","ai_hint":"Country of incorporation","type":"string","prefill_field":null}] | "1. Document must be a certified copy.\n2. The company name must match the service application." |

Doc types not in the table — default to `ai_enabled=true`, `ai_extraction_enabled=false`, `ai_extraction_fields=[]`. Leave any existing `verification_rules_text` alone.

### Admin Settings → Rules UI rework

`src/app/(admin)/admin/settings/rules/page.tsx` + API `src/app/api/admin/document-types/[id]/rules/route.ts`:

Each doc type card restructured:

```
┌─ {doc type name} ─────────────────────────────────────┐
│  [✓] Enable AI on this document                       │
│      (uncheck to skip AI; docs go straight to         │
│       pending admin review)                           │
│                                                       │
│  [✓] Extract fields from this document                │
│      (AI reads the doc and returns structured data)   │
│                                                       │
│  Fields to extract                                    │
│  ┌─────────────────────────────────────────────────┐  │
│  │ Key         Label       Type  Prefill to        │  │
│  │ passport_no Passport #  str   passport_number ▾ │  │
│  │ expiry      Expiry      date  passport_expiry ▾ │  │
│  │ ...                                             │  │
│  │ [+ Add field]                                   │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  Verification rules                                   │
│  ┌─────────────────────────────────────────────────┐  │
│  │ 1. Document must not be expired                 │  │
│  │ 2. Name must match applicant's declared name    │  │
│  └─────────────────────────────────────────────────┘  │
│                                                       │
│  [Save]                                               │
└───────────────────────────────────────────────────────┘
```

- AI checkbox disables the other controls when unchecked (greyed).
- Extract checkbox shows/hides the Fields table.
- Prefill dropdown options = `KYC_PREFILLABLE_FIELDS` + `-- none --`.
- Type = `string | date` dropdown.
- Add field = new empty row; Delete = trash button per row.
- PATCH payload: `{ ai_enabled, ai_extraction_enabled, ai_extraction_fields, verification_rules_text }`.
- API route validates: `ai_extraction_fields` items must have unique `key`; `prefill_field` must be in `KYC_PREFILLABLE_FIELDS` or null.

### Verify
- Settings page renders all doc types with the new controls
- Toggle AI off, save, reload — persists
- Add/edit/delete an extraction field, save, reload — persists
- Prefill dropdown shows the whitelisted KYC fields

### Commit
`feat: B-033 batch 2 — seed AI defaults + admin rules editor`

Update `CHANGES.md`.

---

## BATCH 3 — verifyDocument.ts + upload routes + re-run endpoint

### `src/lib/ai/verifyDocument.ts`

Restructure the prompt. Still a single Claude call. Input now includes `aiExtractionFields` + `extractionEnabled` flags.

- When `aiEnabled = false`: caller skips this function entirely. Function itself does not need to handle that case (but be defensive: if called with empty rules + no extraction, return a `not_run` shape).
- When `extractionEnabled = true`: prompt includes "Extract the following fields" section with keys/labels/ai_hints/types, and response schema includes `extracted_fields` object.
- When `extractionEnabled = false`: prompt says "do not extract any fields; set extracted_fields to {}".
- `overall_status` is derived from `rule_results` ONLY. Extraction failure does not flag a doc.
- Response interface extended:

```ts
export interface VerificationResult {
  can_read_document: boolean;
  document_type_detected: string;
  extracted_fields: Record<string, string>;  // may be empty
  match_results: MatchResult[];               // legacy, keep empty
  rule_results: RuleResult[];
  overall_status: 'verified' | 'flagged' | 'manual_review';
  confidence_score: number;
  flags: string[];
  reasoning: string;
}
```

- Server normalizes `date`-typed extracted fields to ISO (YYYY-MM-DD) before returning. If unparseable, drop that field from `extracted_fields` and append a flag.

### `src/app/api/services/[id]/documents/upload/route.ts` and admin equivalent `src/app/api/admin/services/[id]/documents/upload/route.ts`

Changes:

1. After fetching `docTypeRow`, branch on `ai_enabled`:
   - **false** → set `verification_status = 'not_run'`, do NOT fire AI background job, return doc with `admin_status = 'pending_review'` (default).
   - **true** → set `verification_status = 'pending'`, fire AI job as today but pass extraction config.
2. After AI completes, save `extracted_fields` as part of `verification_result` (already happens if we store the whole result).
3. Ensure `admin_status = 'pending_review'` on every new upload (the DB default handles it, but the update path on re-upload must reset it too — when someone replaces a doc, status goes back to `pending_review`).
4. On re-upload (updating an existing doc row): also reset `prefill_dismissed_at = null` so the new banner shows.

### New: `src/app/api/admin/documents/[id]/rerun-ai/route.ts`

- POST, admin only.
- Load doc + its document_type config.
- Download file from storage.
- Call `verifyDocument` with current config.
- Overwrite `verification_status`, `verification_result`, `verified_at`, `prefill_dismissed_at = null`.
- Return updated doc.

### Verify
- Upload a passport with AI enabled → extraction_fields populated in `verification_result`
- Disable AI on "Declaration of Source of Funds" via Settings → upload one → `verification_status = 'not_run'`, no AI call fires (check server logs)
- `POST /api/admin/documents/{id}/rerun-ai` → result overwritten

### Commit
`feat: B-033 batch 3 — verifyDocument prompt rework + upload branching + rerun endpoint`

Update `CHANGES.md`.

---

## BATCH 4 — Badges + prefill banner + admin approve/reject

### `src/components/shared/DocumentStatusBadge.tsx` (new)

Two-track pill badge. Props: `aiStatus: AiVerificationStatus`, `adminStatus: AdminReviewStatus`.

Visual:
```
┌──────────────┐┌────────────────────────┐
│ 🟢 AI verified││ 🟠 Pending admin review│
└──────────────┘└────────────────────────┘
```

Color map (Tailwind classes):
- AI `verified` → green (`bg-emerald-100 text-emerald-700`)
- AI `flagged` → amber (`bg-amber-100 text-amber-700`)
- AI `pending` → blue pulse (`bg-blue-100 text-blue-700 animate-pulse`)
- AI `manual_review` → amber
- AI `not_run` → grey (`bg-gray-100 text-gray-600`) with label "AI skipped"
- Admin `pending_review` → amber (`bg-orange-100 text-orange-700`)
- Admin `approved` → green
- Admin `rejected` → red (`bg-red-100 text-red-700`)

Compact mode prop: renders just two colored dots with tooltip showing long labels.

Mount everywhere a doc row is displayed:
- `src/components/shared/DocumentUploadWidget.tsx` — replace the current green "uploaded" state
- `src/components/client/ServiceWizardPeopleStep.tsx` — `KycDocListPanel` rows
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — `AdminKycDocListPanel` rows
- `src/components/shared/DocumentDetailDialog.tsx` — replace current single-status display

### `src/components/shared/AiPrefillBanner.tsx` (new)

Props: `doc: DocumentRecord`, `docType: DocumentType`, `kycRecord: KycRecord`, `onApplied: (fields: Partial<KycRecord>) => void`, `onDismiss: () => void`.

Logic:
1. Read `doc.verification_result.extracted_fields` + `docType.ai_extraction_fields`
2. Compute `applicable` = fields where `prefill_field` is set AND `prefill_field` is in `KYC_PREFILLABLE_FIELDS`
3. If `applicable.length === 0` → render nothing
4. If `doc.prefill_dismissed_at` is set → render nothing
5. Render banner:

```
┌─────────────────────────────────────────────────────────┐
│ 🪄 We read your {doc type name}.                        │
│                                                         │
│    Passport number: AB123456                            │
│    Expiry date:     2028-05-12                          │
│    Nationality:     Mauritian                           │
│                                                         │
│    When your form has values: [ keep mine ▾ ]           │
│                                [ Apply ]  [ Skip ]      │
└─────────────────────────────────────────────────────────┘
```

- Apply → POST `/api/profiles/kyc/save` with `{ kycRecordId, fields }` where `fields` respects the keep/overwrite toggle. Then POST `/api/documents/{id}/dismiss-prefill` to set `prefill_dismissed_at = now()`. Call `onApplied(fields)` so parent refetches KYC record.
- Skip → POST dismiss endpoint only. Call `onDismiss()`.

New API: `src/app/api/documents/[id]/dismiss-prefill/route.ts` — POST, authenticated user with access to that doc, sets `prefill_dismissed_at = now()`.

Mount in `KycDocListPanel` (client side) directly below each doc row.

### Admin approve / reject

Existing endpoint: `src/app/api/admin/documents/library/[id]/review/route.ts` should already exist (B-027 added it). Confirm and reuse. If not, create `src/app/api/admin/documents/[id]/admin-status/route.ts`:

- PATCH `{ admin_status: 'approved' | 'rejected', admin_status_note?: string }`
- Sets `admin_status`, `admin_status_by = session.user.id`, `admin_status_at = now()`
- Admin only

UI:
- In `src/components/shared/DocumentDetailDialog.tsx` (admin mode), update the existing approve/reject controls to use the new admin_status values (`pending_review | approved | rejected`).
- Add a **Re-run AI** button next to approve/reject. Calls `/api/admin/documents/[id]/rerun-ai`, refreshes dialog data on success. Show loading state.

### Verify
- Upload passport → AI runs → badge shows "AI verified · Pending admin review"
- Upload CV (AI on, extraction off) → badge shows "AI verified · Pending admin review" (or flagged)
- Disable AI on PEP → upload one → badge shows "AI skipped · Pending admin review"
- Prefill banner appears on passport upload with extracted data
- Apply → KYC form fields populate, banner disappears, prefill_dismissed_at is set
- Skip → banner disappears, nothing filled
- Admin approves → client-side badge updates to "AI verified · Admin approved"
- Admin clicks Re-run AI → result overwritten, banner reappears (prefill_dismissed_at cleared)

### Commit
`feat: B-033 batch 4 — two-track status badges, prefill banner, admin approve + rerun`

Update `CHANGES.md`.

---

## BATCH 5 — Polish + verification + final push

### Checks

- `npm run build` clean
- `npm run lint` clean (fix anything new)
- Audit the 5 status flows end-to-end (per Batch 4 verify list) — write any findings into the CHANGES.md entry
- Tech debt review — nothing opened that isn't documented
- `assert_documents_history_sync()` returns void (meaning: no drift)

### Final CHANGES.md entry

Add a final "B-033 complete" summary at the top of recent changes referencing all 4 prior batches and the verification outcome. Close with:

> **Follow-ups deferred:** history UI (timeline viewer); admin-side prefill (Certificate of Incorporation → clients/applications); per-field Apply in prefill banner; bulk admin approve; history tables for services/clients/client_profiles; per-doc email notifications; schema-drift CI hook.

### Commit
`chore: B-033 complete — final verification + CHANGES summary`

Push. Done.

---

## Instructions to CLI

1. Read this brief in full before starting.
2. Execute all 5 batches without pausing between them.
3. Commit + push + update `CHANGES.md` after each batch. Use clear commit messages per the project convention (no B-XXX prefix — project rule).
4. If you hit a blocker, document it in `CHANGES.md` under a "B-033 blocker" heading and stop. Otherwise keep going.
5. Build must pass after each batch. If it breaks, fix before pushing.
6. Do not use `git add -A` / `git add .` — stage files by name.
7. Do not commit `.env.local`, `supabase/.temp/`, or any secrets.
8. Follow the project's dev-server rule: don't restart `next dev` yourself; the user restarts after your work is done.

Good luck.
