# CLI Brief — B-071 Doc Model Fixes (Scope UI + Service-Template Binding + Role Wiring + Applies-To Filter)

**Status:** Ready for CLI (independent — can run before or after B-068/069/070)
**Estimated batches:** 5
**Touches migrations:** Yes (one new join table + minor column add)
**Touches AI verification:** No

---

## Why this batch exists

Four related gaps in today's document model surfaced during the substance/admin-actions design discussion:

1. **`document_types.scope` has no admin UI.** Admins can't change whether a doc is per-person KYC or application-level. New types default to `person` silently.
2. **No service-template ↔ document binding.** GBC asks for ~18 docs; AC, Trust, Domestic Co, Relocation each have their own lists. The current model can't express this — the same DD-driven list applies to every service template.
3. **`role_document_requirements` is admin-configurable but ignored at runtime.** Configuring "directors need a CV" in `/admin/settings/role-requirements` does nothing today — `PerPersonReviewWizard.tsx:656` only reads DD requirements.
4. **`applies_to` is set on doc types but not enforced in KYC.** A corporate-entity profile in KYC sees "Certified Passport Copy" because nothing filters individual-only docs out for organisation profiles.

Fix all four in one brief — they share the same plumbing and it's clearest if they land together.

---

## Hard rules

1. Complete all 5 batches autonomously. Commit + push + update CHANGES.md after each.
2. After Batch 1 migration: `npm run db:push` + `npm run db:status`. Confirm pair.
3. **Backwards-compatible runtime.** The current behavior (DD-only list, all profiles see all docs) must continue to work for service templates that don't have a service-template-doc binding configured yet. Empty binding → fall back to current logic. New data drives new behavior.
4. `npm run build` must pass before declaring any batch done.

---

## Batch 1 — Migration: `service_template_documents` + scope-related polish

Create `supabase/migrations/<ts>_service_template_documents.sql`:

```sql
-- Bind document types to specific service templates. If a service template
-- has rows here, ONLY these docs apply to its applications. If it has no
-- rows, fall back to the global DD-driven list (preserves current behavior
-- until a template is explicitly configured).

CREATE TABLE IF NOT EXISTS public.service_template_documents (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                            REFERENCES public.tenants(id),
  service_template_id     uuid NOT NULL REFERENCES public.service_templates(id) ON DELETE CASCADE,
  document_type_id        uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  is_required             boolean NOT NULL DEFAULT true,
  applies_to_role         text,    -- nullable: NULL = applies to whole application; else specific role like "director"
  sort_order              int NOT NULL DEFAULT 0,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_template_id, document_type_id, applies_to_role)
);

CREATE INDEX IF NOT EXISTS std_template_idx ON public.service_template_documents(service_template_id);
CREATE INDEX IF NOT EXISTS std_doc_type_idx ON public.service_template_documents(document_type_id);

ALTER TABLE public.service_template_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "std_admin_all"     ON public.service_template_documents FOR ALL USING (public.is_admin());
CREATE POLICY "std_client_read"   ON public.service_template_documents FOR SELECT USING (true);
-- Read-only for clients (so the wizard can render the right list);
-- writes are admin-only.
```

No backfill — start with empty binding (zero rows). The wizard fallback in Batch 3 keeps existing applications working.

Add to `src/types/index.ts`:

```ts
export interface ServiceTemplateDocument {
  id: string;
  tenant_id: string;
  service_template_id: string;
  document_type_id: string;
  is_required: boolean;
  applies_to_role: string | null;
  sort_order: number;
  notes: string | null;
  created_at: string;
  document_types?: DocumentType | null;
}
```

After file lands: `npm run db:push` + `npm run db:status`. Confirm.

**Commit message:** `feat: service_template_documents join table for per-template doc binding`

---

## Batch 2 — Scope field in admin Document Types UI

Update `src/app/(admin)/admin/settings/document-types/DocumentTypesManager.tsx`:

1. Extend `DocumentTypeForm` and `EMPTY_FORM` to include `scope: "person" | "application"`.
2. Add a select / radio in the form between "Applies to" and "Description" with two options:
   - **Person KYC** (`scope=person`) — uploaded per Director / Shareholder / UBO inside the per-person KYC wizard
   - **Service-level** (`scope=application`) — uploaded once per application in the Documents step
3. Default new types to `person`.
4. Show the scope on each doc type row as a small text/badge (e.g. "KYC" / "Service") next to the existing `applies_to` chip.

Update API:
- `POST /api/admin/document-types` — accept `scope` in body, include in insert.
- `PATCH /api/admin/document-types/[id]` — accept `scope`, include in update.

Acceptance:
- Admin can set scope when creating or editing a doc type.
- Existing doc types still display correctly (their scope was set in migration 006).
- Build passes.

**Commit message:** `feat: scope field in admin Document Types form`

---

## Batch 3 — Wire service-template binding into client wizard

Update `src/app/(client)/services/[id]/page.tsx`:

After fetching the service + DD requirements, also fetch the service template's bound docs:

```ts
supabase
  .from("service_template_documents")
  .select("*, document_types(id, name, category, scope, applies_to)")
  .eq("service_template_id", serviceTemplateId)
  .eq("tenant_id", tenantId)
  .order("sort_order")
```

Pass this list down to `ServiceWizard.tsx` as a new prop `templateDocs: ServiceTemplateDocument[]`.

Update `ServiceWizard.tsx` Step 5 logic (currently filters from `requirements`):

```ts
// Prefer the template's bound docs if any exist; else fall back to
// DD-driven application-scope filtering (current behavior).
const applicationScopeDocs =
  templateDocs.length > 0
    ? templateDocs
        .filter((td) => td.document_types?.scope === "application" && !td.applies_to_role)
        .map((td) => ({
          requirement_type: "document" as const,
          document_type_id: td.document_type_id,
          document_types: td.document_types,
          is_required: td.is_required,
        }))
    : requirements.filter(
        (r) =>
          r.requirement_type === "document" &&
          r.document_type_id &&
          r.document_types?.scope === "application"
      );
```

(Adapt to whatever shape `applicationScopeRequirements` currently expects.)

Same fallback pattern in `PerPersonReviewWizard.tsx`:
- If `templateDocs.length > 0` AND that template has rows with `applies_to_role IN (the person's role)` OR `applies_to_role IS NULL AND scope='person'`, build the list from `templateDocs` matching that role.
- Else fall back to current DD-only logic.

Acceptance:
- Service template with NO `service_template_documents` rows: behaves exactly as today.
- Service template with rows: wizard shows ONLY those docs per the binding, scoped by `applies_to_role`.
- Build passes.

**Commit message:** `feat: client wizard reads service-template-document binding when present`

---

## Batch 4 — Wire role_document_requirements at runtime

Update `PerPersonReviewWizard.tsx` (`docTypesByCategory` calculation around line 656):

Today: `eligible` is filtered by DD-required doc type ids.
Add: also include doc types from `role_document_requirements` matching the current person's role.

Plumbing: server fetches role requirements for the relevant roles in `src/app/(client)/services/[id]/page.tsx`:

```ts
supabase
  .from("role_document_requirements")
  .select("*, document_types(*)")
  .eq("tenant_id", tenantId)
  .eq("is_required", true)
```

Pass down `roleRequirements: RoleDocumentRequirement[]` to the wizard. The wizard's per-person view uses the person's role to pick the relevant doc type ids and union them with the DD-required ids.

Edge case: if `templateDocs` (from B-071 Batch 3) has rows for this template, **`templateDocs` wins over `role_document_requirements`** — the explicit template binding is more specific than the global role list.

Acceptance:
- Add a doc type to `role_document_requirements` for `director` via /admin/settings/role-requirements.
- Open a service application, view a director's KYC wizard.
- That doc type appears (in the appropriate category bucket).
- Removing the role requirement removes it from the wizard.
- Build passes.

**Commit message:** `feat: wire role_document_requirements into per-person KYC wizard`

---

## Batch 5 — Filter by applies_to in KYC wizard

Update `PerPersonReviewWizard.tsx`:

After scope filter, also filter by `applies_to`:

```ts
const profileType: "individual" | "organisation" = profile.profile_type ?? "individual";

const personOnly = eligible.filter((dt) => {
  if ((dt.scope ?? "person") !== "person") return false;
  if (dt.applies_to === "both") return true;
  return dt.applies_to === profileType;
});
```

Adjust to whatever the actual profile-type field is on `client_profiles`. If profile type isn't stored explicitly, derive from whether the profile has corporate fields filled (best-effort) — but ideally there's a field. Search `client_profiles` columns first.

Acceptance:
- Individual profile sees individual + both docs (no org-only docs).
- Organisation profile sees organisation + both docs (no individual-only docs).
- Build passes.

End of brief:
1. `npm run build` clean
2. CHANGES.md updated with B-071 entry referencing the migration filename and the four wired fixes
3. Background dev server restart
4. Final push
5. Stop.

**Commit message:** `feat: filter KYC docs by applies_to against profile type`

---

## Out of scope (deferred)

- Admin UI for managing `service_template_documents` rows (binding doc types to a template) — defer until B-072 or follow-up brief. For now, rows are created via SQL or seed scripts.
- Admin Actions registry + Substance Review — **B-072**

---

## Open questions (do not block)

- If `client_profiles.profile_type` doesn't exist as a column, add it in the same migration with a sensible default. Otherwise derive.
- If there's no `is_admin()` helper in the project, search migrations for the actual helper name and use it consistently.
