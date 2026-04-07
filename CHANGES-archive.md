# CHANGES Archive

Historical change log entries from `CHANGES.md`, archived to keep the live coordination file lightweight. Entries are in reverse chronological order (most recent archived entries first).

For the latest entries and current project state, see `CHANGES.md`.

---

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
