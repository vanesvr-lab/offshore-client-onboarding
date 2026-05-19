# B-127 — Admin role hierarchy + `/admin/settings/admins` invite UI

## Why

Today every admin in `admin_users` can do everything (tech debt #2). The plan is a **five-role hierarchy** with **per-role configurable permission flags** so Vanessa can adjust the matrix without code changes. Roles are: **Super User**, **Manager**, **Officer**, **Junior Officer**, **Auditor**. Every existing admin (today: ~3 rows) becomes a Super User on backfill so nobody loses access.

Vanessa's model after the 2026-05-18 design conversation: roles are toggle-bundles over **10 permission flags** that can be edited per role from `/admin/settings/admins`. The 10 flags are:

| # | Flag | Type | Description |
|---|------|------|-------------|
| 1 | `settings_access` | bool | Can open `/admin/settings/*` (templates, rules, workflow, admins page itself). |
| 2 | `admin_mgmt_access` | bool | Can see `/admin/settings/admins` and invite / change role / remove other admins. |
| 3 | `data_access` | enum `'none'\|'view'\|'edit'` | Tri-state: `none` = no read of services/clients/KYC, `view` = read-only, `edit` = full CRUD on service/KYC/director/document fields. |
| 4 | `change_status` | bool | Can **propose** a service status change (initiate the workflow advance). Without `approve_status_change`, the change is queued/draft and awaits an approver. |
| 5 | `approve_status_change` | bool | Can **commit** a status transition. Separation-of-duties: a role with `change_status` only can flag "ready for approval"; an `approve_status_change` role signs off. A role with both can do it in one step. |
| 6 | `send_communications` | bool | Can send KYC invites, client invites, and Communications-dialog messages (any external email). |
| 7 | `destructive_actions` | bool | Can soft-delete clients / services / profiles. Default: Super User only. |
| 8 | `view_audit_log` | bool | Can view the `audit_log` (the Audit Trail card on service pages + any future audit views). |
| 9 | `export_data` | bool | Can export CSVs / reports / anything that pulls data out (Audit Trail CSV button, future report exports). |
| 10 | `can_review` | bool | Can sign off on someone else's work — Mark Section Reviewed, approve a Peer/Manager Review Request, Substance assessment commit. When false, those buttons render disabled with a tooltip explaining the missing permission. **There is no separate "drafts" workflow** — the existing per-section review state IS the review mechanism. |

**Default seeded values per role** (Vanessa can adjust in the UI post-deploy):

| Flag | Super User | Manager | Officer | Junior Officer | Auditor |
|------|-----------|---------|---------|----------------|---------|
| `settings_access` | ✓ | — | — | — | — |
| `admin_mgmt_access` | ✓ | — | — | — | — |
| `data_access` | edit | edit | edit | view | view |
| `change_status` | ✓ | ✓ | ✓ | — | — |
| `approve_status_change` | ✓ | ✓ | — | — | — |
| `send_communications` | ✓ | ✓ | ✓ | — | — |
| `destructive_actions` | ✓ | — | — | — | — |
| `view_audit_log` | ✓ | ✓ | ✓ | ✓ | ✓ |
| `export_data` | ✓ | ✓ | — | — | ✓ |
| `can_review` | ✓ | ✓ | — | — | — |

The defining bits for **Auditor**: `data_access = view` + `view_audit_log` + `export_data` (auditors need to take evidence out as CSV for their reports) — every other flag off. Distinct from Junior Officer (which has `view_audit_log` but NOT `export_data`).

Magic-link invites only (no temp-password path) — same JWT pattern as `/api/admin/clients/[id]/send-invite` (JWT with `purpose: "admin_invite"`, 24h expiry, recipient lands on `/auth/set-password`).

## Out of scope (do NOT do in B-127)

- Fine-grained gating on every admin surface — B-127 wires only the **highest-leverage** gates (settings menu, admin mgmt page, destructive buttons, approve-status button, and section-review buttons via `can_review`). A sweep across the remaining ~20 admin surfaces is B-128.
- Per-user permission overrides (today every Officer has the same 10 flags). If we later want "this specific Officer can also export", that's a new `admin_user_permission_overrides` table — separate brief.
- Renaming or deleting system roles (the 5 seeded roles are `is_system = true` and locked from rename/delete in the UI — but their **permission toggles** are freely editable).
- Creating custom roles beyond the 5 seeds (UI for "+ New role" is deferred; the five defaults are fixed in B-127).
- A separate drafts/approver-inbox infrastructure — explicitly deferred per the 2026-05-18 conversation. The section-review state we already have IS the review workflow; `can_review` simply greys out the existing Mark Reviewed / Approve buttons when off.

---

## Batch 1 — Schema + seed + backfill

### Migration: `<timestamp>_admin_role_hierarchy.sql`

Use `npx supabase migration new admin_role_hierarchy` to generate the timestamp. The SQL:

```sql
-- B-127 — Admin role hierarchy with 10 configurable permission flags.
-- Five system roles seeded: Super User, Manager, Officer, Junior Officer,
-- Auditor. Every existing admin_users row is backfilled to Super User so
-- nobody loses access; Vanessa can demote via the UI afterwards.

CREATE TABLE IF NOT EXISTS public.admin_roles (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
                             REFERENCES public.tenants(id),
  name                     text NOT NULL,
  slug                     text NOT NULL,
  is_system                boolean NOT NULL DEFAULT false,

  -- 10 permission flags (see brief for semantics)
  settings_access          boolean NOT NULL DEFAULT false,
  admin_mgmt_access        boolean NOT NULL DEFAULT false,
  data_access              text NOT NULL DEFAULT 'none'
                             CHECK (data_access IN ('none','view','edit')),
  change_status            boolean NOT NULL DEFAULT false,
  approve_status_change    boolean NOT NULL DEFAULT false,
  send_communications      boolean NOT NULL DEFAULT false,
  destructive_actions      boolean NOT NULL DEFAULT false,
  view_audit_log           boolean NOT NULL DEFAULT false,
  export_data              boolean NOT NULL DEFAULT false,
  can_review               boolean NOT NULL DEFAULT false,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS admin_roles_tenant_idx ON public.admin_roles(tenant_id);

-- Seed 5 system roles with Vanessa-approved defaults
INSERT INTO public.admin_roles (
  name, slug, is_system,
  settings_access, admin_mgmt_access, data_access,
  change_status, approve_status_change, send_communications,
  destructive_actions, view_audit_log, export_data,
  can_review
) VALUES
  ('Super User',     'super_user',     true,  true,  true,  'edit', true,  true,  true,  true,  true,  true,  true),
  ('Manager',        'manager',        true,  false, false, 'edit', true,  true,  true,  false, true,  true,  true),
  ('Officer',        'officer',        true,  false, false, 'edit', true,  false, true,  false, true,  false, false),
  ('Junior Officer', 'junior_officer', true,  false, false, 'view', false, false, false, false, true,  false, false),
  ('Auditor',        'auditor',        true,  false, false, 'view', false, false, false, false, true,  true,  false)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- Add role_id FK to admin_users (nullable for now; backfilled below,
-- then we add NOT NULL in a follow-up batch once the app code is live)
ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.admin_roles(id);

CREATE INDEX IF NOT EXISTS admin_users_role_idx ON public.admin_users(role_id);

-- Backfill: every existing admin gets Super User
UPDATE public.admin_users
SET role_id = (SELECT id FROM public.admin_roles WHERE slug = 'super_user' LIMIT 1)
WHERE role_id IS NULL;

-- RLS — admin-only read/write on admin_roles (mirrors admin_users policy)
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'admin_roles' AND policyname = 'admin_roles_admin_all'
  ) THEN
    CREATE POLICY "admin_roles_admin_all" ON public.admin_roles
      FOR ALL USING (public.is_admin());
  END IF;
END$$;

-- Audit-log trigger for permission changes
CREATE OR REPLACE FUNCTION public.log_admin_role_change() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.audit_log (
    actor_id, actor_role, action, entity_type, entity_id,
    previous_value, new_value
  ) VALUES (
    auth.uid(),
    'admin',
    'admin_role_permissions_changed',
    'admin_role',
    NEW.id,
    to_jsonb(OLD),
    to_jsonb(NEW)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS admin_role_change_audit ON public.admin_roles;
CREATE TRIGGER admin_role_change_audit
  AFTER UPDATE ON public.admin_roles
  FOR EACH ROW EXECUTE FUNCTION public.log_admin_role_change();
```

### Migration lifecycle (CLI is responsible for the full cycle)

Per CLAUDE.md "Database Migration Workflow":

1. Write the migration file (above).
2. Commit + push the migration file.
3. `npm run db:push` to apply to prod.
4. `npm run db:status` and confirm Local + Remote pair with no drift.
5. CHANGES.md entry noting the migration filename + that it was pushed.

**If `db:status` shows drift, STOP and document in CHANGES.md before proceeding to Batch 2.**

### Commit message (Batch 1)

```
feat(db): admin_roles table + role_id on admin_users (B-127 schema)

Four-tier admin hierarchy with 11 configurable permission flags
per role. Seeds Super User / Manager / Officer / Junior Officer
with Vanessa-approved defaults; existing admins backfilled to
Super User so nobody loses access. RLS admin-only. Audit trigger
logs every permission change on admin_roles.
```

---

## Batch 2 — Permission resolution + Auth.js session enrichment

### New file: `src/lib/admin-permissions.ts`

```ts
// B-127 — Resolve the active admin's permission set. Cached on the
// NextAuth session so each request doesn't hit the DB; refreshed at
// every login + when /admin/settings/admins makes a permission change.

import type { SupabaseClient } from "@supabase/supabase-js";

export type DataAccess = "none" | "view" | "edit";

export type PermissionFlag =
  | "settings_access"
  | "admin_mgmt_access"
  | "change_status"
  | "approve_status_change"
  | "send_communications"
  | "destructive_actions"
  | "view_audit_log"
  | "export_data"
  | "can_review";

export interface AdminPermissions {
  role_id: string;
  role_name: string;
  role_slug: string;
  data_access: DataAccess;
  settings_access: boolean;
  admin_mgmt_access: boolean;
  change_status: boolean;
  approve_status_change: boolean;
  send_communications: boolean;
  destructive_actions: boolean;
  view_audit_log: boolean;
  export_data: boolean;
  can_review: boolean;
}

export async function loadAdminPermissions(
  supabase: SupabaseClient,
  userId: string
): Promise<AdminPermissions | null> {
  const { data, error } = await supabase
    .from("admin_users")
    .select("admin_roles!inner(id, name, slug, data_access, settings_access, admin_mgmt_access, change_status, approve_status_change, send_communications, destructive_actions, view_audit_log, export_data, can_review)")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  const role = (data as unknown as { admin_roles: AdminPermissions & { id: string } }).admin_roles;
  return { ...role, role_id: role.id, role_name: role.name, role_slug: role.slug };
}

export function hasFlag(
  perms: AdminPermissions | null | undefined,
  flag: PermissionFlag
): boolean {
  return !!perms?.[flag];
}

export function hasDataAccess(
  perms: AdminPermissions | null | undefined,
  level: DataAccess
): boolean {
  if (!perms) return false;
  if (level === "none") return true;
  if (level === "view") return perms.data_access === "view" || perms.data_access === "edit";
  return perms.data_access === "edit";
}
```

### Update: `src/lib/auth.ts`

Extend the NextAuth `session` callback to attach `session.user.adminPermissions` (use the helper above). Only fetch when the user has an `admin_users` row — for client users, leave `adminPermissions = null`.

Also extend the JWT callback to cache the permissions on the JWT (refresh on login). The session shape becomes:

```ts
session.user = {
  id: string;
  email: string;
  name: string | null;
  role: "admin" | "client";
  adminPermissions: AdminPermissions | null;  // NEW
}
```

### Update: `src/types/next-auth.d.ts` (or wherever the session is typed)

Add `adminPermissions: AdminPermissions | null` to the `Session["user"]` type.

### Verification (Batch 2)

```bash
npm run build  # type check passes
```

Manually log in as Vanessa (an existing admin → Super User after backfill) → inspect the session via `await auth()` in any route → confirm `session.user.adminPermissions.role_slug === "super_user"` and all 11 flags resolve.

### Commit message (Batch 2)

```
feat: load admin permissions onto the NextAuth session (B-127)

New src/lib/admin-permissions.ts resolves the admin's role and
10 permission flags from admin_users → admin_roles. The NextAuth
session + JWT callbacks attach session.user.adminPermissions so
every server route + RSC has access without a per-request DB
hit. Client users get adminPermissions = null.
```

---

## Batch 3 — `/admin/settings/admins` page + admin invite API

### New page: `src/app/(admin)/admin/settings/admins/page.tsx`

Server component. Loads:
- Every row in `admin_users` joined to `users` (name, email, last_login or created_at if no last_login column) and `admin_roles` (name, slug).
- Every row in `admin_roles`.

Route guard: redirect to `/admin/dashboard` if `!session.user.adminPermissions?.admin_mgmt_access`.

Renders three sections (matches Vanessa's mental model):

#### Section 1 — Admins list (table)

| Name | Email | Role | Status | Actions |
|------|-------|------|--------|---------|
| Vanessa Rangasamy | vanes.vr@gmail.com | Super User | Active | [Edit role ▼] [Remove] |

- **Edit role** dropdown — Super User / Manager / Officer / Junior Officer. On change, PATCH `/api/admin/admins/[id]` `{ role_slug }`. Optimistic update; toast on success/error.
- **Remove** button — confirmation dialog (`"This admin will lose all portal access. Continue?"`). DELETE `/api/admin/admins/[id]`. Self-protection guards in the API.
- **Status** — "Active" if the user has set their password (i.e. `users.password_hash IS NOT NULL`), else "Invited" with an option to resend the invite.

#### Section 2 — Invite admin (button + modal)

Button "+ Invite admin" → modal:

- Name (required)
- Email (required, unique-on-tenant_id)
- Role (select, default: Officer)
- Send → POST `/api/admin/admins` `{ name, email, role_slug }`.

API flow:
1. Validate caller has `admin_mgmt_access`.
2. Look up or create the `users` row (insert if `(tenant_id, email)` doesn't exist, with `password_hash = null`). Also mirror into `profiles` for legacy compat.
3. Insert `admin_users` row with `role_id = (SELECT id FROM admin_roles WHERE slug = role_slug)`.
4. Sign a JWT (`purpose: "admin_invite"`, `sub: user_id`, `email`, 24h expiry) — reuse the pattern from `src/app/api/admin/clients/[id]/send-invite/route.ts`.
5. Send invite email via Resend with link to `/auth/set-password?token=...`. Subject: "You've been invited to the GWMS admin portal".
6. Audit-log entry: `action: "admin_invited"`, `entity_type: "admin_user"`, `entity_id: <user_id>`, `new_value: { role_slug, email }`.

#### Section 3 — Role editor (collapsible card per role)

Five cards (Super User / Manager / Officer / Junior Officer / Auditor). Each card shows the 9 boolean flags + the tri-state `data_access` (10 total). Toggling a flag → PATCH `/api/admin/admin-roles/[slug]` `{ flag: value }`. Optimistic update; toast.

Notes:
- All five cards are editable (system roles are NOT locked from permission edits — only from rename/delete).
- Super User card: keep `admin_mgmt_access` greyed out and locked **on** (otherwise the last Super User could lock everyone out of admin mgmt). Inline note: "This permission cannot be disabled on the Super User role."
- A confirmation dialog appears when disabling a flag on Super User: "Disabling this on Super User removes it from your apex role. Continue?"
- The role editor renders the four "tiered" roles in privilege order (Super User → Manager → Officer → Junior Officer), then Auditor as a separate "External" card at the bottom — visually distinct since it isn't a tier above/below the others, it's a read-only-with-export lane for compliance auditors.

### New API routes

- **`POST /api/admin/admins`** — invite. Body: `{ name, email, role_slug }`. Sends magic-link email. Returns the new admin row.
- **`PATCH /api/admin/admins/[id]`** — change role. Body: `{ role_slug }`. Audit-log entry. Self-protection: cannot demote last Super User.
- **`DELETE /api/admin/admins/[id]`** — remove admin. Self-protection: cannot delete self; cannot delete last Super User. Soft-delete only (set `admin_users.deleted_at` if column exists, else just delete the `admin_users` row — keeps the `users` + `profiles` rows so audit history points back to a name).
- **`POST /api/admin/admins/[id]/resend-invite`** — resend the magic-link if the recipient hasn't set their password yet.
- **`PATCH /api/admin/admin-roles/[slug]`** — toggle a permission flag on a role. Body: partial — any subset of the 11 columns. Validate caller has `admin_mgmt_access`. Audit-log entry. Locked: cannot disable `admin_mgmt_access` on the `super_user` role.

All routes use `createAdminClient()` (service-role) and validate the session admin's `admin_mgmt_access` flag before touching anything.

### Sidebar nav

Add a "Admins" entry under `/admin/settings/*` in the sidebar (next to Templates / Rules / Workflow), gated on `admin_mgmt_access`.

### Verification (Batch 3)

```bash
npm run build
npm run lint
```

Manual:
1. Log in as Vanessa (Super User). Visit `/admin/settings/admins`. All 3 sections render.
2. Invite a test admin (e.g. `testadmin@example.com`, role: Officer). Check Resend dashboard for the email; click the link; set password; log in; verify they see admin pages but no `/admin/settings/admins` link.
3. Toggle a permission on Manager role. Check audit_log for the entry.
4. Try to demote yourself from Super User: should be blocked if you'd be the last one.

### Commit message (Batch 3)

```
feat: /admin/settings/admins page + invite API (B-127)

Super-user-gated page with three sections: admins list (role edit
+ remove), invite modal (magic-link via JWT), role editor (toggle
10 permissions per role, 5 cards: Super User / Manager / Officer /
Junior Officer / Auditor). Five new API routes under
/api/admin/admins/* and /api/admin/admin-roles/*. Self-protection
prevents demoting/removing the last Super User and disabling
admin_mgmt_access on the Super User role.
```

---

## Batch 4 — Coarse gating across the highest-leverage surfaces

Wire the four most consequential permission checks. Fine-grained gating on every admin surface is OUT OF SCOPE (deferred to B-128).

### 4a — `/admin/settings/*` gated on `settings_access`

In `src/app/(admin)/admin/settings/layout.tsx` (or wherever the settings group's layout lives), redirect to `/admin/dashboard` if `!session.user.adminPermissions?.settings_access`. Also hide the "Settings" item from the admin sidebar nav when the flag is off.

### 4b — `/admin/settings/admins` gated on `admin_mgmt_access`

Already done in Batch 3 (route guard + sidebar nav). Double-check this lives in both the page and the layout so deep-linking doesn't bypass.

### 4c — Status-change buttons gated

In `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`, find the "Move forward" + "Override" status buttons (B-093 / B-121 right-rail Status Change card). Gate as:

- **Move forward** button: visible+clickable if `change_status` AND `approve_status_change` are both true. Visible-but-disabled with a tooltip ("Awaiting approver — your role can propose but not commit") if `change_status` is true but `approve_status_change` is false. Hidden entirely if `change_status` is false.
- **Override** dropdown: visible if `approve_status_change` is true.

The status-change API route (`/api/admin/services/[id]/status` or similar — CLI to locate via grep) gets a server-side check: `change_status` AND `approve_status_change` for forward (one-step commit by an approver-role), `approve_status_change` for override. Return 403 on mismatch.

Note: in B-127 there is no "proposed but not yet committed" intermediate state — `change_status`-without-`approve_status_change` just means the button is visible but disabled (a hint that the role exists to propose, but actual commit needs an approver to perform it directly). The separation-of-duties workflow that turns proposals into a queue for approvers is deferred (and may not be needed if a `can_review`-style follow-up handles it).

### 4d — Destructive buttons gated on `destructive_actions`

Find the soft-delete / delete affordances:
- Client delete button on `/admin/clients/[id]` (calls `/api/admin/clients/[id]/delete`).
- Any service delete / archive button (CLI to grep for `is_deleted` + `soft-delete` in the admin UI tree).
- Profile remove button in `ServiceDetailClient`.

Hide UI when `destructive_actions` is false; return 403 from the corresponding API routes.

### 4e — Review buttons gated on `can_review`

This is the gating Vanessa specifically called out — the existing per-section / per-request review affordances should grey out when the actor's role doesn't have `can_review`. Specifically:

- **Mark Section Reviewed** (the `SectionReviewButton` / `SectionReviewPanel` component on the service detail page). Render disabled with tooltip "Your role can't sign off on reviews" when `can_review` is false. The corresponding API route (likely `/api/admin/applications/[id]/section-reviews` per tech debt #26) gates the commit on `can_review`.
- **Peer/Manager Review Request — Mark as Reviewed** button in `ReviewRequestBanner` and the eye-icon detail modal in `ReviewRequestsCard`. Render disabled when `can_review` is false. The close-with-`reviewer_marked` API route gates on `can_review`.
- **Substance Assessment — Save** (`SubstanceReviewForm`'s bottom Save button when `admin_assessment` is being set to pass/review/fail). Render disabled when `can_review` is false. The PUT route at `/api/admin/services/[id]/substance` checks `can_review` if the patch contains `admin_assessment`.

These are the surfaces that already implement the review concept; no new UI is needed — just the disabled state + tooltip + server-side 403. Saving an edit that does NOT include a review assessment (e.g. a Yes/No autosave on a substance criterion) is plain `data_access = edit` work, not a review — no `can_review` check.

### Verification (Batch 4)

```bash
npm run build
npm run lint
```

Manual (test as a different role at each step — easiest path: edit `admin_users.role_id` directly in SQL editor to swap your own session role, then log out and back in):

1. **Junior Officer.** Confirm:
   - No "Settings" item in sidebar.
   - No "Admins" page accessible (deep-link to `/admin/settings/admins` → redirected).
   - Move forward + Override buttons hidden on `/services/[id]` (`change_status` is false).
   - Delete buttons hidden on `/admin/clients/[id]`.
   - Mark Section Reviewed + Mark as Reviewed + Substance Save buttons disabled with tooltip.
   - Substance criterion Yes/No autosave still works (it's `data_access = view`, so actually it SHOULD be disabled too — confirm view-only behaves correctly).
2. **Officer.** Confirm:
   - No "Settings" item.
   - "Move forward" visible but disabled with tooltip "Awaiting approver — your role can propose but not commit" (`change_status` true, `approve_status_change` false).
   - Section Reviewed / Substance assessment Save buttons disabled (no `can_review`).
   - Substance criterion Yes/No autosave still works (has `data_access = edit`).
3. **Manager.** Confirm:
   - "Move forward" + "Override" both clickable.
   - No "Settings" or "Admins" items.
   - Section Reviewed + Substance Save fully active (`can_review` true).
   - Delete buttons hidden (`destructive_actions` false by default).
4. **Auditor.** Confirm:
   - All Service / Client / KYC pages render in read-only mode (no edit affordances, no save buttons).
   - Audit Trail card on `/services/[id]` is fully visible.
   - CSV export button on Audit Trail card works (`export_data` true).
   - No Settings / Admins / Move forward / Delete / Review buttons visible anywhere.
5. **Super User.** Confirm everything is available.

### Commit message (Batch 4)

```
feat: coarse permission gating across admin surfaces (B-127)

Five highest-leverage checks wired:
- /admin/settings/* gated on settings_access
- /admin/settings/admins on admin_mgmt_access (double check at
  layout level)
- Move-forward / Override on change_status + approve_status_change
- Destructive (delete client/service/profile) on destructive_actions
- Mark Section Reviewed / Mark as Reviewed / Substance Assessment
  Save on can_review (existing review affordances grey out when
  the role can't sign off)

Each gate enforced at both UI (hide/disable) and API (403). Fine-
grained gating across the remaining ~20 admin surfaces is deferred
to B-128.
```

---

## Batch 5 — Self-protection + edge cases

Add the guards explicitly in the API layer so the UI gates can't be bypassed via direct API call:

1. **`PATCH /api/admin/admins/[id]` (change role):**
   - Reject if target is the last Super User and new role is anything else. Return 400 `{ error: "Cannot demote the last Super User." }`.
   - Reject if target is the caller AND caller's `admin_mgmt_access` would be lost. Return 400 `{ error: "You cannot remove your own admin management access. Ask another Super User to do it." }`.

2. **`DELETE /api/admin/admins/[id]`:**
   - Reject if target is the caller. Return 400 `{ error: "You cannot remove your own admin account. Ask another Super User." }`.
   - Reject if target is the last Super User. Same message as above.

3. **`PATCH /api/admin/admin-roles/[slug]`:**
   - Reject if slug is `super_user` AND the body sets `admin_mgmt_access: false`. Return 400 `{ error: "admin_mgmt_access cannot be disabled on the Super User role." }`.

4. **Migration re-run safety:**
   - The Batch 1 seed uses `ON CONFLICT (tenant_id, slug) DO NOTHING` — running it again will NOT reset Vanessa's role tweaks. Verified by inspection.

### Verification (Batch 5)

Hit each API directly with `curl` (or via the UI) as a Super User and confirm the 400s fire on the protected paths.

### Commit message (Batch 5)

```
feat: self-protection on admin role/delete APIs (B-127)

Five guards prevent admin lockout via the API:
- can't demote last Super User
- can't delete last Super User
- can't delete self
- can't strip own admin_mgmt_access
- can't disable admin_mgmt_access on the Super User role
```

---

## Batch 6 — CHANGES.md + tech debt + dev-server restart

### CHANGES.md

Add a top-of-file entry under `## B-127 — Admin role hierarchy + /admin/settings/admins (done YYYY-MM-DD)`. Include one sub-entry per batch (1-5).

### Tech debt log

In the CHANGES.md Tech Debt Tracker and in `docs/tech-debt.md`:

- **Move #2 to Resolved** with date and note: "B-127 introduced five system roles (Super User / Manager / Officer / Junior Officer / Auditor) with 10 configurable permission flags. Coarse gating wired (settings, admin mgmt, status change, destructive, review buttons). Fine-grained gating across the remaining admin surfaces is deferred to B-128."
- **Move #4 to Resolved**: "B-127 ships `/admin/settings/admins` with magic-link invite + role assignment + remove + per-role permission editor. The page is gated on the `admin_mgmt_access` flag."
- **Add new Open entry**: "Fine-grained role gating sweep — B-127 wired the 5 highest-leverage gates but the remaining ~20 admin surfaces (KYC editing, communications dialog send button, edit affordances on the clients list, etc.) still grant unconditional access where they should check the matching flag. Walk every `/admin/*` page + `/api/admin/*` route and wire the matching permission check. Estimate: 1-2 days; new brief B-128."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding` (main project dir, NOT the worktree — `.env.local` only lives at main):

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

### Commit message (Batch 6)

```
docs: CHANGES.md + tech debt updates for B-127

Tech debt #2 + #4 resolved. New open item: B-128 fine-grained
gating sweep across the remaining ~20 admin surfaces.
```

---

## End-of-brief checklist (CLI)

Per CLAUDE.md "Git Workflow Rule" + "Database Migration Workflow":

1. **Migration lifecycle (Batch 1 only):**
   - Write the migration file.
   - `git add` + commit + push.
   - `npm run db:push` to apply to prod.
   - `npm run db:status` and confirm every migration shows paired Local + Remote with no drift.
   - If drift → STOP and document in CHANGES.md before proceeding.

2. **Per-batch commits:** stage by filename (NEVER `git add .` or `git add -A`). Each batch gets its own commit + push. Six commits total.

3. **End of brief:** `git status` must say "nothing to commit, working tree clean" and "Your branch is up to date with 'origin/main'".

4. **Dev server restart** from main project dir (see Batch 6).

5. **One-line summary to Vanessa** in the chat after the last push (Desktop-side will pick it up via `git log -10`).

## Out-of-scope reminders (don't drift)

- No fine-grained gating on KYC edits, communications send, profile management, etc. — B-128.
- No draft/approval workflow infrastructure (drafts queue + approver inbox) — explicitly dropped in the design conversation per the existing section-review state being sufficient as the review mechanism.
- No per-user permission overrides — separate brief if/when needed.
- No custom roles beyond the 5 seeded — separate brief if/when needed.
- No rename/delete of system roles in the UI (their permission toggles ARE editable; only the name + slug are locked).
