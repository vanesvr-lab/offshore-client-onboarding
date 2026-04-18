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
| 3 | **RLS bypassed app-wide** | High | Every server-side query uses `createAdminClient()` (service role). Security is enforced at the API/page layer via NextAuth session checks only. Fine for POC, must add RLS or per-tenant filtering before production SaaS launch. |
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
| 14 | **No tests** | Medium | Zero test coverage. Add Vitest + Playwright for critical flows (auth, registration, application submit, document upload, stage changes). |
| 15 | **`supabase/README.md` has outdated SQL** | Low | Step 3 references `profiles.role` and `profiles.company_name` columns that don't exist. |
| 16 | **Shell `ANTHROPIC_API_KEY=""` overrides `.env.local`** | Medium | Vanessa's shell exports an empty `ANTHROPIC_API_KEY` (set by Claude Desktop). Next.js merges shell env on top of `.env.local`, so the AI verification silently fails locally with "Could not resolve authentication method." Workaround: start dev with `unset ANTHROPIC_API_KEY; npm run dev`. Permanent fix options: (a) add `unset` to package.json `dev` script, (b) use a `.env.local.development` with explicit override, or (c) configure Claude Desktop to not export the empty var. **Does not affect Vercel** — only local dev. |
| 17 | **Knowledge base AI integration is "fail-open"** | Low | If `loadRelevantKnowledgeBase()` errors (e.g. table missing, query fails), it returns an empty string and verification proceeds without KB context. Good for resilience but means a silent KB outage won't be noticed. Add monitoring/alerting later. |
| 18 | **Knowledge base `applies_to` filter is naive** | Low | Currently only filters on `applies_to.document_type` exact-match (case-insensitive). Doesn't support template-id matching, tag-based matching, or fuzzy matching. Good enough for MVP. Should expand once we have real KB content. |

### Resolved

| # | Item | Resolved | Notes |
|---|------|----------|-------|
| 9 (partial) | AI assistant messages hardcoded | 2026-04-07 | Still hardcoded in `ApplicationStatusPanel`, but the new Knowledge Base feeds the real document verification AI prompts so the AI now has actual regulatory context. The status-panel chat is separately a UI placeholder. |

