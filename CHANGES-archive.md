# CHANGES Archive

Historical change log entries from `CHANGES.md`, archived to keep the live coordination file lightweight. Entries are in reverse chronological order (most recent archived entries first).

For the latest entries and current project state, see `CHANGES.md`.

---

## Archived 2026-04-16 (at v0.1.0-poc milestone)

Archived from `CHANGES.md` after reaching the first stable working POC version. Tag: `v0.1.0-poc`. Covers B-005, B-006, B-007, B-008 + Batches 1-6 of the onboarding redesign + earlier Claude Desktop planning and fixes.


### 2026-04-11 — B-008: Major KYC refactor — all 6 phases (Claude Code)

**Phase 1 — DB + Types + Scoring:**
- New types: `DueDiligenceLevel`, `DueDiligenceRequirement`, `DueDiligenceSettings`, `SectionScore`, `ComplianceScore`, `RiskFlag`
- Updated `Client` (due_diligence_level), `KycRecord` (risk_flags, senior_management_approval, ongoing_monitoring_plan, kyc_journey_completed)
- `src/lib/utils/complianceScoring.ts`: `calculateComplianceScore()` with section grouping (Identity/Financial/Declarations/Admin Checks)
- `src/lib/utils/riskFlagDetection.ts`: `detectRiskFlags()` + `mergeRiskFlags()`
- API routes: GET `/api/admin/due-diligence/requirements`, GET `/api/admin/due-diligence/settings`, PATCH `/api/admin/clients/[id]/due-diligence`
- DB migration already run; schema.sql updated

**Phase 2 — Client step wizard:**
- `src/components/kyc/steps/IdentityStep.tsx`, `FinancialStep.tsx`, `DeclarationsStep.tsx`, `ReviewStep.tsx` (DD-level-filtered)
- `src/components/kyc/KycStepWizard.tsx`: 4-step progress indicator, save-on-advance, SDD skips declarations
- `src/app/(client)/kyc/page.tsx`: loads DD level + requirements from DB
- `src/app/(client)/kyc/KycPageClient.tsx`: shows wizard when `kyc_journey_completed=false`, accordion after
- Fixed `ValidatedLabel` to accept label as children (label prop now optional)

**Phase 3 — Admin compliance scorecard:**
- `src/components/admin/ComplianceScorecard.tsx`: replaces `KycSummaryCard` on client detail page. DD level dropdown (calls PATCH /due-diligence), per-section progress bars, blockers list, can-approve banner
- `src/app/(admin)/admin/clients/[id]/page.tsx`: loads documents + all requirements, renders `ComplianceScorecard`

**Phase 4 — Risk flag system:**
- `src/components/admin/RiskFlagBanner.tsx`: severity-colored flag cards, dismiss-with-reason flow, audit log
- `src/components/admin/RiskFlagSection.tsx`: thin server-compatible wrapper
- `src/app/api/kyc/[clientId]/dismiss-flag/route.ts`: admin-only, updates risk_flags JSONB + audit_log
- `src/app/api/kyc/save/route.ts`: auto-detects and merges risk flags on every save

**Phase 5 — Persons journey parity:**
- `src/components/client/PersonsManager.tsx`: PersonCard shows `KycStepWizard` when `!kyc_journey_completed`. Fetches per-person documents lazily. Shows compliance % in header. New props: `dueDiligenceLevel`, `requirements`, `documentTypes`

**Phase 6 — Admin DD configuration + auto-approve:**
- `src/app/(admin)/admin/settings/due-diligence/page.tsx`: new settings page
- `src/components/admin/DueDiligenceSettingsManager.tsx`: per-level cards with auto_approve + requires_senior_approval toggles, collapsible requirements list
- `src/app/api/admin/due-diligence/settings/[level]/route.ts`: PATCH for updating settings
- `src/app/api/kyc/submit/route.ts`: auto-approve logic — if `auto_approve=true` and compliance score = 100%, marks KYC approved + audit log
- `src/components/shared/Sidebar.tsx`: added "Due Diligence" settings nav item

---

### 2026-04-11 — B-007: Client audit trail dialog (Claude Code)

- `src/app/api/admin/clients/[id]/audit-trail/route.ts` (NEW): GET endpoint, admin only. Returns all audit_log entries across a client's full account (all app IDs + linked user IDs + entity_id matches). Supports `search`, `limit`, `offset` query params. Enriches entries with application context (business_name, reference_number). Returns `{ entries, total }`.
- `src/components/admin/ClientAuditTrailDialog.tsx` (NEW): large dialog (max-w-4xl, 85vh), debounced search, paginated table with alternating row backgrounds. Each row shows date/time with hover tooltip, avatar initials + role badge, human-readable action label, details summary. Rows are clickable to expand before/after values, notes, application reference.
- `src/components/admin/ClientAuditTrailButton.tsx` (NEW): thin "use client" wrapper managing open state; renders History icon + "Audit Trail" outline button + dialog.
- `src/app/(admin)/admin/clients/[id]/page.tsx`: imports `ClientAuditTrailButton`, added next to company name + ProcessLauncher in page header.

---

### 2026-04-11 — B-006: Plain-English verification rules + per-rule AI results (Claude Code)

**Feature 1 — Admin UI for verification rules:**
- `src/app/(admin)/admin/settings/rules/page.tsx`: completely rewritten. Loads `document_types` from `/api/document-types`, groups by category (Identity/Corporate/Financial/Compliance/Additional) with collapsible sections. Each active document type shows a textarea for plain English rules + Save button. No JSON required.
- `src/app/api/admin/document-types/[id]/rules/route.ts` (NEW): PATCH endpoint, admin only. Updates `document_types.verification_rules_text`. Revalidates `/admin/settings/rules`.

**Feature 2 — AI verification prompt update:**
- `src/lib/ai/verifyDocument.ts`: added `plainTextRules?: string | null` to `VerifyParams`. System prompt updated to instruct AI to apply each numbered rule and produce per-rule pass/fail results. User prompt now uses plain text rules when available, falls back to structured `match_rules`. Response schema includes `rule_results` array.

**Feature 3 — Types update:**
- `src/types/index.ts`: added `RuleResult` interface (`rule_number`, `rule_text`, `passed`, `explanation`, `evidence`). Added `rule_results?: RuleResult[]` to `VerificationResult`.

**Feature 4 — Pass rules to verification:**
- `src/app/api/verify-document/route.ts`: looks up `document_types.verification_rules_text` by name match against the document requirement name. Passes as `plainTextRules` to `verifyDocument`.

**Feature 5 — Per-rule results in admin views:**
- `src/components/admin/ExtractedFieldsPanel.tsx`: new "Rule Results" section showing pass/fail icon + rule number/text + explanation + italic evidence per rule.
- `src/components/admin/DocumentStatusRow.tsx`: AI status line shows "X/Y rules passed" when `rule_results` present.
- `src/components/admin/FlaggedDiscrepanciesCard.tsx`: shows "Failed rules" section with rule text, explanation, evidence.

**Feature 6 — Seed default rules:**
- `supabase/seed-verification-rules.sql` (NEW): UPDATE statements for 10 document types.
- `src/app/api/admin/migrations/seed-verification-rules/route.ts` (NEW): POST endpoint (admin only) to apply the seed. Call once: `POST /api/admin/migrations/seed-verification-rules`.

Seeded rules for: Certified Passport Copy, Proof of Residential Address, Certificate of Incorporation, Bank Reference Letter, Certificate of Good Standing, Curriculum Vitae / Resume, Declaration of Source of Funds, PEP Declaration Form, Register of Directors, Register of Shareholders/Members.

**Feature 7 — Select UUID display check:**
- `ProcessLauncher` and `AddBlankApplication`: both already correctly display template names via `SelectItem` children. No changes needed.

---

### 2026-04-11 — B-005: Document handling in admin view (Claude Code)

**Feature 1 — Extracted fields panel:**
- `src/components/admin/ExtractedFieldsPanel.tsx` (NEW): collapsible panel showing `verification_result.extracted_fields` as key-value table, confidence score, and flags. ChevronDown toggle. Renders nothing if no extracted data.

**Feature 2 — Document preview dialog:**
- `src/components/admin/DocumentPreviewDialog.tsx` (NEW): modal preview (max-w-4xl, 80vh). Fetches signed URL from `GET /api/documents/[id]/download`. PDF → iframe, image → img, other → download link. Header shows file name + verification badge + upload date. Footer has Download + Close.
- `src/app/api/documents/[id]/download/route.ts`: updated to check `documents` table first, then `document_uploads` (previously only checked `document_uploads`).
- `src/components/admin/DocumentLibraryTable.tsx`: Eye button now opens `DocumentPreviewDialog` instead of new tab; `ExtractedFieldsPanel` rendered as an extra table row below each document that has AI extracted data; added `ScanSearch` icon for extracted data indicator.

**Feature 3 — DocumentStatusRow component:**
- `src/components/admin/DocumentStatusRow.tsx` (NEW): full 3-line layout per document:
  - Line 1: file icon + document type name + category badge
  - Line 2: "AI:" + VerificationBadge + confidence % + flags count + [Preview] + [Full Review] buttons
  - Line 3: admin status (approve/reject inline, or result with date)
  - Expandable: ExtractedFieldsPanel
- `src/app/(admin)/admin/applications/[id]/page.tsx`: fetches `document_links` for this application, then fetches linked `documents` with `document_types`. Replaces the simple ul/li document list with `DocumentStatusRow` for each linked document. Legacy `document_uploads` still shown as simple rows.

**Feature 4 — Admin manual verification status:**
- `src/app/api/admin/documents/library/[id]/review/route.ts` (NEW): PATCH endpoint. Admin only. Body: `{ status: "approved"|"rejected", note?: string }`. Updates `admin_status`, `admin_status_note`, `admin_status_by`, `admin_status_at`. Writes `audit_log` entry `action="document_reviewed"`. Revalidates client documents page.
- `src/types/index.ts`: `DocumentRecord` extended with `admin_status`, `admin_status_note`, `admin_status_by`, `admin_status_at`.
- `supabase/schema.sql`: `documents` table updated with 4 new columns (`admin_status`, `admin_status_note`, `admin_status_by`, `admin_status_at`). **DB migration already run** — schema.sql updated for documentation only.

---

### 2026-04-10 — Feature sets A, B, C: dashboard fixes, validation UI, soft-delete (Claude Code)

**Feature Set A — Client dashboard + wizard fixes:**
- A1: WizardLayout step 1 label: "Business Details" → "Solution Details"
- A2: Pre-fill fix: `form.contact_name?.trim()` check (empty string was blocking pre-fill); `/api/me` now returns `{ userId, clientId, role }`
- A3: KYC tasks grouped under `KycTaskGroup` client component — collapses multiple profiles into one expandable row; single profile renders flat; uses `application_persons` lookup to show person roles
- A4: Solutions & Services card now shows contextual message per-app: "Fill in solution details" / "Complete and submit" / "Action Required" (amber) / "Track" / "View"

**Feature Set B — Validation UI + tooltips:**
- `src/hooks/useFieldValidation.ts`: `markTouched`, `markAllTouched`, `getFieldState` returning "normal"|"error"|"filled"
- `src/components/shared/ValidatedLabel.tsx`: label with asterisk color + green CheckCircle when filled; `FieldWrapper` adds "This field is required" helper text on error
- `src/components/shared/FieldTooltip.tsx`: HelpCircle icon → click opens w-64 popup with close button, outside-click dismissal
- `DynamicServiceForm`: added `tooltip?: string` to `ServiceField` interface; renders `FieldTooltip` next to labels when present

**Feature Set C — Soft-delete clients:**
- C1: `POST /api/admin/clients/[id]/delete` — requires `{ confirmationText: "DELETE" }`, sets `is_deleted/deleted_at/deleted_by` on client, `is_deleted` on linked profiles, writes audit_log `client_deleted` entry
- C2: `.eq("is_deleted", false)` filter on clients query in `/admin/clients`; email uniqueness checks in register + create-client now skip deleted accounts
- C3: `DeleteClientDialog` + `DeleteClientButton` client components; wired to client detail page right column "Danger Zone" section
- C4: `auth.ts` blocks login for `is_deleted` profiles (shows generic "Invalid email or password")
- C5: `Client` + `Profile` types updated; `supabase/schema.sql` updated with soft-delete columns

---

### 2026-04-10 — Form parity, KYC progress bars, review page cleanup (Claude Code)

**PersonsManager** (`src/components/client/PersonsManager.tsx`):
- Persons grouped by role with headers: "Directors (2)", "Shareholders (2)", etc.
- Two progress bars per person: KYC (n/11 required fields) + Docs (n/6 documents)
- 3 new KYC fields added to card form: address, source_of_funds_description, is_pep, legal_issues_declared
- `onUpdate` now propagates KYC field changes optimistically for real-time bar updates

**Persons API** (`src/app/api/applications/[id]/persons/route.ts`):
- Added 4 missing KYC fields to select: address, source_of_funds_description, is_pep, legal_issues_declared
- Added `doc_count` per person (queries `documents` by `kyc_record_id`)

**Admin EditableApplicationDetails** section order corrected to:
  Business Information → Primary Contact → Service Details → Internal Notes

**Client wizard details page**: Removed "Section C/B" prefix from Persons heading.

**Client review page** (`src/app/(client)/apply/[templateId]/review/page.tsx`):
- Removed GBC/AC details section and `ApplicationDetailsGbcAc` type reference
- Removed `/api/applications/[id]/details-gbc-ac` fetch
- Added template fetch for `service_fields`; renders `DynamicServiceForm readOnly`
- Persons section now shows grouped KYC + Docs progress bars (same as wizard)
- Blockers: removed business_name/type/country checks (admin-only fields)

**`/api/applications/[id]/details-gbc-ac`**: Marked `@deprecated` — superseded by `service_details` JSONB.

**Section parity (admin vs client):**
- Client: Primary Contact → Service Details → Directors/Shareholders/UBOs
- Admin: Business Info → Primary Contact → Service Details → Directors/Shareholders/UBOs → [admin-only]

---

## Current DB State

Schema last updated by: **Claude Code (CLI)**

Columns and tables added beyond initial schema.sql:
- `clients.invite_sent_at` (timestamptz) — tracks when welcome email was sent

RLS policies added beyond initial schema.sql:
- `"admins can manage all applications"` — FOR ALL on `applications` using `is_admin()`
- `"admins can manage all document_uploads"` — FOR ALL on `document_uploads` using `is_admin()`

---

## Active Routes

### Admin portal (`/admin/...`)
| Route | File | Last touched by |
|-------|------|----------------|
| `/admin/dashboard` | `src/app/(admin)/admin/dashboard/page.tsx` | Claude Code |
| `/admin/queue` | `src/app/(admin)/admin/queue/page.tsx` | Claude Code |
| `/admin/clients` | `src/app/(admin)/admin/clients/page.tsx` | Claude Code |
| `/admin/clients/[id]` | `src/app/(admin)/admin/clients/[id]/page.tsx` | Claude Code |
| `/admin/clients/[id]/documents` | `src/app/(admin)/admin/clients/[id]/documents/page.tsx` | Claude Code |
| `/admin/clients/[id]/apply` | `src/app/(admin)/admin/clients/[id]/apply/page.tsx` | Claude Code |
| `/admin/clients/[id]/apply/[templateId]/details` | `...details/page.tsx` | Claude Code |
| `/admin/clients/[id]/apply/[templateId]/documents` | `...documents/page.tsx` | Claude Code |
| `/admin/clients/[id]/apply/[templateId]/review` | `...review/page.tsx` | Claude Code |
| `/admin/applications/[id]` | `src/app/(admin)/admin/applications/[id]/page.tsx` | Claude Code |
| `/admin/applications/[id]/documents/[docId]` | `...documents/[docId]/page.tsx` | Claude Code |
| `/admin/settings/templates` | `src/app/(admin)/admin/settings/templates/page.tsx` | Claude Code |
| `/admin/settings/rules` | `src/app/(admin)/admin/settings/rules/page.tsx` | Claude Code |
| `/admin/settings/workflow` | `src/app/(admin)/admin/settings/workflow/page.tsx` | Claude Code |

### Client portal (`/...`)
| Route | File | Last touched by |
|-------|------|----------------|
| `/kyc` | `src/app/(client)/kyc/page.tsx` | Claude Code |
| `/dashboard` | `src/app/(client)/dashboard/page.tsx` | Claude Code |
| `/apply` | `src/app/(client)/apply/page.tsx` | Claude Code |
| `/apply/[templateId]/details` | `...details/page.tsx` | Claude Code |
| `/apply/[templateId]/documents` | `...documents/page.tsx` | Claude Code |
| `/apply/[templateId]/review` | `...review/page.tsx` | Claude Code |
| `/applications/[id]` | `src/app/(client)/applications/[id]/page.tsx` | Claude Code |

### API routes
| Route | File | Last touched by |
|-------|------|----------------|
| `POST /api/admin/create-client` | `src/app/api/admin/create-client/route.ts` | Claude Code |
| `PATCH /api/admin/clients/[id]` | `src/app/api/admin/clients/[id]/route.ts` | Claude Code |
| `POST /api/admin/clients/[id]/send-invite` | `src/app/api/admin/clients/[id]/send-invite/route.ts` | Claude Code |
| `POST /api/admin/applications/upsert` | `src/app/api/admin/applications/upsert/route.ts` | Claude Code |
| `PATCH /api/admin/applications/[id]` | `src/app/api/admin/applications/[id]/route.ts` | Claude Code |
| `POST /api/send-email` | `src/app/api/send-email/route.ts` | Claude Code |
| `POST /api/verify-document` | `src/app/api/verify-document/route.ts` | Claude Code |
| `GET /api/document-types` | `src/app/api/document-types/route.ts` | Claude Code |
| `GET/POST /api/documents/library` | `src/app/api/documents/library/route.ts` | Claude Code |
| `PATCH/DELETE /api/documents/library/[id]` | `src/app/api/documents/library/[id]/route.ts` | Claude Code |
| `POST /api/documents/[id]/link` | `src/app/api/documents/[id]/link/route.ts` | Claude Code |
| `GET /api/documents/links` | `src/app/api/documents/links/route.ts` | Claude Code |
| `DELETE /api/documents/links/[id]` | `src/app/api/documents/links/[id]/route.ts` | Claude Code |

---

## Component Inventory

### Admin components (`src/components/admin/`)
| Component | Purpose | Last touched by |
|-----------|---------|----------------|
| `AccountManagerPanel.tsx` | Assign/history of account managers | Claude Code |
| `ApplicationTable.tsx` | Filterable/sortable application list | Claude Code |
| `AuditTrail.tsx` | Audit log display with actor badges | Claude Code |
| `DashboardAnalytics.tsx` | 4-card KPI grid with recharts | Claude Code |
| `EditableApplicationDetails.tsx` | Per-section editable application fields | Claude Code |
| `ClientEditForm.tsx` | Inline company name editing | Claude Code |
| `CreateClientModal.tsx` | Admin-initiated client creation | Claude Code |
| `DocumentViewer.tsx` | AI document review UI | Claude Code |
| `EmailComposer.tsx` | Compose and send emails to clients | Claude Code |
| `SendInvitePanel.tsx` | Send/resend welcome email with status | Claude Code |
| `StageSelector.tsx` | Application stage management | Claude Code |
| `DocumentLibraryTable.tsx` | Filterable document library for admin client view | Claude Code |

### Shared components (`src/components/shared/`)
| Component | Purpose | Last touched by |
|-----------|---------|----------------|
| `Navbar.tsx` | Top nav for both portals | Claude Code |
| `Sidebar.tsx` | Contextual sidebar nav for both portals | Claude Code |
| `StatusBadge.tsx` | Application status badge | Claude Code |
| `LoadingSpinner.tsx` | Loading indicator | Claude Code |
| `DocumentUploadWidget.tsx` | Reusable upload widget (compact + full modes) | Claude Code |

### Client components (`src/components/client/`)
| Component | Purpose | Last touched by |
|-----------|---------|----------------|
| `DocumentUploadStep.tsx` | File upload + AI verification | Claude Code |
| `ServiceCard.tsx` | Template selection card | Claude Code |
| `StatusTimeline.tsx` | Application status timeline | Claude Code |
| `UBOForm.tsx` | Ultimate Beneficial Owner form | Claude Code |
| `VerificationBadge.tsx` | Document verification status | Claude Code |
| `WizardLayout.tsx` | 3-step wizard progress indicator | Claude Code |

---

## Core / Shared Files — Touch with Care

These files affect the entire app. Coordinate before modifying.

| File | What it controls | Last touched by |
|------|-----------------|----------------|
| `src/types/index.ts` | All TypeScript types | Claude Code |
| `middleware.ts` | Auth routing, role detection | Claude Code |
| `src/app/(admin)/layout.tsx` | Admin portal layout + auth guard | Claude Code |
| `src/app/(client)/layout.tsx` | Client portal layout + auth guard | Claude Code |
| `src/lib/supabase/admin.ts` | Service role Supabase client | Claude Code |
| `src/lib/supabase/server.ts` | Server-side Supabase client | Claude Code |
| `src/lib/supabase/client.ts` | Browser Supabase client | Claude Code |
| `supabase/schema.sql` | Full DB schema | Claude Code |
| `CLAUDE.md` | Project guide for both instances | Claude Code |
| `.env.local` | Environment variables | Claude Code |
| `package.json` | Dependencies + scripts | Claude Code |

---

## Change Log

### 2026-04-07 — Claude Code (CLI) — Onboarding Redesign: Batch 6 (FINAL) — Client Dashboard + Wizard Rework

**New API routes:**
- `GET /api/templates/[id]` — fetch a single service template by ID (name/description)
- `GET/POST /api/applications/[id]/persons` — list persons for an application; create new person (creates kyc_record + application_persons row)
- `PATCH/DELETE /api/applications/[id]/persons/[personId]` — update role/shareholding; delete person (and orphaned kyc_record)
- `GET/POST /api/applications/[id]/details-gbc-ac` — fetch/upsert GBC/AC-specific application details

**New components:**
- `src/components/client/OnboardingBanner.tsx` — smart contextual banner adapting to onboarding stage (no_kyc / kyc_incomplete / kyc_complete_no_app / app_draft / app_submitted / app_approved / app_rejected)
- `src/components/client/CompletionChecklist.tsx` — sticky progress checklist card with section-by-section KYC/application completion
- `src/components/client/PersonsManager.tsx` — manage directors/shareholders/UBOs per application; expandable inline KYC fields, auto-save, shareholding running total

**Updated pages:**
- `src/app/(client)/dashboard/page.tsx` — full rework: onboarding progress bar, smart banner, completion checklist sidebar, applications list
- `src/app/(client)/apply/[templateId]/details/page.tsx` — GBC/AC-specific fields section (conditional on template name); PersonsManager replacing UBO form
- `src/app/(client)/apply/[templateId]/documents/page.tsx` — reworked to show document library links + DocumentUploadWidget that creates document_links
- `src/app/(client)/apply/[templateId]/review/page.tsx` — full review rework: business info, GBC/AC details, persons with KYC status, linked documents, blockers list
- `src/app/(client)/applications/[id]/page.tsx` — added persons list with KYC completion, linked document library (from document_links)
- `src/components/shared/Sidebar.tsx` — added wizard contextual nav (Details/Documents/Review) when on /apply/[templateId] pages, using useSearchParams for applicationId

### 2026-04-07 — Claude Code (CLI) — Onboarding Redesign: Batch 5 — Process Launcher

**New API routes:**
- `GET /api/admin/processes/templates` — list active process templates with requirements, filterable by client_type
- `POST /api/admin/processes/start` — create client_process, auto-link existing library documents, create process_documents rows
- `GET /api/admin/processes/[id]` — full process detail with process_documents + documents
- `PATCH /api/admin/processes/[id]` — update status/notes
- `POST /api/admin/processes/[id]/request-documents` — mark process_documents as requested, send email via Resend
- `POST /api/admin/processes/[id]/upload` — admin upload a document and link it to the process

**New components:**
- `src/components/admin/ProcessReadinessDashboard.tsx` — grouped document readiness view with Available/Missing/Requested states, request + upload actions per row, bulk request all missing
- `src/components/admin/ProcessLauncher.tsx` — dialog to pick a process template and start a process; auto-navigates to process detail after creation

**New page:**
- `src/app/(admin)/admin/clients/[id]/processes/[processId]/page.tsx` — process detail page with breadcrumb + ProcessReadinessDashboard

**Updated:**
- `src/app/(admin)/admin/clients/[id]/page.tsx` — added Active Processes card + ProcessLauncher button in header; fetches client_processes
- `src/components/shared/Sidebar.tsx` — added contextual "Process" section when on process detail pages

---

### 2026-04-07 — Claude Code (CLI) — Onboarding Redesign: Batch 4 — Admin Client Creation + Risk Assessment

**Updated API routes:**
- `POST /api/admin/create-client` — reworked: accepts clientType, kycPreFill, orgKycPreFill, workflowDates; creates profile + client + client_users + skeleton kyc_records in one call
- `PATCH /api/admin/clients/[id]` — extended: now accepts all workflow milestone timestamp fields in addition to company_name

**New pages:**
- `src/app/(admin)/admin/clients/new/page.tsx` + `NewClientForm.tsx` — full-page new client creation with 3 sections: Basic Info, KYC pre-fill (individual or org), Workflow Milestones
- `src/app/(admin)/admin/clients/[id]/kyc/page.tsx` — admin KYC review page with IndividualKycForm + OrganisationKycForm + RiskAssessmentPanel side-by-side
- `src/app/(admin)/admin/clients/[id]/risk/page.tsx` — standalone risk assessment page per KYC record

**New components:**
- `src/components/admin/RiskAssessmentPanel.tsx` — full risk assessment: sanctions, adverse media, PEP verification, risk rating with auto flags + blockers summary
- `src/components/admin/WorkflowMilestonesCard.tsx` — 6 click-to-toggle milestone checkboxes with dates, calls PATCH /api/admin/clients/[id]
- `src/components/admin/KycSummaryCard.tsx` — shows per-record completion bar + risk indicators on client detail page
- `src/components/ui/checkbox.tsx` — simple native checkbox UI component

**Updated:**
- `src/app/(admin)/admin/clients/[id]/page.tsx` — added WorkflowMilestonesCard (right column), KycSummaryCard (main column above Applications); fetches kyc_records + new client fields
- `src/components/admin/StageSelector.tsx` — added clientId prop; blocks approval if risk_rating/sanctions/adverse_media/pep_verified are incomplete on any kyc_record
- `src/app/(admin)/admin/applications/[id]/page.tsx` — passes clientId to StageSelector
- `src/components/shared/Sidebar.tsx` — added KYC + Risk links to client contextual section

---

### 2026-04-07 — Claude Code (CLI) — Onboarding Redesign: Batch 3 — KYC Forms

**New API routes:**
- `GET /api/kyc/[clientId]` — list all kyc_records + documents for a client
- `POST /api/kyc/save` — partial-save fields onto a kyc_record (auto-calculates completion_status)
- `POST /api/kyc/submit` — validates and marks KYC complete, sets `clients.kyc_completed_at`

**New utility:**
- `src/lib/utils/completionCalculator.ts` — calculates section-by-section completion for individual + organisation records; returns `canSubmit`, `overallPercentage`, `blockers`

**New hook:**
- `src/hooks/useAutoSave.ts` — debounced auto-save with "Saved" indicator; POSTs to /api/kyc/save on field change

**New components:**
- `src/components/kyc/IndividualKycForm.tsx` — 4-section accordion: Personal Details, Funding & Financial, Declarations, Additional Documents; inline uploads; PEP/legal conditional fields; passport expiry warning
- `src/components/kyc/OrganisationKycForm.tsx` — 3-section accordion: Company Information, Corporate Documents, Financial Documents; inline uploads throughout

**New client page:**
- `src/app/(client)/kyc/page.tsx` + `KycPageClient.tsx` — KYC profile page with progress bar, submit button, both form types rendered based on `client_type`

**Updated:**
- `middleware.ts` — added `/kyc` to protected client routes
- `src/components/shared/Sidebar.tsx` — added "KYC Profile" link (UserCheck icon) between Dashboard and New Application

---

### 2026-04-07 — Claude Code (CLI) — Onboarding Redesign: Batch 2 — Document Library

**New API routes:**
- `GET/POST /api/documents/library` — list + upload documents to client library; AI verification fires async on upload
- `PATCH/DELETE /api/documents/library/[id]` — update notes/expiry or soft-delete a document
- `POST /api/documents/[id]/link` — create a document_link to an application/process/KYC record
- `GET /api/documents/links` — list links for a given entity (linkedToType + linkedToId)
- `DELETE /api/documents/links/[id]` — remove a specific document link
- `GET /api/document-types` — list all active document types, grouped by category

**New components:**
- `src/components/shared/DocumentUploadWidget.tsx` — reusable upload widget with compact (inline) + standalone (full dropzone) modes; react-dropzone; grouped category selector; preview/replace for existing docs
- `src/components/admin/DocumentLibraryTable.tsx` — filterable/groupable document library table for admin client view; search, category filter, status filter; per-row delete + preview; upload dialog

**New admin page:**
- `src/app/(admin)/admin/clients/[id]/documents/page.tsx` — Document Library page for a client

**Updated:**
- `src/components/shared/Sidebar.tsx` — added contextual "Client" nav section (Overview + Documents links) when browsing `/admin/clients/[id]/...` routes

**Active routes updated:**
- Added `/admin/clients/[id]/documents` to admin routes table

---

### 2026-04-10 — Claude Desktop — Onboarding Redesign: planning + DB migration + CLI batch briefs

**Major architectural redesign planned and staged for CLI execution.**

**Planning completed:**
- Analyzed GWMS workflow spreadsheet (TAB 1-3: onboarding steps, individual/org KYC fields, document requirements)
- Researched EDD (Enhanced Due Diligence) standards and compared against spreadsheet — identified 25 gaps
- Generated gap analysis PDF: `GWMS_Gap_Analysis.pdf` (dark mode, 5 pages)
- Designed document-centric model: documents uploaded once, tagged with type, linked to any application/process/KYC
- Designed 5-section KYC flow: Personal Details, Funding & Financial, Due Diligence, Directors/Shareholders, Organisation Details
- Designed admin risk assessment panel (sanctions, adverse media, PEP, risk rating) — admin-only, blocks approval until complete
- Designed process launcher (bank account opening, FSC applications) with auto-linking from existing document library

**DB migration run in Supabase (10 new tables + 7 ALTER columns):**
- `document_types` — master list of 32 document kinds with categories, validity periods, AI rules
- `kyc_records` — unified individual + organisation KYC (40+ fields including risk assessment)
- `application_persons` — replaces ubo_data JSONB, links persons to applications with roles
- `application_details_gbc_ac` — 17 GBC/AC-specific fields
- `documents` — new document library (tagged, per-client, reusable across processes)
- `document_links` — junction connecting documents to applications/processes/KYC
- `process_templates` + `process_requirements` — define what documents each process needs
- `client_processes` + `process_documents` — track active processes per client
- `clients` table altered: added `client_type`, `loe_sent_at`, `invoice_sent_at`, `payment_received_at`, `portal_link_sent_at`, `kyc_completed_at`, `application_submitted_at`

**Seed data inserted:**
- 32 document types (identity: 6, corporate: 9, financial: 7, compliance: 6, additional: 4)
- 2 process templates: Open Bank Account (Corporate) with 16 requirements, Open Bank Account (Individual) with 9 requirements

**CLI batch briefs prepared (6 batches in `docs/batches/`):**
1. `batch-1-schema-types.md` — TypeScript types, schema.sql, seed SQL files
2. `batch-2-document-library.md` — Document library API, upload widget, admin documents page
3. `batch-3-kyc-forms.md` — KYC forms (individual + org), auto-save, inline uploads, completion calculator
4. `batch-4-admin-client-risk.md` — New client creation page, workflow checkboxes, risk assessment panel
5. `batch-5-process-launcher.md` — Process launcher, readiness dashboard, auto-linking
6. `batch-6-client-dashboard.md` — Client dashboard rework, onboarding banner, wizard rework, persons manager
7. `RUN-ALL-BATCHES.md` — Master orchestrator for sequential CLI execution

**Key design decisions documented in plan:**
- Single `kyc_records` table with `record_type` flag (individual vs organisation) — not two separate tables
- Documents are client-level library, tagged by type, linked to whatever needs them — upload once, use everywhere
- Admin risk assessment (sanctions, adverse media, PEP, risk rating) is admin-only, not visible to client
- Risk rating required before application approval (StageSelector blocks it)
- Admin creates clients via full page `/admin/clients/new` (not modal) with KYC pre-fill capability
- 6-step workflow milestones tracked as admin checkboxes with auto-filled dates
- Process launcher auto-links existing documents and shows readiness dashboard

---

### 2026-04-07 — Claude Desktop — Bug fixes + Knowledge Base + AI verification context

**6 fixes + 1 new feature. Build passes clean.**

**Fix 1: KPI "Avg Days to Approval" missed admin-approved applications**
- Root cause: query filtered out apps with `submitted_at IS NULL`. Admin-approved apps don't go through submit flow so `submitted_at` stays null and they were excluded from the metric.
- `src/app/(admin)/admin/dashboard/page.tsx` — removed `.not("submitted_at","is",null)` filter; calculation now falls back to `created_at` when `submitted_at` is missing. Negative deltas filtered as a sanity check.

**Fix 2: Document upload broken (multiple bugs)**
- Bug A — API/client mismatch: `/api/documents/upload` returned `{ upload }` but `DocumentUploadStep.tsx` read `uploadJson.uploadId` and `.filePath`, getting `undefined`. Fix: API now also returns flat `uploadId` + `filePath` keys.
- Bug B — `upsert` with `onConflict: "application_id,requirement_id"` failed because no unique constraint exists on those columns. Fix: refactored to explicit "look up existing → update OR insert" logic. No DB migration needed.
- Bug C — Anthropic SDK threw "Could not resolve authentication method" because `process.env.ANTHROPIC_API_KEY` was empty. Root cause: the **shell** had `ANTHROPIC_API_KEY=""` exported (set by Claude Desktop), and Next.js merges shell env on top of `.env.local`. The empty string from the shell was overriding the real key.
  - Workaround: dev server must be started with `unset ANTHROPIC_API_KEY` before `npm run dev` (added a note to CLAUDE.md tech debt).
  - Code fix: `src/lib/ai/verifyDocument.ts` — Anthropic client now lazily-instantiated with explicit error if key is missing (better error message than the SDK default).

**Fix 3: Admin can now upload documents on behalf of clients**
- `src/components/admin/AdminDocumentUploader.tsx` — NEW client component; "Upload Document" button on admin application detail page → opens dialog with document-type Select + reuses `DocumentUploadStep` for the actual upload + AI verification flow. Admin can replace existing uploads (shows "(replace)" suffix in the dropdown).
- `src/app/(admin)/admin/applications/[id]/page.tsx` — Documents card header now shows the upload button.
- The upload route already supported admin uploads (line 41-57 of `route.ts` skips the client_id ownership check for admins). `uploaded_by` correctly tracks the admin's profile id.

**Fix 4: Wizard required field validations**
- Both client wizard (`src/app/(client)/apply/[templateId]/details/page.tsx`) and admin wizard (`src/app/(admin)/admin/clients/[id]/apply/[templateId]/details/page.tsx`) only validated UBO presence — all other "required" fields relied on the HTML5 `required` attribute which doesn't fire because the buttons aren't inside a `<form>`.
- Added `validateForm()` helper that checks: business name/type/country/address, contact name/email (with format check), 1+ UBOs each with full_name/nationality/date_of_birth/ownership_percentage≥25/passport_number.
- "Save progress" allows partial drafts (only requires business name); "Next" runs full validation.

**Fix 5: ApplicationStatusPanel font/color/size**
- `src/components/shared/ApplicationStatusPanel.tsx` — header title color changed to `text-brand-navy text-base font-semibold` (matches Stage Management card title); collapsed summary line bumped from `text-[10px] text-gray-400` → `text-sm font-medium text-gray-700` (matches "Move to stage" label, much more visible). Document row text bumped from `text-xs/text-[10px]` → `text-sm/text-xs` for readability with many docs.

**Feature: Compliance Knowledge Base + AI integration**
- `supabase/schema.sql` — NEW `knowledge_base` table with categories (rule, document_requirement, regulatory_text, general), title, content, applies_to JSONB, source citation, is_active. Index on category for active entries.
- `src/app/api/admin/knowledge-base/route.ts` — NEW: GET (list with optional category filter), POST (create)
- `src/app/api/admin/knowledge-base/[id]/route.ts` — NEW: PATCH (update), DELETE
- `src/app/(admin)/admin/settings/knowledge-base/page.tsx` — NEW: server component; gracefully handles "table doesn't exist yet" by showing the migration SQL
- `src/components/admin/KnowledgeBaseManager.tsx` — NEW client component: grouped by category, create/edit dialog, delete with confirm
- `src/components/shared/Sidebar.tsx` — added "Knowledge Base" link under Settings (BookOpen icon)
- `src/lib/ai/verifyDocument.ts` — `verifyDocument()` now loads active KB entries (filtered by document_type via `applies_to` field) and includes them in the AI prompt under "Relevant compliance knowledge base". Fails open if the table doesn't exist.

**DB migration required (run in Supabase SQL Editor):**
```sql
CREATE TABLE IF NOT EXISTS knowledge_base (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text not null check (category in ('rule', 'document_requirement', 'regulatory_text', 'general')),
  content text not null,
  applies_to jsonb default '{}'::jsonb,
  source text,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  created_by uuid references profiles(id)
);
CREATE INDEX IF NOT EXISTS knowledge_base_category_idx
  ON knowledge_base(category) WHERE is_active;
```

**⚠️ IMPORTANT — Dev server start command:**
Because the shell exports an empty `ANTHROPIC_API_KEY`, the dev server MUST be started with the env explicitly unset:
```bash
pkill -f "next dev"; sleep 2; rm -rf .next; unset ANTHROPIC_API_KEY; npm run dev
```
Without `unset`, the AI verification will silently fail with "Could not resolve authentication method." This does NOT affect Vercel — only local dev.

---

### 2026-04-07 — Claude Desktop

**Add `uploaded_by` column to `document_uploads`**
- Root cause: Batch 4 (admin edit feature) added `uploaded_by: session.user.id` to `src/app/api/documents/upload/route.ts` line 81, but the column didn't exist in the schema → upload errors with PGRST204 ("Could not find the 'uploaded_by' column of 'document_uploads' in the schema cache")
- `supabase/schema.sql` — added `uploaded_by uuid references profiles(id)` to the `document_uploads` table definition
- Why we kept it (vs removing the line from the API route): tracking who uploaded each document is a real KYC/compliance requirement. The `audit_log` trigger already captures actor at insert time, but having `uploaded_by` directly on the row makes admin queries (e.g. "all docs uploaded by Tony Stark") trivial — and the column is already used by the admin edit feature

**DB migration required (already run):**
```sql
ALTER TABLE document_uploads ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES profiles(id);
```

---

### 2026-04-07 — Claude Code (CLI) — Fix stale data: force-dynamic + revalidatePath + router.refresh()

**Build passes clean. Three-part cache fix.**

**Fix 1: `export const dynamic = "force-dynamic"` added to all data-driven server component pages**
- `src/app/(admin)/admin/dashboard/page.tsx`
- `src/app/(admin)/admin/clients/[id]/page.tsx`
- `src/app/(admin)/admin/applications/[id]/page.tsx`
- `src/app/(admin)/admin/queue/page.tsx`
- `src/app/(admin)/admin/settings/workflow/page.tsx`
- `src/app/(client)/dashboard/page.tsx`
- `src/app/(client)/applications/[id]/page.tsx`
- `src/app/(client)/apply/page.tsx`
- (clients/page.tsx and applications/page.tsx already had it)
- Skipped "use client" pages (settings/templates, settings/rules, wizard steps) — force-dynamic is invalid in client components

**Fix 2: `revalidatePath()` added to all mutation API routes**
- `api/admin/create-client` → `/admin/clients`, `/admin/dashboard`
- `api/admin/clients/[id]` (PATCH) → `/admin/clients`, `/admin/clients/[id]`
- `api/admin/clients/[id]/send-invite` → `/admin/clients/[id]`
- `api/admin/clients/[id]/account-manager` → `/admin/clients/[id]`
- `api/admin/applications/[id]` (PATCH edit) → `/admin/applications/[id]`, `/admin/applications`, `/admin/dashboard`
- `api/admin/applications/[id]/stage` → `/admin/applications/[id]`, `/admin/applications`, `/admin/queue`, `/admin/dashboard`
- `api/admin/applications/upsert` → `/admin/applications`, `/admin/dashboard`
- `api/admin/documents/[id]/override` → `/admin/applications/[id]`
- `api/admin/settings/templates` (POST) → `/admin/settings/templates`
- `api/admin/settings/templates/[id]` (PATCH) → `/admin/settings/templates`
- `api/admin/settings/templates/[id]/requirements` (POST) → `/admin/settings/templates`, `/admin/settings/rules`
- `api/admin/settings/requirements/[id]` (DELETE + PATCH) → `/admin/settings/templates`, `/admin/settings/rules`
- `api/applications/save` → `/dashboard`, `/applications/[id]`
- `api/applications/[id]/submit` → `/dashboard`, `/applications/[id]`, `/admin/queue`, `/admin/applications`, `/admin/dashboard`
- `api/documents/upload` → `/applications/[id]`, `/admin/applications/[id]`
- `api/auth/register` → `/admin/clients`, `/admin/dashboard`

**Fix 3: `router.refresh()` added / improved in client components**
- `ClientEditForm.tsx` — added `useRouter` + `router.refresh()` after successful PATCH
- `SendInvitePanel.tsx` — added `useRouter` + `router.refresh()` after successful POST
- `AccountManagerPanel.tsx` — replaced `window.location.reload()` with `router.refresh()`
- StageSelector, DocumentViewer, EditableApplicationDetails, FlaggedDiscrepanciesCard — already had it

---

### 2026-04-06 — Claude Code (CLI) — Dashboard analytics KPI grid + admin can edit application fields

**Build passes clean. Two major features.**

**Feature 1: Dashboard Analytics (4-card KPI grid)**
- `src/app/(admin)/admin/dashboard/page.tsx` — 8 parallel Supabase queries; server-side data computation for all 4 charts; helper functions `getLast6Months()`, `monthLabel()`, `avg()`, `toMonthKey()`; STATUS_HEX map; passes `DashboardAnalyticsData` to `<DashboardAnalytics>`
- `src/components/admin/DashboardAnalytics.tsx` — NEW "use client" recharts component; 2×2 grid; Card 1: LineChart avg days to approval (last 6 months, `connectNulls={false}`); Card 2: list view time-in-stage with inline progress bars + "Longest phase" highlight; Card 3: BarChart approval rate (last 4 months); Card 4: BarChart applications by status (per-bar `<Cell>` colors); shared `CardShell` wrapper with icon/info/settings/Explore link; section header with Filters | Export | Customize buttons
- Time-in-stage calculation: groups `status_changed` audit events by application_id, sorts by created_at, computes `events[i+1].ts - events[i].ts` as duration spent in `events[i].status`, averages across all applications

**Feature 2: Admin can edit application fields with audit trail**
- `src/app/api/admin/applications/[id]/route.ts` — NEW PATCH handler; verifies admin session; fetches current row; diffs each field with `JSON.stringify`; inserts one `audit_log` entry per changed field (`action: "field_updated"`, `previous_value`, `new_value`, optional `detail.note`); updates `applications` row; returns `{ success: true, changedFields }`
- `src/components/admin/EditableApplicationDetails.tsx` — NEW "use client" component; `SectionKey = "business" | "contact" | "ubo" | "notes"`; `SectionActions` sub-component toggles Edit ↔ Save/Cancel; only one section editable at a time (other Edit buttons disabled); shared optional-note Dialog (skip or save with note); `executeSave()` calls PATCH, toasts, router.refresh(); Business Info uses Select for type + country; UBOs reuse `<UBOForm>`
- `src/app/(admin)/admin/applications/[id]/page.tsx` — replaced three static cards (Business Information, Primary Contact, UBO) with `<EditableApplicationDetails app={...} />`; Internal Notes section now included and editable; Documents, AI Flagged Discrepancies, Verification Checklist, right column unchanged

**New API route added:**
- `PATCH /api/admin/applications/[id]` — per-field edit with audit trail

---

### 2026-04-07 — Claude Code (CLI) — Admin nav: clickable clients, search, all-applications page

**Build passes clean. 3 navigation changes.**

**Change 1: Clickable company name on Clients page**
- `src/app/(admin)/admin/clients/page.tsx` — converted to thin server component; data normalization (owner, manager, appCount) extracted from raw Supabase rows into `ClientRow[]`; `CreateClientModal` + `<ClientsTable>` passed normalized data
- `src/components/admin/ClientsTable.tsx` — NEW "use client" component; company name wrapped in `<Link href="/admin/clients/[id]">` with `hover:text-brand-blue hover:underline`; "View" button column removed (5 columns down from 6); `colSpan` updated to 5; search bar added (see Change 2)

**Change 2: Search bar on Clients page**
- `src/components/admin/ClientsTable.tsx` — search input with `Search` lucide icon (left-side); `max-w-md`; case-insensitive filter on `company_name`, `ownerName`, `ownerEmail`; separate empty states: "No clients yet" (zero total) vs "No clients match your search" (filtered); matches Review Queue / ApplicationTable pattern

**Change 3: "Applications" page — all applications across all clients**
- `src/app/(admin)/admin/applications/page.tsx` — NEW server component; `force-dynamic`; fetches all applications (no status filter), joins `clients(company_name)` and `service_templates(name)`, orders by `updated_at desc`; passes `ApplicationRow[]` to `<ApplicationsTable>`
- `src/components/admin/ApplicationsTable.tsx` — NEW "use client" component; search across `business_name`, `companyName`, `serviceName`, `status`; 7 columns: Application (brand-navy), Company, Service, Stage (StatusBadge), Created, Last Updated, Notes (first 60 chars); entire row is clickable (`cursor-pointer`, `onClick` → `router.push`); two empty states (no apps / no match)
- `src/components/shared/Sidebar.tsx` — "Applications" nav item added between Clients and Review Queue; `href: "/admin/applications"`, `icon: FileText`, `exact: true` (prevents matching `/admin/applications/[id]` routes)
- `src/app/(admin)/admin/queue/page.tsx` — description updated from "All submitted applications" → "Active applications awaiting review"

---

### 2026-04-07 — Claude Code (CLI) — Three component fixes: chevron visibility, status panel light theme + collapsible

**Build passes clean.**

**Fix 1: WorkflowTracker — pending stages visible**
- `src/components/admin/WorkflowTracker.tsx` — future/pending stages changed from `bg-slate-100 text-brand-muted` → `bg-slate-200 text-slate-500`; removed `shadow-md` from current stage background (drop-shadow handles depth now); added `filter: drop-shadow(0 0 1px rgba(0,0,0,0.13))` to outer container via inline style — CSS drop-shadow respects clip-path shape and gives all chevrons a visible outline edge on white backgrounds; all 6 stages are now clearly visible even with no progress

**Fix 2 & 3: ApplicationStatusPanel — light theme + collapsible (default collapsed)**
- `src/components/shared/ApplicationStatusPanel.tsx` — converted to "use client"; switched from `bg-brand-dark` (dark) to `bg-white border-gray-200 shadow-sm` (light card); header: `text-gray-500` label, `text-gray-900` business name; document rows: `bg-gray-50 hover:bg-gray-100`, `text-gray-900` title, `text-gray-500` subtitle; action rows keep `border-brand-accent` left strip; "Awaiting" pills changed from `bg-white/10` → `bg-gray-200 text-gray-500`; Elarix AI card: `bg-amber-50 border-amber-100`, `text-amber-700` label, white sparkle icon on `bg-brand-accent` avatar; added `useState(false)` collapse toggle — default CLOSED; header shows summary line when collapsed ("4 verified · 2 flagged · 6 awaiting" format, only non-zero counts); ChevronDown rotates 180° when open; body uses `max-h-0 opacity-0` → `max-h-[2000px] opacity-100` transition-all for smooth height animation; Sidebar and Header untouched (remain dark)



### 2026-04-07 — Claude Code (CLI) — Application detail page overhaul: modal fixes, audit table, AI discrepancies, status panel

**Build passes clean. 5 changes applied.**

**Change 1: Modal background fix (root cause + all affected components)**
- `src/components/ui/dialog.tsx` — `DialogContent` changed from `bg-popover text-popover-foreground` to `bg-white text-gray-900 shadow-xl`; fixes transparent dialogs globally (affects CreateClientModal, StageSelector, AccountManagerPanel, any future dialogs)
- `src/components/ui/sheet.tsx` — `SheetContent` changed from `bg-popover bg-clip-padding text-popover-foreground` to `bg-white text-gray-900`; fixes EmailComposer and all sheets

**Change 2: Compact AuditTrail table view**
- `src/components/admin/AuditTrail.tsx` — converted from timeline `ul/li` to compact `table`; now "use client" for expandable rows; columns: Time (relative + full date tooltip) | Actor (initials avatar + name + role badge) | Action (label + status change arrow + quoted note inline); chevron expands row to show full note, before/after values, detail fields; sticky table header; `max-h-[480px]` scrollable body

**Change 3: AI Flagged Discrepancies card**
- `src/components/admin/FlaggedDiscrepanciesCard.tsx` — NEW "use client" component; shows each flagged document with flag strings from `verification_result.flags` and field-level discrepancies from `match_results` (expected vs found grid); "Override to Pass" button calls `PATCH /api/admin/documents/[id]/override` with `verdict: "pass"` + `router.refresh()`; "Request Re-upload" links to document viewer; empty state shows green checkmark; removed docs optimistically after override
- `src/app/(admin)/admin/applications/[id]/page.tsx` — FlaggedDiscrepanciesCard card added after Documents card in left column; filters uploads to `verification_status === 'flagged'`

**Change 4: ApplicationStatusPanel**
- `src/components/shared/ApplicationStatusPanel.tsx` — NEW server component; dark-themed (`bg-brand-dark border-white/10 rounded-xl`); "Application Health" label + business name header; one status row per document requirement (green check = verified, amber shield + left border = flagged/manual_review, gray clock = pending/missing); row subtitles describe document state; "Elarix AI" assistant card at bottom with `getAssistantMessage(status, flaggedCount)` — 8 state-driven messages varying by status + flagged count; UI-only
- `src/app/(admin)/admin/applications/[id]/page.tsx` — ApplicationStatusPanel added at top of right column above Stage Management card
- `src/app/(client)/applications/[id]/page.tsx` — layout changed from single column to `grid-cols-3`; left col-span-2 has main content; right col has ApplicationStatusPanel

**Change 5: Remove StageTaskList from WorkflowTracker**
- `src/components/admin/WorkflowTracker.tsx` — removed `taskData` prop, `StageTaskList` import, and the task list render below the chevron bar; component is now pure chevron pipeline display
- `src/app/(admin)/admin/applications/[id]/page.tsx` — removed `taskData` prop from WorkflowTracker call
- `src/app/(client)/applications/[id]/page.tsx` — same; also removed `document_requirements` query that was only used for taskData (re-added for ApplicationStatusPanel with `category` included)

---

### 2026-04-06 — Claude Code (CLI) — Visual identity overhaul: color palette, dark sidebar, header bar, chevron pipeline

**Build passes clean. 4 visual changes applied consistently.**

**Change 1: Brand color palette**
- `tailwind.config.ts` — added `brand.dark` (#0F172A), updated `brand.navy` (#1e3a8a), `brand.blue` (#3b82f6), added `brand.accent` (#F59E0B gold), `brand.success` (#10B981), `brand.danger` (#EF4444), `brand.muted` (#64748B)

**Change 2: Dark sidebar (Companio-style)**
- `src/components/shared/Sidebar.tsx` — rewritten; `bg-brand-dark` background; width 260px; logo in white, tagline removed (moved to header); section headers use `text-brand-muted text-xs uppercase tracking-wider`; inactive items `text-brand-muted` with `hover:text-white hover:bg-white/5`; active item `bg-brand-accent text-brand-dark rounded-lg font-semibold`; dividers `border-white/10`; `LogOut` button removed from bottom; bottom section shows user name + role badge

**Change 3: Top header bar**
- `src/components/shared/Header.tsx` — NEW "use client" component; `bg-brand-dark h-14 border-b border-white/10`; left: bold white "Mauritius Offshore Client Portal" + `brand-muted` tagline "Beyond Entities, Building Legacies"; right: user name in white + outlined Sign out button (`border-white/30 hover:bg-white/10`)
- `src/app/(admin)/layout.tsx` — wrapped in `flex flex-col`; `<Header>` at top spanning full width; sidebar + main in `flex flex-1 min-h-0` below
- `src/app/(client)/layout.tsx` — same layout restructure

**Change 4: Chevron-style stage pipeline**
- `src/components/admin/WorkflowTracker.tsx` — rewritten; 6 chevron-shaped stages using CSS clip-path polygon; completed = `bg-brand-success` white text + checkmark; current = `bg-brand-accent text-brand-dark` (same gold as active sidebar item); future = `bg-slate-100 text-brand-muted`; rejected = `bg-brand-danger` white + X icon; each stage overlaps the previous by `-ml-3` with stacked z-index for clean arrow connection; hover tooltip (gray-900 bg) shows stage name + status label; `StageTaskList` renders below as before

---

### 2026-04-06 — Claude Code (CLI) — Sidebar nav, activity feed, task list, files pages

**Build passes clean. 4 features added.**

**Feature 1: Left sidebar navigation (replaces top Navbar)**
- `src/components/shared/Sidebar.tsx` — NEW "use client" component; fixed left sidebar 260px wide; white bg, subtle right border; brand logo + tagline at top; active route highlighted (brand-navy bg, white text); hover state (gray bg); admin nav: Dashboard, Clients, Review Queue, Settings section (Templates, Verification Rules, Workflow); client nav: Dashboard, New Application, My Applications (conditional); contextual "Application" section auto-appears when on any `/admin/applications/[id]` or `/applications/[id]` route, with Details + Files links; user name + Sign out at bottom
- `src/app/(admin)/layout.tsx` — replaced `<Navbar>` with `<Sidebar>`; layout changed to `flex` with `min-h-screen`
- `src/app/(client)/layout.tsx` — same; added `client_id` to clientUser select; added app count query to pass `hasApplications` prop to Sidebar
- `src/components/shared/Navbar.tsx` — kept in place but no longer used

**Feature 2: Activity Feed**
- `src/components/shared/ActivityFeed.tsx` — NEW "use client" component; initials avatar (colored by role), action description, relative timestamp ("2h ago"), quoted stage-change notes, link to application
- `src/app/(admin)/admin/dashboard/page.tsx` — updated audit_log query to include `detail`; replaced custom activity rendering with `<ActivityFeed>`
- `src/app/(client)/dashboard/page.tsx` — added audit_log query for client's applications; two-column layout (apps list + activity feed card on the right)

**Feature 3: Stage task list under workflow tracker**
- `src/components/shared/StageTaskList.tsx` — NEW server component; derives tasks per stage: draft → business details + UBO tasks; document stages → requirements as tasks (uploaded = completed); verification → 6 checklist items (placeholder); pending_action → admin note + doc tasks; mini progress bar + "X/Y complete"; To Do / Completed sections
- `src/components/admin/WorkflowTracker.tsx` — added optional `taskData` prop; renders `<StageTaskList>` below the stage bar when provided
- `src/app/(admin)/admin/applications/[id]/page.tsx` — added document_requirements query by template_id; passes taskData to WorkflowTracker
- `src/app/(client)/applications/[id]/page.tsx` — same requirements query + taskData pass

**Feature 4: Files page per application**
- `src/components/shared/FileManager.tsx` — NEW "use client" component; search bar + category filter; table view (Name, Category, Uploaded, Size, Status, Actions); admin gets "View" link to document viewer; both get "Download" (calls signed URL API); empty state with folder icon
- `src/app/api/documents/[id]/download/route.ts` — NEW GET endpoint; auth-gated; fetches file_path from document_uploads; returns 1-hour Supabase Storage signed URL
- `src/app/(admin)/admin/applications/[id]/files/page.tsx` — NEW; breadcrumb nav; shows FileManager with admin role
- `src/app/(client)/applications/[id]/files/page.tsx` — NEW; breadcrumb nav; "+ Add File" button links to documents wizard; shows FileManager with client role
- Sidebar auto-shows "Files" link when on application routes (see Feature 1)

---

### 2026-04-06 — Claude Code (CLI) — Admin application features: notes, checklist, workflow tracker

**Build passes clean.**

**Feature 1: Mandatory notes on every stage change**
- `src/components/admin/StageSelector.tsx` — note textarea is now always shown when a different stage is selected; note is required for ALL transitions (not just pending_action/rejected); Update button disabled until note is non-empty; confirmation dialog (for approved/rejected) shows the typed note as a quoted preview instead of a redundant textarea
- `src/app/api/admin/applications/[id]/stage/route.ts` — no changes needed; note is already stored in `audit_log.detail.note`
- `src/components/admin/AuditTrail.tsx` — stage change notes extracted from `detail.note` and displayed as a bordered italic quote below the status transition; "note" key excluded from the generic detail line to avoid duplication

**Feature 2: Verification Checklist (placeholder)**
- `src/app/(admin)/admin/applications/[id]/page.tsx` — added Verification Checklist card in left column after Documents; 6 static unchecked items; gray "Checklist automation coming in v2" footer text; UI-only, no DB changes

**Feature 3: Workflow progress tracker**
- `src/components/admin/WorkflowTracker.tsx` — NEW reusable component; horizontal connected stages (Draft → Submitted → In Review → Action Required → Verification → Approved); completed stages show checkmark in brand-navy; current stage is highlighted with ring; future stages gray; rejected state appends a red X node; uses APPLICATION_STATUS_LABELS from constants
- `src/app/(admin)/admin/applications/[id]/page.tsx` — WorkflowTracker added above the main grid in a white bordered card
- `src/app/(client)/applications/[id]/page.tsx` — WorkflowTracker added above the existing StatusTimeline so clients can see their progress

---

### 2026-04-06 — Claude Desktop

**Fix: Application detail page 404 — stale `profiles` join**
- `src/app/(admin)/admin/applications/[id]/page.tsx` — the query joined `profiles(*)` on `applications`, but `applications` has no FK to `profiles` (it was removed during the data model redesign). Changed to `clients(company_name)` which is the correct relationship. Updated type cast and fallback references accordingly.

---

### 2026-04-06 — Claude Desktop

**Fix: Admin clients pages broken — ambiguous FK join**
- Root cause: `client_users` has two FKs to `profiles` (`user_id` and `invited_by`). PostgREST can't disambiguate `profiles(...)` inside a `client_users(...)` join — returns error, page shows empty or 404.
- `src/app/(admin)/admin/clients/page.tsx` — changed `profiles(full_name, email)` → `profiles!client_users_user_id_fkey(full_name, email)`
- `src/app/(admin)/admin/clients/[id]/page.tsx` — same fix for the detail page join
- `src/app/api/admin/clients/[id]/send-invite/route.ts` — same fix for invite route
- No other `client_users → profiles` joins found in the codebase

---

### 2026-04-06 — Claude Code (CLI) — Bug fixes: outside-click, clients list, draft apps

**Build passes clean.**

**Fix 1: Forms closing on outside click**
- `src/components/admin/EmailComposer.tsx` — `Sheet` `onOpenChange` now uses `(newOpen) => { if (newOpen) setOpen(true); }` pattern — outside click no longer closes the sheet
- `src/components/admin/StageSelector.tsx` — `Dialog` `onOpenChange` same fix — confirmation dialog no longer dismissible by outside click
- (`CreateClientModal.tsx` already had this fix from a prior session)

**Fix 2: Admin clients list empty at /admin/clients**
- `src/app/(admin)/admin/clients/page.tsx` — added `export const dynamic = "force-dynamic"` to prevent Next.js static caching of the server component

**Fix 3: Draft applications visible to admin**
- Already working: `/admin/clients/[id]` shows all applications including drafts with correct "Draft" badge (grey). `APPLICATION_STATUS_LABELS` and `APPLICATION_STATUS_COLORS` both already define `draft`. No code changes needed — confirmed working.

---

### 2026-04-06 — Claude Code (CLI) — Form UI polish pass

**Build passes clean.**

**`src/components/ui/input.tsx`**
- Height `h-8` → `h-9` (matches SelectTrigger default size)
- Border `border-input` → `border-gray-300` (explicit, consistent)
- Corner radius `rounded-lg` → `rounded-md`
- Focus ring: `focus-visible:border-ring ring-3 ring-ring/50` → `focus-visible:border-brand-navy ring-2 ring-brand-navy/20`
- Placeholder: `placeholder:text-muted-foreground` → `placeholder:text-gray-400`

**`src/components/ui/textarea.tsx`**
- Same border, radius, focus ring, and placeholder fixes as Input

**`src/components/ui/select.tsx`**
- SelectTrigger: same border (`border-gray-300`), radius (`rounded-md`), focus ring (`brand-navy`), placeholder (`data-placeholder:text-gray-400`) fixes
- SelectContent popup: `bg-popover` → `bg-white` (explicit solid white); `shadow-md` → `shadow-lg`; `ring-1 ring-foreground/10` → `ring-1 ring-black/10`; `max-h-(--available-height)` → `max-h-60`; `rounded-lg` → `rounded-md`; list gets `p-1` padding
- SelectItem: hover/focus `bg-accent` → `bg-gray-100 text-gray-900`
- SelectScrollUp/DownButton: `bg-popover` → `bg-white`

**`src/app/(client)/apply/[templateId]/details/page.tsx`**
- All label+input field wrappers: `space-y-2` → `space-y-1.5` (tighter, consistent label-to-input gap)

**`src/app/(admin)/admin/clients/[id]/apply/[templateId]/details/page.tsx`**
- Same `space-y-2` → `space-y-1.5` fix

**`src/components/client/UBOForm.tsx`**
- Field wrappers: `space-y-1` → `space-y-1.5` (consistent with main form)

---

### 2026-04-06 — Claude Desktop

**UI fixes on wizard step 1 (Business Details)**
- `src/components/ui/select.tsx` — SelectTrigger: `w-fit` → `w-full`; height `h-8` → `h-9`
- `src/components/client/UBOForm.tsx` — Nationality field changed from `<Input>` to `<Select>` dropdown with 26 nationalities

---

### 2026-04-05 — Claude Code (CLI) — Auth.js migration COMPLETE

**Supabase Auth fully replaced with NextAuth v5 (Auth.js). Build passes clean.**

**New dependencies added to `package.json`:**
- `next-auth@beta` (v5) — session management
- `bcryptjs` + `@types/bcryptjs` — password hashing (cost factor 12)
- `jose` — edge-compatible JWT for invite tokens

**New files:**
- `src/lib/auth.ts` — NextAuth config: credentials provider, jwt/session callbacks, 8h maxAge, `/login` as signIn page
- `src/types/next-auth.d.ts` — extends Session with `id: string` and `role: string`
- `src/app/api/auth/[...nextauth]/route.ts` — NextAuth handler
- `src/lib/rate-limit.ts` — in-memory rate limiter (10 attempts / 15 min per IP)
- `src/app/api/auth/register/route.ts` — client registration: validates, bcrypt.hash(pw, 12), creates profile + client + client_user
- `src/app/api/auth/set-password/route.ts` — verifies jose JWT invite token, updates `profiles.password_hash`
- `src/app/api/documents/upload/route.ts` — multipart upload to Supabase Storage via service role; replaces browser storage calls
- `src/app/api/applications/save/route.ts` — create/update draft application (client portal)
- `src/app/api/applications/[id]/route.ts` — GET application + requirements + uploads (used by all wizard pages)
- `src/app/api/applications/[id]/submit/route.ts` — submit application + audit log
- `src/app/api/admin/applications/[id]/stage/route.ts` — PATCH application status (admin)
- `src/app/api/admin/documents/[id]/override/route.ts` — PATCH document verification override (admin)
- `src/app/api/admin/clients/[id]/account-manager/route.ts` — POST assign account manager
- `src/app/api/admin/settings/templates/route.ts` — GET all templates, POST create
- `src/app/api/admin/settings/templates/[id]/route.ts` — PATCH template (toggle active)
- `src/app/api/admin/settings/templates/[id]/requirements/route.ts` — POST add document requirement
- `src/app/api/admin/settings/requirements/[id]/route.ts` — DELETE/PATCH document requirement
- `next.config.js` — security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy

**Updated files:**
- `middleware.ts` — replaced Supabase session check with `auth()` from NextAuth; role-based redirect logic preserved
- `src/lib/supabase/server.ts` — now re-exports `createAdminClient` (backward compat); `@supabase/ssr` no longer used for auth
- `src/lib/supabase/client.ts` — **no longer imported anywhere in the app**; kept in place but unused
- `src/app/layout.tsx` — added `SessionProvider` from `next-auth/react`
- `src/app/page.tsx` — uses `auth()` for role-based redirect
- `src/app/(admin)/layout.tsx` — uses `auth()` + `createAdminClient()`
- `src/app/(client)/layout.tsx` — uses `auth()` + `createAdminClient()`
- `src/app/(auth)/login/page.tsx` — uses `signIn("credentials", ...)` from `next-auth/react`
- `src/app/(auth)/register/page.tsx` — POSTs to `/api/auth/register` then auto `signIn`
- Many more — see git history

**DB migration required:**
```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;
```

**Architecture summary:**
- NextAuth v5 issues JWT session (8h); `auth()` on server, `useSession()` on client
- All DB writes go through Next.js API routes (no browser → Supabase direct mutations)
- All file uploads go through `/api/documents/upload` (service role)
- `createAdminClient()` (service role) used everywhere server-side — RLS bypassed at app layer
- Invite tokens: jose HS256 JWT `{ sub, email, purpose: "invite", exp: now+24h }` signed with AUTH_SECRET

---

### 2026-04-05 — Claude Desktop

**Post-migration verification + admin password reset**
- Verified Auth.js migration end-to-end: admin login ✅, client registration ✅, session/role detection ✅
- Reset admin password hash to `GWMSAdmin2026!` (CLI migration set an unknown password)
- Cleaned orphaned test data from earlier Supabase Auth testing

---

### 2026-04-05 — Claude Desktop

**RLS policy fix — registration was broken**
- Root cause: `auth.role() = 'authenticated'` no longer works on newer Supabase versions
- Changed 3 policies on `clients` (INSERT), `service_templates` (SELECT), `document_requirements` (SELECT) to use `auth.uid() IS NOT NULL`

---

### 2026-04-05 — Claude Code (CLI) — Modal + client creation flow + admin wizard

**Modal + client creation flow overhaul**
- `CreateClientModal.tsx` — prevent outside-click close; form resets on close; create-only (no email); navigates to client detail after creation
- `api/admin/create-client/route.ts` — removed email sending; returns `clientId`
- `api/admin/clients/[id]/send-invite/route.ts` — NEW: generates recovery link + sends branded email + stamps `invite_sent_at`
- `components/admin/SendInvitePanel.tsx` — NEW: invite status + send/resend button

**Admin wizard (act on behalf of client)**
- `admin/clients/[id]/apply/page.tsx` — NEW: template selector in admin context
- `admin/clients/[id]/apply/[templateId]/details|documents|review/page.tsx` — NEW: 3-step admin wizard
- `api/admin/applications/upsert/route.ts` — NEW: service-role application create/update for admin wizard

**DB migration required (already run):**
```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz;
CREATE POLICY "admins can manage all applications" ON applications FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admins can manage all document_uploads" ON document_uploads FOR ALL USING (is_admin()) WITH CHECK (is_admin());
```

---

### 2026-04-05 — Claude Code (CLI) — Admin clients list + detail pages

- `admin/clients/page.tsx` — NEW: full clients table with owner, manager, app count
- `admin/clients/[id]/page.tsx` — NEW: client detail with users, applications, account manager panel
- `components/admin/ClientEditForm.tsx` — NEW: inline company name edit
- `api/admin/clients/[id]/route.ts` (PATCH) — NEW: update company name
- `components/shared/Navbar.tsx` — added "Clients" link to admin nav

---

### Prior sessions — Claude Code (CLI)

**Account manager tracking**
- `client_account_managers` table added to schema
- `AccountManagerPanel` component created

**Admin-initiated client creation**
- `api/admin/create-client/route.ts` — creates auth user + profile + client + sends welcome email
- `auth/callback/route.ts` — handles PKCE code exchange, redirects recovery to `/auth/set-password`

**Data model redesign**
- Removed `role` from `profiles`
- Added `clients`, `client_users`, `admin_users` tables
- `applications.client_id` now references `clients.id`
- All role checks derived from table membership

**Audit logging**
- DB triggers on `applications`, `document_uploads`
- `get_actor_info()` PL/pgSQL helper
- `AuditTrail` component with actor badges + before/after values
