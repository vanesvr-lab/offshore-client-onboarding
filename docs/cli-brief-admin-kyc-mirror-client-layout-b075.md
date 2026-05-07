# CLI Brief — B-075 Admin KYC Step 4 Mirrors Client Layout

**Status:** Ready for CLI
**Estimated batches:** 5
**Touches migrations:** No
**Touches AI verification:** No
**Resolves:** Visual divergence between admin and client KYC views (B-074 partial fix landed in `KycLongForm` but admin still uses `PersonsManager`'s bespoke 2-col grid)

---

## Why this batch exists

B-074 added `readOnly` + inline section reviews to `KycLongForm` (the client portal's KYC component). But the admin view at `/admin/services/[id]` Step 4 doesn't use `KycLongForm` — it uses `PersonsManager` with its own custom 2-col grid layout. Same data, two visually unrelated components.

Vanessa side-by-side compared the two views (2026-05-07) and confirmed: the admin and client layouts look completely different despite the brief's "mirror the client portal" goal.

This brief makes them actually mirror by rendering the SAME `KycLongForm` on both paths, gated by mode.

Field divergence is also intentional: the admin captures **additional details** beyond what the client provides. Those admin-only fields stay editable for admin while client-shared fields are disabled (read-only) for admin. The shared field "Business Description" is currently labelled "Description of activity" on the admin side — normalize to one label.

---

## Hard rules

1. Complete all 5 batches autonomously. Commit + push + update CHANGES.md after each.
2. **Do NOT introduce a parallel KYC component for admin.** The whole point is one source of truth. If `KycLongForm` doesn't accept all the props needed (mode, adminOnlyFields, etc.), extend it. Don't fork.
3. Section keys for KYC subsections stay as B-069/B-073/B-074 defined: `kyc:<client_profiles.id>:<category>`. Existing review rows must continue to display.
4. Mobile-first. 375px clean.
5. `npm run build` must pass before declaring any batch done.

---

## Batch 1 — Field audit + label normalization

Before refactoring layout, identify which fields are shared vs admin-only and normalize labels.

### 1a — Field inventory

CLI: read `src/components/admin/PersonsManager.tsx` (the admin path) and `src/components/kyc/KycLongForm.tsx` (the client path). For each form field collected on either side, classify as:

- **Shared** — present on both client + admin. Label may differ; pick the client label as canonical.
- **Admin-only** — present only on admin. Stays admin-only after the merge.
- **Client-only** — present only on client (unlikely but check). Stays as-is.

Write the inventory into `docs/kyc-field-inventory.md` (a working doc, gets deleted at end of brief). Format as a Markdown table:

| Field key | Client label | Admin label | Category | Decision |
|---|---|---|---|---|
| business_description | Business Description | Description of activity | Company | Shared — use "Business Description" |
| industry_sector | Industry sector | (missing) | Company | Shared — must be visible on admin too |
| listed_or_unlisted | Listed or unlisted | (missing) | Company | Shared — must be visible on admin too |
| ... | ... | ... | ... | ... |

Don't make code changes yet — just the inventory.

### 1b — Label normalization

Once the inventory is written, update any field labels in `KycLongForm.tsx` to the canonical labels (typically the client label is canonical). For example, if the admin uses "Description of activity" and the client uses "Business Description", canonical is "Business Description" and the admin path will adopt it after Batch 3.

Acceptance:
- `docs/kyc-field-inventory.md` exists with every shared and admin-only field listed
- Any cosmetic label tweaks to `KycLongForm` are limited to Shared field labels
- Build passes

**Commit message:** `chore: KYC field inventory + label normalization`

---

## Batch 2 — Extend `KycLongForm` to accept `mode` and admin-only fields

Add to `KycLongForm`:

```ts
type Props = {
  // existing props...
  mode?: "client" | "admin";       // default "client"
  readOnly?: boolean;              // existing from B-074
  applicationId: string;           // service id (column name misleading per #26)
};
```

When `mode === "admin"`:
- Render the admin-only fields (from the inventory in Batch 1) inline in the appropriate category section
- Admin-only fields stay **editable regardless of `readOnly`** — the readOnly flag applies to client-shared fields only
- Shared fields respect `readOnly` (disabled when true)

Implementation approach: the existing field-render logic in `KycLongForm` likely iterates over a config array. Add a `clientOnly?: boolean` and/or `adminOnly?: boolean` flag to each entry. When rendering:
- `clientOnly === true` → show only when `mode === "client"`
- `adminOnly === true` → show only when `mode === "admin"`
- Neither flag → shared, always show

For the disabled state:
- `readOnly && !field.adminOnly` → render with `disabled` attribute
- `field.adminOnly` → always editable

A separate save endpoint may be needed for admin-only fields. Use the existing PATCH endpoints for the shared client_profile_kyc fields (admin can write to those when not in readOnly — toggleable later, but for this brief, `readOnly={true}` is the default for admin so PATCHes from admin only fire for admin-only fields).

If admin-only fields don't yet have DB columns:
- Add a JSONB column `admin_extras jsonb DEFAULT '{}'::jsonb` on `client_profile_kyc` via a one-line migration
- Admin-only field saves go into this JSONB blob
- Document the keys used in `admin_extras` in a code comment

If admin-only fields ALREADY have DB columns (they currently store via PersonsManager's bespoke layout), reuse those columns — don't introduce a new JSONB.

Acceptance:
- `KycLongForm` renders correctly in both client and admin mode
- Admin-only fields appear only when mode="admin"
- Admin-only fields stay editable even when readOnly=true
- Existing client flow is unaffected (default behavior unchanged)
- Build passes

**Commit message:** `feat: KycLongForm accepts mode prop + admin-only field rendering`

---

## Batch 3 — Replace PersonsManager admin Step 4 layout with KycLongForm

The big swap.

In `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`, the Step 4 (People & KYC) currently renders `PersonsManager` with its own 2-col grid + "Continue KYC for X" / "View Summary" / "Request KYC" buttons.

Replace with:

1. **Per-person summary cards** at the top — keep the boxed-card pattern Vanessa likes (same look as the client portal's per-person card list). Each card shows: name + role badges + KYC % progress + status badge (aggregate from subsection reviews) + buttons: `Continue KYC for X` / `View Summary` / `Request KYC` (or `Resend invite`).
2. When admin clicks `Continue KYC for X`:
   - The card expands inline (or navigates within the same step) into the SAME wizard stepper the client sees: Contact → Company → Tax → Documents → Review
   - Each step renders `KycLongForm` with `mode="admin"` and `readOnly={true}` for shared fields
   - Inline section review affordances (from B-074) render at each subsection within the wizard
   - Profile-tab selector at the top so admin can flip between profiles without backing out (the client portal has this — match exactly, including the ●●●● progress dots and `← Back to People` link)
3. **Delete the bespoke 2-col grid** rendering inside `PersonsManager` for the admin path. The component may still be used by the client path — if so, gate the admin layout via `mode` prop. If it's admin-only, delete the file entirely.

The "Roles: [Director] [Remove] / [Shareholder] [+Add]" picker on the admin side becomes the same checkbox-style "Roles: [✓ Director] [☐ Shareholder]" group the client sees. Same component, same behavior — admin can toggle roles since that's an admin-only action.

Acceptance:
- Admin Step 4 visually mirrors the client portal: profile-tab selector, wizard stepper, progressive form, KYC documents status box with color legend, etc.
- Side-by-side comparison shows admin and client are visibly the same component (only differences: admin-only fields visible, admin-only role-edit affordance, status badges + Review buttons inline)
- Existing per-person card buttons still work
- All existing section_reviews on `kyc:<id>:<cat>` keys still display
- Build passes; mobile clean

**Commit message:** `feat: admin Step 4 renders KycLongForm — mirrors client portal layout`

---

## Batch 4 — Verify field parity + admin extras editing

Smoke test path (CLI does this manually after Batch 3 lands):

1. Open `/admin/services/<gbc-0002>` Step 4
2. Click `Continue KYC for Elarix LLC` (the corporate director — `client_profile.id` = `d6070bed-7ad0-4fd5-bcbf-7e1f58952644`)
3. Verify: same wizard stepper as client (Contact → Company → Tax → Documents → Review)
4. Verify: every shared field from the inventory is visible AND disabled (read-only)
5. Verify: every admin-only field from the inventory is visible AND editable
6. Edit one admin-only field (e.g. an "Internal admin notes" field if it exists), save, reload — value persists
7. Inline Review button on each subsection still works (open panel, save review, status badge updates)
8. Switch to a different profile via the tab selector — same layout
9. Click `← Back to People` — returns to the per-person card overview

If any of these fail, document in CHANGES.md and stop.

**Commit message:** `chore: smoke test admin KYC mirror end-to-end`

---

## Batch 5 — Cleanup + final polish

1. Delete `docs/kyc-field-inventory.md` — was a working doc, no longer needed
2. If the admin path now has an unused PersonsManager 2-col grid path, remove dead code. Keep PersonsManager itself if the per-person summary cards still use it as a foundation
3. Verify there's no broken navigation between the per-person summary and the wizard view (e.g. URL state is preserved on browser back)
4. Add a CHANGES.md entry for B-075 referencing the deleted bespoke layout, the converged `KycLongForm`, and the new `mode="admin"` prop pattern
5. Background dev server restart:
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
6. Final commit + push.

**Commit message:** `chore: B-075 cleanup — remove bespoke admin KYC layout, dead code purge`

---

## Out of scope

- Field schema changes beyond what's needed to support admin-only extras
- Renaming database columns (still tech debt)
- Client wizard layout changes — client is the source of truth; admin adapts to it, not the other way around
- "Approve All" / "Review all KYC" wizard mode — explicit skip from earlier briefs

---

## Open questions (do not block — choose sensibly)

- If the admin-only fields are scattered across multiple categories (Contact / Company / Tax / Documents), distribute them into the right category. Don't lump them all in one "Admin extras" tab.
- If `KycLongForm` is internally split into smaller per-step components, apply `mode` consistently across all of them. The prop drilling may be ugly — use React context (`KycModeContext`) if it cleans up the call sites.
- The "Review Elarix LLC →" link visible in the client view (top-right of the per-person tab) — admins should see this too, opening the same per-profile aggregate review modal the client sees. If it's already wired to the client mode and not to admin mode, plumb it through.
- The KYC DOCUMENTS status box ("0 of 2 uploaded · FINANCIAL (0/2)") with the color legend (Verified / Flagged / Needs review / Checking / Skipped / Approved / Rejected / Pending) — this should render identically on admin. If it's a separate component, make sure both paths consume it.
