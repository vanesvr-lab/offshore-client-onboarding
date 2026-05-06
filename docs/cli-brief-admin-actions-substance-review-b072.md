# CLI Brief — B-072 Admin Actions Registry + Substance Review

**Status:** Ready for CLI (depends on B-071 for service-template binding)
**Estimated batches:** 6
**Touches migrations:** Yes (two new tables: `application_actions` + `application_substance`)
**Touches AI verification:** No

---

## Why this batch exists

Admin needs to perform discrete tasks on an application that aren't workflow stages and aren't doc reviews:

- **Substance Review** — fill in §3.2/§3.3/§3.4 substance criteria for GBC and AC (FSC requirement), assess pass/review/fail
- **Bank Account Opening** — track bank engagement status
- **Generate FSC Checklist** — produce the prefilled FS-41 Form A PDF (FSC submission)

These are admin-only, application-level, and which actions are required depends on the service template (GBC and AC need all three; Trust, Domestic Co, Relocation get other actions or none).

This brief delivers:
1. A registry table (`application_actions`) for which actions are required + their status.
2. The `application_substance` table per Vanessa's brainstorm.
3. A working Substance Review action UI (admin form + assessment + history via section reviews from B-068).
4. Stub UIs for Bank Account Opening and Generate FSC Checklist (the form/output logic is deferred — placeholders that record action status only).

---

## Hard rules

1. Complete all 6 batches autonomously. Commit + push + update CHANGES.md after each.
2. After Batch 1 + Batch 2 migrations: `npm run db:push` + `npm run db:status`. Confirm pair.
3. Substance and all admin actions are **admin-only** — RLS deny for clients.
4. Bank Opening and FSC Checklist are STUBS in this brief — record status only, don't build the workflow logic.
5. `npm run build` must pass before declaring any batch done.
6. If B-071 hasn't landed (no `service_template_documents` table), that's fine — this brief uses a separate `service_template_actions` table.

---

## Batch 1 — Migration: `application_actions` registry + `service_template_actions` binding

Create `supabase/migrations/<ts>_application_actions.sql`:

```sql
-- Registry of admin tasks per application (substance review, bank opening,
-- FSC checklist generation, etc.). Service-template binding lives in a
-- separate table so adding a new template just inserts a few rows.

CREATE TABLE IF NOT EXISTS public.service_template_actions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                            REFERENCES public.tenants(id),
  service_template_id     uuid NOT NULL REFERENCES public.service_templates(id) ON DELETE CASCADE,
  action_key              text NOT NULL,        -- 'substance_review', 'bank_account_opening', 'fsc_checklist'
  action_label            text NOT NULL,        -- display name
  is_required             boolean NOT NULL DEFAULT true,
  sort_order              int NOT NULL DEFAULT 0,
  UNIQUE (service_template_id, action_key)
);

CREATE TABLE IF NOT EXISTS public.application_actions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                            REFERENCES public.tenants(id),
  application_id          uuid NOT NULL REFERENCES public.applications(id) ON DELETE CASCADE,
  action_key              text NOT NULL,
  status                  text NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'in_progress', 'done', 'blocked', 'not_applicable')),
  assigned_to             uuid REFERENCES public.profiles(id),
  completed_by            uuid REFERENCES public.profiles(id),
  completed_at            timestamptz,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (application_id, action_key)
);

CREATE INDEX IF NOT EXISTS aa_app_idx     ON public.application_actions(application_id);
CREATE INDEX IF NOT EXISTS aa_status_idx  ON public.application_actions(status);
CREATE INDEX IF NOT EXISTS sta_template_idx ON public.service_template_actions(service_template_id);

ALTER TABLE public.service_template_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.application_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sta_admin_all" ON public.service_template_actions FOR ALL USING (public.is_admin());
CREATE POLICY "sta_read"      ON public.service_template_actions FOR SELECT USING (true);

CREATE POLICY "aa_admin_all"  ON public.application_actions FOR ALL USING (public.is_admin());
-- No client policy → clients cannot read application_actions

-- Seed: GBC and AC get all three actions
INSERT INTO public.service_template_actions (service_template_id, action_key, action_label, sort_order)
SELECT id, 'substance_review',     'Substance Review',     1 FROM public.service_templates WHERE name ILIKE '%global business%' OR name ILIKE '%authorised company%'
ON CONFLICT (service_template_id, action_key) DO NOTHING;

INSERT INTO public.service_template_actions (service_template_id, action_key, action_label, sort_order)
SELECT id, 'bank_account_opening', 'Bank Account Opening', 2 FROM public.service_templates WHERE name ILIKE '%global business%' OR name ILIKE '%authorised company%'
ON CONFLICT (service_template_id, action_key) DO NOTHING;

INSERT INTO public.service_template_actions (service_template_id, action_key, action_label, sort_order)
SELECT id, 'fsc_checklist',        'Generate FSC Checklist', 3 FROM public.service_templates WHERE name ILIKE '%global business%' OR name ILIKE '%authorised company%'
ON CONFLICT (service_template_id, action_key) DO NOTHING;
```

After file lands: `npm run db:push` + `npm run db:status`.

Add to `src/types/index.ts`:

```ts
export type ApplicationActionStatus = "pending" | "in_progress" | "done" | "blocked" | "not_applicable";
export type ActionKey = "substance_review" | "bank_account_opening" | "fsc_checklist";

export interface ServiceTemplateAction {
  id: string;
  service_template_id: string;
  action_key: ActionKey;
  action_label: string;
  is_required: boolean;
  sort_order: number;
}

export interface ApplicationAction {
  id: string;
  application_id: string;
  action_key: ActionKey;
  status: ApplicationActionStatus;
  assigned_to: string | null;
  completed_by: string | null;
  completed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
```

**Commit message:** `feat: application_actions registry + service_template_actions binding (seeded for GBC + AC)`

---

## Batch 2 — Migration: `application_substance`

Create `supabase/migrations/<ts>_application_substance.sql` — exact schema from Vanessa's brainstorm, with one change: reference the right `applications` (or `services`) table for this codebase. Verify which table represents the customer's GBC/AC application — search the project. The brainstorm says `applications`. If the project uses `services` interchangeably (the codebase has both), pick `applications` (per the brainstorm) and confirm via the FK reference in `client_profile_kyc.application_id` patterns.

```sql
CREATE TABLE IF NOT EXISTS public.application_substance (
  id                                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                         uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                                      REFERENCES public.tenants(id),
  application_id                    uuid NOT NULL UNIQUE REFERENCES public.applications(id) ON DELETE CASCADE,

  -- §3.2 mandatory criteria (booleans)
  has_two_mu_resident_directors     boolean,
  principal_bank_account_in_mu      boolean,
  accounting_records_in_mu          boolean,
  audited_in_mu                     boolean,
  board_meetings_with_mu_quorum     boolean,
  cis_administered_from_mu          boolean,

  -- §3.3 at-least-one criteria + evidence
  has_office_premises_in_mu         boolean,
  office_address                    text,
  has_full_time_mu_employee         boolean,
  employee_count                    int,
  arbitration_clause_in_mu          boolean,
  arbitration_clause_text           text,
  holds_mu_assets_above_100k_usd    boolean,
  mu_assets_value_usd               numeric(14,2),
  mu_assets_description             text,
  shares_listed_on_mu_exchange      boolean,
  exchange_listing_reference        text,
  has_reasonable_mu_expenditure     boolean,
  yearly_mu_expenditure_usd         numeric(14,2),
  expenditure_justification         text,

  -- §3.4 fallback
  related_corp_satisfies_3_3        boolean,
  related_corp_name                 text,

  -- Admin assessment
  admin_assessment                  text CHECK (admin_assessment IN ('pass','review','fail')),
  admin_assessment_notes            text,
  admin_assessed_by                 uuid REFERENCES public.profiles(id),
  admin_assessed_at                 timestamptz,

  -- Output (FK omitted for now; generated_documents table existence not confirmed)
  generated_pdf_id                  uuid,

  created_at                        timestamptz NOT NULL DEFAULT now(),
  updated_at                        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS as_app_idx     ON public.application_substance(application_id);
CREATE INDEX IF NOT EXISTS as_tenant_idx  ON public.application_substance(tenant_id);

ALTER TABLE public.application_substance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "as_admin_all" ON public.application_substance FOR ALL USING (public.is_admin());
-- No client policy → admin-only by design (per Vanessa's brainstorm)
```

If `generated_documents` table exists, add the FK in a follow-up migration. Don't gate this brief on it.

After file lands: `npm run db:push` + `npm run db:status`.

Add to `src/types/index.ts`:

```ts
export type SubstanceAssessment = "pass" | "review" | "fail";

export interface ApplicationSubstance {
  id: string;
  tenant_id: string;
  application_id: string;
  // §3.2
  has_two_mu_resident_directors: boolean | null;
  principal_bank_account_in_mu: boolean | null;
  accounting_records_in_mu: boolean | null;
  audited_in_mu: boolean | null;
  board_meetings_with_mu_quorum: boolean | null;
  cis_administered_from_mu: boolean | null;
  // §3.3
  has_office_premises_in_mu: boolean | null;
  office_address: string | null;
  has_full_time_mu_employee: boolean | null;
  employee_count: number | null;
  arbitration_clause_in_mu: boolean | null;
  arbitration_clause_text: string | null;
  holds_mu_assets_above_100k_usd: boolean | null;
  mu_assets_value_usd: number | null;
  mu_assets_description: string | null;
  shares_listed_on_mu_exchange: boolean | null;
  exchange_listing_reference: string | null;
  has_reasonable_mu_expenditure: boolean | null;
  yearly_mu_expenditure_usd: number | null;
  expenditure_justification: string | null;
  // §3.4
  related_corp_satisfies_3_3: boolean | null;
  related_corp_name: string | null;
  // assessment
  admin_assessment: SubstanceAssessment | null;
  admin_assessment_notes: string | null;
  admin_assessed_by: string | null;
  admin_assessed_at: string | null;
  generated_pdf_id: string | null;
  created_at: string;
  updated_at: string;
}
```

**Commit message:** `feat: application_substance table for FSC §3.2/3.3/3.4 substance criteria`

---

## Batch 3 — API routes for actions and substance

Create:

- `src/app/api/admin/applications/[id]/actions/route.ts`
  - **GET** — returns required actions for this application's service template, joined with the application's action statuses (creates pending rows on demand if missing). Shape: `{ data: Array<{ template_action: ServiceTemplateAction; instance: ApplicationAction }> }`
  - **PATCH** — body `{ action_key: ActionKey; status?: ApplicationActionStatus; notes?: string | null }`. Updates the `application_actions` row (insert if missing). Sets `completed_by` + `completed_at` when status transitions to `done`.

- `src/app/api/admin/applications/[id]/substance/route.ts`
  - **GET** — returns the existing `application_substance` row (or `null` if not yet created)
  - **PUT** — upserts the substance row. Body matches `ApplicationSubstance` minus audit fields. Save automatically populates `admin_assessed_by` + `admin_assessed_at` when `admin_assessment` is set/changed. `updated_at` always set.

All admin-only — verify the caller is in `admin_users`.

**Commit message:** `feat: admin actions + substance API routes`

---

## Batch 4 — Substance Review action UI

Create `src/components/admin/SubstanceReviewForm.tsx`:

Layout:

1. Header: "Substance Review — {Application Name}"
2. **§3.2 Mandatory Criteria** section — six labeled boolean inputs (Yes/No/Unknown radio per criterion):
   - Has 2 Mauritius-resident directors?
   - Principal bank account in Mauritius?
   - Accounting records kept in Mauritius?
   - Audited in Mauritius?
   - Board meetings with Mauritius quorum?
   - CIS administered from Mauritius? (only show if relevant — could be conditional, but for POC always show)
3. **§3.3 At-Least-One Criteria** section — each criterion has a Yes/No, plus evidence text/numeric fields shown conditionally when Yes:
   - Office premises in Mauritius? + address
   - Full-time MU employee? + employee count
   - Arbitration clause in MU? + clause text
   - MU assets > USD 100k? + value + description
   - Listed on MU exchange? + reference
   - Reasonable MU expenditure? + yearly USD + justification
4. **§3.4 Fallback** section — Related corp satisfies §3.3? + corp name
5. **Admin Assessment** at the bottom:
   - Three buttons: Pass / Review / Fail
   - Notes textarea (required when Fail or Review, optional when Pass)
6. Save button (saves to `/api/admin/applications/[id]/substance` PUT)

Form state: a single object matching `ApplicationSubstance`. On mount, GET the existing row to prefill. On Save, PUT the full state. Show toast on success/error.

Wire it into the admin app detail page. From B-068's section-review pattern, this becomes a new section with `section_key = "action:substance_review"`. Show:
- The substance form inside the section
- A `SectionHeader` at top with status badge
- A `SectionNotesHistory` at bottom (the section reviews from B-068)

Visibility: only render this section if `service_template_actions` for this template includes `substance_review` (i.e. GBC + AC).

**Commit message:** `feat: Substance Review action UI for GBC + AC`

---

## Batch 5 — Bank Opening + FSC Checklist stubs

For each, create a **stub** Card that shows up on the admin app detail page (gated by service_template_actions like substance):

- `BankAccountOpeningStub.tsx` — placeholder text "Bank account engagement workflow — coming soon", a simple status dropdown (pending/in_progress/done/blocked) bound to PATCH `/api/admin/applications/[id]/actions`, and a notes textarea. That's it.
- `FscChecklistStub.tsx` — placeholder text "FSC FS-41 Form A checklist — generation coming soon", a "Mark as ready to generate" button that flips the action to `in_progress`, and a notes textarea.

Both stubs use `section_key = "action:bank_account_opening"` and `section_key = "action:fsc_checklist"` for their section reviews.

**Commit message:** `feat: stub UIs for Bank Opening + FSC Checklist actions`

---

## Batch 6 — Wire into admin app detail page

Final integration:

- Server-side fetch in `src/app/(admin)/admin/applications/[id]/page.tsx`:
  - Required actions for this template
  - This application's action instances
  - The substance row (if any)
- Pass to a new client component `AdminApplicationActionsSection.tsx` that renders the relevant action UIs in order, gated by which actions the template requires.
- Place this new section AFTER the Documents step in the wizard-shaped layout from B-069. Step number depends on whether B-069 has landed. If B-069 hasn't landed, append it as a new Card at the bottom of the left column.

End of brief:
1. `npm run build` clean
2. CHANGES.md updated with B-072 entry referencing both migration filenames + the seeded action rows for GBC/AC
3. Background dev server restart
4. Final push
5. Stop.

**Commit message:** `feat: wire Substance / Bank Opening / FSC Checklist actions into admin app detail`

---

## Out of scope (deferred)

- Field-level doc attachments to §3.3 evidence (Vanessa: "no, let's not spend too much time on this for now")
- FSC FS-41 PDF generation logic (Vanessa: "do this later")
- Bank Opening real workflow logic
- Admin UI to manage `service_template_actions` rows (binding actions to other templates) — for now, GBC and AC are seeded; new templates need SQL

---

## Open questions (do not block)

- Service template name matching: `ILIKE '%global business%'` and `'%authorised company%'` should match the seeded names. If they don't, the seed inserts no rows — the action UIs will not appear. Fix is one-line SQL update.
- If `generated_documents` table doesn't exist, the `generated_pdf_id` column stays nullable + unreferenced. Add the FK in a future migration when we build the FSC PDF generator.
