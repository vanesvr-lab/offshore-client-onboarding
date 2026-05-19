-- B-128 — Seed the chatbot knowledge base with ~40 entries sourced from
-- docs/chatbot-kb-seed-b128.md. The same table also powers the AI
-- document verification path (B-031) — new entries are distinguished by
-- `source = 'b128_seed'` so the existing verification filter (which
-- ignores `source`) keeps reading them but admin can still cluster them
-- in the UI.
--
-- Prelude:
--   1. Relax the legacy CHECK constraint on `category` so the new
--      'howto' / 'nav' / 'glossary' values are accepted alongside the
--      original 'rule' / 'document_requirement' / 'regulatory_text' /
--      'general' set.
--   2. Add a UNIQUE constraint on `title` so the INSERTs can use
--      ON CONFLICT (title) DO NOTHING — re-running the migration won't
--      reset entries that Vanessa has edited in the admin UI.
--   3. Add a GIN full-text index on (title || content) so the
--      /api/chatbot/ask route's tsvector lookups stay fast.
--
-- The seed itself follows in the second half of this file.

-- ── 1. Relax the category CHECK constraint ─────────────────────────────
-- The constraint was created out-of-band (see the inline note in
-- /admin/settings/knowledge-base) so its name is whatever Postgres
-- generated. Drop any CHECK that mentions only the legacy values and
-- replace it with the wider set.
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'knowledge_base'
    AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) ILIKE '%category%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.knowledge_base DROP CONSTRAINT %I', conname);
  END IF;
  -- Add the new CHECK if it doesn't already exist.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    WHERE t.relname = 'knowledge_base'
      AND c.conname = 'knowledge_base_category_check_v2'
  ) THEN
    ALTER TABLE public.knowledge_base
      ADD CONSTRAINT knowledge_base_category_check_v2
      CHECK (category IN (
        'rule','document_requirement','regulatory_text','general',
        'howto','nav','glossary'
      ));
  END IF;
END$$;

-- ── 2. UNIQUE on title (with dedupe first) ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'knowledge_base'
      AND indexname = 'knowledge_base_title_key'
  ) THEN
    -- Dedupe: keep the most recently created row per title.
    DELETE FROM public.knowledge_base a
    USING public.knowledge_base b
    WHERE a.id < b.id AND a.title = b.title;
    ALTER TABLE public.knowledge_base ADD CONSTRAINT knowledge_base_title_key UNIQUE (title);
  END IF;
END$$;

-- ── 3. GIN full-text index ────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS knowledge_base_fts_idx
  ON public.knowledge_base
  USING GIN (to_tsvector('english', title || ' ' || content));

-- ── 4. Seed entries ────────────────────────────────────────────────────

INSERT INTO public.knowledge_base
  (title, category, content, applies_to, source, is_active)
VALUES
  (
    $kbseed$How do I add a Director, Shareholder, or UBO to a service?$kbseed$,
    'howto',
    $kbseed$**Where:** Service detail page (`/admin/services/[id]`) → People & KYC section

**Steps:**
1. Scroll to the People & KYC section on the service detail page.
2. Click "+ Add Director" (or "+ Add Shareholder" / "+ Add UBO" depending on the role you want to assign).
3. Either search an existing profile by name or email, or use the "Or create new" section.
4. If creating new, pick **Individual** or **Corporation**, then enter the full name (or corporation name) and email address.
5. Click **Add Director** at the bottom. The new person appears under People & KYC and gets a KYC link they can use to fill in their details.

**Tip:** If the same person already exists as a profile on another service in this client, search first — you can reuse them rather than re-create.

**See also:** What is a UBO?, How do I send a KYC invite?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I send a KYC invite to a profile?$kbseed$,
    'howto',
    $kbseed$**Where:** Service detail page (`/admin/services/[id]`) → People & KYC → individual profile card

**Steps:**
1. Open the service and scroll to the profile you want to invite.
2. Click the **Send invite** button on that profile's card (looks like an envelope icon).
3. Confirm the email address shown is correct — you can edit it inline before sending.
4. Click **Send**. The system emails the profile a magic-link to `/kyc/fill/[token]` and logs the event in the audit trail.

The recipient clicks the link → fills the KYC long form → the data flows back to the same profile card in real time.

**Tip:** Magic links expire in 24 hours. If they don't act in time, use the **Resend invite** affordance on the same card.

**See also:** What is the KYC long form?, How do I see who's been invited but hasn't started?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I mark a section as reviewed?$kbseed$,
    'howto',
    $kbseed$**Where:** Service detail page (`/admin/services/[id]`) → top-right of each section card

**Steps:**
1. Open the section you want to sign off on (Company Setup, Financial, Banking, People & KYC, or Documents).
2. Check that the fields are filled and accurate.
3. Click **Mark as reviewed** at the top-right of the section card.
4. The section header shows "Reviewed by [your name] on [date]" and contributes to the service's overall readiness state.

**Note:** Your role must have the **Can review** permission. If the button is greyed out, ask a Super User to grant your role `can_review`, or escalate to a Manager.

**See also:** What is a section review?, How do I request a peer/manager review?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I request a peer or manager review on a section?$kbseed$,
    'howto',
    $kbseed$**Where:** Service detail page (`/admin/services/[id]`) → right rail → "Peer / Manager Review" card

**Steps:**
1. On the service detail page, find the **Peer / Manager Review** card in the right rail.
2. Click **Request Peer / Manager Review**.
3. In the modal: pick which sections need review (checkboxes for Company Setup, Financial, Banking, Documents, and per-profile People & KYC), then pick one or more reviewers from the dropdown, then type a note explaining what you'd like them to look at.
4. Click **Send Request**. Reviewers get an email and a banner at the top of the service page next time they open it.

**Reviewer side:** Reviewers see your request as a row in the same card; they click the eye icon to read the note, jump to any flagged section, and click **Mark as reviewed** when done.

**See also:** How do I close a review request I sent?, What does "Mark as reviewed" do?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I override a service's stage / status?$kbseed$,
    'howto',
    $kbseed$**Where:** Service detail page (`/admin/services/[id]`) → right rail → "Status Change" card

**Steps:**
1. Find the **Status Change** card in the right rail.
2. Click the **Override** dropdown (next to the **Move forward** button).
3. Pick the stage you want to jump to — you can move backward or skip forward beyond the normal progression.
4. Confirm in the dialog. The change is audit-logged with your name and a `previous_value` / `new_value` pair.

**Permission:** Your role must have `approve_status_change`. By default, Super User and Manager have it; Officer and Junior Officer don't.

**When to use:** Override is for exceptional cases (skipping a stage that doesn't apply, correcting a wrong forward move, etc.). For normal advancement, use **Move forward** instead.

**See also:** How do I move a service forward?, What are the service stages?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I move a service forward through its workflow?$kbseed$,
    'howto',
    $kbseed$**Where:** Service detail page (`/admin/services/[id]`) → right rail → "Status Change" card

**Steps:**
1. Find the **Status Change** card in the right rail.
2. Check the current stage indicator below the badge.
3. Click **Move forward**. The button advances along the standard forward chain (e.g. Start → KYC Collection → Review → Substance → Approval → Closed). <!-- VERIFY -->
4. Confirm in any prompts that appear. The change is audit-logged.

**Permission:** Move forward needs `change_status` AND `approve_status_change`. If you only have `change_status`, the button is visible but greyed out with a "Awaiting approver" tooltip — ask a Manager or Super User to commit the transition.

**See also:** How do I override a stage?, What are the service stages?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I rename a client account?$kbseed$,
    'howto',
    $kbseed$**Where:** Client detail page (`/admin/clients/[id]`) → top of the page → Account name field

**Steps:**
1. Open the client page (`/admin/clients` → click the row).
2. At the top, the company name is shown as an editable field (the **Account name** input).
3. Type the new name.
4. Click **Save** (or hit Enter — depends on the input wiring). <!-- VERIFY -->

The change writes to `clients.company_name` and is audit-logged. All admin lists, queue rows, breadcrumbs, and email templates pick up the new name on next page load.

**See also:** Where do I find a client?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I resend an invite email?$kbseed$,
    'howto',
    $kbseed$**Where:** Service detail page (for KYC invites) or client detail page (for client portal invites)

**For a KYC invite (profile-level):**
1. Service detail page → scroll to the profile that hasn't started.
2. Click **Resend invite** on the profile card. A new magic-link is generated and emailed; the old one is invalidated.

**For a client portal invite (account-level):**
1. Client detail page (`/admin/clients/[id]`).
2. Find the **Send invite** or **Resend invite** button. Same magic-link mechanic but scoped to portal access. <!-- VERIFY -->

**Tip:** Magic links expire in 24 hours, so a resend isn't usually needed unless the recipient missed the window.

**See also:** How do I send a KYC invite?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I invite a new admin user?$kbseed$,
    'howto',
    $kbseed$**Where:** `/admin/settings/admins`

**Steps:**
1. Open Settings → Admins (only visible if your role has `admin_mgmt_access` — Super User by default).
2. Click **+ Invite admin**.
3. In the modal: enter the new admin's full name, email, and pick a role (Super User / Manager / Officer / Junior Officer / Auditor).
4. Click **Send Invite**. The new admin gets a magic-link email; they land on `/auth/set-password`, choose a password, then can log in to the admin portal with the permissions of their assigned role.

**Permission:** Inviting admins requires `admin_mgmt_access` — by default, only Super User has it.

**See also:** How do I change an admin's role?, What can each role do?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I edit the permissions on a role?$kbseed$,
    'howto',
    $kbseed$**Where:** `/admin/settings/admins` → Roles section (below the admins list)

**Steps:**
1. Open Settings → Admins.
2. Scroll past the admins list to the **Roles** section. You'll see one collapsible card per role (Super User / Manager / Officer / Junior Officer / Auditor).
3. Click a role card to expand it.
4. Toggle any of the 10 permission flags (settings access, admin mgmt, data access, change status, approve status change, send communications, destructive actions, view audit log, export data, can review).
5. The change saves immediately and applies to every admin currently in that role. It's audit-logged.

**Caveat:** `admin_mgmt_access` on the **Super User** role itself cannot be turned off — otherwise everyone would be locked out of admin management.

**See also:** What can each role do?, How do I change an admin's role?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I delete (soft-delete) a client or service?$kbseed$,
    'howto',
    $kbseed$**Where:** Client detail page (for a client) or service detail page (for a service)

**Steps (client):**
1. Open the client page (`/admin/clients/[id]`).
2. Find the **Delete client** button (usually at the bottom of the page or in a kebab menu).
3. Confirm in the dialog — soft-delete sets `is_deleted = true` so the row isn't permanently removed; it just disappears from active lists.

**Steps (service):** similar pattern — `is_deleted` flag on the service.

**Permission:** Requires `destructive_actions` — Super User only by default.

**Recovery:** Soft-deleted rows can be un-deleted by an admin with database access (no UI affordance yet — would be a future feature).

**See also:** Why is a deleted client gone from the queue?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I export the audit trail to CSV?$kbseed$,
    'howto',
    $kbseed$**Where:** Service detail page (`/admin/services/[id]`) → right rail → "Audit Trail" card

**Steps:**
1. Open the service detail page and find the **Audit Trail** card in the right rail.
2. Optionally filter first (by actor, action type, or date-range preset) so the export only contains rows you care about.
3. Click the **Export CSV** button at the top-right of the card.
4. A CSV file downloads with one row per audit event — actor name, action, entity, previous value, new value, timestamp.

**Permission:** Requires `export_data`. Super User, Manager, and Auditor have it by default; Officer and Junior Officer do not.

**Use case:** Hand the CSV to external compliance auditors or attach it to regulatory submissions.

**See also:** Where do I find the audit trail?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I generate the substance review PDF?$kbseed$,
    'howto',
    $kbseed$**Where:** Service detail page (`/admin/services/[id]`) → Substance Review section <!-- VERIFY: confirm the exact export trigger location -->

**Steps:**
1. Complete the substance review form (FSC §3.2 mandatory criteria, §3.3 at-least-one criteria with evidence, §3.4 fallback).
2. Set the admin assessment (Pass / Review / Fail) and notes.
3. Click **Generate PDF** (or similar) — the system renders the substance assessment as a regulator-ready PDF.
4. The PDF link is stored on `service_substance.generated_pdf_id` and is downloadable from the same section.

**Note:** PDF regeneration is idempotent — clicking Generate again overwrites the previous version.

**See also:** What is substance review?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I update a milestone date (LoE / Invoice / Payment)?$kbseed$,
    'howto',
    $kbseed$**Where:** Service detail page (`/admin/services/[id]`) → right rail → "Milestones" card

**Steps:**
1. Find the **Milestones** card in the right rail (shows three cells: Letter of Engagement, Invoice, Payment Received).
2. Click the cell for the milestone you want to update.
3. A popover opens — pick a date from the calendar (or clear it to un-set the milestone).
4. Close the popover. The change is saved immediately and shows on the card with the new date.

**Tip:** The milestone year always displays (e.g. "12 May 2026") — even if it's the current year — so you can tell at a glance which cycle the milestone belongs to.

**See also:** What is the Letter of Engagement?, What does a Payment Received milestone affect?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I create a new service for a client?$kbseed$,
    'howto',
    $kbseed$**Where:** `/admin/clients/[id]/apply` (or the equivalent "New service" affordance on the client detail page) <!-- VERIFY: confirm the entry point -->

**Steps:**
1. Open the client you want to create a service for.
2. Click **Apply for service** (or similar).
3. Pick a service template from the list (Global Business Company, Authorised Company, Trust / Foundation, Bank Account Opening, Relocation, etc.).
4. The new service is created with a fresh service number (prefix matches the template, e.g. `GBC-0042`).
5. You land on the new service's detail page. From here, add Directors / Shareholders / UBOs, send KYC invites, and progress through the workflow.

**Tip:** The service number is auto-generated and unique — you don't pick it.

**See also:** What is a service template?, What does the service number prefix mean?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$Where do I find the queue?$kbseed$,
    'nav',
    $kbseed$**Path:** Top admin nav → "Queue" (or `/admin/queue` directly)

**On the queue page you can:** see every service currently in an actionable state (pending review, awaiting documents, awaiting approval, etc.); filter by stage, due-diligence level, or actor; click a row to jump to the service detail page.

**See also:** Where do I find the clients list?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$Where do I find the clients list?$kbseed$,
    'nav',
    $kbseed$**Path:** Top admin nav → "Clients" (or `/admin/clients`)

**On the clients page you can:** see every client (company) in the system with their primary contact, current status, and account manager; search by name or email; click a row to open the client detail page.

**See also:** Where do I find a single service?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$Where do I see a service's full history?$kbseed$,
    'nav',
    $kbseed$**Path:** Service detail page (`/admin/services/[id]`) → right rail → "Audit Trail" card

**On the Audit Trail card you can:** see every change to the service in chronological order — status transitions, document uploads, section reviews, substance assessments, KYC field edits, milestone updates. Filter by actor, action type, or date-range preset. Export to CSV if your role has `export_data`.

**See also:** How do I export the audit trail?, What's logged in the audit trail?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$Where do I configure service templates?$kbseed$,
    'nav',
    $kbseed$**Path:** Top admin nav → Settings → Templates (`/admin/settings/templates`)

**On the templates page you can:** create / edit / delete service templates that define what fields, documents, and stages a service of that type has. Adding a new template here lets you offer a new service type (e.g. a new offshore vehicle, a new banking product) without code changes.

**Permission:** Requires `settings_access`. Super User only by default.

**See also:** What is a service template?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$Where do I edit the AI verification rules?$kbseed$,
    'nav',
    $kbseed$**Path:** Top admin nav → Settings → AI Rules (`/admin/settings/rules`)

**On the AI Rules page you can:** edit the JSON definitions that the AI uses when verifying uploaded documents — things like which fields to extract from a Certificate of Incorporation, what jurisdictions count as "high risk", which document types are required for which service. Changes apply to the next document verification run.

**Permission:** Requires `settings_access`. Super User only by default.

**See also:** What is AI document verification?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$Where do I see the audit log for a single service?$kbseed$,
    'nav',
    $kbseed$**Path:** Service detail page → right rail → "Audit Trail" card

Same as the "Where do I see a service's full history?" entry — the Audit Trail card is the per-service view. There isn't a global audit log page yet (every change is filtered to its service automatically).

**See also:** Where do I see a service's full history?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$Where do I manage knowledge base entries (this chatbot)?$kbseed$,
    'nav',
    $kbseed$**Path:** Top admin nav → Settings → Knowledge Base (`/admin/settings/knowledge-base`)

**On the Knowledge Base page you can:** create / edit / delete entries that power both this chatbot AND the AI document verification's regulatory context. Filter by category (`howto`, `nav`, `glossary`) and toggle entries active/inactive without deleting them.

**Permission:** Requires `settings_access`.

**Tip:** Each entry has an `applies_to` JSON field — set `{"audience": "admin"}` or `{"audience": "client"}` to control which chatbot surfaces the entry. `{"audience": "both"}` shows in both.

**See also:** How do I edit a chatbot entry?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$Where do I invite or manage other admin users?$kbseed$,
    'nav',
    $kbseed$**Path:** Top admin nav → Settings → Admins (`/admin/settings/admins`)

**On the Admins page you can:** see every admin user and their assigned role; invite new admins via magic-link email; change roles; remove admins; edit the permission flags on each of the five roles.

**Permission:** Requires `admin_mgmt_access`. Super User only by default.

**See also:** How do I invite a new admin?, How do I edit role permissions?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I upload a document?$kbseed$,
    'howto',
    $kbseed$**Where:** Wizard step 2 (Documents) when applying, or the per-application Documents tab afterward

**Steps:**
1. On your application's documents view, find the document type you need to upload (e.g. "Certificate of Incorporation", "Proof of Address").
2. Click the **Upload** button or drag a file onto the drop zone.
3. Pick the file from your computer (or take a photo on mobile — there's a separate camera button).
4. Wait for the upload + AI verification to finish (usually 5–15 seconds). The status badge updates from "Uploading" → "Reviewing" → "Verified" or "Flagged".
5. If flagged, click the document to see what the system noticed and follow the fix instructions.

**Supported:** PDF, JPG, PNG. Max file size is around 10 MB. <!-- VERIFY exact limit -->

**See also:** What do I do if a document is flagged?$kbseed$,
    jsonb_build_object('audience', 'client'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I take a photo of a document on my phone?$kbseed$,
    'howto',
    $kbseed$**Where:** Documents step on the client wizard, on a mobile browser

**Steps:**
1. Open your application's documents view on your phone.
2. Tap the **Take photo** button on the document type you want to upload.
3. Your phone's camera opens — take a photo of the document (passport, utility bill, etc.).
4. Confirm the photo. The system uploads it and starts AI verification.

**Tips:**
- Good light, flat surface, no glare.
- All four corners of the document should be visible.
- For passports, just the photo page — not the cover.

**See also:** How do I upload a document?, What do I do if a document is flagged?$kbseed$,
    jsonb_build_object('audience', 'client'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I check my application status?$kbseed$,
    'howto',
    $kbseed$**Where:** `/dashboard` (your client home page) or the specific application's page (`/applications/[id]`)

**On the dashboard you can:** see every application you have with the current stage (KYC collection, in review, approved, etc.), the percentage complete, and what's currently waiting on you.

**On a single application's page you can:** see a step-by-step timeline of where you are in the process, what documents are still missing, and any flagged items that need your attention.

**See also:** What does each application status mean?$kbseed$,
    jsonb_build_object('audience', 'client'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I give a co-owner access to my account?$kbseed$,
    'howto',
    $kbseed$**Where:** Account settings page (or the equivalent affordance in your portal) <!-- VERIFY: client-side "add co-owner" UI may not exist yet — confirm before publishing -->

If your client portal supports it, you can invite another person to share the same account (so two directors of the same company can both manage applications). Contact your account manager at GWMS if you don't see the "Invite team member" option — they can add the second user from the admin side.

**See also:** How do I update my contact details?$kbseed$,
    jsonb_build_object('audience', 'client'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I download a document I uploaded?$kbseed$,
    'howto',
    $kbseed$**Where:** Application documents view (`/applications/[id]/files` or the Documents tab)

**Steps:**
1. Open the application that contains the document.
2. Click the document name or the download icon next to it.
3. The file downloads in its original format (PDF, JPG, etc.).

**Tip:** If you replaced a document with a newer version, only the latest is shown. Older versions are kept in the audit trail and can be retrieved by your account manager if needed.

**See also:** How do I replace an uploaded document?$kbseed$,
    jsonb_build_object('audience', 'client'),
    'b128_seed',
    true
  ),
  (
    $kbseed$A document I uploaded was flagged — what do I do?$kbseed$,
    'howto',
    $kbseed$**Where:** Application documents view → the flagged document

**Steps:**
1. Click the flagged document to open its detail view.
2. Read the **Reason for flag** at the top — typical reasons: the name on the document doesn't match the applicant, the document is expired, the photo is too blurry, an expected field is missing.
3. Fix what's needed (find a clearer scan, get a fresh dated document, etc.) and click **Replace** to upload a new file.
4. The new upload re-runs AI verification. If it passes, the flag clears automatically.

**If you can't fix it:** contact your account manager at GWMS — they can override the flag if there's a legitimate reason (e.g. the document is correct but the AI misread it).

**See also:** How do I upload a document?$kbseed$,
    jsonb_build_object('audience', 'client'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I see which documents are still missing?$kbseed$,
    'howto',
    $kbseed$**Where:** Application documents view (`/applications/[id]/files` or the Documents tab)

The documents view shows every document required for your application, with a status badge:
- **Required** (red dot) — needs an upload
- **Submitted** (yellow dot) — uploaded but still under review
- **Verified** (green check) — passed AI verification + admin review
- **Flagged** (orange triangle) — needs your attention; click to see why

The status panel on your application home page shows a count of remaining required documents.

**See also:** What do the document status badges mean?$kbseed$,
    jsonb_build_object('audience', 'client'),
    'b128_seed',
    true
  ),
  (
    $kbseed$How do I update my contact details after I submitted?$kbseed$,
    'howto',
    $kbseed$**Where:** Account settings → Personal details (or the equivalent in your portal) <!-- VERIFY -->

You can update your full name, phone number, and any other personal details on your profile at any time, even after submitting an application. The change shows immediately in the admin queue, so your account manager always sees the latest info.

**For email address changes:** contact your account manager — email is your login identifier and can't be changed self-serve.

**See also:** How do I check my application status?$kbseed$,
    jsonb_build_object('audience', 'client'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What is substance review?$kbseed$,
    'glossary',
    $kbseed$A per-service compliance assessment under FSC §3.2/§3.3/§3.4 (Mauritius Financial Services Commission). It confirms the entity has economic substance in Mauritius — i.e. real activity, not just a paper presence.

**Section 3.2** lists 6 mandatory criteria the entity must satisfy:
- 2+ Mauritius-resident directors
- Principal bank account in Mauritius
- Accounting records kept in Mauritius
- Audited in Mauritius
- Board meetings with Mauritius quorum
- (For CIS) Administered from Mauritius

**Section 3.3** is "at least one of" a list of activity-presence criteria, each with required evidence (office premises, full-time MU employee, MU arbitration clause, assets ≥ USD 100k in MU, listed on MU exchange, reasonable MU expenditure).

**Section 3.4** is a fallback: substance can be inherited from a related corporation that itself satisfies §3.3.

Admins set the assessment: **Pass** (meets), **Review** (needs more info), **Fail** (doesn't meet). A PDF is generated for regulatory submission.

**Where it lives:** Service detail page → Substance Review section.$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What is a UBO?$kbseed$,
    'glossary',
    $kbseed$**UBO** = **Ultimate Beneficial Owner**. The natural person (or persons) who ultimately owns or controls the entity, even through layers of holding companies.

For KYC purposes, GWMS captures UBO information for every entity being onboarded. Each UBO is added as a `client_profiles` row attached to the service via `profile_service_roles` with `role = 'ubo'`. UBOs go through the same KYC long-form questionnaire as Directors and Shareholders.

**Typical threshold:** any natural person owning ≥ 25% of the entity (directly or indirectly) is a UBO. <!-- VERIFY: confirm GWMS uses 25% -->

**See also:** How do I add a UBO?, What is the KYC long form?$kbseed$,
    jsonb_build_object('audience', 'both'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What does the RAG status (red / amber / green) mean?$kbseed$,
    'glossary',
    $kbseed$**RAG** = **Red / Amber / Green** — a traffic-light indicator of completion or risk.

In GWMS, each section card on a service page shows a RAG dot based on completion percentage:
- **Green** — section is complete (≥ 90% of fields filled and verified) <!-- VERIFY exact thresholds -->
- **Amber** — section is in progress
- **Red** — section has missing required fields or unresolved flags

Used across Company Setup, Financial, Banking, People & KYC, and Documents to give admins an at-a-glance read on what's blocking a service.

**See also:** How do I see what's blocking a service?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What is the KYC long form?$kbseed$,
    'glossary',
    $kbseed$The full **Know Your Customer** questionnaire each profile (Director / Shareholder / UBO) fills in. Covers four sections:
- **Identity** — full name, date of birth, nationality, passport / national ID number
- **Financial** — source of funds, source of wealth, expected transaction patterns
- **Compliance** — PEP status, sanctions exposure, regulatory history
- **Tax** — tax residence, tax identification numbers

The form is sent via a magic-link KYC invite. The recipient lands on `/kyc/fill/[token]` and can save progress across multiple sessions. Admins review the submitted data and either mark each section as reviewed or flag specific fields.

**See also:** How do I send a KYC invite?, What is a section review?$kbseed$,
    jsonb_build_object('audience', 'both'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What is a section review?$kbseed$,
    'glossary',
    $kbseed$A formal admin sign-off on one of the service's content sections (Company Setup, Financial, Banking, People & KYC, or Documents). Marking a section as reviewed records the reviewer's name + timestamp on `application_section_reviews`, contributes to the service's readiness, and unlocks downstream stages.

**Reviewer ≠ approver.** Section review is the per-section sign-off; service status advancement (Move forward / Override) is a separate workflow on the right-rail Status Change card. A Manager might section-review then approve in one sitting, but they're separate actions.

Requires the `can_review` permission.

**See also:** How do I mark a section as reviewed?, How do I request a peer review?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What is a Reference form?$kbseed$,
    'glossary',
    $kbseed$A formal reference letter or attestation from a third party (bank, accountant, lawyer, another regulated entity) vouching for the applicant. GWMS requests reference forms as part of the standard KYC package for higher-risk service types or when the applicant has no other supporting evidence.

**In the UI:** Reference forms appear as a tabular list on the service detail page (introduced B-124) — each row has a status (Requested / Submitted / Verified) and a Replace/View action. <!-- VERIFY exact UI -->

**See also:** How do I request a reference?, What documents count as a reference?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What's the difference between GBC, AC, and a Domestic Company?$kbseed$,
    'glossary',
    $kbseed$Three offshore-licensing flavors GWMS handles in Mauritius:

- **GBC (Global Business Company)** — the original Mauritius offshore vehicle. Resident for tax purposes, eligible for treaty network. Higher substance requirements (FSC §3.2). Service-number prefix: `GBC-`.
- **AC (Authorised Company)** — newer category for genuinely non-resident entities. Tax-transparent. Lower substance requirements than GBC. Prefix: `AC-`.
- **Domestic Company** — onshore Mauritius company. Different regulator (Companies Division of the Corporate and Business Registration Department), not FSC. Used when the entity actually does business in Mauritius. Prefix: `DC-`.

Other prefixes: `TFF-` (Trust / Foundation), `RLM-` (Relocation), `BAO-` (Bank Account Opening), `SVC-` (generic / other).

**See also:** What does the service number prefix mean?$kbseed$,
    jsonb_build_object('audience', 'both'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What does the service number prefix mean?$kbseed$,
    'glossary',
    $kbseed$Every service gets an auto-generated service number on creation, formatted `<PREFIX>-<NNNN>` (e.g. `GBC-0042`). The prefix is derived from the service template name:

| Prefix | Service type |
|---|---|
| `GBC-` | Global Business Company |
| `AC-` | Authorised Company |
| `DC-` | Domestic Company |
| `TFF-` | Trust or Foundation |
| `RLM-` | Relocation |
| `BAO-` | Bank Account Opening |
| `SVC-` | Other / generic |

The 4-digit number is sequential per prefix — so the 42nd GBC service in the system is `GBC-0042`. Numbers never reset.

**See also:** How do I create a new service?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What is the Letter of Engagement (LoE)?$kbseed$,
    'glossary',
    $kbseed$The formal contract between the client and GWMS defining the scope of services, fees, and terms of engagement. It's the first milestone in any service — once signed by the client and counter-signed by GWMS, the engagement is officially active.

**In the UI:** The Milestones card on the right rail of the service page shows the LoE date. Admins mark "LoE received" + the date when the signed copy comes back from the client.

**See also:** How do I update a milestone date?$kbseed$,
    jsonb_build_object('audience', 'both'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What is the Due Diligence level?$kbseed$,
    'glossary',
    $kbseed$A risk-tier label GWMS assigns to a client based on jurisdiction, source of funds, PEP status, sanctions exposure, and other factors. Common levels: **Simplified** (low risk), **Standard** (default), **Enhanced** (high risk — additional checks + ongoing monitoring). <!-- VERIFY GWMS-specific naming -->

The DD level dictates which documents are required, how often the client is re-screened, and what level of management sign-off is needed.

**Where it lives:** Client detail page → top section. Editable by admins with `data_access = edit`.

**See also:** What is the Risk score?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What is the Risk score?$kbseed$,
    'glossary',
    $kbseed$A numeric or categorical assessment of the client's overall risk profile. Combines factors like jurisdiction risk, PEP status, sanctions matches, complexity of ownership structure, and industry. Drives the Due Diligence level. <!-- VERIFY: confirm GWMS has a discrete "risk score" vs only "due diligence level" -->

**See also:** What is the Due Diligence level?$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  ),
  (
    $kbseed$What is a "tenant"?$kbseed$,
    'glossary',
    $kbseed$A multi-tenancy concept in the data model — every row in the database carries a `tenant_id` so the system could one day host multiple isolated organizations on the same platform. Today GWMS is single-tenant (one tenant ID hard-coded as the default), but the column is everywhere so a future SaaS rollout doesn't need a schema migration.

For now, you'll never see `tenant_id` in any UI — it's invisible to admins and clients alike. It only matters if/when GWMS opens the platform to other licensed management companies.

**See also:** (See tech debt #1 in `CHANGES.md` for the cleanup needed before multi-tenancy ships.)$kbseed$,
    jsonb_build_object('audience', 'admin'),
    'b128_seed',
    true
  )
ON CONFLICT (title) DO NOTHING;
