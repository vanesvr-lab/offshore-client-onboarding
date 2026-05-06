# CLI Brief — B-069 Admin View Mirrors Client Wizard + KYC Subsection Reviews

**Status:** Ready for CLI (depends on B-068)
**Estimated batches:** 5
**Touches migrations:** No
**Touches AI verification:** No

---

## Why this batch exists

After B-068 lands the section-review primitive, Vanessa wants the admin's application detail page to **look and feel like the client wizard** — same step indicator, same per-section navigation, same per-person KYC sub-wizard the client sees. The admin uses it in *review mode*: read-only data, but with section-review affordances at every level (overall sections + each KYC subsection per profile).

Goal: when an admin opens an application, the layout matches what the client filled in. Admins can see the same logical structure the client experienced, with status badges + Review buttons inline at every level.

---

## Hard rules

1. Complete all 5 batches autonomously. Commit + push + update CHANGES.md after each.
2. Do NOT introduce new tables. All data plumbing was done in B-068.
3. Reuse client wizard components in read-only mode rather than building parallel admin variants. If a component needs read-only support, add a `readOnly` prop and guard mutations.
4. Right-column sidebar (Stage Management, Communication, Audit Trail, Account Manager) stays as-is. This brief only touches the left/main content area.
5. Mobile-first. 375px width must render cleanly.
6. `npm run build` must pass before declaring any batch done.
7. Do NOT regress B-068's section reviews — every section that was reviewable stays reviewable.

---

## Batch 1 — Step indicator + section navigation shell

Create `src/components/admin/AdminApplicationStepIndicator.tsx`:

- Mirrors the visual pattern used in the client wizard's `WizardStepIndicator` (search for the existing component — likely in `src/components/client/` or `src/components/shared/`).
- Steps to render (driven by service template — for non-GBC/AC templates, drop "Documents" if no application-scope docs exist, matching the client wizard's collapse behavior from B-049):
  1. **Company Setup** (sections: business, contact, service-step-0 fields)
  2. **Financial** (service-step-1 fields)
  3. **Banking** (service-step-2 fields)
  4. **People & KYC** (the persons list + per-person sub-wizards)
  5. **Documents** (application-scope docs — Step 5)
- Each step shows: step number, label, and a small aggregate status indicator. The aggregate is computed across the section_keys belonging to that step:
  - All Approved → green check
  - Any Rejected → red X
  - Any Flagged (no rejected) → amber flag
  - Any "not reviewed" → gray (with count "2/5 reviewed" small text)
- Clicking a step scrolls to that step's content (smooth scroll).

Add to the admin app detail page above the main content. The existing right-column sidebar stays.

Acceptance:
- Step indicator matches the client wizard's visual style at a glance.
- Aggregate status correctly reflects underlying section reviews.
- `npm run build` passes.

**Commit message:** `feat: admin step indicator mirroring client wizard layout`

---

## Batch 2 — Restructure left column into wizard-shaped steps

Refactor `src/app/(admin)/admin/applications/[id]/page.tsx` (or its sub-components) so the left column is split into the 5 wizard steps from Batch 1, each with its own anchor (id) for scroll targeting:

- **Step 1 — Company Setup** wraps: `<EditableApplicationDetails>` (its 3 internal cards already match this — business, contact, service)
- **Step 2 — Financial** wraps the financial-related fields (currently inside the service-step Card; if `service_details` JSON has financial fields, they go here. If hard to split out, leave them inside the service Card but expose a separate `service.financial` section_key — see Batch 4 for KYC subsection_key conventions to follow)
- **Step 3 — Banking** same approach
- **Step 4 — People & KYC** wraps: Section D Card (Directors, Shareholders & UBOs)
- **Step 5 — Documents** wraps: Documents Card + AI Flagged Discrepancies Card + Verification Checklist Card

Each step gets:
- A visual header (matching the client wizard's step headings — same typography)
- The appropriate Cards inside

Decision shortcut: if splitting Financial/Banking out cleanly is too invasive for the POC, leave them grouped in Step 1 and only render Steps 1, 4, 5 visibly (omit empty steps from the indicator). Document the decision in CHANGES.md. **Don't burn time on a perfect split** — the client wizard has a clean step split because it builds the form; the admin view shows what was filled. Ship pragmatic.

**Commit message:** `feat: admin app detail restructured into client-wizard-shaped steps`

---

## Batch 3 — KYC mirror: render per-person sub-wizard read-only

Goal: when an admin clicks a person card in Step 4, they see the same `PerPersonReviewWizard` the client sees — but read-only and with section-review affordances per subsection.

Steps:

1. Audit `src/components/client/PerPersonReviewWizard.tsx` (~700 lines per the earlier exploration). Add a `readOnly?: boolean` prop. When true:
   - All inputs render as text (no edit affordances), or use a `disabled` attribute consistently.
   - Save/upload buttons are hidden.
   - Doc upload tiles show "View" instead of "Upload".
2. Update `PersonsManager.tsx` and any sibling component used in the admin path so the admin path passes `readOnly={true}`.
3. Inside the read-only wizard, render the same category-buckets the client sees (Identity / Financial / Compliance / etc.). For each bucket, place a `SectionHeader` (from B-068) above the bucket content with:
   - `sectionKey` = `kyc:<profile_id>:<category>` (e.g. `kyc:abc-123-…:identity`)
   - `sectionLabel` = `<Profile Name> — Identity` (or similar)
   - The same Approved / Flagged / Rejected workflow as everywhere else.
4. Below each bucket's content, render `<SectionNotesHistory>` for that section_key.

**Section key convention** for KYC subsections — strict format:

```
kyc:<profile_id>:identity
kyc:<profile_id>:financial
kyc:<profile_id>:compliance
kyc:<profile_id>:professional
kyc:<profile_id>:tax
kyc:<profile_id>:adverse_media
kyc:<profile_id>:wealth
kyc:<profile_id>:additional
```

Profile id is the `client_profiles.id` (NOT `kyc_records.id` or `client_profile_kyc.id`).

5. The aggregate status for the parent profile section (`people:<profile_id>`) is derived: any rejected → rejected; any flagged → flagged; all approved → approved; else "in review". Render this aggregate next to the profile card header.

Note: if the admin currently uses `EditableApplicationDetails` or some other wrapper for KYC, prefer extracting the KYC sub-wizard rendering into its own thin admin component (`AdminKycPersonView.tsx`) that wraps `PerPersonReviewWizard` with `readOnly` + section reviews around each bucket.

Acceptance:
- Admin clicks into a person card → sees the same per-person wizard the client sees.
- All inputs are read-only.
- Each subsection (Identity, Financial, etc.) has its own SectionHeader + history.
- Saving a review for `kyc:<id>:identity` updates the badge for that subsection only.
- The profile card header reflects the aggregate.

**Commit message:** `feat: read-only KYC per-person mirror with subsection reviews`

---

## Batch 4 — Application-scope docs mirror (Step 5)

For Step 5 (Documents), the admin should see the same list the client sees in their Step 5 — application-scope docs — plus admin-uploaded docs. Each individual document doesn't need a section review (they have their own document-review workflow), but the **Step 5 as a whole** is reviewable as `documents`.

This was already wired in B-068 — confirm it survives the restructure from Batch 2 above. If the AI Flagged Discrepancies and Verification Checklist Cards moved into Step 5, give them their own keys (`discrepancies`, `verification_checklist`) only if Vanessa wants them reviewable — for this brief, leave them informational (no SectionHeader) per B-068 acceptance.

Polish task: ensure the Step 5 "Documents" SectionHeader from B-068 is correctly positioned at the top of Step 5 (above all three Cards if they're now grouped under Step 5).

**Commit message:** `chore: ensure documents section review survives wizard-shaped restructure`

---

## Batch 5 — Visual consistency pass

Goals: by the end of this batch, an admin opening an application should see something that visibly resembles the client wizard.

- Match the client wizard's container widths, spacing, and typography.
- Each step heading uses the same font weight/size as the client wizard step headings.
- Persons list cards in Step 4: match the compact card style the client now uses (post-B-067 — "compact KYC person cards").
- Make sure the existing right-column sidebar still works at all widths.
- Run a quick mobile pass at 375px: step indicator stacks vertically, KYC cards still readable, side panel becomes bottom-sheet.

End of brief:
1. `npm run build` clean
2. CHANGES.md updated with B-069 completion entry
3. Run dev server restart pattern in background:
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
4. Final push.
5. Stop. B-070 is the next brief.

**Commit message:** `feat: admin view visual consistency pass — matches client wizard look and feel`

---

## Out of scope (deferred)

- "Approve All" wizard mode — explicitly skipped per Vanessa's instruction.
- Field-level "from doc" provenance markers — **B-070**
- Service-template ↔ document binding, scope admin UI — **B-071**
- Admin Actions registry + Substance Review — **B-072**

---

## Open questions (do not block)

- If splitting Financial / Banking out of the existing "service" Card is invasive, group them under Step 1 and document. Don't redesign `EditableApplicationDetails` from scratch.
- If `PerPersonReviewWizard` doesn't easily accept `readOnly`, wrap it in a div with `pointer-events: none` and CSS-disable inputs as a temporary measure — and add a tech debt entry to revisit cleanly.
- The admin path may already use a different KYC viewer than the client. Reuse the client one — that's the point of this brief.
