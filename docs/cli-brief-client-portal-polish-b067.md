# CLI Brief — B-067 Client Portal Polish

**Status:** Ready for CLI
**Estimated batches:** 7 (commit + push between each)
**Touches migrations:** Yes (one new migration for invite rate limit)
**Touches AI verification:** Yes (date bug + applicant-name fix)

---

## Why this batch exists

End-user QA pass on the client portal. Vanessa walked through the live flow as Bruce Banner and identified a list of polish items spanning the Home page, the service application wizard, the KYC subsystem, and the AI document verification. None of these are architectural — they're tightening copy, layout, button affordances, AI prompt context, and one rate-limit gap.

**Knowledge-base ingestion of compliance PDFs is OUT OF SCOPE** — that's deferred to B-068 and being scoped separately by Vanessa via Claude Chat.

---

## Hard rules for this brief

1. Complete all 7 batches autonomously. Commit + push + update CHANGES.md after each batch. Do not stop between batches unless blocked.
2. Use the `?` tooltip pattern that already exists in the codebase (search for an existing `Tooltip` / `Popover` / `?` icon — reuse, don't introduce a new component library).
3. For all UI work, follow the existing shadcn/ui (`@base-ui/react`) patterns. **Use `render` prop, not `asChild`.**
4. Mobile-first: every visual change must look correct at 375px width. Use `flex-col sm:flex-row` and `grid-cols-1 sm:grid-cols-N` patterns.
5. After the entire brief is complete, run the dev-server restart pattern in the background (`pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev`).
6. **`npm run build` must pass** before declaring any batch done.
7. Do not change the `/dashboard` route URL — only the user-facing label changes to "Home".

---

## Batch 1 — Home page rename + welcome banner

**Files:**
- `src/components/shared/Sidebar.tsx` — change "Dashboard" label to "Home" (client sidebar only — admin sidebar untouched)
- `src/app/(client)/dashboard/page.tsx` — page heading + welcome banner

**Changes:**
1. Sidebar nav item label: `Dashboard` → `Home`. Route stays `/dashboard`.
2. Page heading at top of `/dashboard`: change to `Home`.
3. Add a welcome banner at the top of the page, above the application list:
   - Pull `session.user.name` (first name only — split on first space, fall back to full name if no space).
   - Banner copy: `Welcome <FirstName>. Thank you for choosing GWMS.`
   - Style: subtle card or banner using existing brand-navy/brand-blue tokens. Not an alert — just a friendly greeting.
4. Each application card on the dashboard:
   - If completion < 100%, add a single line below the existing card content: `Your application for <Service Name> is X% complete — ` followed by a `Review →` link button that navigates to the appropriate wizard step (continue where they left off — use the same logic the existing "Continue" / "Review" affordance uses).
   - If completion = 100%, do not show this nudge line.
   - "<Service Name>" comes from the service template's display name.

**Acceptance:**
- Sidebar shows "Home" on client portal, still shows correct active state on `/dashboard`.
- Admin sidebar is untouched.
- Bruce sees `Welcome Bruce. Thank you for choosing GWMS.` at the top of the dashboard.
- Each incomplete application card shows the % + Review link; complete ones do not.
- Build passes. Mobile (375px) renders cleanly.

**Commit message:** `feat: rename client Dashboard to Home + add welcome banner with per-application progress nudge`

---

## Batch 2 — Service wizard polish

**Files:**
- `src/app/(client)/apply/[templateId]/details/page.tsx` — Company step (proposed name + 3 inputs, country dropdown, financial section)
- Any banking section file under the same `apply/` tree
- Any shared input component if number formatting requires a new helper

**Changes:**

### B2.1 — Proposed company name → 3 separate labeled inputs

- The DB column already exists: `proposed_names text[]` (see `supabase/schema.sql:618` and `src/types/index.ts:454`). No migration needed.
- Render **three** stacked labeled inputs bound to `proposed_names[0]`, `[1]`, `[2]`:
  - `Proposed Name 1: [input]` — required (asterisk shown), maps to `proposed_names[0]`
  - `Proposed Name 2: [input]` — optional, maps to `proposed_names[1]`
  - `Proposed Name 3: [input]` — optional, maps to `proposed_names[2]`
- Each is its own labeled field (visible label, not placeholder-only).
- Add a `?` tooltip next to the **Proposed Name 1** label only: `Provide your preferred company name for Name Reservation with the Registrar of Companies. You can suggest up to three alternatives in case your first choice is unavailable.`
- On submit: build the array as `[name1, name2, name3].filter(s => s && s.trim() !== "")` so empty optional fields don't pollute the array.
- On load: if `proposed_names` has fewer than 3 entries, the missing slots render as empty inputs. If it has more than 3 (legacy data), only show the first 3 and warn in console — but never silently drop them on save (preserve any extras when writing back unless the user has touched the inputs, in which case overwrite cleanly).

### B2.2 — Country dropdown border darker

- The country dropdown(s) on the wizard currently have a lighter outline than the other input boxes on the same step.
- Change the border to match the standard input border color (the same darker gray Tailwind token used by `<Input>`).
- Apply this to every country dropdown that appears in the client wizard, not just one (search for `MultiSelectCountry` and any single-select country inputs).

### B2.3 — Financial section thousand separators

- Every currency/amount input in the Financial section of the client service wizard must show thousand separators (e.g. `1,250,000`).
- Behavior:
  - On focus: show raw digits (no separators) so the user can edit without commas getting in the way.
  - On blur: re-format with thousand separators using the user's locale (`en-US` is fine as default).
  - Stored value in form state and DB: always raw number (no separators).
- Implement once as a reusable input component (e.g. `<NumberInput thousandSeparator />`) so it's shared across Financial + Banking sections.

### B2.4 — Banking section thousand separators

- Same `<NumberInput>` component applied to all amount fields in the Banking section.

**Acceptance:**
- Three labeled "Proposed Name" inputs render; only Name 1 is required.
- Tooltip on Name 1 explains the Registrar context.
- Existing single-field values appear in Name 1 on first load (no client loses data).
- Country dropdowns visually match other inputs' border.
- Currency fields show `1,250,000` style on blur, raw digits on focus, store as number.
- Form submission still validates and saves correctly.
- Build passes.

**Commit message:** `feat: client wizard polish — 3 proposed name fields, country border, thousand-separator currency inputs`

---

## Batch 3 — KYC card compact layout + button styling + heading rename

**Files:**
- `src/components/client/PersonsManager.tsx` (and/or `ServicePersonsManager.tsx` — whichever renders the per-person cards on the client side)
- `src/components/client/ServiceWizardPeopleStep.tsx` if applicable

**Changes:**

### B3.1 — Compact card header (single row)

- Current per-person card has a bulky header. Restructure it to a **single horizontal row** with two regions:
  - **Left (3/4 width)**: avatar/icon + person's name + role chips (Director / Shareholder / UBO badges).
  - **Right (1/4 width)**: completion percentage as a number + a thin progress bar beneath the percentage.
- Reduce vertical padding on the card header overall.
- On mobile (< 640px), allow the right region to stack underneath the left if 1/4 width becomes unreadable, but keep the percentage visible.

### B3.2 — "Request KYC" / "View Summary" → proper button styling

- These currently look like text links. Convert them to actual `<Button>` components:
  - "Request KYC" — primary variant (`Button variant="default"` or whatever the codebase uses for primary).
  - "View Summary" — secondary/outline variant.
- Make sure they have visible affordance (hover state, focus ring, cursor-pointer).
- Touch target: ≥ 44px min height per ui-ux-pro-max touch-target rule.

### B3.3 — Heading rename

- Wherever the client portal currently shows `New Corporation` as a person/role heading, rename to `Add KYC for New Corporation`.
- Wherever `Review New Corporation →` appears as the action link, rename to `Add KYC for New Corporation →`.
- These are template/role-name driven, so the rename should be: `<RoleOrPersonName>` → `Add KYC for <RoleOrPersonName>`. Apply consistently anywhere the wizard surfaces the "click here to start KYC" affordance for an unstarted profile.
- For profiles where KYC is in-progress (not yet 100%), keep the label as `Continue KYC for <Name>` if such an affordance exists. For complete profiles, `View KYC for <Name>`. (If the codebase only has one button today, just apply the "Add KYC for" rename.)

**Acceptance:**
- Each person card has a single-row compact header with name+roles on left, % + bar on right.
- Vertical padding visibly reduced.
- "Request KYC" / "View Summary" look and behave like buttons (not text links).
- Headings renamed wherever they appear.
- Mobile (375px) still readable — percentage region collapses gracefully if needed.
- Build passes.

**Commit message:** `feat: compact KYC person cards + proper button styling + 'Add KYC for' heading rename`

---

## Batch 4 — KYC tooltip + duplicate document dedupe + doc list parity

**Files:**
- `src/components/client/PersonsManager.tsx` (KYC intro tooltip)
- The KYC documents list component (search for where the per-person Documents card renders the missing-docs list)
- The Review section component (search for where the document list appears in the wizard's Review step)

**Changes:**

### B4.1 — KYC intro `?` tooltip (generic ELI10)

- Add a `?` icon next to the existing copy: `Add directors, shareholders, and UBOs. Click "Review KYC" to complete each person's compliance information.`
- Tooltip body (use this exact copy):

> **Why we ask for this**
>
> Mauritius regulators require us to verify everyone with significant control or ownership of your company. This is called Know Your Customer (KYC) and it's the law for licensed management companies.
>
> **Who you need to add**
>
> - **Directors** — anyone listed on the board
> - **Shareholders** — anyone holding shares (including indirect ownership)
> - **UBOs (Ultimate Beneficial Owners)** — any individual who ultimately owns or controls 25% or more of the company
>
> The same person can have more than one role — just tick all that apply.
>
> **What they'll need**
>
> Each person will be asked for personal details, identification, proof of address, source of wealth, and a few declarations. We'll guide them step by step. You can either fill it in for them or invite them to fill it in themselves.

- Display: tooltip or popover that triggers on click (and hover on desktop). Must be keyboard-accessible (focus + Enter to open).

### B4.2 — Dedupe duplicate documents per person

- Current behavior: if a person holds multiple roles (e.g. Director + Shareholder + UBO) and each role requires "Declaration of Source of Funds", the document list shows it 3 times.
- Desired: dedupe on **document_type** (case-insensitive). When the same document is required by multiple roles, render it once with **all role badges** showing on the same line (e.g. `Declaration of Source of Funds [Director] [Shareholder] [UBO]`).
- Apply this dedupe in the client KYC view (not the admin view — admin keeps full breakdown).
- Make sure the "Before submitting, please upload:" missing-docs list also uses the deduped source.

### B4.3 — Document list parity (Review section ↔ Documents card)

- The wizard's Review step currently shows a different set of documents from the Documents card on the same person's KYC view.
- Make the Documents card the **source of truth**: the Review section must read from the same data feed and render the same deduped list.
- Find both render sites and refactor so they share a single helper (e.g. `getRequiredDocumentsForPerson(person, roleRequirements)`).

**Acceptance:**
- `?` icon visible next to KYC intro copy on the People step.
- Clicking it shows the ELI10 tooltip body verbatim as written above. Keyboard-accessible.
- A person with 3 roles requiring the same document sees it listed once with 3 role badges.
- The Documents card's missing list and the Review step's document list are identical.
- Build passes.

**Commit message:** `feat: KYC intro ELI10 tooltip + dedupe documents across roles + Review/Documents list parity`

---

## Batch 5 — KYC post-review popup

**Files:**
- `src/components/kyc/KycStepWizard.tsx` (or wherever the KYC wizard's "Save and exit" / "Review" submit happens)

**Changes:**

When the user finishes the Review sub-step of a KYC profile (i.e. clicks "Save" or "Done" on the last KYC wizard step), show a modal Dialog before closing the wizard:

- **If profile completion < 100%:**
  - Title: `Profile saved`
  - Body: `You've completed {X}% of KYC for {PersonName}. Please review and provide the missing information before submitting your application.`
  - Single button: `OK` — closes the dialog and the wizard.

- **If profile completion = 100%:**
  - Title: `Profile complete`
  - Body: `You've completed all KYC details for {PersonName}. This profile is ready for submission.`
  - Single button: `OK` — closes the dialog and the wizard.

- `{X}` = current completion percentage as integer (no decimals).
- `{PersonName}` = `kyc_records.full_name`, or fall back to person role label if name is empty.

Use the existing `Dialog` component from the codebase. Must be keyboard-dismissible (Esc closes), focus traps inside the dialog, OK button is the primary CTA and auto-focused.

**Acceptance:**
- Saving a 64% profile shows the < 100% dialog with correct percentage and name.
- Saving a 100% profile shows the complete dialog.
- Clicking OK closes both the dialog and the wizard.
- Esc closes the dialog only (wizard stays open).
- Build passes.

**Commit message:** `feat: post-review confirmation dialog showing KYC completion state per profile`

---

## Batch 6 — Resend-invite rate limit (3 per profile per 24h)

**Files:**
- New migration: `supabase/migrations/<timestamp>_kyc_invite_rate_limit.sql`
- `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` — server-side enforcement
- The "Resend Invite" UI button on the client side — show "Try again in Xh" message when blocked

**Changes:**

### B6.1 — Migration

Add to `kyc_records` (or wherever invite tracking already lives):
- `invites_sent_count_24h` integer not null default 0
- `invites_count_window_start` timestamptz null

Use `ADD COLUMN IF NOT EXISTS`. After applying:
- `npm run db:push` (CLI must run this — do not defer to user, per CLAUDE.md migration rule)
- `npm run db:status` and confirm Local/Remote pair shows for the new migration with no drift.

### B6.2 — Server enforcement

In the resend-invite endpoint:

```
On invite send:
  1. Read kyc_records row.
  2. If invites_count_window_start is null OR more than 24h ago:
       reset window_start = now(), count = 1, send invite.
  3. Else if count >= 3:
       return 429 with body { error: "rate_limited", retry_after_seconds: <seconds until window_start + 24h> }
  4. Else:
       increment count, send invite.
  5. Always update last_invite_sent_at as today.
```

### B6.3 — UI feedback

- When the server returns 429 with `retry_after_seconds`, the UI shows: `You've sent the maximum 3 invites today. You can send another in Xh.` (X = ceil(retry_after_seconds / 3600)).
- Disable the Resend button until the window resets (compute client-side from the API response — no need to poll).
- Customer can still send 1, 2, or 3 invites freely — only the 4th is blocked.

**Acceptance:**
- Migration file in `supabase/migrations/`, idempotent, pushed to prod, `db:status` clean.
- 4th invite within 24h returns 429.
- Window resets exactly 24h after the first invite of the burst.
- UI button disables and shows clear "Try again in Xh" message.
- Build passes.

**Commit message:** `feat: enforce 3-invite-per-profile-per-24h limit on KYC resend with clear UI feedback`

---

## Batch 7 — AI verification fixes

**Files:**
- `src/lib/ai/verifyDocument.ts`

**Changes:**

### B7.1 — Inject today's date into the AI prompt

**Bug:** The AI is flagging documents dated 14 April 2026 as "future-dated" when today is 5 May 2026. Root cause: the verification prompt does not pass today's date, so Claude falls back to its training cutoff.

**Fix:** In the `applicationContext` block builder (around line 209–227), add at the top of the context lines:

```ts
push("Today's date", new Date().toISOString().slice(0, 10));
```

This must appear before all other `push()` calls so it's the first line of the context block. The prompt is cached, so put it first to keep stability.

### B7.2 — Pass applicant full_name to verification context

**Bug:** Passport verification fails the name-match rule with "No applicant name provided in application context — unable to verify name match" — because the person's `full_name` from `kyc_records` is not being passed to verification when the document belongs to a per-person KYC submission (only `applicant_full_name` from the top-level application context flows through today).

**Fix:** In whichever route handler invokes `verifyDocument()` for per-person KYC documents (search for callers of `verifyDocument` — most likely under `src/app/api/kyc/...`), populate `applicationContext.applicant_full_name` from the person's `kyc_records.full_name` before calling. If both an application-level applicant name and a person-level name exist (e.g. director's own KYC), prefer the person's name.

**Acceptance:**
- Re-uploading the proof-of-residence dated 14 April 2026 today (5 May 2026) passes the "within last 3 months" rule.
- Re-uploading the certified passport copy passes the name-match rule against the person's declared full name.
- Build passes.
- Existing verification tests still pass.

**Commit message:** `fix: inject today's date and applicant full_name into AI document verification context`

---

## Final acceptance for B-067 (run after all 7 batches)

1. `npm run build` — passes clean.
2. `npm run lint` — passes clean.
3. `npm test` — passes (existing tests still green).
4. Visit `/dashboard` as a client — see "Home" in sidebar, welcome banner, per-app % nudges.
5. Open the company step — see 3 labeled Proposed Name fields with `?` on Name 1.
6. Type `1250000` in a financial field, blur — see `1,250,000`.
7. Open a person card with 3 roles — header is single row, percentage + bar on right, no duplicate documents.
8. Save a KYC profile — see the post-review dialog with correct % and name.
9. Re-send invites until blocked — see clear "Try again in Xh" message.
10. Re-upload a recent proof-of-residence — name-match and date checks both pass.

After the final commit + push, run in background:
```
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## CHANGES.md template (use after the brief is fully complete)

```
### 2026-05-05 — B-067: Client portal polish (Claude Code)

**Home page:**
- Renamed Dashboard → Home (label only; route unchanged).
- Added welcome banner + per-application % nudge.

**Service wizard:**
- Replaced single proposed-name field with 3 labeled inputs (Name 1 required; tooltip on Name 1).
- Country dropdown border matched to other inputs.
- Reusable <NumberInput> with thousand separators for Financial + Banking.

**KYC subsystem:**
- Compact single-row card headers (name+roles 3/4, % + bar 1/4).
- "Request KYC" / "View Summary" → proper buttons.
- "<Name>" → "Add KYC for <Name>" headings + action labels.
- ELI10 `?` tooltip on KYC intro.
- Deduped documents per person across roles (badges show all roles).
- Review section + Documents card share a single helper for parity.
- Post-review confirmation dialog with completion % per profile.
- Resend invite rate-limited to 3 per profile per 24h, with clear UI feedback.

**AI verification fixes:**
- Inject today's date into prompt context (fixes "future-dated" false-positives).
- Pass person.full_name into context for per-person KYC documents (fixes "missing applicant name").

**Migration:**
- `<timestamp>_kyc_invite_rate_limit.sql` — adds invites_sent_count_24h + invites_count_window_start to kyc_records. Pushed and verified.

**Out of scope:** Knowledge-base ingestion of compliance PDFs (deferred to B-068).
```

---

## Out of scope for B-067 (do not start)

- Knowledge-base PDF ingestion / chunking (B-068)
- Any admin-portal changes
- Any mobile-only redesign beyond fixing the items above at 375px
- Any new tests (existing test suite must continue to pass; no new coverage required for this batch)
- Refactors not directly listed above
