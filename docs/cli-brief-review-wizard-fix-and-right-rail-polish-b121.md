# B-121 — Review Wizard regression fix + right-rail polish + local director count

## Goal

Five items, bundled because they're small and adjacent:

1. **Bug fix: Review Wizard regression (B-119)** — the new Actions top-level section is rendering inside every subsection of the Review Wizard. Promote Actions to a reviewable step on its own, mirroring the other 5 top-level sections.
2. **Right-rail polish — Status card to slot 3** — after B-120's Progress-first reorder, move Status above Pending so the rail reads Progress / View Summary / Status / Pending / Communications / Milestones / Audit Trail.
3. **Right-rail polish — card border consistency** — Milestones + Audit Trail cards use a different border treatment from the other right-rail cards. Standardize to `border rounded-xl` (default gray-200).
4. **"View All" emails popup** — widen by +50%, add a sender column + ~80-char body preview so each row carries enough context to identify the email without clicking in.
5. **Local director count** — add a `min_local_directors int` column to `service_templates` (seeded: 1 for GBC, 0 for others). Show a count chip on the People & KYC section header (`"3 directors · 1 local"`). Surface a Pending row when actual local director count < `min_local_directors` for the current service.

## Context

### Review Wizard regression

The Review Wizard is the focused-review mode gated by the `reviewMode` flag in `ServiceDetailClient.tsx` (see B-102 comments around line 3577 — it hides the stage strip / step indicator / right rail / admin extras and walks the admin through one subsection at a time). After B-119 promoted Actions to a top-level section, `ServiceActionsSection` is being rendered alongside every subsection's body in the wizard, instead of being scoped to its own step. CLI to repro: open a service, click "Review wizard" (or whatever the entry affordance is), step through any subsection — the Actions block appears below each one.

The fix is to add Actions to whatever array drives the wizard's step list (probably the same section list the step pill bar consumes — search for where step keys are enumerated) and let the wizard render only the current step's content. The same template-conditional rule from B-119 still applies (no Actions step in the wizard for templates without action bindings).

### Right-rail polish (Status + borders)

After B-120 landed the Progress-first reorder, the rail order is:

```
1. Progress Meters card
2. View Summary button
3. Pending card
4. Status card
5. Communications card
6. Milestones card
7. Audit Trail
```

Vanessa wants Status at slot 3:

```
1. Progress Meters card
2. View Summary button
3. Status card           ← moved here
4. Pending card
5. Communications card
6. Milestones card
7. Audit Trail
```

Borders: the top right-rail cards (Progress / Pending / Status / Communications) consistently use `border rounded-xl` with the default gray-200 border. The Milestones and Audit Trail cards use a different treatment (CLI to grep — likely `border-gray-300` or a custom style, or wrapped in a different container). Standardize them to match.

### "View All" emails popup

The Communications card has a "View All" affordance that opens a list view of every email logged for this service. Today's modal is too narrow — each row shows subject + recipient + sent date but admin can't tell who sent the email or what it was about without clicking in.

The single-email dialog got a +25% bump in B-119 (`ServiceCommunicationsDialog`). The list-view modal is a separate component — CLI to locate, likely `ServiceCommunicationsListDialog` or invoked from `ServiceCommunicationsCard`.

### Local director count

Mauritius regulation requires at least one local (resident) director for many service types — GBC certainly, possibly others. The system already captures local director information on KYC profiles (Vanessa: "We already show local director on the KYC profile"). What's missing is a compliance count + a "you don't have one" Pending alert.

The check is code-driven. Admin doesn't need to write any validation rule — the brief defines the rule, CLI implements it against a seeded value on `service_templates`.

## Locked design decisions (from brainstorming)

### Review Wizard — Actions as its own step

Actions joins the existing top-level section list as a reviewable step. Template-conditional (only appears when the service template has ≥1 `service_template_actions` binding, same as the step pill / Progress meters in B-119). When admin walks through the Review Wizard, Actions is its own step with all four subsections (Substance Review, Bank Opening, Company Registration, FSC Checklist) visible there, NOT bleeding into other sections' bodies.

### Right rail order

```
1. Progress Meters
2. View Summary button
3. Status
4. Pending
5. Communications
6. Milestones
7. Audit Trail
```

### Border treatment for all right-rail cards

`border rounded-xl` (default `border-gray-200` from Tailwind's default config). Apply to Milestones and Audit Trail to match the top cards. No custom border colors anywhere on the rail.

### "View All" emails popup

- Width: +50% from current (likely `max-w-4xl` or `max-w-5xl` depending on what the current class is — CLI snaps to the standard Tailwind scale).
- New columns: **Sender** (admin display name) and **Body preview** (first ~80 chars of the body, stripped of HTML, ellipsis if truncated).
- Row layout: `Subject · Sender · Recipient · Sent date · Body preview` — sender and body preview are the new additions; the existing columns stay.
- Sort order: most recent first (existing).

### Local director count

**Schema:** add `min_local_directors integer NOT NULL DEFAULT 0` to `service_templates`. Seed: GBC = 1, all other templates = 0.

**Detection rule:** "Local director" = a profile with the Director role AND a "local resident" indicator. Vanessa noted the system already shows local director on the KYC profile — CLI to find the existing data path (probably a flag on `client_profile_kyc` like `is_local_resident_director` or a country-of-residence check, or maybe an explicit role variant). Use whatever's already there; don't introduce a new flag unless the existing one is missing.

If the existing data model has no clean way to mark a director as "local," add a `is_local_resident boolean DEFAULT false` to `client_profile_kyc` (or wherever director-specific kyc fields live), seed-aware. Surface this as a checkbox/select on the Director subsection in the KYC long-form. CLI: investigate first, decide minimally invasive path, document the choice in CHANGES.md.

**Display 1 — header chip:** People & KYC section header gains a small chip showing the count, e.g., `"3 directors · 1 local"`. When the count is 0 AND `min_local_directors > 0`, render the chip in amber (warning) instead of neutral gray.

**Display 2 — Pending card row:** when `actual_local_directors < min_local_directors`, emit a Pending row labeled "Local director required" with a section-anchor click target jumping to People & KYC. Reuse the existing Pending row component; don't introduce a new row shape.

## In scope

- All five items above.
- Schema additions: `service_templates.min_local_directors`, possibly `client_profile_kyc.is_local_resident` (if missing).
- Seed updates: `min_local_directors=1` for GBC; 0 elsewhere.
- CSS/JSX edits for the right-rail reorder + border standardization.
- A new column + body-preview rendering for the View All emails popup.

## Out of scope

- **Admin UI for editing `min_local_directors`** — managed via SQL/Supabase editor only. If multiple regulators change rules and SQL becomes painful, revisit later. Tech-debt note.
- **Inline preview of email body in the list view** — body preview is text-only, no HTML render, no expand-on-hover. Clicking the row still opens the existing single-email dialog (widened in B-119) for full content.
- **Reordering of any other right-rail cards beyond moving Status** — Communications / Milestones / Audit Trail keep their current relative order.
- **Pending alerts for other compliance roles** (Local Secretary, Local Registered Agent, etc.) — same pattern would apply but is out of scope here. Tech-debt note for the follow-up.
- **Localizing the count chip text** — English-only ("3 directors · 1 local").

## Implementation — batched

Each batch ends with: stage specific files (never `git add -A` or `git add .`), commit with a descriptive message (no `B-121` in the commit message), `git push origin HEAD:main` (worktree session — main is the only branch CLI pulls), update `CHANGES.md` with the batch outcome.

### Batch 1 — Review Wizard regression fix

Find the wizard's step list (likely an array in `ServiceDetailClient.tsx` consumed both by the step pill bar and the wizard's step navigation). Add `actions` to the array — same conditional check as B-119's pill visibility (only when `service_template_actions` has ≥1 binding).

Make sure the wizard renders only the current step's content. The bug today is that `ServiceActionsSection` is rendered unconditionally inside every step's body; fix the render condition so each step's body renders only that step's content.

After the fix, manually verify (or write an integration test):

- Open `/admin/services/<id>` with a template that has action bindings (GBC). Enter the Review Wizard.
- Step through Company Setup → Financial → Banking → People KYC → Documents → **Actions** → done.
- At each step, only that section's content appears — no bleed-through of Actions.
- The "Mark as reviewed" + "Continue" + "Back" affordances work for the Actions step like they do for the others.
- Open a service with a template that has NO action bindings (Trust). Confirm Actions does NOT appear as a step.

No migration in this batch.

### Batch 2 — Right-rail polish (Status reorder + border consistency + View All width)

**Status reorder** — locate the right-rail JSX block in `ServiceDetailClient.tsx` (same one B-120 touched). Move the Status card JSX from its current position (slot 4 after B-120's Progress-first reorder) to slot 3, just above the Pending card. Verify the sticky/scroll behavior still works.

**Border consistency** — find the Milestones card component and the Audit Trail component (likely separate components in `src/components/admin/`). Replace whatever border treatment they're using with `border rounded-xl` (default border, no custom color). If they're using a different wrapper element (e.g., a `Card` shadcn component), align to whatever the top cards use.

**View All emails popup** — locate the list-view modal (likely `ServiceCommunicationsListDialog` or similar). Bump the width class by ~50% (e.g., `max-w-2xl` → `max-w-4xl`; CLI to confirm the current class and pick the closest +50% on the standard scale).

In the row template:

- Add **Sender** column. Source: `service_communications.created_by` joined to `admin_users` → `profiles.full_name`. Map should already exist on the parent (used by other right-rail components); if not, fetch alongside the existing list query.
- Add **Body preview** column. Take the first ~80 chars of the body, strip HTML tags (use a simple regex `.replace(/<[^>]+>/g, '')` plus a trim — no need for a full HTML parser), trim whitespace, append `…` if longer than 80. Use `truncate` Tailwind utility for visual safety.
- Row layout — give Subject ~25%, Sender ~15%, Recipient ~15%, Sent date ~12%, Body preview ~33%. CSS grid or flex; CLI picks based on existing patterns.

No migration in this batch.

### Batch 3 — Local director count: schema + chip + Pending row

**Schema migration:** `supabase/migrations/<timestamp>_local_director_count.sql`:

```sql
-- B-121 — local director compliance count.
-- Add a per-template threshold for "minimum local resident directors required"
-- so the Pending card can flag services that don't meet the rule.
ALTER TABLE public.service_templates
  ADD COLUMN IF NOT EXISTS min_local_directors integer NOT NULL DEFAULT 0;

-- Seed: GBC requires 1 local director (Mauritius FSC rule). Everything else stays 0.
-- Uses ILIKE on the template name to stay in sync with the project's existing
-- seed conventions (see service_template_actions migration for the pattern).
UPDATE public.service_templates
SET min_local_directors = 1
WHERE name ILIKE '%GBC%' OR name ILIKE '%Global Business%';

-- If the system has no existing "is local resident director" flag, also add:
-- (CLI: only if grep confirms no such column exists on client_profile_kyc)
-- ALTER TABLE public.client_profile_kyc
--   ADD COLUMN IF NOT EXISTS is_local_resident_director boolean NOT NULL DEFAULT false;
```

CLI: before running the migration, **grep the schema** to confirm whether a "local resident director" flag already exists somewhere (could be on `client_profile_kyc`, on `profile_service_roles`, or inferred from `kyc_records.country_of_residence === 'MU'`). Pick the cleanest existing path:

- If a flag exists: use it, don't add a duplicate.
- If no flag but country-of-residence is captured: define "local director" as `role='director' AND country_of_residence ILIKE '%mauritius%' OR ISO3='MUS'`. No new column.
- If neither: add `is_local_resident_director boolean` on `client_profile_kyc` and expose a checkbox on the Director KYC subsection's identity step.

Document the chosen path in CHANGES.md so we know which it was.

**CLI must run `npm run db:push` and `npm run db:status` after creating the migration.** Confirm Local + Remote pairing.

**Compute the count** in `ServiceDetailClient.tsx`'s data assembly block (where `profiles`, `documents`, etc. get computed). Derive:

```ts
const localDirectorCount = profiles
  .filter((p) => isDirectorRole(p) && isLocalResident(p))
  .length;

const requiredLocalDirectors = template?.min_local_directors ?? 0;
const localDirectorShortfall = Math.max(0, requiredLocalDirectors - localDirectorCount);
```

Pass these into the People & KYC section header component and the Pending card.

**Section header chip** — extend the People & KYC section's header to render a count chip. Format: `"{totalDirectors} directors · {localDirectorCount} local"`. Pluralize correctly (1 director, 2 directors). When `localDirectorShortfall > 0`, render the chip with amber background (`bg-amber-100 text-amber-800`) — otherwise neutral gray (`bg-gray-100 text-gray-700`).

**Pending row** — extend the Pending card's input + render block to include a "Local director required" row when `localDirectorShortfall > 0`. Label: `"Local director required ({localDirectorShortfall} more needed)"`. Click → scrolls to People & KYC section (anchor: `section-people-kyc` or whatever the existing anchor id is). Reuse the existing Pending row component; don't introduce a new row shape.

Audit-log writes: not required for this batch — it's a derived display, not a state change.

## Database changes

- One migration in Batch 3: `service_templates.min_local_directors` + seed for GBC + (conditional) `client_profile_kyc.is_local_resident_director`.
- No migrations in Batches 1 or 2.

CLI runs `npm run db:push` + `npm run db:status` after the Batch 3 migration. Confirm Local + Remote pairing.

## Testing

- Unit: count derivation (`localDirectorCount` + `localDirectorShortfall`). Cover 0 directors, 0 local; 1 director, 0 local; 2 directors, 1 local; 3 directors, 2 local. Verify shortfall math against various `min_local_directors` values.
- Integration: Pending card rendering picks up the new row when shortfall > 0; hides it when shortfall = 0.
- Visual: header chip color (amber when short, gray when met).
- Manual: Review Wizard regression fix walk-through (per Batch 1 steps).
- Manual: right-rail visual check — Status at slot 3, Milestones / Audit Trail borders match the top cards.

## Tech-debt notes

Append to `docs/tech-debt.md` (newest at top) after Batch 3 lands:

- `service_templates.min_local_directors` has no admin UI for editing — managed via Supabase SQL editor only. Add a UI when more compliance counters appear (Local Secretary, Local Registered Agent, etc.) or when regulators change requirements often.
- The local-director compliance rule is the first per-template numeric threshold. If we add more (`min_local_secretaries`, `min_local_registered_agents`, `min_directors_total`, etc.), refactor the Pending derivation into a shared helper rather than hand-coding each one.
- If a flag was added on `client_profile_kyc` (vs inferred from country-of-residence), revisit whether the inferred path is more truthful (a director might be a Mauritius citizen but resident abroad — would still fail the "local resident" rule). Document the decision in CHANGES.md so we can revisit.

## End-of-brief checklist for CLI

After Batch 3 commits and pushes:

1. Confirm `git status` is clean and `git status -sb` says up-to-date with `origin/main`.
2. Confirm CHANGES.md tail has one entry per batch with the right date.
3. Run the dev-server reset from the **main project root** (not the worktree — `.env.local` only lives at the project root):
   ```
   cd /Users/elaris/Documents/Claude_webapp_client_onboarding && pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. One-line chat summary back to Vanessa: "B-121 done — Review Wizard regression fixed + right-rail polish + local director count. 3 batches committed, 1 migration pushed."

## Worktree note

This brief was written in worktree `stupefied-bhabha-fb0c3f`. All commits during execution must land on `origin/main` via `git push origin HEAD:main` — CLI only pulls main. Do not push to the worktree branch.
