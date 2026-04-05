# GWMS Client Onboarding Portal — Claude Code Guide

## What This Is

A two-portal KYC/AML onboarding web application for GWMS Ltd (licensed management company, Mauritius).
- **Client portal** — companies register, complete a 3-step wizard, upload documents, track status
- **Admin portal** — GWMS staff review applications, verify documents, manage stages, email clients

POC build. All core features are complete and the production build passes clean.

## Tech Stack

- **Framework**: Next.js 14 App Router, TypeScript, `src/` directory
- **Styling**: Tailwind CSS + shadcn/ui v2 (`@base-ui/react` — NOT Radix UI)
- **Database**: Supabase (PostgreSQL + RLS)
- **Auth**: Supabase Auth (`@supabase/ssr` — NOT deprecated auth-helpers)
- **Storage**: Supabase Storage — private bucket named `documents`
- **AI**: Anthropic `claude-opus-4-6` for document OCR + field verification
- **Email**: Resend

## Credentials & Environment

All credentials are in `.env.local` at the project root:
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
ANTHROPIC_API_KEY
RESEND_API_KEY
RESEND_FROM_EMAIL=support@elarix.io
```

## Data Model (important — read before touching queries)

```
auth.users (Supabase Auth)
    ↓ trigger auto-creates →
profiles          -- personal info only (full_name, email, phone). NO role field.
    ↓                              ↓
admin_users       -- portal admins    client_users -- junction: user ↔ company (role: owner|member)
                                           ↓
                                      clients      -- the company entity (company_name)
                                           ↓
                                      applications -- client_id → clients.id (NOT profiles.id)
                                           ↓
                                      document_uploads
```

**Role is derived from table membership:**
- User has row in `admin_users` → admin
- User has row in `client_users` → client
- Never read `profiles.role` — that column does not exist

**Applications belong to the company, not the individual user.** All members of a company see all applications for that company via RLS.

**`client_account_managers`** — tracks which admin is responsible for each client account over time. `ended_at IS NULL` = currently active. Assigning a new manager closes the previous row (sets `ended_at`) and inserts a new one.

## Supabase Clients

Three clients, use the right one:
```
src/lib/supabase/client.ts   — browser (client components)
src/lib/supabase/server.ts   — server (server components, layouts, API routes)
src/lib/supabase/admin.ts    — service role, bypasses RLS (admin portal pages)
```

## Route Structure

```
/                          → redirects to /admin/dashboard or /dashboard based on admin_users lookup
/login  /register          → auth pages
/dashboard                 → client: application list (all apps for their company)
/apply                     → client: service template selection
/apply/[templateId]/details     → client wizard step 1
/apply/[templateId]/documents   → client wizard step 2
/apply/[templateId]/review      → client wizard step 3 + submit
/applications/[id]         → client: application status + timeline

/admin/dashboard           → admin: stats + recent activity
/admin/queue               → admin: review queue with search/filter
/admin/applications/[id]   → admin: full application detail + stage management
/admin/applications/[id]/documents/[docId]  → admin: AI document viewer
/admin/settings/templates  → admin: manage service templates
/admin/settings/rules      → admin: edit AI verification rules (JSON editor)
/admin/settings/workflow   → admin: workflow stages overview
```

**Admin route nesting:** Admin pages live at `src/app/(admin)/admin/[page]` — the extra `admin/` folder is needed to avoid route conflicts with client routes (`/dashboard` etc).

## Key Gotchas

- **shadcn/ui uses `@base-ui/react`** — no `asChild` prop. Use `render` prop instead: `<SheetTrigger render={<Button />} />`
- **Select `onValueChange` returns `string | null`** — always coalesce: `(v) => setState(v ?? "")`
- **Anthropic SDK** — PDF content block type is `Anthropic.DocumentBlockParam` (not `RequestDocumentBlock`)
- **Supabase join type inference** — joined relations come back as arrays. Cast via `unknown` first: `data as unknown as MyType[]`
- **`auth.uid()` in DB triggers** — works in Supabase because JWT context is set. Used in audit log triggers to capture actor.

## Audit Logging

Fully automatic via DB triggers:
- Every application status change → `audit_log` row with `previous_value` / `new_value`
- Every document upload → `audit_log` row
- Every AI verification completion → `audit_log` row
- Every admin document override → `audit_log` row
- `actor_role` is derived from `admin_users` / `client_users` membership

## Dev Commands

```bash
npm run dev       # Start development server (http://localhost:3000)
npm run build     # Production build + type check
npm run lint      # ESLint
```

## Admin Setup (one-time, already done for Jane Doe)

1. Create user in Supabase Auth dashboard
2. Run SQL:
```sql
UPDATE profiles SET full_name = 'Jane Doe' WHERE email = 'vanes.vr@gmail.com';
INSERT INTO admin_users (user_id) SELECT id FROM profiles WHERE email = 'vanes.vr@gmail.com';
```

## Code Quality Rules

- Run `npm run build` before considering any task done — it runs lint + type check
- Do not disable TypeScript strict mode
- Do not use `any` — use `unknown` with a cast if Supabase inference is wrong
- Do not add `console.log` in production code
- Do not add features beyond what is asked
- Do not commit `.env.local`
