# CLI Brief — B-091 Profile Sort + Service-Level Summary Modal

**Status:** Ready for CLI (do **after** B-090 lands)
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-090 (sticky right rail + PersonSummaryDialog extraction). **Must run after B-090 is merged**, since this brief adds a button into the right rail B-090 makes sticky and reuses the `PersonSummaryDialog` component B-090 extracts.

---

## Why this batch exists

Two additions on `/admin/services/[id]`:

1. **Profile sort.** Today the People & KYC profile cards render in insertion order (whichever profile was added first). Admins want the most-action-needed profiles at the top: anyone with **Portal access** granted appears first, then everyone else, with both groups internally sorted by **KYC % ascending** (lowest completion first → most needs work). Same-% rows fall back to alphabetical name order.
2. **Service-level summary modal.** Today each profile card has a `View Summary` button (added in B-090) — a per-person read-only summary. There's no equivalent for the **service as a whole**. Vanessa wants a `View Summary for [service_number]` button at the **top of the right rail** that opens one big modal showing everything: Company Setup, Financial, Banking, every profile (collapsed to one summary row, expandable to the full per-profile content), and the documents list. The modal is intentionally large — "we can change after if needed".

Each section in the service modal has the same close-and-smooth-scroll Edit pattern as the per-profile modal, so admins can dive from the summary straight to the editable section on the page.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main`) + update CHANGES.md.
2. **Don't start until B-090 is on `origin/main`.** Pull, verify `git log --oneline -5` shows B-090's feat commit, then proceed.
3. `npm run build` clean.
4. **Reuse the `PersonSummaryDialog`** that B-090 extracts into `src/components/shared/PersonSummaryDialog.tsx`. The service summary modal renders each profile's content **inline via the same component** when the row is expanded — don't re-implement the per-profile summary.
5. **No new API / DB / migration.** All data already on the page.
6. **No new state library / context.** Local component state only.
7. **Don't change the per-profile modal's behaviour** introduced in B-090.
8. **Don't restart the dev server.** Vanessa restarts after CLI finishes.

---

## Step 1 — Sort profiles in `uniqueRoles`

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx), around line 2803.

`uniqueRoles = Array.from(profileRolesMap.values())` is the deduplicated profile list. Add a sort right after this line, before `uniqueRoles` is consumed by render.

Sort key for each `{ person, roles, allRoleRows }` entry:

1. **Portal access (descending):** `allRoleRows.some(r => r.can_manage)` → `true` first, `false` last.
2. **KYC % (ascending):** compute KYC% for the profile using the existing helper `calcKycPct(kyc)` defined at [ServiceDetailClient.tsx:157](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx:157). The `kyc` data for a profile is reachable via `person.client_profiles?.client_profile_kyc` (already an array → take `[0]` or pass through the existing flattener). Lower % first. If the profile has no KYC record at all, treat its % as `0` (so it floats to the top — needs the most attention).
3. **Alphabetical name (ascending):** `person.client_profiles?.full_name ?? ""` → `localeCompare` for the tiebreaker.

```ts
const uniqueRoles = Array.from(profileRolesMap.values()).sort((a, b) => {
  const aPortal = a.allRoleRows.some((r) => r.can_manage) ? 1 : 0;
  const bPortal = b.allRoleRows.some((r) => r.can_manage) ? 1 : 0;
  if (aPortal !== bPortal) return bPortal - aPortal; // portal-access on top

  const aKyc = computeKycPctForProfile(a.person);
  const bKyc = computeKycPctForProfile(b.person);
  if (aKyc !== bKyc) return aKyc - bKyc; // lower % on top

  const aName = a.person.client_profiles?.full_name ?? "";
  const bName = b.person.client_profiles?.full_name ?? "";
  return aName.localeCompare(bName);
});
```

`computeKycPctForProfile(person)` is a small inline helper that flattens `client_profile_kyc` (handle both array + single-object shapes) and calls `calcKycPct`. Reuse the same flattening logic already used elsewhere on the page (search for `Array.isArray(r.client_profiles.client_profile_kyc) ? r.client_profiles.client_profile_kyc[0] : ...` — that pattern repeats).

Verify in the UI: People & KYC list reorders correctly. Portal-access profiles cluster at the top. Within each group, the profile with the lowest KYC% is first, alphabetical ties broken predictably.

## Step 2 — New `ServiceSummaryDialog` component

Create [`src/components/admin/ServiceSummaryDialog.tsx`](src/components/admin/ServiceSummaryDialog.tsx).

**Props:**

```ts
interface ServiceSummaryDialogProps {
  service: ServiceRecord;            // for service_number, name, description
  serviceFields: ServiceField[];     // template fields for Company Setup / Financial / Banking
  serviceDetails: Record<string, unknown>; // current values
  uniqueRoles: { person: RoleWithProfile; roles: string[]; allRoleRows: RoleWithProfile[] }[];
  documents: ServiceDoc[];           // all docs on the page
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  onClose: () => void;
  /** Fires when an Edit pencil is clicked. `target` is the anchor string to scroll to. */
  onEdit: (target: string) => void;
}
```

**Modal shell** (mirrors `PersonSummaryDialog`):

```tsx
<Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-[100]">
    <DialogHeader>
      <DialogTitle>{service.service_templates?.name ?? "Service"} — Service Summary ({service.service_number})</DialogTitle>
    </DialogHeader>
    {/* sections below */}
    <div className="flex justify-end pt-3 border-t">
      <Button onClick={onClose} className="h-10 px-5 bg-brand-navy text-white hover:bg-brand-navy/90">Close</Button>
    </div>
  </DialogContent>
</Dialog>
```

`max-w-4xl` is wider than the per-profile modal's `max-w-3xl` to fit longer rows. `max-h-[90vh] overflow-y-auto` keeps it scrollable for long content.

**Sections to render inside the modal:**

### 2a. Company Setup / Financial / Banking — read-only field list per section

For each of the three service-field sections (use the existing `getFieldsForSection(key, serviceFields)` helper at line ~89 of `ServiceDetailClient.tsx` — export it from the page file or inline a copy in the new dialog file):

- Render a header with the section name + an Edit pencil button (Lucide `Pencil`, h-3.5).
- Below the header, render a 2-col grid: label on the left, value on the right.
- Empty values render as `Not provided` in `text-red-500 italic` (matches the per-profile dialog's empty-state look).
- Skip sections that have **zero fields** in the template (e.g. if Banking has no fields for this service type).
- Pencil onClick: `onEdit("step-company-setup")` / `onEdit("step-financial")` / `onEdit("step-banking")`.

Implementation hint: factor a small `<ReadOnlyFieldSection title fields values onEdit />` helper component inside the dialog file to keep the JSX clean. The same helper renders all three.

### 2b. Profiles section — collapsible rows, one per profile

Header: `Profiles ({uniqueRoles.length})` with no global Edit pencil (each row has its own).

For each `uniqueRoles` entry (use the **sorted** list passed in via props):

- Collapsed row layout: `[name] [role badges] [Portal access dot if granted] [KYC: XX%] [Show ▾] [Edit pencil]`.
- Edit pencil onClick: `onEdit(\`person-card-\${profile.id}\`)` (scrolls to the profile card on the page).
- Show ▾ toggles a local expanded state for that row. When expanded, render the full per-profile content **inline** by reusing the body of `PersonSummaryDialog` — specifically the `<ReviewStep …>` invocation. **Don't render the whole Dialog wrapper inside** — just the ReviewStep body. Either:
  - Export a sub-component from `PersonSummaryDialog` (e.g. `PersonSummaryBody`) that the ServiceSummaryDialog imports and reuses, OR
  - Refactor `PersonSummaryDialog` so the inner content is its own component, and `PersonSummaryDialog` becomes a thin Dialog wrapper around it.
  
  Choose the lower-churn option. The goal: no copy-paste of the ReviewStep wiring.

- When the inline ReviewStep fires its own `onJumpTo`, route it through the dialog's `onEdit` callback with a per-section anchor:
  - `form-identity` / `form-residential-address` → `kyc-section-${profileId}-identity`
  - `form-financial` → `kyc-section-${profileId}-financial` for individuals, `kyc-section-${profileId}-tax` for organisations
  - `form-declarations` → `kyc-section-${profileId}-compliance`
  - `doc-list` → `kyc-section-${profileId}-identity` (default — admin can navigate further from there)

### 2c. Documents section — flat list

Header: `Documents` + Edit pencil → `onEdit("step-documents")`.

Body: a flat list of all docs on the service (`documents` prop), one row per doc:
- Filename
- Document type name (from `document_types.name`)
- Verification status badge (reuse the existing badge component for verification_status — `verified` / `flagged` / `pending` etc.; the page already has the styling, find and reuse)
- Admin status (`approved` / `rejected` / `pending`) if present
- Uploaded date (short format)

Group order: service-level docs first (`document_types.scope === "application"`), then per-profile docs grouped by profile. A simple visual subheading per group is enough (`Service Documents` / `[Profile Name]'s Documents`).

If there are zero documents, render `No documents uploaded yet` in `text-gray-500`.

## Step 3 — Wire the button at the top of the right rail

File: `ServiceDetailClient.tsx`. The right rail is the right column of the two-col grid at ~line 3177 (`grid grid-cols-1 lg:grid-cols-3 gap-6` → right col). After B-090, the right rail is sticky and contains Status, Account Service Owner, Milestones, Audit Trail.

At the **very top** of the right rail (above Status), add:

```tsx
<Button
  onClick={() => setServiceSummaryOpen(true)}
  className={`w-full justify-center h-10 ${BTN_BRAND_NAVY}`}
>
  <Eye className="h-4 w-4 mr-1.5" />
  View Summary for {service.service_number ?? "Service"}
</Button>
```

(`BTN_BRAND_NAVY` is the existing brand-navy outline/filled button class used elsewhere on the page — find and reuse the right one for visual consistency.)

If `service.service_number` is null/empty, fall back to `View Service Summary` (no ID suffix). Don't render `View Summary for null`.

Add state `const [serviceSummaryOpen, setServiceSummaryOpen] = useState(false);` in the same scope as the other top-level page state.

Render the dialog conditionally near the page bottom (sibling to other dialogs):

```tsx
{serviceSummaryOpen && (
  <ServiceSummaryDialog
    service={service}
    serviceFields={serviceFields}
    serviceDetails={serviceDetails}
    uniqueRoles={uniqueRoles}
    documents={documents}
    documentTypes={documentTypes}
    requirements={requirements}
    onClose={() => setServiceSummaryOpen(false)}
    onEdit={handleServiceSummaryEdit}
  />
)}
```

## Step 4 — Implement `handleServiceSummaryEdit`

Inside `ServiceDetailClient.tsx`:

```ts
function handleServiceSummaryEdit(target: string) {
  setServiceSummaryOpen(false);
  // If target is a kyc-section anchor, the matching profile card needs to be
  // expanded too. The profile cards manage their own `expanded` state, so
  // dispatch a custom event the cards listen for, OR raise the expanded
  // state up. For this brief, the simpler path:
  // - For step-* anchors, just smooth-scroll (those are top-level sections).
  // - For kyc-section-{profileId}-* anchors, extract profileId and trigger
  //   the profile-card expand via a ref/state, then scroll after a frame.
  // - For person-card-{profileId} anchors, just smooth-scroll (the card
  //   itself handles its expand state independently).
  requestAnimationFrame(() => {
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
```

For the **per-profile-kyc anchors** case specifically, profile expansion is driven by per-card local state. Adding a "force-expand" hook from outside is non-trivial. Two acceptable approaches:

- **(simpler)** Scroll only to `person-card-${profileId}` for KYC-section edits — the admin sees the collapsed profile card, clicks Show, then sees the KYC. Acceptable since the alternative requires plumbing.
- **(better UX)** Lift the per-profile expansion state into a Set in the page scope so the dialog can pre-expand. If you have time, do this; if not, fall back to the simpler option and document the trade-off in CHANGES.md.

Pick one and document the choice. Don't ship half-done plumbing.

## Step 5 — Smoke test (manual; document in CHANGES.md)

1. **Sort:** People & KYC list orders correctly. Toggle Portal access on a profile → it jumps to the top of its group. Two profiles with same KYC% sort alphabetically.
2. **Sort stability:** scrolling, expanding, collapsing a profile card doesn't reshuffle the list. The sort is computed once per render based on stable data.
3. **Button visibility:** at the top of the right rail, the `View Summary for GBC-002` button is the first thing under the sticky top bar. Always visible when the right rail is pinned (B-090). On mobile, it appears at the top of the right rail content when the rail stacks below the main column.
4. **Button label fallback:** for a service with no `service_number`, button reads `View Service Summary`.
5. **Modal — Company Setup section:** opens with all fields shown, filled values displayed, empty fields show `Not provided` in red italic. Edit pencil → closes modal, smooth-scrolls to `step-company-setup`.
6. **Modal — Financial / Banking:** same as above. If a section has zero fields for this service template, the section block doesn't render.
7. **Modal — Profiles:** every profile appears as a collapsed row with name + roles + portal-access dot + KYC%. Order matches the sort applied in Step 1.
8. **Profile expand:** clicking Show on a profile row reveals the same ReviewStep content as the per-profile modal. Per-section Edit pencils inside the expansion close the modal and scroll to the matching `kyc-section-…` anchor (or `person-card-${profileId}` per Step 4's chosen approach).
9. **Modal — Documents:** flat list grouped by service-level / per-profile. Each row shows filename, doc type, status. Empty state reads `No documents uploaded yet`. Edit pencil → `step-documents`.
10. **Close behaviour:** Close button + X icon + Escape key + clicking outside the modal all dismiss cleanly.
11. **Per-profile View Summary (B-090) still works:** opening the per-profile modal from a profile card behaves exactly as B-090 left it. The service summary doesn't interfere.
12. **Client portal regression:** the client wizard's View Summary still works.
13. `npm run build` clean.

If 11 or 12 break, fix in the same batch.

---

## CHANGES.md format

```md
### YYYY-MM-DD — B-091 — Profile sort + service-level summary modal (Claude Code)

`/admin/services/[id]` — two related additions.

- **Profile sort** (`uniqueRoles` in `ServiceDetailClient.tsx`): Portal access on top, then KYC % ascending, alphabetical tiebreaker. Profiles with no KYC record sort as 0% (top within their group).
- **Service-level summary modal:** new `ServiceSummaryDialog` component at `src/components/admin/ServiceSummaryDialog.tsx`. Renders Company Setup / Financial / Banking as read-only field lists, profiles as collapsible rows reusing the body of `PersonSummaryDialog` (extracted in B-090), and documents as a flat list grouped by service-level vs per-profile. Every section has an Edit pencil that closes the modal and smooth-scrolls to the matching anchor (`step-*`, `person-card-{id}`, or `kyc-section-{id}-{cat}`).
- **Button:** `View Summary for {service_number}` (fallback: `View Service Summary` when no number) at the top of the right rail, above Status. Sticks with the rail per B-090.

Per-profile expand from inside the service modal: <which approach was chosen — simpler scroll-to-card vs lifted-expansion state — and why>.

Smoke test: <pass/fail notes from Step 5>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT start before B-090 lands on origin/main. Verify with `git log --oneline -5`.
- Do NOT copy-paste the per-profile ReviewStep wiring inside the service summary — refactor `PersonSummaryDialog` to expose its body component and import that.
- Do NOT change the per-profile View Summary modal's behaviour (B-090).
- Do NOT change the client portal's View Summary flow.
- Do NOT change service-field anchor IDs (`step-company-setup`, etc.) or KYC-section anchor IDs (`kyc-section-{profileId}-{categoryKey}`) or profile-card anchor IDs (`person-card-{profileId}`).
- Do NOT add a custom scrollbar style inside the modal — default browser scrollbar.
- Do NOT add new state libraries / context providers.
- Do NOT restart the dev server yourself.
