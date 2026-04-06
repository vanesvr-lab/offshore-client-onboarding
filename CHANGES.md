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
- `src/app/(client)/dashboard/page.tsx` — uses `auth()` + `createAdminClient()`
- `src/app/(client)/apply/[templateId]/details/page.tsx` — saves via `/api/applications/save`; loads via `/api/applications/[id]`
- `src/app/(client)/apply/[templateId]/documents/page.tsx` — loads via `/api/applications/[id]`
- `src/app/(client)/apply/[templateId]/review/page.tsx` — loads via `/api/applications/[id]`; submits via `/api/applications/[id]/submit`
- `src/app/(admin)/admin/clients/[id]/apply/[templateId]/details/page.tsx` — loads via `/api/applications/[id]`
- `src/app/(admin)/admin/clients/[id]/apply/[templateId]/documents/page.tsx` — loads via `/api/applications/[id]`
- `src/app/(admin)/admin/clients/[id]/apply/[templateId]/review/page.tsx` — loads via `/api/applications/[id]`; submits via `/api/applications/[id]/submit`
- `src/app/(admin)/admin/applications/[id]/page.tsx` — removed `createClient` + `currentUser` (no longer needed)
- `src/app/(admin)/admin/clients/[id]/page.tsx` — removed `createClient` + `currentUser`
- `src/app/auth/set-password/page.tsx` — uses jose JWT token from URL; calls `/api/auth/set-password`; auto signs in after success
- `src/app/auth/callback/route.ts` — **replaced**: now just redirects to `/login` (Supabase Auth callback no longer needed)
- `src/app/api/send-email/route.ts` — uses `auth()` instead of `supabase.auth.getUser()`
- `src/app/api/verify-document/route.ts` — uses `auth()`
- `src/app/api/admin/create-client/route.ts` — uses `auth()`; no longer creates Supabase Auth user (sets `password_hash: null`)
- `src/app/api/admin/clients/[id]/send-invite/route.ts` — generates jose JWT (24h, signed with AUTH_SECRET) instead of Supabase recovery link
- `src/components/shared/Navbar.tsx` — uses `signOut` from `next-auth/react`
- `src/components/admin/StageSelector.tsx` — uses `useSession()`; calls `/api/admin/applications/[id]/stage`
- `src/components/admin/DocumentViewer.tsx` — calls `/api/admin/documents/[id]/override`
- `src/components/admin/AccountManagerPanel.tsx` — calls `/api/admin/clients/[id]/account-manager`; removed `currentUserId` prop
- `src/components/client/DocumentUploadStep.tsx` — uploads via `/api/documents/upload` (FormData); no direct Supabase storage calls
- `src/app/(admin)/admin/settings/templates/page.tsx` — all CRUD via API routes
- `src/app/(admin)/admin/settings/rules/page.tsx` — loads via `/api/admin/settings/templates`; saves via `/api/admin/settings/requirements/[id]`

**DB migration required:**
```sql
-- Add password_hash column to profiles (run this if not already done)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text;

-- Set admin password (replace hash with output of: node -e "require('bcryptjs').hash('YOUR_PASSWORD',12).then(console.log)")
UPDATE profiles SET password_hash = '<bcrypt_hash>' WHERE email = 'vanes.vr@gmail.com';
```

**`.env.local` additions required:**
```
AUTH_SECRET=<32-byte base64 secret — generate with: openssl rand -base64 32>
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**Architecture summary:**
- NextAuth v5 issues JWT session (8h); `auth()` on server, `useSession()` on client
- All DB writes go through Next.js API routes (no browser → Supabase direct mutations)
- All file uploads go through `/api/documents/upload` (service role)
- `createAdminClient()` (service role) used everywhere server-side — RLS bypassed at app layer
- Invite tokens: jose HS256 JWT `{ sub, email, purpose: "invite", exp: now+24h }` signed with AUTH_SECRET

---

### 2026-04-05 — Claude Desktop

**Post-migration verification + fixes**
- Verified Auth.js migration end-to-end: admin login ✅, client registration ✅, session/role detection ✅, dashboard access ✅
- Reset admin password hash — CLI migration set an unknown password; regenerated bcrypt hash for `GWMSAdmin2026!` and updated `profiles.password_hash`
- Cleaned orphaned test data (profiles, clients from earlier Supabase Auth testing)

**DB migration required (already run):**
```sql
-- Drop FK to auth.users since profiles.id is now app-managed (Auth.js, not Supabase Auth)
ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey;
```

**Current test accounts:**
- Admin: `vanes.vr@gmail.com` / `GWMSAdmin2026!` (Jane Doe)
- Client: `john.smith@testcorp.com` / `TestClient2026!` (John Smith, Test Corp International)

---

### 2026-04-05 — Claude Desktop

**RLS policy fix — registration was broken**
- Root cause: `auth.role() = 'authenticated'` no longer works on newer Supabase versions for RLS policy checks
- `supabase/schema.sql` — changed 3 policies to use `auth.uid() IS NOT NULL` instead of `auth.role() = 'authenticated'`:
  - `authenticated_create_client` on `clients` (INSERT)
  - `authenticated_read_templates` on `service_templates` (SELECT)
  - `authenticated_read_requirements` on `document_requirements` (SELECT)

**DB migration required (run in Supabase SQL Editor):**
```sql
DROP POLICY IF EXISTS "authenticated_create_client" ON clients;
CREATE POLICY "authenticated_create_client" ON clients FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "authenticated_read_templates" ON service_templates;
CREATE POLICY "authenticated_read_templates" ON service_templates FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "authenticated_read_requirements" ON document_requirements;
CREATE POLICY "authenticated_read_requirements" ON document_requirements FOR SELECT USING (auth.uid() IS NOT NULL);
```

**Data cleanup:** wiped all test users and transactional data. Current state:
- 1 auth user: `vanes.vr@gmail.com` (Jane Doe, admin, confirmed)
- 0 clients, 0 applications — clean slate for testing
- Seed data intact (6 templates, 18 document requirements)

---

### 2026-04-05 — Claude Code (CLI)

**Modal + client creation flow overhaul**
- `CreateClientModal.tsx` — prevent outside-click close; form resets on close; create-only (no email); navigates to client detail after creation
- `api/admin/create-client/route.ts` — removed email sending; returns `clientId`
- `api/admin/clients/[id]/send-invite/route.ts` — NEW: generates recovery link + sends branded email + stamps `invite_sent_at`
- `components/admin/SendInvitePanel.tsx` — NEW: invite status + send/resend button
- `admin/clients/[id]/page.tsx` — added `invite_sent_at` to query, added `SendInvitePanel`, added "Start application" button
- `auth/set-password/page.tsx` — redirect after password set changed from `/dashboard` → `/apply`
- `package.json` — `dev` script now uses `--port 3000`
- `.env.local` — `NEXT_PUBLIC_APP_URL` updated to `http://localhost:3000`

**Admin wizard (act on behalf of client)**
- `admin/clients/[id]/apply/page.tsx` — NEW: template selector in admin context
- `admin/clients/[id]/apply/[templateId]/details/page.tsx` — NEW: wizard step 1, uses `clientId` from URL, saves via API
- `admin/clients/[id]/apply/[templateId]/documents/page.tsx` — NEW: wizard step 2
- `admin/clients/[id]/apply/[templateId]/review/page.tsx` — NEW: wizard step 3, submits → `/admin/applications/[id]`
- `api/admin/applications/upsert/route.ts` — NEW: service-role application create/update for admin wizard

**DB migration required (run in Supabase):**
```sql
ALTER TABLE clients ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz;
CREATE POLICY "admins can manage all applications" ON applications FOR ALL USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "admins can manage all document_uploads" ON document_uploads FOR ALL USING (is_admin()) WITH CHECK (is_admin());
```

---

### 2026-04-05 — Claude Code (CLI)

**Admin clients list + detail pages**
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
- Admin application detail page updated to show account manager

**Admin-initiated client creation**
- `api/admin/create-client/route.ts` — creates auth user + profile + client + sends welcome email
- `CreateClientModal.tsx` — dialog form in admin portal
- `auth/callback/route.ts` — handles PKCE code exchange, redirects recovery to `/auth/set-password`
- `auth/set-password/page.tsx` — client sets password via recovery link

**Data model redesign**
- Removed `role` from `profiles`
- Added `clients` table (company entity)
- Added `client_users` junction table (user ↔ company, role: owner|member)
- Added `admin_users` table
- `applications.client_id` now references `clients.id` (not `profiles.id`)
- All role checks derived from table membership, not a field

**Audit logging**
- DB triggers on `applications`, `document_uploads`
- `get_actor_info()` PL/pgSQL helper
- `AuditTrail` component with actor badges + before/after values
