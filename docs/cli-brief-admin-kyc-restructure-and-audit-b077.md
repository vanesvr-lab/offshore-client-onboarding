# CLI Brief — B-077 Admin KYC Restructure + Add Modal Fixes + Audit Trail

**Status:** Ready for CLI
**Estimated batches:** 8
**Touches migrations:** No
**Touches AI verification:** No
**Builds on:** B-074 / B-075 / B-076

---

## Why this batch exists

Vanessa's QA on 2026-05-07 surfaced 12 distinct issues across the admin KYC surface and one cross-cutting bug (audit trail empty). All are user-visible polish/correctness gaps that B-076 didn't fully resolve or didn't address.

This brief lands them in one pass. Three groups:

- **Per-profile layout fixes** (issues 1-9 from QA): duplicate name banner, missing vertical containment, wrong section ordering, missing Review button, redundant flat doc list, Address subdivider, etc.
- **Add modal fixes**: button placement under heading, modal visual styling, click-to-select behavior, after-create scroll
- **Audit trail bug**: section-review writes don't audit; substance + service-action writes don't audit; admin services-detail audit panel filter is too narrow

After this brief: admin's per-profile KYC view should mirror the client wizard structurally + visually, the Add modal flow works end-to-end, and the audit panel actually shows what admin has been doing.

---

## Hard rules

1. Complete all 8 batches autonomously. Commit + push + update CHANGES.md after each. Don't stop unless blocked.
2. **Out of scope tables/sections must remain untouched.** Do NOT modify: Step 1 Company Setup, Step 2 Financial, Step 3 Banking, Step 5 Documents card, Admin Actions section (Substance Review / Bank Account Opening / Generate FSC Checklist from B-072), section reviews data, right-column sidebar.
3. Reuse existing shared components (`KycDocsSummary`, `KycDocsByCategory`, `KycDocRow`, `KycRolesPicker`, `AiPrefillBanner`, `InlineDocReviewPanel`, `DocumentDetailDialog`). Don't fork.
4. Section keys preserved: `kyc:<client_profiles.id>:<category>`.
5. Field schema in `src/lib/kyc/sections.ts` is the single source of truth.
6. Admin-only fields are still OUT OF SCOPE — pending FSC checklist PDF diff.
7. Mobile-first (375px clean).
8. `npm run build` must pass before declaring any batch done.

---

## Batch 1 — Per-profile container fixes (QA #1, #2)

In `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`:

1. **Kill the duplicate profile name banner.** When admin clicks "Continue KYC for X" and the per-profile expanded view opens, the profile name currently renders twice — once at the top in the original summary card title, once in the new horizontal banner B-076 Batch 6 added. Keep only the new banner. Remove the old title from the inline expansion.
2. **Re-implement vertical containment.** B-076 Batch 6 was supposed to wrap each profile's expanded content in a `border-l-4 border-gray-200 pl-4` container with a sticky horizontal banner at top. Verify it landed; if missing, re-implement it. Container should:
   - Wrap all expanded content (banner + roles + KYC docs summary + form sections + grouped Documents at end)
   - Sticky horizontal banner (`sticky top-0 z-10 bg-gray-50 px-3 py-2 -mx-4 -mt-2 mb-3`) showing profile name + role badges + KYC% — stays visible as admin scrolls long form
   - Vertical gray line down the left edge of the entire profile container

Acceptance:
- Profile name appears exactly once (in the sticky banner)
- Vertical gray line clearly visible down the left side of every expanded profile's content
- Sticky banner stays visible when scrolling through long-form sections

**Commit message:** `fix: kill duplicate profile name + re-implement vertical containment per profile`

---

## Batch 2 — Subsection ordering (QA #3, #5)

In the per-profile expanded view, the full grouped Documents list (`KycDocsByCategory` component, with all 19 docs across IDENTITY / FINANCIAL / COMPLIANCE / etc.) currently renders **at the top** of the profile, just below the KYC DOCUMENTS status box. This contradicts the client wizard's order, which puts Documents at the END (sub-step 6 of 7).

Restructure the per-profile expanded view to this order:

1. Sticky horizontal banner (Batch 1)
2. Roles picker
3. KYC DOCUMENTS **compact status box** (small, glanceable — keep at top)
4. Long-form sections (in client order):
   - Your Identity (collapsible, default collapsed)
   - Address — added in Batch 4
   - Financial Profile (collapsible)
   - Declarations (collapsible — only at CDD/EDD)
5. **NEW**: Full grouped Documents collapsible block at the END (default collapsed). Section header: `"Documents"` with the same ChevronDown affordance other sections use. When expanded, shows the existing `KycDocsByCategory` content.

Acceptance:
- Order matches client wizard breadcrumb (Identity → Address → Financial → Declarations → Documents)
- Full grouped doc list moves from top to end
- Documents section is collapsible (default collapsed) with chevron toggle that responds to clicks anywhere in the header (chevron icon click target included — same fix B-076 Batch 7 applied to other accordion headers)
- Compact KYC DOCUMENTS status box at the top still visible

**Commit message:** `feat: move grouped Documents to end as collapsible; reorder long-form to client breadcrumb order`

---

## Batch 3 — Per-section docs (QA #6, #7)

The DELETE + REPLACE batch.

**Today** (visible in Vanessa's QA screenshot 1): inside each form subsection (e.g. Your Identity), at the bottom there's a flat **DOCUMENTS** list showing all 19 KYC docs (Driving Licence, National ID, etc.) with Upload buttons. This is a leftover render that needs to die.

**Target** (matching client screenshot 2):
- Above the section heading: a single-line doc row for each doc that fed AI extractions for THIS section's fields. Format: `"✓ Passport uploaded — [status pill] [eye View]"` (no Replace; admin doesn't manage uploads). Multiple docs allowed if multiple fed extractions in this section.
- Below the section heading + description: the existing `AiPrefillBanner` — **augment** with a status pill + View button before Re-apply. Final order:
  ```
  [✨] Filled from uploaded document — Values extracted from your passport / ID.   [status pill] [View] [Re-apply]
  ```
- Below the banner: form fields (existing)
- (NO bottom flat list of all 19 docs — DELETE entirely)

Implementation:

1. **Delete the bottom flat DOCUMENTS list inside each long-form section.** Find the render in `ServiceDetailClient.tsx`'s `KycLongFormSection` or wherever the section content is built. Currently it iterates over `kycDocTypes` (filtered by KYC categories) and renders Upload rows. Remove that block entirely.
2. **Add the single-line source-doc row(s)** at the top of each section content:
   - **Dynamically** derive the source docs from `field_extractions` rows whose `field_key` matches a field in this section AND `superseded_at IS NULL`. Take the unique `source_document_id` set.
   - For each unique source doc: render a row matching the existing `KycDocRow` "uploaded" variant (file icon + doc name + status pill + View button). Or extract a smaller component if `KycDocRow` is too heavy.
   - Click View → opens `DocumentDetailDialog` (the rich admin popup).
3. **Augment `AiPrefillBanner`** to render `[status pill] [View]` before the existing `[Re-apply]` button:
   - Add new optional props: `showStatus?: boolean`, `documentStatus?: string | null`, `onView?: () => void`
   - When `showStatus && documentStatus`: render a small status pill mapping `verified / flagged / approved / rejected / pending` to color (same mapping as `DocumentStatusBadge`)
   - When `onView`: render an outline View button between the status pill and Re-apply
   - The admin path passes all three props; client path passes none (no behavior change for client)
4. The `View` button on the banner uses the same source doc the single-line row uses (most recently extracted, or first if multiple). Click opens `DocumentDetailDialog`.

Acceptance:
- Bottom flat DOCUMENTS list inside each form section is gone
- Source-doc row(s) appear above each section heading when extractions exist
- AiPrefillBanner shows `[status] [View] [Re-apply]` on admin
- Both Views open `DocumentDetailDialog` (Approve / Reject / Re-run AI / Send Update Request)
- Client view of `KycStepWizard` still shows just `[Re-apply]` on the banner (admin extras hidden)
- Build passes; mobile clean

**Commit message:** `feat: per-section source-doc rows + banner View+status pill; remove redundant flat doc list`

---

## Batch 4 — Address subdivider (QA #8)

Inside the **Your Identity** section content (in `KycLongFormSection` rendering or equivalent), add a visual subdivider for "Address" between the identity fields (full_name, DOB, passport, etc.) and the residential address.

Layout inside Identity section after this batch:

```
[Section heading "Your Identity"]
[Description]
[Source-doc row(s) from Batch 3 — Passport]
[AiPrefillBanner — Batch 3 augmented]
[Form: full_name, aliases, DOB, nationality, passport_*]
[Subdivider: small heading "Address" with horizontal rule]
  [Source-doc row — Proof of Residential Address — if extracted]
  [Form: residential address textarea]
[Form: email, phone]
```

The subdivider is purely visual — `<div className="border-t pt-4 mt-4"><h4 className="text-sm font-semibold text-gray-700 mb-3">Address</h4>...</div>` or similar matching the existing section heading typography one level smaller.

Don't add a new category to the `KycCategoryKey` enum. Don't introduce a new row in `application_section_reviews`. Address stays under the `identity` section_key — the subdivider is cosmetic only.

Proof of Residential Address doc row (single-line source-doc) renders inside the subdivider, above the residential address textarea. Same source-doc pattern as Batch 3.

Acceptance:
- "Address" subdivider visible inside Your Identity section, between passport fields and residential address
- Proof of Residential Address doc row visible inside the subdivider when uploaded (with View + status)
- Email + phone stay below the address subdivider, still inside the Identity section

**Commit message:** `feat: Address subdivider inside Identity with Proof of Address doc row`

---

## Batch 5 — Per-profile Review summary panel (QA #4)

Add a "Review {Profile Name}" button on the sticky horizontal banner from Batch 1. Clicking it opens a right-slide Sheet panel showing an aggregate summary across all subsection reviews for this profile.

Panel content (top to bottom):

1. Header: `Review Summary — {Profile Name}`
2. Aggregate badge (derived from subsection statuses): all approved → green; any rejected → red; any flagged → amber; else "in review"
3. List of subsections with their current review state:
   ```
   Identity         [✓ Approved]  by Jane Doe · 2 days ago
                    "Looks good, all docs verified."
   Financial        [⚠ Flagged]   by Jane Doe · 1 day ago
                    "Source of funds needs more detail."
   Declarations     [○ Not reviewed]
   ```
   Each row clickable → scrolls/jumps to that subsection in the long form (closes panel).
4. **Aggregate actions** at the bottom:
   - `Approve all` — writes Approved status to every subsection that's currently `null` or `flagged`. Writes one batch of `application_section_reviews` rows with optional batch note from a small textarea above.
   - `Flag profile` — writes Flagged status to all subsections (or a specific cross-cutting `kyc:<profile>:overall` key — defer this; just use the per-section approach for now).
5. Cancel + close behavior matches `SectionReviewPanel`.

Wiring:
- Pull the aggregate from the existing `useAggregateStatus` hook + subsection reviews context (already present in `AdminApplicationSections`)
- Reuse the `application_section_reviews` POST API for Approve all (call sequentially or with a new bulk endpoint — go sequential to keep the brief small; if 8 calls is too slow, add a bulk endpoint as a follow-up)
- Component lives at `src/components/admin/PerProfileReviewSummaryPanel.tsx`

Add the trigger button on the sticky banner (Batch 1):
```
[Profile name + role badges + KYC%]                              [Review Profile →]
```

Acceptance:
- "Review {Profile Name}" button visible on sticky banner
- Click opens right-slide panel
- Panel shows accurate aggregate + per-subsection statuses + last note
- Click a subsection row → scrolls to it
- Approve all batch-saves Approved across all unreviewed/flagged subsections; status badges update optimistically
- Flag profile batch-saves Flagged status
- Closes cleanly; doesn't break existing inline section reviews

**Commit message:** `feat: per-profile Review summary side panel with aggregate + bulk Approve/Flag`

---

## Batch 6 — Add Director / Shareholder / UBO buttons + modal fixes

Three sub-tasks here.

### 6a — Move Add buttons under People & KYC heading

Currently the dashed-border `[+Add Director] [+Add Shareholder] [+Add UBO]` buttons render at the top of the People & KYC section (likely above the per-person card list). Move them to render **immediately under the "People & KYC" heading** but **above** the per-person cards — find the existing render in `ServiceDetailClient.tsx`'s Step 4 and reposition. Should be a small DOM/JSX change.

### 6b — Fix Add modal styling

The `Add Director / Shareholder / UBO` modal (in `ServiceDetailClient.tsx` around lines 270-360+) shows existing profiles in gray (looks disabled). Change the styling so:
- Existing-profile rows that are **eligible** (not already linked with this role): use active card colors — `bg-white text-gray-900` with hover `bg-gray-50`
- Existing-profile rows that are **already linked** (greyed today): KEEP greyed (correctly disabled)
- Selected row: keep the existing `bg-blue-50 border-l-2 border-brand-blue` selected state
- The empty state of the "Or create new" form fields should look active (bordered inputs, not greyed) before any input

The current text colors `text-gray-700`, `text-gray-600`, `text-gray-400` may need bumping to `text-gray-900` / `text-gray-800` for active rows.

### 6c — Click-to-select + after-create flow

Verify the existing `setSelected` / `onClick` handler on existing-profile rows actually wires Add button enable. Today the Add button at the bottom of the modal appears disabled even after clicking a name. Trace it:

1. Click an existing profile row → `setSelected(p)` fires
2. The bottom Add button's `disabled` predicate likely is `!selected && !newName.trim()` — verify this logic and that the button becomes enabled when `selected` is set
3. If the predicate is wrong, fix it
4. After `Add` succeeds:
   - **For "Or create new"**: after the new client_profile is created, scroll to that new profile's card in the People & KYC list and **expand it** (set its expanded state to true). Use `scrollIntoView({ behavior: "smooth", block: "start" })` on the new card's DOM element.
   - **For existing profile**: after linking, scroll to the linked profile's card and expand it.

The expansion + scroll logic gives admin a clear "you've added/linked this person, here they are" affirmation.

Acceptance:
- Add buttons appear immediately under the People & KYC heading
- Modal text colors look active for selectable rows
- Clicking an existing profile name selects it (visible blue highlight) and enables the bottom Add button
- After successful add (either path), the new/linked profile's card expands and scrolls into view
- Build passes; mobile clean

**Commit message:** `fix: Add Person modal — placement, active styling, click-to-select, post-add scroll/expand`

---

## Batch 7 — Audit trail writes + display query

The audit_log table is empty (0 rows on prod after the 2026-05-06 cleanup) despite many admin actions. Two compounding bugs:

### 7a — Add audit_log writes to mutating routes

The following routes mutate state but don't write `audit_log`:

1. **`src/app/api/admin/applications/[id]/section-reviews/route.ts` POST** — admin reviewing a section. Add an `audit_log` insert after the section review insert succeeds:
   ```ts
   await admin.from("audit_log").insert({
     tenant_id: TENANT_ID,
     actor_id: session.user.id,
     actor_name: session.user.name,
     actor_role: "admin",
     action: "section_review_saved",
     entity_type: "service",
     entity_id: applicationId,  // service id stored in column due to tech debt #26
     new_value: { section_key, status, notes },
   });
   ```
   Adjust to match the existing audit_log schema (check what other routes pass — may have additional fields like `previous_value`, `detail`, etc.)

2. **`src/app/api/admin/services/[id]/substance/route.ts` PUT** — substance review save. Add audit_log insert after upsert:
   - `action: "substance_review_saved"` (or `"substance_review_updated"` if updated)
   - `entity_type: "service"`, `entity_id: serviceId`
   - `new_value: { admin_assessment, admin_assessment_notes }`

3. **`src/app/api/admin/services/[id]/actions/route.ts` PATCH** — service action status change. Add audit_log insert with `action: "service_action_updated"`, `entity_type: "service"`, etc.

4. **`src/app/api/admin/documents/[id]/admin-status/route.ts` PATCH** — already writes audit per CHANGES (B-075 Batch 4). Verify it uses `entity_type: "document"` AND that the audit display query in 7b will surface document audit rows for service-scoped documents.

Use the existing audit-write helper if one exists (search for `actor_role: "admin"` patterns in routes that already audit). If no helper, write a small utility `src/lib/audit/writeAuditLog.ts` so the 4 routes don't duplicate the insert logic.

### 7b — Widen audit display query on /admin/services/[id]

The audit panel on `/admin/services/[id]/page.tsx` queries:
```ts
.from("audit_log")
.eq("entity_type", "service")
.eq("entity_id", id)
```

That misses document audits (where `entity_type = "document"` and `entity_id` is the doc id, not the service id). Widen to either:
- Use `.in("entity_type", ["service", "service_action", "service_substance"])` and `entity_id = service.id`
- AND add a parallel query for `entity_type = "document"` AND `entity_id IN (docs for this service)` — UNION the results client-side and re-sort by `created_at DESC`

Pick the cleanest path. Either way, after this batch the audit panel should show:
- Section reviews saved on this service
- Substance review changes
- Service action status changes
- Document admin-status changes (Approve / Reject / Revoke)
- Stage changes (already audited)

Acceptance:
- Save a section review → audit_log row appears, visible in the service-detail audit panel
- Approve a doc via the new dialog → audit_log row appears, visible in the service-detail audit panel
- Save a substance review → same
- Change a service action status → same
- The audit panel shows ALL relevant entries chronologically

**Commit message:** `fix: audit_log writes for section reviews + substance + service actions; widen display query`

---

## Batch 8 — Smoke test + cleanup

1. Smoke test on `/admin/services/<gbc-0002>` Step 4:
   - Open the page → click "Continue KYC for Vanessa Rangasamy"
   - Profile name appears once (sticky banner only) ✓
   - Vertical gray line visible down left side ✓
   - Section order: Identity → Address subdivider → Financial → Declarations → Documents (collapsed) ✓
   - Click "Review Vanessa Rangasamy" button on banner → side panel opens with aggregate + subsection statuses ✓
   - Click "Approve all" → all subsection badges flip to Approved; audit panel shows the writes ✓
   - Click chevron on Documents section → expands, shows full grouped doc list ✓
   - Inside Identity section: source-doc row visible above heading; AiPrefillBanner shows `[status] [View] [Re-apply]`; bottom flat doc list is GONE ✓
   - Click View on AiPrefillBanner → DocumentDetailDialog opens with full admin actions
   - Approve a doc → status pill on row + banner updates; audit panel shows write
   - Click Add UBO at top of People & KYC → modal opens with active colors → click an existing profile → highlighted, Add button enabled → submit → new profile card expands and scrolls into view
   - Audit panel populated with all the actions performed during smoke test
2. Open client portal as Vanessa for GBC-0002 → wizard stays intact, no admin pills/buttons leaking through
3. Build pass: `npm run build`
4. Update CHANGES.md with B-077 entries (one per batch ideally; or a single end-of-brief summary if running long)
5. Background dev server restart:
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```
6. Final commit + push

**Commit message:** `chore: B-077 smoke test + cleanup`

---

## Out of scope

- **Admin-only fields** — still pending FSC checklist PDFs
- **Renaming database columns** — tech debt #26
- **Bulk audit_log endpoint** — sequential POSTs from the Approve all panel are fine for MVP
- **"Approve All" wizard mode** — explicit skip from earlier briefs
- **Edit deep-link** from review summary subsection rows — scroll-to is enough; no inline edit
- **Per-profile aggregate review key (`kyc:<profile>:overall`)** — derived from subsections; no separate row

---

## Open questions (do not block — choose sensibly)

- If the existing audit-write pattern uses RPC functions or DB triggers we haven't found, prefer that pattern over the new utility. Search the codebase first.
- The `Address` subdivider's horizontal rule should match the visual weight of other subdividers in the codebase (look for existing patterns in client wizard or settings pages — reuse classes).
- For the "Review {Profile}" button on the sticky banner, position it to the right side of the banner. If the banner gets cramped on mobile (375px), drop the button below the profile name on small viewports.
- For 6c's after-create scroll: the new client_profile's card may not be in the DOM yet when the scroll fires (race with re-render). Use a microtask delay or `requestAnimationFrame` to defer the scroll until after the new card is rendered.
- If the audit display query union becomes slow with many documents, paginate or cap at 100 rows like the existing query already does.
