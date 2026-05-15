# B-118 — Peer/Manager Review feature + two hotfixes

## Goal

Two unrelated hotfixes plus one new feature:

1. **Hotfix: `verification_codes.kyc_record_id` NOT NULL** — block on sending KYC invites from the modern `/api/services/[id]/persons/[roleId]/send-invite` route. The column was relaxed manually in Supabase SQL editor; this brief formalizes that with a real migration so it's reproducible.
2. **Hotfix: Communications right-rail freshness** — when an admin sends a communication, the new entry should reflect immediately in the right-rail Communications card without a manual page reload.
3. **Feature: Peer/Manager Review** — a button on the service page opens a modal where an admin selects other admins, the sections to be reviewed, and writes a note. An email goes out to each reviewer with a link back to the service. Reviewers see a sticky top banner with anchor links and a single "Mark as reviewed" button. Requesters see the same request as a card in their right rail. First reviewer to mark closes the request; requester can also force-close. Email notifications on close.

## Context

### Hotfix 1: `verification_codes.kyc_record_id`

`/api/services/[id]/persons/[roleId]/send-invite/route.ts:156-164` is the modern admin-side invite path. It inserts a `verification_codes` row with `client_profile_id` but **no** `kyc_record_id`. The column still carries a `NOT NULL` constraint from the legacy `kyc_records`-based flow, so the insert fails with `null value in column "kyc_record_id" of relation "verification_codes" violates not-null constraint`. Vanessa unblocked herself with `ALTER TABLE verification_codes ALTER COLUMN kyc_record_id DROP NOT NULL;` in the Supabase SQL editor. This brief commits a migration that does the same so the change is tracked in source. This is related to tech debt #28 (legacy `kyc_records`-based routes still in tree); cleanup of the legacy routes is deferred.

### Hotfix 2: Communications right-rail freshness

After sending a communication from the admin services page, the right-rail Communications card doesn't reflect the new entry until the page is reloaded. The likely cause is that the send handler doesn't update local state and doesn't trigger `router.refresh()` — the existing pattern in B-065 (response-based patching + `router.refresh()`) was not applied here. The send endpoint already returns the created row; CLI just needs to splice it into local state and call `router.refresh()` so the server-fetched view re-paints.

### Feature: Peer/Manager Review

Today's admin services page has `application_section_reviews` (B-068/B-073/B-077) for the **responsible officer's own** per-section review status. There is no concept of asking ANOTHER admin to review the work. Vanessa wants supervisor review + team collaboration in a single workflow. Reviewer pool is admins only; section granularity is top-level plus per-profile inside People KYC; status is a single shared `open`/`closed` (first reviewer to mark closes for everyone — if you need parallel accountable reviews, send multiple requests).

## Locked design decisions (from brainstorming)

### Reviewer pool

- `admin_users` only. Multi-select with search and select-all.
- Admin role differentiation (Officer / Manager / Super User / Junior Officer) is planned but not in scope; today all admins are equal. Don't bake assumptions that would block role-based filtering later — e.g., the user-picker query should be a clean "fetch admins from `admin_users` joined to `profiles` for the display name" so a future filter on role slots in without rework.

### Section granularity

- **Top-level**: `company_setup`, `financial`, `banking`, `documents`.
- **People KYC expands per-profile**: one row per `client_profiles.id` belonging to this service (label = profile full_name, sub-label = role). Reviewer drills into subsections (Identity / Address / etc.) naturally once on the service page; per-subsection granularity is intentionally out of scope.
- A request can include zero-or-more top-level sections AND zero-or-more per-profile selections, but must include at least one selection total. There's an implicit "Select all" shortcut in the modal.

### Status model — single shared

- Two states: `open` and `closed`.
- **Any one** invited reviewer marking the request as reviewed closes it for everyone.
- **The requester** can also force-close at any time.
- Close captures `closed_at`, `closed_by_admin_id`, and `closed_reason` (enum: `reviewer_marked` | `requester_force_closed`).
- Closed requests are not re-openable in this scope.

### Multiple concurrent requests

- Allowed per service. Each request operates independently. The right-rail card lists all open requests; the top banner shows the most recent open request assigned to the current viewer (if any).

### Where it lives

- **Right-rail card** (both roles) — a new `ReviewRequestsCard`. For the requester: their own open requests with status + reviewer names. For the reviewer: open requests where they're invited. Closed history collapsed at the bottom.
- **Sticky top banner** (reviewer only, only when there's an open request assigned to them) — full-width banner above the section content, showing requester name + note + anchor links to each section in the request + single primary button **"Mark as reviewed"**. Persistent until reviewer acts or the request closes.
- **Trigger button** — "Request Peer/Manager Review" on the right rail, near the existing action buttons (placement: above the Pending card, below the View Summary button, so it's the second primary action visible when the rail pins).

### Modal fields

- **Reviewers** (multi-select with search + select-all). Excludes the current admin (you can't request review from yourself).
- **Sections** (multi-select). Top-level checkboxes + a People KYC group that expands to per-profile checkboxes. "Review all sections" shortcut.
- **Note** (textarea, required, min 1 char after trim). Reviewer sees this in the email + in the banner + in the right-rail card detail.
- Submit button creates the request and triggers emails atomically.

### Reviewer action affordance

- Single primary button "Mark as reviewed" in the top banner and in the right-rail card.
- No per-section checkboxes. Status is binary at the request level (per the single-shared-status decision).

### Notifications

- **Email only** — no in-app push for this scope.
- **On request creation**: each invited reviewer gets an email with the requester's name, the service number, the section list, the note, and a link to the service page.
- **On request closed by reviewer**: requester gets an email ("{reviewer name} reviewed your request on {service}").
- **On request force-closed by requester**: all invited reviewers get an email ("{requester} closed the review request on {service}").
- All review-request emails are logged via the existing `logCommunication` helper so they appear in the right-rail Communications card. (This also makes Hotfix 2's "freshness" work pay dividends — the review-request emails will appear without reload.)

### Email link target

- All emails link to `/{baseUrl}/admin/services/{serviceId}?reviewRequest={requestId}`. The `reviewRequest` query param is consumed by the page: scrolls/anchors to the top banner, opens any closed-history fold, and (for reviewers) ensures the banner is visible.

### Audit log

- Every state change writes to `audit_log` via `writeAuditLog`:
  - `review_request_created` (actor: requester; entity: `review_request:{id}`; note includes section keys + reviewer list)
  - `review_request_closed` (actor: closer; entity: `review_request:{id}`; note includes `closed_reason`)

## In scope

- Hotfix 1 (verification_codes NOT NULL).
- Hotfix 2 (comm-card freshness).
- All locked design decisions for the review feature.
- Schema migration for the new tables.
- Modal, right-rail card, sticky top banner.
- Email sends via Resend through the existing `logCommunication` integration.
- Audit log writes.
- RLS policies on the new tables (deny-by-default, allow service-role for app server). Match the conventions of `application_section_reviews`.

## Out of scope

- **Re-opening closed requests**. Audit log preserves the close event; if a requester wants more review they create a new request. Add a tech-debt entry pointing at this.
- **Per-section / per-reviewer responses with comments**. Single shared status is the agreed model; comments would expand scope significantly.
- **Due dates and priorities** on the request. Defer until reviewers ask for it.
- **In-app push notifications** beyond the right-rail card (no toasts on stale tabs, no SSE, no badges).
- **Admin role-based filtering of the reviewer pool**. The pool is all `admin_users` today. Role-based filtering ships with the broader role rollout.
- **Re-introducing per-section-per-reviewer accountability** via spawning N requests automatically. If a requester needs independent accountable reviews, they create multiple requests by hand.
- **Cleanup of legacy `kyc_records`-based send-invite route** (`/api/admin/profiles/[id]/send-invite/`). Tracked in tech debt #28.

## Implementation — batched

Each batch ends with: stage specific files (never `git add -A` or `git add .`), commit with a descriptive message (no `B-118` in the commit message), `git push origin HEAD:main` (worktree session — main is the only branch CLI pulls), update `CHANGES.md` with the batch outcome.

### Batch 1 — Hotfixes (verification_codes migration + comm-card freshness)

**Migration:** `supabase/migrations/<timestamp>_verification_codes_kyc_record_id_drop_not_null.sql`:

```sql
-- B-118 — relax legacy NOT NULL so the modern client_profile_id-only
-- insert path in /api/services/[id]/persons/[roleId]/send-invite works.
-- The legacy /api/admin/profiles/[id]/send-invite path still provides
-- a kyc_record_id when invoked, so its behaviour is unchanged.
ALTER TABLE verification_codes ALTER COLUMN kyc_record_id DROP NOT NULL;
```

This SQL is already applied in prod (Vanessa ran it manually). The migration is idempotent — `DROP NOT NULL` on a column that's already nullable is a no-op. Push it anyway so the supabase migration tracker is in sync.

**CLI must run `npm run db:push` and `npm run db:status` after creating the migration.** Confirm Local + Remote pairing on the new row before moving on. Do not defer to Vanessa — migration auto-push is non-negotiable per the project rules.

**Comm-card freshness:** identify the send-communication handler used by the admin services page (likely a `handleSendCommunication` in `ServiceDetailClient.tsx` or a child of the Communications card). After the POST succeeds and the new comm row is returned:

1. Splice the returned row into local state immediately (matches the B-065 pattern).
2. Call `router.refresh()` so the server-rendered view re-paints alongside.
3. Verify by sending a comm and confirming the new entry appears without reload.

If the send endpoint doesn't return the created row, fix the endpoint to return it. Don't add a separate refetch — response-based patching is the established pattern.

### Batch 2 — Review request system: schema, API, modal

**Schema migration:** `supabase/migrations/<timestamp>_review_requests.sql`. Tables:

```sql
CREATE TABLE review_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  service_id    uuid NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  requester_id  uuid NOT NULL,                              -- admin_users.user_id
  note          text NOT NULL,
  status        text NOT NULL CHECK (status IN ('open','closed')) DEFAULT 'open',
  closed_at     timestamptz,
  closed_by     uuid,                                       -- admin_users.user_id
  closed_reason text CHECK (closed_reason IN ('reviewer_marked','requester_force_closed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_review_requests_service ON review_requests (service_id);
CREATE INDEX idx_review_requests_open ON review_requests (service_id) WHERE status = 'open';

CREATE TABLE review_request_reviewers (
  request_id uuid NOT NULL REFERENCES review_requests(id) ON DELETE CASCADE,
  admin_id   uuid NOT NULL,                                 -- admin_users.user_id
  PRIMARY KEY (request_id, admin_id)
);

CREATE TABLE review_request_sections (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id   uuid NOT NULL REFERENCES review_requests(id) ON DELETE CASCADE,
  section_key  text NOT NULL,                               -- 'company_setup' | 'financial' | 'banking' | 'documents' | 'people_kyc_profile'
  profile_id   uuid REFERENCES client_profiles(id) ON DELETE CASCADE -- only when section_key='people_kyc_profile'
);

-- One row per (request, section_key, profile_id) — NULLS NOT DISTINCT so
-- multiple top-level rows for the same request+section_key (profile_id=NULL)
-- are still rejected. Requires Postgres 15+ (Supabase is on 15).
CREATE UNIQUE INDEX uq_review_request_sections_unique
  ON review_request_sections (request_id, section_key, profile_id) NULLS NOT DISTINCT;

ALTER TABLE review_requests          ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_request_reviewers ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_request_sections  ENABLE ROW LEVEL SECURITY;
-- Default-deny RLS (matches application_section_reviews convention).
-- All app reads/writes go through service role via createAdminClient().
```

Run `npm run db:push` + `npm run db:status` and confirm pairing.

**API endpoints** (under `src/app/api/admin/services/[id]/review-requests/`):

- `POST /api/admin/services/[id]/review-requests` — create. Body: `{ reviewerIds: string[], sections: Array<{ section_key, profile_id? }>, note: string }`. Validates at least one reviewer + one section + non-empty note. Inserts the request, reviewers, sections atomically. Sends emails to each reviewer via Resend + `logCommunication`. Writes `audit_log` row `review_request_created`. Returns the full request shape with reviewer names hydrated.
- `GET /api/admin/services/[id]/review-requests` — list. Returns open requests first, then closed (limit 10). Reviewer names hydrated via `admin_users` → `profiles` join.
- `POST /api/admin/services/[id]/review-requests/[requestId]/close` — close. Body: `{ reason: 'reviewer_marked' | 'requester_force_closed' }`. Server enforces: `reviewer_marked` requires the caller to be in `review_request_reviewers`; `requester_force_closed` requires the caller to be the requester. Updates `status='closed'`, `closed_at=now()`, `closed_by=session.user.id`, `closed_reason`. Sends close emails (to requester if reviewer closed; to all reviewers if requester closed). Logs comm + writes audit log.

**Modal component** (`src/components/admin/RequestReviewModal.tsx`):

- Uses existing shadcn `Dialog` primitives.
- Reviewer picker: searchable multi-select. Fetch admin list from `admin_users` joined to `profiles` for `full_name` + `email`. Hide the current user. Select-all toggle.
- Section picker: a flat list of top-level checkboxes (Company Setup / Financial / Banking / Documents) plus a "People KYC" group that expands to per-profile checkboxes (`profiles` already loaded by the parent page). "Select all sections" toggle.
- Note: textarea, required, validation on submit.
- Submit button is disabled until: ≥1 reviewer, ≥1 section, ≥1 char in note (after trim).
- Loading state on submit; success toast; modal closes; parent refreshes via response-based patching + `router.refresh()`.

The modal is opened by a new button "Request Peer/Manager Review" placed in the right rail (see Batch 3 for exact placement).

### Batch 3 — Right-rail card + sticky top banner + email + audit + logging

**Right-rail card** (`src/components/admin/ReviewRequestsCard.tsx`):

- Sits in the right rail, between the View Summary button and the Pending card.
- Header: count of open requests + a "Request Peer/Manager Review" button that opens the modal.
- Body: list of open requests. Each row shows:
  - The requester's name (or "You" if current user is requester) + relative time
  - Reviewer chips (count + names on hover)
  - Section count + tooltip listing the section labels
  - Status pill (`Open`)
  - Action button — for reviewer: "Mark as reviewed"; for requester: "Close" (force-close)
- Click anywhere else on the row → open a detail dialog (note text, full section list with anchor links, close button if permitted, audit timestamps).
- Collapsed "Closed history" fold at the bottom, lazy-renders the last 10 closed requests.

**Sticky top banner** (`src/components/admin/ReviewRequestBanner.tsx`):

- Renders above the section content (inside the left column, above any subsection accordions).
- Only renders when the current user is in `review_request_reviewers` for at least one **open** request on this service.
- If multiple open requests target the current user, show the most recently created one; a "(+N more)" link opens the right-rail card.
- Content: requester name + note (truncated, expandable) + section anchor links + "Mark as reviewed" primary button.
- Dismissible? No. Persistent until closed.
- Anchor links use existing section-id conventions (each section in `ServiceDetailClient` already has scrollable anchors per the step pill + accordion B-099 work).
- Reads the `reviewRequest` query param on mount and scrolls to itself smoothly so email-clicks land cleanly.

**Email templates:**

- `review_request_created` — to each reviewer. Subject: `Review requested: {service_number}`. Body includes requester name, service number, section list, note (formatted as a blockquote), link to `{baseUrl}/admin/services/{serviceId}?reviewRequest={id}`. Match the visual style of existing email templates in `send-invite/route.ts`.
- `review_request_closed_by_reviewer` — to requester. Subject: `{reviewer name} reviewed your request on {service_number}`.
- `review_request_closed_by_requester` — to all reviewers. Subject: `Review request closed on {service_number}`.

Each send call goes through Resend AND `logCommunication` so the entry appears in the right-rail Communications card.

**Audit log writes:**

- On create: `writeAuditLog({ actor: requester, entity_type: 'review_request', entity_id: id, action: 'review_request_created', new_value: { reviewer_ids, section_keys, note_preview } })`.
- On close: `writeAuditLog({ actor: closer, entity_type: 'review_request', entity_id: id, action: 'review_request_closed', new_value: { closed_reason } })`.

**Wiring into the service page** (`ServiceDetailClient.tsx`):

- Fetch review requests in the server component (`page.tsx`) alongside other server-side fetches.
- Pass them to `ServiceDetailClient`.
- Render `<ReviewRequestBanner />` near the top of the left column (above the existing top sticky shell content).
- Render `<ReviewRequestsCard />` in the right rail at the agreed slot.
- On modal submit / close action, splice the response into local state + call `router.refresh()` (mirror Hotfix 2's pattern).

## Database changes

- One DDL migration: `DROP NOT NULL` on `verification_codes.kyc_record_id` (Batch 1).
- One DDL migration: `review_requests`, `review_request_reviewers`, `review_request_sections` + RLS + indexes (Batch 2).

Both pushed by CLI as part of the batches that create them. Confirm via `npm run db:status` after each push.

## Testing

- Unit: API route handlers for the three review-request endpoints (validation, atomic create, RLS enforcement at the route layer, audit-log writes).
- Unit: section-key composition (`section_key='people_kyc_profile'` must have `profile_id`; others must not).
- Integration: full create-then-close flow against a mocked Resend + mocked Supabase.
- Playwright: not required for this brief; the underlying flows are mostly modal + API. Mark as deferred.

## Tech-debt notes

Append to `docs/tech-debt.md` (newest at top) after Batch 3 lands:

- Review-request re-opening is not supported. If reviewers iteratively need re-review, they spawn a new request. Revisit if usage patterns make this awkward.
- Per-reviewer accountability on a single request (each reviewer marks their own) is intentionally out of scope. Single-shared-status is the agreed POC pattern. When admin roles ship, revisit whether Manager vs Junior Officer reviews should have separate accountability tracks.
- Email-template visual styling is duplicated across `send-invite/route.ts` and the new review-request templates. Defer until a third template appears, then extract to a shared template helper.
- Legacy `/api/admin/profiles/[id]/send-invite` route (existing tech debt #28) is still in tree. The verification_codes migration in this brief unblocks the modern path; the legacy route can be deleted once we confirm no callers remain.

## End-of-brief checklist for CLI

After Batch 3 commits and pushes:

1. Confirm `git status` is clean and `git status -sb` says up-to-date with `origin/main`.
2. Confirm CHANGES.md tail has one entry per batch with the right date.
3. Run the dev-server reset from the **main project root, not the worktree** (`.env.local` only lives at the project root):
   ```
   cd /Users/elaris/Documents/Claude_webapp_client_onboarding && pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. One-line chat summary back to Vanessa: "B-118 done — peer/manager review feature + verification_codes & comm-card hotfixes. 3 batches committed, 2 migrations pushed."

## Worktree note

This brief was written in worktree `stupefied-bhabha-fb0c3f`. All commits during execution must land on `origin/main` via `git push origin HEAD:main` — CLI only pulls main. Do not push to the worktree branch.
