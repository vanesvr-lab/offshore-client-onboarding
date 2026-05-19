# B-126 — /register cleanup + CLAUDE.md rewrite (services-first data model)

## Why

CLAUDE.md's Data Model section still describes the legacy `auth.users → profiles → client_users → clients → applications` model that the codebase has moved away from. The current model is services-first: `services` has no `client_id`, `client_profiles` hold KYC subjects (Directors / Shareholders / UBOs), and clients are invite-only (no self-registration). The stale doc caused a Desktop session on 2026-05-18 to give Vanessa the wrong onboarding story for ~30 minutes — she explicitly asked for the doc to be brought into line so it doesn't happen again.

At the same time, the `/register` page + `/api/auth/register` route still exist and write into the legacy `clients` + `client_users` shape that the modern flow doesn't use. Since clients are invite-only in the modern model, `/register` is dead weight + a source of confusion. Delete it.

Bigger sweep — dropping the `clients` / `client_users` / `applications` tables themselves — is OUT OF SCOPE for this brief. Schema-level retirement of legacy tables is its own brief (FK cascades, audit history, RLS policies, etc.). This brief only touches the front-door surfaces.

## Batch 1 — Delete `/register` UI + API + the login link

### Files to delete

- `src/app/(auth)/register/page.tsx`
- `src/app/api/auth/register/route.ts`

### Files to edit

**`src/app/(auth)/login/page.tsx`** — remove the "Don't have an account? Register" block at the bottom of the form. Specifically delete lines that look like:

```tsx
<p className="mt-6 text-center text-sm text-gray-600">
  Don&apos;t have an account?{" "}
  <Link href="/register" className="text-brand-navy font-medium underline-offset-4 hover:underline">
    Register
  </Link>
</p>
```

After deletion, also remove the `Link` import from `next/link` IF it's no longer used anywhere else in that file (verify with a quick grep on the file).

**`src/lib/portal-name.ts`** — line 6 has a comment that lists "register" as one of the auth pages. Update the comment to say `Auth pages (login / set-password)` instead.

### Verification (Batch 1)

```bash
# Confirm no stale references to /register or /api/auth/register
grep -rn "/register\|/api/auth/register" src/ --include="*.tsx" --include="*.ts" tests/
# Expected: zero hits

# Build must pass clean
npm run build

# Lint must pass clean
npm run lint
```

Also confirm:
- `src/app/(auth)/` still has the `login/` directory and nothing else dangling
- The `(auth)` route group folder itself can stay (it's a route-grouping convention, no URL impact)

### Commit message (Batch 1)

```
chore: remove /register page + API (invite-only model)

The client onboarding flow is admin-driven and invite-only: admin
creates a service, attaches client_profiles as Directors/Shareholders/
UBOs, and sends each profile a magic-link KYC invite. The recipient
sets a password at /auth/set-password and is then logged in. /register
was the legacy self-signup path that wrote into clients + client_users,
which the modern model no longer routes through.

Removes:
- src/app/(auth)/register/page.tsx
- src/app/api/auth/register/route.ts
- "Don't have an account? Register" link on /login
- "register" mention in src/lib/portal-name.ts comment
```

## Batch 2 — Rewrite CLAUDE.md Data Model + Admin Setup sections

### Section: Data Model

**Current (stale) content** (`CLAUDE.md`, under `## Data Model (important — read before touching queries)`):

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

…and the paragraphs under it about `profiles.role` and "Applications belong to the company" and `client_account_managers`.

**Replace with:**

```
## Data Model (important — read before touching queries)

The data model is services-first. A `service` is the unit of work
(one application/onboarding item per service); it has no `client_id`.
People who participate in a service — Directors, Shareholders, UBOs —
are `client_profiles` rows attached via `profile_service_roles`. Auth
is Auth.js / NextAuth Credentials with bcrypt password_hash on `users`
(primary) + `profiles` (legacy compat).

### Modern model (use this for all new work)

```
users                  -- Auth.js identity. Columns: id, tenant_id, email,
                          full_name, password_hash. UNIQUE(tenant_id, email).
profiles               -- LEGACY mirror of users. set-password and the
                          NextAuth provider write to both for backward
                          compat. Not the source of truth.

admin_users            -- portal admins. user_id → users(id) (FK repointed
                          in 20260513014208). Admin role is derived from
                          membership; there is NO `role` column on users.
                          See "Admin role hierarchy" below for planned
                          tiering.

services               -- the unit of work. tenant_id + service_template_id +
                          service_details (JSON) + status + service_number.
                          NO client_id column.
profile_service_roles  -- junction: client_profile ↔ service, with role
                          ('director'|'shareholder'|'ubo'|'other'),
                          can_manage, shareholding_percentage.
client_profiles        -- KYC subjects. record_type='individual'|'organisation'
                          (a corporate director is just a profile with
                          record_type='organisation' and a full_name).
                          One profile can have a `users` row paired by id
                          so it can log in to the client portal.
client_profile_kyc     -- the KYC questionnaire data per profile (one row).
service_substance      -- FSC §3.2/§3.3/§3.4 substance assessment per
                          service (UNIQUE on service_id).
application_section_reviews  -- admin section-review state. Despite the
                          column name, `application_id` now holds either
                          legacy applications.id (1 stale row) or
                          services.id going forward. See tech debt #26.
audit_log              -- automatic via DB triggers on status/document/
                          assessment changes; actor_role derived from
                          admin_users / client_users membership.
```

### Legacy tables (do NOT route new work through these)

- `clients` — the old "company entity" with `company_name`. Still read
  by some admin pages (queue, clients list, breadcrumbs) but no new
  surface should write to it.
- `client_users` — old junction (user ↔ clients with role
  'owner'|'member'). Reads only.
- `applications` — old per-service work-item table. Reads only; the
  modern equivalent is `services`. The `application_section_reviews`
  FK to `applications` was dropped in migration
  `20260506155512_drop_section_reviews_application_fk.sql` so service
  ids can be inserted.

A full retirement of these three tables is tracked as separate tech
debt (see "Legacy clients/applications cleanup" below).

### How users come into the system

The portal is **invite-only**:

1. Admin creates a service in `/admin` from a template.
2. Admin attaches `client_profiles` as Directors / Shareholders /
   UBOs via the Add Director modal on the service detail page.
3. Admin sends a KYC invite to a profile from the service detail
   page. The recipient gets a magic-link email.
4. Recipient clicks the link → lands on `/auth/set-password` →
   bcrypt hash is written to both `users.password_hash` and
   `profiles.password_hash` (for the legacy fallback during auth).
5. They log in at `/login` and see the client portal.

There is no self-registration. The legacy `/register` page + API
were removed in B-126.

### Role resolution

- User has row in `admin_users` (FK → `users.id`) → admin.
- User has a `client_profiles` row paired by id (or a legacy
  `client_users` row) → client.
- Never read `profiles.role` — that column does not exist.

### Admin role hierarchy (planned, see tech debt #2)

Today `admin_users` is flat — every admin can do everything. The
planned hierarchy is Super User > Manager > Officer > Junior
Officer. Keep features role-agnostic for now (don't hard-code
"if super user…" branches), but design new admin surfaces so a
later role-gating layer can be added without restructuring.
```

### Section: Admin Setup

**Current (stale) content** (`CLAUDE.md`, under `## Admin Setup (one-time, already done for Jane Doe)`):

```
1. Create user in Supabase Auth dashboard
2. Run SQL:
```sql
UPDATE profiles SET full_name = 'Jane Doe' WHERE email = 'vanes.vr@gmail.com';
INSERT INTO admin_users (user_id) SELECT id FROM profiles WHERE email = 'vanes.vr@gmail.com';
```
```

**Replace with:**

```
## Admin Setup (manual until /admin/settings/admins ships — tech debt #4)

Auth.js is the auth system (no Supabase Auth dashboard step). Admins
need a row in `public.users` (with bcrypt password_hash) and a row in
`public.admin_users` linking to that user. There's no UI yet, so:

```bash
# 1. Generate a bcrypt hash on the dev machine (cost 12):
node -e "console.log(require('bcryptjs').hashSync('TempPass123!', 12))"
```

```sql
-- 2. In Supabase SQL editor:
WITH new_user AS (
  INSERT INTO public.users (email, full_name, password_hash)
  VALUES ('newadmin@example.com', 'New Admin', '<paste-bcrypt-hash>')
  RETURNING id
)
INSERT INTO public.admin_users (user_id) SELECT id FROM new_user;
```

They log in at `/login` with the temporary password → root redirect
sees the `admin_users` row → lands on `/admin/dashboard`. There's no
self-serve "change password" UI yet; admins set a new password via
another bcrypt SQL update for now.
```

### Section: Known Future Migration

**Current content** (`CLAUDE.md`, under `## Known Future Migration`):

```
**Auth: Supabase Auth must be replaced before production.**
Supabase Auth was used for POC speed only. The production build should use self-hosted auth (Auth.js/NextAuth recommended). The data model, RLS policies, and all UI are unaffected — only `src/lib/supabase/client.ts`, `server.ts`, the login/register pages, and middleware need to change.
```

**Replace with:**

```
## Known Future Migrations

- **Legacy clients/applications cleanup** — `clients`, `client_users`,
  and `applications` are no longer the source of truth for new work
  but still get read by some admin pages and the AI verification
  context lookup. Retire them by porting every remaining reader to
  the services-first model, then dropping the tables in a single
  migration (FK cascades + audit-log entity_type backfill required).
  Tracked separately.

- **Admin role hierarchy** — see tech debt #2. Today every admin can
  do everything; the planned tiering is Super User > Manager >
  Officer > Junior Officer with a `/admin/settings/admins` invite UI
  (also tech debt #4).
```

(The "Supabase Auth must be replaced" paragraph is removed — Auth.js
landed in B-098 and admin_users FK was repointed to `users` in
20260513014208.)

### Verification (Batch 2)

After the rewrite, eyeball CLAUDE.md and confirm:

- No remaining references to "Supabase Auth dashboard"
- No remaining references to `clients.company_name` as the canonical
  account label
- No remaining references to `applications.client_id` outside the
  "Legacy tables" subsection
- The Data Model section opens with "services-first" framing

No automated check — this is documentation.

### Commit message (Batch 2)

```
docs: rewrite CLAUDE.md data model + admin setup for services-first

The Data Model section described the legacy auth.users → profiles
→ client_users → clients → applications path. The current model is
services-first: services has no client_id, client_profiles holds
KYC subjects, clients are invite-only. Replaced the section so
future sessions don't repeat the misdiagnosis.

Also updated:
- Admin Setup: replaced Supabase Auth dashboard step with the
  bcrypt + INSERT INTO users + admin_users SQL.
- Known Future Migration: removed the obsolete Supabase Auth
  paragraph (Auth.js landed in B-098); added a placeholder for
  the legacy clients/applications sweep.
- Resolves tech debt #13 ("CLAUDE.md partially outdated").
```

## Batch 3 — Tech debt log updates

In `CHANGES.md`'s Tech Debt Tracker:

**Move #13 to Resolved** with date 2026-05-18 and note:
> CLAUDE.md Data Model + Admin Setup + Known Future Migration sections rewritten in B-126 to reflect services-first model (no Supabase Auth, services has no client_id, client_profiles for KYC subjects, invite-only flow).

**Add a new Open entry** at the next available number:
> **Legacy clients/applications cleanup** | Medium | `clients`, `client_users`, and `applications` are read by ~25 admin surfaces (queue, clients list, applications detail header, breadcrumbs on `/admin/clients/[id]/*`, AI verification context, audit-log writes) but no new work routes through them. Retire by porting every reader to the services-first model, then dropping the tables in one migration with FK cascades + audit_log entity_type backfill. Estimate: 2-3 days; needs a dedicated brief and a feature flag rollout.

In `docs/tech-debt.md`:

Per CLAUDE.md, that file is the canonical newest-at-top log. Add a
matching entry at the top:

> **2026-05-18 — Legacy clients/applications cleanup (Medium).** See above. Spawned by B-126.

And add a strike-through note for #13 since it's resolved:

> ~~CLAUDE.md is partially outdated~~ (resolved B-126 2026-05-18)

## Batch 4 — CHANGES.md entry

Add a new entry at the top under the existing "## B-126" header (or
create the header if not present). Follow the format the other
batches use. Include:

- One-line title: "Cleanup: remove /register + rewrite CLAUDE.md data model"
- Date: 2026-05-18
- Two sub-entries (Batch 1 + Batch 2) describing what was done

## End-of-brief checklist (CLI)

Per CLAUDE.md "Git Workflow Rule" + "Database Migration Workflow"
(no migrations in this brief, so steps 3-6 N/A):

1. `git status` — confirm all changes are staged before commit.
2. **No `git add .`** — stage by filename. Specifically NOT staging
   `.env.local`, `supabase/.temp/`, or anything in `node_modules/`.
3. Commit each batch separately so the history reads clean:
   - Batch 1 commit: register cleanup
   - Batch 2 commit: CLAUDE.md rewrite
   - Batch 3 commit: tech debt log updates
   - Batch 4 can be folded into Batch 2 OR its own commit.
4. `git push origin main` after each batch.
5. `git status` after the final push — must say "nothing to commit,
   working tree clean".
6. End-of-brief dev server restart (CLI owns this per memory):
   `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev` from
   `/Users/elaris/Documents/Claude_webapp_client_onboarding` (main
   project dir, NOT the worktree — `.env.local` only lives at main).

## Out of scope (do NOT do in this brief)

- Dropping the `clients` / `client_users` / `applications` tables.
- Building the `/admin/settings/admins` invite UI.
- Adding the admin role hierarchy (super user / manager / officer).
- Touching the auth provider config (`src/lib/auth.ts`).
- Migrating the AI verification context away from `clients.company_name`.

Each of those is a separate brief.
