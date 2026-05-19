# B-130 — Services queue modernization + assigned officer + reviews inbox

## Why

Three connected gaps surfaced while preparing the pitch video:

1. **The "Review Queue" page at `/admin/queue` reads from the legacy `applications` table.** New services created through the modern admin-driven flow (B-126 invite-only model) don't appear in it. Today an admin opening the queue sees stale legacy data; their actual day-to-day work lives elsewhere. This is part of tech-debt "Legacy clients/applications cleanup".
2. **No way to see "reviews assigned to me" across services.** Peer/manager review requests today are discoverable only via email + banner on the specific service page. A reviewer handling 10 services has no aggregate view.
3. **No concept of "assigned officer" on a service.** Services drift among admins because nobody owns one. The data model has `client_account_managers` for clients (legacy), but no service-level assignment.

B-130 fixes all three in one pass: migrate the queue to read from `services`, add an `assigned_admin_id` field with assignment UI + filter, add a new `/admin/reviews` page for the reviewer inbox.

## Out of scope (do NOT do in B-130)

- **Full legacy-tables retirement** — B-130 migrates ONE surface (the queue). Other admin pages still reading from `applications` / `clients` (per the tech-debt entry from B-126) stay on the legacy path; a separate sweep brief will handle them.
- **Multi-officer assignment** — one `assigned_admin_id` per service. If GWMS later wants "primary + backup" or "lead + reviewer pair", that's a separate `service_assignments` junction table.
- **Workload balancing UI** — no "show me each officer's queue size and reassign one click" view. Out of scope.
- **Review request creation from the new inbox** — the inbox SHOWS pending reviews; you still create new ones from the per-service right-rail card.
- **Client-portal visibility of assigned officer** — admin-only for now. If clients should see "Your account manager is Sarah" in their portal, that's a small follow-up.

## Permission model (locked per design conversation)

- **Assigning / reassigning an officer:** any admin with `data_access = 'edit'` (i.e. Super User, Manager, Officer by default). Junior Officer + Auditor cannot assign.
- **Reviewing a request from the inbox** ("Mark as reviewed"): existing `can_review` gate (Super User + Manager by default).
- **Seeing the Reviews page:** anyone who's been invited as a reviewer on at least one open request. If you've never been invited, the sidebar item shows but the page is empty. Don't gate the page on a flag.

---

## Batch 1 — Schema: `services.assigned_admin_id` + audit trigger

### Migration: `<timestamp>_services_assigned_admin.sql`

Use `npx supabase migration new services_assigned_admin` to generate the timestamp.

```sql
-- B-130 — Add assigned_admin_id to services so admins can claim
-- ownership of a service. Nullable (services start unassigned).

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS assigned_admin_id uuid REFERENCES public.users(id);

CREATE INDEX IF NOT EXISTS services_assigned_admin_idx
  ON public.services(assigned_admin_id);

-- Audit trigger: log every assignment change so we have a paper trail
-- of who handed off what to whom.
CREATE OR REPLACE FUNCTION public.log_service_assignment_change() RETURNS trigger AS $$
BEGIN
  IF OLD.assigned_admin_id IS DISTINCT FROM NEW.assigned_admin_id THEN
    INSERT INTO public.audit_log (
      actor_id, actor_role, action, entity_type, entity_id,
      previous_value, new_value
    ) VALUES (
      auth.uid(),
      'admin',
      'service_assignment_changed',
      'service',
      NEW.id,
      jsonb_build_object('assigned_admin_id', OLD.assigned_admin_id),
      jsonb_build_object('assigned_admin_id', NEW.assigned_admin_id)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS service_assignment_audit ON public.services;
CREATE TRIGGER service_assignment_audit
  AFTER UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.log_service_assignment_change();
```

### Migration lifecycle (CLI is responsible for the full cycle)

Per CLAUDE.md "Database Migration Workflow":

1. Write the migration file.
2. Commit + push the migration file.
3. `npm run db:push` to apply to prod.
4. `npm run db:status` — confirm Local + Remote pair with no drift.
5. CHANGES.md entry noting the migration filename + that it was pushed.

### Verification (Batch 1)

```sql
-- Column exists + index in place
SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='services' AND column_name='assigned_admin_id';
SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='services' AND indexname='services_assigned_admin_idx';

-- Trigger fires (run after Batch 3 wires the API):
UPDATE public.services SET assigned_admin_id = '<some-user-id>' WHERE id = '<some-service-id>';
SELECT action, previous_value, new_value FROM public.audit_log WHERE entity_id = '<some-service-id>' ORDER BY created_at DESC LIMIT 1;
-- Expect: action='service_assignment_changed', previous_value=null, new_value={"assigned_admin_id":"<some-user-id>"}
```

### Commit message (Batch 1)

```
feat(db): services.assigned_admin_id + audit trigger (B-130)

Adds a nullable FK from services.assigned_admin_id to users(id)
so an admin can claim ownership of a service. Audit trigger logs
every assignment change as 'service_assignment_changed' with
before/after admin IDs.
```

---

## Batch 2 — Migrate `/admin/queue` from `applications` to `services`

### Update `src/app/(admin)/admin/queue/page.tsx`

Replace the legacy query:

```ts
// OLD:
const { data: applications } = await supabase
  .from("applications")
  .select("*, clients(company_name), service_templates(name)")
  .eq("is_deleted", false)
  .neq("status", "draft")
  .order("submitted_at", { ascending: false });

// NEW:
const { data: services } = await supabase
  .from("services")
  .select(`
    id,
    service_number,
    status,
    service_details,
    created_at,
    updated_at,
    assigned_admin_id,
    assigned_admin:users!services_assigned_admin_id_fkey(id, full_name, email),
    service_templates(name),
    profile_service_roles!inner(
      client_profile_id,
      can_manage,
      client_profiles(id, full_name, email)
    )
  `)
  .eq("is_deleted", false)
  .neq("status", "draft")
  .order("updated_at", { ascending: false });
```

The `profile_service_roles!inner` join is filtered by the table-level join. After loading, find the "primary" profile (`can_manage = true`, or first one) for each service to display as "Client".

### Update / replace `src/components/admin/ApplicationTable.tsx`

CLI's judgment call: either rename + adapt, or build a new `ServicesTable.tsx` next to it and switch the queue page to use the new one. Recommend **rebuild as `ServicesTable.tsx`** since the prop shape changes significantly (services row != applications row); leave `ApplicationTable.tsx` in place for the few legacy pages that still use it, but mark it `// LEGACY` at the top with a comment pointing to `ServicesTable.tsx`.

`ServicesTable` columns:

| Column | Source | Notes |
|--------|--------|-------|
| Service # | `service_number` | e.g. `GBC-0042`; clickable → `/admin/services/<id>` |
| Client | primary `client_profile.full_name` | fallback to "—" if no primary profile attached |
| Template | `service_templates.name` | e.g. "Global Business Company" |
| Status | `status` | colored badge per stage |
| **Assigned to** | `assigned_admin.full_name` | new in B-130; "—" if unassigned |
| Updated | `updated_at` | relative time ("2h ago"); on hover show full date |

Add search input (filter on service_number / client name / template name client-side).

### Verification (Batch 2)

```bash
npm run build
npm run lint
```

Manual:
1. Open `/admin/queue`. The page now lists rows from `services` instead of `applications`.
2. Each row shows service number, client (primary profile name), template, status, assigned-to (empty for all rows at this point — Batch 3 wires the UI to set it), last-updated time.
3. Click a row → opens the service detail page.
4. Search input filters in-page.
5. Empty state if no services exist.

### Commit message (Batch 2)

```
feat: migrate Queue page to services table (B-130)

/admin/queue now reads from the modern `services` table instead
of the legacy `applications` table. New ServicesTable component
displays service_number, primary client_profile name, template,
status, assigned admin, and last-updated. Legacy
ApplicationTable left in place with a // LEGACY marker; the few
remaining pages that still use it (some clients-list views) are
out of scope and addressed in the legacy-tables sweep brief.
```

---

## Batch 3 — Assignment UI + filter

### A. Assign Officer affordance on the service detail page

On `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`, add an "Assigned to" line in the page header (near the service number + status badge), OR as a small card in the right rail above Status Change. CLI's judgment on placement.

Display:
```
Assigned to: [Sarah Mitchell ▾]
```

The chevron opens a dropdown listing all admins (loaded once at page mount) plus "— Unassigned —". Selecting a value PATCHes the service.

### B. New API: `PATCH /api/admin/services/[id]`

If a PATCH route already exists for services, add `assigned_admin_id` to its allowed-edit fields. Otherwise create a new minimal route.

```ts
// Allowed body keys (only assigned_admin_id for B-130):
{ assigned_admin_id: string | null }
```

Server-side checks:
- Caller's session must have `data_access = 'edit'` (B-127 flag). Return 403 otherwise.
- `assigned_admin_id`, if non-null, must be a user_id present in `admin_users` (you can't assign a service to a non-admin). Return 400 otherwise.

The audit trigger from Batch 1 fires automatically on the UPDATE — no manual `writeAuditLog` call needed in the route.

### C. Filter dropdown + "Assigned to me" quick chip on `/admin/queue`

In the new `ServicesTable` page:

- **Filter: Assigned Officer.** Single-select dropdown of all admin users with a "(unassigned)" option. Default: all. When set, the page query filters `assigned_admin_id = selected || IS NULL`.
- **Quick-filter chip: "Assigned to me".** A toggle button above the table. When on, sets the Assigned Officer filter to the current user's ID. Style as a primary-tinted pill.

Both filters update the URL via search params (`?assigned=<id>` or `?mine=1`) so the state is shareable + survives reloads.

### Verification (Batch 3)

Manual:
1. Service detail page: "Assigned to" line appears with a dropdown. Pick an admin. The page re-fetches; the assigned-to value persists. Audit Trail card shows a `service_assignment_changed` entry.
2. Open `/admin/queue`. Assigned-to column now populates for the service you just assigned. The "Assigned to me" chip — when toggled on — narrows the list to just that service.
3. Filter dropdown: pick a specific admin → list narrows to their services.
4. Permissions: log in as Junior Officer (`data_access = view`). The Assigned-to dropdown on the service page is greyed out with a tooltip. The PATCH API returns 403 if forced.

### Commit message (Batch 3)

```
feat: assignment UI + queue filters (B-130)

Adds:
- "Assigned to" dropdown on service detail page (right rail / header)
- PATCH /api/admin/services/[id] route with allowed-edit allowlist
  containing assigned_admin_id; gated on data_access=edit
- Assigned-officer filter + "Assigned to me" quick-filter chip on
  /admin/queue, with URL-param state preservation

The audit trigger from Batch 1 captures every reassignment.
```

---

## Batch 4 — Multi-select status filter

The existing queue has either no status filter or a single-select dropdown (depending on what's in `ApplicationTable.tsx`). Replace with a multi-select chip-row above the table.

### UI

A row of toggleable status chips:

```
[Start] [KYC Collection] [Review] [Substance] [Approval] [Closed]
```

Each chip toggles inclusion in the filter. Default: all "active" stages selected, "Closed" deselected (matches the existing `neq("status", "draft")` intent — closed services hide unless explicitly requested).

The status set comes from the active workflow stages (CLI: grep for the existing stages list — there's likely a constants file like `src/lib/services/stages.ts` or similar). Mirror those exactly so renaming a stage updates the chips automatically.

### Query

```ts
let query = supabase.from("services").select(...).neq("status", "draft");
if (selectedStatuses.length > 0) {
  query = query.in("status", selectedStatuses);
}
```

URL state: `?status=start,kyc,review` — comma-separated.

### Verification (Batch 4)

Manual: toggle individual chips; confirm the table re-filters on each toggle. Reload — URL state is preserved.

### Commit message (Batch 4)

```
feat: multi-select status filter on queue (B-130)

Chip-row above the services table; each status is a toggleable
filter chip. Default selection excludes "Closed" so the queue
shows active work only. State stored in ?status=... URL param
for shareable views.
```

---

## Batch 5 — New `/admin/reviews` page (reviewer inbox)

### New route: `src/app/(admin)/admin/reviews/page.tsx`

Server component. Query:

```ts
const { data: requests } = await supabase
  .from("review_requests")
  .select(`
    id, service_id, status, note, created_at,
    requester:users!review_requests_requester_id_fkey(id, full_name, email),
    services!inner(id, service_number, service_templates(name)),
    review_request_reviewers!inner(admin_id),
    review_request_sections(section_key, profile_id)
  `)
  .eq("status", "open")
  .eq("review_request_reviewers.admin_id", session.user.id)
  .order("created_at", { ascending: false });
```

(Adjust column / table names to match what B-118 actually shipped; CLI: grep `review_requests` table definition for the exact schema.)

### Page layout

Top: `<h1>Reviews assigned to me</h1>` + count badge.

Table:

| Col | Source | Notes |
|-----|--------|-------|
| Requested by | `requester.full_name` | the admin who created the request |
| Service | `services.service_number` + template name | clickable → `/admin/services/<id>?reviewRequest=<id>` (so the banner highlights on landing) |
| Sections | `review_request_sections` count + first label | tooltip = full list |
| Note (preview) | first 80 chars of `note` | "..." if longer; full note in hover-tooltip |
| Requested | `created_at` relative time | "5h ago" |
| Action | "Mark as reviewed" button | calls `POST /api/admin/services/<service_id>/review-requests/<id>/close` with `{ reason: "reviewer_marked" }` |

Empty state: "You have no pending reviews. Nice."

### Sidebar nav + badge

In `src/components/shared/Sidebar.tsx` (and any other nav files): add a "Reviews" item with `href="/admin/reviews"`. Show a small numeric badge next to the label when count > 0.

The badge count loads server-side at sidebar render. To avoid hammering the DB on every page render: just query the count once per layout render — it's a single indexed count, sub-millisecond.

### Verification (Batch 5)

Manual:
1. As Admin A: open a service, request a peer review on a section, picking Admin B as the reviewer.
2. Log out, log in as Admin B.
3. Sidebar shows "Reviews" with a "1" badge.
4. Click → `/admin/reviews` lists the request: requester = Admin A, service = the right service number, sections = the chosen section, note preview = the first 80 chars.
5. Click the service link → land on `/admin/services/<id>?reviewRequest=<id>` → banner highlights at the top (existing B-118 behavior).
6. Back to `/admin/reviews`, click "Mark as reviewed" inline → row disappears, badge updates to 0, toast confirms.

### Commit message (Batch 5)

```
feat: /admin/reviews — reviewer inbox (B-130)

New page lists every open peer/manager review request where the
current admin is invited as a reviewer. One-click "Mark as
reviewed" inline, or click the service link to land on the
specific service with the existing review banner highlighted.
Sidebar gains a Reviews item with a count badge.
```

---

## Batch 6 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-130 — Services queue modernization + assigned officer + reviews inbox (done YYYY-MM-DD)`. One sub-entry per batch.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Update the "Legacy clients/applications cleanup" entry**: mark `/admin/queue` as migrated (services-first as of B-130). Note that several other admin surfaces still read from `applications` / `clients` (the full sweep is still pending). Estimate remaining: ~10-15 surfaces.
- **Add new Open entry**: "Reviews inbox could surface in dashboard widget — today reviews show in the sidebar badge + dedicated /admin/reviews page. A top-of-dashboard widget would also be useful for admins who land on the dashboard first. ~2-3 hours; new brief when needed."
- **Add new Open entry**: "Assigned officer not visible to clients — admin-only today. If clients should see 'Your account manager is X' in their portal header, add to client-side layout. ~half-day."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **Migration lifecycle (Batch 1):** write, commit + push file, `db:push`, `db:status`, CHANGES.md.
2. **Per-batch commits:** six commits. Stage by filename — never `git add .` or `git add -A`.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No multi-officer-per-service yet.
- No client-portal visibility of assigned officer yet.
- No bulk-reassign UI ("move 20 services from Officer A to Officer B" in one click).
- No reviews dashboard widget (sidebar badge + dedicated page only).
- Full legacy-tables retirement remains pending — B-130 migrates ONE surface (the queue).
