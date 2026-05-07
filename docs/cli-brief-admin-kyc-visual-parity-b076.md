# CLI Brief — B-076 Admin KYC Visual Parity with Client + Per-Doc Admin Controls

**Status:** Ready for CLI
**Estimated batches:** 7
**Touches migrations:** No
**Touches AI verification:** No (reuses existing `/api/admin/documents/[id]/rerun-ai` route)
**Builds on:** B-075 (shared field schema + long-form alignment)

---

## Why this batch exists

B-075 aligned the **field schema** (labels, ordering, hidden behind collapsibles) between admin and client KYC. But the **surrounding visual structure** still differs and breaks the "same look and feel" goal Vanessa set.

Vanessa's QA on 2026-05-07 with side-by-side screenshots flagged 7 issues:

1. Subsection accordion chevron arrow doesn't expand on click — only the header text middle works
2. Per-profile header on admin is a bespoke 2-col `PROFILE | KYC DOCUMENTS` grid; client uses a clean header + breadcrumb + Roles row + KYC DOCUMENTS status box + status legend
3. KYC DOCUMENTS section on admin is a flat scrollable list with checkboxes; client uses the compact status box (`3 of 9 uploaded · IDENTITY 3/3 · FINANCIAL 0/5 · COMPLIANCE 0/1` + legend) followed by category-grouped sections
4. Roles UI on admin is a `[role] [Remove]` picker with separate Add dropdown; client uses checkbox-style buttons (`[✓ Director] [☐ Shareholder] [✓ UBO]`)
5. Per-doc upload rows on admin are flat `[file icon] [Doc Name] [Upload]`; client groups them by category (IDENTITY DOCUMENTS / FINANCIAL DOCUMENTS / COMPLIANCE DOCUMENTS) and shows uploaded docs with `Uploaded · View`. Admin rows need the same grouped layout PLUS admin extras (View opens the rich review popup with Approve / Reject / Re-run AI / Send Update Request)
6. Per-subsection Review affordance — Vanessa OK with popup MVP, edit deep-link can come later
7. Profile containment — admin needs a horizontal banner at top of each profile (clearly identifies whose data it is) + a vertical gray grouping line so all of one profile's content is visually one unit

The full message is: *"the look and feel should be very similar to Client view except this is long form."*

This brief makes them visually parity by **lifting client UI into shared components** and consuming them on admin too. Admin keeps its long-form-collapsed presentation; everything else matches client.

---

## Hard rules

1. Complete all 7 batches autonomously. Commit + push + update CHANGES.md after each.
2. **Reuse, don't fork.** The client's `PerPersonReviewWizard` (or wherever the KYC DOCUMENTS box, grouped doc sections, Roles checkbox row currently live) is the pattern source. Lift those bits into shared components in `src/components/kyc/` and have both client wizard AND admin long-form consume them. Don't write parallel admin variants.
3. **Reuse the existing rich admin doc review popup `DocumentDetailDialog.tsx`** (`src/components/shared/DocumentDetailDialog.tsx`). It already has Approve / Reject / Re-run AI / Send Update Request / Download / Close. Don't rebuild.
4. Section keys for KYC subsection reviews stay as B-069/B-073/B-074 defined: `kyc:<client_profiles.id>:<category>`.
5. **Out of scope tables/sections must remain untouched.** Do NOT modify: Step 1 Company Setup, Step 2 Financial, Step 3 Banking, Step 5 Documents card, Admin Actions section (Substance Review / Bank Account Opening / Generate FSC Checklist from B-072), section reviews data, right-column sidebar. The per-person summary cards in Step 4 (Continue KYC / View Summary / Request KYC) stay as the entry point — preserved.
6. Mobile-first. 375px clean.
7. `npm run build` must pass before declaring any batch done.

---

## Batch 1 — Extract `KycDocsSummary` (status box + legend) into shared component

The client's KYC DOCUMENTS status box (visible in Vanessa's screenshot) shows:
- Header: `KYC DOCUMENTS · 3 of 9 uploaded`
- Category counts inline: `IDENTITY (3/3) · FINANCIAL (0/5) · COMPLIANCE (0/1)`
- Status legend below: `Verified · Flagged · Needs review · Checking · Skipped · Approved · Rejected · Pending`

Find where this lives (likely `src/components/client/PerPersonReviewWizard.tsx` or inside `KycStepWizard.tsx` or a sibling). Extract into a new shared component:

```
src/components/kyc/KycDocsSummary.tsx
```

Props:
```ts
interface Props {
  uploadCount: number;
  totalCount: number;
  byCategory: Array<{ key: string; label: string; uploaded: number; total: number }>;
  showLegend?: boolean;  // default true
  onCategoryClick?: (categoryKey: string) => void;  // for jump-to-category nav
}
```

Update the client consumer to import the new component (no behavior change). Build passes.

**Commit message:** `chore: extract KycDocsSummary into shared component`

---

## Batch 2 — Extract grouped per-doc list + per-doc row into shared components

The client's grouped doc sections (visible in Vanessa's third screenshot) show, per category:

```
[IDENTITY DOCUMENTS]                        [3 of 3 uploaded]
[file icon] Certified Passport Copy [icons] [Uploaded · View]
[file icon] Proof of Residential Address    [Uploaded · View]
[file icon] Curriculum Vitae / Resume       [Uploaded · View]

[FINANCIAL DOCUMENTS]                       [0 of 5 uploaded]
[file icon] Declaration of Source of Funds  [Upload]
...
```

Extract two new shared components:

```
src/components/kyc/KycDocsByCategory.tsx   // outer grouping container
src/components/kyc/KycDocRow.tsx           // single doc row (uploaded or not)
```

`KycDocsByCategory` props:
```ts
interface Props {
  categories: Array<{
    key: string;
    label: string;          // e.g. "IDENTITY DOCUMENTS"
    docs: KycDocRowData[];
  }>;
  showAdminControls?: boolean;  // default false (client mode)
  onViewClick?: (docId: string) => void;  // hook for opening the doc review popup
  onUploadClick?: (docTypeId: string) => void;  // hook for upload flow
}
```

`KycDocRow` props:
```ts
interface Props {
  doc: KycDocRowData;
  showAdminControls?: boolean;  // when true, renders View (eye icon) + admin status pill
  onViewClick?: (docId: string) => void;
  onUploadClick?: (docTypeId: string) => void;
}

interface KycDocRowData {
  id?: string;                     // null when not uploaded
  document_type_id: string;
  document_name: string;
  is_uploaded: boolean;
  // status — populated only when uploaded
  verification_status?: string | null;
  admin_status?: string | null;
  flagged?: boolean;
}
```

Visual:
- Not uploaded: `[file icon] [Doc Name]                 [Upload]`
- Uploaded (client): `[file icon] [Doc Name]            Uploaded · View`
- Uploaded (admin, `showAdminControls=true`): `[file icon] [Doc Name] [status pill]   [eye View]`

Migrate the client consumer to use these shared components. No behavior change yet — admin doesn't consume them until Batch 4.

**Commit message:** `chore: extract KycDocsByCategory + KycDocRow into shared components`

---

## Batch 3 — Extract `KycRolesPicker` checkbox-style row into shared component

The client's Roles row (visible in Vanessa's first screenshot) shows:

```
Roles:  [☐ Director]  [✓ Shareholder]  [✓ UBO]
```

Create shared component:

```
src/components/kyc/KycRolesPicker.tsx
```

Props:
```ts
interface Props {
  selectedRoles: string[];                 // ['shareholder', 'ubo']
  availableRoles: Array<{ key: string; label: string }>;
  onToggleRole: (roleKey: string) => Promise<void>;  // server-side toggle
  disabled?: boolean;
}
```

When admin toggles a role on/off, call the same server action / API the existing admin role picker uses today. Find the existing admin role-toggle handler (currently in `ServiceDetailClient.tsx` somewhere near where the `[role] [Remove]` and `[+Add]` UI live) and reuse the mutation logic.

Migrate the client consumer (if any) and prepare admin to consume in Batch 4.

**Commit message:** `chore: extract KycRolesPicker into shared component`

---

## Batch 4 — Replace admin's per-profile header + flat doc list with shared components

The big visual swap. In `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`, the per-profile expanded card today renders:

- **Header**: name + role badges + KYC% + Portal access / Resend KYC buttons (KEEP these)
- **2-col grid**: PROFILE column (Edit email/phone link, ROLES section with [role][Remove] + Add dropdown) | KYC DOCUMENTS column (flat scrollable list of all 19 docs with checkboxes + Upload buttons) — REPLACE
- **Then below** — the long-form accordion sections from B-075 (KEEP)

After this batch, the structure becomes (top to bottom):

1. Profile header (existing — name, role badges, KYC%, Portal/Resend) — keep
2. **NEW**: `<KycRolesPicker>` (checkbox-style row matching client)
3. **NEW**: `<KycDocsSummary>` (status box + legend matching client)
4. **NEW**: `<KycDocsByCategory showAdminControls>` (grouped IDENTITY / FINANCIAL / COMPLIANCE sections matching client, with admin View + status pill on each row)
5. Long-form accordion sections (existing from B-075) — keep

The "Edit email/phone" link from the old PROFILE column moves into a small inline action near the profile header (or inside the appropriate Identity subsection — wherever's least intrusive; doesn't need its own column).

Acceptance:
- Admin per-profile expanded view visually mirrors client per-profile view (with admin extras on doc rows)
- All Roles toggles still work (add / remove)
- KYC docs status box accurate (counts match prod data for GBC-0002 profiles)
- Grouped doc sections match client's category groupings (IDENTITY / FINANCIAL / COMPLIANCE / etc.)
- Build passes; mobile clean

**Commit message:** `feat: admin per-profile header + doc list use shared components (visual parity)`

---

## Batch 5 — Per-doc row admin View opens `DocumentDetailDialog`

The `KycDocRow` component (Batch 2) takes `showAdminControls` and emits `onViewClick(docId)`. Wire that callback on the admin path to open `DocumentDetailDialog.tsx` (the rich admin popup screenshotted by Vanessa: AI VERIFICATION confidence + flagged issues list + EXTRACTED FIELDS dropdown + Approve / Reject / Re-run AI / Send Update Request / Download / Close).

The dialog must:
- Receive the documentId being clicked
- Render the same UI as exists today on `/admin/applications/[id]/documents/[docId]/page.tsx` deep page (or whatever surface DocumentDetailDialog renders)
- Successfully PATCH `admin_status` via the existing endpoint (find it — likely `/api/admin/documents/[id]/admin-status/route.ts` per the file we saw)
- After Approve/Reject succeeds → close dialog, optimistically update the row's status pill in `KycDocRow`

Status pill mapping on the row:
- `admin_status === 'approved'` → green "Approved" pill
- `admin_status === 'rejected'` → red "Rejected" pill
- `verification_status === 'flagged'` (and admin_status is null) → orange "Flagged" pill
- `verification_status === 'pending' / 'checking'` → gray "Pending" pill
- `verification_status === 'verified'` (and admin_status is null) → blue "Verified" pill (or AI-verified label)

The status pill renders next to the doc name on each uploaded row.

Acceptance:
- Admin clicks View on any uploaded doc → DocumentDetailDialog opens
- All 4 actions work (Approve / Reject / Re-run AI / Send Update Request)
- After Approve → dialog closes, row's pill flips to green Approved
- Re-clicking View shows the dialog with the new state
- Mobile: dialog is full-screen / bottom-sheet at 375px
- Client view of the same row still shows just `Uploaded · View` (no admin pill, no admin actions in the dialog if a client somehow opens it)

**Commit message:** `feat: per-doc row View opens DocumentDetailDialog with admin actions`

---

## Batch 6 — Profile containment: horizontal banner + vertical gray line

Each profile expanded view in admin Step 4 needs a clear visual container so admin sees "everything inside this gray-bordered area is for THIS user".

Visual approach:
- Wrap the entire per-profile expanded content (header + roles + docs summary + grouped docs + long-form sections) in a container with a left border:
  ```tsx
  <div className="border-l-4 border-gray-200 pl-4 py-2">
    {/* horizontal banner */}
    {/* all the per-profile content */}
  </div>
  ```
- Horizontal banner at the very top of the container — a thin strip with the profile's name + role badges + KYC% on a slightly tinted background (e.g. `bg-gray-50 px-3 py-2 -mx-4 -mt-2 mb-3`). Sticky-positioned so it stays visible as admin scrolls through the long-form (`sticky top-0 z-10`).

Reference: Vanessa's third screenshot of "Form B" — vertical gray line on the left edge of a card containing all of one form's fields. Same idea, applied per profile.

Acceptance:
- When admin expands a profile, a vertical gray line runs down the left side of all content for that profile
- A horizontal banner at the top of the expanded section shows profile name + role badges + KYC% prominently
- Banner stays sticky as admin scrolls through long-form sections
- When collapsed (default state), profile cards in the per-profile summary list look unchanged
- Visual weight is right — banner doesn't overpower content; line is subtle but clear

**Commit message:** `feat: profile containment — horizontal sticky banner + vertical gray line per user`

---

## Batch 7 — Chevron fix + Review popup polish + smoke test

### 7a — Chevron click target

Fix the long-form accordion subsection chevron — clicking the arrow icon should expand/collapse the section. Today only clicking the header text middle works.

Likely fix: the chevron is rendered as a sibling to the clickable header rather than inside it, or has `pointer-events-none`. Move it inside the clickable wrapper or remove the pointer-events guard.

### 7b — Review affordance polish (popup MVP)

Per Vanessa: the inline Review affordance per subsection can be a popup on click; the "Edit" deep-link to that subsection can come later. Today's Review button (from B-074) opens `SectionReviewPanel` as a right-slide. Confirm:
- Click Review on a subsection header → SectionReviewPanel opens with: Approved / Flagged / Rejected radio + notes textarea + Save
- Saving updates the section badge inline
- Notes history shows below the section content

If the visual treatment differs from the popup pattern Vanessa wants, normalize. Otherwise: no change needed; this batch is just a verification step.

### 7c — Smoke test on `/admin/services/<gbc-0002>`

1. Open Step 4
2. Click "Continue KYC for Vanessa Rangasamy" — profile expands inside the new gray-bordered container with sticky banner
3. Verify:
   - Roles shown as checkbox row (matches client)
   - KYC DOCUMENTS status box visible (matches client visual)
   - Grouped IDENTITY / FINANCIAL / COMPLIANCE doc sections (matches client structure)
   - Each uploaded doc row has eye View + status pill
   - Click View → DocumentDetailDialog opens with Approve / Reject / Re-run AI / Send Update Request
   - Approve → row pill flips to green
   - Long-form accordion sections (Identity, Financial, etc.) all collapsed by default
   - Click chevron → expands. Click chevron again → collapses
   - Inline Review on each section header → opens SectionReviewPanel → saves
4. Switch to Bruce Banner profile — same layout
5. Open client portal as Vanessa → wizard view, no admin pills/views, but same field labels/ordering

If any of these fail, document in CHANGES.md and stop.

### 7d — Cleanup

- Delete dead code in `ServiceDetailClient.tsx` (the old 2-col PROFILE | KYC DOCUMENTS grid, the old `[role] [Remove]` + `[+Add]` picker, the flat doc list)
- CHANGES.md entry referencing extracted shared components, profile containment, per-doc admin actions
- Background dev server restart:
  ```
  pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
  ```
- Final commit + push.

**Commit message:** `chore: B-076 chevron fix + Review polish + smoke test + cleanup`

---

## Out of scope

- **Admin-only fields** — still deferred until FSC checklist PDFs are readable
- **Edit deep-link from Review popup** — per Vanessa, popup MVP is enough; deep-link can come in a follow-up
- **Renaming database columns** — tech debt #26
- **Client wizard layout changes** — client is the source of truth
- **"Approve All" wizard mode** — explicit skip
- **Admin Actions section** (Substance Review / Bank Opening / FSC Checklist from B-072) — different surface area, untouched

---

## Open questions (do not block — choose sensibly)

- The DocumentDetailDialog file at `src/components/shared/DocumentDetailDialog.tsx` should already have all admin actions wired. If for any reason actions don't fire from the dialog when triggered from the new doc-row View path, check that the handler closures get the correct documentId (a common bug when dialogs are re-mounted vs. re-rendered).
- Profile-level aggregate badge (KYC% + status from subsection reviews) — already present in the per-person summary card from B-075. Keep it; the new horizontal banner inside the expanded view is a separate, more prominent indicator.
- If the Roles picker on admin needs a special permission gate (e.g. only certain admins can change roles), preserve whatever check exists today. Don't relax permissions.
