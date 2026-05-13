# CLI Brief — B-098 Service Status Overhaul + Section Review Rename + Officer FK Fix + Step Pills

**Status:** Ready for CLI
**Estimated batches:** 1 (large — bundles 4 concerns sharing migration tooling)
**Touches migrations:** Yes — three migrations (officer FK, section review enum rename, service status enum overhaul). CLI MUST run `npm run db:push` + `npm run db:status` and confirm both Local + Remote match.
**Touches AI verification:** No
**Touches API:** Yes — extends existing PATCH routes that accept `status` to honour the new enum values; extends section-review routes to honour `reviewed`.
**Builds on:** B-093 (Status card with Move-to-next), B-095 (audit coverage), B-096 (pill buttons + admin_users dropdown — Step 2b removed a bad filter but didn't add the missing FK)

---

## Why this batch exists

Four user-visible problems on `/admin/services/[id]`:

1. **Section review "Approved" should read "Reviewed".** Clicking the `Review` button on a section card marks the section as `approved` in `application_section_reviews.status` and the `SectionReviewBadge` displays "Approved". The verb is wrong — clicking Review means a reviewer has *reviewed* the section, not that anyone *approved* anything. Vanessa wants the badge label + underlying enum value renamed to `reviewed`. The button label `Review` stays — only the result wording changes.

2. **Service status chain is wrong.** Current 8 values (`draft, in_progress, submitted, in_review, pending_action, verification, approved, rejected`) don't match how Vanessa's team actually moves services through. Replace with **10 new values**: 8 forward chain (`start → document_collection → verification_and_screening → risk_assessment → final_review → approved → registration → active`) + 2 override-only terminals (`rejected`, `closed`).

3. **Step indicator (`1. Company Setup ▸ 2. Financial …`) doesn't look like a pill button.** B-096 made every `<Button>` a pill but the step indicator is a custom component. Restyle each step to match the pill button language: rounded-full, brand-navy for the active step, light gray for inactive, chevron separators kept.

4. **Assigned Officer dropdown is still empty** even after B-096 removed the broken `tenant_id` filter. Root cause confirmed: there's **no foreign key constraint** between `admin_users.user_id` and `public.users.id`, so the Supabase JS query `users(full_name, email)` fails with `PGRST200` (no relationship in schema cache). Adding the FK fixes the query.

Vanessa explicitly said the single existing test service can be reset to the default of the new status enum during migration — she'll manually move it to the right new stage afterwards. No old→new mapping table needed.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main`) + update CHANGES.md.
2. `npm run build` clean.
3. **Migrations MUST be pushed.** All three migrations applied via `npm run db:push`, confirmed via `npm run db:status` (Local + Remote match, no drift). If drift appears, STOP and document in CHANGES.md.
4. **`rejected` and `closed` are override-only terminals.** They are reachable only via the Stage Override dropdown in the B-093 Status card. The forward `Move to <next>` button never targets them.
5. **Single source of truth for the forward chain.** Define `FORWARD_CHAIN` once (probably in a small `src/lib/services/statusChain.ts` module). All places that need the chain (B-093 status card, the stage strip at the top of the page, anywhere else) import from there. Don't redeclare the array inline.
6. **Backfill of existing services:** every existing row's `services.status` is reset to `start` as part of the migration. Vanessa manually adjusts the one test service after the migration lands. Audit-log entries that reference the old status names stay as-is (historical record).
7. **Section review enum rename** is `approved` → `reviewed`. Other section review status values (`flagged`, `not_reviewed`, whatever else exists) stay unchanged. Verify against the actual `application_section_reviews` schema before writing the migration.
8. **Don't restart the dev server.**

---

## Step 1 — Migration: foreign key for `admin_users.user_id`

Generate migration:

```bash
npx supabase migration new admin_users_user_id_fkey
```

```sql
-- B-098 — Add FK so Supabase JS join `users(full_name, email)`
-- resolves. Without this, the join errors PGRST200 and the
-- Assigned Officer dropdown renders empty.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admin_users_user_id_fkey'
  ) THEN
    ALTER TABLE public.admin_users
      ADD CONSTRAINT admin_users_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;
```

(Idempotent — guarded by `pg_constraint` lookup.)

After the FK lands, the existing query at [`page.tsx:154-155`](src/app/(admin)/admin/services/[id]/page.tsx:154) — `supabase.from("admin_users").select("user_id, users(full_name, email)")` — will resolve. No code change needed beyond the migration. Verify after `db:push` by hitting the page and confirming the dropdown lists all 3 admins (Jane Doe, Sarah Mitchell, Tony Stark).

If for some reason the FK can't be added (e.g., orphan rows), clean them up first within the migration — don't drop the constraint approach. Orphan check:

```sql
SELECT a.user_id FROM admin_users a
LEFT JOIN users u ON u.id = a.user_id
WHERE u.id IS NULL;
```

## Step 2 — Migration: section review enum rename `approved` → `reviewed`

Generate migration:

```bash
npx supabase migration new section_review_approved_to_reviewed
```

```sql
-- B-098 — Section reviews: rename 'approved' → 'reviewed'. Clicking
-- the Review button on a section card means a reviewer has reviewed
-- the section (Vanessa's term), not that anyone approved anything.
-- Approval is a different concept tied to the service-level status.

-- 1. Drop the existing check constraint (find its name first — varies
--    by environment; common names: application_section_reviews_status_check)
-- 2. Update existing rows
-- 3. Re-add the check constraint with the new values

DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'public.application_section_reviews'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.application_section_reviews DROP CONSTRAINT %I', cons_name);
  END IF;
END $$;

UPDATE public.application_section_reviews SET status = 'reviewed' WHERE status = 'approved';

ALTER TABLE public.application_section_reviews
  ADD CONSTRAINT application_section_reviews_status_check
  CHECK (status IN ('reviewed', 'flagged', 'not_reviewed'));
-- Adjust the allowed list to match the actual values used. If the table
-- has other statuses (e.g., 'pending', 'in_review'), include them.
-- Verify via: SELECT DISTINCT status FROM application_section_reviews;
-- BEFORE writing this constraint.
```

**Verify allowed values first** by querying live data. If you find statuses not in `{reviewed, flagged, not_reviewed}`, include them in the CHECK constraint.

## Step 3 — Migration: service status enum overhaul

Generate migration:

```bash
npx supabase migration new services_status_new_chain
```

```sql
-- B-098 — New service status chain. Old enum (8 values) replaced by
-- 10 new values: 8 forward chain + 2 override-only terminals.
--   Forward: start → document_collection → verification_and_screening
--            → risk_assessment → final_review → approved → registration
--            → active
--   Override-only terminals: rejected, closed
--
-- Existing services are reset to 'start' (Vanessa's call: single test
-- service that she'll move manually). Historical audit_log entries
-- referencing old status values stay as-is.

DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'public.services'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%status%';

  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.services DROP CONSTRAINT %I', cons_name);
  END IF;
END $$;

UPDATE public.services SET status = 'start';

ALTER TABLE public.services
  ADD CONSTRAINT services_status_check
  CHECK (status IN (
    'start', 'document_collection', 'verification_and_screening',
    'risk_assessment', 'final_review', 'approved', 'registration', 'active',
    'rejected', 'closed'
  ));
```

If there's also a `services_status_default` or similar default constraint, update it to `'start'`:

```sql
ALTER TABLE public.services ALTER COLUMN status SET DEFAULT 'start';
```

Run `npm run db:push` + `npm run db:status` after all three migrations are saved.

## Step 4 — Single source of truth for the chain

Create [`src/lib/services/statusChain.ts`](src/lib/services/statusChain.ts):

```ts
export const SERVICE_STATUS_FORWARD_CHAIN = [
  "start",
  "document_collection",
  "verification_and_screening",
  "risk_assessment",
  "final_review",
  "approved",
  "registration",
  "active",
] as const;

export const SERVICE_STATUS_TERMINAL_OVERRIDES = ["rejected", "closed"] as const;

export const SERVICE_STATUS_ALL = [
  ...SERVICE_STATUS_FORWARD_CHAIN,
  ...SERVICE_STATUS_TERMINAL_OVERRIDES,
] as const;

export type ServiceStatus = typeof SERVICE_STATUS_ALL[number];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  start: "Start",
  document_collection: "Document Collection",
  verification_and_screening: "Verification & Screening",
  risk_assessment: "Risk Assessment",
  final_review: "Final Review",
  approved: "Approved",
  registration: "Registration",
  active: "Active",
  rejected: "Rejected",
  closed: "Closed",
};

export function getNextStatus(current: string): string | null {
  const idx = SERVICE_STATUS_FORWARD_CHAIN.indexOf(current as ServiceStatus);
  if (idx === -1 || idx === SERVICE_STATUS_FORWARD_CHAIN.length - 1) return null;
  return SERVICE_STATUS_FORWARD_CHAIN[idx + 1];
}

export function isTerminalStatus(status: string): boolean {
  return (
    SERVICE_STATUS_TERMINAL_OVERRIDES.includes(status as typeof SERVICE_STATUS_TERMINAL_OVERRIDES[number]) ||
    status === "active"
  );
}
```

Replace inline declarations throughout the codebase:

- The old `STATUS_OPTIONS` constant in [`ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) (around line ~2778) → import `SERVICE_STATUS_ALL`.
- The old `FORWARD_CHAIN` in the B-093 Status card → import `SERVICE_STATUS_FORWARD_CHAIN`. The `isTerminal` check uses `isTerminalStatus`. The "Move to <next>" label uses `getNextStatus` + `SERVICE_STATUS_LABELS`. When at terminal, label stays `Move to Active` (the last in the forward chain) so the layout doesn't shift, button greyed.
- The stage strip rendering at [`ServiceDetailClient.tsx:3257-3265`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx:3257) (the `["draft", "in_progress", …]` array hardcoded inline) → use `SERVICE_STATUS_FORWARD_CHAIN`. Update `stepLabels` to `SERVICE_STATUS_LABELS`. `rejected` / `closed` continue to render as a side-state inline if status is set to one of them, OR (cleaner) the strip shows just the 8 forward stages and the badge in the Status card carries the rejected/closed indication.

`statusBadgeClass()` — find the helper that maps a status value to its color class. Update to handle the new values:

```ts
function statusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
    case "active":
      return "bg-emerald-100 text-emerald-700";
    case "registration":
      return "bg-blue-100 text-blue-700";
    case "rejected":
      return "bg-red-100 text-red-700";
    case "closed":
      return "bg-gray-200 text-gray-600";
    case "final_review":
    case "risk_assessment":
      return "bg-purple-100 text-purple-700";
    case "verification_and_screening":
      return "bg-amber-100 text-amber-700";
    case "document_collection":
      return "bg-yellow-100 text-yellow-700";
    case "start":
    default:
      return "bg-gray-100 text-gray-600";
  }
}
```

(Adjust palette to match the rest of the brand if these defaults clash — just keep each value visually distinct.)

## Step 5 — Section review badge / button rename

Files to update:
- [`src/components/admin/SectionReviewBadge.tsx`](src/components/admin/SectionReviewBadge.tsx) — wherever it renders `"Approved"` as a label, change to `"Reviewed"`. Wherever it color-keys on the `"approved"` string, change to `"reviewed"`.
- [`src/components/admin/SectionReviewButton.tsx`](src/components/admin/SectionReviewButton.tsx) — the button label stays `Review` (verb). If there's any "Approved" string in the button's submitting/success state, change to "Reviewed".
- Anywhere section review status is rendered: search `grep -rn "approved" src/components/admin/ src/app/\(admin\)/`. Each match needs review — keep the service-status `approved` references intact (they're a different enum); only update section-review references.
- API routes that write `application_section_reviews.status`: `src/app/api/admin/applications/[id]/section-reviews/route.ts`. Update any inline `'approved'` to `'reviewed'`.

A reliable rename approach: define a `SECTION_REVIEW_STATUS = { REVIEWED: 'reviewed', FLAGGED: 'flagged', NOT_REVIEWED: 'not_reviewed' } as const` in a small file under `src/lib/admin/sectionReviewStatus.ts`, then refactor each usage to import the constant. Future renames touch one place.

## Step 6 — Step indicator pill styling

File: [`src/components/admin/AdminApplicationStepIndicator.tsx`](src/components/admin/AdminApplicationStepIndicator.tsx).

The current `StepPill` renders a numbered step + status badge. Update it to pill button style:

```tsx
function StepPill({ step, index }: { step: AdminStep; index: number }) {
  const { status, reviewedCount, totalCount } = useAggregateStatus(step.sectionKeys);
  const isActive = /* whatever current "active step" logic exists */;
  return (
    <a
      href={`#${step.id}`}
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors",
        isActive
          ? "bg-brand-navy text-white"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200",
      )}
    >
      <span className={cn("inline-flex items-center justify-center h-5 w-5 rounded-full text-xs font-semibold", isActive ? "bg-white text-brand-navy" : "bg-white text-gray-500")}>
        {index + 1}
      </span>
      <span className="font-medium">{step.label}</span>
      {totalCount > 0 && (
        <span className={cn("text-xs", isActive ? "text-white/80" : "text-gray-500")}>
          {reviewedCount}/{totalCount} reviewed
        </span>
      )}
    </a>
  );
}
```

Keep the existing chevron separator between steps (the `<ChevronRight>` rendered in the parent `AdminApplicationStepIndicator`). Don't change anchor behavior — clicking still smooth-scrolls to `step.id`.

If "active step" detection doesn't exist today, derive it from `status` (e.g., active = the step with the largest count of `reviewed` that isn't fully done — or just `false` for all if the design doesn't strongly indicate an active step). Don't over-engineer; the visual differentiation between pill colors is the main goal.

## Step 7 — Wire up status update flows to new enum

- **B-093 Status card "Move to <next>" button**: uses `getNextStatus(service.status)` + `SERVICE_STATUS_LABELS`. Greyed at terminals (active, rejected, closed) with label fixed at `Move to Active`.
- **B-093 Status card Override dropdown**: lists all `SERVICE_STATUS_ALL` values. Selecting a terminal (rejected, closed) prompts the same confirmation dialog as any other override. Current status disabled.
- **`PATCH /api/admin/services/[id]` route**: status validation accepts only `SERVICE_STATUS_ALL` values. If the route currently has an inline list of allowed statuses, replace with the imported constant.

## Step 8 — Smoke test (manual; document in CHANGES.md)

After all three migrations land and code changes deploy:

1. **Officer dropdown.** Open `/admin/services/[id]`. The Assigned Officer dropdown lists Jane Doe, Sarah Mitchell, Tony Stark. Select Sarah Mitchell → save. Reload page; selection persists.

2. **Section review wording.** Click Review on Company Setup → set as Reviewed. The `SectionReviewBadge` next to the section card now reads `Reviewed` (was `Approved`). Audit Trail shows a `section_review_saved` entry attributed to your user.

3. **DB sanity.** Verify the test data:
   ```sql
   SELECT DISTINCT status FROM application_section_reviews;
   -- Expect: reviewed, flagged, not_reviewed (no 'approved')
   SELECT status FROM services;
   -- Expect: every row = 'start'
   ```

4. **New service status flow.** Status card reads `Current status: Start`. Click `Move to Document Collection` → status flips. Continue forward: `Move to Verification & Screening` → `Move to Risk Assessment` → `Move to Final Review` → `Move to Approved` → `Move to Registration` → `Move to Active`. At Active, button reads `Move to Active` greyed out.

5. **Override to terminals.** From any status, click `Stage Override ▾` → select `Rejected`. Confirmation dialog fires. Confirm → status = rejected. Button still reads `Move to Active` greyed. Override → `Closed` → status = closed.

6. **Stage strip at top of page.** Reads `Start ▸ Document Collection ▸ Verification & Screening ▸ Risk Assessment ▸ Final Review ▸ Approved ▸ Registration ▸ Active` (8 chevrons). Current status's chevron highlighted; completed chevrons show ✓.

7. **Step indicator pills.** `1. Company Setup ▸ 2. Financial ▸ 3. Banking ▸ 4. People & KYC ▸ 5. Documents` — each step is a rounded-full pill. Active step (or the step the user is scrolled near, if that logic exists) shows brand-navy background with white text. Inactive steps show light-gray background. Chevron separators between them. Clicking a pill smooth-scrolls to that section.

8. **No regression elsewhere.** `npm run build` clean. Open `/admin/queue` and `/admin/services` (list page) — those pages query `services.status` to render statuses. Each row shows the new label per `SERVICE_STATUS_LABELS` (e.g., `Start` instead of `Draft`).

9. **`npm run db:status` clean** — Local + Remote match for all three new migrations with no drift.

If any of 1–8 fails, fix in the same batch.

---

## CHANGES.md format

```md
### 2026-05-13 — B-098 — Service status overhaul + section review rename + officer FK + step pills (Claude Code)

Four concerns bundled (shared migration tooling).

- **Assigned Officer dropdown fix:** added FK `admin_users_user_id_fkey` referencing `public.users(id)` — without this, the Supabase JS join `users(full_name, email)` failed PGRST200 and the dropdown rendered empty. New migration `<ts>_admin_users_user_id_fkey.sql`. All 3 admins (Jane Doe, Sarah Mitchell, Tony Stark) now surface.
- **Section review enum rename:** `application_section_reviews.status` value `approved` → `reviewed`. Check constraint updated. UI strings + API route writes updated. Button label `Review` (verb) unchanged. New migration `<ts>_section_review_approved_to_reviewed.sql`. New constant `SECTION_REVIEW_STATUS` at `src/lib/admin/sectionReviewStatus.ts`.
- **Service status overhaul:** 8 old values replaced by 10 new (8 forward chain + 2 override-only terminals). Forward: start → document_collection → verification_and_screening → risk_assessment → final_review → approved → registration → active. Override-only: rejected, closed. Existing services reset to `start` (testing data; Vanessa moves the test service manually). New migration `<ts>_services_status_new_chain.sql`. Single source of truth at `src/lib/services/statusChain.ts`. Stage strip + B-093 Status card + step indicator + `PATCH /api/admin/services/[id]` validation all import from it.
- **Step indicator pill styling:** each numbered step (1. Company Setup ▸ 2. Financial ▸ …) is now a rounded-full pill — brand-navy bg + white text for the active step, light-gray bg for inactive. Chevron separators preserved. Anchor smooth-scroll behaviour unchanged.

`npm run db:push` ran all 3 migrations; `npm run db:status` confirms Local + Remote match with no drift.

Smoke test: <pass/fail from Step 8>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT migrate audit_log rows that reference old service status values — leave history as-is.
- Do NOT add `rejected` or `closed` to the forward chain. They're override-only terminals.
- Do NOT change the button label `Review` on the section review button.
- Do NOT change the service-level `status = approved` value — only the section-review value renames.
- Do NOT redeclare `FORWARD_CHAIN` / `STATUS_OPTIONS` inline anywhere; everyone imports from `src/lib/services/statusChain.ts`.
- Do NOT skip `npm run db:push` + `db:status`.
- Do NOT restart the dev server yourself.
- Do NOT change the step indicator's prop API. The pill style is purely a className change.
