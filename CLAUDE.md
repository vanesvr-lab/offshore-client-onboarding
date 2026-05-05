# GWMS Client Onboarding Portal — Claude Code Guide

## What This Is

A two-portal KYC/AML onboarding web application for GWMS Ltd (licensed management company, Mauritius).
- **Client portal** — companies register, complete a 3-step wizard, upload documents, track status
- **Admin portal** — GWMS staff review applications, verify documents, manage stages, email clients

POC build. All core features are complete and the production build passes clean.

## Response Rules (read first, always apply)

- No completion summaries, recap tables, or commit-by-commit breakdowns in chat
- After tasks: one line only (done / blocked / question)
- Write all details to CHANGES.md, not to chat
- Trust tool outputs. No re-verification reads after successful writes
- No "let me double-check" after a build passes
- Read only the tail of CHANGES.md unless I ask for more
- Do not re-read files you've already read this session unless I ask

## Session Coordination

This project is worked on from Claude Code (sometimes terminal, sometimes desktop app, one session at a time). Sessions coordinate through files and git, not chat history.

**Source of truth:**
- `CHANGES.md` — what's been done, current state, what's next
- `CLAUDE.md` — project rules (this file)
- `docs/cli-brief-*.md` — detailed specs for work batches
- Git log — audit trail of actual changes

**Session startup:**
- Run `git pull origin main` first
- Read the tail of `CHANGES.md` before starting work
- If a brief is referenced (e.g., `docs/cli-brief-xxx.md`), read it fully
- Do not ask "what's the current state" in chat, read the files

**Session end:**
- Update `CHANGES.md` with what was done and what's next
- Commit and push (see Git Workflow Rule)
- One-line chat summary only

## CLI Brief Pattern

When I give CLI a brief, it will look like this:

> Read docs/cli-brief-[name].md for the full spec. This is [ID]: [short description]. Do NOT stop between batches, commit, push, and keep going until the entire brief is complete.

Treat briefs as autonomous multi-batch work:
- Complete all batches in the brief before stopping
- Commit and push after each batch
- Update CHANGES.md after each batch
- Do not wait for approval between batches unless the brief says to
- If blocked, document the blocker in CHANGES.md and stop

## Batch Tracking System

Work is organized into numbered batches using the format `B-XXX` (e.g., B-025, B-027). IDs are sequential as work comes up.

**Assigning the next ID:**
- Claude assigns the next ID by checking the highest existing number in `docs/cli-brief-*.md` filenames and `CHANGES.md` entries
- Use the next sequential number (e.g., if B-027 is the latest, next is B-028)
- Pad to 3 digits (B-001, not B-1)

**Where batches live:**
- Each batch has a brief at `docs/cli-brief-[descriptive-name]-b[id].md`
  Example: `docs/cli-brief-kyc-document-layout-b027.md`
- CHANGES.md references batches by ID for traceability
- **Commit messages stay clean** — do NOT include the batch ID in commits

**Batch lifecycle:**
1. Brief is created in `docs/` with full spec
2. CLI (or Desktop) works the brief, batch by batch within it
3. Commits use normal descriptive messages (no B-XXX prefix)
4. CHANGES.md is updated with batch ID + outcome
5. Brief file stays in `docs/` as historical record

**Referencing batches:**
- In chat: "work on B-028" or "check B-025 status"
- In CHANGES.md: `## B-027 — KYC document layout rework (done YYYY-MM-DD)`
- In commits: normal messages, no batch ID

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
- **Mobile-first**: client portal targets 375px minimum. Use `flex-col sm:flex-row` and `grid-cols-1 sm:grid-cols-N` patterns. Sidebar is a drawer below `md:` (state lives in `ClientShell`, opened from the burger in `Header`).

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

## Database Migration Workflow

Migrations are tracked by Supabase CLI in `supabase/migrations/` and on
the prod project's `supabase_migrations.schema_migrations` table.

**Daily check** — see if anyone (you or another instance) added a
migration that hasn't been pushed yet:

```bash
npm run db:status
```

If anything shows "Local" without a matching "Remote", a `db:push` is
pending.

**Adding a new migration (CLI MUST do all of these — do NOT defer to the user):**

1. Create the file: `supabase/migrations/<YYYYMMDDHHMMSS>_<description>.sql`. Use `npx supabase migration new <description>` to auto-generate the timestamp.
2. Write the SQL. Prefer idempotent (`CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) when possible.
3. Commit + push the migration file.
4. **Run `npm run db:push`** to apply the migration to prod. The Supabase CLI on this machine is already linked (see `supabase/.temp/`); no auth needed.
5. **Run `npm run db:status`** and confirm every migration shows paired Local + Remote with no drift. If anything is mismatched, STOP and document the mismatch in CHANGES.md before proceeding.
6. Add a CHANGES.md entry noting the migration filename + that it was pushed.

This is a hard rule, not a suggestion. Migrations that land in the repo without being pushed cause production 500s (B-049 → 006/007/008 incident, fixed in B-054). CLI is responsible for the full migration lifecycle within any brief that touches `supabase/migrations/` — never hand off the push step to the user.

**Why no CI auto-push?** Putting Supabase credentials (DB password or
service role) in GitHub Actions secrets is a leak risk for a
compliance product. CLI handles the push locally instead, where
credentials already exist on the developer's machine and never leave
it.

## Testing

```bash
npm test                  # vitest unit + integration
npm run test:watch        # vitest watch mode
npm run test:coverage     # vitest with coverage report
npm run test:e2e          # playwright E2E (uses the webServer config)
npm run test:e2e:ui       # playwright UI mode
```

- Unit tests live in `tests/unit/` and cover pure functions in `src/lib/`.
- API integration tests live in `tests/integration/api/` and import route handlers directly.
- E2E tests live in `tests/e2e/` and run against the dev server.
- All external services (Supabase, Anthropic, Resend) are mocked via MSW or Playwright `page.route()` — tests never hit real APIs.
- Run `npx playwright install --with-deps chromium` once locally before the first E2E run.
- See `tests/README.md` for fixture conventions and adding new tests.

## Admin Setup (one-time, already done for Jane Doe)

1. Create user in Supabase Auth dashboard
2. Run SQL:
```sql
UPDATE profiles SET full_name = 'Jane Doe' WHERE email = 'vanes.vr@gmail.com';
INSERT INTO admin_users (user_id) SELECT id FROM profiles WHERE email = 'vanes.vr@gmail.com';
```

## Known Future Migration

**Auth: Supabase Auth must be replaced before production.**
Supabase Auth was used for POC speed only. The production build should use self-hosted auth (Auth.js/NextAuth recommended). The data model, RLS policies, and all UI are unaffected — only `src/lib/supabase/client.ts`, `server.ts`, the login/register pages, and middleware need to change.

## Code Quality Rules

- Run `npm run build` before considering any task done — it runs lint + type check
- Do not disable TypeScript strict mode
- Do not use `any` — use `unknown` with a cast if Supabase inference is wrong
- Do not add `console.log` in production code
- Do not add features beyond what is asked
- Do not commit `.env.local`

## Git Workflow Rule (CRITICAL — applies to every batch)

After completing any feature batch, bug fix, or significant set of changes, you
MUST commit and push to GitHub. Vercel deploys from GitHub — local commits do
not deploy, untracked files do not deploy. Skipping this step is the #1 cause
of "the site is showing the old version" reports.

**Required steps after any non-trivial work:**

1. Run `git status` to see ALL modifications
2. Pay attention to BOTH:
   - Modified files (the `M` lines)
   - **Untracked files** (the `??` lines) — new files you just created
3. Stage everything that's part of your work:
   - Stage specific files by name (NEVER use `git add .` or `git add -A`)
   - NEVER stage `.env.local`, `.env`, `supabase/.temp/`, or any file that
     might contain secrets
4. Run `git commit` with a descriptive message. For multi-line messages, use
   the HEREDOC pattern:
   ```
   git commit -m "$(cat <<'EOF'
   feat: brief one-line title

   - Bullet point describing what changed
   - Another bullet
   - Etc.

   Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>
   EOF
   )"
   ```
5. Run `git push origin main`
6. Verify with `git status` — should say "nothing to commit, working tree clean"
   and "Your branch is up to date with 'origin/main'"

**Before/after a deployment fails or shows old content:**
- Run `git log --oneline -5` to see what's actually been committed
- Run `git status -sb` to see if you're ahead of `origin/main`
- If you see commits ahead of origin → push them
- If you see uncommitted/untracked files → stage, commit, push

**Update CHANGES.md as part of every commit** so the other Claude instance
can see what was done.

## Dev Server Restart Pattern

When components or layouts change significantly, the .next cache can corrupt.
Always include this in your handoff to the user:

```
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

Do NOT restart the dev server yourself while editing files — it can corrupt
the webpack cache and cause "Cannot find module" errors. Let the user restart
after you're done editing.
