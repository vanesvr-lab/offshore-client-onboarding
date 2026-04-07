# CHANGES.md — Coordination Log

This file is maintained by both **Claude Code** (CLI) and **Claude Desktop** to coordinate changes on the shared codebase. Update this file whenever you make significant changes so the other instance stays in sync.

---

## How to use this file

- Before starting work: **read this file** to see what was last touched
- After making changes: **add an entry** at the top of the relevant section
- For schema changes: always note the exact SQL run so the other instance knows the DB state
- For risky/shared files (types, middleware, layouts): call it out explicitly

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

### Shared components (`src/components/shared/`)
| Component | Purpose | Last touched by |
|-----------|---------|----------------|
| `Navbar.tsx` | Top nav for both portals | Claude Code |
| `StatusBadge.tsx` | Application status badge | Claude Code |
| `LoadingSpinner.tsx` | Loading indicator | Claude Code |

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


---

## Older Entries

For change log entries before 2026-04-07, see [`CHANGES-archive.md`](./CHANGES-archive.md).

The archive includes: Auth.js migration, visual identity overhaul, sidebar/header/chevron pipeline, modal fixes, AI discrepancies, status panel, application detail page overhaul, admin clients pages, account manager tracking, audit logging, data model redesign, and earlier bug fixes.

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

### Resolved

_(Move items here as they get fixed, with a date and brief note.)_

---
