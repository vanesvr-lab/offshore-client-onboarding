# B-119 — Actions as a top-level section + email popup & milestones hotfixes

## Goal

Two small UI hotfixes plus one substantive feature:

1. **Hotfix: Email popup** — `ServiceCommunicationsDialog` (the modal that opens when you click a row in the right-rail Communications card) needs to be ~25% wider and must surface the sender (`Sent by: {admin name}`).
2. **Hotfix: Milestones card** — denser layout. Reduce vertical/horizontal padding, fit each milestone's label and date on a single row, smaller font is acceptable. The card today wastes a lot of vertical space in the right rail.
3. **Feature: Actions as a top-level section** — promote the existing `AdminServiceActionsSection` from an inline section in the main content area to a first-class top-level pill in the step bar, alongside Company Setup / Financial / Banking / People KYC / Documents. Add a fourth subsection (Company Registration) so the section has Substance Review, Bank Opening, Company Registration, and Generate FSC Checklist. Each subsection adopts the standard subsection accordion shell with a manual status pill driving the section's completion %.

## Context

### Email popup

`ServiceCommunicationsDialog` is rendered from `ServiceCommunicationsCard`. CLI must read the current width breakpoints (likely `sm:max-w-lg` / `md:max-w-xl`) and bump them by ~25%. The "from" field — i.e., which admin sent the comm — is stored on the `service_communications` row (probably `sender_id` / `created_by`) but isn't currently rendered in the dialog. Display it as a labeled field near the top of the body, alongside the existing recipient + subject + sent-at fields.

### Milestones card

`ServiceDetailClient.tsx:4402+` carries the `milestones` state (LOE / invoice / payment / etc.). The right-rail card renders each milestone as a row with too much padding and a date that wraps to a second line. Tighten the row spacing, put the label and date on one line each, drop the font size to match other dense right-rail cards (e.g., the Pending card's row density). No behavioural changes.

### Actions section

The current `AdminServiceActionsSection` (B-072) lives as a section inside the main content area and renders `SubstanceReviewForm`, `BankAccountOpeningStub`, `FscChecklistStub` based on per-template bindings in `service_template_actions`. It renders nothing when the template has zero bindings.

Vanessa wants this elevated:

- New top pill **Actions** appears in the pill bar **after Documents**, but **only when the current service template has ≥1 action binding** (template-conditional — Trust / Domestic Co see no pill).
- Clicking the pill opens an accordion section that mirrors People KYC's structure: a top-level section header with %, expanded body containing per-subsection accordions, each subsection has the standard header (chevron + label + status pill + review badge + Save/Cancel) and its own body (the existing form / stub).
- The existing standalone `AdminServiceActionsSection` in the main content is removed — Actions only renders inside the new top-level section.

## Locked design decisions (from brainstorming)

### Pill position

After Documents. End-of-line on the assumption that actions (bank opening, registration, FSC filings) come after KYC/Documents are complete.

### Pill visibility

Template-conditional. Pill is rendered only when `service_template_actions` has ≥1 binding for the current service's template. Service types without bindings (Trust, Domestic Co) get the existing 5-pill bar unchanged.

### Subsection set

Four named subsections, each bound per-template via `service_template_actions.action_key`:

- `substance_review` — full form (`SubstanceReviewForm`, existing).
- `bank_account_opening` — stub (`BankAccountOpeningStub`, existing).
- `company_registration` — **NEW**. Status + registration date + registration number (text) + registry country (CountrySelect) + notes (textarea).
- `fsc_checklist` — stub (`FscChecklistStub`, existing).

Each subsection is conditionally rendered based on its presence in `service_template_actions` for the current template — so a template can bind any subset of the four.

### Subsection accordion shell

Match the existing KYC subsection pattern (chevron header / status pill / review badge / Save/Cancel / expanded body). CLI should reuse the same components/CSS classes used by the People KYC subsections so the visual rhythm is identical. The status pill is the manual completion marker (see "Completion model").

### Completion model

Manual status pill per subsection. Values: `pending` (default) / `in_progress` / `done`.

- The existing `service_actions.status` column (used by Bank Opening / FSC) provides the storage. Substance Review and Company Registration adopt the same field/storage.
- Section % for Actions = `done_count / total_bound_subsections × 100`, rounded.
- The Progress meters card on the right rail grows from 5 gauges to 6 — but only when the Actions pill itself is rendered (template-conditional). Templates without action bindings keep 5 gauges.
- The Pending card surfaces Action subsections whose status is `pending` or `in_progress` as actionable rows (same row template as existing Pending rows).

### Action key registration

Add `company_registration` to the `ActionKey` type union in `src/types/`. Append seed bindings to the `service_template_actions` rows for whichever templates need it (CLI: grep the existing seed file for templates already bound to action_keys; bind `company_registration` to the same set, typically GBC + AC. If unclear, ask Vanessa — but a sensible default is "bind to every template that already has any action binding").

## In scope

- Hotfix 1 (email popup width + sender field).
- Hotfix 2 (milestones compact layout).
- All locked design decisions for Actions-as-section.
- Schema additions: `service_actions.status` reused (no new columns unless Company Registration needs them — registration_date / registration_number / registry_country might live on `service_actions` as JSON `data` if such a column exists, or new columns).
- Migration: add `company_registration` to whatever enum/check constraint governs `action_key` (if any), append template bindings.
- Refactor: AdminServiceActionsSection → Actions section + 4 subsection components fitting the standard accordion shell.
- Right rail wiring: Progress meters 5 → 6 gauges (conditional), Pending card surfaces Action rows.
- Audit-log writes on status changes (existing pattern).

## Out of scope (and why)

- **Reference Forms feature** — deferred to B-120. This brief's FSC Checklist subsection does not yet link to a reference form template; B-120 wires that up.
- **Per-subsection review via `application_section_reviews`** — Actions subsections use `service_actions.status` as their done-state authority for this brief. If reviews-on-Actions becomes a real need, revisit in a follow-up. Note in tech debt.
- **Bulk action completion** — no "mark all as done" affordance.
- **Re-ordering subsections in the UI** — order follows `service_template_actions.sort_order` (existing).
- **Action templates beyond the four named** — adding a fifth action (e.g., "Tax filing") happens in a separate brief.
- **Mobile right-rail layout for the 6th gauge** — same considerations as the existing 5 gauges; no extra work.

## Implementation — batched

Each batch ends with: stage specific files (never `git add -A` or `git add .`), commit with a descriptive message (no `B-119` in the commit message), `git push origin HEAD:main` (worktree session — main is the only branch CLI pulls), update `CHANGES.md` with the batch outcome.

### Batch 1 — Hotfixes (email popup + milestones)

**Email popup (`src/components/admin/ServiceCommunicationsDialog.tsx`):**

- Bump the dialog width breakpoints by ~25%. Today's likely shape: `sm:max-w-lg` (32rem) → `sm:max-w-2xl` (42rem); `md:max-w-xl` (36rem) → `md:max-w-3xl` (48rem). Pick the actual Tailwind classes that produce ~25% wider on the current breakpoints, snapping to standard scale.
- Add a "Sent by" field. Source: the admin who sent the comm. Fetch the sender's display name via the existing `admin_users` ↔ `profiles` join used elsewhere on the page (no new query needed if the comm row already carries `sender_id` and the parent already loaded an admin name map). Render it in the dialog body, near the top, in the same labeled-row pattern as the existing recipient / subject / sent-at fields.
- If `sender_id` is null on legacy comm rows, show `—` (em dash) rather than crashing.

**Milestones card (`ServiceDetailClient.tsx` — locate the milestones render block; likely a `WorkflowMilestonesCard` child or inline in the right rail):**

- Reduce row padding (likely `py-3` → `py-1.5` or `py-2`).
- Reduce horizontal padding to match Pending card density (`px-4` is fine).
- Drop the row's font from `text-sm` to `text-xs` if currently `text-sm`, OR keep at `text-sm` with tighter line-height — pick what reads cleanly.
- Put label and date on a single line: flex row, label on left, date on right (truncate the label if needed).
- The "set / clear / edit" controls per milestone stay — just compact them.

Both hotfixes ship together as Batch 1; no migration needed.

### Batch 2 — Actions section: schema + step pill + section scaffold + 4 subsection components

**Schema migration:** `supabase/migrations/<timestamp>_actions_section.sql`. Add `company_registration` to the action_key enum/check constraint (if one exists) AND add seed bindings to the relevant templates.

If the existing `service_actions` table doesn't already have columns to store Company Registration's fields (`registration_date`, `registration_number`, `registry_country`), choose the lightest option:

- If `service_actions` has a generic `data` JSONB column: store there.
- Otherwise: add three columns `registration_date date`, `registration_number text`, `registry_country text` — all nullable.

CLI to inspect `service_actions` schema and pick the cleaner path. Confirm with a short note in CHANGES.md.

**Migration push:** CLI must run `npm run db:push` and `npm run db:status` after creating the migration and confirm Local + Remote pairing before moving on. Do not defer to Vanessa.

**Step pill + step indicator wiring:**

- Locate the step pill bar (likely in `ServiceDetailClient.tsx` around the sticky shell — the B-099 step-pill-and-accordion work). It pulls section keys from somewhere (possibly hardcoded array, possibly from template). Add `actions` as the last key, conditionally — only when the current service's template has ≥1 binding in `service_template_actions`.
- Section anchor id: `section-actions` (match existing conventions like `section-people-kyc`).
- Step indicator (the smaller bar below the pill bar) also gains an entry conditionally.

**Top-level section scaffold:** `src/components/admin/ServiceActionsSection.tsx` (rename / replace existing `AdminServiceActionsSection.tsx`):

- Renders the same accordion shell as the People KYC section header (collapsible, % badge, count).
- Body is a list of subsection accordions in `service_template_actions.sort_order`.
- The current `AdminServiceActionsSection` file gets deleted; nothing in the main content area renders it anymore.

**Four subsection components** — each wrapped in the standard subsection accordion shell with:

- Chevron + label + status pill + (later) review badge slot + Save/Cancel.
- Status pill: pending (gray) / in_progress (amber) / done (green). Click status pill → opens a small dropdown to change. PATCH to `/api/admin/services/[id]/actions` (existing endpoint used by the current stubs; verify the path).
- Expanded body = the existing form / stub content.

Specific subsections:

- **`SubstanceReviewSubsection`** — wraps the existing `SubstanceReviewForm`. Form fields stay; subsection header adds the status pill.
- **`BankAccountOpeningSubsection`** — wraps the existing `BankAccountOpeningStub`. The stub already has a status pill — collapse it into the new subsection header (don't render two status pills).
- **`CompanyRegistrationSubsection`** — NEW. Body fields: `registration_date` (date input), `registration_number` (text), `registry_country` (CountrySelect), `notes` (textarea). Save button persists via PATCH `/api/admin/services/[id]/actions`. Header has the status pill (default `pending`).
- **`FscChecklistSubsection`** — wraps the existing `FscChecklistStub`. Same status-pill collapse as Bank Opening.

Each subsection follows the existing People KYC subsection visual pattern (`PersonCard` and its `<details>`-style accordion). Match the spacing, the chevron rotation, the section-review badge slot (left empty for now — see Out of scope), and the Save/Cancel placement.

### Batch 3 — Right-rail integration (Progress meters + Pending card)

**Progress meters card (`ProgressMetersWithState`):**

- Currently consumes 5 percentages from `ServiceDetailClient`: `companySetupPct`, `financialPct`, `bankingPct`, `peopleKycPct`, `documentsPct`.
- Compute `actionsPct` in `ServiceDetailClient` as `done_count / total_bound_subsections × 100`. When the template has no action bindings, pass `undefined` and the card renders the existing 5 gauges. When bindings exist, render 6.
- Visual: 6 gauges may not fit the current grid layout — CLI to inspect and adjust (e.g., 2 rows × 3 gauges instead of 1 row × 5).

**Pending card (`PendingCardWithState`):**

- Today's card already accepts `pcts`, `profiles`, `missingDocCount`, `autoAlerts`, `manualAlerts`, `onAction`. Add a new input: per-action-subsection rows for any subsection with status ∈ {`pending`, `in_progress`}.
- Render each as a row: subsection label + status pill + click handler that scrolls to `#section-actions` and expands the right subsection.
- Reuse the existing row component; don't introduce a new row shape.

**Audit log:**

- Status changes on Action subsections write to `audit_log` via existing `writeAuditLog` plumbing. Action key: `action_status_updated`. Entity: `service_action:{id}`. New value: `{status, previous_status}`.

## Database changes

- One migration in Batch 2 (action_key enum/check constraint update + Company Registration field columns or JSON usage + template seed bindings for `company_registration`).
- No schema changes in Batch 1 or Batch 3.

CLI runs `npm run db:push` + `npm run db:status` immediately after the migration. Confirm Local + Remote pairing.

## Testing

- Unit: section % calculation for Actions (multiple subsection counts, all-done vs partial).
- Unit: pill visibility logic (template with 0 bindings → no pill; template with 1+ bindings → pill).
- Integration: Company Registration PATCH endpoint stores all four fields.
- Manual: visual check that 6 gauges fit the right rail without overflow at the smallest supported `lg:` width.

## Tech-debt notes

Append to `docs/tech-debt.md` (newest at top) after Batch 3:

- Action subsections do not currently plug into `application_section_reviews`. Their completion is driven only by `service_actions.status`. If admin-on-admin review of Action subsections becomes a need (peer/manager review pattern from B-118 doesn't quite cover this, since review-requests are ad-hoc not per-section-flow), revisit and wire up.
- The status pill UI is duplicated across four subsection components. Once we have ≥5 action subsections or a fifth status emerges, extract a shared `<ActionStatusPill>` component.
- The Progress meters card's grid is hardcoded for 5 gauges; the Actions case forces a 6-gauge variant. If we add a 7th top-level section, refactor to a fully dynamic gauge grid.

## End-of-brief checklist for CLI

After Batch 3 commits and pushes:

1. Confirm `git status` is clean and `git status -sb` says up-to-date with `origin/main`.
2. Confirm CHANGES.md tail has one entry per batch with the right date.
3. Run the dev-server reset from the **main project root, not the worktree** (`.env.local` only lives at the project root):
   ```
   cd /Users/elaris/Documents/Claude_webapp_client_onboarding && pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. One-line chat summary back to Vanessa: "B-119 done — Actions section + email popup & milestones hotfixes. 3 batches committed, 1 migration pushed."

## Worktree note

This brief was written in worktree `stupefied-bhabha-fb0c3f`. All commits during execution must land on `origin/main` via `git push origin HEAD:main` — CLI only pulls main. Do not push to the worktree branch.
