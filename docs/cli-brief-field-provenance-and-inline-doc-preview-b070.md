# CLI Brief — B-070 Field Provenance + Inline Doc Preview

**Status:** Ready for CLI (depends on B-068 + B-069 + B-073 — all landed)
**Estimated batches:** 4
**Touches migrations:** Yes (one new table OR one JSONB column — see Batch 1)
**Touches AI verification:** Yes (write path needs to record provenance)

> **Path note (post-B-073):** The admin detail page is `/admin/services/[id]` (modern). The KYC views per profile live there via `AdminKycPersonReviewPanel` (or wherever B-073 wired the `kyc:<profile_id>:<category>` subsection cards). Field markers go on the fields rendered in those views, so the wiring landing point is the services path — NOT the legacy `/admin/applications/[id]`. Server-side extraction fetch happens in `src/app/(admin)/admin/services/[id]/page.tsx`.

---

## Why this batch exists

Today the AI extracts data from uploaded documents (passport, utility bill, etc.) and writes the extracted values into `client_profiles` / `client_profile_kyc`. The admin has no way to tell which fields came from a document and which were typed by the user. Vanessa wants:

1. A clear visual indicator on each field showing it was AI-extracted and from which doc.
2. The ability to click that indicator and see the source doc inline (without leaving the section).

This is critical for FSC defensibility: when a substance assessment goes out, the admin must be able to defend "passport number = X12345 because it came from this passport scan, not because the client typed it".

---

## Hard rules

1. Complete all 4 batches autonomously. Commit + push + update CHANGES.md after each.
2. Migration is idempotent. After Batch 1, run `npm run db:push` and `npm run db:status`. Confirm pair Local + Remote.
3. Existing data has no provenance — backfill as `null` (= "manual" / unknown). Never invent provenance.
4. The UI marker and inline preview must be subtle: do NOT clutter every field with a heavy badge. Small icon next to the value.
5. Reuse existing `DocumentPreviewDialog` (or whatever the project uses to preview uploaded docs).
6. `npm run build` must pass before declaring any batch done.

---

## Batch 1 — Migration: provenance tracking

**Approach decision: separate table.** It's history-preserving (a field can be re-extracted from a different doc later), and avoids JSONB schema churn on the kyc record.

Create `supabase/migrations/<ts>_field_extractions.sql`:

```sql
CREATE TABLE IF NOT EXISTS public.field_extractions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                        REFERENCES public.tenants(id),

  -- What was filled in
  client_profile_id   uuid NOT NULL REFERENCES public.client_profiles(id) ON DELETE CASCADE,
  field_key           text NOT NULL,           -- e.g. "passport_number", "full_name"
  extracted_value     text,                    -- the value AI pulled

  -- Where it came from
  source_document_id  uuid REFERENCES public.document_uploads(id) ON DELETE SET NULL,
  source              text NOT NULL DEFAULT 'ai_extraction'
                        CHECK (source IN ('ai_extraction', 'manual', 'admin_override')),

  -- Audit
  ai_confidence       numeric(4,3),            -- 0.000 to 1.000 if available
  extracted_at        timestamptz NOT NULL DEFAULT now(),
  superseded_at       timestamptz              -- non-null when this extraction was replaced by a later one
);

CREATE INDEX IF NOT EXISTS fe_profile_field_idx
  ON public.field_extractions(client_profile_id, field_key, extracted_at DESC);
CREATE INDEX IF NOT EXISTS fe_source_doc_idx
  ON public.field_extractions(source_document_id);
CREATE INDEX IF NOT EXISTS fe_tenant_idx
  ON public.field_extractions(tenant_id);

ALTER TABLE public.field_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fe_admin_read"  ON public.field_extractions FOR SELECT USING (public.is_admin());
CREATE POLICY "fe_admin_write" ON public.field_extractions FOR ALL    USING (public.is_admin());

-- Clients can see their own extractions (read-only)
CREATE POLICY "fe_client_read" ON public.field_extractions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.client_profiles cp
      JOIN public.client_users cu ON cu.client_id = cp.client_id
      WHERE cp.id = field_extractions.client_profile_id
        AND cu.user_id = auth.uid()
    )
  );
```

After file lands:
- `npm run db:push`
- `npm run db:status` — confirm pair Local + Remote.

Add to `src/types/index.ts`:

```ts
export type FieldSource = "ai_extraction" | "manual" | "admin_override";

export interface FieldExtraction {
  id: string;
  tenant_id: string;
  client_profile_id: string;
  field_key: string;
  extracted_value: string | null;
  source_document_id: string | null;
  source: FieldSource;
  ai_confidence: number | null;
  extracted_at: string;
  superseded_at: string | null;
}
```

**Commit message:** `feat: field_extractions table for provenance tracking on KYC fields`

---

## Batch 2 — AI write path records provenance

Find the AI verification write paths — search for places that write to `client_profile_kyc` or `client_profiles` after OCR. Likely under `src/app/api/applications/[id]/documents/[docId]/verify/route.ts` or similar AI verification routes.

For each AI-driven field write, **also insert a `field_extractions` row** with:
- `client_profile_id` = the profile being filled
- `field_key` = the snake_case field name being written
- `extracted_value` = the value being written (string-cast)
- `source_document_id` = the upload row id that produced this extraction
- `source` = `"ai_extraction"`
- `ai_confidence` = if the AI returns a confidence score, persist it; else `null`

If the same `(client_profile_id, field_key)` is being re-extracted (e.g. user uploaded a corrected passport), set the previous row's `superseded_at = now()` before inserting the new one.

For admin-override edits (admin manually changes a field that was AI-extracted): write a new `field_extractions` row with `source = "admin_override"` and the new value. This requires hooking into wherever the admin saves field edits (likely `EditableApplicationDetails` save handler).

For client-facing manual edits (client types a value with no AI involvement): no provenance row needed — absence of a row implies manual / unknown.

Acceptance:
- Upload a doc, run AI verification, then query `field_extractions` — rows exist for each extracted field with `source = "ai_extraction"` and the correct `source_document_id`.
- Admin overrides a value, query again — new row with `source = "admin_override"` and the previous AI row gets `superseded_at` set.
- `npm run build` passes.

**Commit message:** `feat: AI write path records field provenance + supersede chain`

---

## Batch 3 — UI: field provenance marker + inline doc preview

Create `src/components/admin/FieldProvenanceMarker.tsx`:

- Props: `clientProfileId: string; fieldKey: string; extractions: FieldExtraction[]` (already filtered to this profile + fieldKey, sorted DESC by `extracted_at`)
- Behavior:
  - If no extractions OR latest is `manual`: render nothing
  - If latest is `ai_extraction`: render a small sparkle icon (lucide `Sparkles`) with subtle tooltip "Auto-filled from {doc name}"
  - If latest is `admin_override`: render a small pencil-with-circle icon, tooltip "Admin override (was: {previous value})"
  - On click: opens the source doc in a preview dialog (if `source_document_id` exists)
- Use the existing tooltip pattern (search for `Tooltip` or `Popover` in the codebase — reuse, don't introduce a new component).

Create / extend the inline preview:

- If `DocumentPreviewDialog` exists, reuse it. If not, create a thin wrapper around the existing `documents/[docId]` page rendered in a Sheet (right-slide). Decision: prefer reusing.
- The dialog should highlight WHICH field this preview was opened for (small banner at top: "Source for: passport_number").

Wire `FieldProvenanceMarker` into the per-profile KYC views on `/admin/services/[id]` (built/wired in B-069 + B-073). Each labeled field gets the marker positioned to the right of the label or right of the value. Wherever the field is rendered in `AdminKycPersonReviewPanel.tsx` or the inline KYC sections in `ServiceDetailClient.tsx`, drop the marker next to the field's value.

Where to fetch extractions: server-side in `src/app/(admin)/admin/services/[id]/page.tsx`, filter by `client_profile_id IN (…)` for all profiles in this service, then pass down.

```ts
const { data: extractions } = await supabase
  .from("field_extractions")
  .select("*")
  .in("client_profile_id", profileIds)
  .is("superseded_at", null) // only current extractions for marker rendering
  .order("extracted_at", { ascending: false });
```

(Keep superseded ones available for the "previous value" tooltip on admin_override — but the current marker should reflect the latest only.)

Acceptance:
- Open admin KYC view for a profile that had docs verified — fields auto-filled by AI show the sparkle marker.
- Hover marker → tooltip with source doc name.
- Click marker → preview dialog opens with the doc image/PDF.
- Manually-typed fields have no marker.
- Admin-overridden fields have the override marker with previous value in tooltip.
- `npm run build` passes.

**Commit message:** `feat: field provenance UI markers + inline source doc preview`

---

## Batch 4 — Backfill + polish

Backfill: do nothing — existing data without `field_extractions` rows is correctly treated as "manual / unknown" (no marker shown). This is acceptable per the brief.

Polish:
- If many fields in a single subsection have AI provenance, group the markers visually so the section doesn't feel busy. A single subsection-level "AI-filled" indicator at the section header could replace per-field markers when ALL fields in a section came from the same source doc. Optional — skip if it adds complexity.
- Make sure the marker doesn't break form layouts in client view (client view should NOT show provenance markers — that's an admin-only feature). Guard rendering by checking for admin context.

End of brief:
1. `npm run build` clean
2. CHANGES.md updated with B-070 entry
3. Background dev server restart
4. Final push
5. Stop.

**Commit message:** `chore: B-070 polish — guard provenance markers to admin context only`

---

## Out of scope (deferred)

- Service-template ↔ document binding, scope admin UI — **B-071**
- Admin Actions registry + Substance Review — **B-072**
- AI confidence display in provenance tooltip beyond a yes/no — defer until we have real confidence scores from the AI module
