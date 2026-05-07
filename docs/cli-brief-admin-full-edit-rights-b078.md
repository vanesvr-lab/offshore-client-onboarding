# CLI Brief — B-078 Admin Full Edit Rights on /admin/services/[id]

**Status:** Ready for CLI
**Estimated batches:** 6
**Touches migrations:** No
**Touches AI verification:** No
**Builds on:** B-076 (visual parity), B-077 (audit helper, per-section doc rows, per-profile review summary)

---

## Why this batch exists

B-076 made the admin per-profile KYC view a *read-only* mirror of the client wizard, on the assumption that admin only ever needed to *review* (Approve / Flag / notes). That assumption was wrong: **admin must have full edit rights** on every surface they can see — type into KYC fields, change roles, replace docs, fix the profile name or email — without bouncing to a separate edit page.

Today on `/admin/services/[id]` Step 4, every `KycLongFormField` is hardcoded `disabled`, the `setFields` handler only mutates local state, and there's no save path back to the database. Per-section doc visibility is also broken: rows only appear when AI extractions link a doc to a field, so a hand-typed profile with a real uploaded passport renders no source-doc row at all.

After this brief: admin can change anything they see on the per-profile expanded view, save it through one bottom Save / Cancel bar (mirroring the wizard's pattern), and have every change land in `audit_log`. The bar guards against tab close / route change while changes are pending.

---

## Hard rules

1. Complete all 6 batches autonomously. Commit + push + update CHANGES.md after each batch. Don't stop unless blocked.
2. **Out of scope, must remain untouched:** Step 1 Company Setup, Step 2 Financial Snapshot, Step 3 Banking, Step 5 Documents card, Admin Actions section (Substance Review / Bank Account Opening / Generate FSC Checklist from B-072), the right-column sidebar, the Audit Trail panel itself (B-077/7 already covers it).
3. **Reuse existing shared components**: `KycDocsByCategory`, `KycDocRow`, `KycRolesPicker`, `AiPrefillBanner`, `KycLongFormField`, `DocumentDetailDialog`, `writeAuditLog` (from B-077/7 at `src/lib/audit/writeAuditLog.ts`). Don't fork.
4. **Reuse `src/lib/kyc/sections.ts` + `src/lib/kyc/categories.ts`** as single source of truth for field schema and category-to-section mapping.
5. **One save bar per per-profile expanded view**, sticky to the bottom of the per-profile container (inside the gray-line vertical containment from B-076 Batch 6 / B-077 Batch 1), centered horizontally to the People & KYC card width — NOT the existing global `pendingChanges` bar at `ServiceDetailClient.tsx:3422` (that one stays as-is for substance/business edits; do not touch it).
6. **All edits go through the same Save bar.** No auto-save. No per-section save buttons. No `Enter`-to-save. Only Save click triggers persistence.
7. **Cancel must revert every dirty field on that profile** back to last-saved state with no DB writes.
8. **Navigation guard:** when any field is dirty, intercept (a) `beforeunload` for tab close / refresh, (b) Next.js client-side route changes, (c) clicks on other profiles in the People & KYC card. Show a confirm prompt: "You have unsaved changes for {Profile Name}. Save before leaving?" with Save / Discard / Cancel options.
9. Section keys preserved: `kyc:<client_profiles.id>:<category>`.
10. Mobile-first (375px clean — but the admin sidebar on this page is desktop-only per tech-debt #20, so 1024px+ is the practical floor).
11. `npm run build` must pass before declaring any batch done.
12. Every save event must write one `audit_log` row via `writeAuditLog` summarising what changed (see Batch 6 for shape).

---

## Files in scope

Primary edit targets:
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — `KycLongForm`, `KycLongFormSection`, `KycLongFormField`, `findSourceDocsForFields`, the per-profile expanded container
- `src/components/kyc/KycRolesPicker.tsx` — accept editable mode for admin
- `src/components/kyc/KycDocRow.tsx` / `src/components/kyc/KycDocsByCategory.tsx` — empty-state rendering, Replace affordance

New API routes (or extensions of existing ones):
- `PATCH /api/admin/profiles/[profileId]/kyc-fields` — accept a diff of changed `client_profile_kyc` columns
- `PATCH /api/admin/profiles/[id]` — already exists, extend if needed for `client_profiles.full_name` / `email` edits
- `POST/DELETE /api/admin/profiles/roles` — already exists, reuse
- `POST /api/documents/[id]/replace` (or equivalent) — admin path; check what already exists in `src/app/api/documents/`

Pattern to mirror for nav guard:
- `src/components/client/ServiceWizard.tsx:118-130` — `beforeunload` listener pattern
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx:186` — unsaved-changes dialog copy

---

## Batch 1 — Make KYC long-form fields editable + dirty-state tracking

### Goal

Type-able fields in the per-profile expanded view, with a per-profile dirty-state tracker that drives the (yet-to-be-built) Save bar in Batch 2.

### Steps

1. At [`ServiceDetailClient.tsx:847`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx:847) (current location, may shift), remove the hardcoded `disabled` prop on `KycLongFormField`. Default the prop to `false`.
2. Lift the `fields` state out of `KycLongFormSection` into the parent that owns the per-profile expanded view (likely the component that already owns `localDocs` + the per-profile state). Track:
   - `savedFields` — last-known-from-DB snapshot per profile
   - `draftFields` — current in-flight edits per profile
   - Derive `dirtyKeys = Object.keys(draftFields).filter(k => !equal(draftFields[k], savedFields[k]))`
3. The `KycLongFormField` `onChange` updates `draftFields` only, never PATCHes.
4. Pass `isDirty` (boolean) up so the Save bar (Batch 2) can subscribe.
5. Visual: editable fields keep current styling (no opacity dimming, no `bg-gray-50`). Apply `bg-gray-50` only when `disabled === true`, which now should never happen on this surface.

### Acceptance

- Click any `KycLongFormField` on `/admin/services/[id]` Step 4 per-profile expanded view → cursor enters input, you can type
- Typing a single character marks the profile as dirty (verified by a temporary `console.log(dirtyKeys)` removed before commit, OR by Batch 2's bar appearing once it's built)
- Cancel-equivalent (refresh the page) discards changes — no DB writes happen yet
- Existing client wizard remains 100% unchanged
- `npm run build` passes

---

## Batch 2 — Section-width Save / Cancel bar inside per-profile container

### Goal

A sticky Save / Cancel bar at the bottom of the per-profile expanded container, centered to the People & KYC card width, mirroring the client wizard's bottom nav.

### Layout

Inside the per-profile expanded `border-l-4 border-gray-200 pl-4` container (the vertical containment from B-076/6 + B-077/1), append a sticky bar:

```
┌─ profile container (border-l gray) ─────────────────────────────┐
│  [sticky banner — Profile Name + Review button]                  │
│                                                                  │
│  [Roles picker]                                                  │
│  [KycDocsSummary]                                                │
│  [KycDocsByCategory]                                             │
│  [Identity section] ... [Financial section] ... [Declarations]   │
│  [Documents (collapsible, B-077/2)]                              │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │ ← sticky save bar, full container width, py-3, bg-white,   │  │
│  │   border-t, content centered, gap-2                        │  │
│  │                                                            │  │
│  │            [Cancel]  [Save changes]                        │  │
│  │                                                            │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

### Behaviour

- **Visible always** when the profile is expanded (not just when dirty — admins shouldn't have to guess where it is)
- **Save** disabled when `!isDirty`; enabled `bg-brand-navy hover:bg-brand-blue text-white` when dirty
- **Cancel** disabled when `!isDirty`; enabled `variant="outline"` when dirty
- Click Save → call `handleSaveProfile()` (Batch 3 wires it). Show spinner inside button while in-flight. On success, toast `"Changes saved."`. On failure, toast `"Failed to save: {message}"` and keep `draftFields` intact.
- Click Cancel → set `draftFields = savedFields`, no DB call, toast `"Changes discarded."`
- When `isDirty`, also show small amber text `"You have unsaved changes"` on the left side of the bar (mirrors the existing global pattern at `ServiceDetailClient.tsx:3425`)
- Sticky positioning: `sticky bottom-0` inside the per-profile container, NOT `position: fixed`. It should scroll with the per-profile content, but stay pinned to the bottom of the visible viewport once the container fills the viewport.
- Make sure the Documents collapsible block (B-077/2) doesn't disappear behind the sticky bar — add `pb-4` or similar to its container.

### Acceptance

- Bar is visible when profile is expanded, hidden when collapsed
- Save / Cancel both disabled in initial state
- Type any char → both buttons enable instantly
- Click Cancel → fields revert, buttons disable
- Click Save → spinner, toast, buttons disable (Batch 3 makes this real)
- Visual matches the client wizard's `KycStepWizard` `fixedNav` style — same button sizes, same spacing, same brand colors
- `npm run build` passes

---

## Batch 3 — Wire Save: PATCH `client_profile_kyc` + roles + profile banner

### Goal

Save click persists every dirty field across the three editable surfaces of one profile in one transaction.

### API

Create `PATCH /api/admin/profiles/[profileId]/kyc-fields` (or check if a similar route already exists; if so, extend instead of duplicating):

**Request body:**
```ts
{
  kyc_fields?: Record<string, unknown>;   // changed columns of client_profile_kyc
  profile_fields?: {                       // changed columns of client_profiles
    full_name?: string;
    email?: string;
  };
  roles?: {                                // role assignments under this service
    add?: Array<{ service_role_type: "director" | "shareholder" | "ubo"; service_id: string }>;
    remove?: Array<{ id: string }>;        // profile_service_roles row ids
  };
}
```

**Server side:**
- Auth: must be in `admin_users`
- Use `createAdminClient()` (service role)
- Validate `kyc_fields` keys against the column list of `client_profile_kyc` (no SQL injection via key names — explicit allow-list)
- Run as a single Supabase transaction (or sequential with rollback on first failure)
- Return the updated profile row + updated `client_profile_kyc` row + updated role list, so the client can rehydrate `savedFields` without a second fetch

**Client side:**
- `handleSaveProfile` builds the diff payload from `dirtyKeys` + role-change tracker + banner-edit tracker (Batch 4 adds the latter two — Batch 3 only wires kyc_fields)
- On success, set `savedFields = { ...savedFields, ...returnedKycFields }` so dirty-tracking resets

### Roles editable

`KycRolesPicker` is currently read-only on admin? Confirm by reading the component. If editable, just hook its `onChange` into the dirty tracker and the role-changes payload. If read-only, add an `editable` prop and render checkboxes.

### Banner editable (full_name + email at `client_profiles`)

The sticky banner from B-076/6 + B-077/1 currently shows the profile name as static text. Replace with inline-editable fields:
- Full name → click-to-edit text input, blur reverts visual but keeps draft state
- Email → click-to-edit input
- Email uniqueness already guarded by the `(tenant_id, lower(email))` constraint from B-059 — surface the DB error toast cleanly

### Acceptance

- Type into a Full legal name field, click Save → reload the page, the new value is persisted
- Change a role checkbox, click Save → reload, role assignment is updated
- Edit the profile name on the banner, click Save → reload, banner shows new name
- Edit a profile email to one already in use → backend returns 409, toast surfaces it, draftFields stay intact
- Save+Reload roundtrip is < 600ms typical (no second fetch needed because backend returns the new state)
- `npm run build` passes

---

## Batch 4 — Per-section doc rows: category-based visibility + empty-state Upload

### Goal

Fix the bug where per-section source-doc rows only appear when AI extractions linked a doc. Every uploaded doc whose `document_type.category` matches the section should always show. When a required category-doc is missing, render an empty-state row with an Upload button.

### Replace the matching logic

In [`ServiceDetailClient.tsx:506-523`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx:506) (current `findSourceDocsForFields`):

**Today (broken):**
```ts
function findSourceDocsForFields(fieldKeys: string[]): ServiceDoc[] {
  // walks extractionsByField → returns docs that fed those extractions
}
```

**Replace with:**
```ts
function findSectionDocs(sectionCategoryKey: string): {
  uploaded: ServiceDoc[];
  missing: DocumentType[];   // required doc types in this category that have no upload yet
} {
  // 1. From the same source the bottom Documents block uses (categories.ts mapping
  //    + document_types table), build the list of doc types in this category
  // 2. Partition into uploaded (has a row in localDocs.filter(d => d.document_type_id === dt.id))
  //    vs missing (required doc types where no upload exists)
  // 3. Return both lists
}
```

**Keep `findSourceDocForSection` AND `extractionsByField` intact** — they still drive field-level "where this came from" affordances (the `FieldPrefillIcon` that shows on each field). Only visibility of the per-section doc rows changes.

### Empty-state row

When `missing.length > 0`, render each as a `KycDocRow` with `is_uploaded={false}` and an Upload button on the right. Click Upload → opens a file picker (reuse the upload flow from `KycDocsByCategory` / wherever the Documents block uses).

When `uploaded.length > 0`, render each as today (View opens `DocumentDetailDialog` with admin actions — B-077/3).

If both lists are empty, render nothing (the section has no associated docs at all — most non-Identity sections).

### Address subdivider compatibility

B-077/4 split source docs for the Identity section so the Proof of Residential Address row sits inside the Address subdivider while Passport-fed docs stay above. Preserve that split — Address subdivider takes Proof of Residential Address (uploaded or empty-state), pre-Address shows Passport (uploaded or empty-state).

### Acceptance

- Open a profile with an uploaded Certified Passport Copy and hand-typed Identity fields (no extractions) → Identity section shows a Passport source-doc row with View button
- Open a profile with NO uploaded Certified Passport Copy → Identity section shows an empty-state "Certified Passport Copy — Upload" row
- Click Upload on the empty-state row → file picker, upload completes, row swaps to uploaded state with View button
- The bottom Documents block (B-077/2) is unchanged — same content, same behavior
- Field-level FieldPrefillIcon (the small ✨ icon next to fields with extractions) still works
- `npm run build` passes

---

## Batch 5 — Documents Replace via DocumentDetailDialog (admin path)

### Goal

Admin can re-upload a doc to overwrite the client's file, from inside `DocumentDetailDialog`.

### Steps

1. Add a `Replace` button to the admin actions strip in `DocumentDetailDialog` (live next to View / Approve / Revoke from B-076/5).
2. Click Replace → file picker → upload → backend replaces the `documents` storage object AND inserts a new `document_uploads` row with `superseded_at` on the previous row (or whichever pattern the existing client-side replace flow uses — mirror it). Check `src/app/api/documents/[id]/` for an existing replace route.
3. After successful replace, refresh the doc list in the parent so View opens the new file.
4. Add a confirmation step: "Replace {doc name}? The previous version will be marked superseded but kept for audit." with Confirm / Cancel.
5. Ensure replace is captured in `audit_log` (action: `document_replaced`, entity: the new `document_uploads.id`, detail: `{ replaced_document_upload_id, file_name, file_size }`).

### Acceptance

- Open DocumentDetailDialog on an uploaded doc → see Replace button
- Click Replace → confirm dialog → file picker → upload completes
- Doc list now shows the new file with the new upload's status pill
- Audit trail panel shows a `document_replaced` entry with the actor + detail
- Old file is still retrievable via the superseded row (don't delete the storage object — only mark the DB row superseded)
- `npm run build` passes

---

## Batch 6 — Audit writes for every save event + nav guard + smoke test

### 6a — Audit writes

Every successful Save (kyc_fields, profile_fields, roles, OR replace) writes one or more `audit_log` rows via `writeAuditLog` from `src/lib/audit/writeAuditLog.ts`.

- One row per save *event* (not per field), with the diff in `detail`. Shape:
  ```ts
  await writeAuditLog(admin, {
    actor_id: session.user.id,
    actor_role: "admin",
    action: "profile_kyc_updated",
    entity_type: "client_profile",
    entity_id: profileId,
    previous_value: { kyc_fields: oldDiff, profile_fields: oldProfile, roles: oldRoles },
    new_value: { kyc_fields: newDiff, profile_fields: newProfile, roles: newRoles },
    detail: { service_id: serviceId, fields_changed: dirtyKeys },
  });
  ```
- For replace, action: `document_replaced` (Batch 5 already handles this).

### 6b — Navigation guard

When any per-profile draft is dirty:

1. **Browser tab close / refresh:** install `beforeunload` listener that returns a non-empty string. Mirror the pattern at `src/components/client/ServiceWizard.tsx:118-130`. Remove the listener when all profiles are clean.
2. **Next.js route change:** intercept via Next.js `useRouter` events or the App Router equivalent. On intent to navigate, show the unsaved-changes dialog with three options: **Save** (run Save then navigate), **Discard** (revert + navigate), **Cancel** (stay).
3. **Switching to another profile in the People & KYC card:** if profile A is dirty and admin clicks profile B, show the same dialog. If admin clicks profile A's chevron to collapse, treat it as a navigation: same dialog.

Dialog copy:
- Title: `"Unsaved changes for {Profile Name}"`
- Body: `"You've made changes to this profile that haven't been saved. What would you like to do?"`
- Buttons: `[Save & continue]` (brand-navy), `[Discard changes]` (outline-red), `[Cancel]` (outline)

### 6c — Smoke test

Manually walk through:
1. `/admin/services/[id]` → expand a profile → edit Full legal name → Save → reload → name persists
2. Edit DOB + passport number + roles together → Save → all persist in one roundtrip
3. Edit a field → Cancel → field reverts, no audit entry
4. Edit a field → close tab → browser warns
5. Edit a field → click another profile → unsaved-changes dialog appears with three options
6. Click Save & continue → previous profile saves, new profile expands
7. Open a profile with no Certified Passport Copy uploaded → see empty-state Upload row in Identity section
8. Upload via empty-state → row swaps to View
9. Click View on an uploaded doc → DocumentDetailDialog → Replace → confirm → upload → doc list shows new file, old file marked superseded
10. Audit Trail panel shows entries for: profile_kyc_updated, document_replaced

Document the smoke test result in CHANGES.md (pass/fail per step). If any step fails, fix before commit.

### Acceptance

- All 10 smoke test steps pass
- Audit panel populated with B-078 events
- `npm run build` passes
- All 6 batches committed + pushed
- CHANGES.md has 6 batch entries + a B-078 close-out entry

---

## CHANGES.md format

After each batch:

```md
### YYYY-MM-DD — B-078 Batch N — <one-line title> (Claude Code)

<2-3 sentence description of what landed and where>

- Bullet detail
- Bullet detail
- Bullet detail
```

After Batch 6, add a close-out:

```md
### YYYY-MM-DD — B-078 close-out — Admin full edit rights on /admin/services/[id] (Claude Code)

End of B-078. Admin per-profile view in `/admin/services/[id]` Step 4 is now fully editable: KYC long-form fields, role assignments, profile banner (name + email), and document Replace all flow through one Save / Cancel bar centered to section width. Navigation guard prevents loss of unsaved changes. Every save event writes to `audit_log` via the B-077/7 helper. Per-section doc rows now use category-based visibility instead of extraction-only — fixes the bug where uploaded docs didn't show as source docs unless they had AI extractions.

Resolves: tech debt #25 (re-resolved correctly — prior B-076 resolution was wrong).
```

Also update the Tech Debt Tracker entry for #25 to reflect the corrected resolution.

---

## What NOT to do

- Do NOT touch the existing global save bar at `ServiceDetailClient.tsx:3422-3446` — that's for substance/business edits, leave alone
- Do NOT auto-save on blur, debounce, or any form of background persist
- Do NOT use a single per-page dirty-state — must be per-profile so dirty profile A doesn't block reading profile B
- Do NOT delete the extractions-based linkage (`extractionsByField`, `findSourceDocForSection`) — the field-level FieldPrefillIcon still depends on it
- Do NOT add a new Save button per section — one bar per profile, period
- Do NOT migrate the database — no schema change is required for this brief
- Do NOT break the client wizard — it shares `KycLongFormField` indirectly via shared schemas; verify `/services/[id]` (client-side) still works after Batch 1
