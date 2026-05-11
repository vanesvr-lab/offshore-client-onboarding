# CLI Brief — B-084 Auto-Update Completion % + Navy Buttons + Per-Section Doc Filter

**Status:** Ready for CLI
**Estimated batches:** 3
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** Yes (extending response shapes; no new routes)
**Builds on:** B-065 (instant state update pattern), B-077 (per-section docs), B-078 (admin save bar), B-083 (section pills)

---

## Why this batch exists

Three independent issues from QA on `/admin/services/[id]`:

1. **Completion % doesn't update after edits.** Vanessa edited Company Setup, removed a mandatory field, saved — the section's completion % stayed at 100%. Same class of bug B-065 fixed on the client portal: client-side state held the old completion data because save flows didn't return the recomputed counts. Apply the B-065 pattern (response-based patching + `router.refresh()`) to every save flow on this page.

2. **Buttons are inconsistent.** Different button shapes, different shades, some default-rounded, some not. Vanessa wants every button on this page in one consistent treatment: subtle rounded corners, navy blue.

3. **Per-section doc rows are too broad.** B-078/4 made per-section docs visible by category-match (every doc whose `document_type.category === section.category` appears). For Identity that's currently 5 docs (Certified Passport Copy, CV/Resume, Driving Licence, National ID Card, Proof of Occupation/Employment Letter) — but the Identity section's fields are all passport-related, so only the Passport should show as the section's source doc. Narrow the per-section doc filter from category-match to per-section doc allow-list.

After this brief: completion % refreshes after every save, buttons read as one family, and per-section doc rows show only the doc(s) that actually verify each section's fields.

---

## Hard rules

1. Complete all 3 batches autonomously. Commit + push + update CHANGES.md after each. Don't stop unless blocked.
2. **Out of scope, leave alone:** the bottom Documents block (B-077/2) — it must continue to show every uploaded doc by category regardless of section filter. Right-column cards. Stepper. Save bar styling itself (it's already brand-navy from B-078). KYC subsection headers. Other admin pages outside `/admin/services/[id]`.
3. `npm run build` must pass before declaring any batch done.
4. Reuse existing patterns — don't introduce new utilities or libraries.
5. **No DB schema changes.** No migrations.

---

## Batch 1 — Auto-update completion % on every save

### Goal

After any save mutation on `/admin/services/[id]`, the affected section's completion %, completion dot color, and "● Complete" / "● Not reviewed" status text reflect the new data without a manual page refresh.

### Mirror the B-065 pattern

The pattern from B-065 (client portal):
1. The save endpoint computes the new state (including derived counts) on the server and returns it in the response body
2. The client reads the returned record and splices it into local state, replacing the prior cached version
3. `router.refresh()` is called as a belt-and-suspenders for any server-rendered side data

### Apply to every save flow on this page

Identify every API route called from `/admin/services/[id]` that mutates underlying data:
- `PATCH /api/admin/profiles/[profileId]/kyc-fields` (B-078/3)
- `PATCH /api/admin/profiles/[id]` (profile-level fields)
- Roles add/remove (B-078/3)
- Substance form save
- Service actions form save
- Section reviews save (`/api/admin/applications/[id]/section-reviews`)
- Document Replace (B-078/5)
- Anything else mutating a `client_profile_kyc`, `client_profiles`, `services`, `service_substance`, or related table

For each:
- Server side: ensure the response body returns enough state for the client to update its local cache without a refetch — at minimum, the updated record(s) and any derived completion % / status counts the page renders. Re-read the existing route handlers; many already return the new record. Add the completion data where it's missing.
- Client side: in the `onSuccess` handler, splice the returned data into local state (replace by id) AND call `router.refresh()`. The refresh covers any server-rendered side data we don't track in client state.

### Where completion % is rendered

The percentage and dot color shown next to each section in the new B-083 pill cluster. Trace where `progressPct` (or whatever it's called) is computed for top-level steps and per-profile rows. If it's computed client-side from a flat fields object, the splice will recompute it for free. If it's computed server-side and rendered into props, the route response needs to include the new value.

### Smoke test for Batch 1

1. Open `/admin/services/[id]` for a service where Company Setup is at 100%
2. Edit a mandatory field, blank it out, click Save
3. Without manual refresh, Company Setup's percentage drops below 100%, dot turns amber, "● Complete" flips to "● Incomplete" / "● Not reviewed" / whatever the partial-state copy is
4. Repeat for Financial step, Banking step, People & KYC profile rows, and Substance/Service Actions if they have completion % displays
5. Edit another mandatory field, then Cancel — page state stays at the saved values, no false update

### Acceptance

- All 4 smoke test scenarios pass
- No `router.refresh()` calls without an accompanying state splice (refresh alone is too slow and loses local UI state like which sections are expanded)
- `npm run build` passes
- Commit + push + CHANGES.md entry

---

## Batch 2 — Button standardization: rounded + brand-navy

### Goal

Every button on `/admin/services/[id]` reads as one consistent family: subtle rounded corners (`rounded-md`), brand-navy primary, with appropriate variants for secondary / outline / ghost / destructive.

### Variant mapping

| Variant | Background | Text | Border | Use cases |
|---------|------------|------|--------|-----------|
| **Primary** | `bg-brand-navy hover:bg-brand-blue` | `text-white` | none | Save, Continue, Submit, primary CTAs |
| **Outline** | `bg-white hover:bg-gray-50` | `text-brand-navy` | `border border-brand-navy` | Cancel, secondary actions, View, Upload |
| **Ghost** | `bg-transparent hover:bg-gray-100` | `text-brand-navy` | none | Inline actions, dropdown triggers |
| **Destructive** | `bg-red-600 hover:bg-red-700` | `text-white` | none | Delete, Revoke, Discard |
| **Destructive outline** | `bg-white hover:bg-red-50` | `text-red-600` | `border border-red-600` | Discard changes, Remove (less aggressive than filled) |

All variants: `rounded-md`, current shadcn sizes (`size="sm"`, `size="default"`, etc.) preserved.

### Where to apply

Audit every `<Button>` and every styled `<button>` element on `/admin/services/[id]`:

- Top-level row Review buttons → outline variant
- Profile-level row Review buttons → outline variant
- Save bar from B-078 → primary (Save) + outline (Cancel) — already correct after B-078, just verify
- Section action buttons inside expanded views (Approve, Flag, etc.) — outline or ghost as appropriate
- Document row buttons (View, Upload, Replace, Approve, Revoke) → outline (View, Upload, Replace, Approve) and destructive outline (Revoke)
- Add Person / Add Director / Add Shareholder / Add UBO buttons → outline
- Any chevron-only toggle buttons → ghost
- Existing global save bar at `ServiceDetailClient.tsx:3422-3446` (substance/business edits) — already uses `bg-brand-navy`, verify it's `rounded-md` and consistent

### Don't blindly restyle

Some elements that look like buttons aren't:
- Status badges ("Approved" / "Flagged" / "Not reviewed") → these are pills, not buttons. Leave them alone.
- Role badges (Director / Shareholder / UBO) → leave alone
- The new B-083 section pills → leave alone (they're informational, not interactive in the button sense even though the row toggles)

### Smoke test for Batch 2

1. Walk every button on `/admin/services/[id]`. All have `rounded-md` corners.
2. Primary actions are filled brand-navy with white text. Hover transitions to brand-blue.
3. Outline actions have a brand-navy border + text on white background. Hover bumps the bg to gray-50.
4. Destructive actions are red. Confirm the Revoke action on Document detail dialog uses red.
5. No button still has the legacy default shadcn rounded styling (`rounded-full`, `rounded-lg`, etc. that doesn't match `rounded-md`).
6. Status pills, role badges, section pills are unchanged.

### Acceptance

- Smoke test passes for every button on the page
- No regressions on hover states, disabled states, focus rings (focus rings keep their existing visibility)
- `npm run build` passes
- Commit + push + CHANGES.md entry

---

## Batch 3 — Per-section doc filter: only docs that verify section's fields

### Goal

Per-section doc rows on `/admin/services/[id]` Step 4 narrow from "every doc in the matching category" to "only the doc(s) that actually verify the section's fields". Other category-matching docs drop out of the section but stay in the bottom Documents block (B-077/2).

### Define the per-section doc allow-list

For each section in `src/lib/kyc/sections.ts`, define which doc-type IDs are the section's source docs. Suggested data shape (extend the section schema):

```ts
type KycSection = {
  // existing fields...
  sourceDocTypeIds?: string[];  // doc-type IDs that verify this section's fields
};
```

Mapping for individual KYC profiles (typical case):

| Section | sourceDocTypeIds (by name — translate to IDs from `document_types`) |
|---------|--------------------------------------------------------------------|
| Your Identity (pre-Address) | `["certified_passport_copy"]` |
| Your Identity → Address subdivider | `["proof_of_residential_address"]` |
| Financial Profile | (likely empty or specific to the fields — investigate which doc-types feed the financial fields. If none directly, leave empty.) |
| Declarations | (typically no source doc — leave empty.) |

Mapping for organisation profiles (Elarix LLC etc.):

| Section | sourceDocTypeIds |
|---------|------------------|
| Organisation Identity | `["certificate_of_incorporation"]` or whatever the org's primary identity doc is |
| Org Financial | (investigate) |

If you find sections where there genuinely is no single canonical source doc, leave `sourceDocTypeIds` empty. The per-section row simply doesn't render for those, and admins consult the bottom Documents block instead.

### Update the matching function

Replace the category-based filter in [`ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) (the `findSectionDocs` or similar that B-078/4 introduced) with:

```ts
function findSectionDocs(section: KycSection): {
  uploaded: ServiceDoc[];
  missing: DocumentType[];
} {
  const allowedIds = section.sourceDocTypeIds ?? [];
  if (allowedIds.length === 0) {
    return { uploaded: [], missing: [] };
  }
  const uploaded = localDocs.filter((d) => allowedIds.includes(d.document_type_id));
  const missing = allowedIds
    .filter((id) => !uploaded.some((u) => u.document_type_id === id))
    .map((id) => documentTypesById[id])
    .filter(Boolean);
  return { uploaded, missing };
}
```

### Address subdivider compatibility

The Address subdivider (B-077/4) currently renders Proof of Residential Address as the only doc. Either:
- Move that hardcoded handling into the new `sourceDocTypeIds` system (Identity section gets `["certified_passport_copy"]`; the Address subdivider sub-block gets `["proof_of_residential_address"]`)
- Or keep the existing Address subdivider hardcoded path and only refactor the rest

Either is fine — pick whichever lands cleaner. The acceptance criterion is: Identity section shows only Passport above the Address subdivider, Address subdivider still shows only Proof of Residential Address inside it.

### Bottom Documents block stays unchanged

The bottom collapsible Documents block (B-077/2) continues to show every required doc by category, regardless of section filter. This is the canonical place admin sees the full doc list. Don't touch that.

### Smoke test for Batch 3

1. Open an individual profile → Identity section shows ONLY Certified Passport Copy as the source doc row (uploaded or empty-state Upload). CV/Resume, Driving Licence, National ID, Proof of Occupation are NOT in the section.
2. Address subdivider inside Identity still shows only Proof of Residential Address.
3. Bottom Documents block still shows all 5 Identity-category docs (Certified Passport Copy, CV/Resume, Driving Licence, National ID, Proof of Occupation) — unchanged.
4. Financial Profile section: shows whatever its `sourceDocTypeIds` resolves to (probably none if the section has no doc-fed fields). Bottom Documents block still shows all financial-category docs.
5. Declarations section: same — likely no per-section docs, all visible in bottom block.
6. Open an organisation profile (if test data has one): Identity section shows the org's identity doc only.
7. Click the empty-state Upload row on Identity → file picker, upload a Passport, doc swaps to View row.
8. Click View on the uploaded Passport → DocumentDetailDialog opens with admin actions.

### Acceptance

- All 8 smoke test scenarios pass
- `src/lib/kyc/sections.ts` cleanly defines `sourceDocTypeIds` per section
- The category-based logic from B-078/4 is replaced (don't leave dead code)
- Bottom Documents block unchanged
- `npm run build` passes
- Commit + push + CHANGES.md entry

---

## CHANGES.md format

After each batch:

```md
### YYYY-MM-DD — B-084 Batch N — <one-line title> (Claude Code)

<2-3 sentence description>

- Bullet detail
- Bullet detail
```

After Batch 3, add a close-out entry recapping all three batches.

---

## What NOT to do

- Do NOT touch the bottom Documents block (B-077/2) — must continue showing all category docs
- Do NOT change KYC subsection header styling
- Do NOT extend button changes outside `/admin/services/[id]` (other admin pages stay as-is for now)
- Do NOT introduce a new state-management library (React Query, Zustand, etc.) — we're applying the existing B-065 splice pattern
- Do NOT change the field schema in `src/lib/kyc/sections.ts` beyond adding `sourceDocTypeIds`
- Do NOT modify any database table or migration
