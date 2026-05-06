# CLI Brief — B-074 Admin KYC Inline Reviews + Visual Containment + FK Re-drop

**Status:** Ready for CLI
**Estimated batches:** 6
**Touches migrations:** Yes (one idempotent re-drop of the section_reviews FK)
**Touches AI verification:** No
**Resolves:** Tech debt #25 (parallel admin KYC panel) and a live FK bug in prod

---

## Why this batch exists

Three issues from QA (2026-05-06):

1. **Live FK bug in prod.** Saving an "Admin Review" on `/admin/services/[id]` returns:
   ```
   23503: violates foreign key constraint application_section_reviews_application_id_fkey
   Key (application_id)=(1c131367-...) is not present in table "applications"
   ```
   The drop migration `20260506155512_drop_section_reviews_application_fk.sql` is on disk and tracked as applied (paired Local + Remote in `db:status`), but the FK is still alive in prod. Live insert test confirms it. Likely a Supabase migration replay quirk where the migration was registered as applied without executing the DROP. Re-running the same statement in a fresh migration will land it definitively.

2. **Navigation is not intuitive.** Sections on the admin detail page render with inconsistent containment — flat headers, thin borders, varying padding. Vanessa wants visible boxed containment around each section, matching the client portal's clean card pattern.

3. **KYC review is confusing.** Today's Step 4 (People & KYC) on `/admin/services/[id]` renders TWO parallel views of the same KYC data:
   - `PersonsManager` — boxed per-person cards with `Continue KYC / View Summary / Request KYC` buttons (the pattern Vanessa likes; matches the client portal exactly)
   - `AdminKycPersonReviewPanel` — a separate panel BELOW PersonsManager, showing 8 subsection cards per profile for review affordances

   Two views of the same data with no visual relationship. Vanessa wants the admin to see the same client-portal layout, with **inline "Admin Review" buttons at each subsection** when the per-person KYC wizard is expanded. No parallel panel.

This brief delivers all three. Tech debt #25 is fully resolved.

---

## Hard rules

1. Complete all 6 batches autonomously. Commit + push + update CHANGES.md after each.
2. After Batch 1 migration: `npm run db:push` and `npm run db:status`. Confirm Local + Remote pair before proceeding. CLI must verify the FK is actually gone (test insert via psql or supabase studio link) before declaring Batch 1 done.
3. Do NOT introduce a `readOnly` prop API on `KycStepWizard` that diverges from existing usage. Pass-through to existing inputs via the `disabled` HTML attribute is the simplest path. If that's invasive, render a CSS-disabled wrapper (`pointer-events: none` + visual cue) — document the choice.
4. Section keys for KYC subsections stay exactly as B-069/B-073 defined: `kyc:<client_profiles.id>:<category>` where category ∈ `identity / financial / compliance / professional / tax / adverse_media / wealth / additional`. Existing review rows in the DB use these keys; we must preserve them.
5. Mobile-first. 375px width must render cleanly.
6. `npm run build` must pass before declaring any batch done.

---

## Batch 1 — Idempotent re-drop of the FK

Create `supabase/migrations/<ts>_drop_section_reviews_fk_again.sql`:

```sql
-- B-074 — Re-drop application_section_reviews.application_id FK.
-- The previous attempt (20260506155512) was tracked as applied but the
-- constraint survived in prod. Live insert tests still fail with 23503.
-- This migration is fully idempotent: if the constraint is already gone,
-- it's a no-op.

ALTER TABLE public.application_section_reviews
  DROP CONSTRAINT IF EXISTS application_section_reviews_application_id_fkey;
```

After file lands:
- `npm run db:push`
- `npm run db:status` — confirm Local + Remote pair
- **Verify the drop took effect** by running a test insert against prod (use the supabase JS service-role client in a one-off Node REPL, or curl):
  ```bash
  curl -s -X POST "$SUPABASE_URL/rest/v1/application_section_reviews" \
    -H "apikey: $SR" -H "Authorization: Bearer $SR" \
    -H "Content-Type: application/json" \
    -d '{"tenant_id":"a1b2c3d4-0000-4000-8000-000000000001","application_id":"1c131367-b89f-44db-8787-6958a306b73d","section_key":"_fk_test","status":"approved","notes":null}'
  ```
  If it returns `23503` again, STOP — document in CHANGES.md and reach out. If it returns the inserted row, proceed (and DELETE that test row).

Update `CHANGES.md`: tech-debt #26 already mentioned the FK was dropped; clarify that the original drop migration didn't take effect on prod and B-074 re-applied it.

**Commit message:** `fix: re-drop application_section_reviews.application_id FK that survived prior migration`

---

## Batch 2 — Visual containment pass

Goal: every reviewable / informational section on `/admin/services/[id]` is contained in a visually distinct box that matches the client portal's card pattern.

Reference: the client portal's per-person cards in `PersonsManager` are the model — `rounded-lg border bg-white shadow-sm` with consistent padding (the screenshot Vanessa sent for B-074 shows this).

Touch:
- `ServiceCollapsibleSection` — make sure each rendered section has a clear container (rounded card border) wrapping the entire section block
- Inside each section, sub-cards (e.g. profile cards within Step 4, document rows within Step 5) keep their own boxed style, but spacing between parent and child boxes should not look like a single flat surface
- Step heading typography stays as-is (matches client wizard)

Apply consistently — the admin should see the same "boxes nested in boxes" rhythm the client sees, not a flat wall of dividers.

Acceptance:
- Each of the 5 main sections (Company Setup / Financial / Banking / People & KYC / Documents) has clear visible containment.
- Profile cards in Step 4 keep their existing per-card box (per screenshot).
- KYC subsection cards (after Batch 4) get the same containment treatment.
- Build passes; mobile (375px) clean.

**Commit message:** `chore: visual containment pass on admin services detail — boxed cards across all sections`

---

## Batch 3 — Add `readOnly` prop to `KycStepWizard`

`src/components/kyc/KycStepWizard.tsx` is the per-person KYC wizard used by both client and admin paths. Today it always renders editable.

Add a `readOnly?: boolean` prop (default `false`). When `true`:
- Every form input gets the `disabled` attribute
- Every textarea gets `disabled`
- Every Save button is hidden (or rendered as `disabled`)
- Document upload tiles render "View" instead of "Upload" (use the existing DocumentPreviewDialog flow)
- The "Save & Continue" / "Save" navigation buttons are hidden — admin uses the section navigation buttons that come from being inside `ServiceCollapsibleSection`
- The wizard's internal autosave logic is gated off (no PATCHes from the admin path)

Verify the wizard still works in client mode (`readOnly=false` is the default — no change to existing behavior). Run the existing E2E tests for the KYC flow if any exist.

**Commit message:** `feat: KycStepWizard accepts readOnly prop — disables inputs + hides save/upload affordances`

---

## Batch 4 — Render `ConnectedSectionHeader` around each KYC category bucket (when admin)

`KycStepWizard` already groups its content into category sub-blocks (Identity / Financial / Compliance / Professional / Tax / Adverse Media / Wealth / Additional). Each sub-block has a heading.

Add an optional prop:
```ts
adminContext?: {
  applicationId: string;        // pass service.id; column name is misleading per #26
  clientProfileId: string;      // for section_key: kyc:<id>:<cat>
};
```

When `adminContext` is provided, wrap each category sub-block's heading area with `<ConnectedSectionHeader>`:
- `title` = the existing category label (e.g. "Identity")
- `sectionKey` = `kyc:<clientProfileId>:<category>` (matching B-069/B-073's format)
- `applicationId` = the passed-in applicationId (i.e. service.id)
- The existing header text stays inside the SectionHeader as a `rightSlot` if needed, or replaces the existing render.

Below each category sub-block's content, render `<ConnectedNotesHistory sectionKey="kyc:<id>:<cat>" />` so the existing review history shows up.

Result: when admin clicks "Continue KYC for X" on the per-person card, the expanded wizard renders read-only with each subsection carrying its own "Review" button + history. Same pattern as the existing ConnectedSectionHeader on the top-level service sections.

Acceptance:
- Admin opens a profile in Step 4, clicks "Continue KYC for [Name]"
- The KYC wizard expands inline, all inputs disabled
- Each subsection (Identity / Financial / etc.) has a Review button + status badge inline with the heading
- Clicking Review opens the existing right-slide SectionReviewPanel
- Saving updates the badge optimistically; history grows below the subsection
- Existing review rows from B-069/B-073 (which used the same key format) still display correctly

**Commit message:** `feat: inline KYC subsection reviews via ConnectedSectionHeader inside KycStepWizard (admin context)`

---

## Batch 5 — Delete the parallel `AdminKycPersonReviewPanel`

With Batch 4 in place, the parallel panel is redundant and visually confusing.

Delete:
- `src/components/admin/AdminKycPersonReviewPanel.tsx`
- The render of it inside Step 4 of `ServiceDetailClient.tsx` (`/admin/services/[id]`)

Verify:
- All existing KYC reviews still render (they should; the keys haven't changed)
- The aggregate status badge on each profile card still works (use `useAggregateStatus(['kyc:<id>:identity', 'kyc:<id>:financial', ...])`) — if the badge logic was inside the deleted panel, lift it into the per-person card render in `PersonsManager` first
- Section reviews on `kyc:<id>:<cat>` keys still work end-to-end

Update tech debt #25 → move to "Resolved" in CHANGES.md.

**Commit message:** `refactor: delete AdminKycPersonReviewPanel — reviews now inline inside KycStepWizard`

---

## Batch 6 — Final polish + dev server restart

- Verify per-person cards on Step 4 have the aggregate badge (derived from subsection reviews) visible without expanding the card. Place near the existing role badges in the card header so admin sees status at a glance.
- The "Add Director / Add Shareholder / Add UBO" tabs at the top of Step 4 keep their existing dashed-border style (matching the screenshot).
- Ensure the per-person card buttons stay as: `Continue KYC for X` / `View Summary` / `Request KYC` (or `Resend invite` if already invited). NO profile-level "Admin Review" button — review is at the subsection grain.
- The `Review all KYC` button at top right of Step 4 (visible in the screenshot) is OUT OF SCOPE for this brief — leave it as-is or hide it for now if the existing wiring is buggy.

End of brief:
1. `npm run build` clean
2. CHANGES.md updated with B-074 entry — references the FK re-drop migration, the parallel panel deletion, and tech debt #25 → resolved
3. Background dev server restart:
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. Final commit + push.
5. Stop.

**Commit message:** `chore: B-074 polish + tech debt #25 resolved`

---

## Out of scope

- "Approve All" / "Review all KYC" wizard mode — explicitly skipped (was deferred from B-069 too)
- Profile-level review key (e.g. `kyc:<profile>:overall`) — derived aggregate from subsections is sufficient
- Renaming `application_section_reviews.application_id` → `subject_id` — still tech debt #26, defer until legacy `applications` table is fully retired
- B-070 field provenance markers — already shipped; marker placement may need tweaking after the KycStepWizard refactor; treat as a B-074 follow-up if visible regression

---

## Open questions (do not block — choose sensibly)

- If `KycStepWizard`'s autosave fires `useEffect` on mount even when readOnly, gate the effect on `!readOnly`.
- If two consumers of `KycStepWizard` (the client wizard and the admin wizard) need different doc-tile UIs (Upload vs View), accept a `documentMode?: "upload" | "view"` prop — default to `"upload"` (client) and pass `"view"` from admin.
- The `Review all KYC` button at top of Step 4 — if its current wiring depends on the deleted `AdminKycPersonReviewPanel`, hide it. Don't burn time fixing a stub button this brief doesn't own.
