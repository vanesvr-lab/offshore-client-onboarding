# CLI Brief — B-090 Sticky Top Bar + Sticky Right Rail + Admin View Summary

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** No
**Builds on:** B-073 (step indicator), B-075 (admin KYC long-form anchors), B-050 §6.3 (client View Summary dialog)

---

## Why this batch exists

`/admin/services/[id]` is a long page. When the admin scrolls down to People & KYC, Documents, or the Audit Trail, **everything useful for orientation scrolls out of view**:

- The **back-to-services link**, the **service title**, the **stage strip** (Draft → … → Approved), and the **step indicator** (1. Company Setup ▸ 2. Financial ▸ …) all disappear off the top. The step indicator is the only fast way to jump between sections.
- The **right rail** (Status, Account Service Owner, Milestones, Audit Trail) scrolls away too, so the admin can't see status / owner / milestone dates while reviewing deep content.

There's already a `sticky top-0 z-30` on the title-row + stage-strip block ([ServiceDetailClient.tsx:3104](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx:3104)) — but it doesn't pin in practice. Vanessa needs you to **diagnose the broken sticky** before structuring the new layout — papering over with `position: fixed` is not acceptable.

Separately: each admin profile card under People & KYC has a quick-action row with `Portal access` and `Request KYC`. Admins want a **View Summary** button there too, opening the same read-only summary modal the client wizard already ships ([ServiceWizardPeopleStep.tsx:1499](src/components/client/ServiceWizardPeopleStep.tsx:1499)). In admin, every "Edit" affordance inside the modal closes the modal and **smooth-scrolls** to the matching KYC subsection that's already on the page (not a separate review flow).

After this brief:
- Back link + title + stage strip + step indicator pin together at the top while scrolling.
- The right rail pins as a whole column, scrolling inside itself when taller than the viewport.
- Each admin profile card has a `View Summary` button. Clicking it opens the existing summary dialog; per-section Edit pencils and the bottom "Open Review KYC to edit" all close the modal and smooth-scroll to the matching `kyc-section-${profileId}-${categoryKey}` anchor.

---

## Hard rules

1. **One batch.** Commit + push (`git push origin HEAD:main` — worktree is on a feature branch; CLI pulls main) + update CHANGES.md.
2. `npm run build` must pass clean (lint + type check).
3. **Diagnose the existing broken sticky at the root cause.** Walk the ancestor chain in dev tools: `<main className="...overflow-auto">` in [src/app/(admin)/layout.tsx:26](src/app/(admin)/layout.tsx:26), the `p-8` wrapper, the page wrapper. Identify whatever interrupts the sticky context (transform / overflow / will-change) and fix it. Do **not** switch to `position: fixed`; do **not** add `requestAnimationFrame` scroll handlers; the answer is a CSS chain fix.
4. **Reuse the client `ViewSummaryDialog`** — don't reimplement. Extract the inline function from `ServiceWizardPeopleStep.tsx` into a shared component (likely `src/components/shared/PersonSummaryDialog.tsx`) and import it from both the client wizard and the admin service detail page. Behaviour stays identical on client; only the `onJumpTo` callback differs by caller.
5. **Don't change the client portal's behaviour.** The client's existing flow (clicking Edit → opens Review KYC editor) must still work after the dialog is extracted.
6. **No API / DB changes.** Pure UI.
7. **Don't introduce a new state library or context.** All state is local to the components being edited.
8. **Don't restart the dev server** in the brief — Vanessa restarts after CLI finishes (auto-pattern handled outside the brief).

---

## Step 1 — Diagnose the broken top-bar sticky

File chain to inspect:
- [src/app/(admin)/layout.tsx](src/app/(admin)/layout.tsx) — the `<main className="flex-1 min-w-0 overflow-auto">` + the `<div className="p-8">` wrapper.
- [src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) — the page-level wrapper `<div>` at line ~3093 and the sticky div at line ~3104.

In dev tools on `/admin/services/[id]`, scroll the page and confirm whether the existing `sticky top-0 z-30` div pins. Most likely cause: the scroll happens at the **document level**, not inside `<main>` — meaning `overflow-auto` on main isn't actually creating a scroll context (e.g. content fits horizontally so main doesn't scroll, or some other rule overrides). Less likely but possible: an intermediate ancestor has `transform` / `filter` / `perspective` that creates a new containing block and breaks sticky.

Fixes by failure mode:
- **If scroll is at the document level** (most likely): change `<main>` to either `overflow-visible` so the document scrolls naturally and sticky targets the viewport, OR keep `overflow-auto` and ensure the layout creates a real scroll context. Choose whichever gives clean sticky-to-viewport behaviour with the dark Header bar at the top. Verify `Header` stays in flow.
- **If an ancestor breaks sticky context:** remove the offending property (transform/filter/etc.) if benign, or move the sticky element above the offender.

Write the diagnosis + chosen fix into the CHANGES.md entry so the next session knows why the layout works.

## Step 2 — Combine the sticky region: back link + title row + stage strip + step indicator

After Step 1, restructure the top of the page in `ServiceDetailClient.tsx` (around lines 3093–3174):

- Wrap the four elements — `<Link>Back to services`, the title + stage-strip block (currently the existing sticky), the step-indicator block — in **one outer `<div>`** with `sticky top-0 z-30 bg-gray-50 shadow-sm` (background matches the page's `bg-gray-50` so content scrolling underneath doesn't bleed through).
- Inside the wrapper: keep the existing internal styling of each element. The wrapper itself provides padding (`py-3`) and a subtle bottom border or shadow to separate from scrolling content.
- The wrapper's outermost flex/spacing classes should keep the same horizontal width the page uses today (don't change the page gutter).
- Remove the old `sticky top-0 z-30 shadow-sm` classes from the inner title/stage-strip div — that styling now lives on the outer wrapper.

When pinned, the sticky bar should sit flush below the dark `<Header>` bar (h-14 = 56 px from viewport top). If the diagnosis in Step 1 chose document-level scrolling, that means `top` becomes `top-14` (56 px) instead of `top-0`, so the bar pins under the page header — pick whichever value matches your fix.

Smoke test: scroll the page; everything in the wrapper stays visible. The step-indicator chevrons still smooth-scroll to each section (anchor IDs unchanged — `step-company-setup`, `step-financial`, etc.).

## Step 3 — Make the right rail sticky (full column, internal scroll)

File: same `ServiceDetailClient.tsx`. The two-column grid at line ~3177 (`<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">`) has:
- Left column: `<div className="lg:col-span-2 space-y-4">` — main sections.
- Right column: the rail with Status, Account Service Owner, Milestones, Audit Trail panels.

Wrap the right column's content in a sticky container so the **whole rail pins**:

```tsx
<div className="lg:col-span-1">
  <div className="lg:sticky lg:top-[N] lg:max-h-[calc(100vh-Npx)] lg:overflow-y-auto space-y-4">
    {/* existing Status / Owner / Milestones / Audit Trail panels */}
  </div>
</div>
```

- `N` = height of the sticky top bar (Step 2's wrapper) **plus** the 56 px Header. Easiest: introduce a CSS variable `--admin-sticky-offset` on the layout, set it from the sticky top bar's measured height (or hardcode an approximate value like `top-[140px]` to start; Vanessa can adjust visually).
- `lg:` prefix everywhere so on mobile (`< lg`) the rail still stacks below the main content with normal scrolling — no sticky on small screens.
- `overflow-y-auto` gives the right rail its own scrollbar when taller than the viewport. The scrollbar should be subtle — don't add custom scrollbar styling beyond the browser default.
- `space-y-4` preserves the existing gap between the right rail's panels.

Smoke test: scroll the page; right rail stays pinned. If you expand the Audit Trail and it pushes the rail taller than the viewport, an internal scrollbar appears inside the rail; the rest of the page keeps scrolling normally outside it.

## Step 4 — Extract `ViewSummaryDialog` into a shared component

File: create `src/components/shared/PersonSummaryDialog.tsx`. Move the body of `ViewSummaryDialog` from [ServiceWizardPeopleStep.tsx:1455](src/components/client/ServiceWizardPeopleStep.tsx:1455) into the new file. Keep the same exported component name + props for the client call site to keep working.

Look at the props the dialog currently takes:
- `person`, `documents`, `documentTypes`, `requirements` — data shapes
- `onClose` — close handler
- `onJumpToReview` — fires when any Edit affordance is clicked

For admin, the dialog needs a richer jump signal because each Edit clicks a *different* section. Update the dialog's API to:

```ts
type SummarySection = "identity" | "financial" | "compliance" | "tax" | "any";

interface PersonSummaryDialogProps {
  person: ServicePerson;
  documents: ClientServiceDoc[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  onClose: () => void;
  /** Fires when admin/client clicks an Edit affordance. `section` indicates
   *  which subsection the user wants to edit; "any" is the bottom "Open
   *  Review KYC to edit" button (no specific section). */
  onEdit: (section: SummarySection) => void;
}
```

Replace the old `onJumpToReview` callback. Inside the dialog:
- The per-section Edit pencils (rendered by `ReviewStep`'s `onJumpTo`) now call `onEdit` with the mapped section key:
  - `form-identity` / `form-residential-address` → `"identity"`
  - `form-financial` → `"financial"`
  - `form-declarations` → `"compliance"` (individual) — but for organisations Tax & Financial lives in `tax`; map `form-financial` → `"tax"` when the profile is an organisation. Use `person.client_profiles?.record_type === "organisation"` to decide.
  - `doc-list` → `"any"` (no per-section anchor for doc-only edits; admin closes and finds the doc themselves)
- The bottom "Open Review KYC to edit" button calls `onEdit("any")`.

Update the **client** call site in `ServiceWizardPeopleStep.tsx` to keep its existing behaviour: client's `onEdit` callback ignores the `section` argument and just does what `onJumpToReview` used to do (opens the inline review flow).

## Step 5 — Add the admin "View Summary" button + wire `onEdit` to scroll on the page

File: `ServiceDetailClient.tsx`. The quick-actions row in the admin profile card is at lines ~1949–1972. Add a new button between **Request KYC** and the "Sent" timestamp:

```tsx
<Button
  size="sm"
  variant="outline"
  onClick={() => setSummaryOpen(true)}
  className={`h-6 text-xs gap-1 ${BTN_OUTLINE}`}
>
  <Eye className="h-3 w-3" />
  View Summary
</Button>
```

Add local state `const [summaryOpen, setSummaryOpen] = useState(false);` in the profile-card component (same scope as the existing `showInviteDialog` state used by Request KYC).

Render the shared `PersonSummaryDialog` conditionally below the card. Build the props from the existing role/profile data the card already has. For `onEdit`:

```ts
function handleSummaryEdit(section: SummarySection) {
  setSummaryOpen(false);
  // Ensure the profile is expanded so the anchor is visible
  if (!expanded) setExpanded(true);
  // Smooth-scroll to the matching kyc-section anchor.
  const target = section === "any"
    ? `kyc-section-${profile.id}-identity` // default to the first subsection
    : `kyc-section-${profile.id}-${section}`;
  // Wait a frame so the expansion DOM update lands first.
  requestAnimationFrame(() => {
    document.getElementById(target)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}
```

The anchor IDs (`kyc-section-${profile.id}-{identity|financial|compliance|tax}`) already exist in the admin KycLongFormSection (set during the B-077 refactor).

**Icon import:** add `Eye` to the existing `lucide-react` imports at the top of `ServiceDetailClient.tsx`.

**Where the dialog renders:** mount it inside the profile-card component's return tree, conditional on `summaryOpen`. Don't lift it to the page level — keep state local.

## Step 6 — Smoke test (manual; document in CHANGES.md)

1. **Sticky top bar:** open `/admin/services/[id]` on a long service (Vanessa's Elarix LLC works). Scroll all the way to the bottom (Audit Trail). The back link, title, stage strip, and step indicator are all still visible at the top. Click step 4 ("People & KYC") in the indicator → page smooth-scrolls to that section.
2. **Step indicator anchor preservation:** all five anchors still resolve (`#step-company-setup`, `#step-financial`, `#step-banking`, `#step-people-kyc`, `#step-documents`).
3. **Sticky right rail (desktop, `lg+`):** scroll past the People & KYC section. The right rail (Status + Account Owner + Milestones + Audit Trail) stays pinned to the top-right. Expand the Audit Trail until the rail content is taller than the viewport — an internal scrollbar appears inside the rail. The main content keeps scrolling normally outside it.
4. **Mobile (375 px):** the right rail still stacks below the main column. No sticky on small screens, no internal scrollbar.
5. **View Summary button:** every admin profile card has the new button next to Request KYC. Clicking it opens the summary dialog with read-only fields and "Not provided" labels matching the client modal Vanessa screenshotted.
6. **Per-section Edit pencils:** click the Edit pencil next to "Your Identity" → modal closes, page smooth-scrolls to that person's Identity subsection (the section is expanded if previously collapsed).
7. **Bottom "Open Review KYC to edit":** closes the modal and scrolls to the person's first KYC subsection.
8. **Organisation profile:** if any profile in the test service is an organisation, the per-section mapping uses `tax` for the Tax & Financial section. Verify the smooth-scroll target lands on the org's Tax & Financial KycLongFormSection.
9. **Client portal regression check:** open the client KYC wizard → the existing View Summary flow still works (modal opens, Edit jumps to the inline review editor as before). Behaviour should be unchanged on client.
10. **`npm run build` clean.**

If any of 1–9 fails, fix in the same batch — don't ship half.

---

## CHANGES.md format

Append after the most recent entry:

```md
### YYYY-MM-DD — B-090 — Sticky top bar + sticky right rail + admin View Summary (Claude Code)

`/admin/services/[id]` — three navigation/visibility fixes bundled into one batch.

- **Sticky top bar:** back link + title row + stage strip + step indicator are now wrapped in a single sticky container. Diagnosed and fixed the existing broken sticky — root cause: <document-level scroll vs main-internal scroll mismatch / ancestor breaking sticky context — fill in the actual cause>. Sticky now pins flush under the dark Header. Anchor IDs (`step-company-setup` etc.) preserved.
- **Sticky right rail:** at `lg+` the entire right column (Status, Account Service Owner, Milestones, Audit Trail) pins as one block with internal `overflow-y-auto` for tall content. On `<lg` the rail still stacks below normally — no sticky on mobile.
- **Admin View Summary:** new button in each profile-card's quick-actions row, between Request KYC and the "Sent" timestamp. Opens a shared `PersonSummaryDialog` (extracted from `ServiceWizardPeopleStep`'s inline `ViewSummaryDialog`). Per-section Edit pencils + bottom "Open Review KYC to edit" close the modal and smooth-scroll to `kyc-section-${profileId}-${categoryKey}`. Client portal's existing View Summary flow unchanged after extraction — `onEdit("any")` still opens the inline review editor on client.

Files touched: `ServiceDetailClient.tsx`, `ServiceWizardPeopleStep.tsx`, new `PersonSummaryDialog.tsx`, possibly `(admin)/layout.tsx` if the diagnosis fix lives there.

Smoke test: <pass/fail notes from Step 6>.
`npm run build` clean.
```

---

## What NOT to do

- Do NOT switch to `position: fixed`, JS scroll handlers, or IntersectionObserver hacks to fake sticky. Find and fix the CSS chain.
- Do NOT change the client portal's existing View Summary behaviour. The extraction is structural — client behaviour identical.
- Do NOT change the dialog's visual look (typography, sections, "Not provided" labels, button placement). Only the `onEdit` plumbing differs.
- Do NOT change the step indicator's anchor IDs, the section card anchor IDs, or the KYC long-form's `kyc-section-{profileId}-{categoryKey}` anchors — many places depend on these strings.
- Do NOT make the sticky right rail apply on mobile — small screens stack the rail below the main column.
- Do NOT add a custom scrollbar style to the right rail's internal scroll. Default browser scrollbar is fine.
- Do NOT introduce new state libraries / context providers. Local component state only.
- Do NOT restart the dev server yourself.
