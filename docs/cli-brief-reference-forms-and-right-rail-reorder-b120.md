# B-120 — Reference Forms library + right-rail Progress-card reorder

## Goal

Two pieces:

1. **Right-rail reorder** — move the Progress Meters card to be the **first** item in the right rail (above the View Summary button). Small JSX shuffle, very low-risk. ~5 lines of change.
2. **Reference Forms feature** — a two-piece system covering both the **blank regulatory templates** admins download from regulators (and eventually pre-fill from service data) and the **submitted-form copies** admins upload back once they've filled and submitted externally. Library lives at `/admin/settings/reference-forms`; Action subsections (Substance Review, Bank Opening, Company Registration, FSC Checklist — all from B-119) surface their attached forms inline with Download blank / Upload submitted affordances.

## Context

### Right-rail reorder

Today the right-rail order in `ServiceDetailClient.tsx` (around the rail block at the bottom of the JSX) is:

```
1. View Summary button     (B-091)
2. Progress Meters card    (B-112) — gauges Company Setup / Financial / Banking / People KYC / Documents (+ Actions when bound, B-119)
3. Pending card            (B-111)
4. Status card             (B-093)
5. Communications card
6. Milestones card
7. Audit Trail
```

Vanessa wants Progress to be the first card so the at-a-glance state is what admin sees the moment the rail pins. View Summary moves down to slot 2; everything else shifts by one.

### Reference Forms

The two pieces (already aligned with Vanessa):

**Blank reference template** — the regulatory form admin downloads (e.g., FSC Form A). Uploaded once to the central library, reused across many services. Has a name, file, source URL, version label, status (active/deactivated), and linkage to a specific `(service_template, action_key)` so GBC's `fsc_checklist` forms can differ from another template's. Future enhancement (not in this brief): pre-fill the blank using service data so admin gets a partially-filled draft to print + finalize.

**Submitted form copy** — once admin submits the form externally, they upload the filled copy back to the system as a record. Per (service, action_key, reference_form_id) — one current file per reference form with history of older uploads preserved (timestamps + files). The FK to `reference_forms.id` stays pinned to the historical version, so even after that reference form is deactivated and replaced, the audit trail still says "Form A v2025-01 was filed for Service X on 12 May 2026".

Inline UI on each Action subsection (rendered inside the subsection accordion's expanded body, below the existing form fields):

```
Reference forms:
  • FSC Form A · v2025-01 · active        [Download blank ↓]
    Submitted: filed_2026-05-12.pdf       [Upload submitted ↑]  Submitted 12 May 2026
                                          [View history (3)]
  • FSC Form B · v2024-09 · active        [Download blank ↓]
    Submitted: not yet uploaded           [Upload submitted ↑]
```

If the subsection has no attached reference forms, the panel is hidden (don't show an empty "Reference forms" header).

## Locked design decisions (from brainstorming)

### Library home

`/admin/settings/reference-forms` — list of all forms, filterable by `(service_template, action_key)`. Upload, Replace, Deactivate.

### Linkage scope

Each reference form is bound to a specific `(service_template_id, action_key)` pair. A form attached to (GBC template, `fsc_checklist`) is invisible to services on a different template even if that template also has `fsc_checklist`. If admin wants the same form on multiple templates, they upload it once per template (acceptable POC trade-off; revisit if duplication becomes painful).

### Multiple forms per Action subsection

Yes. An Action subsection can have any number of attached reference forms (FSC needs Form A + Form B + Form C is the canonical example). Forms are listed in `sort_order` (an integer column on `reference_forms`).

### Versioning — replace flow

When a new version of an existing form is published:

- Admin opens the form's row on the settings page and clicks **"Replace with new version"**.
- A modal opens: pick the new file + optionally a new `version_label` + optional `source_url`.
- On submit: the system creates a new `reference_forms` row (status `active`) AND updates the previous row's `status='deactivated'`, `deactivated_reason='replaced_by_newer_version'`, `deactivated_at=now()`, `replaced_by_id={new row's id}`.
- Both rows persist forever. Submitted-form FKs to the old row remain valid (audit trail integrity).

For "form no longer required" (e.g., the regulator removed it): admin clicks **"Deactivate"** on the row. Asks for an optional note. Sets `status='deactivated'`, `deactivated_reason='no_longer_required'`. No new row created. `replaced_by_id` stays null.

The settings page surfaces active forms by default; an "Include deactivated" toggle shows the full history.

### Submitted-form history

Per (service, action_key, reference_form_id), the latest uploaded file is the "current" submitted form. Older uploads are kept in a `submitted_form_history` view (rendered inline as a collapsible "View history (N)" affordance under the current upload). Each row in history shows file name + uploaded_at + uploader.

When a reference form is replaced by a newer version on the global library, **existing submitted-form rows do not migrate** — they stay attached to the historical reference_form_id they were filed against. New submitted uploads for the same (service, action_key) link to whichever reference_form_id is currently active.

### Storage

Existing Supabase `documents` bucket (private; signed-URL access). Path conventions:

- Blank templates: `reference-forms/{reference_form_id}/{filename}`
- Submitted copies: `submitted-forms/{service_id}/{action_key}/{reference_form_id}/{timestamp}_{filename}`

Don't introduce a new bucket — the existing private bucket and signed-URL flow already cover this.

### Permissions

Today: any admin (`admin_users`) can upload, replace, and deactivate. When the role hierarchy ships (project memory: Officer / Manager / Super User / Junior Officer), revisit and gate library management to Manager+ in a follow-up. Add tech-debt entry.

### Out of scope (B-120)

- **Auto-fill of blank templates** from service data — deferred to a future brief. The current flow is "Download blank → admin prints + fills → admin uploads submitted copy". Pre-population can layer on later without schema change.
- **Form preview in-app** — clicking Download blank is a signed-URL download, not an inline PDF viewer. Existing DocumentPreviewDialog handles inline preview for normal docs; reference-form preview can come later if needed.
- **Field-level form definitions** — no form-builder UI, no per-field schema, no auto-validation of submitted forms.
- **Role-gated permissions** (see Permissions above; tech-debt note).
- **Bulk replace across templates** — replacing a form on the GBC template doesn't auto-replace the same regulatory form bound to other templates. Admin replaces per template.

## Implementation — batched

Each batch ends with: stage specific files (never `git add -A` or `git add .`), commit with a descriptive message (no `B-120` in the commit message), `git push origin HEAD:main` (worktree session — main is the only branch CLI pulls), update `CHANGES.md` with the batch outcome.

### Batch 1 — Right-rail reorder (quick win, do this first)

Locate the right-rail JSX block in `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` (search for the comment `B-102 — right rail` around line 5682 or look for `lg:sticky lg:top-[300px]`). The block currently renders, in order:

1. `<Button>` "View Summary" (B-091)
2. `<ProgressMetersWithState>` (B-112)
3. `<PendingCardWithState>` (B-111)
4. The Status card div (B-093)
5. Communications card
6. Milestones card
7. Audit Trail

Move `<ProgressMetersWithState>` to slot 1 (above the View Summary button). Everything else shifts by one. The sticky-shell math (`top-[300px]` in `lg:sticky lg:top-[300px]`) does NOT need adjustment — the rail pins as a block, the sticky offset measures from the shell above, not the rail's first child.

Verify after the move: visually open `/admin/services/<any-id>` and confirm Progress Meters is the topmost card in the right rail at `lg:` widths, with View Summary just below it.

No tests required for this batch.

### Batch 2 — Reference Forms: schema + storage + settings page

**Schema migration:** `supabase/migrations/<timestamp>_reference_forms.sql`. Tables:

```sql
CREATE TABLE reference_forms (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  service_template_id   uuid NOT NULL REFERENCES service_templates(id) ON DELETE CASCADE,
  action_key            text NOT NULL,
  name                  text NOT NULL,
  file_path             text NOT NULL,                 -- Supabase Storage path under reference-forms/
  source_url            text,                          -- Where admin downloaded the blank from
  version_label         text,                          -- Free-text version label, e.g. "v2025-01"
  status                text NOT NULL DEFAULT 'active'
                          CHECK (status IN ('active','deactivated')),
  deactivated_reason    text
                          CHECK (deactivated_reason IS NULL OR deactivated_reason IN
                                 ('no_longer_required','replaced_by_newer_version')),
  deactivated_at        timestamptz,
  deactivated_note      text,
  replaced_by_id        uuid REFERENCES reference_forms(id) ON DELETE SET NULL,
  sort_order            integer NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  created_by            uuid NOT NULL                  -- admin_users.user_id
);

CREATE INDEX idx_reference_forms_lookup
  ON reference_forms (service_template_id, action_key, status, sort_order);

CREATE TABLE submitted_forms (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  service_id            uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  action_key            text NOT NULL,
  reference_form_id     uuid NOT NULL REFERENCES reference_forms(id) ON DELETE RESTRICT,
  file_path             text NOT NULL,                 -- Supabase Storage path
  file_name             text NOT NULL,                 -- Original filename for display
  notes                 text,
  uploaded_at           timestamptz NOT NULL DEFAULT now(),
  uploaded_by           uuid NOT NULL                  -- admin_users.user_id
);

CREATE INDEX idx_submitted_forms_lookup
  ON submitted_forms (service_id, action_key, reference_form_id, uploaded_at DESC);

ALTER TABLE reference_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE submitted_forms ENABLE ROW LEVEL SECURITY;
-- Default-deny RLS (matches review_requests / application_section_reviews conventions).
-- All app reads/writes go through service role via createAdminClient().
```

CLI runs `npm run db:push` and `npm run db:status` after creating the migration. Confirm pairing. Do not defer to Vanessa — autonomous run.

**Storage paths:**

Use the existing `documents` Supabase bucket (private). No new bucket. Path structure:

- Blank templates: `reference-forms/{reference_form_id}/{original_filename}`
- Submitted copies: `submitted-forms/{service_id}/{action_key}/{reference_form_id}/{ISO-timestamp}_{original_filename}`

Use the existing signed-URL helper (whatever the project uses for `documents` bucket access — likely a helper in `src/lib/supabase/storage.ts` or similar). If no helper exists, create a minimal one rather than inlining `.createSignedUrl()` calls everywhere.

**Admin settings page:** `src/app/(admin)/admin/settings/reference-forms/page.tsx`

- Server component fetches all reference forms grouped by `(service_template, action_key)`.
- Renders a filterable table: columns for Template, Action, Name, Version, Status, Source URL, Uploaded, Actions.
- Toolbar: filter by template + filter by action_key + toggle "Include deactivated".
- Top-right button: **"Upload new reference form"** → opens modal.
- Per-row actions: **Replace with new version**, **Deactivate** (active rows only), **Reactivate** (deactivated rows; only allowed if no newer version exists — i.e., replaced_by_id is null).

**Upload modal** (`src/components/admin/ReferenceFormUploadDialog.tsx`):

- Fields: name (text, required), service_template (select, required), action_key (select dependent on template's bindings, required), version_label (text, optional), source_url (URL, optional, validate basic URL shape), file (file picker, required).
- Submit POSTs `multipart/form-data` to `/api/admin/reference-forms` (Batch 2 endpoint).
- The same modal is reused for the "Replace with new version" flow — when invoked with a `replaceForFormId`, it pre-fills template + action_key + name (uneditable) and the submit endpoint takes the additional id to deactivate the old row.

**API endpoints** (under `src/app/api/admin/reference-forms/`):

- `POST /api/admin/reference-forms` — create. Body: multipart (file + name + service_template_id + action_key + version_label? + source_url? + replaceForFormId?). Uploads file to storage, inserts row, if `replaceForFormId` is set marks the old row as `deactivated` with `replaced_by_id` linking to the new one. Returns the new row.
- `GET /api/admin/reference-forms?service_template_id=&action_key=&include_deactivated=` — list. Returns rows sorted by `sort_order` then `created_at`.
- `POST /api/admin/reference-forms/[id]/deactivate` — set status=deactivated, reason=no_longer_required, optional note. Idempotent.
- `POST /api/admin/reference-forms/[id]/reactivate` — set status=active. Only allowed if `replaced_by_id IS NULL` (can't reactivate a row that's been superseded). Returns 409 with a helpful message otherwise.
- `GET /api/admin/reference-forms/[id]/blank-download-url` — generates a signed URL (5-minute TTL) for the file. Used by Download blank buttons.

Audit-log writes for create / deactivate / reactivate via the existing `writeAuditLog` helper.

### Batch 3 — Inline Action subsection panel: Download blank + Upload submitted + history

For each of the four Action subsection components (`SubstanceReviewSubsection`, `BankAccountOpeningSubsection`, `CompanyRegistrationSubsection`, `FscChecklistSubsection`), add a new "Reference forms" panel inside the expanded body, below the existing form fields:

- Server-fetch (in the parent page) the active reference forms for the current `(service_template_id, action_key)` and pass them as a prop.
- Server-fetch the submitted forms for the current `(service_id, action_key)`, grouped by `reference_form_id`, and pass them as a prop.

The panel component is a single shared `<ReferenceFormsPanel>` in `src/components/admin/actions/ReferenceFormsPanel.tsx`. Props: `serviceId`, `actionKey`, `referenceForms`, `submittedFormsByRefId`. Renders:

- If `referenceForms` is empty: render nothing (don't show an empty header).
- Otherwise: a small header "Reference forms" + a list of `<ReferenceFormRow>` per form.

Each `<ReferenceFormRow>`:

- Left: form name + version_label + active/deactivated chip + (if deactivated and `replaced_by_id` is set) a "Replaced by {new form name}" indicator.
- Right: **Download blank** button → hits `/api/admin/reference-forms/{id}/blank-download-url` and opens the signed URL.
- Below: the current submitted file (if any) with filename + uploaded date + uploader. Action button **Upload submitted** (or **Replace submitted** if a current file exists).
- "View history (N)" disclosure showing past submitted files in a collapsed list. Each historic row shows file name + uploaded date + uploader + a Download icon.

**Submitted upload endpoint:** `POST /api/admin/services/[id]/submitted-forms` — multipart (file + action_key + reference_form_id + optional notes). Uploads to storage, inserts a `submitted_forms` row. Returns the row plus the latest-per-(action_key, reference_form_id) view so the panel can patch local state without a refetch.

**View submitted file endpoint:** reuse the existing signed-URL pattern. Either expose a single helper `/api/admin/submitted-forms/[id]/download-url` or piggyback on whatever existing endpoint serves `documents`-bucket signed URLs.

Audit-log writes on submitted-form upload (action key `submitted_form_uploaded`, entity `submitted_form:{id}`).

### Batch 4 — Tests + audit log assertions + tech-debt notes + dev-server restart

**Tests:**

- Unit: signed-URL helper for both reference-forms and submitted-forms paths.
- Integration: full POST → DB → list cycle for `/api/admin/reference-forms`. Cover create, replace (verifies old row deactivated + `replaced_by_id` set), deactivate, reactivate (including the 409 path).
- Integration: submitted-form upload cycle. Verify the "latest per (action_key, reference_form_id)" projection.
- Unit: `ReferenceFormsPanel` renders nothing when `referenceForms` is empty; renders rows + history disclosure otherwise.

**Audit-log assertions** in the integration tests — confirm every create / deactivate / reactivate / submitted-upload writes the expected `audit_log` row.

**Tech-debt notes** — append to `docs/tech-debt.md` (newest at top) after this batch:

- Reference forms are bound per `(service_template, action_key)`. If admin wants the same regulatory form on multiple templates, they re-upload per template. Revisit if duplication becomes painful — could add a `linked_templates uuid[]` array or a junction table.
- Reference-form management has no role gating today (any admin). When the planned role hierarchy ships (Officer / Manager / Super User / Junior Officer), restrict library mutations to Manager+.
- Submitted forms link to a single `reference_form_id`. If a regulator publishes a "combined" form that replaces two existing forms, admin must mark both old forms deactivated AND upload the combined as a new form on each — duplicating storage. Revisit if combined forms become common.
- Auto-fill of blank templates from service data is deferred. When implemented, the download endpoint takes a `?prefilled=true` flag and the backend renders a filled PDF using a templating library (e.g., pdf-lib or a server-side form-fill helper). No schema change needed.

**Dev-server restart at the end** — after Batch 4 commits and pushes, run from the **main project root, not the worktree** (`.env.local` only lives at the project root):

```
cd /Users/elaris/Documents/Claude_webapp_client_onboarding && pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

Use `run_in_background` so the dev server keeps running after the CLI session ends. This is the standard auto-restart pattern for UI briefs.

## Database changes

- One migration in Batch 2: `reference_forms` + `submitted_forms` tables + RLS + indexes.
- No schema changes in Batches 1, 3, or 4.

CLI runs `npm run db:push` and `npm run db:status` immediately after the Batch 2 migration. Confirm Local + Remote pairing before moving on. Do not defer to Vanessa.

## Autonomous-run notes (Vanessa is asleep)

- Do not stop between batches. Commit + push + update CHANGES.md after each, then proceed.
- If you hit a question that would normally require Vanessa's input, document it in CHANGES.md under a "Questions / Decisions deferred" subsection and pick the option most consistent with this brief's locked decisions. **Never block the autonomous run on a question that can be reasonably defaulted.**
- Critical blockers that justify stopping: schema migration fails to push and remains unsynced; tests that were passing are now red and the root cause is the brief's design (not implementation); a security regression. For these, write the failure mode + last-known-good state into CHANGES.md and stop.
- All other questions: pick the default and keep going.

## End-of-brief checklist for CLI

After Batch 4 commits and pushes:

1. Confirm `git status` is clean and `git status -sb` says up-to-date with `origin/main`.
2. Confirm CHANGES.md tail has one entry per batch with the right date (today's date should be 2026-05-15 going into 2026-05-16; CLI: use whatever the system date returns at commit time).
3. Run the dev-server reset from the **main project root** (see Batch 4).
4. One-line chat summary back to Vanessa for when she wakes up: "B-120 done — Reference Forms library + right-rail Progress-card reorder. 4 batches committed, 1 migration pushed. Dev server restarted in background."

## Worktree note

This brief was written in worktree `stupefied-bhabha-fb0c3f`. All commits during execution must land on `origin/main` via `git push origin HEAD:main` — CLI only pulls main. Do not push to the worktree branch.
