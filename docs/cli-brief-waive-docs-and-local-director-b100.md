# CLI Brief — B-100 Review-Badge Tooltips + Address Save Fix + Waive Document + Local Director

**Status:** Hold until B-099 lands
**Estimated batches:** 4
**Touches migrations:** Yes (Batches 3 + 4)
**Touches AI verification:** Yes (Batch 4 — passport country extraction returns ISO3)
**Touches API:** Yes (Batches 2, 3, 4)
**Builds on:** B-068 (section review schema), B-073 / B-078 (admin per-profile editing), B-097 (KYC Documents tab), B-098 (review state vocabulary), B-099 (step-pill accordion — must be in `feat:` log before this brief starts)

---

## Hold rule

Do **not** start B-100 until commit `feat: …` for B-099 is on `origin/main`. Both briefs edit `ServiceDetailClient.tsx` and Batches 3 + 4 here also touch `KycDocumentsTab` and `KycLongForm`, which would conflict with the in-flight B-099 accordion work.

Verify with `git log --oneline -10 | grep "feat:.*step"` — must see the B-099 feat commit. If not, stop and tell Vanessa.

---

## Why this batch exists

Four improvements on `/admin/services/[id]`:

1. **Hover tooltip on Reviewed / Flagged / Rejected badges.** The badges from `SectionReviewBadge` today show only the label. Vanessa wants a tooltip on hover: `"<Verb> on <Long date> by <Reviewer name> — <first 80 chars of notes…>"`. Same template for all three states (`Reviewed` / `Flagged` / `Rejected`), with the verb swapped. Truncate the notes preview at 80 chars with an ellipsis if longer. If no notes exist, drop the em-dash + notes segment entirely.
2. **Fix address field resetting on save (KYC long-form).** Bug: admin edits the free-form `address` field inside KYC, hits Save → field reverts to the original value. Root cause already triaged (see Batch 2 below): the form binds to `address` (free-form, stored on `client_profiles.address`) but the unified save endpoint at `/api/admin/profiles/[id]/kyc-fields` only handles `client_profile_kyc` columns + a 3-key `profile_fields` allow-list (`full_name`, `email`, `phone`) — `address` is silently dropped on the way in, the response echoes the unchanged value back, and the form re-syncs to stale.
3. **Waive document.** Admin gets a "Waive" action on each row in the KYC Documents tab. Confirm modal (no reason required). Waived requirements are hidden from the client portal upload list — the client never sees the slot at all. Reversible via "Un-waive". Both actions write to `audit_log`.
4. **Local Director indicator + ISO3 country dropdown.** Add an "Is Local Director" pill next to the KYC % on each profile header. Computed client-side: true iff the profile has a `director` role on the current service **and** the profile's `passport_country` equals `"MUS"`. To make that check deterministic the existing free-text `passport_country` column has to become an ISO 3166-1 alpha-3 code. Migrate `CountrySelect` to store/return ISO3 (display name in UI), backfill existing data best-effort, and update the AI passport extractor's prompt to return ISO3.

---

## Hard rules

1. **Four batches, four commits.** After each batch: `git add` specific files → commit → `git push origin HEAD:main` (we're in a worktree — `git push origin main` errors) → update `CHANGES.md` with the batch outcome → continue. Do not bundle multiple batches into one commit; we want each item independently revertable.
2. `npm run build` must pass after each batch.
3. **Migrations.** Batch 3 adds a new table; Batch 4 adds backfill data. For both: place the migration in `supabase/migrations/<timestamp>_*.sql`, then `npm run db:push`, then `npm run db:status` to confirm Local + Remote paired. CLI handles the push — never defer to Vanessa. If `db:status` shows drift, stop and document in CHANGES.md.
4. **Don't restart the dev server.** Vanessa will run `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev` from the main project dir (`.env.local` lives at main root, not in the worktree).
5. **Don't touch B-099 surfaces.** Step pills, stage strip, accordion — all owned by B-099. Stay out.
6. **No `as any`.** If Supabase inference falls over on a new column or joined table, cast via `unknown` first (project convention).
7. **No commit message contains `B-100`** — keep the convention from CLAUDE.md ("Commit messages stay clean"). Reference the batch ID in `CHANGES.md` only.

---

## Batch 1 — Review badge hover tooltip

**Goal:** Hovering a `Reviewed` / `Flagged` / `Rejected` badge shows the latest reviewer + date + first 80 chars of notes.

### Step 1.1 — Extend `SectionReviewBadge` props (additive, optional)

File: [`src/components/admin/SectionReviewBadge.tsx`](src/components/admin/SectionReviewBadge.tsx).

Extend the props interface:

```ts
interface Props {
  status: SectionReviewStatus | null;
  className?: string;
  tone?: "default" | "on-dark";
  /**
   * When provided, the badge becomes a Tooltip trigger.
   * Use the most recent review row for the section.
   */
  reviewedAt?: string | null;
  reviewerName?: string | null;
  notes?: string | null;
}
```

Format the tooltip body:

```ts
function buildTooltip(status, reviewedAt, reviewerName, notes) {
  if (!reviewedAt) return null;            // no data → no tooltip
  const verb = { reviewed: "Reviewed", flagged: "Flagged", rejected: "Rejected" }[status];
  const date = new Date(reviewedAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",   // "7 May 2026"
  });
  const who = reviewerName ?? "Unknown reviewer";
  const trimmed = (notes ?? "").trim();
  const preview = trimmed.length > 80 ? `${trimmed.slice(0, 80).trimEnd()}…` : trimmed;
  return preview ? `${verb} on ${date} by ${who} — ${preview}` : `${verb} on ${date} by ${who}`;
}
```

Wrap the existing badge `<span>` with `Tooltip` / `TooltipTrigger` / `TooltipContent` from `src/components/ui/tooltip.tsx`. If `buildTooltip(...)` returns `null` (no `reviewedAt`), render the bare span unchanged — no provider, no trigger — so the "Not reviewed" state stays a plain pill.

`asChild` is not available in `@base-ui/react` — use the `render` prop or wrap the span directly inside `TooltipTrigger` (whichever matches our existing tooltip usage elsewhere in the codebase; check `find src -name "*.tsx" | xargs grep -l "TooltipTrigger" | head -3` and copy the pattern).

### Step 1.2 — Thread reviewer data through the callers

The three primary callers each already have access to the relevant section review row (`application_section_reviews`):

- [`ServiceDetailClient.tsx:1172`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx:1172) and `:1215` — section-level badges
- [`SectionHeader.tsx:29`](src/components/admin/SectionHeader.tsx:29)
- [`ServiceCollapsibleSection.tsx:194`](src/components/admin/ServiceCollapsibleSection.tsx:194)
- [`SectionNotesHistory.tsx:59`](src/components/admin/SectionNotesHistory.tsx:59) — already iterating a row, has all three fields locally — easy win
- [`PerProfileReviewSummaryPanel.tsx:206`](src/components/admin/PerProfileReviewSummaryPanel.tsx:206) and `:232`

For each call site, pass `reviewedAt`, `reviewerName`, `notes` from the most-recent `application_section_reviews` row for that section + subject. The query that loads section reviews already joins `profiles(full_name)` via `reviewed_by` — surface it as `reviewer_name` on the row type and pass through.

**Out of scope:** Updating the legacy `application_section_reviews` page (admin/applications/[id]). That surface is on the deprecation path (tech-debt #26). Leave it alone.

### Step 1.3 — Commit + push + CHANGES.md

```
feat: section review badges show reviewer + date + note preview on hover
```

CHANGES.md entry: `## B-100 — Review badge hover tooltip (done <date>)`. Reference [`SectionReviewBadge.tsx`](src/components/admin/SectionReviewBadge.tsx) + caller files in the bullet list.

---

## Batch 2 — Fix address save reset

**Goal:** Edit address field in admin KYC long-form → hit Save → value persists.

### Step 2.1 — Root cause confirmation

The form's `address` field at [`IdentityStep.tsx:548`](src/components/kyc/steps/IdentityStep.tsx:548) calls `onChange({ address: e.target.value })`. The unified save endpoint at [`/api/admin/profiles/[id]/kyc-fields/route.ts`](src/app/api/admin/profiles/[id]/kyc-fields/route.ts) consumes the resulting `kyc_fields` object — but `address` is **not** in `KYC_FIELD_ALLOWED` and **not** in the `profile_fields` allow-list either. Result: the field is silently filtered out; the server returns the unchanged row; the form re-syncs to stale.

Confirm with a quick `git grep -n '"address"' src/app/api/admin/profiles/[id]/kyc-fields/route.ts` — should show only `address_line_1`/`address_line_2`/etc., not bare `"address"`.

### Step 2.2 — Wire `address` through to `client_profiles.address`

Edit [`src/app/api/admin/profiles/[id]/kyc-fields/route.ts`](src/app/api/admin/profiles/[id]/kyc-fields/route.ts):

- Extend the `KycFieldsBody.profile_fields` type to add `address?: string | null`.
- In the section that updates `client_profiles`, include `address` in the update payload + the returned echo.
- Update the audit-log diff capture so `client_profiles.address` changes appear in the audit row (same path used today for `full_name` / `email` / `phone`).

The form layer probably packs `address` into `kyc_fields` (since it sits alongside `address_line_*`). Two options — pick whichever lands cleaner after reading the form's submit logic in `AdminPerProfileEditor`-equivalent:

- **Option A (preferred):** server-side, if a key in `kyc_fields` is one of the `client_profiles` fields, route it to the `client_profiles` update branch instead of dropping. Clean, future-proof; cost is a small `CLIENT_PROFILE_FIELDS = new Set(["full_name", "email", "phone", "address"])` constant + a 4-line splitter.
- **Option B:** change the form to put `address` into `profile_fields` instead of `kyc_fields`.

If Option A, also surface `address` on the response's `profile` echo so the form's `savedFields` snapshot resets correctly.

### Step 2.3 — Manual smoke test

In the dev server, open `/admin/services/<some-id>`, expand a profile in People & KYC, edit the address field, click Save. Verify:
- Toast confirms save
- Field stays populated after the post-save re-render
- A second Save (no changes) doesn't re-trigger dirty state
- `audit_log` row exists with `previous_value` and `new_value` for `address`

### Step 2.4 — Commit + push + CHANGES.md

```
fix: admin KYC address field persists on save (was silently dropped by allow-list)
```

CHANGES.md entry under B-100 batch 2.

---

## Batch 3 — Waive document

**Goal:** Admin can waive any KYC document requirement. Waived requirements disappear from the client upload list. Action is reversible. Both actions are audit-logged.

### Step 3.1 — Migration: `waived_document_requirements`

File: `supabase/migrations/<timestamp>_waived_document_requirements.sql` (use `npx supabase migration new waived_document_requirements`).

```sql
CREATE TABLE IF NOT EXISTS waived_document_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001'
    REFERENCES tenants(id),
  client_profile_kyc_id uuid NOT NULL
    REFERENCES client_profile_kyc(id) ON DELETE CASCADE,
  service_id uuid NOT NULL
    REFERENCES services(id) ON DELETE CASCADE,
  document_category text NOT NULL,
  -- subject_role_type discriminates same-category requirements that exist on
  -- multiple roles (e.g. a "proof_of_address" doc requirement for director
  -- vs UBO on the same profile). NULL = applies regardless of role.
  subject_role_type text,
  waived_at timestamptz NOT NULL DEFAULT now(),
  waived_by uuid NOT NULL REFERENCES users(id),
  UNIQUE (client_profile_kyc_id, service_id, document_category, subject_role_type)
);

CREATE INDEX IF NOT EXISTS idx_waived_doc_reqs_kyc ON waived_document_requirements(client_profile_kyc_id);
CREATE INDEX IF NOT EXISTS idx_waived_doc_reqs_service ON waived_document_requirements(service_id);

ALTER TABLE waived_document_requirements ENABLE ROW LEVEL SECURITY;
-- App talks to this table through service-role admin client only, mirroring
-- how application_section_reviews is gated today. No anon-key policies.
```

**Decisions encoded:**
- Keyed on the `(kyc, service, category)` tuple — not on an `uploaded_document` row, because the whole point is the client never uploads.
- `subject_role_type` is nullable because some doc requirements aren't role-scoped today. Check how the KYC Documents tab keys requirements (from B-097) and align the column with that key shape before writing the migration. If today's requirement key is just `document_category`, leave the role column NULL on writes.
- No `reason` column — Vanessa specifically said "just a modal", no reason.

Run `npm run db:push` + `npm run db:status` immediately after writing.

### Step 3.2 — API routes

Create [`src/app/api/admin/services/[id]/waive-document/route.ts`](src/app/api/admin/services/[id]/waive-document/route.ts) (or extend the closest existing service-scoped admin endpoint if there's a natural home):

- `POST` — body `{ client_profile_kyc_id, document_category, subject_role_type?: string | null }` → upsert the waiver row → write `audit_log` with `action_type = "document_requirement_waived"`, `target_type = "client_profile_kyc"`, `target_id = client_profile_kyc_id`, `metadata = { service_id, document_category, subject_role_type }`. Return the inserted row.
- `DELETE` — body same shape → delete the waiver row → audit `"document_requirement_unwaived"` with the same metadata shape. Return `{ ok: true }`.

Auth: only callers in `admin_users` can hit these. Use the same pattern as `section-reviews/route.ts`.

### Step 3.3 — Admin UI: Waive / Un-waive action

In the KYC Documents tab on the per-profile body (from B-097 — find the component via `grep -rn "KycDocumentsTab\|KycDocs" src/components`), each requirement row gets a kebab/overflow menu (or an inline secondary button if rows aren't dense — match prevailing pattern). Items:

- **Not waived:** `Waive document` → opens a small confirm dialog (use `src/components/ui/dialog.tsx`): title `Waive this document?`, body `The client will no longer be asked to upload this document. You can un-waive it at any time.`, primary action `Waive`, secondary `Cancel`. On confirm → POST → optimistic row update with a faded "Waived" pill.
- **Waived:** Row renders in a muted treatment (the existing "Waived" pill replaces the normal status pill). Menu shows `Un-waive` → DELETE on the same key, no confirm (single-click reversal is fine for a low-risk action).

Surface the waiver row's `waived_at` + `waived_by` on hover using the same Tooltip pattern from Batch 1 ("Waived on <long date> by <name>") — small consistency win, no extra spec.

### Step 3.4 — Client portal: hide waived requirements

Find the client-side document upload list (likely under `src/app/(client)/services/[id]/` or `src/components/client/`). The list is built from the service template's required-document spec. After computing the spec, filter out any `(client_profile_kyc_id, document_category)` pair present in `waived_document_requirements` for this service.

Source the waivers via a server-side query — the page is server-rendered. If the page is split server/client, hydrate the waived set as a prop.

### Step 3.5 — Commit + push + CHANGES.md

```
feat: admin can waive KYC document requirements (hidden from client portal, reversible)
```

CHANGES.md entry under B-100 batch 3 — list the migration filename + that `db:push` + `db:status` were run clean.

---

## Batch 4 — Local Director indicator + ISO3 country dropdown

**Goal:**
- New "Local Director" badge appears next to the KYC % on each profile's header when the profile is (a) a director on the current service AND (b) has `passport_country = "MUS"`.
- `passport_country` field across the app uses a single shared `<CountrySelect>` that **stores ISO3** but **displays country name**.
- AI passport extraction returns ISO3 in `applicant_nationality` / `passport_country`.

### Step 4.1 — Build canonical ISO3 country list

File: `src/lib/constants/countries.ts`.

Export:

```ts
export interface Country { iso3: string; name: string; numeric: string; }
export const COUNTRIES_ISO: Country[] = [
  { iso3: "AFG", name: "Afghanistan",    numeric: "004" },
  { iso3: "ALB", name: "Albania",        numeric: "008" },
  { iso3: "DZA", name: "Algeria",        numeric: "012" },
  // … full ISO 3166-1 alpha-3 list (249 entries)
];

export const ISO3_TO_NAME: Record<string, string> = Object.fromEntries(
  COUNTRIES_ISO.map(c => [c.iso3, c.name])
);
export const NAME_TO_ISO3: Record<string, string> = Object.fromEntries(
  COUNTRIES_ISO.map(c => [c.name.toLowerCase(), c.iso3])
);
```

Source the list from `iso-3166-1-alpha-3` published data — the screenshot Vanessa shared is a subset of the official ISO 3166-1 list. Use the **complete** list (currently 249 codes), not just what's in the screenshot. Reference: <https://en.wikipedia.org/wiki/ISO_3166-1_alpha-3>. Keep `numeric` for now — we don't use it yet but it's free metadata and might come up in regulatory exports later.

Don't delete `src/components/shared/MultiSelectCountry.tsx` — it stores names and is used elsewhere (B-011 multi-select country field). Leave the legacy `COUNTRIES` name-list there for now; tech-debt to unify later.

### Step 4.2 — Migrate `CountrySelect` to ISO3-keyed value

File: [`src/components/shared/CountrySelect.tsx`](src/components/shared/CountrySelect.tsx).

Change semantics:
- `value: string` is now expected to be an **ISO3 code** (e.g. `"MUS"`)
- Dropdown options render `name` (search filters by name, but the displayed-selected value is the country name resolved via `ISO3_TO_NAME[value]`)
- `onChange(iso3)` returns ISO3
- Legacy fallback: if `value` is non-empty but not a valid ISO3, treat it as a name and try `NAME_TO_ISO3[value.toLowerCase()]`. If still no match, display `value` as-is with a small italic "(legacy)" tag next to it; selecting any option clears the legacy state and writes ISO3.

Keep the "Other" / custom-entry fallback — but in custom mode the input now accepts a 3-letter code (auto-uppercase, validated against `ISO3_TO_NAME`). If validation fails, don't write; show a small error.

### Step 4.3 — Best-effort backfill migration

File: `supabase/migrations/<timestamp>_backfill_passport_country_iso3.sql`.

```sql
-- B-100 — Best-effort migration of free-text passport_country values to ISO3.
-- Values that don't match (typos, abbreviations, etc.) are left as-is and the
-- UI displays them with a "(legacy)" tag until a user re-selects.
UPDATE client_profile_kyc
SET passport_country = 'MUS'
WHERE LOWER(passport_country) IN ('mauritius');
UPDATE client_profile_kyc
SET passport_country = 'GBR'
WHERE LOWER(passport_country) IN ('united kingdom', 'uk', 'great britain');
UPDATE client_profile_kyc
SET passport_country = 'USA'
WHERE LOWER(passport_country) IN ('united states', 'united states of america', 'us', 'usa');
-- … extend with whatever values currently appear; query first to see distribution.
```

**Process:**
1. Before writing the migration, run a one-off query through Supabase MCP / db CLI to dump `SELECT DISTINCT LOWER(passport_country), COUNT(*) FROM client_profile_kyc GROUP BY 1 ORDER BY 2 DESC;` — paste the result into CHANGES.md so we have a record of what was in the field pre-migration.
2. Write only the mappings that actually appear (don't bother encoding the full 249-country reverse map — only what's in production).
3. Apply, push, status-check.

Same migration for `nationality` if that column is also storing names (check the data — if it's mostly empty or already ISO3, skip).

### Step 4.4 — Wire `CountrySelect` into KYC forms

Files that today render `passport_country` (and similar fields) as text inputs or with the old `CountrySelect`:

- `src/components/kyc/IndividualKycForm.tsx` — passport_country, nationality
- `src/components/kyc/OrganisationKycForm.tsx` — jurisdiction_incorporated, jurisdiction_tax_residence
- `src/components/kyc/steps/IdentityStep.tsx` — passport_country, nationality
- Any step in `src/components/kyc/steps/` that asks for a country

Replace each with `<CountrySelect value={iso3} onChange={iso3 => onChange({ field: iso3 })} />`. Read-only/disabled mode for the client portal stays unchanged.

### Step 4.5 — AI extractor: return ISO3

File: [`src/lib/ai/verifyDocument.ts`](src/lib/ai/verifyDocument.ts).

Find the system prompt that asks Claude to extract passport fields. Add to the instruction:

> Country codes (nationality, passport country, country of birth, country of residence) MUST be returned as ISO 3166-1 alpha-3 three-letter uppercase codes (e.g. `MUS`, `GBR`, `USA`). If you cannot determine the ISO3 code with high confidence, return `null`.

Add a small post-processing guard: if the model returns a non-ISO3 value, run it through `NAME_TO_ISO3` lookup as a fallback before rejecting.

Update the verification result type comment to reflect the new format. Bump any inline test fixture used by `tests/integration/api/verify-document*.test.ts` to use ISO3 — check if there are tests that assert "Mauritius" as a string and update them.

### Step 4.6 — Local Director badge

Find the profile header row that today renders the KYC % pill — likely in `src/components/admin/PerProfileHeader.tsx` or wherever the profile bar inside People & KYC lives (`grep -rn "KYC %\|kycPercentage\|kyc_percent" src/components/admin/`).

Add adjacent to the KYC % pill (same horizontal alignment, small gap):

```tsx
{isLocalDirector && (
  <span className="inline-flex items-center gap-1 rounded-full bg-brand-navy/10 px-2 py-0.5 text-xs font-medium text-brand-navy">
    🇲🇺 Local Director
  </span>
)}
```

(Drop the flag emoji if the brand bar doesn't already use country flags — check what's in use; we don't want it to look out of place. A plain text pill is fine.)

Computation:

```ts
const isLocalDirector =
  profile.passport_country === "MUS" &&
  serviceRoles.some(r => r.service_role_type === "director" && r.service_id === currentServiceId);
```

The two inputs are already loaded in the page bundle — `profile.passport_country` is on the KYC row that's already fetched for the form, and `serviceRoles` come from `profile_service_roles` joined on the service. No new fetch needed.

**Out of scope:** Showing the badge anywhere else (client list, services list, admin dashboard cards). Vanessa scoped this to "next to KYC %" only.

### Step 4.7 — Commit + push + CHANGES.md

```
feat: ISO3 country dropdown + AI extractor + Local Director badge on profile header
```

Two migrations to mention in CHANGES.md (waived_document_requirements is Batch 3's; backfill_passport_country_iso3 is Batch 4's). Confirm `db:status` is clean after both.

---

## Acceptance criteria (run before declaring brief done)

- [ ] `npm run build` clean after each batch
- [ ] Hovering a Reviewed / Flagged / Rejected badge anywhere on `/admin/services/[id]` shows `<verb> on <long date> by <reviewer> — <80-char note preview…>`; no tooltip when there's no review row
- [ ] Editing the KYC address field on a profile + Save → value persists; `audit_log` shows the diff
- [ ] In the KYC Documents tab, clicking the kebab on any unwaived row → "Waive" → confirm → row shows muted "Waived" pill; client portal (open as the client user) no longer lists that requirement in the upload list
- [ ] Clicking "Un-waive" on a waived row restores it instantly; client portal sees it again on next load
- [ ] `audit_log` has `document_requirement_waived` + `document_requirement_unwaived` rows with `service_id`/`document_category`/`subject_role_type` in metadata
- [ ] Profile header shows "Local Director" pill on any profile that's a director on the current service + has `passport_country = "MUS"`; toggling either condition removes the badge
- [ ] `CountrySelect` opened on the passport_country field shows the country name, search works, selecting "Mauritius" stores `"MUS"` (verify via DB query or Network tab)
- [ ] An AI re-verification of a passport doc returns ISO3 in the passport_country / nationality fields (test by clicking Re-verify on an existing passport document and inspecting `ai_extracted_data`)
- [ ] `npm run db:status` clean
- [ ] CHANGES.md has four sub-entries under `## B-100`, one per batch, with file references + decisions captured

---

## Tech debt to log (don't fix in this brief)

Append to `docs/tech-debt.md` after Batch 4:

- **Two parallel country lists** — `src/components/shared/MultiSelectCountry.tsx` still exports its own name-only `COUNTRIES` list. Once `CountrySelect` migrates to ISO3, `MultiSelectCountry` should too — but it's used in non-passport contexts (geographical area, etc.) where ISO3 storage isn't strictly needed. Unify when there's a real need to query "all profiles in Mauritius" across both fields.
- **`passport_country` column is still `text`** — not constrained to ISO3 at the DB level. After the backfill has run and the UI is the only writer, add a check constraint `CHECK (passport_country IS NULL OR passport_country ~ '^[A-Z]{3}$')`. Skipped here to keep the backfill blast radius small.
- **Local Director check is client-side only** — fine for the badge today, but if we later need to filter "show me all local directors" in admin queries, hoist to a SQL view that joins `client_profile_kyc + profile_service_roles` and exposes a boolean.

---

## After all four batches

Last commit + push → `CHANGES.md` shows four B-100 entries → tell Vanessa one line: "B-100 done — four batches, all pushed to main." Stop.
