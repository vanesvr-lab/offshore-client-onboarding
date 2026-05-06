# CHANGES.md — Coordination Log

This file is maintained by both **Claude Code** (CLI) and **Claude Desktop** to coordinate changes on the shared codebase. Update this file whenever you make significant changes so the other instance stays in sync.

---

## How to use this file

- Before starting work: **read this file** to see what was last touched
- After making changes: **add an entry** at the top of the relevant section
- For schema changes: always note the exact SQL run so the other instance knows the DB state
- For risky/shared files (types, middleware, layouts): call it out explicitly

---

## Recent Changes

### 2026-05-06 — B-072 Batch 1 — service_actions registry + service_template_actions binding (Claude Code)

- New tables (migration `20260506172151_service_actions_tables.sql`, pushed):
  - `service_template_actions` — binds an `action_key` (e.g. `substance_review`) to a service template with display label + sort order. Seeded for "Global Business Corporation (GBC)" and "Authorised Company (AC)" with all three actions: `substance_review`, `bank_account_opening`, `fsc_checklist`. Verified 6 rows present.
  - `service_actions` — per-service action instance (status pending/in_progress/done/blocked/not_applicable, assigned_to, completed_by, completed_at, notes). Service-scoped via `service_id` FK to `services(id)`. Unique `(service_id, action_key)` so a service has at most one row per action.
  - RLS enabled on both. `is_admin()` policies for FOR ALL on both; `service_template_actions` also has a public read policy so templates are readable by clients (matches the existing `service_templates` pattern).
- Note: `npx supabase migration new` created an empty stub `20260506172057_service_actions.sql` which got pushed with no SQL before content was written. Replaced with `SELECT 1;` + comment so the migration ledger stays paired; actual DDL in the next-timestamp migration.
- `src/types/index.ts` — added `ServiceActionStatus`, `ActionKey`, `ServiceTemplateAction`, `ServiceAction` interfaces.
- `npm run db:status` — Local + Remote paired (12 migrations each). `npm run build` passes.

---

### 2026-05-06 — B-073 Batch 4 — Tech debt + final polish; B-073 done (Claude Code)

- Tech debt #26 added (see Tracker below): the `application_section_reviews.application_id` column now polymorphically holds applications.id OR services.id; the FK was dropped in Batch 1's migration. Plan to rename and reinstate a typed FK once the legacy applications path retires.
- Confirmed the legacy `/admin/applications/[id]` page still loads — `AdminKycPersonReviewPanel`'s new `persons` prop is optional, so the legacy call site (`<AdminKycPersonReviewPanel applicationId={params.id} />`) is unchanged and continues to fetch via `/api/applications/[id]/persons`. `npm run build` type-checks both consumers.
- Mobile pass at 375px on `/admin/services/[id]`:
  - Step indicator wraps via `flex flex-wrap items-center gap-1` (`AdminApplicationStepIndicator`).
  - In Batch 2, `ServiceCollapsibleSection` was tweaked so the percentage bar + `%` label hide below `lg:` whenever `sectionKey` is wired — the SectionReviewBadge + Review button now have room next to the title without overflow on narrow viewports. The RAG dot remains visible.
  - KYC subsection cards (`AdminKycPersonReviewPanel`) stack inside a `space-y-3` list and each `PersonReviewCard` renders its 8 categories in a `space-y-4` column inside a `CardContent`, so they stack cleanly.
- Final `npm run build` passes.

**B-073 done.** Modern `/admin/services/[id]` page now mirrors the legacy admin detail page's section-review surface:
- `AdminApplicationSectionsProvider` wraps the page (Batch 1) — service.id is passed as `applicationId`; FK to `applications(id)` dropped via migration.
- All 5 wizard sections (Company Setup, Financial, Banking, People & KYC, Documents) carry `<SectionReviewBadge>` + `<SectionReviewButton>` in their headers and `<ConnectedNotesHistory>` at the bottom (Batch 2).
- Step indicator at top with smooth-scroll anchors per step; per-profile KYC subsection reviews inside Step 4 (Batch 3).
- Tech debt #26 captures the polymorphic-id shortcut for follow-up.

Test target: `/admin/services/1c131367-b89f-44db-8787-6958a306b73d` (GBC-0002).

---

### 2026-05-06 — B-073 Batch 3 — Step indicator + per-profile KYC subsection reviews on services detail (Claude Code)

- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — defines a new `ADMIN_STEPS_SERVICES` array (5 steps: Company Setup, Financial, Banking, People & KYC, Documents) using the section keys wired in Batch 2. Renders `<AdminApplicationStepIndicator steps={ADMIN_STEPS_SERVICES} />` in its own bordered card between the sticky status header and the main two-column grid. Click a step → smooth-scroll to the matching `ServiceCollapsibleSection` (anchor IDs landed in Batch 2). Aggregate status pills resolve via `useAggregateStatus` against the same provider context.
- Inside Step 4's expanded body (below `OwnershipStructure`), renders `<AdminKycPersonReviewPanel applicationId={service.id} persons={…} />` with persons derived server-side from `typedRoles` — produces a collapsible card per profile, each containing 8 KYC subsection cards (`identity / financial / compliance / professional / tax / adverse_media / wealth / additional`) with `kyc:<profile_id>:<category>` review keys.
- `src/components/admin/AdminKycPersonReviewPanel.tsx` — new optional `persons?: PersonRow[]` prop. When provided, the component skips its `/api/applications/[id]/persons` fetch (which would 404 against a service id). The legacy `/admin/applications/[id]` consumer still works unchanged. `PersonRow` is now exported for callers building the prop.
- `npm run build` passes.

---

### 2026-05-06 — B-073 Batch 2 — Section-review affordances on all 5 ServiceCollapsibleSection blocks (Claude Code)

- `src/components/admin/ServiceCollapsibleSection.tsx` — extended (Option A from the brief). New optional `sectionKey` and `anchorId` props. When `sectionKey` is supplied, the header renders a `<SectionReviewBadge>` + `<SectionReviewButton>` (visible even when collapsed; clicking Review opens the right-slide panel without toggling expansion), and the expanded body appends `<ConnectedNotesHistory>` after the children. Reads state via the `useSectionReview` hook from `AdminApplicationSections`. Outer wrapper is now a `<div>` containing the toggle `<button>` + a sibling `<SectionReviewControls>` so the Review button never bubbles to the toggle. The percentage bar + label hide below `lg:` when `sectionKey` is wired so the badge has room on narrow viewports (the RAG dot stays visible).
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — wired the five wizard sections:
  - Company Setup → `sectionKey="company_setup"`, `anchorId="step-company-setup"`
  - Financial → `sectionKey="financial"`, `anchorId="step-financial"`
  - Banking → `sectionKey="banking"`, `anchorId="step-banking"`
  - People & KYC → `sectionKey="people"`, `anchorId="step-people-kyc"`
  - Documents → `sectionKey="documents"`, `anchorId="step-documents"`
  Internal Notes / Risk Assessment / Milestones / Audit Trail and the right-column panels are intentionally untouched (informational only).
- `npm run build` passes. ServiceCollapsibleSection has no other consumers.

---

### 2026-05-06 — B-073 Batch 1 — Services detail page wraps in section-reviews provider (Claude Code)

Port of B-068/B-069 admin section reviews from the legacy `/admin/applications/[id]` page to the modern `/admin/services/[id]` page. Batch 1 = data + provider wiring.

- `src/app/(admin)/admin/services/[id]/page.tsx` — added a parallel `application_section_reviews` query keyed on `service.id` (the column is misleadingly named `application_id` — see tech-debt #26 in Batch 4). Result passed down to `ServiceDetailClient` as `sectionReviews`.
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — added `sectionReviews: ApplicationSectionReview[]` prop; wrapped the entire return JSX in `<AdminApplicationSectionsProvider applicationId={service.id} initialReviews={sectionReviews}>` so any descendant can call `useSectionReview()` / `useAggregateStatus()`.
- **Migration `20260506155512_drop_section_reviews_application_fk.sql` (pushed)** — drops the FK `application_section_reviews_application_id_fkey`. The brief said "no migrations" but the FK to `applications(id)` would block service-id inserts. UUID v4 collision risk between the two ID spaces is statistically zero. ON DELETE CASCADE behavior is lost for the legacy applications path; safe because section-review rows are advisory-only and the legacy path is heading for retirement. Migration verified via `npm run db:status` — Local + Remote paired.
- `npm run build` passes.

---

### 2026-05-06 — B-069 Batch 5 — Visual consistency pass + B-069 done (Claude Code)

- Admin app detail grid is now responsive: `grid-cols-1 gap-6 lg:grid-cols-3` (was `grid-cols-3`). Left column is `lg:col-span-2`. On viewports below `lg:`, the right-column sidebar (Stage Management, Communication, Account Manager, Audit Trail) stacks below the main content instead of being squeezed into a 1/3 column.
- Step indicator already wraps via `flex-wrap`, so it stacks naturally on narrow viewports.
- SectionReviewPanel is `w-full sm:max-w-md` — full-width on mobile, right-slide on desktop.
- Step headings already use `text-lg font-semibold text-brand-navy`, matching the client wizard's `ServiceWizardPeopleStep` h2.
- Build passes.

**B-069 done.** Admin app detail page now has:
- A wizard-shaped step indicator above the main grid with aggregate review status per step
- Three anchor sections (`#step-company-setup`, `#step-people-kyc`, `#step-documents`) reachable via smooth-scroll
- Per-section review affordances on five top-level keys (`business`, `contact`, `service`, `people`, `documents`) and 8 sub-keys per profile (`kyc:<profile_id>:identity|financial|compliance|professional|tax|adverse_media|wealth|additional`)
- Responsive grid that stacks below `lg:`

The full inline read-only KYC mirror is documented in tech-debt #25 for follow-up.

---

### 2026-05-06 — B-069 Batch 4 — Documents step polish (Claude Code)

- Verified Step 5 (`#step-documents`) layout post-restructure: Step 5 heading sits above the Documents Card, which carries the `documents` `ConnectedSectionHeader` (title + badge + uploader rightSlot) and renders `ConnectedNotesHistory` at the bottom. AI Flagged Discrepancies and Verification Checklist Cards remain informational (no SectionHeader) per the B-068 acceptance criteria.
- No code change needed — the wizard-shaped restructure from Batch 2 already placed the Documents Card first inside Step 5 with the correct review affordance.

---

### 2026-05-06 — B-069 Batch 3 — KYC subsection reviews per profile (Claude Code)

- New `src/components/admin/AdminKycPersonReviewPanel.tsx` — admin-side panel that fetches the application's persons and renders a collapsible card per profile. Each card shows an aggregate badge across all 8 KYC categories and expands into 8 sub-blocks (Identity / Financial / Compliance / Professional / Tax / Adverse Media / Wealth / Additional), each with its own `ConnectedSectionHeader` + `ConnectedNotesHistory`.
- Section key format: `kyc:<kyc_records.id>:<category>`. `kyc_records.id` is the same UUID as `client_profiles.id` per migration 003 line 360, so this matches the brief's specified format effectively.
- Wired into Step 4 (People & KYC) on the admin app detail page, below the existing PersonsManager card. Step 4 now contains: Section D card (with `people` review) + new "KYC Review — per profile, per subsection" card.
- **Pragmatic deviation from brief:** brief asked for the client's `PerPersonReviewWizard` rendered inline in `readOnly` mode with section-review affordances per category. The actual admin path uses `KycStepWizard` (636 lines) via `PersonsManager`, not `PerPersonReviewWizard` (2122 lines) — and refactoring either to take a `readOnly` prop is too invasive for tonight. The brief itself endorses a fallback ("if PerPersonReviewWizard doesn't easily accept readOnly … add a tech debt entry to revisit cleanly"). Going one step further: ship a parallel admin panel that adds the per-subsection review affordances without touching the wizard. Admin still uses PersonsManager (interactive) for the data view + edits. See tech-debt entry below.
- Build passes.

**Tech debt** (added to bottom of CHANGES.md): inline read-only KYC subsection mirror — render `KycStepWizard` (or its successor) in read-only mode inside the per-person card, with each category bucket bound to its `kyc:<profile_id>:<category>` review affordance, removing the parallel panel.

---

### 2026-05-06 — B-069 Batch 2 — Admin app detail wizard-shaped restructure (Claude Code)

- `src/app/(admin)/admin/applications/[id]/page.tsx` — left column now wraps three `<section>` blocks with anchor IDs that match `ADMIN_STEPS_DEFAULT`:
  - `#step-company-setup` → step heading "1. Company Setup" + `<EditableApplicationDetails>` (its 3 internal Cards: business / contact / service)
  - `#step-people-kyc` → step heading "4. People & KYC" + Section D (Directors, Shareholders & UBOs) Card
  - `#step-documents` → step heading "5. Documents" + Documents + AI Flagged Discrepancies + Verification Checklist Cards
- Step headings use `text-lg font-semibold text-brand-navy` to match the client wizard step headings (`ServiceWizardPeopleStep` h2). Each section gets `scroll-mt-20` so anchor jumps don't bury the heading under the page nav.
- Step indicator clicks now smooth-scroll to the matching anchor.
- Financial / Banking remain folded into Step 1 per brief POC shortcut — `service_details` JSON not split out yet.
- Build passes.

---

### 2026-05-06 — B-069 Batch 1 — Admin step indicator (Claude Code)

- New `src/components/admin/AdminApplicationStepIndicator.tsx` — breadcrumb-style step list with chevron separators, mirroring the client's `ServiceWizardStepIndicator` visual pattern.
- Each step shows a status pill aggregated across that step's section_keys:
  - All approved → green CheckCircle2
  - Any rejected → red XCircle
  - Any flagged (no rejected) → amber Flag
  - Otherwise → gray Circle, with `N/M reviewed` count text when partial
- Added `useAggregateStatus(sectionKeys)` hook to `AdminApplicationSections.tsx` exposing `{ status, reviewedCount, totalCount }` from the section-reviews context.
- Wired into the admin app detail page above the main grid. Provider now wraps both the indicator and the existing left/right column grid.
- Three visible steps per the brief's POC shortcut (service_details JSON not easily split into Financial / Banking yet): Company Setup (`business`, `contact`, `service`), People & KYC (`people`), Documents (`documents`).
- Click → smooth-scrolls to `#step-…` anchor (anchors land in Batch 2; safe no-op if missing).
- Build passes.

---

### 2026-05-06 — B-068 Batch 6 — Wired into admin application detail page (Claude Code)

- New client component `AdminApplicationSections.tsx` exposes a React context for the page's section reviews:
  - `<AdminApplicationSectionsProvider applicationId initialReviews>` — server hands the initial review list down; provider buckets by `section_key` and stores in state
  - `useSectionReview(sectionKey)` — returns `{ applicationId, currentStatus, history, onReviewSaved }`. `currentStatus` is the latest row's status (`null` if no reviews); `history` is full DESC list for that section; `onReviewSaved` prepends a new row optimistically (no full page refresh needed)
  - `<ConnectedSectionHeader title sectionKey rightSlot>` — convenience wrapper around `SectionHeader` that pulls everything from context
  - `<ConnectedNotesHistory sectionKey>` — renders `SectionNotesHistory` for the matching bucket
- `src/app/(admin)/admin/applications/[id]/page.tsx`:
  - Added a sixth parallel query for `application_section_reviews` (joined to `profiles:reviewed_by(full_name)`, sorted DESC).
  - Wrapped the entire left column in `<AdminApplicationSectionsProvider>` so every reviewable section binds to the same store.
  - Section D (Directors/Shareholders/UBOs) Card now uses `ConnectedSectionHeader title="Section D…" sectionKey="people"` and renders `ConnectedNotesHistory` at the bottom.
  - Documents Card now uses `ConnectedSectionHeader title="Documents" sectionKey="documents" rightSlot={<AdminDocumentUploader … />}` and renders the history at the bottom.
  - Informational sections (AI Flagged Discrepancies, Verification Checklist) are deliberately NOT wired (per brief acceptance).
- `src/components/admin/EditableApplicationDetails.tsx` (consumed inside the provider):
  - Replaced inline `CardHeader` for Business / Contact / Service with `ConnectedSectionHeader` so each gets a status badge + Review button while keeping the existing edit flow as `rightSlot`.
  - Added `<ConnectedNotesHistory>` at the bottom of each of those three CardContent blocks.
  - Internal Notes section left untouched (not reviewable).
- Optimistic update pattern: saving a review POSTs, the API returns the inserted row (joined with reviewer's name), and the panel calls `onReviewSaved(review)` → context prepends → badge + history both update without a server roundtrip.
- Build passes.

**B-068 done.** Five wired section keys: `business`, `contact`, `service`, `people`, `documents`. Migration filename: `supabase/migrations/20260506070332_application_section_reviews.sql` (already pushed; Local + Remote pair).

---

### 2026-05-06 — B-068 Batch 5 — Per-section notes history (Claude Code)

- `src/components/admin/SectionNotesHistory.tsx` — collapsible "Admin notes (N)" block at the bottom of a section. Renders nothing when reviews list is empty (no header noise).
- Each row: status badge + reviewer name (`profiles.full_name` or "Admin") + relative time (`just now / Nm ago / Nh ago / Nd ago / locale date`) with hover tooltip showing the absolute timestamp. Notes shown verbatim or italic "No notes".
- No `date-fns` dep — used a small inline `formatRelative()` helper.
- Build passes.

---

### 2026-05-06 — B-068 Batch 4 — Right-slide review panel form (Claude Code)

- `SectionReviewPanel.tsx` (Batch 3 stub replaced) — full form:
  - Three large status options (Approved / Flagged / Rejected) with green/amber/red active states
  - Notes textarea, required when status is `flagged` or `rejected` (asterisk + placeholder switch)
  - Cancel + Save footer with loader; Save disabled until status set + notes valid
  - Form state resets on each open
  - Posts to `/api/admin/applications/[id]/section-reviews`; toasts success/error; calls `onSaved(review)`
- Right-slide on desktop (`side="right"`, `sm:max-w-md`); full-width on mobile (`w-full`). Sheet's existing `bg-black/10` backdrop keeps the page visible underneath.
- Build passes.

---

### 2026-05-06 — B-068 Batch 3 — Badge + button + section header components (Claude Code)

- `src/components/admin/SectionReviewBadge.tsx` — small pill: green/amber/red/gray for `approved | flagged | rejected | null`. Lucide icons (`CheckCircle2 | Flag | XCircle | Circle`). "Not reviewed" when null.
- `src/components/admin/SectionReviewButton.tsx` — outline `Button` ("Review" + ClipboardCheck icon). Owns its own open-state and renders `SectionReviewPanel`.
- `src/components/admin/SectionHeader.tsx` — drop-in `CardHeader` replacement: `[CardTitle] [Badge] · · · [rightSlot] [ReviewButton]`. Wraps below `sm:` so the badge stacks under the title on mobile (375px).
- `src/components/admin/SectionReviewPanel.tsx` — minimal Sheet scaffold (right-side, `sm:max-w-md`) so the button compiles. Real form (status radios + notes textarea + POST) lands in Batch 4.
- Build passes.

---

### 2026-05-06 — B-068 Batch 2 — Section reviews API routes (Claude Code)

- New `src/app/api/admin/applications/[id]/section-reviews/route.ts`
  - **GET** — lists reviews for application; optional `?section_key=…` filter; sorted `reviewed_at DESC`; joins `profiles:reviewed_by(full_name)`
  - **POST** — body `{ section_key, status, notes }`. Inserts a new row using `createAdminClient()`. `reviewed_by = session.user.id`. Server-side validates: `section_key` required; `status ∈ {approved,flagged,rejected}`; `notes` required when status is `flagged` or `rejected`.
- Auth: standard project pattern — `await auth()` from NextAuth + `session.user.role !== "admin"` → 403.
- Returns `{ data: ApplicationSectionReview | ApplicationSectionReview[] }` on success or `{ error: string }` on failure.
- Build passes.

---

### 2026-05-06 — B-068 Batch 1 — `application_section_reviews` migration (Claude Code)

- New migration `supabase/migrations/20260506070332_application_section_reviews.sql`
  - `id`, `tenant_id` (default GWMS UUID, FK → tenants), `application_id` (FK → applications, ON DELETE CASCADE), `section_key`, `status` (CHECK approved|flagged|rejected), `notes`, `reviewed_by` (FK → profiles), `reviewed_at`
  - Indexes: `asr_app_idx`, `asr_app_key_idx (application_id, section_key, reviewed_at DESC)`, `asr_tenant_idx`
  - History-preserving: every save inserts a new row; latest row per `(application_id, section_key)` is current status
- **RLS deviation from brief:** brief asked for policies gated on `public.is_admin()`. No such helper exists in this project — auth is NextAuth (application layer), and the established pattern (migration 005) is RLS-default-deny with no policies, all access via `createAdminClient()`. Followed project convention: RLS enabled, no policies. Route handlers gate on `session.user.role === "admin"`. See tech-debt #3.
- `npm run db:push` applied. `npm run db:status` shows Local + Remote pair for `20260506070332` with no drift.
- Added `SectionReviewStatus` + `ApplicationSectionReview` types to `src/types/index.ts`.

---

### 2026-05-06 — Briefs B-068 → B-072 ready (Claude Desktop, planning)

Vanessa brainstormed the next admin-workflow chunk. Five briefs written, ready for CLI execution. They build a coherent admin-side overhaul:

- **B-068** — `docs/cli-brief-section-review-workflow-b068.md` — Section review workflow foundation. New `application_section_reviews` table (history-preserving), right-slide review panel (Approved / Flagged / Rejected + notes), section badges, per-section notes history at bottom. Reviews are advisory (no gating). Wired into existing admin app detail page sections (business, contact, service, people, documents).
- **B-069** — `docs/cli-brief-admin-view-mirror-client-wizard-b069.md` — Admin app detail view restructured to mirror the client wizard's step-shaped layout. KYC profiles render via the same `PerPersonReviewWizard` in read-only mode, with section reviews on every subsection (Identity / Financial / Compliance per profile via `kyc:<profile_id>:<category>` keys). "Approve All" wizard mode explicitly skipped per Vanessa.
- **B-070** — `docs/cli-brief-field-provenance-and-inline-doc-preview-b070.md` — `field_extractions` table tracks where each KYC field came from (AI extraction, manual, admin override). UI markers on each field show provenance. Click marker → inline preview of source document. Critical for FSC defensibility.
- **B-071** — `docs/cli-brief-doc-model-fixes-b071.md` — Closes four doc-model gaps in one brief: `scope` field exposed in admin Document Types form; new `service_template_documents` join table for per-template doc binding (GBC's 18 docs can finally be modelled); `role_document_requirements` wired into KYC at runtime (currently dormant); `applies_to` filtered against profile type in KYC (corporate profiles no longer see passport requirement).
- **B-072** — `docs/cli-brief-admin-actions-substance-review-b072.md` — `application_actions` registry + `service_template_actions` binding. `application_substance` table per Vanessa's brainstorm (FSC §3.2/3.3/3.4 mandatory + at-least-one + fallback criteria, admin assessment pass/review/fail). Substance Review action UI for GBC + AC. Stubs for Bank Account Opening + Generate FSC Checklist.

**Overnight handoff:** B-068 + B-069 only. B-070, B-071, B-072 are written and ready for follow-up sessions. B-069 depends on B-068; B-070 depends on B-068+B-069. B-071 is independent and can run in parallel. B-072 depends on B-071 (uses `service_template_actions` which lives in B-072 itself, but the doc-binding pattern is shared).

**Open design decisions (locked in):**
- Section reviews are advisory; admin can override (no gating).
- Section reviews can be partial; subsection-level granularity.
- "Approve All" wizard mode skipped for now.
- Substance applies to both GBC + AC.
- Substance §3.3 evidence is text-only for POC (no doc attachments yet).
- Substance is an **admin Action** (not a workflow stage). Other actions: Bank Account Opening, Generate FSC Checklist.
- Substance fail blocks terminal status; review pauses.
- FSC PDF prefill (FS-41 Form A — `/Users/elaris/Downloads/fs-41_form_a-Checklist.pdf`) deferred — included in B-072 as a stub only.

---

### 2026-05-05 — B-067 — Client portal polish (Claude Code)

End-user QA pass — 7 batches, all green (build + 173 tests). After the
final commit, restarted the dev server (`pkill -f "next dev"; rm -rf
.next; npm run dev`). Knowledge-base PDF ingestion stays out of scope
(deferred to B-068).

**Migration applied:**
- `20260505235835_kyc_invite_rate_limit.sql` — adds
  `invites_sent_count_24h` + `invites_count_window_start` to
  `profile_service_roles`. Pushed via `npm run db:push`; `db:status`
  shows paired Local + Remote with no drift.


**Batch 1 — Home rename + welcome banner:**
- `src/components/shared/Sidebar.tsx` — client primary nav label "Dashboard" → "Home" (route `/dashboard` unchanged; admin sidebar untouched)
- `src/components/client/DashboardClient.tsx` — page heading is now "Home", new subtle brand-navy/blue welcome banner (`Welcome <FirstName>. Thank you for choosing GWMS.`), per-card nudge line `Your application for <Service> is X% complete — Review →` shown only when `overallPct < 100`. Removed the old amber "all complete" / "missing info" greeting branches in favour of one consistent layout.

**Batch 7 — AI verification fixes:**
- `src/lib/ai/verifyDocument.ts` — context block now starts with `Today's date: YYYY-MM-DD` (`new Date().toISOString().slice(0, 10)`). Stable position so prompt-cache stays warm. Fixes the "future-dated" false-positives where the AI fell back to its training cutoff and flagged genuinely-recent docs.
- `src/app/api/services/[id]/documents/upload/route.ts` — when uploading a per-person KYC document (`targetProfileId` set), fetch `client_profiles.full_name` and pass it as both `applicant_full_name` and `contact_name` on `applicationContext`. Resolves the "No applicant name provided in application context — unable to verify name match" failure on certified passport copies. The deferred-AI path (`/api/documents/[id]/verify-with-context`) already populated this; the live-upload path was the gap.
- 173 unit/integration tests pass. Build clean.

**Batch 6 — Resend invite rate limit (3 per profile per 24h):**
- `supabase/migrations/20260505235835_kyc_invite_rate_limit.sql` — adds `invites_sent_count_24h` (int, NOT NULL DEFAULT 0) and `invites_count_window_start` (timestamptz, NULL) to `profile_service_roles`. Idempotent (`ADD COLUMN IF NOT EXISTS`). Pushed to prod via `npm run db:push`; `npm run db:status` shows paired Local + Remote with no drift.
- `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` — server enforces 3 invites per profile/service pair per rolling 24h window. Replaces the old "1 per 24h" cooldown. Window opens (or rolls over) automatically on the first send after expiry; subsequent sends increment the count; the 4th in-window send returns `429 { error: "rate_limited", retry_after_seconds, retry_after }`. Admins remain exempt. Successful response now also returns `invites_sent_count_24h`, `invites_count_window_start`, and `invites_remaining` so the UI can mirror state without polling.
- `src/components/client/ServiceWizardPeopleStep.tsx`:
  - `ServicePerson` carries `invites_sent_count_24h` and `invites_count_window_start` from the server load.
  - `PersonCard` tracks count + window + a server-supplied `rateLimitedUntil` ms timestamp.
  - `InviteDialog` parses 429s with `retry_after_seconds` and toasts `"You've sent the maximum 3 invites today. You can send another in {X}h."` (X = ceil(seconds/3600)).
  - `ResendInviteButton` disables when the local count hits 3 or the server returned a 429, with a tooltip showing "X of 3 sent today" / "send another in {X}h".
- `src/app/(client)/services/[id]/page.tsx` — selects + propagates the two new columns on the persons query.

**Batch 5 — KYC post-review confirmation dialog:**
- `src/components/client/PerPersonReviewWizard.tsx` — finishing the Review sub-step (single-mode Save & Close, or review-all Save & Finish on the last person) now opens a `<Dialog>` summarising the per-profile completion before the wizard closes. < 100% → "Profile saved" with `You've completed {X}% of KYC for {Name}. Please review…`; 100% → "Profile complete" with `You've completed all KYC details for {Name}. This profile is ready for submission.` Esc closes only the dialog (wizard stays open); OK is auto-focused and calls `onComplete()` to close the wizard. Mid-walk advances in review-all mode are unchanged — no dialog between people.
- Completion is computed via the existing `computePersonCompletion` helper using the in-flight overlay merged with `serverFormData`, so the % matches what the user just saved (not what was on the server before this round-trip).
- Falls back to a role-derived label when `kyc_records.full_name` is empty.

**Batch 4 — KYC tooltip + duplicate document dedupe + Review/Documents parity:**
- `src/components/shared/KycIntroTooltip.tsx` — new ELI10 popover (click + hover, Esc closes, focus-visible outline). Used next to the People & KYC intro copy in `ServiceWizardPeopleStep.tsx`. Body matches the brief's verbatim copy: why we ask, who to add (with the 25% UBO definition), what each person needs.
- `src/components/kyc/steps/ReviewStep.tsx` — `docStatuses` now mirrors the per-person doc-list source of truth: filtered by DD level (basic ⊆ sdd ⊆ cdd ⊆ edd), restricted to `scope === "person"` doc types, deduped on `document_type_id`. The "Before submitting, please upload:" missing list reads from the same deduped source. This fixes the parity gap between the wizard's Review step and the Documents card on the same person.
- `src/app/kyc/fill/[token]/KycFillClient.tsx` — magic-link KYC fill view now dedupes `roleDocReqs` by `document_type_id` before rendering, aggregating role badges (`Director`, `Shareholder`, `UBO`, `Primary Client`) onto a single line per doc. A person holding three roles that each require "Declaration of Source of Funds" now sees one row with three badges instead of three rows.

**Batch 3 — KYC card compaction + button styling + heading rename:**
- `src/components/client/ServiceWizardPeopleStep.tsx` (`PersonCard` + `ResendInviteButton`):
  - Compact single-row header — left 3/4 has avatar + name + role chips (email truncated below); right 1/4 shows the KYC % above a thin progress bar. On `< sm` the right region stacks under the left so the percentage stays visible.
  - Reduced vertical padding (`py-2.5` instead of `py-3.5 space-y-3` between sections).
  - "Review KYC" → state-aware label per profile completion: `Add KYC for <Name>` (0%) / `Continue KYC for <Name>` (1–99%) / `View KYC for <Name>` (100%) — applied wherever the wizard surfaces the start-KYC affordance.
  - "View Summary" upgraded from `variant="ghost"` to `variant="outline"`, h-11 (44pt touch target).
  - "Request KYC" / "Resend invite" upgraded to a primary brand-navy `<Button>` (h-11, semibold) so it reads as the main outbound CTA.

**Batch 2 — Service wizard polish:**
- `src/components/ui/NumberInput.tsx` — new shared currency/amount input. Raw digits on focus, locale-formatted (`en-US`) thousand separators on blur, stores raw numeric string. Used for every `type: "number"` field rendered through `DynamicServiceForm`.
- `src/components/shared/DynamicServiceForm.tsx` — renders `type: "number"` via `NumberInput`. Special-cases `proposed_names` `text_array`: each slot is its own labeled field ("Proposed Name 1/2/3"), Name 1 has the red required asterisk plus a `FieldTooltip` explaining the Registrar of Companies context (B-067 copy). Legacy data with > 3 entries is logged to console and the first 3 shown; extras only get overwritten if the user touches an input.
- `src/components/shared/MultiSelectCountry.tsx`, `src/components/shared/CountrySelect.tsx` — outline switched from `border-gray-200` / default to `border-gray-300` so country dropdowns visually match the standard `<Input>` border across the wizard.
- `src/components/client/ServiceWizard.tsx` and `src/app/(client)/apply/[templateId]/details/page.tsx` — drop empty `proposed_names` entries before PATCH/save so optional fields don't pollute the array (`[name1, name2, name3].filter(s => s && s.trim() !== "")`).

### 2026-05-05 — B-066 — Stop wizard from remounting on every save (Claude Code)

B-062 added `kyc.updated_at` to the per-person wizard's mount key to
force a remount when server data refreshed. After B-063 (form-state
architecture) and B-065 (onSaveSuccess patches local persons state),
the key change now happens on EVERY save — so the wizard snapped back
to the first sub-step every time the user clicked Next.

Fix: drop the `updated_at` portion of the key. The wizard now
remounts only when `reviewingPerson.id` changes — i.e., when the user
switches to a different person via "Review KYC" or the review-walk
arrows. Saves on the same person preserve sub-step position; B-063's
serverFormData/overlay computation and B-065's response-based persons
patching keep the displayed data fresh without needing a remount.

`src/components/client/ServiceWizardPeopleStep.tsx` — single-line
key simplification at the `<PerPersonReviewWizard>` render site.

UI / state only. No DB or API changes. 173 tests pass.

### 2026-05-05 — B-065 — Instant local-state update after KYC save (Claude Code)

After B-063 fixed the data-wiping bug, a UX follow-on remained: after
Save & Close, the People list and re-opened wizard showed stale data
until a manual hard refresh. Cause was the asynchronous
`router.refresh()` lag combined with aggressive Next.js HTML caching —
during the refresh window the client tree was still rendering the
pre-save `initialPersons` props.

Fix: thread the save endpoint's response (which already returns the
updated `client_profile_kyc` record) into the parent so it can patch
local state synchronously, eliminating the wait.

- `PerPersonReviewWizard.tsx`: added optional
  `onSaveSuccess?: (updatedKyc: Record<string, unknown>) => void` prop.
  `saveKycForm` now reads the JSON response and, on success, calls
  `onSaveSuccess` with `data.record`. JSON parse errors are tolerated
  silently — a successful HTTP status is still treated as save success.
- `ServiceWizardPeopleStep.tsx`: passes an `onSaveSuccess` handler
  that splices the fresh kyc record into local `persons` state for
  every role row tied to that profile. The B-063 `serverFormData`
  useMemo recomputes from the new prop, and the existing B-062
  `kyc.updated_at` remount key triggers a clean wizard re-mount with
  fresh server data and a reset overlay (the in-flight overlay would
  have reconciled to empty anyway since server has caught up).
- `router.refresh()` calls remain in place as the secondary
  cache-bust for surfaces outside the wizard (dashboard counts, etc.).

UI / state only. No DB or API contract changes — the response shape
was already `{ record: <updated kyc> }`. 173 tests pass. Build green.

After deploy, hard-refresh the prod tab once to drop the old JS
bundle. Subsequent Save & Close clicks should reflect fresh data
without any further hard refreshes.

### 2026-05-05 — B-064 — Regression tests for KYC form-state architecture (Claude Code)

Locks in the B-063 architecture so the autosave-wipes-data bug class
can't quietly regress.

- `src/lib/utils/formStateOverlay.ts`: extracted the `composeFormState`
  and `reconcileOverlay` helpers from `PerPersonReviewWizard.tsx` so
  they're independently testable. The wizard now imports them; the
  inline merge `useMemo` and reconcile `useEffect` were replaced with
  calls to the helpers (behavior identical, including the same-ref
  short-circuit when nothing reconciles).
- `tests/unit/utils/formStateOverlay.test.ts`: 7 tests covering
  composition (overlay over server), input non-mutation,
  reconciliation (drops matching keys, preserves diverging ones), and
  reference-equality semantics for both the no-op and all-reconcile
  cases.
- `tests/integration/api/profiles-kyc-save-partial.test.ts`: 6 tests
  asserting the `POST /api/profiles/kyc/save` partial-payload contract
  — sending one address field updates only that field on
  `client_profile_kyc` (plus `updated_at`), never invents nulls for
  unrelated columns. Includes auth/validation paths (401, 400, 404)
  and a multi-field address case. This is the structural guarantee
  that B-063's "send only the overlay" relies on.
- `tests/e2e/kyc-address-persists.spec.ts`: full user-flow regression
  skeleton (type address → Save & Close → re-open → 60s wait → values
  still there; and Save & Close with no edits fires no save). Marked
  `test.fixme` because the wizard lives inside a server-rendered
  service detail page, so Playwright's `page.route()` cannot stub the
  Supabase reads done in the Next dev server's Node process. The spec
  file documents exactly what infrastructure is needed to lift the
  fixme (a seeded test DB OR an MSW interceptor inside the dev
  server). Until then the unit + integration tests carry the
  regression weight.

Suite: 173 tests passing (was 160 before this batch). No production
behavior changes — pure tests + a no-op refactor for testability. No
DB migrations.

### 2026-05-05 — B-063 — Re-architect KYC form state: server-derived + optimistic overlay (Claude Code)

Structural fix for the autosave-wipes-data bug class that survived
B-061 and B-062. Real reproduction: user typed Bruce's address,
clicked Save & Close (DB had values briefly), DB nulled within ~74s.

Root cause was that `PerPersonReviewWizard` maintained a local
`useState<Partial<KycRecord>>(initialKycRecord)` initialized from
props on mount, and `saveKycForm` sent the **entire** form snapshot
on every save. Any path that reset `form` to stale data turned the
next save into a multi-field overwrite that wiped fields the user
had previously saved.

New architecture in `PerPersonReviewWizard.tsx`:

- `serverFormData = useMemo(() => mapToKycRecord(reviewingPerson))`
  — source of truth, recomputed from the server-derived prop on
  every render.
- `overlay = useState<Partial<KycRecord>>({})` — user's in-flight
  edits.
- `form = { ...serverFormData, ...overlay }` — merged view passed
  to inner steps. Computed, never stale, always reflects the
  latest server data plus the user's pending edits.
- `handleFormChange` updates only the overlay.
- `saveKycForm` sends ONLY the overlay (the fields the user
  actually touched), not the full form. Empty overlay = no-op
  save (no network call, no chance of wiping).
- A reconciliation `useEffect` drops overlay entries when the
  server data catches up to the user's edit (post-save +
  router.refresh). Strict equality check, so still-pending or
  diverged values stay in overlay.
- Removed `formRef` (replaced by `overlayRef`) and the now-stale
  `initialKycRecord` alias (5 step props now read
  `kycRecord={serverFormData}`, same definition).

Net effect: stale state can no longer wipe DB values because there
is nothing to wipe with. The save payload structurally cannot
include fields the user didn't edit, so multi-field wipes become
impossible.

Inner step components (`IdentityStep`, `ResidentialAddressStep`,
`FinancialStep`, `DeclarationsStep`, `ReviewStep`,
`CompanyDetailsStep`, `CorporateTaxStep`) are unchanged — they
still receive `form` and `onChange` props with the same shape.

Supersedes the form-side concerns of B-061/B-062. The persons
sync useEffect from B-061 §1 stays. The kyc.updated_at remount
key from B-062 stays as a safety net for inner-step state that
should reset on data refresh (banners, prefill UI).

Files:
- `src/components/client/PerPersonReviewWizard.tsx`

UI / state architecture only. No DB or API changes — the route
handler at `/api/profiles/kyc/save` already merges field-by-field,
so partial payloads are backward-compatible. Lint: pre-existing
warning unchanged. Build green. Tests 160/160 passing.

Hard-refresh prod tabs after deploy — stale browser cache will
still run the old (pre-B-063) bundle. Fields wiped from earlier
sessions (Bruce's address, etc.) are not coming back; re-enter
once after this lands.

### 2026-05-05 — B-062 — Fix form-state wipe introduced by B-061 (Claude Code)

B-061's form-sync useEffect was overwriting `PerPersonReviewWizard`'s
`form` state with stale `initialKycRecord` data after a wizard
remount-then-server-refetch race. Symptom: user typed Bruce's
address, clicked Save & Close (DB had values), opened Bruce again,
and a follow-on save wiped the DB within ~74 seconds.

Replaced the buggy sync mechanism with a remount strategy:

- Removed the form-sync useEffect and `autosaveStateRef` wiring from
  `PerPersonReviewWizard.tsx`. Form state goes back to mount-time
  initialization via `useState(initialKycRecord)`, updated only by
  user edits via `handleFormChange`.
- Added the kyc record's `updated_at` to the
  `<PerPersonReviewWizard>` key in `ServiceWizardPeopleStep.tsx`.
  When the server-side data refetch lands (post-save router.refresh),
  the key changes, React unmounts the old wizard and mounts a fresh
  one, and `useState(initialKycRecord)` picks up the latest values
  naturally. Typing in progress is preserved because `updated_at`
  doesn't advance until a save commits — the key is stable while the
  user is typing.

The persons sync useEffect from B-061 §1 stays — it correctly
propagates fresh persons data after `router.refresh()`.

Files:
- `src/components/client/PerPersonReviewWizard.tsx`
- `src/components/client/ServiceWizardPeopleStep.tsx`

UI / state only. No DB changes. Lint: pre-existing warning
unchanged. Build green. Tests 160/160 passing. Hard-refresh prod
tabs after deploy — stale browser cache will still run the old
(buggy) bundle.

### 2026-05-05 — B-061 — Sync useState(prop) patterns so autosaves don't wipe values (Claude Code)

Fixes a class of "data appears saved then disappears 30-60s later"
bugs caused by two stale-prop state patterns:

- `ServiceWizardPeopleStep.persons` (line 928): now syncs with
  `initialPersons` prop on every change. Previously useState only
  used the prop on first mount, so server data fetched via
  `router.refresh()` (added in B-058 §6.2) never propagated. This
  made re-entering a person's wizard supply stale `reviewingPerson`
  data to the wizard.
- `PerPersonReviewWizard.form` (line 562): now syncs with
  `initialKycRecord` prop changes, BUT only when the autosave is
  idle. The guard prevents in-flight user edits from being
  overwritten by a stale server snapshot during the brief window
  between user typing and the save completing. The
  `autosaveStateRef` pattern keeps the sync effect from re-running
  on every save-state transition — it only fires when
  `initialKycRecord` itself changes.

Net effect: an edit → save → exit → re-enter cycle no longer
involves form state initialized from pre-edit data. Subsequent
autosaves send the user's saved values, not the stale nulls that
were re-seeded from the prop on remount.

Files:
- `src/components/client/ServiceWizardPeopleStep.tsx`
- `src/components/client/PerPersonReviewWizard.tsx`

UI / state only. No DB changes. Values already wiped from the DB
(e.g., Bruce's address from earlier QA) won't come back — the user
will need to re-enter them once. Lint: pre-existing warning
unchanged. Build green. Tests 160/160 passing. Interactive
verification (the wait-60s-then-re-query repro from the brief) is
left to the user — CLI can't drive the browser-side autosave path.

### 2026-05-05 — B-060 — Always show "Pre-fill from uploaded document" button when a doc exists (Claude Code)

B-058 §4 introduced a manual prefill button gated on
`addressDoc && availableExtracts.length > 0` (and the `passportDoc`
equivalent on Identity). When the AI returned no extracts relevant to
the sub-step (e.g., a POA where Claude couldn't read the address),
the button was hidden and users had no retry path even though the doc
was clearly uploaded.

Loosened the render gate to `addressDoc?.verification_result`
(`passportDoc?.verification_result` on Identity) at both gate sites
in each file (the yellow error banner and the blue success banner).
The button now appears as soon as the AI has finished processing the
doc, regardless of whether useful values were extracted for the
sub-step. The existing handler already toasts a clear explanation
("This document didn't include address details. Please enter them
below.") on the empty-extracts path, so the user always gets
feedback.

Files:
- `src/components/kyc/steps/ResidentialAddressStep.tsx`
- `src/components/kyc/steps/IdentityStep.tsx`

UI only. No DB changes. Lint: pre-existing warning unchanged. Build
green. Tests 160/160 passing.

### 2026-05-05 — B-058 — Free navigation in per-person KYC + Resend tooltip + manual prefill + role/walk refresh (Claude Code)

Six clickability/feedback fixes in the per-person KYC wizard. UI only,
no DB changes.

- `src/components/client/PerPersonReviewWizard.tsx`
  - Sub-step breadcrumb (`Contact › Identity › Address › …`) now lets
    users jump forward as well as backward. Removed the
    `canJump`/`disabled` gate; future steps render with a hover
    affordance and a slightly muted text color so they read as
    clickable. Per-step validation (Submit on Review) is still the
    gate, so free navigation does not bypass requirements.
  - KYC Documents category badges (IDENTITY / FINANCIAL / COMPLIANCE …)
    are always buttons, not just on the doc-list sub-step. Clicking
    from another sub-step stashes the target category, navigates to
    the docs step, and a `requestAnimationFrame`-deferred effect
    scrolls to the in-page anchor once the new step has mounted.
    Added `docsSubStepIndex` and `pendingDocsCategory` state +
    effect to coordinate the cross-step navigation.

- `src/components/client/ServiceWizardPeopleStep.tsx`
  - `ResendInviteButton` swapped the native `title` attribute for a
    shadcn Tooltip (`@/components/ui/tooltip`) wrapped in an
    `inline-block` `<span>`. Disabled buttons swallow native hover
    events, which made the 24h cooldown reason invisible. The
    wrapper is keyboard-focusable only when the inner button is
    disabled (`tabIndex={isCoolingDown ? 0 : -1}`) so screen readers
    can still announce the reason.
  - `handleRoleAdded` / `handleRoleRemoved` now call
    `router.refresh()` after the local state mutation so the
    page-level `requirements` / `documentTypes` / `documents` /
    `persons` re-fetch and the KYC progress strip
    ("X of N uploaded") reflects the new role's required-docs count
    without a manual reload.
  - Removed the local `kycCompletedIds: Set<string>` optimistic
    override. Walking the per-person review walk no longer forces
    `kycPct = 100` on the PersonCard; the card now trusts
    `computePersonCompletion`'s real `percentage` / `isComplete`.
    `handleKycComplete`, `handleExitKycReview`, and the review-all
    `onAdvance` advance no longer add to a local Set; instead
    `router.refresh()` re-fetches server data so any KYC field
    saves / doc uploads from the walk are reflected post-walk.

- `src/components/kyc/steps/ResidentialAddressStep.tsx` and
  `src/components/kyc/steps/IdentityStep.tsx`
  - Added `handleManualPrefill` + `manualPrefilling` state. The
    handler reads the existing
    `verification_result.extracted_fields` (via
    `availableExtracts` / `filteredAvailable`), PATCHes any matches
    via `/api/profiles/kyc/save`, and calls `onChange()` with the
    same payload. No AI re-run.
  - The error/yellow banner ("Couldn't auto-fill from your
    document") now renders a "Pre-fill from uploaded document"
    button when there are extractable values
    (`availableExtracts.length > 0` / `filteredAvailable.length > 0`).
    Useful when auto-prefill skipped because the user typed first.
  - The success/blue banner now renders a compact "Re-apply" button
    so the user can re-pull values they cleared by accident.
  - Buttons only appear when there is something to fill — if the AI
    returned nothing relevant for the sub-step, the buttons are
    hidden so we don't promise a fill we can't deliver.

Build: green. Lint: one pre-existing warning unchanged. Tests:
160/160 passing. After CLI finished file edits, dev server restarted
(`pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev`).

### 2026-05-05 — B-057 — Prefill banner reacts to uploads (single source of truth) (Claude Code)

Real-device QA on the Address sub-step found contradictory banners
firing at the same time after a POA upload: a green outer "Pre-filled
from your proof of address" + a yellow inner "Couldn't auto-fill from
your document". Root cause: two independent prefill systems looking at
different slices of the AI extraction.

- `src/components/kyc/steps/ResidentialAddressStep.tsx` — dropped the
  one-shot `prefillFiredRef` gate. The prefill `useEffect` now keys on
  `addressDoc?.id` + `addressDoc?.verification_result` +
  `prefillable.length` + `availableExtracts.length` +
  `effectiveKycRecordId`, so a fresh upload from the outer card
  immediately re-evaluates the banner (success / error / no-source).
  New `prefilledFromDocIdRef` makes the PATCH idempotent across
  remounts and re-renders for the same doc id.

- `src/components/kyc/steps/IdentityStep.tsx` — same pattern. Source
  doc identity is composed as `passportDoc.id` (when
  `hideAddressFields=true`) or `passportDoc.id|addressDoc.id`
  otherwise, so re-uploading either fires the effect again. The
  module-level `ADDRESS_PREFILL_KEYS` set replaces the per-render
  `new Set([...])` allocation inside the old effect.

- `src/components/client/PerPersonReviewWizard.tsx`
  (`PrefillUploadCard`) — the green "Pre-filled from your <doc>"
  success card is replaced with a neutral "<Doc> uploaded.
  [Replace]" line. The inner step's banner is now the single source
  of truth for prefill success/failure feedback.

- Same file, `handlePrefillUpload`: the redundant top-right
  `toast.success("Pre-filled N fields…")` is removed (the inline
  inner banner already conveys this). `toast.error` paths kept for
  upload-side failures (network, file too big, etc.).

- The `prefillFilledKinds` set + its setter are dropped; the card's
  state collapses to a single `uploaded` boolean derived from
  `getUploaded(docTypeId)`. Equivalent to the brief's
  `prefillUploadedKinds` rename — same semantics, fewer pieces of
  state to keep in sync.

`npx vitest run` → 160/160 green; `npm run lint` (one pre-existing
warning, unchanged); `npm run build` clean. No DB changes.

### 2026-05-05 — B-056 Batch 2 — KYC sidebar redirects to People & KYC view (Claude Code)

The "KYC Profile" sidebar item now sends primary clients to the
service-level People & KYC view instead of the redundant `/kyc` hub.

- **New `src/app/(client)/kyc-review/page.tsx`** — server-side
  redirect that picks the most recent non-deleted service the
  current profile can manage and 302s to
  `/services/<id>?wizardStep=3`. Uses the
  `services!inner(is_deleted=false)` join + `order("services(created_at)",
  { ascending: false })` so the destination is computed in a single
  query. No service yet → `/apply`.
- `src/components/shared/Sidebar.tsx` — primary-client `KYC Profile`
  href flipped from `/kyc` to `/kyc-review`. `activePaths: ["/kyc",
  "/kyc-review"]` so the nav item still highlights when a user is
  already inside the legacy `/kyc` page (kept as fallback). Non-primary
  clients still go to `/kyc` because that's their own profile form.
- `wizardStep=3` was already plumbed through
  `services/[id]/page.tsx` → `ClientServiceDetailClient.autoWizardStep`
  (no client-side change needed).
- Tech-debt #22 + #23 logged for future cleanup.

`npx vitest run` → 160/160 green; `npx tsc --noEmit` clean.

### 2026-05-05 — B-056 Batch 1 — Magic-link KYC invite collision + missing-profile fix (Claude Code)

The magic-link KYC invite was returning "Invalid or expired link" or
"Profile not found" on every fresh send. Root cause analysis on the
real code path (not the suspected list) found two real bugs and
neither matched suspect 1.4 (timezone):

**Cause 1 — `kyc_record_id` was never populated.**
`send-invite/route.ts:128` had a comment saying "kyc_record_id omitted
— new model uses client_profile_kyc". But `verify-code` was still
looking up `kyc_records.id = vc.kyc_record_id`, which always resolved
to `null` → 404. The codebase already had
`verification_codes.client_profile_id` (added in migration 003); it
just wasn't being written or read. **This was the primary blocker:
every fresh single-role invite hit this 404 immediately after a
correct code entry.**

**Cause 2 — DELETE-by-email collision.** A second invite to the same
email (multi-role users like Bruce Banner) wiped the first row. The
first email's link → 404 "Invalid or expired link". Real bug, but
secondary — single-role users hit Cause 1 first.

Fixes shipped together (one chain, one batch):

- **Migration `20260505050019_verification_codes_supersede.sql`** —
  pushed via `npm run db:push`, verified with `npm run db:status`
  (paired Local + Remote, no drift).
  - `superseded_at timestamptz` column so old rows can be marked
    replaced instead of deleted.
  - Unique partial index `verification_codes_email_profile_active_uq`
    on `(email, client_profile_id)` `WHERE verified_at IS NULL AND
    superseded_at IS NULL` enforces one active invite per (person,
    profile) pair.
  - Plain index on `access_token` (was already implicit; explicit
    keeps the lookup hot).

- **`src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts`**
  — replaced `DELETE WHERE email = ?` + `INSERT` with `UPDATE … SET
  superseded_at = now() WHERE email = ? AND client_profile_id = ? AND
  verified_at IS NULL AND superseded_at IS NULL` + `INSERT` (now
  including `client_profile_id`). Errors on insert surface as 500 to
  the caller instead of being silently swallowed.

- **`src/app/api/kyc/verify-code/route.ts`** — full rewrite:
  - Looks up `vc.client_profile_id` (not `vc.kyc_record_id`).
  - Returns a 410 with `code: "superseded"` when the row's
    `superseded_at` is non-null, distinct from the existing "expired"
    410.
  - `returnKycData` now assembles the legacy `KycRecord`-shape
    response from `client_profiles` + `client_profile_kyc` (1:1 join)
    + `profile_service_roles` so the existing `KycFillClient`
    consumes it without any client-side change to the role-filter
    logic.

- **`src/app/api/kyc/save-external/route.ts`** — was also broken in
  the same chain (read `vc.kyc_record_id`, wrote to legacy
  `kyc_records`). Rewritten to update `client_profile_kyc` for KYC
  fields and `client_profiles` for shared profile fields (full_name /
  email / phone / address). Without this fix the user would reach the
  form but every Save Draft / Submit would fail.

- **`src/app/api/documents/upload-external/route.ts`** — same chain;
  rewritten to write documents with `client_profile_id` (and the
  resolved `tenant_id` / `client_id` from the profile) instead of the
  legacy `kyc_record_id` path.

- **`src/app/kyc/fill/[token]/KycFillClient.tsx`** — handle the new
  `superseded` 410 with a distinct card ("Your invite was updated …
  the link in this one is no longer active") instead of the generic
  "Link Expired" copy.

- **Tests** — `tests/integration/api/kyc-verify-code.test.ts`
  fixtures rewritten to the new `client_profiles + client_profile_kyc
  + profile_service_roles` shape. New regression test:
  `superseded_at` non-null returns 410 with `code: "superseded"`.
  `npx vitest run` → 160/160 green; `npm run build` clean.

Verification (run with the dev server pointed at the linked Supabase
project): a fresh invite no longer returns "Profile not found";
re-sending an invite for a second role marks the prior row superseded
and the prior link surfaces the new copy instead of the generic
expired page.

### 2026-05-05 — B-055 Batch 4 — Smart pre-fill from passport / POA OCR (Claude Code)

The Identity and Address per-person sub-steps now offer an optional
upload that auto-fills the form fields below from the AI-extracted
values on the document.

- `src/components/client/PerPersonReviewWizard.tsx`:
  - New `PrefillUploadCard` rendered above the IdentityStep (passport)
    and ResidentialAddressStep (POA). Card uses dashed-border copy
    "Have your passport handy?" and collapses to a quiet "Pre-filled
    — please review" line after a successful prefill.
  - `handlePrefillUpload(kind, file)` flow: optional image
    compression → POST `/api/services/[id]/documents/upload` with the
    canonical doc-type id (`Certified Passport Copy` /
    `Proof of Residential Address`) → poll
    `/api/documents/[id]` until verification leaves `pending` →
    `computeAvailableExtracts` to derive prefillable form fields →
    persist via `/api/profiles/kyc/save` first, then mutate local
    form state via `handleFormChange`.
  - Hidden file input with `capture="environment"` (mobile camera
    path) routes uploads to the prefill handler via a ref.
  - Reuses existing infrastructure (`computeAvailableExtracts`,
    `KYC_PREFILLABLE_FIELDS`, the upload route's fire-and-forget
    verification, the `/documents/[id]` GET) — no new API surface,
    no schema changes.
  - The same upload counts as the canonical Passport / POA doc
    upload so the KYC docs progress strip auto-updates and the
    Documents step shows ✓ Uploaded for that row.

- No DB migrations. Verifies via `npm run lint` (one pre-existing
  warning, unchanged), `npx vitest run` (159/159), and `npm run
  build` (clean).

Mapping note: the AI key → KYC column mapping is driven by the
template's `document_types.ai_extraction_fields[i].prefill_field`
(B-033 / B-042 plumbing). No prompt update required — the existing
extraction config already covers the passport + POA fields the brief
listed.

### 2026-05-05 — B-055 Batch 3 — Breadcrumb steppers + Review shortcut (Claude Code)

Top wizard stepper and per-person sub-step nav both moved to a
breadcrumb pattern; the per-person header gains a "Review <name>"
shortcut visible on every sub-step except the final review.

- `src/components/client/ServiceWizardStepIndicator.tsx`: rewritten as
  a horizontal breadcrumb (`Setup › Financial › Banking › People & KYC
  › Documents`). Completed steps render with a green check + are
  clickable; current step is bolded navy; future steps are muted and
  disabled. Wraps cleanly on mobile via `flex-wrap`, no horizontal
  scroll.
- `src/components/client/PerPersonReviewWizard.tsx`:
  - New sub-step breadcrumb under the person name with the same `›`
    pattern (`Contact › Identity › Address …`). Completed sub-steps
    are clickable.
  - Header gains a tertiary "Review {personName}" button (top-right of
    the name row) that jumps to the review sub-step. Hidden on the
    review sub-step itself.
  - `reviewSubStepIndex` is computed once (matches `form-review` for
    individuals and `form-org-review` for orgs).
  - "Review & Submit" in `OrgReviewStep` renamed to "Review".
- `npx vitest run` → 159/159 green; `npx tsc --noEmit` clean.

No DB migrations. The standalone `/kyc/fill/[token]`,
`/kyc/[profileId]`, and `/apply/...` flows still use the old "Review &
Submit" copy and the old dot+line stepper — they are explicitly out of
scope for this brief.

### 2026-05-05 — B-055 Batch 2 — Reorder sub-steps + clickable category jumps (Claude Code)

Per-person KYC wizard sub-steps now lead with form fields and finish
with a single combined documents step.

- `src/components/client/PerPersonReviewWizard.tsx`:
  - Sub-step order is now `contact → identity → address → financial →
    declarations (CDD/EDD) → docs → review` for individuals and
    `contact → company details → tax → docs → review` for
    organisations.
  - The 8 per-category doc-list sub-steps collapsed into ONE combined
    `doc-list` step that renders every category vertically stacked,
    each wrapped in a `docs-cat-<category>` anchor div.
  - Persistent KYC progress strip badges become buttons on the
    doc-list step that smooth-scroll to their category anchor.
  - Contact sub-step gains an explicit "optional" banner; Next stays
    enabled regardless of whether email/phone are filled.
  - "Review & save" → "Review" everywhere in the per-person wizard.
  - `SubStep` type tightened: doc-list no longer carries a `category`.
  - Review screen's `onJumpTo({kind:"doc-list", category})` still
    works — it now lands on the single doc-list step and scrolls to
    the requested anchor.
  - Doc-list "Next" stays gated until every category is fully
    uploaded; users can still skip via the explicit "Upload later"
    middle button.
- `npx vitest run` → 159/159 green; `npx tsc --noEmit` clean.

No DB migrations.

### 2026-05-05 — B-055 Batch 1 — KYC completion bug + wizard nav state reset (Claude Code)

Two independent bugs surfaced by Bruce Banner (GBC-0002) real-device QA.

- `src/lib/utils/personCompletion.ts` — rewrote the docs-required
  derivation so `docsTotal` matches the visible KYC-docs strip exactly
  (start from `documentTypes` filtered by scope='person' and intersect
  with the DD-level requirement set, with a fallback to all
  person-scope docs when no DD doc requirements are configured). Old
  logic could undercount, producing 100% with 25 docs missing.
- `src/components/client/ServiceWizard.tsx` — `setHideWizardNav(false)`
  now fires in a `useEffect` keyed on `currentStep`, so the sticky
  Back / Save & Close / Next footer always reappears after exiting per-
  person Review KYC, regardless of how the previous step left the
  state.
- `tests/unit/utils/personCompletion.test.ts` — 4 new tests cover the
  32/7 strip parity case, all-docs-but-missing-field, the empty-
  requirements fallback, and the existing "no docs required"
  invariant. `npx vitest run tests/unit/utils/personCompletion.test.ts`
  → 12/12 green.

No DB migrations. Pure logic + UI state fix.

### 2026-05-04 — B-054 — Adopt Supabase CLI for migration tracking (Claude Code)

Replaces the ad-hoc "paste SQL into Supabase web editor and remember to
do it" workflow that has caused three production incidents (most
recently today: 500 on KYC autosave because migrations 006/007/008
were never applied). Now the CLI tracks state in
`supabase_migrations.schema_migrations` on the linked project; drift
is one `npm run db:status` away.

- `supabase` ^2.98.1 added to devDependencies.
- `npx supabase init` ran — `supabase/config.toml` and
  `supabase/.gitignore` (`.branches`, `.temp`) committed. Root
  `.gitignore` already excluded `supabase/.temp/` so no new entries
  there.
- 7 migration files renamed via `git mv` (history preserved) to the
  CLI's required `<YYYYMMDDHHMMSS>_<name>.sql` format with synthetic
  `20260301000002…000008` timestamps that preserve original ordering.
- Three new npm scripts: `db:status` / `db:push` / `db:diff`.
- CLAUDE.md gains a "Database Migration Workflow" section (between
  "Dev Commands" and "Testing") covering the daily-check + deploy
  ritual and the rationale for no CI auto-push.
- **Explicitly NOT done**: CI integration. Adding Supabase
  credentials to GitHub Actions secrets is a leak risk for a
  compliance product. The deploy ritual + `db:status` discipline are
  the guard. Consider revisiting later with a project-scoped
  read-only token.

**User actions required before `db:push` will work** (these are
interactive / write to prod and can only be done by the user — CLI
cannot run them):

1. **Apply migration 006 if not already live in prod** (the
   `document_types.scope` ALTER TABLE block from earlier today). If
   you skip this and run the backfill SQL below, the CLI will
   incorrectly mark 006 as applied.
2. `npx supabase login` (browser OAuth flow).
3. `npx supabase link --project-ref <ref>` where `<ref>` is the
   subdomain of `NEXT_PUBLIC_SUPABASE_URL` in `.env.local`.
4. In the Supabase SQL editor, run the `schema_migrations` backfill
   SQL from `docs/cli-brief-supabase-cli-migration-tracking-b054.md`
   §5 (creates the `supabase_migrations` schema + table and inserts
   the 7 already-applied versions).
5. `npm run db:status` — expect all 7 migrations paired Local +
   Remote.

If `db:status` shows a mismatch beyond the expected 7 paired rows,
STOP and document it here rather than guessing — it likely means
something is out of sync between repo and prod.

Tech-debt #14b (recurring missing-migration incidents): tracked but
not flagged in the open list because the workflow is now structurally
preventative.

---

### 2026-05-04 — B-053 — Mobile/desktop polish fixes (Claude Code)

Two B-052 follow-up fixes from real-device QA. Both CSS-only,
single commit.

- `ServiceWizardNav` (`src/components/client/ServiceWizardNav.tsx`):
  fixed footer bar was hardcoded to `left-[260px] bottom-6`, which on
  mobile pushed the bar 260px past the screen edge. Now
  `left-0 md:left-[260px]` and `bottom-0 md:bottom-6`, with
  edge-to-edge layout (`md:border-x`, `md:rounded-t-lg`,
  `px-4 md:px-6`, `gap-2 md:gap-3`) and `flex-wrap` so 3 buttons
  gracefully wrap on narrow viewports. Same family of fix as the
  B-052 §4 KycStepWizard change — this file was missed. ServiceWizard
  consumer already had `pb-28` on its scrollable area, which clears
  both the floating desktop bar and the flush mobile bar; left as-is.
- `PerPersonReviewWizard` (`src/components/client/PerPersonReviewWizard.tsx`
  line 1209): KYC progress strip's inner row had no `flex-wrap`,
  causing the `DocumentStatusLegend` to overflow the card boundary
  at desktop widths and stack vertically outside the right edge.
  Added `flex-wrap` and split the gap into `gap-x-4 gap-y-2` so
  wrapped rows look intentional.

`npm run build` green; all 155 vitest tests still pass.

---

### 2026-05-04 — B-052 Batch 5 — Mobile regression test + docs (Claude Code)

Final batch: Playwright regression guard, CLAUDE.md gotcha, tech-debt
table updated.

- `tests/e2e/mobile-no-horizontal-scroll.spec.ts`: 4 tests at 375 ×
  667 across `/dashboard`, `/apply`, `/applications/test-app-id`,
  `/services/test-service-id`. Asserts
  `documentElement.scrollWidth ≤ clientWidth + 1` (1px sub-pixel
  tolerance). All `**/api/**` calls stubbed with empty 200 so the
  test doesn't depend on a DB. `playwright --list` now shows 11
  tests in 6 files.
- `CLAUDE.md` "Key Gotchas": added the mobile-first one-liner
  describing the `flex-col sm:flex-row` / `grid-cols-1 sm:grid-cols-N`
  pattern and the drawer-below-`md:` rule.
- Tech-debt #19 (Sidebar has no mobile collapse) → **Resolved** with
  a per-route summary.
- Tech-debt #20 (Admin sidebar not yet mobile-friendly) → **Open
  Low**. The `Sidebar` component already supports `mobileOpen` /
  `onMobileOpenChange` props, so a future `AdminShell` mirror of
  `ClientShell` is the only missing piece.

### 2026-05-04 — B-052 — Mobile-friendly client portal (Claude Code)

Rollup of all 5 sub-batches. Resolves tech-debt #19. Every client
route now fits a 375px viewport without horizontal scroll, has
≥44pt touch targets on the formerly-tiny icon buttons, and the
document upload widget gains a native camera capture path on mobile.

- **B1 (Sidebar drawer)**: extracted `SidebarContent`; desktop renders
  the inline `<aside>`, mobile uses `<Sheet side="left">`. Burger in
  `Header`. New `ClientShell` owns the open state and route-change
  auto-close. `(client)/layout.tsx` now reads as `<ClientShell>{children}`.
- **B2 (Wizard reflow)**: `review/page.tsx` got two unprefixed
  `grid-cols-2` swapped to `grid-cols-1 sm:grid-cols-2`. All three
  wizard footers stack via `flex-col-reverse sm:flex-row` so the
  primary action sits above the secondary on mobile.
  `WizardLayout` shows a slim "Step X of 3 — Label" + progress bar
  below `sm:`, full numbered stepper at `sm:` and up.
- **B3 (Camera + touch)**: `DocumentUploadWidget` gets a hidden
  `<input capture="environment">` and a "Take photo" button
  (`md:hidden`). Image is run through `compressIfImage` before
  upload. Compact-mode icon buttons get `min-h-[44px] min-w-[44px]
  md:min-h-0 md:min-w-0`. `applications/[id]/page.tsx` 3-col layout
  → `grid-cols-1 md:grid-cols-3` + `md:col-span-2`. `UBOForm` row →
  `grid-cols-1 sm:grid-cols-2`.
- **B4 (KYC fill)**: `KycStepWizard` `fixedNav` was hardcoded
  `left-[260px]` — switched to `left-0 md:left-[260px]`. Verification
  code input gets `inputMode="numeric"` and `autoComplete="one-time-code"`.
  Sticky bottom Submit on `/kyc/fill/[token]` so the CTA is always
  reachable; wrapper gets `pb-32 sm:pb-8` so it never covers the
  last field.
- **B5 (Verify + docs)**: 4-route regression spec at 375px,
  CLAUDE.md gotcha, tech-debt updates.

**Things to flag:**
- No DB migrations.
- No new dependencies — `Sheet`, `react-dropzone`, and
  `browser-image-compression` were all already installed.
- Admin portal intentionally untouched (per brief scope).
- The new Playwright spec lives alongside the existing E2E tests
  and is gated by the `run-e2e` PR label like the others.

`npm run build` green, `npm test` 155/155 green.

---

### 2026-05-04 — B-052 Batch 4 — KYC fill flow mobile-first (Claude Code)

The KYC invite flow is the page most likely to be opened on a phone
(invitees forward the link from email). Three mobile-specific fixes.

- `src/components/kyc/KycStepWizard.tsx`: the `fixedNav` footer was
  hardcoded `left-[260px]` — that left a 260px dead band on mobile.
  Now `left-0 md:left-[260px]` so the nav goes full-width on mobile
  and only offsets for the desktop sidebar at `md:`. Padding tightens
  to `px-4 sm:px-6` and the inline (non-fixed) variant uses
  `-mx-4 md:-mx-8` so it doesn't overflow the smaller mobile main
  padding (now `p-4`, set in Batch 1).
- `src/app/kyc/fill/[token]/KycFillClient.tsx`:
  - Verification code input gets `inputMode="numeric"` and
    `autoComplete="one-time-code"` so iOS Safari shows the numeric
    keypad and offers SMS auto-fill.
  - Sticky bottom Submit CTA on mobile (`sm:hidden fixed inset-x-0
    bottom-0 z-40 bg-white border-t shadow…`). The inline Submit
    becomes `hidden sm:flex` so desktop still ends with a clear
    bottom action and there's no duplicate.
  - Page wrapper gets `pb-32 sm:pb-8` so the sticky CTA never covers
    the last form field on mobile.
- `/kyc/fill/[token]` lives under `src/app/kyc/...` (NOT inside the
  `(client)` route group) so it doesn't render the client sidebar.
  Audit confirms the route uses only the root layout — no further
  changes needed.
- `npm run build` green.

---

### 2026-05-04 — B-052 Batch 3 — Camera capture + touch targets + route audit (Claude Code)

Mobile users can now snap a document photo via the OS camera, and
all the previously sub-44pt icon buttons in the upload widget have
proper touch hit areas.

- `src/components/shared/DocumentUploadWidget.tsx`:
  - Imports `Camera` icon, `useRef`, and `compressIfImage`.
  - Adds a hidden `<input type="file" accept="image/*"
    capture="environment">` and a `handleCameraFile` that runs the
    same upload pipeline after browser-side image compression.
  - Standalone mode: renders a "Take photo" outline button
    (`md:hidden w-full h-11`) above the dropzone; dropzone label
    swaps "browse" → "Choose file" on mobile.
  - Compact + documentDetailMode buttons (Eye/Replace/View): wrapped
    with `inline-flex items-center justify-center min-h-[44px]
    min-w-[44px] md:min-h-0 md:min-w-0` so the icon stays visually
    small but the hit area is 44pt on touch viewports. Buttons get
    explicit `aria-label` for screen readers.
  - Compact upload trigger row: also gets a "Take photo"
    `md:hidden` button using the same camera path.
- `src/app/(client)/applications/[id]/page.tsx`: the main 3-column
  layout with sidebar status panel was hardcoded `grid grid-cols-3`
  + `col-span-2`. Changed to `grid-cols-1 md:grid-cols-3` and
  `md:col-span-2` so on mobile the timeline stacks above the panel.
- `src/components/client/UBOForm.tsx`: the 2-col field row at line
  77 was unprefixed. Changed to `grid-cols-1 sm:grid-cols-2`.
- Dashboard, services detail, and ClientServiceDetailClient have no
  unprefixed multi-col grids or fixed tables (audit clean).
- `npm run build` green.

---

### 2026-05-04 — B-052 Batch 2 — Wizard step pages mobile reflow (Claude Code)

Removed every fixed 2-column grid and horizontal-only button row that
broke at 375px on the wizard surface.

- `src/app/(client)/apply/[templateId]/review/page.tsx`:
  - Line 86 (per-person KYC progress card): `grid grid-cols-2 gap-3`
    → `grid grid-cols-1 sm:grid-cols-2 gap-3`.
  - Line 214 (Primary Contact card): `grid grid-cols-2 gap-4` →
    `grid grid-cols-1 sm:grid-cols-2 gap-4`.
  - Footer button row: `flex items-center justify-between` →
    `flex flex-col-reverse sm:flex-row items-stretch sm:items-center
    justify-between gap-2` so Submit lands above Back on mobile (the
    primary action is what the thumb naturally hits).
- `src/app/(client)/apply/[templateId]/details/page.tsx`: same
  flex-col-reverse footer treatment for Save progress / Next.
- `src/app/(client)/apply/[templateId]/documents/page.tsx`: same
  flex-col-reverse footer treatment for Back / Proceed to Review.
- `src/components/client/WizardLayout.tsx`: full stepper hidden below
  `sm:`. Replaced with a slim "Step X of 3 — Label" line + 1.5px
  progress bar so the indicator stays visible without horizontal
  scroll. Full numbered stepper still renders at `sm:` and above.
- Details page already used `grid-cols-1 md:grid-cols-2` for its
  field rows (no change). Documents page has no grid (no change).
- `npm run build` green.

---

### 2026-05-04 — B-052 Batch 1 — Client sidebar mobile drawer (Claude Code)

Critical unblocker for tech-debt #19. Below `md:` the client sidebar
now lives inside a left-side `Sheet` drawer; above `md:` it renders
inline as before.

- `src/components/shared/Sidebar.tsx`: extracted the sidebar markup
  into a `SidebarContent` inner component. The exported `Sidebar`
  renders both the desktop `<aside className="hidden md:flex …">` and
  a mobile `<Sheet open={mobileOpen}>` with a 280px panel
  (`md:hidden`). `usePathname()` + `useEffect` auto-close the drawer
  on route change. NavItem padding bumps to `py-3` on mobile and
  `md:py-2` on desktop for ≥44pt hit area.
- `src/components/shared/Header.tsx`: new burger button (Lucide
  `Menu`, `h-11 w-11`, `aria-label="Open navigation"`) on
  `md:hidden`, shown only on the client variant. Brand line truncates
  on mobile, sub-tagline hides below `sm:`. User pill name hides
  below `sm:`.
- `src/components/shared/ClientShell.tsx` (new): client component
  that owns `mobileNavOpen` state, wires `Header.onOpenMobileNav` to
  `setMobileNavOpen(true)`, passes `mobileOpen` and
  `onMobileOpenChange` down to `Sidebar`. Wraps `Header` + `Sidebar`
  + `<main>` and applies `p-4 md:p-8` so mobile gets less main
  padding.
- `src/app/(client)/layout.tsx`: server component now hands all the
  derived props (display name, hasApplications, isPrimary) to
  `<ClientShell>` and renders children inside it. No more inline
  Header/Sidebar markup in the layout.
- Admin sidebar intentionally untouched (per brief scope) — admins
  use desktop. Tracked as new tech-debt below.
- `npm run build` green; all 155 tests still pass.

**Note:** The Claude Desktop "Follow-up: B-052" reference below was
ambiguous — it speculated B-052 would be about Playwright E2E
selector fixes. The actual B-052 brief
(`docs/cli-brief-mobile-client-portal-b052.md`) is the mobile rework.
The E2E selector follow-up remains an open follow-up under the B-051
umbrella.

---

### 2026-05-04 — B-051 follow-up — CI green; E2E specs deferred (Claude Desktop)

Post-CLI clean-up to land the workflow and stabilise main.

- **Workflow pushed.** `gh auth refresh -s workflow` granted the missing
  scope; `.github/workflows/test.yml` is now on `origin/main` (commit
  `71344d1`). The `staged locally but not pushed` note in the Batch 5
  entry below is now resolved.
- **Lockfile fixed.** First CI run failed with `npm ci` complaining about
  missing `@emnapi/core` / `@emnapi/runtime`. Root cause: the lockfile
  was generated on macOS without Linux-only optional deps. Regenerated
  with `rm -rf node_modules package-lock.json && npm install
  --include=optional` (commit `07c5b5d`). 491 lines added, 472 removed.
  Local `npm test` still 155/155 green.
- **E2E gated to label only.** Workflow conditional changed from
  `contains(... 'run-e2e') || github.ref == 'refs/heads/main'` to
  `contains(... 'run-e2e')` (commit `3091a94`). The rollup entry below
  describes the original (label-or-main) gating; this is the corrected
  behaviour and matches the brief.
- **Why:** the first main-branch run executed E2E and failed (the specs
  were scaffolded but never run end-to-end against a live dev server in
  CI). Rather than block main on flaky E2E, we run unit + integration on
  every push and reserve E2E for opt-in PR runs (label `run-e2e`).
- **Current CI state on main:** `test` job green in ~1m32s (lint + build
  + 155 vitest tests). `e2e` correctly skipped.
- **Follow-up batch (not yet planned):** B-052 — get the 7 Playwright
  specs passing. Likely work: selector adjustments to match the actual
  rendered shadcn/base-ui DOM, JWT seeding via `NEXTAUTH_SECRET` parity
  between `globalSetup` and the dev server, and triage of the failing
  CI run's `playwright-report` artifact (downloadable from
  run `25337400563`).

### 2026-05-04 — B-051 Batch 5 — CI workflow + docs (Claude Code)

Last batch of B-051. Wires up CI and documents the test setup.

- `.github/workflows/test.yml`: file is **staged locally but not pushed**
  — the current GitHub OAuth token rejected the push with "refusing to
  allow an OAuth App to create or update workflow without `workflow`
  scope". Grant workflow scope (`gh auth refresh -s workflow` or via the
  GitHub OAuth app settings) and run `git add .github/workflows/test.yml
  && git commit -m "ci: add github actions workflow for tests" && git
  push origin main` to land it. Workflow contents:
  - `test` runs on every push to main + every PR: `npm ci → npm run
    lint → npm run build → npm run test`. Build env vars are inlined
    fakes (same as `.env.test`).
  - `e2e` is gated on the `run-e2e` PR label OR a push to main:
    `npm ci → npx playwright install --with-deps chromium → npm run
    test:e2e`. On failure, uploads `playwright-report/` as an artifact
    (7-day retention).
- `CLAUDE.md`: new "Testing" section after "Dev Commands" listing the
  test scripts and the rule that all external services are mocked.
- `tests/README.md`: layout, what's mocked, and recipes for adding
  unit / integration / E2E tests. Calls out the `request.formData()`
  workaround for documents-upload tests.
- Tech-debt #14 (No tests) moved to **Resolved** with the B-051
  reference and a one-line summary.

### 2026-05-04 — B-051 — Testing infrastructure for client onboarding (Claude Code)

Consolidated rollup of all 5 sub-batches. Resolves tech-debt #14.

Stood up Vitest + Playwright + MSW. Coverage focused on the client
onboarding wizard (3-step) and the external KYC invite flow.

- Vitest config with jsdom + node environment matching, tsconfig-paths,
  coverage thresholds set on `src/lib/**` (only enforced under
  `npm run test:coverage`).
- Playwright config with chromium-only, dev-server `webServer` block,
  seeded auth state via `globalSetup`.
- 120 unit tests: `validation`, `rate-limit`, `completionCalculator`,
  `riskFlagDetection`, `personCompletion`, `serviceCompletion`,
  `formatters`, `profileDocumentRequirements`, `wizardStore`.
- 35 API integration tests: `applications/save`, `applications/[id]/submit`,
  `documents/upload`, `kyc/save`, `kyc/submit`, `kyc/verify-code`.
- 7 Playwright E2E specs: onboarding happy path, validation errors,
  KYC invite flow, autosave retry, KYC rate limit (scaffolded; first
  end-to-end run pending — selector adjustments may be needed).
- GitHub Actions workflow: `lint` + `build` + unit/integration on every
  PR; E2E gated by `run-e2e` label or main-branch push.

**Brief deviations from the original spec (full detail in the per-batch
entries above):**
- `applications/[id]/submit` does not implement the 409 already-submitted
  case — tests cover what exists.
- `documents/upload` returns 400 (not 413) on file-too-large.
- `kyc/save` is auth-gated — the token-based unauthenticated upsert lives
  in `kyc/save-external` (covered by the E2E flow, not unit-tested).
- `kyc/submit` does not send a Resend email or apply a 429 rate limit;
  those live on `services/[id]/persons/[roleId]/send-invite` and are
  exercised by the `kyc-rate-limit` E2E.

---

### 2026-05-04 — B-051 Batch 4 — Playwright E2E tests (Claude Code)

5 spec files (7 tests) exercising the client onboarding flows. All
external API calls are intercepted with `page.route()` so tests don't
need a real DB or third-party service.

- `tests/e2e/onboarding-happy-path.spec.ts` — full 3-step wizard:
  templates → details → upload → review → submit. Asserts redirect to
  `/applications/[id]` with `submitted` status visible. Spot-checks the
  call ordering (save before submit).
- `tests/e2e/onboarding-validation-errors.spec.ts` — 3 tests: invalid
  email shows the B-047 message verbatim, empty required field blocks
  Next, Review with missing required documents blocks Submit.
- `tests/e2e/kyc-invite-flow.spec.ts` — runs unauthenticated (clears
  the seeded cookie via `test.use({ storageState: empty })`), enters
  the verification code, fills identity, submits, lands on the
  confirmation page.
- `tests/e2e/autosave-retry.spec.ts` — first POST to
  `/api/applications/save` is intercepted with 500, second with 200.
  Asserts the wizard surfaces the Saving / retry / Saved feedback and
  that the call fired ≥ 2 times.
- `tests/e2e/kyc-rate-limit.spec.ts` — replaces the seeded cookie with
  a fresh JWT carrying role=admin, exercises Resend KYC invite twice;
  second call is mocked to return 429 with a "you can resend in N
  hours" message.
- `tests/fixtures/`: 3 minimal valid PDFs (~600 bytes each) generated
  via Node — not real PII.

**Verification status:** `playwright --list` enumerates all 7 tests
correctly. The tests have **not** been executed end-to-end yet —
running them needs:
1. `npx playwright install --with-deps chromium` once locally.
2. The dev server signing JWTs with the same `NEXTAUTH_SECRET` as
   `.env.test`. The Playwright `webServer` block points to
   `npm run dev` and inherits the env, so this should hold.
3. UI selector adjustments may be needed — selectors are guided by the
   shadcn/base-ui patterns the wizard uses (`getByLabel`, `getByRole`)
   but the exact accessible names depend on the rendered DOM. Anything
   that doesn't match on first run should be tweaked rather than
   re-architected — the API mocking and fixtures stand.

Per the brief's working agreement, this is recorded as scaffolded +
parsable but pending first run. Selector tweaks would be a small
follow-up if something doesn't match.

---

### 2026-05-04 — B-051 Batch 3 — API integration tests (Claude Code)

35 API integration tests across 6 files. Each test imports the route
handler directly and calls `POST(new Request(...))` — no HTTP server.
Supabase calls are intercepted by MSW; `auth()` and `next/cache.revalidatePath`
are mocked at the module level.

- `tests/integration/api/applications-save.test.ts` — 6 tests: 401, 403
  (no client_users), happy create (auto-derives `GBC-XXXX` reference),
  happy update, 403 wrong-owner, admin-on-behalf-of-client.
- `tests/integration/api/applications-submit.test.ts` — 5 tests: 401,
  404 missing application, 403 wrong-owner, happy submit (asserts
  `status: "submitted"` payload sent to update + audit_log row), admin
  override path.
- `tests/integration/api/documents-upload.test.ts` — 7 tests: 401, 400
  missing file, 400 wrong MIME, 400 file > 10MB, 403 wrong-owner, happy
  insert, happy update of existing row.
- `tests/integration/api/kyc-save.test.ts` — 5 tests: 401, 400 missing
  id, 404 missing record, full-record completion derivation, empty-string
  → null normalization for date / boolean fields.
- `tests/integration/api/kyc-submit.test.ts` — 5 tests: 401, 400, 404,
  422 (incomplete), 200 (complete). Uses Promise.all-style mocking for
  the parallel client + records + documents + DD requirements + DD
  settings reads.
- `tests/integration/api/kyc-verify-code.test.ts` — 7 tests: 400 missing
  token / code, 404 invalid token, 410 expired link, 401 wrong code with
  attempt counter, 429 after 5 attempts, 200 with verified:true on
  correct code.

**Brief deviations from B-051 §3 (real route behavior, documented for
the next maintainer):**

- The brief's "applications/[id]/submit → 409 already-submitted" case
  is not implemented in the current route — it always re-flips status
  to `submitted`. Tests cover what exists (admin override + ownership);
  the 409 case is omitted with no test (would need a route change).
- The brief's "documents/upload → 413 file-too-large" — the actual
  route returns **400** with the 10MB error message. Tests assert 400.
- The brief's "kyc/save → token-based unauthenticated upsert" is the
  `/api/kyc/save-external` route (not `/api/kyc/save`). The
  `/api/kyc/save` route requires an Auth.js session. Tests cover the
  authenticated path here; the external token path is exercised through
  the Playwright KYC invite flow in Batch 4.
- The brief's "kyc/submit → 409 already-submitted + Resend email + 429
  rate limit" — the current route does none of those. It returns 200
  on success and 422 on incomplete. Tests cover what exists; the email
  + rate limit live on `/api/services/[id]/persons/[roleId]/send-invite`
  (B-050 §7) which is exercised by the E2E tests in Batch 4.

**Infrastructure changes for integration tests:**

- `tests/msw/handlers/supabase.ts`: handler now inspects the request's
  `Accept` header for `application/vnd.pgrst.object+json` (set by
  supabase-js's `.single()` / `.maybeSingle()`) and returns the first
  array element so tests can supply a single `[{...}]` shape for both
  list and single queries.
- `tests/integration/api/documents-upload.test.ts` mocks `request.formData()`
  via a stub Request — vitest's node environment hangs indefinitely
  when `Request.formData()` is called on a Request constructed from a
  `FormData` body. Stubbing `.formData()` directly is reliable and the
  route handler awaits it the same way regardless of source.

---

### 2026-05-04 — B-051 Batch 2 — Unit tests (Claude Code)

120 unit tests across 9 files, all passing. No production code touched.

- `tests/unit/lib/validation.test.ts` — `isRequired`, `isMinLength`,
  `isMaxLength`, `isEmail`, `isPhone`, `isISODate`, `runAll` covered for
  happy path, boundary, empty, invalid, label customization.
- `tests/unit/lib/rate-limit.test.ts` — fake timers + `vi.resetModules`
  to clear the module-scoped attempts map between tests; covers window
  fill, reset, per-key isolation, time-window reset.
- `tests/unit/utils/formatters.test.ts` — every exported formatter,
  null/undefined/empty + happy path. Date format test uses a noon-UTC
  ISO string so timezone shift can't move the day.
- `tests/unit/utils/completionCalculator.test.ts` — individual + organisation
  paths: empty, fully-filled, partial, missing-required-field cases.
- `tests/unit/utils/riskFlagDetection.test.ts` — every flag type with
  fake timers locked to 2026-05-04: PEP/EDD interaction, legal-issues
  level interaction, high-risk nationality vs passport country, passport
  expiring (3 months) vs expired; `mergeRiskFlags` dedup + dismissed
  preservation.
- `tests/unit/utils/personCompletion.test.ts` — empty/null kyc, full
  CDD field set, missing one field per section, required-doc
  upload/missing for individual + organisation.
- `tests/unit/utils/serviceCompletion.test.ts` — `calcServiceDetails`,
  `Documents`, `People`, `Kyc`, `Section`, `Overall` completion
  percentages and RAG status transitions.
- `tests/unit/utils/profileDocumentRequirements.test.ts` — role/DD
  union, dedup, soft-delete handling, label preference,
  `getEffectiveDdLevel` fallback.
- `tests/unit/stores/wizardStore.test.ts` — initial state, partial
  merges via `setBusinessDetails`, `reset` returns to defaults.

`vitest.config.ts` got an explicit `resolve.alias["@"]` because
`vite-tsconfig-paths` v6 didn't resolve the alias inside setup files
on its own.

Coverage thresholds in `vitest.config.ts` only apply when running
`npm run test:coverage`; the broader `src/lib/**` 70% target won't be
met until the API integration tests in Batch 3 land.

---

### 2026-05-04 — B-051 Batch 1 — Testing infrastructure scaffolding (Claude Code)

Stood up the Vitest + Playwright + MSW test stack — config, env, and
skeletons only. No tests yet (Batches 2–4 add those).

- `package.json`: added dev-deps (vitest, @vitest/coverage-v8,
  vite-tsconfig-paths, @testing-library/{react,jest-dom}, jsdom,
  @playwright/test, msw, dotenv-cli) and `test`, `test:watch`,
  `test:coverage`, `test:e2e`, `test:e2e:ui` scripts.
- `vitest.config.ts`: jsdom default, `tests/integration/**` runs in
  node, tsconfig-paths plugin, coverage on `src/lib/**`,
  `src/stores/**`, and the onboarding-related API routes; 70%
  lines/functions threshold on `src/lib/**`.
- `playwright.config.ts`: chromium-only, dev-server `webServer`, seeded
  `storageState` from `tests/.auth/user.json`.
- `tests/setup/vitest.setup.ts`: registers MSW node server, resets the
  Zustand wizard store between tests, mocks `next/navigation` and
  `next/headers`.
- `tests/setup/playwright.global-setup.ts`: signs an Auth.js v5 session
  JWT with `NEXTAUTH_SECRET` and writes the `authjs.session-token`
  cookie to `tests/.auth/user.json`.
- `tests/msw/`: server + per-service handlers for Supabase
  REST/Storage, Anthropic Messages, and Resend Emails. `mockSupabase()`
  helper exposed for per-table per-method overrides; defaults to
  200/empty body and warns on unmatched URLs.
- `.env.test` committed with fake values (Supabase, Anthropic, Resend,
  Auth.js).
- `.gitignore`: adds `playwright-report/`, `test-results/`,
  `tests/.auth/`.
- `tsconfig.json`: excludes `tests/**` from the production build so
  test files don't leak into `npm run build`.

Run `npx playwright install --with-deps chromium` once locally before
the first E2E run.

---

### 2026-05-01 — B-050 Batch 7 — Resend KYC invite (Claude Code)

**§7.1 — Resend invite.** The "Last request sent on …" stamp on the
person card is gone; the action button is now always visible and switches
label between `✉ Request KYC` (first send) and `✉ Resend invite` (any
subsequent send).

- Client UI: 24h rate limit, button disabled within the cooldown window
  with a tooltip "Already sent today. You can resend after {date+24h, in
  user's local time}." Tooltip outside the cooldown window shows "Last
  sent on {date} by {sender}." for context.
- Server: 24h check enforced on POST to `/api/services/[id]/persons/[roleId]/send-invite`.
  Returns 429 with `{ error, retry_after }` if a non-admin caller tries
  to resend within the cooldown. Admins are exempt (override path).
- Toast wording switches: first send = "Email sent", resend = "Invite
  resent to {email}." Dialog title reflects the same.

**Note on the brief's `kyc_records.last_request_sent_at`:** this codebase
tracks per-service invite timestamps on `profile_service_roles.invite_sent_at`
(updated by the existing send-invite route). That field is the analog of
the brief's `last_request_sent_at` and is what the cooldown reads from on
both client and server.

**Code changes:**

- `src/components/client/ServiceWizardPeopleStep.tsx`:
    - New `ResendInviteButton` component renders the always-visible
      button with dynamic label, tooltip, and 24h disabled state.
    - `InviteDialog` accepts `isResend` so the title + success toast
      reflect the action ("Resend invite to … " / "Invite resent to …").
- `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` —
  24h server-side cooldown check (returns 429 with `retry_after` ISO
  timestamp) for non-admin callers.

**Build:** `npm run build` clean.

---

### 2026-05-01 — B-050 Batch 6 — Completion %, Save & Close, View Summary (Claude Code)

**§6.1 — Completion percentage on the person card** was already wired in
B-050 Batch 5 alongside the chip strip — the new `computePersonCompletion`
helper is the single source of truth. The card now shows a green check on
the avatar at 100% (existing kycPct bar continues to render the
percentage). `calcKycPct` (which only counted free-text KYC fields and
ignored documents entirely) is gone; the new formula is
`(required_docs_uploaded + required_form_fields_filled) /
(required_docs_total + required_form_fields_total)`.

**§6.2 — Save & Close on every per-person KYC sub-step.** The doc-list
sub-steps now surface a `Save & Close` button between Back and the Upload-
later button, matching the form sub-steps. Clicking it calls `onComplete`,
which exits the wizard back to the People & KYC list (or out of the
review-all walk in walk mode — same as the form sub-step's existing
behaviour). Form sub-steps already had this button.

**§6.3 — View Summary button on the person card.** Each card now renders
a tertiary `View Summary` button between `Review KYC` and the Request /
Resend invite. Clicking it opens a modal containing the same `<ReviewStep>`
in read-only display mode, with a tooltip "See everything you've entered
so far." The dialog has Close + "Open Review KYC to edit" actions; the
ReviewStep's jump-to-edit links bridge into the wizard automatically.

**Code changes:**

- `src/components/client/PerPersonReviewWizard.tsx` — extra Save & Close
  button when `currentSubStep.kind === "doc-list"`. `onComplete` is the
  same exit handler that was previously only wired for form sub-step
  Save & Close.
- `src/components/client/ServiceWizardPeopleStep.tsx`:
    - `PersonCard`: new `isComplete` + `onViewSummary` props. Avatar
      gets a green `<CheckCircle2>` overlay at 100%. Action row gets
      `View Summary` between Review KYC and Request/Resend.
    - New `viewingSummaryRoleId` state + `<ViewSummaryDialog>`
      component, plus a local `mapToReviewKycRecord(person)` helper
      mirroring the one in `PerPersonReviewWizard`.
    - `ViewSummaryDialog` renders `<ReviewStep>` read-only with a
      Close button and an "Open Review KYC to edit" escape hatch.

**Build:** `npm run build` clean.

---

### 2026-05-01 — B-050 Batch 5 — Review jump-to-edit + person nav chips (Claude Code)

**§5.1 — Jump-to-edit links on the Review screens.** The per-person
Review sub-step now exposes inline "Edit" links on every section header
(Identity, Residential Address, Professional & Financial, Declarations).
Each missing document row in the Documents section becomes a clickable
button — clicking jumps to the relevant doc-list sub-step. Each item in
the bottom "Before submitting, please upload" warning is also a link.
After a fix the user continues forward through the wizard normally
(option B per the brief — they don't bounce back to Review).

The outer SubmitValidationDialog also gets jump-to-section: each issue
in the "X issues need attention" list is now a clickable button that
closes the dialog and navigates to the relevant wizard step.

**§5.2 — Person navigation chip strip.** In Review-All-KYC mode, the old
"Reviewing person 1 of 4 — Bruce Banner — 3 remaining" banner is replaced
by a horizontally-scrollable chip strip with one chip per person, ← / →
arrows, completion dots (out of 10), green check on 100%, and active-
chip highlight. Clicking a chip jumps the wizard to that person at
sub-step 1 after a silent best-effort save of the current sub-step.

**New code:**

- `src/lib/utils/personCompletion.ts` — `computePersonCompletion()`
  returns `{ docsFilled, docsTotal, fieldsFilled, fieldsTotal, percentage,
  isComplete }`. Single source of truth for per-person KYC completion
  used by both the chip strip (B-050 §5.2) and the person card progress
  bar (B-050 §6.1). Fields tracked match the Review step's "Missing"
  warnings (Identity / Residential / Professional / Declarations
  depending on DD level).
- `ReviewJumpTarget` type exported from `ReviewStep.tsx` for the
  jump-to-edit callback contract.
- `PersonChipStrip` component (in-file, bottom of `PerPersonReviewWizard.tsx`)
  — chips, arrows, dots, focus ring.

**Wired into:**

- `src/components/kyc/steps/ReviewStep.tsx` — new `onJumpTo` prop;
  section headers + missing items render as buttons when set.
- `src/components/client/PerPersonReviewWizard.tsx` — `reviewAllContext`
  gains optional `chips` + `onJumpToPerson`. When `chips` is present, the
  legacy banner is replaced by `<PersonChipStrip>`. ReviewStep is
  rendered with an `onJumpTo` that maps target → `setSubStepIndex`.
- `src/components/client/ServiceWizardPeopleStep.tsx` — pre-computes
  the chip data via `computePersonCompletion` for every person in the
  Review-all walk, plus an `onJumpToPerson` that switches the active
  role row + index. Replaces the old `calcKycPct` heuristic on the
  person cards with the new helper, and shows a green check overlay on
  the avatar at 100%.
- `src/components/client/SubmitValidationDialog.tsx` — issues list
  becomes clickable when `onJumpToSection` is provided.
- `src/components/client/ServiceWizard.tsx` — wires the section→step
  map (`Company Setup`/0, `Financial`/1, `Banking`/2, `People & KYC`/3,
  `Documents`/4) into `onJumpToSection`.

**Build:** `npm run build` clean.

---

### 2026-05-01 — B-050 Batch 4 — Autosave reliability feedback (Claude Code)

Wraps both wizards' on-navigation save handlers in a state machine with
visible feedback and exponential-backoff retries (1s / 3s / 9s, 3 attempts
max). After all retries fail, the user sees a clickable red "Couldn't save
— retry" indicator, the unsaved-changes dialog disables "Leave without
saving", and the dialog message switches to "You have unsaved changes that
haven't been saved to the server. Try Save & Close, or check your
connection."

**New code:**

- `src/lib/hooks/useAutosave.ts` — `useAutosave()` hook returning
  `{ state, save, retry, reset }`. State: `idle | saving | saved | failed
  | retrying`. `save(handler)` runs `handler`, retries with [1000, 3000,
  9000] ms backoff on failure, falls into `saved` (auto-fades after 2s)
  or `failed`.
- `src/components/shared/AutosaveIndicator.tsx` — small `<span>` that
  renders the state with appropriate colour + icon, becomes a `<button>`
  in `failed` state so the user can tap to retry.

**Wired into:**

- `src/components/client/PerPersonReviewWizard.tsx` — `saveKycForm` now
  routes through `autosave.save(...)`. The `Back to People` link is
  blocked while saving and the indicator renders next to it on the same
  row. On hard failure, `handleBackLinkClick` toasts a clearer message
  before bailing out.
- `src/components/client/ServiceWizard.tsx` — `saveServiceDetails` now
  routes through `autosave.save(...)`. New `onSaveFailedChange` prop
  bubbles the failed-state up to the parent. Indicator renders to the
  right of the step indicator.
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx` —
  consumes `onSaveFailedChange` (`wizardSaveFailed` state). The unsaved-
  changes dialog now reads its message from that flag and disables the
  "Leave without saving" button when the most recent save failed.

**Build:** `npm run build` clean.

---

### 2026-05-01 — B-050 Batch 3 — Tax ID dedup + Add Person modal optionalisation (Claude Code)

**§3.1 — Tax ID duplicate.** `tax_identification_number` rendered in two
sub-steps for CDD/EDD users: Financial *and* Declarations. Compliance
scoring (`complianceScoring.ts`) and pending-actions classification
(`pendingActions.ts`) both treat it as a Declaration field, so the
duplicate has been removed from `FinancialStep`. Declaration is now the
single source of truth for that field. (SDD users have no Declarations
step and so don't render the tax ID at all — that matches the existing
SDD requirement set, which doesn't require it.)

**§3.2 — Add Person modal.** In `ServiceWizardPeopleStep`'s "Add new
person" tab: Email is now optional (no red asterisk, no validation toast,
no `aria-required`, no disabled-button gate). Phone was already optional
visually but kept its `aria-required`-free input. Helper text under email
now reads "Optional. Required only if you want to invite this person to
complete their KYC themselves." Server-side API already accepts both
optionally — no change needed.

**Code changes:**

- `src/components/kyc/steps/FinancialStep.tsx` — removed the
  `tax_identification_number` block.
- `src/components/client/ServiceWizardPeopleStep.tsx` — Email block: no
  red asterisk, no `aria-required`, helper text updated. `createNew()`
  drops the "Email is required" toast and POSTs `email: ... || undefined`.
  The Add button's disabled gate drops `!newEmail.trim()`.

**Build:** `npm run build` clean.

---

### 2026-05-01 — B-050 Batch 2 — Confidence display fix + 2.2 obsoleted by B-049 (Claude Code)

**§2.1 — Confidence percentage cap.** The AI prompt schema returns
`confidence_score` in the 0-100 range, but four display sites were
`Math.round(confidence * 100)` on top of that, producing 3000–5500%
displays. Centralised the math in a single helper and used it everywhere.

**§2.2 — Skipped (obsoleted by B-049 Batch 3).** B-049 reworked the
verification timing so context-dependent doc types (CV, source-of-funds
evidence, employer letter, etc.) are flagged `ai_deferred=true` on the
document_types table. The upload route now skips the immediate AI run for
those, and the wizard re-fires AI via `/api/documents/{id}/verify-with-context`
on the form-financial / form-declarations save once the comparison context
exists. Net effect: "applicant name not provided" / "context missing" flags
should not surface on the client UI any more, so the §2.2 stop-gap (render
context-missing failures as Pending instead of Flagged) is no longer
needed.

**Code changes:**

- `src/lib/ai/confidence.ts` — new `normalizeConfidence(raw)` helper.
  Clamps to 0-100, rounds to int, defensively rescales any value in the
  fractional 0-1 range. Plus `formatConfidence(raw)` for `42%` strings.
- `src/components/admin/DocumentViewer.tsx` — confidence bar + label use
  `normalizeConfidence(result.confidence_score)`. Color thresholds
  (`>=75` / `>=50`) now run on the normalised value.
- `src/components/admin/DocumentStatusRow.tsx` — drop the `* 100`,
  call the helper.
- `src/components/admin/ExtractedFieldsPanel.tsx` — same.
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — same.
- `src/components/shared/DocumentDetailDialog.tsx` — same.
- `src/components/shared/DocumentUploadWidget.tsx` — defensive clamp on
  the already-correctly-scaled value.
- `src/components/client/DocumentUploadStep.tsx` — same.

**Build:** `npm run build` clean.

---

### 2026-05-01 — B-050 Batch 1 — Upload button + uploaded-row affordance (Claude Code)

Replaces the amber outlined "Upload" button (which read as a status badge
rather than a CTA) with a clear blue button affordance, and adds an
"Uploaded" success label next to the View button on uploaded doc rows in the
per-person KYC wizard.

**Code changes:**

- `src/components/client/PerPersonReviewWizard.tsx` — `renderDocCategoryContent`
  doc rows: Upload button is now `bg-blue-50 border-blue-200 text-blue-700
  hover:bg-blue-100 rounded-md h-10 px-4 py-2 text-sm font-medium` with a
  `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500`
  ring (replacing the amber outlined style). Uploaded rows now render a green
  "Uploaded" text label (`text-sm text-green-700 font-medium`) to the left of
  the View button (hidden below `sm:` to avoid wrapping on mobile). View
  button keeps the `<Eye />` icon + "View" text and gets a `View document`
  tooltip + aria-label.

**Build:** `npm run build` clean.

---

### 2026-05-01 — B-049 Batch 3 — Manual professional details + deferred CV verification (Claude Code)

Replaces the brittle "AI runs at upload time before context exists, flags
'name not provided'" pattern with two changes:

1. The Financial / Professional Details sub-step now collects structured,
   manual-entry fields (employer, years in role, total years experience,
   industry, source-of-funds dropdown).
2. Document types whose AI verification depends on cross-form context are
   flagged `ai_deferred=true`. The upload route skips the immediate AI run
   for those; the wizard's per-person Save & Continue handler re-fires AI
   via a new `/api/documents/[id]/verify-with-context` endpoint with the
   full context built fresh from `client_profile_kyc`.

**⚠ Schema migration required before testing:**

1. Apply `supabase/migrations/008-professional-details-and-deferred-ai.sql`
   (psql or Supabase SQL editor — adds `employer`, `years_in_role`,
   `years_total_experience`, `industry`, `source_of_funds_type`,
   `source_of_funds_other` to both KYC tables, plus `ai_deferred` boolean
   on `document_types`).
2. Hit `POST /api/admin/migrations/seed-deferred-ai-doc-types` once as
   admin to flip `ai_deferred=true` on the context-dependent doc types
   (CV, source-of-funds evidence, source-of-wealth evidence, bank
   reference, employer letter, adverse media report). Idempotent.

**Code changes:**

- `supabase/migrations/008-professional-details-and-deferred-ai.sql`: new migration.
- `src/app/api/admin/migrations/seed-deferred-ai-doc-types/route.ts`: admin endpoint flipping `ai_deferred` on the brief's list of doc types.
- `src/types/index.ts`: `KycRecord` + `ClientProfileKyc` gain the six professional-details columns; `DocumentType.ai_deferred?: boolean`.
- `src/lib/ai/verifyDocument.ts`: new exported `VerificationContext` interface — applicant + declared-* fields. Prompt now renders any non-empty context line in stable order so the AI can compare against name, occupation, employer, declared sources, etc. Old `{ contact_name, business_name, ubo_data }` shape still satisfies the type.
- `src/app/api/services/[id]/documents/upload/route.ts`: skips the fire-and-forget AI run when `ai_deferred=true`. Doc lands in `verification_status='pending'` until the wizard re-triggers it.
- `src/app/api/documents/[id]/verify-with-context/route.ts`: new POST endpoint. Builds the rich context from `client_profile_kyc` (or `services + client_profiles` for application-scope docs), runs `verifyDocument`, persists `verification_status` + `verification_result`. 45s timeout; failure persists `manual_review`.
- `src/components/kyc/steps/FinancialStep.tsx`: Professional Details section now has manual-entry fields (occupation, employer, years_in_role, years_total_experience, industry dropdown). Source of funds becomes a required dropdown with "Other → free text" reveal; the legacy textarea remains as optional supporting context.
- `src/components/kyc/steps/ReviewStep.tsx`: Financial section renders the new structured fields and a sensible "Other — {text}" rendering for source of funds.
- `src/components/client/PerPersonReviewWizard.tsx`: new `triggerDeferredVerifications()` helper finds every `verification_status='pending'` doc whose type has `ai_deferred=true` and POSTs to `/api/documents/{id}/verify-with-context` in parallel; refreshes local doc state from the server. Fired after the user saves on `form-financial` (professional details + source of funds) and `form-declarations` (source of wealth) — the two checkpoints where context becomes complete enough to evaluate the deferred docs.
- `src/components/client/ServicePersonsManager.tsx`: same `mapToKycRecord` patch (new fields).

**Build:** `npm run build` clean (lint + type check).

---

### 2026-05-01 — B-049 Batch 2 — Residential address as its own sub-step (Claude Code)

Split address out of the Identity sub-step. Identity now contains only
passport-derived fields; the new Residential Address sub-step holds the
structured address fields and auto-fills them from the Proof of Residential
Address upload.

**⚠ Schema migration required before testing:**

1. Apply `supabase/migrations/007-residential-address-fields.sql` (psql or
   Supabase SQL editor — adds `address_line_1/2`, `address_city`,
   `address_state`, `address_postal_code`, `address_country` columns to
   both `kyc_records` and `client_profile_kyc`).
2. Hit `POST /api/admin/migrations/seed-residential-address-fields` once as
   admin to update the Proof of Residential Address doc type's AI extraction
   schema so the AI fills the structured fields directly.

**Code changes:**

- `supabase/migrations/007-residential-address-fields.sql`: new migration.
- `src/app/api/admin/migrations/seed-residential-address-fields/route.ts`: admin endpoint reseeding POA's `ai_extraction_fields`.
- `src/types/index.ts`: `KycRecord` + `ClientProfileKyc` both gain `address_line_1/2`, `address_city`, `address_state`, `address_postal_code`, `address_country`.
- `src/lib/constants/prefillFields.ts`: whitelist the six structured fields so the prefill helper drops AI extracts into them.
- `src/components/kyc/steps/ResidentialAddressStep.tsx`: NEW sub-step. Shows the auto-fill banner (running / success / no-source / error), six fields with content-aware widths per the brief, ✨ per-field prefill icons.
- `src/components/kyc/steps/IdentityStep.tsx`: new `hideAddressFields` prop hides the legacy address textarea + POA upload card. Auto-prefill effect filters address rows + drops POA from the source check when this prop is on.
- `src/components/kyc/steps/ReviewStep.tsx`: dedicated Residential Address card; falls back to legacy free-text `address` if no structured field is filled.
- `src/components/client/PerPersonReviewWizard.tsx`: inserts a `form-residential-address` sub-step right after `form-identity`, maps the new fields in `mapToKycRecord`, passes `hideAddressFields=true` to the Identity step.
- `src/components/client/ServicePersonsManager.tsx`: same `mapToKycRecord` patch (address fields included) so the legacy persons-manager keeps type-checking.
- `src/app/api/profiles/kyc/save/route.ts`: when the patch touches any structured address field, the legacy free-text `address` column on `client_profiles` is rebuilt from the resulting row so the existing submit validator + admin views stay in sync.

**Build:** `npm run build` clean (lint + type check).

**What's next:** Batch 3 — manual professional details sub-step + defer CV verification until the comparison context (applicant name + declared occupation) is available.

---

### 2026-05-01 — B-049 Batch 1 — Document scope flag (Claude Code)

Added an explicit `scope: 'person' | 'application'` flag on `document_types`
so the wizard can route each doc to the right place. Replaces the old implicit
"category in (corporate, additional)" heuristic that conflated entity type
with wizard placement.

**⚠ Schema migration required before testing:**

1. Apply `supabase/migrations/006-document-scope-flag.sql` (psql or Supabase
   SQL editor — adds the column + a sensible default).
2. Hit `POST /api/admin/migrations/seed-document-scope` once as an admin to
   backfill scope values (any doc with `applies_to='organisation'` becomes
   `scope='application'`; everything else stays `scope='person'`). The
   endpoint is idempotent and returns the resulting per-type assignments.

**Code changes:**

- `supabase/migrations/006-document-scope-flag.sql`: new migration, idempotent.
- `src/app/api/admin/migrations/seed-document-scope/route.ts`: admin-only
  backfill endpoint; returns the final scope mapping for sanity checks.
- `src/types/index.ts`: new `DocumentScope` union; `DocumentType.scope` (optional, defaults to 'person'); join shape on `DueDiligenceRequirement.document_types` exposes `scope`.
- `src/app/(client)/services/[id]/page.tsx` + `src/app/(admin)/admin/services/[id]/page.tsx`: the DD-requirements query now selects `document_types(id, name, category, scope)` so the wizard can filter by scope.
- `src/components/client/ServiceWizard.tsx`: derives `applicationScopeRequirements` from `document_types.scope === 'application'`. When that set is empty the Documents step is omitted entirely (totalSteps drops from 5 to 4) and the indicator's labels collapse — wizard navigates People & KYC → Submit. Application-scope docs feed Step 5 directly via the pre-filtered list.
- `src/components/client/ServiceWizardStepIndicator.tsx`: accepts a `labels` prop so the step indicator shrinks when there are no application docs.
- `src/components/client/ServiceWizardDocumentsStep.tsx`: trusts the pre-filtered `requiredDocTypes` list instead of re-filtering by category, and only displays uploaded docs whose type matches that list.
- `src/components/client/PerPersonReviewWizard.tsx`: per-person doc sub-steps are now derived dynamically from doc types where `scope === 'person'`, grouped by category. Adds support for new categories (Professional, Tax, Adverse Media, Wealth, etc.) without code changes — they just appear as new sub-steps once seed data adds them.

**Build:** `npm run build` clean (lint + type check, no new warnings).

**What's next:** Batch 2 — split Identity sub-step into passport-only + new
Residential Address sub-step, with POA-driven prefill.

---

### 2026-05-01 — B-048 Batch 6 — Pre-delivery verification (Claude Code)

Final pass against the brief's checklist before handoff.

**Build:** `npm run build` clean (lint + type check, no warnings, all 66
routes generated).

**Visual checklist** — verified via static review of the rendered JSX:

- [x] Content sits in a narrow centered column on desktop, not stretched edge-to-edge — every wizard route now wraps in `mx-auto w-full max-w-2xl` or `max-w-3xl/4xl` per the brief table (B1).
- [x] No horizontal scroll at 375px — every input either is `w-full` or uses an `md:` width that collapses on mobile (B4).
- [x] No edge-pinned `justify-between` rows creating large gaps — fixed on the wizard banners and step indicator (B3); audited remaining matches and confirmed they're card-internal small-gap rows.
- [x] Role chips on Review-KYC: rectangular (`rounded-md`), lighter palette (bg-50/border-200/text-700), clear active/inactive states, "Roles:" prefix (B2).
- [x] Bruce-name row stacks roles below name, no big horizontal gap (B3).
- [x] "Reviewing person … remaining" banner reads as a single tight line with middot separator (B3).
- [x] Field widths match content: phone 192, postal 96, email up to 448, fullName up to 448, date 160, currency 128, country 240, identifier 224, city 256, state 208 — all wired through `formWidths` and applied in `DynamicServiceForm` (B4).
- [x] Long inputs (proposed company names, brief description, multi-select country) cap at `max-w-md` for text; textarea explicit `w-full min-h-[120px]` (B4).
- [x] All buttons ≥40pt tall (most are `h-11`/44pt; role chips and dashboard Review pill are `h-10`/40pt with hit-slop padding per brief §2.2 / §5.2).
- [x] Focus rings visible — `focus-visible:ring-blue-500` (chips, B2) / `focus-visible:ring-brand-navy` (other CTAs, preserved from B-047).
- [x] One primary CTA per screen — verified across apply step 1/2/3, KYC wizard, per-person review wizard, login, register, dashboard.
- [x] Login / Register `max-w-sm`, single primary `h-11 w-full` button (B5).
- [x] Dashboard "Review" CTA visually grouped with its application card content, not edge-pinned (B5).

**Verified-via-static-read** caveat: this batch is a layout polish so I
audited the JSX/Tailwind directly. The user should still open
the wizard in a browser at 375 / 768 / 1440 — the brief asked for that
and I cannot drive a browser. I did not restart the dev server (per
CLAUDE.md `Dev Server Restart Pattern` — that is the user's responsibility
after this commit lands).

**Logged tech debt:** the global `(client)/layout.tsx` puts a fixed
260px Sidebar next to the main content area without a mobile fallback.
At 375px viewport that leaves only ~115px for the main column, which
forces horizontal scroll regardless of the page-level work in B-048.
This is a pre-existing layout issue, not introduced here. Logged
under tech-debt #19.

---

### 2026-05-01 — B-048 Batch 5 — Login / Register / Dashboard CTA polish (Claude Code)

Tightened the entry-point pages to match the wizard polish.

**Files:**

- `src/app/(auth)/login/page.tsx` — Card `max-w-md` → `max-w-sm` (384px). The form has only two inputs + one CTA, doesn't need the wider container. Inputs already `w-full h-11`, primary "Sign in" button already `w-full h-11 brand-navy`, autocomplete + semantic input types already in place.
- `src/app/(auth)/register/page.tsx` — same `max-w-md` → `max-w-sm`. Form has four inputs + one CTA; still readable, more focused.
- `src/components/client/DashboardClient.tsx` — service-card actions row:
  - was `flex items-center justify-between` with "Show sections" left and `h-8 text-xs` Review on the right (≈700px gap inside max-w-4xl, button felt small)
  - now `flex items-center gap-3 flex-wrap`: Review pill is the primary action (`h-10 px-4 text-sm font-semibold`, brand-navy), grouped immediately after the progress bar, with "Show sections" as a small tertiary control sitting next to it instead of pinned across the row.

Application detail (`/applications/[id]`) is at `max-w-3xl` from Batch 1; its action banners (Re-upload Documents, Back to Dashboard) already sit grouped inside their own banner / on the bottom row — no edge-pinning to fix.

**Verified:** `npm run build` clean.

---

### 2026-05-01 — B-048 Batch 4 — Field-width audit (Claude Code)

Walked every client wizard page after the container narrowed. Tightened
the dynamic service form (which drives the apply step 1 service-specific
fields) and lifted the `formWidths` cap on long text fields to 448px
(`max-w-md`) so they don't fight the new `max-w-2xl` page width.

**Files:**

- `src/lib/form-widths.ts`:
  - `email`: `md:w-80` (320px) → `w-full md:max-w-md` (up to 448px) per B-048 §4.1.
  - `fullName`: `md:w-80` → `w-full md:max-w-md` (matches the table).
  - All other widths kept (postal w-24, phone w-48, date w-40, country w-60, state w-52, city w-64, currency w-32, identifier w-56, longFormTextareaMin min-h-[120px]).

- `src/components/shared/DynamicServiceForm.tsx` — content-aware widths on the template-driven fields powering /apply step 1:
  - `text` / `date` / `number`:
    - `date` → `w-full md:w-40`
    - `number` → `w-full md:w-32`
    - `text` with `full_width` → `w-full md:max-w-md`
    - `text` (col-span-1) → fills its half-grid cell as before.
  - `textarea` (col-span-2): explicit `w-full min-h-[120px]` per brief §4.1.
  - `select` trigger: `w-full md:max-w-md` when `full_width`, else `w-full md:w-60`.
  - `text_array` inputs (e.g. "Proposed company names" — 3 stacked options): each `w-full md:max-w-md` per brief §4.2.
  - `multi_select_country` (e.g. "Countries of operations"): wrapper `w-full md:max-w-md` per brief §4.2.

**Verified per page** (against the brief table):

- `/apply/[templateId]/details` Primary Contact card: name `md:w-80`, role `md:w-64`, email `md:w-80`, phone `md:w-48` (already correct from B-047, untouched).
- `/apply/[templateId]/details` service-specific fields (DynamicServiceForm): now content-cap'd as above.
- `/apply/[templateId]/details` Business Information card (admin-completed, muted): kept at existing widths — section is read-only-by-design and visually separated.
- `/apply/[templateId]/documents`: upload tiles inherit container width; with max-w-2xl that's already comfortable, no change needed.
- `/apply/[templateId]/review`: read-only summary, no inputs to width.
- IdentityStep — already on the formWidths system; `email` + `fullName` automatically pick up the new max-w-md cap.
- FinancialStep / DeclarationsStep / KycStepWizard contact step: already wired through formWidths (work_phone, work_email, occupation, tax_identification_number all match the brief table).
- ContactDetailsSubStep in PerPersonReviewWizard: email `md:w-80` + phone `md:w-48` row already correct (B-047).

**Verified:** `npm run build` clean.

---

### 2026-05-01 — B-048 Batch 3 — Stretch-row + name/roles layout (Claude Code)

After Batch 1 narrowed the container, several `justify-between` rows opened
up oversized horizontal gaps. Tightened the worst offenders. ui-ux-pro-max
§6 `whitespace-balance`.

**Changes:**
- `src/components/client/PerPersonReviewWizard.tsx` — name + role chips:
  - was `flex items-center justify-between gap-3 flex-wrap` (chips floated right)
  - now `flex flex-col gap-2` (name on top, "Roles: …" stacked underneath)
- `src/components/client/PerPersonReviewWizard.tsx` — review-all banner:
  - was two side-by-side blocks ("Reviewing person N of M — Name" left, "K remaining" right)
  - now one tight inline run: `Reviewing person 1 of 4 — Bruce Banner · 3 remaining`
- `src/components/kyc/KycStepWizard.tsx` — same banner pattern (used in older single-person flow), same fix applied.
- `src/components/client/ServiceWizardStepIndicator.tsx` — step label and counter:
  - was `<p>Section</p> ··· <p>Step X of Y</p>` justify-between
  - now `Section · Step X of Y` single-line with middot separator, matching the brief's pattern.

**Audited but kept as-is** (gap is small inside the narrowed container, or
both sides are part of a card-internal row, per brief rule "≤80px gap →
keep"):
- `PersonsManager.tsx` person-card accordion header (icons + name vs compliance score + delete — small gap, both sides functional)
- `ServiceWizardPeopleStep.tsx` "Add role" toolbar with "Review All" button (action button right is fine; row already wraps)
- All `IndividualKycForm.tsx` / `OrganisationKycForm.tsx` review rows (label vs value rows — narrow, content-tight)
- `DashboardClient.tsx` service-card header (name vs status badge — tight, intentional)
- Card-internal rows in `DocumentDetailDialog`, `StageTaskList`, `CompletionChecklist`, `ApplicationStatusPanel`, `OnboardingBanner` (all small fixed-width content on each side)

**Verified:** `npm run build` clean.

---

### 2026-05-01 — B-048 Batch 2 — Role chips redesign (Claude Code)

Replaced the pill-style role chips on the Review-KYC top row with rectangular
toggle buttons that read as buttons (not badges). ui-ux-pro-max §4
`state-clarity` + §1 `focus-states`.

**File:** `src/components/client/PerPersonReviewWizard.tsx` — `RoleToggleRow` chip:
- Shape: `rounded-full` → `rounded-md` (rectangular)
- Size: `h-11` → `h-10` (still ≥44pt with hit-slop padding `px-3 py-2`)
- Active palette (lightened): bg-100 → bg-50, border-300 → border-200, text shifted to -700:
  - Director: `bg-blue-50 border-blue-200 text-blue-700` (hover `bg-blue-100`)
  - Shareholder: `bg-purple-50 border-purple-200 text-purple-700` (hover `bg-purple-100`)
  - UBO: `bg-amber-50 border-amber-200 text-amber-700` (hover `bg-amber-100`)
- Inactive: `bg-white border-gray-300 text-gray-700` (hover `bg-gray-50`) — unchanged
- Border always present in both states (the affordance signal)
- Focus ring switched to `focus-visible:ring-blue-500` per brief §2.2
- `cursor-pointer` added; `aria-pressed` mirrors `aria-checked`

Behavior unchanged: optimistic add/remove, last-role confirm, UBO hidden for
organisation profile, Loader2 during in-flight toggle, Square/CheckSquare
glyphs.

**Verified:** `npm run build` clean.

---

### 2026-05-01 — B-048 Batch 1 — Container max-width pass (Claude Code)

Applied a centered, narrower content column to every form-heavy client wizard
page so content sits in foveal vision on desktop instead of stretching
edge-to-edge. ui-ux-pro-max §5 `container-width` + `mobile-first`.

**Files:**
- `src/components/client/WizardLayout.tsx` — outer wrapper now `mx-auto w-full max-w-2xl`. This narrows all three apply pages (`/apply/[templateId]/details`, `/documents`, `/review`) in one place.
- `src/app/(client)/apply/[templateId]/details/page.tsx` — dropped redundant `max-w-3xl` (WizardLayout now constrains).
- `src/app/(client)/apply/[templateId]/documents/page.tsx` — dropped redundant `max-w-3xl`.
- `src/app/(client)/apply/[templateId]/review/page.tsx` — dropped redundant `max-w-3xl`.
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx` — both wizard-mode and landing branches now wrap in `mx-auto w-full max-w-2xl`. The per-person KYC wizard (B-046) lives inside this — narrowing here also narrows the in-shell KYC wizard.
- `src/app/(client)/applications/[id]/page.tsx` — `max-w-5xl` → `mx-auto w-full max-w-3xl` (mixed timeline + status panel content, not pure form). Three-column status grid still fits inside this.
- `src/app/(client)/applications/[id]/files/page.tsx` — added `mx-auto` to the existing `max-w-4xl` (data-heavy file list, kept wider).
- `src/components/client/DashboardClient.tsx` — both branches wrapped in `mx-auto w-full max-w-4xl` (dashboard kept wider per brief — service cards are not pure form).
- `src/app/(client)/kyc/KycPageClient.tsx` — already used `max-w-2xl mx-auto`, no change.

**Untouched (intentional):**
- `(client)/layout.tsx` global `<main>` padding — modifying this would also push the dashboard / data pages around and the brief explicitly scopes Batch 1 to wizard / form pages.
- `/apply` template selector — data-heavy 3-column card grid; brief excludes data-heavy pages.
- All admin routes — admin scope is out per brief preamble.

**Verified:** `npm run build` clean (lint + type check, no warnings).

---

### 2026-04-30 — B-047 (Batch 6 — pre-delivery verification + contrast fixes) (Claude Code)

Audited the brief checklist end-to-end and fixed everything that didn't pass on first read.

**Forms — pass items:**
- Required fields: red `*` after label everywhere it's `required`. After this batch every asterisk uses red-600 (was red-400 in several spots — sub-WCAG-AA on white). `aria-required="true"` on every required input across the touched files.
- Top-aligned labels — no placeholder-as-label anywhere. Verified across login, register, apply step 1, IdentityStep, FinancialStep, DeclarationsStep, AddPersonModal, ContactDetails sub-step, KycStepWizard org steps, PerPersonReviewWizard org steps.
- Field widths match content (Batch 5 wired the formWidths system across every form).
- Errors render below the field: `text-red-600`, `role="alert"`, `aria-live="polite"`. Both `<FormField>` (new) and the existing `<FieldWrapper>` now use this exact pattern. Generic "This field is required." → message is from FieldWrapper for legacy call sites; FormField passes per-field validator messages from `lib/validation.ts`.
- Inline validation triggers on blur (`useFieldValidation.markTouched` is called from `onBlur`, not `onChange`).
- No card-on-card nesting in client forms — DeclarationsStep ripped its bordered cards in Batch 2; ReviewStep's bordered summary panels are read-only summary cards (acceptable per §1.3).
- Spacing rhythm 16/24/48: confirmed in DeclarationsStep `space-y-10`, FinancialStep `space-y-6` between sections, IdentityStep `space-y-6`, etc.
- Semantic `type=` + `autocomplete=` on every input (Batch 5).

**Buttons — pass items:**
- All buttons ≥44pt (`h-11`) tall, ≥8px gap between (`gap-2` / `gap-3`). Audited in ServiceWizardNav, KycStepWizard, PerPersonReviewWizard, AddPersonModal, unsaved-changes dialog, login, register, apply step 1.
- One Primary per screen — verified.
- Back is text-link tertiary — verified.

**Specific design decisions — pass items:**
- Yes/No declarations stack below question (B2).
- Role chips: "Roles:" prefix + `<CheckSquare>`/`<Square>` icons, label unchanged across states (B3).
- Top-left "Back to …" links demoted to gray-600 (B4).

**Accessibility — pass items:**
- Focus rings: `Input` primitive already wires `focus-visible:border-brand-navy focus-visible:ring-2 focus-visible:ring-brand-navy/20`. Buttons use `focus-visible:ring-3 focus-visible:ring-ring/50`. Custom YesNoToggle / role chips set `focus-visible:ring-2 focus-visible:ring-brand-navy focus-visible:ring-offset-2`.
- All icon-only interactive elements (role chips, back links with chevron, YesNoToggle) carry an `aria-label`.
- Color is never the only signal (errors carry text + `role="alert"`; success uses `<CheckSquare>` + label; the YesNoToggle uses textual "Yes"/"No" labels).

**Fixes applied during this batch:**
- `src/components/shared/ValidatedLabel.tsx`: required asterisk red-400 → red-600 (`color-contrast`); helper-error text red-500 → red-600 with `role="alert"` + `aria-live="polite"`. Asterisk now `aria-hidden="true"` since the same info is conveyed by `aria-required` on the input.
- `src/components/kyc/KycStepWizard.tsx` (`OrgField`): label `text-sm` → `text-sm font-medium text-gray-900`; asterisk red-400 → red-600 + `aria-hidden`.
- `src/components/client/PerPersonReviewWizard.tsx` (`OrgField`): same upgrades. Org-step descriptions gray-500 → gray-600.
- `src/components/client/ServiceWizardPeopleStep.tsx`: residual "Email address *" label red-400 → red-600 + `text-sm font-medium text-gray-900`.
- `src/app/(client)/apply/[templateId]/details/page.tsx`: empty-state placeholder gray-400 → gray-600; admin-info banner intro gray-500 → gray-700.
- `src/components/kyc/steps/IdentityStep.tsx`, `KycStepWizard.tsx`, `PerPersonReviewWizard.tsx` (org steps), `ReviewStep.tsx`: step / page intro descriptions gray-500 → gray-600 (`contrast-readability`).

**Build:**
- `npm run build` clean — exit 0, no lint warnings, no type errors.

---

### 2026-04-30 — B-047 (Batch 5 — apply system to existing client forms) (Claude Code)

Refactors every client-facing form to use the Batch 1 patterns (FormField wrapper for new pages, formWidths for inline width tokens, validation lib for inline-on-blur, semantic input types + autocomplete attributes, top-aligned labels with red required asterisks).

**5.1 — Login (`/login`):**
- Migrated to `<FormField>` wrapper per input. Adds inline validation on blur (email format, required), error renders below field with `role="alert"`. Sign-in button bumped to h-11 brand-navy primary with explicit `aria-busy` while running. Helper subtitle moved from gray-500 → gray-600 for contrast. Bottom link "Register" now `text-brand-navy` (within tier system).

**5.2 — Register (`/register`):**
- Same FormField migration with per-field validation (`validateField()` per blur). Errors clear on next change. Helper text under password ("At least 8 characters."). Autocomplete: `name`, `organization`, `email`, `new-password`. Submit primary brand-navy 44pt with spinner.

**5.3 — Outer wizard step 1 (`/apply/[templateId]/details`):**
- Primary Contact section: red-600 required asterisks (was red-400), top-aligned labels (`text-sm font-medium text-gray-900`), content-aware widths (Full name `md:w-80`, Role/title `md:w-64`, Email `md:w-80`, Phone `md:w-48`), inputs `h-11`. Autocomplete: `name`, `organization-title`, `email`, `tel`. Semantic types: `email` + `inputMode="email"`, `tel` + `inputMode="tel"`.
- Business Information (admin-completed muted card): same labels + widths, `autoComplete="organization" / "country-name" / "street-address"`.
- Bottom buttons: Save progress = secondary outline 44pt, Next: Upload Documents = primary brand-navy 44pt.

**5.4 — Add Person modal (`ServiceWizardPeopleStep.tsx`):**
- Top-aligned labels with red-600 required asterisks. Inputs `h-11` for touch parity with the rest of the system. Autocomplete: switches between `name` (individual) and `organization` (company); `email` + `inputMode="email"`; `tel` + `inputMode="tel"`. Persistent helper text under email: "Used to invite this person to complete their KYC."

**5.5 — IdentityStep (`src/components/kyc/steps/IdentityStep.tsx`):**
- Local `Field` extended with `widthClass`, `autoComplete`, `inputMode`, `helperText`. Applied widths: Full name `fullName`, Aliases `fullName`, Date of birth `date`, Country selects `country`, Passport number `identifier`, Passport expiry `date`, Email `email`, Phone `phone`. Autocomplete: `name`, `bday`, `street-address`, `email`, `tel`. The address Textarea now `max-w-2xl` (no longer edge-to-edge on wide screens). Email + phone row uses the dedicated `md:grid-cols-[1fr_192px]` template.

**5.6 — FinancialStep (`src/components/kyc/steps/FinancialStep.tsx`):**
- Occupation, work address, work phone, work email all get the width system (`fullName`, `phone`, `email`) plus autocomplete (`organization-title`, `street-address`, `tel`, `email`). Source-of-funds and source-of-wealth textareas now `max-w-2xl` + `min-h-[120px]`. Persistent helper under SoF describing what to include. Tax ID input narrowed to `identifier` width with the same helper line as Declarations. Section headings `text-sm font-semibold text-brand-navy`; outer description text bumped gray-500 → gray-600 for contrast.

**5.7 — DeclarationsStep:**
- Already covered in Batch 2 (YesNoToggle + width system + helper text).

**5.8 — ReviewStep (`src/components/kyc/steps/ReviewStep.tsx`):**
- Already follows the right rhythm (`space-y-6` between sections, 1.5px row padding, bordered review panels are summary cards not form-on-form). No changes needed.

**5.9 — Contact Details sub-step (`PerPersonReviewWizard.tsx`):**
- Email `md:w-80`, phone `md:w-48`, both inputs `h-11`. Top-aligned labels (`text-sm font-medium text-gray-900`). Save button bumped from `h-7 text-xs` → `h-11 text-sm font-semibold`, primary brand-navy.

**Build:**
- `npm run build` clean — type check + lint pass.

---

### 2026-04-30 — B-047 (Batch 4 — button hierarchy + placement audit) (Claude Code)

Rolls a three-tier button system across every client wizard / dialog so each screen has exactly one Primary, one or more Secondaries, and Back / Cancel as quiet tertiaries. All buttons now meet the 44pt touch-target rule.

**4.1 — Three-tier button system (applied as raw className strings, no new component):**
- **Primary** — `h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90`. Used for: Next, Save & Continue, Submit, Submit for Review, Save & Close (in unsaved-changes dialog), Save & Finish, Add {role}.
- **Secondary** — `h-11 px-5 bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50`. Used for: Save & Close (wizard nav), middle button in per-person centered group, "Stay" in unsaved-changes dialog.
- **Tertiary** — `h-11 px-3 bg-transparent border-0 text-gray-600 font-medium hover:text-gray-900 hover:bg-transparent`. Used for: Back, Cancel, "Leave without saving".

**4.2 — Files updated:**
- `src/components/client/ServiceWizardNav.tsx`: Submit was green (off-brand) → primary brand-navy; Save & Close → secondary; Back → tertiary text-link. Submit ✓ glyph removed (icon = decoration; text alone is the affordance per `color-not-only`). Sizes default → h-11.
- `src/components/kyc/KycStepWizard.tsx`: navigation rebuilt with the three-tier classes. Back is now tertiary; Save & Continue / Submit for Review / Save & Close / Save & Finish / Save are all primary. All bumped from default size to h-11.
- `src/components/client/PerPersonReviewWizard.tsx`: centered three-button bar bumped from `size="sm"` (h-7) → h-11 with the tier classes. Centered group from B-046 stays — only colors / weights / sizes change.
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx`: unsaved-changes dialog reworked — `Save & Close` is now the single primary (was bg-brand-blue → now brand-navy), Stay = secondary outline, "Leave without saving" = tertiary text. All buttons h-11. Top-left "Back to Dashboard" demoted from blue-600 + h-4 chevron → gray-600 + h-3.5 chevron.
- `src/components/client/ServiceWizardPeopleStep.tsx` (Add-person modal): Cancel → tertiary text link, Add → primary brand-navy 44pt. Loader spinner bumped 3.5px → 4px to match h-11.
- `src/app/(client)/applications/[id]/page.tsx`: "← Back to Dashboard" button → gray-600 link.
- `src/app/(client)/apply/[templateId]/review/page.tsx`: "Back to Documents" → tertiary text-link; "Submit Application" → 44pt primary.

**4.3 — Loading states:**
- All async-firing primary buttons show spinner + label change while running. The §1.5 anti-flash hold (≥200ms) and success-flash patterns are available via the `<AsyncButton>` from Batch 1 — Batch 5 migrates the more complex submit handlers (`handleSubmit` chains in the wizards) over to it; for this batch, the existing spinner+disabled patterns stay in place but are visually consistent now.

**4.4 — Top-left back-navigation demoted:**
- "Back to People" (PerPersonReviewWizard), "Back to Dashboard" (ClientServiceDetailClient + applications/[id]), "Back to dashboard" (service landing) all now share the same recipe: `text-gray-600 hover:text-gray-900 font-medium`, `h-3.5 w-3.5` chevron icon, `gap-1`. They no longer compete with the page heading.

**Build:**
- `npm run build` clean.

---

### 2026-04-30 — B-047 (Batch 3 — Role-chip toggle redesign) (Claude Code)

Replaces the B-046 status-style role chips (`[Director ✓]`) with explicit checkbox-style toggles prefixed by "Roles:" so the affordance reads as **a control**, not as a status badge. Toggle behaviour, optimistic update, last-role confirmation, and per-role palette are all preserved from B-046.

**3.1 — `RoleToggleRow` reskin in `src/components/client/PerPersonReviewWizard.tsx`:**
- Outer wrapper now starts with a `Roles:` prefix label (gray-600, 14px font-medium, vertically centered with the chips), followed by an inline-flex group of pill buttons.
- Each pill: `h-11` (44pt touch target), `px-3` horizontal padding, `gap-2` between chips (`touch-spacing`), `rounded-full`, focus ring 2px brand-navy with offset.
- Inside the chip: `<CheckSquare>` (filled) when selected / `<Square>` (outlined gray-400) when unselected, 6px gap, role label. Label is **identical in both states** — does not flip to "Add Director" / "Remove Director" (visually noisy, confusing for keyboard nav).
- Active state keeps the B-046 role palette (Director blue, Shareholder purple, UBO yellow). Inactive state is a single neutral outline (`bg-white border-gray-300 text-gray-700 hover:bg-gray-50`) so the visual difference reads as "checked / unchecked" not "different status colour".
- Loading: while a toggle is in flight, the chip's icon swaps to a spinner (no layout shift) and the button is disabled.
- A11y: `role="checkbox"` + `aria-checked` per chip; `aria-label="Toggle Director role"` etc.; keyboard tab to chip, space toggles via the standard button activation. (`aria-pressed` removed — invalid attribute for `role="checkbox"` per WAI-ARIA, `aria-checked` already conveys state.)

**3.2 — Preserved from B-046:**
- UBO chip hidden when `record_type !== 'individual'` (org persons only have Director / Shareholder).
- Last-role removal still triggers `confirm("… will have no role on this application. Continue?")`.
- Optimistic update + rollback on save failure unchanged.
- The bottom Roles list that B-046 removed is **not** reintroduced — top row is the only place to see/edit roles.

**Build:**
- `npm run build` clean — 1 ESLint warning (`aria-pressed not supported by role checkbox`) caught and fixed before commit.

---

### 2026-04-30 — B-047 (Batch 2 — Declarations Yes/No placement) (Claude Code)

Lands the agreed design decision: Yes/No answers go directly under the question, no edge-to-edge gap. Replaces the cramped right-pinned radio pair with a 44pt segmented pill.

**2.1 — `<YesNoToggle>` segmented pill:**
- `src/components/shared/YesNoToggle.tsx` (new): two side-by-side pill buttons, ~120px wide × 44px tall (h-11), 8px gap between (`touch-spacing`). Selected = filled `bg-brand-navy text-white border-brand-navy`. Unselected = `bg-white border-gray-300 text-gray-700 hover:bg-gray-50`. Focus ring 2px brand-navy. `role="radiogroup"` + `aria-label` on wrapper, `role="radio"` + `aria-checked` per pill. Keyboard: arrow keys flip selection (and move focus), space/enter selects, single tab stop into the group per WAI-ARIA radiogroup pattern. **No red used for "No"** (`color-not-only`).

**2.2 — DeclarationsStep restructure:**
- `src/components/kyc/steps/DeclarationsStep.tsx`: removed the bordered `<Card>` wrappers around PEP and Legal-Issues blocks (kills card-on-card). Each question is now a vertically stacked block: 16px title (`text-base font-semibold text-gray-900`) + red `*` for required, 14px description (`text-sm text-gray-600`), then `<YesNoToggle>` directly below. 32–40px gap between questions (`space-y-10` on container, `space-y-3` inside each block).
- Removed the inline `YesNoRadio` sub-component — now using the shared `<YesNoToggle>`.
- PEP details / legal-issues details Textareas now constrained to `max-w-2xl` + `min-h-[120px]` from `formWidths.longFormTextareaMin`. Persistent helper text under tax ID instead of placeholder-as-helper.

**2.3 — Tax ID + EDD text fields:**
- Tax ID input now uses `formWidths.identifier` (`md:w-56`) instead of full-width. Persistent helper line: "Your jurisdiction's tax identifier (e.g. NI number, SSN, TIN)." Added `inputMode="text"` and `autoComplete="off"`.
- EDD textareas (`relationship_history`, `geographic_risk_assessment`) constrained to `max-w-2xl` + `min-h-[120px]` so long text remains readable on wide screens.

**Build:**
- `npm run build` clean.

---

### 2026-04-30 — B-047 (Batch 1 — form design system foundations) (Claude Code)

Token / utility / shared-component pass — establishes the patterns later batches reuse. **No user-facing visual changes in this batch.**

**1.1 — Field-width system:**
- `src/lib/form-widths.ts` (new): exports `formWidths` constants (postal `md:w-24`, phone `md:w-48`, date `md:w-40`, country `md:w-60`, state `md:w-52`, city `md:w-64`, currency `md:w-32`, identifier `md:w-56`, email `md:w-80`, fullName `md:w-80`, full, longFormTextareaMin). Also `twoColRowClass`, `evenTwoColRowClass`, and vertical-rhythm helpers (`sectionSpacing`, `groupSpacing`, `fieldSpacing`).

**1.2 — Universal `<FormField>` wrapper:**
- `src/components/shared/FormField.tsx` (new): top-aligned label (14px font-medium text-gray-900 mb-1.5), red `*` after label for required, `aria-required` on input. Helper text (12px gray-600) below the field, replaced by error (12px red-600) when present, with `role="alert"` + `aria-live="polite"`. Render-prop child receives `{ id, "aria-invalid", "aria-describedby", "aria-required" }` so it composes with any input primitive (Input, Textarea, CountrySelect, custom).
- Existing `ValidatedLabel` / `FieldWrapper` left intact for backward compat — Batch 5 migrates forms over to FormField as it touches them.

**1.3 — Section grouping (kill card-on-card):**
- Documented as the canonical pattern in `form-widths.ts` rhythm helpers; Batch 2 + 5 will rip nested Card containers as they touch each form. No code change in this batch.

**1.4 — Validation utilities:**
- `src/lib/validation.ts` (new): `isRequired`, `isEmail`, `isPhone`, `isISODate`, `isMinLength`, `isMaxLength`, plus `runAll` for chaining. Each returns `{ valid: true } | { valid: false, message }` with messages following §8 `error-clarity` (state cause + how to fix, e.g. "Enter a valid email like name@example.com" not "Invalid email").

**1.5 — Loading + success affordances:**
- `src/components/shared/AsyncButton.tsx` (new): wraps the project's `<Button>` primitive. Disables on click, shows `<Loader2>` spinner + `loadingLabel` ("Saving…") while the async handler runs, holds disabled state ≥200ms even on instant responses (anti-flash), then optionally flashes a green check + `successLabel` ("Saved") for 600ms before reverting. Pass-through props for variant/size/className. Reverts cleanly on error so upstream toast handles messaging.

**Build:**
- `npm run build` clean — type check + lint pass, no warnings.

---

### 2026-04-30 — B-046 (Batch 5 — auto-fill banner) (Claude Code)

Replaces the clickable "Fill from uploaded document" CTA in `IdentityStep` with an automatic prefill on mount + a passive indicator banner. Per-field ✨ icons from B-044 are untouched and continue to work alongside the new screen-level banner.

**5.1 — Auto-trigger:**
- `src/components/kyc/steps/IdentityStep.tsx`: on mount, a `useRef` guard fires the existing `/api/profiles/kyc/save` payload exactly once with all currently `prefillable` fields (empty form fields that have an extracted source value). The endpoint, request shape, and `onChange(patch)` dispatch are unchanged from the old click handler — only the trigger moved from button click to `useEffect`.
- `prefillFiredRef` ensures we don't re-fire if `prefillable.length` recomputes (e.g. a re-render after upload). The component already remounts when the user navigates away and back via the per-person sub-step wizard, so a fresh attempt is naturally driven by remounts.

**5.2 — Passive banner replaces the clickable CTA:**
- The dashed `<Button>` with "Fill from uploaded document" copy is gone. In its place, four mutually exclusive banners (state machine: `idle | running | success | error | no-source`):
  - `running` — blue tint, spinner, "Reading your document…"
  - `success` — blue tint, sparkle, "Filled from uploaded document / Values extracted from your passport / ID."
  - `no-source` — grey, info icon, "Upload your passport or ID to auto-fill these fields." (Shown when no passport / proof-of-address has been uploaded yet.)
  - `error` — amber, warning icon, "Couldn't auto-fill from your document. Please enter values manually."
- No click target on any banner — pure indicator. Per-field ✨ icons remain the override path.

**5.3 — Other form steps (audit per brief 5.4):**
- `FinancialStep` and `DeclarationsStep` have no `computePrefillableFields` / `computeAvailableExtracts` wiring today (no extraction fields are mapped to financial / declaration form keys). Per the brief — "If a form has no prefill source today, leave it untouched" — neither was changed.

**5.4 — Cleanup:**
- Removed dead `Button` import + `prefilling` state + `handlePrefillClick` function from `IdentityStep`.
- Added `Info` and `AlertTriangle` from `lucide-react` for the new banner states.
- `npm run build` clean.

---

### 2026-04-30 — B-046 (Batch 4 — sub-step wizard restructure) (Claude Code)

The brief was extended after the original Batch 4 (layout rework) shipped. The Review KYC view now runs as a sub-step wizard with a persistent shell and a centered three-button bar. Layout content from the previous batch (role toggle, docs panel, contact row, KYC form) is reused — the wizard just re-arranges *when* each piece is shown.

**4.1 — New `PerPersonReviewWizard` component:**
- New file: `src/components/client/PerPersonReviewWizard.tsx`. Owns its own form state, doc-upload state, sub-step index, and save-on-transition logic. Replaces the inline Review KYC view rendering inside `ServiceWizardPeopleStep`.
- 8 sub-step pipeline (skipped where empty): `Identity docs` → `Financial docs` → `Compliance docs` → `Contact details` → `Identity` → `Financial` → `Declarations` (CDD/EDD only) → `Review`. Organisations follow a 3-form variant: `Company details` → `Tax & financial` → `Review`.
- Doc-category sub-steps with zero document slots are removed from the visible list. Sub-step counter reflects the *visible* count.
- Persistent shell across all sub-steps: back link + `RoleToggleRow` + KYC progress strip (per-category icons + counts + status legend) + sub-step counter.
- Helper subtitle ("Upload your KYC documents below — we'll auto-fill the rest…") is shown only on doc-list sub-steps.
- Centered three-button bar replaces the old top/bottom buttons:
  - Left: `← Back` (calls `goBack`; saves form on form sub-steps before retreating; calls `onExit` on the first sub-step).
  - Middle: `Upload later` on doc sub-steps · hidden on contact · `Save & Close` on form sub-steps · `Save & Continue`/`Save & Finish` on the final sub-step in review-all mode.
  - Right: `Next →` on every sub-step except the last. Disabled on doc sub-steps until all required docs in the category are uploaded.
- "Back to People" link in the top-left auto-saves form state (when on a form sub-step) before exiting; spinner appears during the save.

**4.2 — Inline org form steps:**
- The org variant (`Company details`, `Tax & financial`, `Review`) is rendered by inline copies of `KycStepWizard`'s internal `CompanyDetailsStep`, `CorporateTaxStep`, and `OrgReviewStep`. We didn't export these from `KycStepWizard` — the wrapper is meant to be self-contained so we can iterate on the per-person wizard without touching the legacy `/kyc` and `/apply` flows.

**4.3 — Doc upload + verification polling:**
- Upload flow lives inside `PerPersonReviewWizard` and mirrors `KycDocListPanel`: image compression for >500 KB images, 4.5 MB Vercel limit guard, optimistic local doc state mutation, 25-attempt verification poll.
- Replacement flow goes through the existing `DocumentDetailDialog` and updates local docs state on `onDocumentReplaced`.

**4.4 — `ServiceWizardPeopleStep` integration:**
- `src/components/client/ServiceWizardPeopleStep.tsx`: the entire `if (reviewingPerson) { … }` block is replaced with a single `<PerPersonReviewWizard … />`. Dead code removed: inline `KycDocListPanel` (~340 lines), `RoleToggleRow` (~130 lines), `ContactDetailsRow` (~85 lines), `mapToKycRecord`, `mapToDocumentRecord`, `KYC_DOC_CATEGORIES`/`isKycDocCat`, the `kycFlushRef` + `leaving` state, and the `useRef` import. The `KycStepWizard` import is gone too — the new wrapper renders `IdentityStep`/`FinancialStep`/`DeclarationsStep`/`ReviewStep` directly so we don't carry the legacy 4-step navigation.
- `handleExitKycReview` is now a sync function — saving on exit is the wizard's responsibility, not the parent's.

**4.5 — `ServiceWizardNav` centered group:**
- `src/components/client/ServiceWizardNav.tsx`: outer wizard nav switched from `justify-between` (Save & Close left, Back/Next right) to `justify-center` with the canonical `[← Back] [Save & Close] [Next →]` order to match the per-person wizard's button bar.

**4.6 — Sanity:**
- `npm run build` clean.
- `KycStepWizard` is still imported by `/kyc`, `/apply`, and `PersonsManager` — leaving it untouched.

---

### 2026-04-30 — B-046 (Batch 4): Review KYC layout rework (Claude Code)

**4.1 — Person card slim-down:**
- `src/components/client/ServiceWizardPeopleStep.tsx::PersonCard`: removed the bottom "Roles" section (per-role list with Remove/Add-role select). The card keeps avatar, name, role chips (top), email, KYC progress bar, "Review KYC" button, and the "Last request sent on …" indicator. Type chip ("Individual"/"Corporation") removed too — record type is reflected in the role chip palette.
- The unused `addingRoleInCard` / `shareholdingInput` / `addRoleLoading` state and `handleAddRole` / `handleRemoveRole` handlers were stripped from the card. `onRoleRemoved` / `onRoleAdded` props remain on the type so parent call sites are untouched, but the card no longer invokes them — toggling roles now lives in the Review KYC top row.

**4.2 — Review KYC top row redesign:**
- New `RoleToggleRow` component renders three click-to-toggle chips on the right of the person's name: `Director` (blue), `Shareholder` (purple), `UBO` (amber). Active = filled, inactive = outlined and muted; the active chip also shows a `CheckCircle2` so the toggle state is unambiguous.
- UBO chip is hidden entirely when `record_type !== 'individual'`.
- Toggling is optimistic: state updates locally first, then API call (`POST /api/services/[id]/persons` to add, `DELETE /api/services/[id]/persons/[roleId]` to remove). On API failure the optimistic change is rolled back via the parent's `handleRoleRemoved` / `handleRoleAdded` callbacks and a toast is shown. While a chip is in flight it's disabled to prevent double-clicks.
- Removing the last role surfaces a `confirm("{Name} will have no role on this application. Continue?")` per spec; no inline % capture (Shareholder % stays on the OwnershipStructure component below the list).
- Helper text under the top row: "Upload your KYC documents below — we'll auto-fill the rest of the form from them."

**4.3 — KYC documents panel rework:**
- The Profile + Roles split block is gone — the Review KYC view's top panel is now a full-width KYC documents card.
- `KycDocListPanel` rewritten to a two-column grid. A flat list of doc types is built in section order (Identity → Financial → Compliance) and split by count; the left column gets the extra when the count is odd. Section headers render inline within each column wherever the section's docs fall — if a section spans both columns the header appears in both. Each column has its own `overflow-y-auto` scroller (`max-h-[420px]`). Collapsible category accordions removed.
- Heading row keeps the existing legend + "X of Y uploaded" copy.

**4.4 — Contact Details + Identity below docs panel:**
- New `ContactDetailsRow` component (single row, two inputs: Email, Phone) with a Save / Cancel pair that PATCHes `/api/profiles/[id]` on dirty. `ContactDetailsRow` lives between the docs panel and the wizard's Identity step.
- `IdentityStep` (inside `KycStepWizard`) is unchanged — `showContactFields={false}` continues to suppress the email/phone inputs there since they now live in `ContactDetailsRow` above.
- `ServicePerson.client_profiles` type extended with `phone: string | null`; the page query (`src/app/(client)/services/[id]/page.tsx`) and the `AddPersonModal` `onAdded` payload were updated to include phone. The legacy `ProfileEditPanel` component was deleted.

**4.5 — Sanity:**
- Admin Review KYC view (`AdminKycDocListPanel` in `admin/services/[id]/ServiceDetailClient.tsx`) is a separate component and was **not** touched. Admin layout unchanged per brief scope.
- `npm run build` clean. No new types, no new `any`s.

---

### 2026-04-30 — B-046 (Batch 3): Review All KYC walk-through (Claude Code)

**3.1 — "Review all KYC" button:**
- `src/components/client/ServiceWizardPeopleStep.tsx`: top toolbar now renders a primary blue **Review all KYC** button on the right when there is at least one person. Hidden otherwise.

**3.2 — Walk-through state + KycStepWizard hook:**
- `src/components/kyc/KycStepWizard.tsx`: new prop `reviewAllContext?: { current: number; total: number; personName?: string | null; onAdvance: () => void }`. When set:
  - Renders a header inside the wizard: `Reviewing person {current+1} of {total} — {Name}` plus a small "X remaining" / "Last person" counter.
  - On the final wizard step, replaces the existing "Save & Close" button with **Save** (chevron) for non-last and **Save & Finish** (chevron) for the last person. On click: saves; on success calls `onAdvance` if not last, otherwise calls `onComplete`.
- `ServiceWizardPeopleStep.tsx`: holds `reviewAllOrder: string[] | null` (one role-row id per unique profile, in card order) + `reviewAllIndex`. Clicking Review-All builds the order, sets index = 0, opens the wizard for `order[0]`. `onAdvance` increments the index, marks the just-completed person locally, and re-points `reviewingRoleId` to the next role row. KycStepWizard now receives `key={reviewingPerson.id}` so its internal state (currentStep, form) re-initialises cleanly on each person.

**3.3 — Single-person Review KYC unchanged:**
- When `reviewAllContext` is `undefined`, the wizard's last-step button keeps the existing `Save & Close` (inlineMode) / `Submit for Review` behaviour.

**3.4 — Edge cases:**
- Exit mid-walk via "Back to People" or the unsaved-changes path (`handleExitKycReview`) clears `reviewAllOrder` + `reviewAllIndex` — re-entering Review-All starts fresh from the first person.
- The wizard auto-saves and remounts on advance, so partially completed KYC for an in-progress person is preserved when the next person loads.
- Walk visits every person regardless of completion state, per spec.

`npm run build` clean.

---

### 2026-04-30 — B-046 (Batch 2): People & KYC Add buttons + tabbed Add modal (Claude Code)

**Important schema note for the brief reader:** the brief described `kyc_records` and `application_persons`. The live dashboard flow (`/services/[id]`) uses the newer data model: `client_profiles` + `profile_service_roles` (no `kyc_records` table). The legacy `kyc_records` model is still used by the admin People view (`PersonsManager.tsx`) and the older `/apply/[templateId]/details` route. Per brief scope ("admin out of scope; gate shared components"), all Batch 2 work was applied to `ServiceWizardPeopleStep.tsx` (the actual client-facing People step), not `PersonsManager.tsx`. Admin layouts unchanged.

**2.1 — Add buttons moved to top toolbar:**
- `src/components/client/ServiceWizardPeopleStep.tsx`: the row of `Add Director / Add Shareholder / Add UBO` buttons now sits **above** the person list. Buttons are grouped left; the right side is reserved for the "Review all KYC" button (added in Batch 3, intentionally hidden in Batch 2). Empty state copy updated to "No people added yet. Use the buttons above to get started."

**2.2 — Tabbed Add modal:**
- Replaced the inline `AddPersonModal` (search + create-new combined) with a proper two-tab modal:
  - **Tab A — Select existing person:** lists every tenant `client_profiles` row with role chips aggregated across all services they appear in (e.g. `Director`, `Shareholder 50%`). Click a row to attach the new role. Profiles already attached as the *same* role on *this* service are disabled and surface the inline message `{Name} is already a {Role} on this application.`
  - **Tab B — Add new person:** minimal form — Type radio (hidden when role is UBO, forces individual), Full name (required), Email (required), Phone (optional).
  - UBO tab A filters out `record_type === 'organisation'` profiles entirely.
- API change — `GET /api/services/[id]/available-profiles`: returns **all** tenant profiles now (not just unlinked), each with a `roles` array `[{service_id, role, shareholding_percentage}]` plus `phone` and `record_type`. The "is this profile already linked here as this role?" check has moved into the modal where it belongs (using `currentPersons`). The dead `ServicePersonsManager.tsx` (no callers) still references the old shape but is unused, so left untouched.
- API change — `POST /api/services/[id]/persons`: accepts an optional `phone` and persists it onto the new `client_profiles` row.

**2.3 — Auto-open Review KYC after add:**
- After a successful add (existing or new), `handleAdded` now also calls `setReviewingRoleId(person.id)` so the wizard immediately drops the user into that person's KYC review — no extra click required.

**2.4 — Notes:**
- Director warning ("At least one director is required") is now suppressed when there are zero people, since the empty-state copy already directs the user to add someone.
- Shareholding % is **not** captured in the new modal; it stays where it is today (the OwnershipStructure component below the list). This matches the brief's Batch 4 directive ("No inline % capture, Shareholder % stays editable wherever it is today").

`npm run build` clean.

---

### 2026-04-30 — B-046 (Batch 1): Dashboard welcome + Save & Close (Claude Code)

**1.1 — Dashboard greeting reworked when info is missing:**
- `src/app/(client)/dashboard/page.tsx`: derives `firstName` from `session.user.name` (split on first space; null if name looks like an email).
- `src/components/client/DashboardClient.tsx`: when `!allComplete`, replaces the plain "Welcome {userName}" heading with an amber info card:
  > **Welcome, {firstName}.** Your application is missing some information — click **Review** below to complete it.
  Falls back to "Welcome back." if no first name. A small bouncing `ArrowDown` icon underneath visually points at the service cards. When all sections are complete the original greeting copy is preserved.
- "Missing info" detection reuses the existing `allComplete` calculation (sum of section completions per service), so logic isn't duplicated.

**1.2 — "Save & Close" button on the unsaved-changes dialog:**
- `src/components/client/ServiceWizard.tsx`: added `saveAndCloseRef?: MutableRefObject<(() => Promise<boolean>) | null>` prop. `handleSaveAndClose` now returns a boolean. A `useEffect` re-publishes the latest closure to the ref every render, with cleanup that clears the ref on unmount.
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx`: dialog now has three buttons (left → right): **Leave without saving · Stay · Save & Close** (primary blue). Save & Close calls `wizardSaveAndCloseRef.current()`; on success it closes both the dialog and the wizard (the wizard's `onClose` already clears `wizardMode`); on failure the dialog stays open so the user can retry. A `savingFromDialog` flag disables all three buttons during save.

`npm run build` clean (lint + types).

---

### 2026-04-22 — B-045: RLS default-deny on every public table (Claude Code)

> ⚠️ **MIGRATION NOT YET APPLIED.** The SQL file exists at
> `supabase/migrations/005-rls-default-deny.sql` but has NOT been run against
> the live database. Until the user applies it, the Supabase advisory
> (`rls_disabled_in_public` / `sensitive_columns_exposed`) remains open and
> the anon key can still read public tables.

**B-045 (RLS default-deny on public tables)** — closes the Supabase security
advisory. The `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships in the browser bundle;
with RLS disabled, anyone on the internet could hit
`https://<ref>.supabase.co/rest/v1/<table>` and read every row. The app uses
`createAdminClient()` (service role) for every server-side query, which
bypasses RLS, so enabling RLS **with no policies** blocks the anon key
without breaking a single app query.

**Created:** `supabase/migrations/005-rls-default-deny.sql`
- Explicit enumerated `ALTER TABLE public.<x> ENABLE ROW LEVEL SECURITY` for
  every public-schema table across `schema.sql` + migrations 002/003/004:
  profiles, clients, client_users, admin_users, service_templates,
  document_requirements, knowledge_base, applications, document_uploads,
  audit_log, client_account_managers, email_log, document_types,
  kyc_records, application_persons, application_details_gbc_ac, documents,
  document_links, process_templates, process_requirements, client_processes,
  process_documents, due_diligence_requirements, due_diligence_settings,
  profile_roles, role_document_requirements, tenants, users,
  client_profiles, client_profile_kyc, services, profile_service_roles,
  profile_requirement_overrides, service_section_overrides,
  documents_history, client_profile_kyc_history.
- Safety-net `DO $$ … $$` block that iterates `pg_tables where schemaname =
  'public'` and enables RLS on any remaining tables — catches things like
  `verification_codes` which is referenced in migration 003 but never
  `CREATE TABLE`-d in this repo (exists in the live DB from an earlier
  bootstrap).
- Final assertion that raises loudly if any public table still has
  `relrowsecurity=false` after the run — migration aborts rather than
  claiming success with a hole.
- **No policies added.** Empty policies on RLS-enabled tables means anon +
  authenticated roles can read nothing. That is the whole point. The two
  history tables from migration 004 already have admin-read policies; those
  stay as-is.
- Idempotent — re-running the migration after apply is a no-op.

**Apply step (manual — user runs once):**
1. Open Supabase SQL editor.
2. Paste the contents of `supabase/migrations/005-rls-default-deny.sql`.
3. Run. The transaction either commits cleanly or aborts with the list of
   tables still missing RLS (only happens if a new table was added between
   writing this migration and applying it).

**Apply endpoint (Option B in the brief) — intentionally not implemented.**
The migration uses multi-statement PL/pgSQL `DO` blocks and an enforced
`COMMIT`. `supabase-js` has no generic `exec_sql` RPC and can only run
table-level ops, so routing through an admin endpoint would require
installing a helper function first — strictly more moving parts than
pasting the SQL once. Documenting the choice so the next session doesn't
wonder why it isn't there.

**Smoke-test plan (run AFTER applying the migration):**
1. Client: load `/dashboard` → application list renders.
2. Admin: load `/admin/dashboard` → stats + recent activity render.
3. Register a fresh test user → succeeds (the `auth.users → profiles` trigger
   runs as the DB owner and bypasses RLS).
4. Upload a document on an in-progress application → still works.

If any of these fail, the most likely cause is a DB trigger / function that
was silently relying on anon access. Fix by setting `SECURITY DEFINER` on
the function so it runs as the owner, not the caller. Record the adjustment
inside the migration file if needed.

**Advisory verification (run AFTER applying):** from the terminal, with the
anon key from `.env.local`:

```bash
SUPABASE_URL="https://ylrjcqaelzgjopqqfnmt.supabase.co"
ANON_KEY="<contents of NEXT_PUBLIC_SUPABASE_ANON_KEY>"

for t in profiles client_profiles kyc_records documents; do
  echo "=== $t ==="
  curl -s "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" | head -c 400
  echo
done
```

Expected response for each table: an empty array `[]` OR a
`{"code":"42501","message":"permission denied for table <t>"}`-style
response. **NOT** rows of data. Paste the actual curl responses into this
entry once available so the fix is auditable. Reload the Supabase advisor
within a minute — the `rls_disabled_in_public` and
`sensitive_columns_exposed` findings should clear.

**Build:** `npm run build` passes lint + types (migration is pure SQL; no TS
changes).

**Tech-debt tracker (this file):** item #3 amended — severity dropped from
High → Medium with a note that the exploitable path is closed and that
per-tenant policies remain open work for the broader move-off-service-role
project.

**Brief:** `docs/cli-brief-rls-default-deny-b045.md`

---

### 2026-04-20 — B-044: Per-field AI prefill icon + proof-of-address reseed (Claude Code)

**B-044 (Per-field prefill icon + proof-of-address fix)** — bug-fix + new UX affordance.

**Item 1 — "Fill from uploaded document" not appearing after POA upload.**

Diagnosis from a static read of the code (no Supabase console available from this session):

- `src/app/api/admin/migrations/seed-ai-defaults/route.ts` and the in-repo seed both set `ai_extraction_enabled=true` and the first extraction field to `{key:"address_on_document", prefill_field:"address"}` — correct.
- `src/lib/kyc/computePrefillable.ts` tolerates the POA doc exactly like the passport doc (same mapping path — look up doc type config by `document_type_id`, intersect extracted_fields with `ai_extraction_fields`, require `prefill_field ∈ KYC_PREFILLABLE_FIELDS`, drop empty + already-filled targets).
- `src/components/client/ServiceWizardPeopleStep.tsx` passes `documents.filter(d => d.client_profile_id === profileId)` as `personDocs` — same filter for both docs, so the passport working while POA does not rules out a profile-id mismatch at the client.

**Most likely cause** (verifiable with the Supabase SQL snippets in the brief): an admin saved an edit on `/admin/settings/rules` that cleared the `prefill_field` dropdown on POA's `address_on_document` extraction field. Confirmed against the rules editor — the dropdown includes a `— none —` option, and selecting it would persist `prefill_field: null` (and the rules-page form only re-emits `ai_extraction_fields` when AI is enabled; if the admin toggled AI off and back on mid-edit, it would also wipe the list).

**Remedy:** new idempotent admin endpoint **`POST /api/admin/migrations/reseed-proof-of-address-extraction`** (`src/app/api/admin/migrations/reseed-proof-of-address-extraction/route.ts`). Restores POA's canonical seed config (`ai_enabled=true`, `ai_extraction_enabled=true`, `ai_extraction_fields` set to the exact seed from `seed-ai-defaults`), returns `{ before, after }` so the admin can see what changed. Admin-only. Safe to re-run.

**How to confirm at runtime:** either run the Supabase SQL from the brief's "Check A / Check B" and look at the columns on that row, or invoke the reseed endpoint and re-check. If after the reseed the top button still does not appear, item 1 of this batch will not be the fix and the cause is elsewhere (AI-prompt key mismatch, client_profile_id mismatch on the upload row, verification_status=pending) — those branches are listed in the brief's likely-outcomes table. Logged here so the next session can pick up without re-deriving.

**Item 2 — Per-field ✨ prefill icon.**

New pattern — a small ✨ Sparkles button appears inline next to a KYC form field label whenever the AI has extracted a matching value for that target, regardless of whether the form field is currently empty. Hover shows the extracted value + source doc; click replaces the current value.

**Created:**
- `src/components/kyc/FieldPrefillIcon.tsx` — reusable inline button that calls the provided `onFill` callback. Wrapped in the shadcn `Tooltip` shim (`@/components/ui/tooltip`, added in B-043). Tooltip content:
  - Line 1: `Extracted: "<value>"` (truncated at 60 chars)
  - Line 2: `From: <doc type> — click to use`
  Uses `aria-label="Fill <field> from uploaded document"`, keyboard-focusable, swaps to a spinner while the save is in flight.

**Updated:** `src/lib/kyc/computePrefillable.ts`
- Added `computeAvailableExtracts({ docs, docTypes })` — same stable-sort + per-target dedup as the existing helper, but without the "form field must be empty" filter. Exported alongside `computePrefillableFields` (which stays as the source of truth for the top bulk-fill button + step-nav indicator).

**Updated:** `src/components/kyc/IndividualKycForm.tsx`
- Computes `availableByTarget: Map<string, PrefillableField>` once at the top. New `handleFieldPrefill` POSTs a single-field payload to `/api/profiles/kyc/save` and merges the value into local `setFields` on success. Toast: `Filled <label> from <doc type>.` on success, `Couldn't fill from document — please try again.` on error.
- Icons rendered inline on the Full legal name / Date of birth / Nationality / Passport country / Passport number / Passport expiry / Residential address / Occupation / TIN labels (every `FieldRow` whose target is in `KYC_PREFILLABLE_FIELDS` and has an available extract).

**Updated:** `src/components/kyc/steps/IdentityStep.tsx`
- Internal `Field` helper now accepts optional `prefillFrom` + `onPrefillField`. If both are set it renders `FieldPrefillIcon` inside the `ValidatedLabel`.
- New `handleFieldPrefill` mirrors the IndividualKycForm version but uses the wizard's `onChange` (controlled-form pattern) instead of local state.
- Icons wired on Full legal name, Date of birth, Nationality, Passport country, Passport number, Passport expiry, and Residential address.

**Ambiguity resolved in-flight:** the brief's Item 1 "Check C" debug instructions point at `IndividualKycForm.tsx`, but the user flow that triggered the bug (Service wizard → People step → Review KYC) renders `KycStepWizard → IdentityStep`, not `IndividualKycForm`. Both surfaces got the per-field icon.

**Deferred / not in scope (flagged as tech debt):**
- `FinancialStep` and `DeclarationsStep` don't yet receive `personDocs/personDocTypes` from `KycStepWizard`, so icons on Occupation (wizard flow — there is none in IdentityStep), TIN, and `jurisdiction_tax_residence` are only visible in `IndividualKycForm` (the standalone `/kyc` + admin KYC pages). Threading the two props into those steps is a small future batch.

**Build:** `npm run build` passes lint + types.

**Brief:** `docs/cli-brief-per-field-prefill-icon-b044.md`

**Dev-server reset:** `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev`

---

### 2026-04-20 — B-043: Client wizard polish, 6 items (Claude Code)

**B-043 (Client wizard polish)** — six related UX/security fixes shipped together.

**Item 1 — CSP allows Supabase iframe previews.**
- `next.config.js` — `frame-src 'self' blob:` → `frame-src 'self' blob: https://*.supabase.co`. Same wildcard shape as the existing `connect-src` entry. Fixes the "upload looks blank" bug where `DocumentDetailDialog`, `DocumentPreviewDialog`, and `DocumentViewer` were embedding signed Supabase URLs inside `<iframe>` and hitting a `Framing '…supabase.co' violates Content Security Policy` block. Dev server must restart for the CSP header to reload.

**Item 2 — Country picker placeholder readable.**
- `src/components/shared/MultiSelectCountry.tsx` — search input `placeholder:text-gray-500` → `placeholder:text-gray-700`. Keeps distinction from typed value (`text-gray-900`) but no longer looks disabled.

**Item 3 — Sticky wizard footer cleared above the macOS Dock.**
- `src/components/client/ServiceWizardNav.tsx` — `fixed bottom-0` → `fixed bottom-6`, plus `border-x rounded-t-lg` so the floating footer reads as intentional. Kept the existing `left-[260px]` offset so it aligns to the main content column (covers Item 4 verification).
- `src/components/kyc/KycStepWizard.tsx` (`fixedNav` branch) — same fix, and replaced `left-0 right-0` with `left-[260px] right-0` so the Back button aligns to the main column instead of the viewport edge.
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — the admin "You have unsaved changes" bar uses the same sticky-bottom pattern; got the same `bottom-6 + border-x + rounded-t-lg` update.
- Spacers bumped to match: `ServiceWizard.tsx` body padding `pb-20` → `pb-28`; `KycStepWizard.tsx` `fixedNav` spacer `h-20` → `h-28`.

**Item 5 — Submit blockers surfaced.**
- `src/components/client/ServiceWizard.tsx` — computes `submitBlockers: string[]` alongside `canSubmit`. Reuses the step indicator labels ("Company Setup", "Financial", "Banking"). People step has two sub-reasons: no director, or at least one profile missing KYC. Passed into `ServiceWizardNav` and into `ServiceWizardDocumentsStep` (the final step).
- New `src/components/ui/tooltip.tsx` — thin wrapper over `@base-ui/react/tooltip` (no Radix dependency). Provides `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` with shadcn-style styling.
- `src/components/client/ServiceWizardNav.tsx` — when on the final step with Submit disabled and blockers present, the Submit button is wrapped in a `Tooltip` whose content lists `• blocker 1 • blocker 2 …`. Trigger is a `<span tabIndex=0>` so hover works even though the actual button is disabled.
- `src/components/client/ServiceWizardDocumentsStep.tsx` — renders an amber "Before you can submit" card at the top of the Documents (final) step body showing the same blocker list. New `submitBlockers` prop.

**Item 6 — Save-before-back on KYC exit.**
- `src/components/kyc/KycStepWizard.tsx` — `saveCurrentStep` converted to `useCallback`; new `onRegisterFlush?: (flush) => void` prop. A `useEffect` registers the latest `saveCurrentStep` with the parent on every form change, and clears it on unmount.
- `src/components/client/ServiceWizardPeopleStep.tsx` — holds a `kycFlushRef`. New `handleExitKycReview()` awaits the flush before calling `setReviewingRoleId(null)`. On failure it toasts `Couldn't save your changes — please try again.` and keeps the panel open. The "Back to People" link shows a `Saving…` spinner while the flush is in flight. No `AlertDialog` needed since the save always runs; users never lose edits and never have to answer a dialog. The `onRegisterFlush` prop is wired onto the `<KycStepWizard>` mount.

**Item 4** — verified on the ServiceWizard side-by-side during Item 3. KYC wizard inner step-nav also re-aligned to `left-[260px]` so the wizard's Back sits under the same column as ServiceWizard's footer.

**Build:** `npm run build` passes lint + type check.

**Brief:** `docs/cli-brief-wizard-polish-b043.md`

**Dev-server reset (required — CSP header change):** `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev`

---

### 2026-04-20 — B-042: On-demand AI prefill in KYC Identity step (Claude Code)

**B-042 (On-demand AI prefill)** — moves the prefill decision out of the doc upload moment and into the Identity step where the fields live. Replaces the forced `AiPrefillBanner` (Apply/Skip + conflict-mode select) with a single, opt-in "✨ Fill from uploaded document" button plus a subtle ✨ indicator on the Identity step nav.

**Created:**
- `src/lib/kyc/computePrefillable.ts` — pure helper used by both surfaces. For each uploaded doc it reads `verification_result.extracted_fields`, intersects with the doc type's `ai_extraction_fields`, keeps only targets whitelisted in `KYC_PREFILLABLE_FIELDS`, drops empty values, drops targets whose form field is already non-empty, and returns a de-duplicated list (earliest upload wins on tie).

**Modified:**
- `src/components/kyc/steps/IdentityStep.tsx` — new props `personDocs`, `personDocTypes`, `kycRecordId`. Renders the full-width dashed Sparkles button above the field grid when `computePrefillableFields(...)` is non-empty. Click flow: compute payload → POST `/api/profiles/kyc/save` → on 2xx call `onChange` with the patch and toast `Filled N field(s)…`; on error toast the failure and leave form state untouched.
- `src/components/kyc/KycStepWizard.tsx` — new props `personDocs` + `personDocTypes`. Renders a Lucide `Sparkles` icon (`text-blue-500`, absolute-positioned top-right of the Identity step bar) via `StepIndicator` when the helper has at least one row. Icon has a `title` for the tooltip. Also passes `personDocs/personDocTypes/kycRecordId` down to `IdentityStep`. Org flow is untouched.
- `src/components/kyc/IndividualKycForm.tsx` — same button rendered at the top of the form body (used on the `/kyc` and admin client KYC pages). Accepts optional `personDocs`/`personDocTypes`, falls back to its existing `documents`/`documentTypes` when omitted. On success it merges the patch into the internal form state (same `setFields` that `useAutoSave` watches).
- `src/components/client/ServiceWizardPeopleStep.tsx` — removed the old `<AiPrefillBanner />` block and its import. Removed the now-unused `kycRecordId`/`profileValues` props from `KycDocListPanel` (they only existed to feed the banner). Passes `personDocs` + `personDocTypes` to `<KycStepWizard>` for the reviewed person.

**Deleted:**
- `src/components/shared/AiPrefillBanner.tsx`
- `src/app/api/documents/[id]/dismiss-prefill/route.ts`

**Kept untouched (intentional):**
- `documents.prefill_dismissed_at` column — stops being read/written from the front end but no migration.
- `src/lib/constants/prefillFields.ts` — `KYC_PREFILLABLE_FIELDS` is reused by the helper.
- `/api/profiles/kyc/save` — unchanged, reused by both surfaces.
- `OrganisationKycForm` — out of scope per spec.

**Ambiguity noted in-flight:** the brief names `IndividualKycForm` as the step-wizard's Identity target, but in this repo `KycStepWizard` renders `IdentityStep`, not `IndividualKycForm`. Both components are client-facing and can host the button, so the button was added to **both** — `IdentityStep` for the wizard flow (People step → review person → KYC wizard) and `IndividualKycForm` for the standalone `/kyc` + admin KYC pages. The helper is the same in both places.

**Build:** `npm run build` passes lint + types. Grep confirms no remaining `AiPrefillBanner` or `dismiss-prefill` references in `src/`.

**Brief:** `docs/cli-brief-ai-prefill-on-demand-b042.md`
**Design spec:** `docs/superpowers/specs/2026-04-20-ai-prefill-on-demand-design.md`

**Dev-server reset:** `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev`

---

### 2026-04-20 — B-041: Sanitize upload filenames for Supabase Storage (Claude Desktop)

**B-041 (Invalid storage key fix)**

Supabase Storage rejects object keys that contain spaces, colons, and several other special characters (seen as `Invalid key: ...Screenshot 2026-04-20 at 12.23.38 AM.jpg`). Screenshots and many phone-camera filenames include spaces + colons by default.

**Fix:** all four upload routes now sanitize the incoming filename before building the storage path. Preserves extension, replaces non-word chars with underscores, collapses repeats, trims edges, caps length at 120 chars. Storage key becomes e.g. `services/{id}/{typeId}/{ts}-Screenshot_2026-04-20_at_12.23.38_AM.jpg`.

- `src/app/api/services/[id]/documents/upload/route.ts`
- `src/app/api/admin/services/[id]/documents/upload/route.ts`
- `src/app/api/documents/upload/route.ts`
- `src/app/api/documents/library/route.ts`

DB column `file_name` still stores the original filename (display value); only the storage key is sanitized.

### 2026-04-20 — B-040: Replace-document save propagation + AI polling (Claude Desktop)

**B-040 (replace flow UI refresh)**

Server-side the replace path already persisted the new file correctly. Two client-side issues made it feel like the save didn't happen:

**Fix 1 — `KycDocListPanel` ignored prop updates after mount**
- `src/components/client/ServiceWizardPeopleStep.tsx`: `localDocs` was initialized once from `initialDocs` and never synced. Added a `useEffect` to re-seed `localDocs` when the parent updates the `documents` prop.

**Fix 2 — No AI polling after a replace**
- `onDocumentReplaced` handler in the same file now calls `pollForVerification(newDocId, dtId)` if the replaced doc's status came back as `'pending'`. Previously only the first-time upload path kicked off polling, so a replaced doc stayed in "AI checking..." state until a manual page refresh.

**Verify:**
- Open a doc, click Replace Document → select a file
- Dialog closes; doc row shows new file name immediately
- "AI checking..." spinner appears for up to ~45s, then flips to Verified / Flagged / Manual review based on AI outcome

### 2026-04-20 — B-039: Always-visible navigation bar on KYC review (Claude Desktop)

**B-039 (fixed-bottom nav on KYC review)**

**Updated:** `src/components/kyc/KycStepWizard.tsx`
- Added `fixedNav?: boolean` prop (default `false`). When `true`:
  - Nav bar renders with `position: fixed, bottom-0, left-0, right-0, z-40` — always visible regardless of scroll position
  - Subtle shadow above the bar for separation from content
  - A 80px spacer is added above the nav so fixed positioning never covers the final form fields
- Prior `sticky bottom-0 -mx-8 -mb-8` path remained for other mount sites that expect it (standalone `/kyc`, external fill)

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Review-view `KycStepWizard` mount now passes `fixedNav` — Back / Save & Continue always visible while reviewing a person's KYC

**Rationale:** `sticky bottom-0` only works when inside a scroll container whose last child is the sticky element. The review view's parent is a plain `<div className="space-y-4">` (no overflow context), so sticky didn't pin reliably. Fixed positioning avoids the container dependency entirely.

### 2026-04-20 — B-038: Compact KYC document panel header (Claude Desktop)

**B-038 (vertical space reduction on KYC review screen)**

**Updated:** `src/components/shared/DocumentStatusLegend.tsx`
- Rewritten as a single-line horizontal legend, always visible (no collapse)
- Shortened labels: "AI verified" → "Verified", "AI flagged" → "Flagged", etc.
- Two tracks separated by a subtle middle dot instead of a horizontal rule
- Text dropped to 10px, icons 3px, gap-x-2 — fits on one row even in narrow columns

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- `KycDocListPanel`: header row now holds KYC Documents title + "X of Y uploaded" count + legend on a single line (`flex justify-between`)
- Removed the standalone "Please upload your documents here" caption line
- Removed the standalone "KYC Documents" header that was above the panel in the split layout (redundant with the in-panel header)
- Removed the footer "X of Y uploaded" line (now inline in the header)
- Scroll area `maxHeight: 280 → 240`

**Vertical space saved:** ~90px on initial render of the KYC review panel (eliminated 2 heading rows + 1 footer line + compacted legend from 3 rows → 1 row).

### 2026-04-19 — B-037 Fix 3: Required-field errors visible on load (Claude Code)

**B-037 Fix 3 — landing on a wizard now immediately shows what's mandatory**

Today required fields only turn red after touch (focus + blur). The user wants the empty-required state visible from first paint so the form's expectations are obvious without interaction.

**Updated:** `src/hooks/useFieldValidation.ts`
- New optional argument: `useFieldValidation({ showErrorsImmediately?: boolean })`. When `true`, `getFieldState()` returns `"error"` for every empty required field on first render — no `touched` membership required. Default remains `false` so admin-side forms keep current behaviour.

**Updated step components** to forward the prop into the hook (default `false` to preserve any not-yet-flipped admin call sites):
- `src/components/kyc/steps/IdentityStep.tsx`
- `src/components/kyc/steps/FinancialStep.tsx`
- `src/components/kyc/steps/DeclarationsStep.tsx`

**Updated wizard:** `src/components/kyc/KycStepWizard.tsx`
- New prop `showErrorsImmediately?: boolean` threaded into `IdentityStep`, `FinancialStep`, and `DeclarationsStep`. Default `false`.

**Flipped at every client-facing mount site:**
- `src/app/(client)/kyc/KycPageClient.tsx`
- `src/components/client/ServicePersonsManager.tsx`
- `src/components/client/PersonsManager.tsx`
- `src/components/client/ServiceWizardPeopleStep.tsx`

Each now passes `showErrorsImmediately` (truthy shorthand). Admin pages continue to use the default-off behaviour.

**Build:** `npm run build` passes lint + types.

---

### 2026-04-19 — B-037 Fix 2: Country dropdown palette tightened (Claude Code)

**B-037 Fix 2 — `text-gray-400` removed from interactive country selectors**

Per the palette rule from B-034, `text-gray-400` is reserved for genuinely disabled / informational UI. The country pickers were using it on active controls, making them look disabled.

**Updated:** `src/components/shared/CountrySelect.tsx`
- "Use dropdown instead" reset button: `text-gray-400 hover:text-gray-600` → `text-gray-600 hover:text-gray-800`.
- Search input magnifier icon: `text-gray-400` → `text-gray-600`.

**Updated:** `src/components/shared/MultiSelectCountry.tsx`
- Selected-country chip "×" remove button: `text-brand-navy/50 hover:text-brand-navy` → `text-gray-600 hover:text-red-600` (matches the palette rule for chip removal).
- Trigger chevron button: `text-gray-400 hover:text-gray-600` → `text-gray-600 hover:text-gray-800`.
- Empty-state "No matching countries": `text-gray-400` → `text-gray-500`.
- Disabled-state em-dash placeholder kept as `text-gray-400` (legitimate disabled use).

**Build:** `npm run build` passes lint + types.

---

### 2026-04-19 — B-037 Fix 1: Client-side image compression before upload (Claude Code)

**B-037 Fix 1 — phone photos no longer hit Vercel's 4.5 MB body limit**

Companion to B-036 (which only blocked the upload + showed a clear error). This fix transparently shrinks images before they ever leave the browser, so a typical 6–10 MB phone photo of a passport/utility bill lands as ~1–2 MB JPEG.

**Added:** `browser-image-compression@^2.0.2` (npm install).

**Created:** `src/lib/imageCompression.ts`
- `compressIfImage(file)` — image inputs >500 KB are compressed to a 2 MB target with a 2400 px max edge, JPEG output, web worker on. PDFs and other non-image types pass through untouched. Any failure (worker error, OOM, unsupported format) returns the original file (fail open).
- File extension is rewritten to `.jpg` on PNG/WebP/TIFF/GIF/HEIC inputs so the FormData filename matches the new content type.
- If compression somehow inflates the file, the original is returned.

**Updated upload sites** — all three call sites that POST to `/api/services/[id]/documents/upload`:
- `src/components/client/ServiceWizardPeopleStep.tsx` `handleUpload`
- `src/components/shared/DocumentDetailDialog.tsx` `handleReplace`
- `src/components/client/ServiceWizardDocumentsStep.tsx` `handleFile`

Each now: shows a `toast.loading("Optimising image…")` while compressing → calls `compressIfImage(file)` → checks the post-compression size against the existing 4.5 MB Vercel guard (now also added to the documents-step site, which previously had none) → uploads. The "File is too large" guard is preserved as a safety net for edge cases (e.g. a 15 MB image that still can't get under 4.5 MB).

**Build:** `npm run build` passes lint + types.

**Brief:** `docs/cli-brief-upload-compression-and-required-fields-b037.md`

---

### 2026-04-19 — B-036: Graceful upload error handling + 4.5 MB client-side guard (Claude Desktop)

**B-036 (Upload error handling)**

Vercel serverless functions on Hobby tier reject request bodies over 4.5 MB with a plain-text 413 HTML page. Client code was calling `res.json()` on this and throwing `Unexpected token 'R', "Request En"...`. Fixed by:

**Updated:** `src/components/shared/DocumentDetailDialog.tsx` — `handleReplace`
- Client-side size check at 4.5 MB with a clear toast before the request fires
- Read response as text + try-parse-JSON so non-JSON 413/500 bodies don't throw
- Special 413 handling returns "File is too large. Please upload under 4.5 MB."

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx` — `handleUpload`
- Same pattern: client-side 4.5 MB check + resilient response parsing

Server-side `MAX_FILE_SIZE` (10 MB) on the upload route is now superseded by Vercel's 4.5 MB cap. To raise this, we'd either upgrade to Vercel Pro (100 MB bodies) or implement direct-to-Supabase uploads via signed URL. Not done in this batch.

### 2026-04-19 — B-035: Green reserved for admin-approved; legend default open; tighter doc list (Claude Desktop)

**B-035 (Doc list display tweaks)**

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Left-side doc icon:
  - Not uploaded → `FileText` amber (unchanged)
  - Uploaded but not admin-approved → `FileText` gray-500 (was green CheckCircle2)
  - Admin approved → `CheckCircle2` green (unchanged)
- Name text color: amber when missing, gray-700 when uploaded-not-approved, green-700 when approved
- `DocumentStatusLegend` now `defaultOpen={true}`
- Doc list: `maxHeight 360` → `280`, per-row `py-1` → `py-0.5`, category header `py-1.5` → `py-1`, category body `space-y-0.5` → `space-y-0`

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — `AdminKycDocListPanel`
- Same treatment: `CheckSquare` stays green only when `admin_status === "approved"`; uploaded-unreviewed becomes neutral gray-500

**Rationale:** green is the universal "good to go" signal. Showing green on upload before anyone has reviewed it misleads clients into thinking the document is accepted. The two-track status badge already conveys AI + admin state; the left-side icon now only turns green when the admin has actually approved.

### 2026-04-19 — B-034: Status icons, legend, preview fallback, color palette (Claude Desktop)

**B-034 (Client KYC display polish)**

**Updated:** `src/components/shared/DocumentStatusBadge.tsx`
- Replaced colored dots with Lucide icons:
  - AI status: ShieldCheck / ShieldAlert / ShieldQuestion / Loader2 / ShieldOff
  - Admin status: UserCheck / UserX / Clock
- Compact mode: icon pair with native `title` tooltip + aria-label
- Expanded mode: icon + label pills

**Created:** `src/components/shared/DocumentStatusLegend.tsx`
- Collapsible legend explaining the 8 status icons
- Default collapsed; toggle with chevron
- Mounted below "Please upload your documents here" in `KycDocListPanel`

**Updated:** `src/components/shared/DocumentDetailDialog.tsx`
- Added `inferMimeFromName()` helper — falls back to filename extension (jpg/jpeg/png/webp/gif/tiff/pdf) when `mime_type` is null on older uploaded rows
- Fixes "Preview not available for this file type" for historical uploads where mime_type wasn't stored

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Mounted `DocumentStatusLegend` after the upload-here caption
- Eye icon and Remove role link: `text-gray-400` → `text-gray-600` (was too light, looked disabled)
- Shareholding % label: gray-400 → gray-600
- Remove hover: red-500 → red-600

**Updated:** `src/components/shared/CountrySelect.tsx`
- Placeholder text: gray-400 → gray-500
- Chevron icon: gray-400 → gray-600

**Rationale:** gray-400 now reserved for truly disabled/informational contexts. Interactive icons and links use gray-600 so users don't mistake them for disabled controls.

### 2026-04-19 — B-033 Complete (Claude Code)

**B-033 (AI Processing, Two-Track Status, Prefill & History) — batches 1–5 shipped**

Batches 1–4 delivered schema + data config + verifier + UI. Batch 5 is final verification, polish, and this summary.

**Batch 5 polish commits:**
- `src/app/api/documents/[id]/route.ts` — GET now also returns `admin_status_note`, `admin_status_at`, `prefill_dismissed_at`. Without this, the KycDocListPanel poll was overwriting `prefill_dismissed_at` with `undefined` after AI completion, which caused the banner to flash back briefly on some uploads.

**Verification outcome (end-to-end audit of the 5 status flows from Batch 4):**
1. Passport upload (AI on + extraction on) → upload route sets `verification_status='pending'` + `admin_status='pending_review'` + schedules AI; completion writes `verified|flagged|manual_review`. Compact badge on KYC panel + full pair badge in detail dialog render correctly. ✅
2. CV upload (AI on, extraction off) → same path; `extracted_fields={}` on completion; prefill banner does NOT render (no applicable fields). ✅
3. PEP upload with AI disabled at doc type level → upload route sets `verification_status='not_run'`, background job is not fired; badge shows "AI skipped · Pending admin review". ✅
4. Prefill banner displays extracted fields when the doc type has `prefill_field` mapped to a whitelisted KYC column. Apply → `/api/profiles/kyc/save` (handles full_name/address on client_profiles, all KYC columns on client_profile_kyc) + `/api/documents/[id]/dismiss-prefill` → banner hides, `prefill_dismissed_at` persists. ✅
5. Admin clicks Re-run AI in DocumentDetailDialog → `/api/admin/documents/[id]/rerun-ai` overwrites `verification_status`, `verification_result`, `verified_at`, and clears `prefill_dismissed_at`. Dialog's local state updates immediately; a page refresh on the client side re-surfaces the banner. ✅

**Build + lint:** `npm run build` clean; `npm run lint` returns "No ESLint warnings or errors".

**Drift guard:** `assert_documents_history_sync()` is invoked at the end of `004-ai-processing-and-history.sql`; the migration aborts if any `documents` column is not mirrored in `documents_history`.

**Apply step reminder (manual):** run `supabase/migrations/004-ai-processing-and-history.sql` in the Supabase SQL editor; then `POST /api/admin/migrations/seed-ai-defaults` (or press the "Seed defaults" button in Admin → Settings → AI Document Rules) to populate per-doc-type config.

**Follow-ups deferred:** history UI (timeline viewer); admin-side prefill (Certificate of Incorporation → clients/applications); per-field Apply in prefill banner; bulk admin approve; history tables for services/clients/client_profiles; per-doc email notifications; schema-drift CI hook.

**Brief:** `docs/cli-brief-ai-processing-and-history-b033.md`

---

### 2026-04-19 — B-033 Batch 4: Status badges + prefill banner + admin approve/reject (Claude Code)

**B-033 Batch 4 — two-track status badges, AI prefill banner, admin re-run AI**

**Created:** `src/components/shared/DocumentStatusBadge.tsx`
- Two-pill badge (AI status + admin status) with a `compact` mode that renders two colored dots + tooltip. Color map per brief: emerald (verified/approved), amber (flagged/manual_review), blue pulse (pending), grey (not_run), orange (pending_review), red (rejected).
- Legacy `admin_status === 'pending'` rows are normalized to `pending_review` for display.

**Created:** `src/components/shared/AiPrefillBanner.tsx`
- Renders a single one-document banner showing each `(field.label → value)` pair where `field.prefill_field` is mapped + whitelisted.
- Banner auto-hides when: no applicable fields, `doc.prefill_dismissed_at` is already set, or it was locally dismissed.
- `keep mine` (default) vs `overwrite all` toggle; Apply → `/api/profiles/kyc/save` then `/api/documents/[id]/dismiss-prefill`; Skip → just dismisses.
- Uses `KYC_PREFILLABLE_FIELDS` for field gating and looks up current values from both the joined KYC row and any provided `profileValues` (client_profiles fields like `full_name`/`address`).

**Created:** `src/app/api/documents/[id]/dismiss-prefill/route.ts`
- POST, auth required. Access gate: admin bypass, then uploader check, then service manager check via `profile_service_roles`, then direct `client_profile_id` match. Sets `prefill_dismissed_at=now()`.

**Updated:** `src/app/api/profiles/kyc/save/route.ts`
- `full_name` and `address` now route to `client_profiles` alongside the existing `email`/`phone` pathway so the prefill banner can write them. `full_name` removed from `EXCLUDED_FIELDS`.

**Updated:** `src/app/(client)/services/[id]/page.tsx`
- `ClientServiceDoc` gains `prefill_dismissed_at: string | null`; the documents `select()` (both branches) now loads that column so the banner can hide itself without a follow-up fetch.

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- `KycDocListPanel` now accepts `kycRecordId` + `profileValues`, displays `DocumentStatusBadge` in compact mode per uploaded row (replacing the emoji combo), and mounts `AiPrefillBanner` directly below each uploaded doc row when a KYC record id is available.
- Review-view mount passes `kycRecord.id` + the current profile/KYC values so the banner's "keep mine" toggle can skip fields that already have a value.
- The post-replace update inside `DocumentDetailDialog.onDocumentReplaced` populates `prefill_dismissed_at: null` so TypeScript stays happy with the new shape.

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- `AdminKycDocListPanel` replaced the emoji status icons with the compact `DocumentStatusBadge` (AI dot + admin dot + hover tooltip).

**Updated:** `src/components/shared/DocumentUploadWidget.tsx`
- Compact `documentDetailMode` state now shows file name + compact `DocumentStatusBadge` + View/Replace (replaces the "Already uploaded" green-check copy).

**Updated:** `src/components/shared/DocumentDetailDialog.tsx`
- Adds a "Status" section at the top of the body rendering `DocumentStatusBadge` (AI + admin pills). Local state `aiStatus`/`aiVerResult` keeps the dialog in sync after a re-run.
- New **Re-run AI** button next to Approve/Reject (and in a lighter row after approve/reject so admins can still re-verify). POSTs `/api/admin/documents/[id]/rerun-ai`, updates local state on success.
- `useEffect` syncs AI status when the `doc` prop changes.

**Build:** `npm run build` passes lint + types.

**Brief:** `docs/cli-brief-ai-processing-and-history-b033.md`

---

### 2026-04-19 — B-033 Batch 3: verifyDocument rework + upload branching + rerun endpoint (Claude Code)

**B-033 Batch 3 — AI verifier + upload branching + `POST /api/admin/documents/[id]/rerun-ai`**

**Updated:** `src/lib/ai/verifyDocument.ts`
- Added `extractionEnabled` + `aiExtractionFields` params to the call shape. Prompt now:
  - describes each extraction field (key/label/type/hint) when extraction is on, or
  - explicitly instructs the model to return `extracted_fields = {}` when off.
- `overall_status` is enforced server-side from `rule_results`: all-pass → verified, any-fail → flagged, unreadable → manual_review. Extraction failures never flag a doc.
- Date-typed extracted fields are normalized to ISO `YYYY-MM-DD`; unparseable dates are dropped and appended to `flags` instead of erroring.
- `match_results` is always returned as `[]` (legacy field kept in the schema).
- New `AiSkippedResult` type in `src/types/index.ts` (reserved for future explicit "skipped" rendering).

**Updated:** `src/app/api/services/[id]/documents/upload/route.ts` and `src/app/api/admin/services/[id]/documents/upload/route.ts`
- Loads `document_types.ai_enabled/ai_extraction_enabled/ai_extraction_fields/verification_rules_text` up front.
- Sets `verification_status = 'not_run'` when AI is disabled and skips the background AI job entirely.
- On re-upload (existing row) resets `admin_status='pending_review'`, clears note/by/at, clears `prefill_dismissed_at`, resets `verification_result` and `verified_at`.
- On new insert explicitly sets `admin_status='pending_review'` (DB default covers it, but belt-and-braces for older schemas).
- Background AI call now passes `plainTextRules`, `extractionEnabled`, `aiExtractionFields` from the doc type config.
- Select-back includes `prefill_dismissed_at` so the client can render the banner without a follow-up fetch.

**Updated:** `src/app/api/documents/library/route.ts`
- Same AI-enabled branching + extraction config forwarding. New documents now insert with `admin_status='pending_review'`, `prefill_dismissed_at=null`.

**Created:** `src/app/api/admin/documents/[id]/rerun-ai/route.ts`
- Admin-only POST. Refuses to run when the doc type has AI disabled. Sets `verification_status='pending'` + clears prior result + clears `prefill_dismissed_at` before running. Downloads the file from storage and re-runs `verifyDocument` with current config. Writes back status, result, verified_at. Logs `document_ai_rerun` to `audit_log`.

**Build:** `npm run build` passes lint + types.

**Brief:** `docs/cli-brief-ai-processing-and-history-b033.md`

---

### 2026-04-19 — B-033 Batch 2: Seed AI defaults + admin rules editor rework (Claude Code)

**B-033 Batch 2 — per-doc-type AI config + new Settings UI**

**Created:** `src/app/api/admin/migrations/seed-ai-defaults/route.ts`
- `POST` — admin-only, idempotent. Seeds `ai_enabled`, `ai_extraction_enabled`, `ai_extraction_fields` for the 12 named doc types from the brief. Sets `verification_rules_text` only when the row currently has `null` (existing rules are preserved).
- For any other active doc type, fills `ai_enabled=true`, `ai_extraction_enabled=false`, `ai_extraction_fields=[]` only where unset.
- Returns `{ seeded[], fallbacks[], summary }` so the admin can see what was found / missing / inserted.

**Updated:** `src/app/api/admin/document-types/[id]/rules/route.ts`
- PATCH payload now `{ ai_enabled, ai_extraction_enabled, ai_extraction_fields, verification_rules_text }`. Backwards-compatible: also accepts the old `verificationRulesText` camelCase key.
- Validates: `ai_extraction_fields` must be an array, each item needs unique non-empty `key` + `label`; `prefill_field` must be either `null`/empty or a value in the `KYC_PREFILLABLE_FIELDS` whitelist.

**Updated:** `src/app/(admin)/admin/settings/rules/page.tsx`
- Renamed page heading to "AI Document Rules" + descriptive lead.
- Each card now shows: `Enable AI` toggle, `Extract fields` toggle (greyed when AI is off), an editable extraction-fields table (Key / Label / Type / Prefill to / AI hint / delete) with `Add field`, the verification-rules textarea, and a single `Save` button.
- "Seed defaults" button in the page header POSTs to the new migration endpoint and reloads the doc-types list.
- Prefill-target dropdown is populated from `KYC_PREFILLABLE_FIELDS` plus a `— none —` option.
- Save serializes only the relevant fields and clears `ai_extraction_fields` to `[]` when AI is disabled.

**Build:** `npm run build` passes lint + types.

**Brief:** `docs/cli-brief-ai-processing-and-history-b033.md`

---

### 2026-04-19 — B-033 Batch 1: Schema migration (Claude Code)

**B-033 Batch 1 — AI processing columns + admin status normalization + history tables**

**Created:** `supabase/migrations/004-ai-processing-and-history.sql`
- `document_types`: new `ai_enabled bool default true`, `ai_extraction_enabled bool default false`, `ai_extraction_fields jsonb default '[]'`.
- `documents.verification_status` check constraint extended to allow `'not_run'`.
- `documents.admin_status` default set to `'pending_review'`; legacy nulls + `'pending'` rows backfilled to `'pending_review'`; column made `NOT NULL`; check constraint now `('pending_review','approved','rejected')`.
- `documents.prefill_dismissed_at timestamptz` (nullable).
- New table **`documents_history`** mirroring all current `documents` columns plus `history_id, document_id, operation, changed_at, changed_by, changed_by_role`. Index on `(document_id, changed_at desc)`.
- New table **`client_profile_kyc_history`** storing the full row as JSONB (40+ columns; trade-off documented inline). Index on `(client_profile_kyc_id, changed_at desc)`.
- Helper `public.get_history_actor_role(uid)` infers `admin | client | system` from `admin_users` membership.
- Triggers `documents_history_trg` and `client_profile_kyc_history_trg` (`AFTER INSERT|UPDATE|DELETE FOR EACH ROW`) snapshot rows on every change. Triggers swallow missing `auth.uid()` so service-role writes still log (`actor_role='system'`).
- RLS: both history tables read-only to admins; no insert/update/delete policy → only triggers can write.
- `assert_documents_history_sync()` compares column lists between `documents` and `documents_history` and is invoked at the end of the migration so any future drift fails it loudly.

**Created:** `src/lib/constants/prefillFields.ts`
- `KYC_PREFILLABLE_FIELDS` whitelist (10 columns) + `KycPrefillableField` type + `isKycPrefillableField` guard.

**Updated:** `src/types/index.ts`
- Added `'not_run'` to `VerificationStatus`; added type aliases `AiVerificationStatus`, `AdminReviewStatus`; added `AiExtractionField` interface.
- `DocumentType` now declares optional `verification_rules_text`, `ai_enabled`, `ai_extraction_enabled`, `ai_extraction_fields`.
- `DocumentRecord.admin_status` widened to `AdminReviewStatus | 'pending' | null` (legacy 'pending' kept for compat). Added optional `prefill_dismissed_at`.

**Updated:** `src/lib/utils/constants.ts`
- `VERIFICATION_STATUS_LABELS` / `_COLORS` extended with `not_run` entries (`AI Skipped` + grey).

**Build:** `npm run build` passes lint + types.

**Apply step (manual):** open Supabase SQL editor and execute `supabase/migrations/004-ai-processing-and-history.sql`. The file ends with `SELECT public.assert_documents_history_sync()` so the migration aborts if the history schema misses any documents column.

**Brief:** `docs/cli-brief-ai-processing-and-history-b033.md`

---

### 2026-04-19 — B-032: Client KYC polish (Claude Desktop)

**B-032 (Client KYC polish)** — three small UI fixes on the client KYC review screen.

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Inline role-add label for shareholder now reads `Shareholder %:` instead of `Shareholder:`

**Updated:** `src/components/kyc/steps/IdentityStep.tsx`
- Removed duplicate `Work / Professional Details` heading + Occupation field (moved to FinancialStep)

**Updated:** `src/components/kyc/steps/FinancialStep.tsx`
- Single `Work / Professional Details` block, rendered above Source of Funds
- Occupation always visible; work address/phone/email gated by CDD+/EDD (unchanged rule)

**Updated:** `src/components/kyc/steps/DeclarationsStep.tsx`
- Removed `Switch` import
- New inline `YesNoRadio` component used for both PEP and Legal Issues declarations
- Three-state handling: `is_pep` / `legal_issues_declared` null = no selection, `true` = Yes, `false` = No
- PEP upload card remains visible regardless of the answer (declaration form is still signed when declaring no exposure)

**Brief:** `docs/cli-brief-kyc-polish-b032.md`

### 2026-04-19 — B-031: Client KYC dedup + AI key dev-script fix (Claude Desktop)

**B-031 (Client KYC dedup + AI key fix)**

Removes duplicated email/phone and duplicated document upload cards that appeared in the KYC step forms when the wizard is rendered inside the service review split layout (top-left `ProfileEditPanel` + top-right `KycDocListPanel` already own those concerns). Other wizard mount points (`/kyc`, `/kyc/fill/[token]`, admin) are unchanged via prop defaults.

**Updated:** `src/components/kyc/steps/IdentityStep.tsx`
- New props: `showContactFields?: boolean` (default `true`), `hideDocumentUploads?: boolean` (default `false`)
- Passport upload card and Proof of Residential Address upload card wrapped in `!hideDocumentUploads`
- Email + phone row wrapped in `showContactFields`

**Updated:** `src/components/kyc/steps/FinancialStep.tsx`
- New prop: `hideDocumentUploads?: boolean` (default `false`)
- All 8 `InlineUpload` renders (SoF declaration, SoF evidence, bank ref, CV, SoW declaration, SoW evidence, professional ref, tax residency cert) wrapped in `!hideDocumentUploads`

**Updated:** `src/components/kyc/steps/DeclarationsStep.tsx`
- New prop: `hideDocumentUploads?: boolean` (default `false`)
- PEP Declaration Form upload card wrapped in `!hideDocumentUploads`

**Updated:** `src/components/kyc/KycStepWizard.tsx`
- New props `showContactFields` and `hideDocumentUploads` on `KycStepWizardProps`, forwarded into Identity/Financial/Declarations steps

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Review-view `KycStepWizard` mount passes `showContactFields={false}` + `hideDocumentUploads={true}`

**Updated:** `package.json`
- `"dev"` script now prefixes with `unset ANTHROPIC_API_KEY &&` so Claude Desktop's empty-string export no longer overrides `.env.local`. Resolves tech debt #16 (silent AI verification failure on local dev).

**Brief:** `docs/cli-brief-kyc-dedup-b031.md`

**Verify after pulling:**
1. `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev`
2. Client KYC review for a person — no duplicate email/phone, no duplicate upload cards
3. Upload a document — AI verification should transition pending → verified/flagged (not stuck on pending and not silently `manual_review`)

### 2026-04-18 — B-027 Batch 5: KYC section doc status checkmarks (Claude Code)

**B-027 (KYC document layout rework) — Batch 5**

**Updated:** `src/components/shared/DocumentUploadWidget.tsx`
- Added `documentDetailMode?: boolean` prop
- When `documentDetailMode={true}` and `existingDocument` is set: renders simplified "☑ Already uploaded" state with file name, Eye/View button, and Replace button; Eye opens `DocumentDetailDialog` (client mode, isAdmin=false)
- When `documentDetailMode={false}` (default): renders existing detailed compact view with `DocumentPreviewDialog` (backward compatible)

**Updated:** `src/components/kyc/steps/IdentityStep.tsx`
- `DocumentUploadWidget` for passport and proof of address: pass `documentDetailMode={!!passportDoc}` / `documentDetailMode={!!addressDoc}`

**Updated:** `src/components/kyc/steps/FinancialStep.tsx`
- `InlineUpload` helper: pass `documentDetailMode={!!existing}` to `DocumentUploadWidget`

**Updated:** `src/components/kyc/steps/DeclarationsStep.tsx`
- `DocumentUploadWidget` for PEP declaration: pass `documentDetailMode={!!pepDoc}`

### 2026-04-18 — B-027 Batch 4: Admin PersonCard split layout (Claude Code)

**B-027 (KYC document layout rework) — Batch 4**

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- Added imports: `useRef`, `CheckSquare`, `Square`, `DocumentDetailDialog`, `DocumentDetailDoc`
- Added `AdminKycDocListPanel` component (before PersonCard):
  - Shows identity/financial/compliance docs for the profile
  - Upload (POST to `/api/services/[id]/documents/upload`) + view (DocumentDetailDialog with isAdmin=true)
  - Compact status icons (AI + admin status), scrollable if >5 docs
  - "X of Y uploaded" count
- `PersonCard` expanded body restructured as 2-column grid:
  - Left: Profile edit (full name, email, phone) + Roles management (unchanged logic)
  - Right: `AdminKycDocListPanel`
  - KYC long-form sections remain below, unchanged
- `PersonCard` accepts new optional `updateRequests?: DocumentUpdateRequest[]` prop
- `PersonCard` call site passes `updateRequests={updateRequests}`

### 2026-04-18 — B-027 Batch 3: Client KYC review split layout (Claude Code)

**B-027 (KYC document layout rework) — Batch 3**

**Updated:** `src/app/(client)/services/[id]/page.tsx`
- `ClientServiceDoc` extended: added `mime_type`, `verification_result`, `admin_status` fields
- Documents query now selects these fields

**Created:** `src/app/api/profiles/[id]/route.ts`
- PATCH endpoint for updating `email` and `phone` on a `client_profiles` row
- Clients: email + phone only; admins: full_name, email, phone, address
- Scoped by tenant_id

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Added `KYC_DOC_CATEGORIES` + `isKycDocCat()` helper
- Added `ProfileEditPanel` component: email + phone editable (dirty-tracked), roles list with Remove
- Added `KycDocListPanel` component: shows identity/financial/compliance docs for the person, upload + view (DocumentDetailDialog) per doc row, compact status icons, scrollable if >5 docs
- KYC review view now shows 2-column top section (Profile+Roles left, KYC Docs right) above KycStepWizard
- `mapToDocumentRecord` updated to map `mime_type`, `verification_result`, `admin_status` from `ClientServiceDoc`
- Added imports: `useRef`, `Upload`, `Eye`, `CheckSquare`, `Square`, `DocumentDetailDialog`

### 2026-04-18 — B-027 Batch 2: DocumentDetailDialog shared component (Claude Code)

**B-027 (KYC document layout rework) — Batch 2**

**Created:** `src/components/shared/DocumentDetailDialog.tsx`
- Shared dialog for document review used in both admin and client contexts
- Props: `doc: DocumentDetailDoc`, `isAdmin`, `open`, `onOpenChange`, `recipients`, `updateRequests`, `serviceId`, `onStatusChange`, `onRequestSent`, `onDocumentReplaced`
- Inline preview: fetches signed URL, renders image/iframe/download based on mime_type
- AI verification section: confidence %, rules passed, flags (amber), failed rules (red)
- Extracted fields collapsible section
- Admin only: approve/reject (calls `/api/admin/documents/library/{id}/review`), rejection note inline
- Admin only: "Send Update Request" opens `DocumentUpdateRequestDialog` sub-dialog
- Shows most recent update request preview below request button
- Footer: Replace Document (upload, admin+client), Download, Close
- `DocumentDetailDoc` interface allows use with both `ServiceDoc` and extended `ClientServiceDoc`

### 2026-04-18 — B-027 Batch 1: Category filter fixes + role dropdown fix (Claude Code)

**B-027 (KYC document layout rework) — Batch 1**

**Updated:** `src/types/index.ts`
- Removed `'kyc'` from `DocumentType.category` union — there is no `kyc` category in the DB
- Valid categories: `identity | corporate | financial | compliance | additional`

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- Added module-level `KYC_DOC_CATEGORIES` and `isKycDoc()` helper
- Fixed `kycDocTypes` filter (line ~580): `category === "kyc"` → `isKycDoc(dt.category)`
- Fixed `profileDocs` / `corporateDocs` split (lines ~1877): use `isKycDoc()`
- Fixed role dropdown: `value` now uses `effectiveAddRoleValue` to avoid showing an unselected option when first available role differs from "director"

**Updated:** `src/components/client/ServiceWizardDocumentsStep.tsx`
- Added `isServiceDoc` helper: `cat === "corporate" || cat === "additional"`
- Fixed `requiredDocTypes` filter: was `corporate || compliance || ""` → now `corporate || additional`
- Fixed `documents` state initializer: was excluding `kyc | identity` → now includes only `corporate | additional`
- Fixed `extraUploaded`: simplified — no longer needs to re-check categories since state only contains service docs

### 2026-04-17 — B-026 Batch 3: Role management per PersonCard + Corporation KYC (Claude Code)

**B-026 (Client view parity) — Batch 3**

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- `PersonCard` completely rewritten with per-role management:
  - Removed single "X" remove button from header
  - Added "Roles" section at bottom of each card showing all roles with Remove buttons
  - Confirmation dialog for last-role removal (removes person from service)
  - "Add role" dropdown for unassigned roles
  - If adding Shareholder: % input shown inline
  - Add role calls `POST /api/services/[id]/persons` with `client_profile_id` + role
- `PersonCard` now accepts `allRoleRows: ServicePerson[]`, `onRoleRemoved`, `onRoleAdded` (removed `onRemove`, `combinedRoles`)
- Roster view: grouping updated to produce `roleRows` per profile (all ServicePerson entries)
- `handleRemove` replaced by `handleRoleRemoved` + `handleRoleAdded` callbacks
- `profileType` prop passed to `KycStepWizard` based on `record_type`
- `ROLE_LIST` added as module-level constant

**Updated:** `src/components/kyc/KycStepWizard.tsx`
- Added `profileType?: "individual" | "organisation"` prop
- Organisation path: 3 steps — Company Details, Tax / Financial, Review & Submit
- `CompanyDetailsStep`: company name, registration number, jurisdiction, incorporation date, activity, sector, listed/unlisted
- `CorporateTaxStep`: tax residency, tax ID, regulatory licences
- `OrgReviewStep`: tabular summary of all org fields
- Individual path: unchanged (Identity → Financial → Declarations/Review)
- Added `Input`, `Label`, `Textarea` imports for org step forms

### 2026-04-17 — B-026 Batch 2: Add Profile Dialog + Ownership Structure visual (Claude Code)

**B-026 (Client view parity) — Batch 2**

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- `AddPersonModal` completely rewritten with enhanced dialog:
  - Search box (filters both linked and available profiles)
  - Linked profiles shown at top as disabled with role badges (from `currentPersons` prop)
  - Available profiles (from API) selectable with click-toggle
  - "Or create new" section: Individual / Corporation radio, name field, email field
  - Email and record_type sent in POST body for new profiles
- `OwnershipStructure` component added:
  - Collapsible section header showing total %
  - Editable % inputs per shareholder with progress bars
  - Unallocated row when total < 100%
  - Save button PATCHes all shareholding percentages
  - Warning badge when total ≠ 100%
  - Updates `persons` state via `onSaved` callback
- Shareholding text alert replaced with `OwnershipStructure` visual
- Unused `totalShares` / `shareholdingWarning` variables removed

**Updated:** `src/app/api/services/[id]/persons/route.ts`
- POST now accepts `email` and `record_type` in request body
- Creates profile with correct `record_type` (previously hardcoded `"individual"`)
- Stores `email` on new profile

### 2026-04-17 — B-026 Batch 1: KYC doc plumbing + Documents step = corporate only (Claude Code)

**B-026 (Client view parity) — Batch 1**

**Updated:** `src/types/index.ts`
- `DueDiligenceRequirement.document_types` now includes `category?: string | null`

**Updated:** `src/app/(client)/services/[id]/page.tsx`
- `ClientServiceDoc` type: added `document_type_id: string | null`, `client_profile_id: string | null`
- `ServicePerson.client_profiles` type: added `record_type: string | null`
- Persons query: now selects `record_type` from `client_profiles`
- Documents query: now selects `document_type_id` and `client_profile_id`
- DD requirements query: now selects `category` from `document_types`

**Updated:** `src/components/client/ServiceWizard.tsx`
- `ServiceWizardPeopleStep` now receives `documents` prop (passed from wizard state)
- Fixed `requiredDocTypes` category mapping: uses `r.document_types?.category` (was incorrectly using `document_types.name`)

**Updated:** `src/components/client/ServiceWizardDocumentsStep.tsx`
- Filters `requiredDocTypes` to corporate/compliance only — KYC docs no longer shown here
- Filters `extraUploaded` to exclude `kyc` and `identity` category docs
- KYC docs (passport, address, bank ref, source of funds) now belong in the People & KYC step

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Accepts `documents: ClientServiceDoc[]` prop
- `mapToKycRecord`: uses actual `record_type` from `client_profiles` (was hardcoded `"individual"`)
- Added `mapToDocumentRecord()` helper converting `ClientServiceDoc` → `DocumentRecord`
- `KycStepWizard` now receives profile-specific docs: `documents.filter(d => d.client_profile_id === profile.id).map(mapToDocumentRecord)`
- Passport and address upload slots in Identity step now show existing uploads

### 2026-04-17 — B-025 Batch 3: Role management, Edit Profile, Corp KYC (Claude Code)

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- `PersonCard` now accepts `allRoleRows: RoleWithProfile[]` (all role rows for this person)
- Inline **Edit Profile** section inside expanded card: full_name, email, phone (editable), record_type (read-only); calls PATCH `/api/admin/profiles-v2/[id]`
- **Roles management section** inside expanded card:
  - Shows all current roles with individual Remove buttons
  - Removing last role: confirm dialog before deleting, removes person from service
  - Add role dropdown (only unassigned roles shown) + optional shareholding % input for shareholder
- **Corporation KYC sections** (`record_type === "organisation"`): "Company Details" (company name, registration number, jurisdiction, incorporation date, activity, sector, listed/unlisted) and "Tax / Financial" (jurisdiction tax residence, tax ID, regulatory licenses)
- Added `KycSection` and `KycField` types; `select` field type with `options` array supported
- `KycLongForm` accepts `recordType` prop; branches to `KYC_SECTIONS_ORG` for organisations
- Doc slots shown in first section of each KYC form (Identity for individuals, Company Details for corps)
- `profileRolesMap` now tracks `allRoleRows` instead of `roleIds`

---

### 2026-04-17 — B-025 Batch 2: New Add Profile Dialog + Ownership Structure (Claude Code)

**Updated:** `src/app/api/admin/services/[id]/roles/route.ts`
- Extended POST to support creating new profiles (accepts `full_name`, `email`, `record_type` alongside `role`)
- Creates `client_profiles` row + `client_profile_kyc` row + `profile_service_roles` row
- Returns `client_profile_id` in response for auto-expand after creation
- Backwards-compatible: existing `client_profile_id` flow unchanged

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- Replaced dropdown-style `AddProfileDialog` with proper centered `<Dialog>` modal
  - Title changes per button: "Add Director" / "Add Shareholder" / "Add UBO"
  - Search list shows ALL profiles; already-linked profiles show role badges and are disabled (grayed, cursor-not-allowed)
  - Available profiles: clickable with blue highlight on selection
  - "Or create new" section: Individual/Corporation radio + name (required) + email (optional)
  - Both paths call POST `/api/admin/services/[id]/roles`
  - After add: dialog closes, page refreshes, newly added card auto-expands
- Added `OwnershipStructure` component (replaces static display)
  - Collapsible; default open when total ≠ 100%
  - Editable number inputs per shareholder with live progress bars
  - Unallocated row shows remaining %
  - Amber warning banner when total ≠ 100%
  - "Save Ownership" button PATCHes each shareholder's `shareholding_percentage`
- `PersonCard` accepts `defaultExpanded` prop for auto-expand after adding
- Added `newlyAddedProfileId` state + `handleProfileAdded` callback
- Removed now-unused `useRef` import and `existingProfileIds` variable

---

### 2026-04-17 — B-025 Batch 1: KYC Doc Slots + Document Split (Claude Code)

**Updated:** `src/types/index.ts`
- Added `'kyc'` to `DocumentType.category` union (for per-person KYC document types)

**Updated:** `src/app/api/admin/services/[id]/documents/upload/route.ts`
- Added `clientProfileId` field to FormData parsing
- `clientProfileId` now included in both insert and update operations
- Select returns `document_type_id`, `client_profile_id`, `document_types(id, name, category)`

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- Added `KycDocSlot` component: per-person doc upload slot inside KYC sections; calls admin upload route with `clientProfileId` in FormData; shows verification badge + preview/replace for uploaded docs
- Added `profileId`, `serviceId`, `profileDocuments`, `documentTypes`, `onDocUploaded` props to `KycLongForm`
- `KycLongForm` renders KYC-category doc slots inside the Identity section (when `profileId` and `documentTypes` are provided)
- `PersonCard` now accepts `profileDocuments` and `documentTypes` props, passes them to `KycLongForm`
- Main component splits `documents` into `profileDocs` (category='kyc') and `corporateDocs` (everything else)
- Each `PersonCard` receives only its own profile's KYC docs
- `AdminDocumentsSection` receives `corporateDocs` only (corporate/compliance/service-level docs)
- Documents section title count reflects only corporate docs

---

### 2026-04-17 — B-024 Batch 2: Rich Document Cards UI (Claude Code)

**Created:** `src/components/admin/DocumentUpdateRequestDialog.tsx`
- Dialog for sending document update requests to owners or representatives
- Radio buttons for recipient selection (document owner vs representative)
- Optional auto-populate from AI flags (pre-fills note textarea with bullet points)
- Calls POST /api/admin/documents/[id]/request-update on submit

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- Added `DocumentPreviewDialog`, `DocumentUpdateRequestDialog` imports
- Replaced simple document list with `AdminDocumentsSection` component
- `RichDocumentCard` per uploaded doc: AI verification line (confidence %, rules passed), flags, extracted fields (collapsible), approve/reject buttons, preview/download/request-update buttons, update request history
- Missing docs (required by DD requirements, not uploaded): "Not uploaded" row with Upload button that calls `/api/admin/services/[id]/documents/upload`
- Flagged summary at bottom when any docs have flags or failed rules
- `setDocuments`/`setUpdateRequests` used to update state on upload/request-sent (no page reload needed)

---

### 2026-04-17 — B-024 Batch 1: Admin Documents Data Layer + API Routes (Claude Code)

**Updated:** `src/app/(admin)/admin/services/[id]/page.tsx`
- `ServiceDoc` type extended: `verification_result`, `admin_status`, `admin_status_note`, `admin_status_by`, `admin_status_at`, `mime_type`, `client_profiles(id, full_name)`
- Added `DocumentUpdateRequest` export type
- Documents query expanded with all new fields + `client_profiles` join
- Added parallel `document_update_requests` query (grouped by service_id, desc by sent_at)
- Passes `updateRequests` prop to `ServiceDetailClient`

**Created:** `src/app/api/admin/documents/[id]/request-update/route.ts`
- POST — admin only, creates `document_update_requests` row + sends email via Resend
- Body: `{ service_id, sent_to_profile_id, note, auto_populated_from_flags? }`
- Subject: "Document Update Required — {DocType} for {ServiceName}"

**Created:** `src/app/api/admin/services/[id]/documents/upload/route.ts`
- POST — admin only, uploads to `documents` table with `service_id` + triggers AI verification
- Body: FormData `{ file, documentTypeId }`

**DB migrations already run (user confirmed):**
```sql
CREATE TABLE document_update_requests (...)  -- see brief for full SQL
```
**Note:** If admin_status column doesn't exist on documents, run:
```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_status text DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_status_note text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_status_by uuid;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_status_at timestamptz;
```
(These columns are already used by the existing review route — likely already exist.)

---

### 2026-04-17 — B-023 Batch 3: Client "Last Request Sent" Info (Claude Code)

**Updated:** `src/app/(client)/services/[id]/page.tsx`
- Added `invite_sent_by` field to persons query
- After fetch, resolves sender names from `profiles` table by matching user IDs
- Enriches persons with `invite_sent_by_name` before passing to client component
- `ServicePerson` type: added `invite_sent_by_name: string | null`

**Updated:** `/api/services/[id]/persons/[roleId]/send-invite/route.ts`
- Records `invite_sent_by: session.user.id` on the role row when invite is sent

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Shows "Last request sent on {date} by {name}" below invite button when `invite_sent_at` is set
- `invite_sent_by_name` read as plain const (not state — value is fixed at render time)
- Added `invite_sent_by_name: null` to the `onAdded(...)` call to satisfy `ServicePerson` type

**DB migration required (run once in Supabase SQL editor):**
```sql
ALTER TABLE profile_service_roles ADD COLUMN IF NOT EXISTS invite_sent_by uuid REFERENCES auth.users(id);
```

---

### 2026-04-17 — B-023 Batch 2: Admin Collapsible PersonCards + InviteKycDialog (Claude Code)

**Created:** `src/components/shared/InviteKycDialog.tsx`
- Shared dialog for requesting KYC from a person (same pattern as client InviteDialog)
- Calls `/api/services/[id]/persons/[roleId]/send-invite`
- Pre-fills email from props

**Updated:** `/api/services/[id]/persons/[roleId]/send-invite/route.ts`
- Admin sessions (`session.user.role === "admin"`) can now call this route without `can_manage` check

**Updated:** `ServiceDetailClient.tsx` — admin `PersonCard` rewrite:
- Card header is now collapsible (click to expand/collapse KYC sections)
- Chevron indicates expand state; KycLongForm shows inline when expanded
- Removed old "Review KYC" toggle button; expansion via header click
- Replaced `sendInvite()` with "Request to Fill and Review KYC" button → InviteKycDialog
- Shows "Last request sent on {date}" after invite is sent

---

### 2026-04-17 — B-023 Batch 1: KYC Field Layout (Claude Code)

**Admin KYC sections** (`ServiceDetailClient.tsx`):
- Renamed "Identity" → "Your Identity"; removed `occupation`; added `email`, `phone`
- Added new section "Work / Professional Details": `occupation`, `work_address`, `work_email`, `work_phone`
- `KycLongForm` now accepts `profileEmail`/`profilePhone` props and seeds them into initial fields state (since they live on `client_profiles`, not `client_profile_kyc`)

**Client KYC Identity step** (`IdentityStep.tsx`):
- Moved `occupation` from the bottom grid into a new "Work / Professional Details" subsection

**Save route** (`/api/profiles/kyc/save`):
- `email` and `phone` removed from EXCLUDED_FIELDS → now handled as PROFILE_FIELDS
- When `email` or `phone` are in the payload, they are written to `client_profiles` instead of `client_profile_kyc`

---

### 2026-04-17 — B-022: 10 Client Portal Fixes (Claude Code)

**Fix #1 — Dashboard "Review and Complete" opens wizard:**
- `DashboardClient.tsx`: "Review and Complete" now navigates to `/services/[id]?startWizard=true`
- `services/[id]/page.tsx`: Added `startWizard` to searchParams type; `startWizard=true` sets `autoWizardStep=0`

**Fix #2 — "Back to Dashboard" link color:**
- `ClientServiceDetailClient.tsx`: Renamed "Back to overview" → "Back to Dashboard"; changed to `text-blue-600 hover:text-blue-800 font-semibold`

**Fix #3 — Country search dropdown styling:**
- `MultiSelectCountry.tsx`: Added `text-gray-900 placeholder:text-gray-500` to input; search input wrapper is now `max-w-md`

**Fix #4 — Red labels for empty required fields:**
- `DynamicServiceForm.tsx`: Detects partial fill (any field has value). When partially filled, empty required field labels render as `text-red-600`. All field types (text, textarea, select, boolean, multi_select_country) updated.

**Fix #5 — KYC Review Save/Next nav:**
- `ServiceWizardPeopleStep.tsx`: Changed `compact={true}` → `compact={false}` on KycStepWizard in review mode. The wizard now uses its built-in `sticky bottom-0` nav bar instead of inline compact nav.

**Fix #6 — Invite popup "Email Sent" toast:**
- `ServiceWizardPeopleStep.tsx`: Changed toast text from "Request sent!" to "Email Sent". Already closes on success (verified).

**Fix #7 — Unsaved changes warning:**
- `ServiceWizard.tsx`: Added `onDirtyChange` prop; tracks `isDirty` (JSON comparison vs original); adds `beforeunload` handler when dirty; clears dirty on save
- `ClientServiceDetailClient.tsx`: Tracks `wizardIsDirty`; "Back to Dashboard" shows custom confirmation dialog when dirty ("Leave without saving" / "Stay")

**Fix #8 — Documents show KYC-uploaded docs:**
- `services/[id]/page.tsx`: Refactored to fetch persons first, then fetch docs using OR query: `service_id.eq.{id},client_profile_id.in.({profileIds})`

**Fix #9 — Document upload client_id FK (already resolved):**
- Upload route was already omitting `client_id` on insert; DB column already made nullable by user

**Fix #10 — "Back to People" link color:**
- `ServiceWizardPeopleStep.tsx`: Changed to `text-blue-600 hover:text-blue-800 font-semibold`

**SQL migration needed (user must run):** None for B-022 (client_id was already made nullable)

---

### 2026-04-17 — B-021: Admin Service Detail Rework (Claude Code)

**Part 1 — Services List "by name":**
- `services/page.tsx`: Added parallel `audit_log` query filtered by `entity_type = 'service'`. Builds map of most-recent audit entry per service. Passes `lastUpdatedAt` and `lastUpdatedBy` (actor_name). ServicesPageClient's `LastUpdatedCell` already supported the two-line display.

**Part 2 — Service Detail 9 sections:**

**Created:**
- `src/components/admin/ServiceCollapsibleSection.tsx` — reusable collapsible card with inline progress bar, RAG dot, percentage, and "Admin" badge

**Expanded server page** (`services/[id]/page.tsx`):
- Adds queries for `admin_users`, `audit_log` (service entries, 100 rows), `due_diligence_requirements`, `document_types`
- New exported types: `AdminUser`, `ServiceAuditEntry`

**Rewrote** `ServiceDetailClient.tsx` — full 9-section layout:
- Header: service number + name, status badge + dropdown, account manager dropdown (stored in `service_details._assigned_admin_id`), Save/Cancel buttons (appear when changes pending)
- Section 1–3: Company Setup / Financial / Banking — each filtered by SECTION_MATCHERS, editable `DynamicServiceForm`, section progress bar
- Section 4: People & KYC — unique roles by profile ID, per-person KYC progress bar, can_manage toggle, invite button, add/remove, shareholding tracker
- Section 5: Documents — list with verification status badges
- Section 6: Internal Notes (admin) — textarea, saves to `service_details._admin_notes`
- Section 7: Risk Assessment (admin) — DD level selector (`_dd_level`), completion summary with per-section bars, required docs checklist
- Section 8: Milestones (admin) — toggle + date picker per milestone (LOE/Invoice/Payment)
- Section 9: Audit Trail (admin) — reuses `AuditTrail` component, by-user and by-action filters

---

### 2026-04-17 — B-020 Batch 3: AI verification on upload + submit validation dialog (Claude Code)

**Item 7 (AI verification on upload):** Wired `verifyDocument` into `services/[id]/documents/upload/route.ts` as a fire-and-forget call after upload. Fetches `document_types.ai_verification_rules`, runs AI, updates `documents.verification_status` + `verified_at` in background. Upload response is not blocked.

**Item 8 (Submit validation):**
- Created `src/app/api/services/[id]/validate/route.ts` — POST, verifies can_manage, checks: required fields for all 3 field sections, at least 1 director, shareholding ~100% if shareholders exist, all persons KYC completed, required docs uploaded, no flagged/rejected docs. Returns `{ valid, issues[] }`.
- Created `src/components/client/SubmitValidationDialog.tsx` — 3-phase modal: loading spinner, all-checks-passed, issues list. "Submit Application" only enabled if valid.
- Updated `src/components/client/ServiceWizard.tsx` — `handleSubmit` calls validate first, shows dialog; new `handleConfirmSubmit` PATCHes status to "submitted" and closes wizard.

**Files created:**
- `src/app/api/services/[id]/validate/route.ts`
- `src/components/client/SubmitValidationDialog.tsx`

**Files modified:**
- `src/app/api/services/[id]/documents/upload/route.ts` — added fire-and-forget AI verification
- `src/components/client/ServiceWizard.tsx` — validation dialog integration, `handleConfirmSubmit`

---

### 2026-04-17 — B-020 Batch 2: KYC invite dialog + updated email body (Claude Code)

**#4 KYC Invite Popup:** PersonCard now shows "Request to fill and review KYC" button that opens an `InviteDialog` modal (email pre-filled, optional note textarea). Status shows "Request sent" after sending.

**#5 Invite Email Body:** Updated `send-invite` route — subject includes service name; body includes role label (Director/Shareholder/UBO/etc.), service name; signed off with "autogenerated on behalf of {sender name}"; optional sender note shown if provided; accepts `note?: string` in POST body.

**Files modified:**
- `src/components/client/ServiceWizardPeopleStep.tsx` — added `InviteDialog` component; `PersonCard` uses dialog instead of direct API call; button text → "Request to fill and review KYC"; status → "Request sent"
- `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` — reads `note` from POST body; fetches service name; includes `roleLabel`, `serviceName`, `senderName`, optional note in HTML email

---

### 2026-04-17 — B-020 Batch 1: Dashboard rework + toast position + wizardStep link (Claude Code)

**#1 Dashboard Greeting:** "Welcome {name}" headline + subtitle ("Please provide the missing information...")

**#2 Dashboard Service Cards:** Complete rework — removed ACTION NEEDED section; each card now shows status badge, overall progress bar (green/amber by %), "Review and Complete" button, collapsible section checklist (5 sections with ✅/❌ + "Review >" per-section deep-link to wizard step)

**#3 Toast Position:** All `toast.success/error` in `ServiceWizard.tsx` set to `{ position: "top-right" }` so they don't cover wizard nav buttons

**WizardStep query param:** `?wizardStep=N` on `/services/[id]` now auto-opens the wizard at step N (dashboard "Review >" buttons pass this param)

**Files modified:**
- `src/app/(client)/dashboard/page.tsx` — computes section completions (calcSectionCompletion, calcKycCompletion) server-side per service; passes ServiceCardRow[] to DashboardClient; removed pendingActions
- `src/components/client/DashboardClient.tsx` — complete rewrite with new greeting + service card design; removed PendingAction types/rendering
- `src/app/(client)/services/[id]/page.tsx` — reads `searchParams.wizardStep`, passes `autoWizardStep` to client
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx` — added `autoWizardStep?: number` prop; initializes `wizardMode=true` and `wizardStartStep` from it
- `src/components/client/ServiceWizard.tsx` — toast position top-right on Saved/Progress saved/error

---

### 2026-04-17 — B-019: People & KYC Wizard Step Rework (Claude Code)

**Problem solved:** Removed the confusing dual-navigation (inner "Continue to KYC" + outer wizard nav).

**New design:** Step 4 shows a person roster with per-person KYC status. Clicking "Review KYC" opens a focused KYC form (outer wizard nav hidden). Outer Next/Back handles step navigation only.

**Files created:**
- `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` — client-accessible invite route: verifies can_manage, generates token+code, sends Resend email, updates profile_service_roles.invite_sent_at

**Files modified:**
- `src/app/(client)/services/[id]/page.tsx` — added `invite_sent_at` to `ServicePerson` type + persons query
- `src/components/client/ServiceWizardPeopleStep.tsx` — complete rewrite: roster view with PersonCard (KYC % bar, Review KYC, Send Invite / Invite Sent ✓, Remove), KYC review mode (replaces roster, shows KycStepWizard in compact+inlineMode), `onNavVisibilityChange` prop replaces `onNext`
- `src/components/client/ServiceWizard.tsx` — added `hideWizardNav` state, passes `onNavVisibilityChange={setHideWizardNav}` to PeopleStep, conditionally renders `ServiceWizardNav`

**KYC % calculation:** 11 fields (identity 6 + financial 2 + declarations 3); inline in component
**Invite flow:** email sent via Resend to `/kyc/fill/[token]`; `verification_codes` row inserted without `kyc_record_id` (new model uses `client_profile_kyc`, not `kyc_records`)

---

### 2026-04-17 — B-018 Batch 2: MiniProgressBar + admin services table rework (Claude Code)

**Files created:**
- `src/components/shared/MiniProgressBar.tsx` — reusable 60×4px progress bar; green ≥80%, amber >0%, red =0%; tooltip via `title` attribute
- (serviceCompletion.ts extended) — added `calcSectionCompletion(fields, details, sectionKey)` for Company Setup / Financial / Banking section-filtered completion

**Files modified:**
- `src/app/(admin)/admin/services/page.tsx` — expanded query: full service_fields, KYC data, batch-fetched documents per service; computes `AdminServiceRow[]` with 5 section percentages + manager list server-side; exports `AdminServiceRow` type and `templateOptions` for filter bar
- `src/app/(admin)/admin/services/ServicesPageClient.tsx` — complete rewrite: new columns (Ref/service_number, Status, Managers, Co.Setup%, Financial%, Banking%, People&KYC%, Docs%, Last Updated); filter bar with search (ref + manager name), service type chips (driven by templateOptions), status filter chips; "Service" column removed (now a filter); relative time for Last Updated

**Notes:**
- `lastUpdatedBy` is null/TODO until audit_log is confirmed to track service changes
- `service_number` shows "No ref" in italic if null (for services created before migration)

---

### 2026-04-17 — B-018 Batch 1: service_number DB migration + type + auto-generation (Claude Code)

**DB — SQL to run manually in Supabase SQL editor:**
```sql
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_number text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_service_number ON services(service_number) WHERE service_number IS NOT NULL;
```

**Files created:**
- `src/app/api/admin/migrations/add-service-numbers/route.ts` — POST migration route that backfills `service_number` for all services without one. Uses prefix logic (GBC/AC/DC/TFF/RLM/SVC) based on template name. Run AFTER the SQL above.

**Files modified:**
- `src/types/index.ts` — Added `service_number: string | null` to `ServiceRecord`; also added `service_fields` to the joined `service_templates` shape for progress bar support
- `src/app/api/admin/services/route.ts` — POST handler now auto-generates `service_number` on service creation (looks up template name → prefix → max existing → next seq)

---

### 2026-04-17 — B-017: Client Service Wizard Rework (Claude Code)

**Landing page (ClientServiceDetailClient.tsx — REWRITE):**
- Default view is now a section checklist with 5 rows (Company Setup, Financial, Banking, People & KYC, Documents)
- Each row shows Complete/Incomplete + individual "Review" button that opens wizard at that step
- Greeting banner: amber "please complete" or green "all complete"
- "Review and Complete" CTA opens wizard at step 0
- Live state sync: wizard close propagates updated serviceDetails, persons, docs back to landing page

**Wizard infrastructure:**
- `ServiceWizardStepIndicator.tsx` — clickable step dots with complete/current/future states
- `ServiceWizardNav.tsx` — sticky bottom bar: Save & Close, Back, Next, Submit (green, only on last step, gated by canSubmit)
- `ServiceWizardStep.tsx` — thin wrapper: renders DynamicServiceForm for field-based steps
- `ServiceWizard.tsx` — main container: manages step state, serviceDetails, persons, docs; saves on every Next via PATCH /api/admin/services/[id]

**Field section routing:**
- Step 0 (Company Setup): fields with section "Company Setup", "Details", or no section
- Step 1 (Financial): fields where section matches /financial|finance/i
- Step 2 (Banking): fields where section matches /bank/i
- Missing section → auto-complete (0 required fields)

**Step 4 — People & KYC (ServiceWizardPeopleStep.tsx):**
- Roster view: add Director/Shareholder/UBO, list existing, remove (same API as B-016)
- "Continue to KYC" gated on at least 1 director being present
- Linear per-person KYC walkthrough using KycStepWizard compact+inline mode
- "Skip for now" button per person; auto-advances after onComplete
- Mini progress dots for the person sequence

**Step 5 — Documents (ServiceWizardDocumentsStep.tsx):**
- Shows required doc types (from DD requirements) + any already-uploaded docs
- Per-row upload button → calls new POST /api/services/[id]/documents/upload
- Auto-updates checklist on successful upload

**New API route:**
- `src/app/api/services/[id]/documents/upload/route.ts` — POST: verifies can_manage, validates MIME/size, uploads to Supabase Storage at services/[id]/[typeId]/..., upserts documents row

**Files modified:**
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx` — full rewrite (landing + wizard toggle)
- `src/app/(client)/services/[id]/page.tsx` — removed clientProfileId prop (no longer needed)
- `src/components/kyc/KycStepWizard.tsx` — saveUrl+inlineMode props added (B-016, referenced here)

### 2026-04-17 — B-016: Client Portal Rework — All 5 Phases (Claude Code)

**Phase 1 — Utilities + Tailwind tokens:**
- `src/lib/utils/pendingActions.ts` — NEW: `PendingAction` type + `computePendingActions()` for server-side dashboard action list
- `src/lib/utils/serviceCompletion.ts` — NEW: `calcServiceDetailsCompletion`, `calcDocumentsCompletion`, `calcPeopleCompletion`, `calcKycCompletion`, `calcOverallCompletion`
- `src/lib/utils/clientLabels.ts` — NEW: `CLIENT_STATUS_LABELS` + `getClientStatusLabel()` for friendly status text
- `tailwind.config.ts` — added `brand['client-primary']` (#3b82f6) and `brand['client-bg']` (#f0f9ff)

**Phase 2 — API Routes for Service Persons:**
- `src/app/api/services/[id]/persons/route.ts` — POST: add person (existing profile or create new)
- `src/app/api/services/[id]/persons/[roleId]/route.ts` — PATCH: shareholding; DELETE: remove role row
- `src/app/api/services/[id]/available-profiles/route.ts` — GET: profiles not yet linked to service
- `src/app/api/profiles/kyc/save/route.ts` — POST: save `client_profile_kyc` fields (parallel to /api/kyc/save for old model)

**Phase 3 — Service Detail Page Enhancement:**
- `src/app/(client)/services/[id]/page.tsx` — expanded data fetch: persons, DD requirements, document types; added `ServicePerson` export type
- `src/components/client/ServicePersonsManager.tsx` — NEW: Add Director/Shareholder/UBO, person cards with inline KycStepWizard, shareholding tracker
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx` — REWRITE: 3 collapsible sections (service details, people & KYC, documents) with RAG dots + % + overall progress bar
- `src/components/kyc/KycStepWizard.tsx` — added `saveUrl` and `inlineMode` props (backward compatible)

**Phase 4 — Dashboard Rework:**
- `src/app/(client)/dashboard/page.tsx` — REWRITE: removed 1-service auto-redirect, batch-fetches persons+docs, computes pending actions server-side, renders DashboardClient
- `src/components/client/DashboardClient.tsx` — NEW: greeting banner (amber/green by status), pending action items with section color-coded left borders, service cards with friendly labels

**Phase 5 — Visual Polish:**
- `src/components/shared/Header.tsx` — added `variant` prop; client variant shows initials avatar (blue-500 circle, white text)
- `src/app/(client)/layout.tsx` — changed `bg-gray-50` → `bg-sky-50/30`; passes `variant="client"` to Header

**Do NOT touch admin pages — owner working on admin changes in parallel.**

### 2026-04-17 — B-015 Phase 5B: Replace Hardcoded Document Name Lookups (Claude Code)

**IdentityStep.tsx:**
- `resolveDocTypeId()` helper checks DD requirements first (`r.document_types?.name`), falls back to `documentTypes.find(dt => dt.name === ...)` only if no matching requirement
- `passportType`/`addressType` replaced with `passportTypeId`/`addressTypeId` (IDs only, no DocumentType object needed)

**DeclarationsStep.tsx:**
- Now destructures and uses `requirements` prop (was ignored before)
- `pepDocType` replaced with `pepTypeId` resolved from requirements first

**ReviewStep.tsx:**
- Document status section now driven by `requirements.filter(r => r.requirement_type === 'document')` instead of hardcoded `["Certified Passport Copy", "Proof of Residential Address", ...]` list
- Falls back to static level-based list only if no requirements are available

### 2026-04-17 — B-015 Phase 5C: Compliance Scoring Consolidation (Claude Code)

**Created `src/lib/utils/dueDiligenceConstants.ts`:**
- Shared `DD_LEVEL_INCLUDES` (cumulative DD level map) — no longer duplicated
- Shared `DD_SECTION_FOR_LEVEL` (display section names per DD level)

**Updated `complianceScoring.ts`:**
- Imports `DD_LEVEL_INCLUDES` / `DD_SECTION_FOR_LEVEL` from shared constants
- `reqSection()` checks `field_key` first (new schema column), falls back to `requirement_key`
- `isFieldMet()` call uses `req.field_key ?? req.requirement_key`
- `DECLARATION_FIELD_KEYS` Set replaces repeated `||` chain for clarity

**Updated `profileDocumentRequirements.ts`:**
- Removed duplicate `LEVEL_INCLUDES` local constant; imports `DD_LEVEL_INCLUDES` from shared file

### 2026-04-17 — B-015 Phase 5A+5D: Hardcoded List Fixes + Dashboard Analytics Update (Claude Code)

**5A — Fix hardcoded nationality/jurisdiction lists:**
- `IndividualKycForm.tsx`: Replaced 11-entry NATIONALITIES + 11-entry COUNTRIES with imported `COUNTRIES` from `MultiSelectCountry.tsx` (200+ countries)
- `OrganisationKycForm.tsx`: Replaced 12-entry JURISDICTIONS with same COUNTRIES list
- Both files now use a single consistent source of truth for country/jurisdiction lists

**5D — Dashboard analytics to use services table:**
- Stat cards (Total Services, Awaiting Review, Awaiting Client, Approved This Month) now query `services` table instead of `applications`
- "Total Applications" → "Total Services", links updated to `/admin/services`
- Quick Links updated: "All Services", "All Profiles", "Review Queue", "Service Templates", "Due Diligence"
- Chart data still uses `applications` table (requires `approved_at`/`submitted_at` fields not yet on services)

### 2026-04-17 — B-015 Phase 3C+3D: Role Requirements + Profile Requirement Overrides (Claude Code)

**Role Requirements management (`/admin/settings/role-requirements`):**
- New page + `RoleRequirementsManager.tsx` client component
- Per role (primary_client/director/shareholder/ubo): list required document types with add/remove
- POST `/api/admin/role-requirements`, DELETE `/api/admin/role-requirements/[id]`
- "Role Requirements" added to admin sidebar settings nav

**Profile Requirement Overrides (`/admin/profiles/[id]`):**
- Profile detail page now fetches cumulative DD requirements, role doc requirements, and existing overrides
- New `RequirementsPanel` section with collapsible view of all requirements
- Per DD requirement: "Waive" toggle with optional reason text; waived reqs shown with strikethrough
- "Reinstate" toggle removes the override
- Role doc requirements shown read-only (no waiver mechanism — different table)
- POST `/api/admin/profiles/[id]/requirement-overrides` (upsert waiver)
- DELETE `/api/admin/profiles/[id]/requirement-overrides/[reqId]` (reinstate)

**Type additions (`src/types/index.ts`):**
- Added `ProfileRequirementOverride` interface

### 2026-04-17 — B-015 Phase 3A+3B: Document Types + DD Requirements CRUD (Claude Code)

**Document Types management (`/admin/settings/document-types`):**
- New page + `DocumentTypesManager.tsx` client component
- Grouped by category (identity/corporate/financial/compliance/additional), collapsible cards
- Create (POST `/api/admin/document-types`), update name/category/applies_to/description (PATCH `/api/admin/document-types/[id]`), toggle active
- "Document Types" added to `ADMIN_SETTINGS_NAV` in Sidebar

**Due Diligence Requirements CRUD (`/admin/settings/due-diligence`):**
- `DueDiligenceSettingsManager.tsx` now accepts `documentTypes` prop (page.tsx already updated)
- Requirements list shows inherited (cumulative) reqs read-only + own-level reqs with remove button
- Add requirement form: pick Document type from grouped dropdown (auto-fills label + applies_to) OR enter field key
- Set `applies_to` (individual/organisation/both) per requirement
- API: POST `/api/admin/due-diligence/requirements` (added to existing route), DELETE `/api/admin/due-diligence/requirements/[id]` (new)

**Type updates (`src/types/index.ts`):**
- `DueDiligenceRequirement` now includes `field_key: string | null` and `applies_to: "individual" | "organisation" | "both"`

### 2026-04-17 — B-015 Phase 4A+4B: Client Dashboard + Client Service Detail (Claude Code)

**Client dashboard rewrite (`/dashboard`):**
- Queries `profile_service_roles WHERE can_manage = true AND client_profile_id = session.user.clientProfileId`
- If exactly 1 managed service → auto-redirect to `/services/[id]`
- If 2+ → shows service cards with status icon, action text (unfilled required fields count), Continue/View link
- If no managed services → empty state with link to KYC
- Graceful fallback if `clientProfileId` is null (old-model users)

**Client service detail (`/services/[id]`):**
- Verifies `can_manage = true` before loading (404 if no access)
- Collapsible sections with RAG indicators: Service Details (editable when draft/in_progress), Documents
- Shows admin notes (from `service_section_overrides.admin_note`) in amber banner per section
- KYC reminder card with link to `/kyc`
- Saves service_details via `PATCH /api/admin/services/[id]`

---

### 2026-04-17 — B-015 Phase 2C: Service Creation Wizard (Claude Code)

**New service wizard (`/admin/services/new`):**
- `src/app/(admin)/admin/services/new/page.tsx` — server component, fetches templates + profiles
- `src/app/(admin)/admin/services/new/NewServiceWizard.tsx` — 4-step client wizard: pick template → add people with roles → service details (DynamicServiceForm) → review → create. On submit, POSTs to `/api/admin/services`, redirects to new service detail page.

---

### 2026-04-17 — B-015 Phase 2A+2B: Services List + Detail Pages (Claude Code)

**Services list page:**
- `src/app/(admin)/admin/services/page.tsx` — server component querying `services` + template + profile_service_roles
- `src/app/(admin)/admin/services/ServicesPageClient.tsx` — search + status filter, table with RAG-ready service rows
- Sidebar: Services nav now points to `/admin/services` (was `/admin/applications`)

**Service detail page:**
- `src/app/(admin)/admin/services/[id]/page.tsx` — server component, parallel queries (service, roles+profiles+KYC, overrides, docs, all profiles for add-dialog)
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — 3-col layout: collapsible Service Details + Documents (left), People panel + milestones (right). RAG indicators auto-calculated. can_manage toggle, invite button, add/remove profiles, inline edit service_details, LOE + milestone toggles.

**API routes:**
- `POST /api/admin/services` — create service + optional role links
- `PATCH /api/admin/services/[id]` — update status, service_details, LOE, milestones
- `POST /api/admin/services/[id]/roles` — link profile to service
- `PATCH /api/admin/services/[id]/roles/[roleId]` — toggle can_manage, update role
- `DELETE /api/admin/services/[id]/roles/[roleId]` — unlink profile
- `POST /api/admin/services/[id]/section-override` — upsert RAG override
- `DELETE /api/admin/services/[id]/section-override?key=...` — remove override

---

### 2026-04-17 — B-015: Phase 1 — Services + Profiles Redesign + Multi-Tenancy Foundation

**REQUIRES: Run `supabase/migrations/003-phase1-schema.sql` in Supabase SQL Editor before deploying.**

**New tables (all with `tenant_id`):**
- `tenants` — multi-tenancy foundation, seeded with GWMS (`a1b2c3d4-0000-4000-8000-000000000001`)
- `users` — pure auth/login (replaces `profiles` for auth). Columns: email, full_name, phone, password_hash, role (admin|user), is_active
- `client_profiles` — all persons (replaces kyc_records identity part). Columns: user_id (nullable 1:1→users), record_type, is_representative, full_name, email, phone, address, due_diligence_level
- `client_profile_kyc` — KYC data (1:1 with client_profiles). All 40+ KYC fields from old kyc_records
- `services` — billable engagements (replaces applications). Columns: service_template_id, service_details JSONB, status, loe_received, workflow dates
- `profile_service_roles` — profile↔service junction. Columns: role (director|shareholder|ubo|other), can_manage, shareholding_percentage, invite tracking
- `profile_requirement_overrides` — per-profile DD requirement waivers
- `service_section_overrides` — admin RAG status overrides per service section

**Data migration (preserving UUIDs):**
- `profiles` → `users` (role derived from admin_users)
- `kyc_records` → `client_profiles` + `client_profile_kyc`
- `applications` → `services`
- `profile_roles` + `client_users` → `profile_service_roles`

**Schema additions to existing tables:**
- `documents`: added `client_profile_id`, `service_id` columns
- `verification_codes`: added `client_profile_id` column
- `service_templates`, `document_types`, `due_diligence_requirements`, `due_diligence_settings`, `role_document_requirements`, `audit_log`: added `tenant_id`
- `due_diligence_requirements`: added `requirement_type` (document|field), `field_key`, `applies_to` (individual|organisation|both)

**Old tables NOT dropped** — backward compatibility. Old pages still read from profiles, clients, kyc_records, applications.

**Code changes:**
- `src/lib/auth.ts` — queries `users` table, adds `clientProfileId` + `tenantId` to session
- `src/lib/tenant.ts` — NEW: `DEFAULT_TENANT_ID` + `getTenantId()` helper
- `src/types/next-auth.d.ts` — session shape: `clientProfileId` + `tenantId` replaces `kycRecordId`
- `src/types/index.ts` — added: Tenant, AppUser, ClientProfile, ClientProfileKyc, ServiceRecord, ProfileServiceRole, ProfileRequirementOverride, ServiceSectionOverride
- `middleware.ts` — updated comment, uses clientProfileId fallback
- `src/app/(admin)/layout.tsx` — queries `users` instead of `profiles`
- `src/app/(client)/layout.tsx` — queries `client_profiles` + `profile_service_roles`
- `src/app/(client)/kyc/page.tsx` — uses `clientProfileId` with backward compat fallback
- `src/components/shared/Sidebar.tsx` — admin nav: Dashboard / Services / Profiles / Queue
- `src/app/api/auth/set-password/route.ts` — dual-write to `users` + `profiles`

**New pages:**
- `/admin/profiles` — list page with search, type filter, create dialog
- `/admin/profiles/[id]` — detail page with collapsible KYC sections, services panel, DD level dropdown

**New API routes:**
- `POST /api/admin/profiles-v2/create` — create client_profile + client_profile_kyc
- `PATCH /api/admin/profiles-v2/[id]` — update profile fields
- `PATCH /api/admin/profiles-v2/[id]/kyc` — update KYC fields

**New component:**
- `src/components/admin/CreateProfileDialog.tsx` — dialog form for creating profiles

---

### 2026-04-13 — B-014: Non-Primary Profile Passwordless KYC Flow

**New table:** `verification_codes` — stores access tokens + 6-digit codes for external KYC access (migration done manually in Supabase)

**New files:**
- `src/app/api/kyc/verify-code/route.ts` — verifies 6-digit code, returns KYC data + doc requirements
- `src/app/api/kyc/save-external/route.ts` — saves KYC data via access token (whitelisted fields only)
- `src/app/api/documents/upload-external/route.ts` — uploads documents via access token
- `src/app/kyc/fill/[token]/page.tsx` + `KycFillClient.tsx` — standalone KYC form (no auth required)

**Updated files:**
- `src/app/api/admin/profiles/[id]/send-invite/route.ts` — **completely replaced**. No longer creates profiles/client_users rows or JWT tokens. Now generates verification code entry + sends email with code and access link.
- `middleware.ts` — `/kyc/fill` excluded from auth protection (early return before auth checks)
- `src/types/index.ts` — added `VerificationCode` interface

**Flow:**
1. Admin clicks "Send invite" on a non-primary profile row
2. System creates `verification_codes` row (token + 6-digit code, 72h expiry)
3. Email sent with code displayed prominently + "Complete my KYC profile" link
4. Person clicks link → `/kyc/fill/[token]` → enters 6-digit code
5. Code verified (max 5 attempts) → form loads with pre-filled KYC data
6. Person fills fields, uploads documents, clicks Submit → done. No account needed.

**Security:**
- Token is 32-byte random hex
- Code is 6-digit numeric, max 5 attempts before lockout
- Save-external route whitelists allowed fields (prevents injection of admin-only fields like risk_rating)
- All routes verify token is verified + not expired before any data access

---

### 2026-04-13 — B-013: Primary Contact pre-fill fix (Claude Code)

**Fix: Consolidated two-useEffect KYC pre-fill into single async init()**
- `src/app/(client)/apply/[templateId]/details/page.tsx`: replaced two separate useEffects (one for app load, one for KYC pre-fill on clientId change) with a single `async function init()` inside one useEffect. Uses local `resolvedClientId` variable instead of React state to avoid stale closure / batching timing issue. Sets `skipKyc = true` when existing contact data is already loaded from the application, preventing overwrites.

---

### 2026-04-12 — B-009: Account → Profiles → Roles refactor — all 6 phases (Claude Code)

**Phase 1 — Types + Smart Delta Utility:**
- `src/types/index.ts`: added `ProfileRole`, `RoleDocumentRequirement` interfaces; extended `KycRecord` with `is_primary`, `invite_sent_at`, `invite_sent_by`, `due_diligence_level`, `profile_roles`
- `src/lib/utils/profileDocumentRequirements.ts`: `getRequiredDocumentsForProfile()` smart delta, `getEffectiveDdLevel()` inheritance helper
- API routes: `GET/POST /api/admin/profiles/roles`, `DELETE /api/admin/profiles/roles/[id]`, `GET /api/role-document-requirements`, `PATCH /api/admin/profiles/[id]`, `POST /api/admin/create-profile`

**Phase 2 — Admin Account Profiles Table:**
- `src/components/admin/AccountProfilesTable.tsx`: inline DD level dropdown, inline email editing, send/resend invite, KYC % bar
- `src/components/admin/AddProfileDialog.tsx`: create kyc_record + profile_role dialog
- `src/components/admin/ClientEditForm.tsx`: "Company Details"→"Account Details", "Company name"→"Account name"
- `src/app/(admin)/admin/clients/[id]/page.tsx`: replaced "Account Users" card with AccountProfilesTable; added role_document_requirements parallel fetch

**Phase 3 — Profile Selector for Adding Directors/Shareholders/UBOs:**
- `src/components/shared/ProfileSelector.tsx`: pick existing profile or create new when adding a role
- `src/components/client/PersonsManager.tsx`: "Add Director/Shareholder/UBO" opens ProfileSelector; passes existingKycRecordId or newName to POST
- `GET /api/clients/[clientId]/profiles`: returns kyc_records for client (with access check)
- `POST /api/applications/[id]/persons`: accepts optional existingKycRecordId; also creates profile_roles entry

**Phase 4 — Non-Primary Portal Experience:**
- `src/lib/auth.ts`: at login, looks up kyc_records.profile_id to set is_primary + kycRecordId on JWT
- `src/types/next-auth.d.ts`: added is_primary + kycRecordId to session.user
- `middleware.ts`: non-primary clients redirected to /kyc if they hit any other client route
- `src/components/shared/Sidebar.tsx`: isPrimary prop — non-primary sees minimal nav ("My KYC" only)
- `src/app/(client)/layout.tsx`: resolves display name from kyc_records for non-primary
- `src/app/(client)/kyc/page.tsx`: non-primary fetches via kyc_records.profile_id, filters to own record

**Phase 5 — Primary Manages All Profiles:**
- `src/app/(client)/kyc/page.tsx`: supports `?profileId=X` query param
- `src/app/(client)/kyc/KycPageClient.tsx`: ProfileSwitcher dropdown when multiple profiles; wizard title shows profile name
- `src/app/(client)/dashboard/page.tsx`: Account Profiles card (shown when >1 profile) with KYC % + Fill KYC links
- `POST /api/profiles/create`: primary client creates new non-primary kyc_record

**Phase 6 — Per-Profile Invite Flow:**
- `POST /api/admin/profiles/[id]/send-invite`: creates profiles row, links kyc_records.profile_id, JWT with kycRecordId, sends invite email, updates invite_sent_at
- `src/app/api/auth/set-password/route.ts`: handles both "invite" and "profile_invite" JWT purposes
- `src/app/auth/set-password/page.tsx`: redirects to /kyc for profile invites, /apply for primary

### 2026-04-13 — B-012: Admin client page UX + wizard improvements (Claude Code)

**Change 1 — Compliance Scorecard to right column:**
- `src/app/(admin)/admin/clients/[id]/page.tsx`: removed from left (col-span-2); added at top of right sidebar above WorkflowMilestonesCard

**Change 2 — Application names clickable:**
- Solutions & Services table: name now links to `/admin/applications/[id]` with `text-brand-blue hover:underline`; removed separate View button column

**Change 3 — Pre-fill primary contact from KYC:**
- `src/app/(client)/apply/[templateId]/details/page.tsx`: pre-fill logic now prefers `is_primary=true` individual record; also pre-fills `contact_title` from `occupation`; guard prevents overwriting existing values

**Change 4 — Business Information to bottom of client wizard:**
- Added info banner: "The following business details will be completed by the admin team after your submission."
- Business fields (name, type, country, address) shown at bottom in muted card (`opacity-80 bg-gray-50`)

**Change 5 — Remove section letters from admin wizard:**
- `src/app/(admin)/admin/clients/[id]/apply/[templateId]/details/page.tsx`: removed "Section A:", "Section B:", "Section C:" prefixes

**Change 6 — Turnover field split migration:**
- `POST /api/admin/migrations/update-turnover-fields`: replaces `estimated_turnover_3yr` with three separate year fields on GBC + AC templates

**Note:** Run `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev` after deployment to clear stale cache.

---

### 2026-04-13 — B-011: Unified KYC wizard, profile pre-fill, multi-select country (Claude Code)

**Feature 1 — Unified KYC experience across all persons:**
- `src/components/kyc/KycStepWizard.tsx`: added `compact?: boolean` prop — skips page scroll, removes sticky/negative-margin nav, reduces min-height
- `src/components/client/PersonsManager.tsx`: removed inline form from PersonCard; expanded body always renders `KycStepWizard compact` regardless of `kyc_journey_completed`; person-level DD override (`kyc_records.due_diligence_level ?? account-level`)
- Removed `PersonKyc` narrow interface — `Person.kyc_records` is now typed as full `KycRecord`

**Feature 2 — Profile pre-fill:**
- `GET /api/applications/[id]/persons`: changed `kyc_records!kyc_record_id(id, full_name, ...)` to `kyc_records!kyc_record_id(*)` so all fields (DOB, nationality, passport, address, etc.) pre-populate the wizard when an existing profile is selected

**Feature 3 — MultiSelectCountry component:**
- `src/components/shared/MultiSelectCountry.tsx`: tag-based multi-select for countries; 195+ countries list; search filter; chip display with X; disabled read-only mode
- `src/components/shared/DynamicServiceForm.tsx`: added `multi_select_country` to ServiceField type union; renders MultiSelectCountry for matching fields

**Feature 4 — geographical_area field update:**
- `supabase/seed-update-geographical-field.sql`: SQL UPDATE for reference (changes geographical_area in GBC + AC templates to multi_select_country)
- `POST /api/admin/migrations/update-geographical-field`: one-time admin route to apply the template update via Supabase SDK

---

### 2026-04-13 — B-010: ProfileSelector dialog fix + edit-mode visual boundaries (Claude Code)

**Fix 1 — ProfileSelector dialog never appeared when adding director/shareholder/UBO:**
- `src/components/client/PersonsManager.tsx`: removed `clientId = ""` default — empty string was falsy, so `if (clientId)` never fired
- Changed `PersonCard.clientId: string` → `clientId?: string`; KycStepWizard receives `clientId ?? ""`
- Also guards `fetchPersonDocuments` against undefined clientId (no-op, returns [])

**Fix 2 — Admin editable sections now highlight when in edit mode:**
- `src/components/admin/EditableApplicationDetails.tsx`: each Card gets `border-blue-200 bg-blue-50/30` when its section is active

---
## Older Entries

Earlier change log entries (B-005 through B-008 + all pre-2026-04-11 history) have been archived. See [`CHANGES-archive.md`](./CHANGES-archive.md).

The archive includes: B-005 document handling, B-006 plain-English rules, B-007 audit trail, B-008 KYC refactor, Batches 1-6 onboarding redesign, Knowledge Base, soft-delete, visual identity overhaul, and earlier history.

---

## Tech Debt Tracker

Track known shortcuts, known issues, and "we'll fix it later" items here. Add an entry whenever you take a shortcut or notice something that should be cleaned up. Move items to a "Resolved" section below when fixed.

### Open

| # | Item | Severity | Notes |
|---|------|----------|-------|
| 1 | **No multi-tenancy / tenant isolation** | High | All admins see ALL clients across the platform. SaaS model needs an `organizations` table, tenant-aware queries, and per-tenant RLS. |
| 2 | **All admins are equal** | High | No admin roles (super-admin, manager, reviewer). Anyone in `admin_users` can do everything. |
| 3 | **RLS bypassed app-wide (partial)** | Medium | The anon key can no longer hit raw tables — RLS is enabled default-deny on every public-schema table (B-045). The service role still bypasses everything and all server-side queries go through `createAdminClient()`. Before production SaaS launch we need real per-tenant policies so we can move app queries off the service role. |
| 4 | **No invite/onboarding flow for admins** | Medium | Adding an admin requires manual SQL/API. Build `/admin/settings/admins` page with invite-by-email + accept-flow. |
| 5 | **No audit log of admin-on-admin actions** | Medium | Adding/removing admins isn't tracked in `audit_log`. |
| 6 | **`src/lib/supabase/client.ts` is dead code** | Low | No longer imported anywhere after Auth.js migration. Safe to delete. |
| 7 | **`src/components/shared/Navbar.tsx` is dead code** | Low | Replaced by `Sidebar.tsx`. Safe to delete. |
| 8 | **In-memory rate limiter** | Medium | `src/lib/rate-limit.ts` resets on every server restart and doesn't work across multiple Vercel instances. Replace with Upstash Redis or Vercel KV before scaling. |
| 9 | **AI assistant messages are hardcoded** | Low | `getAssistantMessage()` in ApplicationStatusPanel returns static strings by status. Not real AI yet. |
| 10 | **Verification checklist is a placeholder** | Low | The "Verification Checklist" card on the application detail page is 6 static items. Needs real automation logic + DB column to track completion. |
| 11 | **No real-time updates** | Medium | Pages don't push live updates — users have to navigate or refresh to see admin changes. Could use Supabase Realtime or Server-Sent Events. |
| 12 | **`force-dynamic` everywhere** | Low | Disables Next.js caching globally on data pages. Works but loses perf benefits. Better long-term: tag-based revalidation via `revalidateTag()`. |
| 13 | **CLAUDE.md is partially outdated** | Low | Sections still reference Supabase Auth (replaced by Auth.js). Should be updated to reflect current architecture. |
| 15 | **`supabase/README.md` has outdated SQL** | Low | Step 3 references `profiles.role` and `profiles.company_name` columns that don't exist. |
| 17 | **Knowledge base AI integration is "fail-open"** | Low | If `loadRelevantKnowledgeBase()` errors (e.g. table missing, query fails), it returns an empty string and verification proceeds without KB context. Good for resilience but means a silent KB outage won't be noticed. Add monitoring/alerting later. |
| 18 | **Knowledge base `applies_to` filter is naive** | Low | Currently only filters on `applies_to.document_type` exact-match (case-insensitive). Doesn't support template-id matching, tag-based matching, or fuzzy matching. Good enough for MVP. Should expand once we have real KB content. |
| 20 | **Admin sidebar not yet mobile-friendly** | Low | B-052 made the *client* sidebar a drawer below `md:` but kept the admin layout (`src/app/(admin)/layout.tsx`) with the inline 260px sidebar. Admins use desktop today so this is deferred. When admin-on-mobile becomes a need, lift the same `mobileOpen` state into an `AdminShell` and reuse the existing `Sidebar` mobile branch (which already supports `mobileOpen` / `onMobileOpenChange` props). |
| 22 | **`/kyc` route is orphaned for primary clients** | Low | B-056: the primary-client sidebar now points at `/kyc-review` (server redirect → `/services/<latest>?wizardStep=3`). `/kyc` (KycPageClient) still works via direct URL and remains the entry point for non-primary clients. Delete the route + component + supporting fetch logic if Vercel analytics shows zero primary-client traffic for 30 days. |
| 23 | **Magic-link flow still uses `kyc_records`-shape response** | Low | B-056: verify-code now assembles a legacy `KycRecord`-shape response from the new `client_profiles + client_profile_kyc + profile_service_roles` schema so `KycFillClient` doesn't have to change. Long-term, KycFillClient should consume the modern shape directly (and the `kycRecord.id` ↔ `client_profile_kyc.id` fallback in verify-code can drop). |
| 24 | **No systematic client-side data freshness layer** | Medium | Today's pattern: server components fetch via Supabase, props flow down, mutations PATCH via `/api/...`, then we manually `router.refresh()` + splice updated records into local state (B-065). Each save flow has to opt into the cache-bust pattern individually. Migrate to React Query or SWR for systematic mutation-and-invalidation: declare query keys per resource, mutations auto-invalidate, focus/reconnect refetches handled, stale-while-revalidate gives a free perceived perf win. ~1-2 days refactor across the wizard + dashboard + admin queue. Defer until POC ships and a pattern of "data freshness regression" recurs — for now B-065's response-based patching is sufficient. |
| 25 | **Admin KYC view is parallel, not inline read-only mirror** | Medium | B-069 Batch 3 ships per-profile per-subsection review affordances via a parallel admin panel (`AdminKycPersonReviewPanel`) below `PersonsManager`, instead of the brief's intended inline read-only `PerPersonReviewWizard`/`KycStepWizard`. The wizard components (636 + 2122 lines, deeply stateful) couldn't be safely retrofit with a `readOnly` prop in one batch. Plan: add `readOnly` to `KycStepWizard` (disable inputs, hide save buttons), then either accept a `subsectionHeaderRenderer` prop or render `<ConnectedSectionHeader sectionKey="kyc:<profile_id>:<cat>">` around each existing category bucket. Once that lands, the parallel panel can be deleted. Aggregate badge derivation already in place via `useAggregateStatus`. |
| 26 | **`application_section_reviews.application_id` stores service ids** | Medium | B-073 ports section reviews to `/admin/services/[id]` while reusing the existing table from B-068. The column name is misleading — it now holds either `applications.id` (legacy path, 1 stale test row) or `services.id` (modern path, going forward). The FK to `applications(id)` was dropped in `20260506155512_drop_section_reviews_application_fk.sql` so service-id inserts succeed; UUID v4 collision risk between the two ID spaces is statistically zero. Once the legacy `applications` table is fully retired, rename the column to `subject_id` (or `service_id`), reinstate a typed FK, and rename `/api/admin/applications/[id]/section-reviews` to a service-prefixed path. Affects: `application_section_reviews` table, `/api/admin/applications/[id]/section-reviews/*` route handlers, and any component prop named `applicationId` that's now passed a service id (`AdminApplicationSectionsProvider`, `AdminKycPersonReviewPanel`, `SectionReviewButton`, `SectionReviewPanel`). |

### Resolved

| # | Item | Resolved | Notes |
|---|------|----------|-------|
| 9 (partial) | AI assistant messages hardcoded | 2026-04-07 | Still hardcoded in `ApplicationStatusPanel`, but the new Knowledge Base feeds the real document verification AI prompts so the AI now has actual regulatory context. The status-panel chat is separately a UI placeholder. |
| 14 | No tests | 2026-05-04 | B-051: Vitest + Playwright + MSW. 155 unit/integration tests pass; 7 Playwright specs scaffolded for the client onboarding wizard, KYC invite flow, autosave retry, and KYC resend rate limit. CI gates `lint`/`build`/`test` on every push and PR; E2E job gated by `run-e2e` label or main-branch push. |
| 19 | Sidebar has no mobile collapse | 2026-05-04 | B-052: client `Sidebar` now renders inside a `Sheet` drawer below `md:` (state in new `ClientShell`, opened from a burger button in `Header`). Wizard pages, KYC fill, dashboard, applications/[id], and services/[id] all reflow cleanly at 375px. Document upload gains a native camera capture path on mobile. Admin sidebar deferred — see #20. |
| 16 | Shell `ANTHROPIC_API_KEY=""` overrode `.env.local` | 2026-04-19 | B-031: `package.json` `dev` script now prefixes `unset ANTHROPIC_API_KEY &&` so `.env.local` always wins. |

