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

