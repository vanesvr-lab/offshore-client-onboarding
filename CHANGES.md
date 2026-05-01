# CHANGES.md — Coordination Log

This file is maintained by both **Claude Code** (CLI) and **Claude Desktop** to coordinate changes on the shared codebase. Update this file whenever you make significant changes so the other instance stays in sync.

---

## How to use this file

- Before starting work: **read this file** to see what was last touched
- After making changes: **add an entry** at the top of the relevant section
- For schema changes: always note the exact SQL run so the other instance knows the DB state
- For risky/shared files (types, middleware, layouts): call it out explicitly

---

## Recent Changes

### 2026-04-30 — B-047 (Batch 4 — button hierarchy + placement audit) (Claude Code)

Rolls a three-tier button system across every client wizard / dialog so each screen has exactly one Primary, one or more Secondaries, and Back / Cancel as quiet tertiaries. All buttons now meet the 44pt touch-target rule.

**4.1 — Three-tier button system (applied as raw className strings, no new component):**
- **Primary** — `h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90`. Used for: Next, Save & Continue, Submit, Submit for Review, Save & Close (in unsaved-changes dialog), Save & Finish, Add {role}.
- **Secondary** — `h-11 px-5 bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50`. Used for: Save & Close (wizard nav), middle button in per-person centered group, "Stay" in unsaved-changes dialog.
- **Tertiary** — `h-11 px-3 bg-transparent border-0 text-gray-600 font-medium hover:text-gray-900 hover:bg-transparent`. Used for: Back, Cancel, "Leave without saving".

**4.2 — Files updated:**
- `src/components/client/ServiceWizardNav.tsx`: Submit was green (off-brand) → primary brand-navy; Save & Close → secondary; Back → tertiary text-link. Submit ✓ glyph removed (icon = decoration; text alone is the affordance per `color-not-only`). Sizes default → h-11.
- `src/components/kyc/KycStepWizard.tsx`: navigation rebuilt with the three-tier classes. Back is now tertiary; Save & Continue / Submit for Review / Save & Close / Save & Finish / Save are all primary. All bumped from default size to h-11.
- `src/components/client/PerPersonReviewWizard.tsx`: centered three-button bar bumped from `size="sm"` (h-7) → h-11 with the tier classes. Centered group from B-046 stays — only colors / weights / sizes change.
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx`: unsaved-changes dialog reworked — `Save & Close` is now the single primary (was bg-brand-blue → now brand-navy), Stay = secondary outline, "Leave without saving" = tertiary text. All buttons h-11. Top-left "Back to Dashboard" demoted from blue-600 + h-4 chevron → gray-600 + h-3.5 chevron.
- `src/components/client/ServiceWizardPeopleStep.tsx` (Add-person modal): Cancel → tertiary text link, Add → primary brand-navy 44pt. Loader spinner bumped 3.5px → 4px to match h-11.
- `src/app/(client)/applications/[id]/page.tsx`: "← Back to Dashboard" button → gray-600 link.
- `src/app/(client)/apply/[templateId]/review/page.tsx`: "Back to Documents" → tertiary text-link; "Submit Application" → 44pt primary.

**4.3 — Loading states:**
- All async-firing primary buttons show spinner + label change while running. The §1.5 anti-flash hold (≥200ms) and success-flash patterns are available via the `<AsyncButton>` from Batch 1 — Batch 5 migrates the more complex submit handlers (`handleSubmit` chains in the wizards) over to it; for this batch, the existing spinner+disabled patterns stay in place but are visually consistent now.

**4.4 — Top-left back-navigation demoted:**
- "Back to People" (PerPersonReviewWizard), "Back to Dashboard" (ClientServiceDetailClient + applications/[id]), "Back to dashboard" (service landing) all now share the same recipe: `text-gray-600 hover:text-gray-900 font-medium`, `h-3.5 w-3.5` chevron icon, `gap-1`. They no longer compete with the page heading.

**Build:**
- `npm run build` clean.

---

### 2026-04-30 — B-047 (Batch 3 — Role-chip toggle redesign) (Claude Code)

Replaces the B-046 status-style role chips (`[Director ✓]`) with explicit checkbox-style toggles prefixed by "Roles:" so the affordance reads as **a control**, not as a status badge. Toggle behaviour, optimistic update, last-role confirmation, and per-role palette are all preserved from B-046.

**3.1 — `RoleToggleRow` reskin in `src/components/client/PerPersonReviewWizard.tsx`:**
- Outer wrapper now starts with a `Roles:` prefix label (gray-600, 14px font-medium, vertically centered with the chips), followed by an inline-flex group of pill buttons.
- Each pill: `h-11` (44pt touch target), `px-3` horizontal padding, `gap-2` between chips (`touch-spacing`), `rounded-full`, focus ring 2px brand-navy with offset.
- Inside the chip: `<CheckSquare>` (filled) when selected / `<Square>` (outlined gray-400) when unselected, 6px gap, role label. Label is **identical in both states** — does not flip to "Add Director" / "Remove Director" (visually noisy, confusing for keyboard nav).
- Active state keeps the B-046 role palette (Director blue, Shareholder purple, UBO yellow). Inactive state is a single neutral outline (`bg-white border-gray-300 text-gray-700 hover:bg-gray-50`) so the visual difference reads as "checked / unchecked" not "different status colour".
- Loading: while a toggle is in flight, the chip's icon swaps to a spinner (no layout shift) and the button is disabled.
- A11y: `role="checkbox"` + `aria-checked` per chip; `aria-label="Toggle Director role"` etc.; keyboard tab to chip, space toggles via the standard button activation. (`aria-pressed` removed — invalid attribute for `role="checkbox"` per WAI-ARIA, `aria-checked` already conveys state.)

**3.2 — Preserved from B-046:**
- UBO chip hidden when `record_type !== 'individual'` (org persons only have Director / Shareholder).
- Last-role removal still triggers `confirm("… will have no role on this application. Continue?")`.
- Optimistic update + rollback on save failure unchanged.
- The bottom Roles list that B-046 removed is **not** reintroduced — top row is the only place to see/edit roles.

**Build:**
- `npm run build` clean — 1 ESLint warning (`aria-pressed not supported by role checkbox`) caught and fixed before commit.

---

### 2026-04-30 — B-047 (Batch 2 — Declarations Yes/No placement) (Claude Code)

Lands the agreed design decision: Yes/No answers go directly under the question, no edge-to-edge gap. Replaces the cramped right-pinned radio pair with a 44pt segmented pill.

**2.1 — `<YesNoToggle>` segmented pill:**
- `src/components/shared/YesNoToggle.tsx` (new): two side-by-side pill buttons, ~120px wide × 44px tall (h-11), 8px gap between (`touch-spacing`). Selected = filled `bg-brand-navy text-white border-brand-navy`. Unselected = `bg-white border-gray-300 text-gray-700 hover:bg-gray-50`. Focus ring 2px brand-navy. `role="radiogroup"` + `aria-label` on wrapper, `role="radio"` + `aria-checked` per pill. Keyboard: arrow keys flip selection (and move focus), space/enter selects, single tab stop into the group per WAI-ARIA radiogroup pattern. **No red used for "No"** (`color-not-only`).

**2.2 — DeclarationsStep restructure:**
- `src/components/kyc/steps/DeclarationsStep.tsx`: removed the bordered `<Card>` wrappers around PEP and Legal-Issues blocks (kills card-on-card). Each question is now a vertically stacked block: 16px title (`text-base font-semibold text-gray-900`) + red `*` for required, 14px description (`text-sm text-gray-600`), then `<YesNoToggle>` directly below. 32–40px gap between questions (`space-y-10` on container, `space-y-3` inside each block).
- Removed the inline `YesNoRadio` sub-component — now using the shared `<YesNoToggle>`.
- PEP details / legal-issues details Textareas now constrained to `max-w-2xl` + `min-h-[120px]` from `formWidths.longFormTextareaMin`. Persistent helper text under tax ID instead of placeholder-as-helper.

**2.3 — Tax ID + EDD text fields:**
- Tax ID input now uses `formWidths.identifier` (`md:w-56`) instead of full-width. Persistent helper line: "Your jurisdiction's tax identifier (e.g. NI number, SSN, TIN)." Added `inputMode="text"` and `autoComplete="off"`.
- EDD textareas (`relationship_history`, `geographic_risk_assessment`) constrained to `max-w-2xl` + `min-h-[120px]` so long text remains readable on wide screens.

**Build:**
- `npm run build` clean.

---

### 2026-04-30 — B-047 (Batch 1 — form design system foundations) (Claude Code)

Token / utility / shared-component pass — establishes the patterns later batches reuse. **No user-facing visual changes in this batch.**

**1.1 — Field-width system:**
- `src/lib/form-widths.ts` (new): exports `formWidths` constants (postal `md:w-24`, phone `md:w-48`, date `md:w-40`, country `md:w-60`, state `md:w-52`, city `md:w-64`, currency `md:w-32`, identifier `md:w-56`, email `md:w-80`, fullName `md:w-80`, full, longFormTextareaMin). Also `twoColRowClass`, `evenTwoColRowClass`, and vertical-rhythm helpers (`sectionSpacing`, `groupSpacing`, `fieldSpacing`).

**1.2 — Universal `<FormField>` wrapper:**
- `src/components/shared/FormField.tsx` (new): top-aligned label (14px font-medium text-gray-900 mb-1.5), red `*` after label for required, `aria-required` on input. Helper text (12px gray-600) below the field, replaced by error (12px red-600) when present, with `role="alert"` + `aria-live="polite"`. Render-prop child receives `{ id, "aria-invalid", "aria-describedby", "aria-required" }` so it composes with any input primitive (Input, Textarea, CountrySelect, custom).
- Existing `ValidatedLabel` / `FieldWrapper` left intact for backward compat — Batch 5 migrates forms over to FormField as it touches them.

**1.3 — Section grouping (kill card-on-card):**
- Documented as the canonical pattern in `form-widths.ts` rhythm helpers; Batch 2 + 5 will rip nested Card containers as they touch each form. No code change in this batch.

**1.4 — Validation utilities:**
- `src/lib/validation.ts` (new): `isRequired`, `isEmail`, `isPhone`, `isISODate`, `isMinLength`, `isMaxLength`, plus `runAll` for chaining. Each returns `{ valid: true } | { valid: false, message }` with messages following §8 `error-clarity` (state cause + how to fix, e.g. "Enter a valid email like name@example.com" not "Invalid email").

**1.5 — Loading + success affordances:**
- `src/components/shared/AsyncButton.tsx` (new): wraps the project's `<Button>` primitive. Disables on click, shows `<Loader2>` spinner + `loadingLabel` ("Saving…") while the async handler runs, holds disabled state ≥200ms even on instant responses (anti-flash), then optionally flashes a green check + `successLabel` ("Saved") for 600ms before reverting. Pass-through props for variant/size/className. Reverts cleanly on error so upstream toast handles messaging.

**Build:**
- `npm run build` clean — type check + lint pass, no warnings.

---

### 2026-04-30 — B-046 (Batch 5 — auto-fill banner) (Claude Code)

Replaces the clickable "Fill from uploaded document" CTA in `IdentityStep` with an automatic prefill on mount + a passive indicator banner. Per-field ✨ icons from B-044 are untouched and continue to work alongside the new screen-level banner.

**5.1 — Auto-trigger:**
- `src/components/kyc/steps/IdentityStep.tsx`: on mount, a `useRef` guard fires the existing `/api/profiles/kyc/save` payload exactly once with all currently `prefillable` fields (empty form fields that have an extracted source value). The endpoint, request shape, and `onChange(patch)` dispatch are unchanged from the old click handler — only the trigger moved from button click to `useEffect`.
- `prefillFiredRef` ensures we don't re-fire if `prefillable.length` recomputes (e.g. a re-render after upload). The component already remounts when the user navigates away and back via the per-person sub-step wizard, so a fresh attempt is naturally driven by remounts.

**5.2 — Passive banner replaces the clickable CTA:**
- The dashed `<Button>` with "Fill from uploaded document" copy is gone. In its place, four mutually exclusive banners (state machine: `idle | running | success | error | no-source`):
  - `running` — blue tint, spinner, "Reading your document…"
  - `success` — blue tint, sparkle, "Filled from uploaded document / Values extracted from your passport / ID."
  - `no-source` — grey, info icon, "Upload your passport or ID to auto-fill these fields." (Shown when no passport / proof-of-address has been uploaded yet.)
  - `error` — amber, warning icon, "Couldn't auto-fill from your document. Please enter values manually."
- No click target on any banner — pure indicator. Per-field ✨ icons remain the override path.

**5.3 — Other form steps (audit per brief 5.4):**
- `FinancialStep` and `DeclarationsStep` have no `computePrefillableFields` / `computeAvailableExtracts` wiring today (no extraction fields are mapped to financial / declaration form keys). Per the brief — "If a form has no prefill source today, leave it untouched" — neither was changed.

**5.4 — Cleanup:**
- Removed dead `Button` import + `prefilling` state + `handlePrefillClick` function from `IdentityStep`.
- Added `Info` and `AlertTriangle` from `lucide-react` for the new banner states.
- `npm run build` clean.

---

### 2026-04-30 — B-046 (Batch 4 — sub-step wizard restructure) (Claude Code)

The brief was extended after the original Batch 4 (layout rework) shipped. The Review KYC view now runs as a sub-step wizard with a persistent shell and a centered three-button bar. Layout content from the previous batch (role toggle, docs panel, contact row, KYC form) is reused — the wizard just re-arranges *when* each piece is shown.

**4.1 — New `PerPersonReviewWizard` component:**
- New file: `src/components/client/PerPersonReviewWizard.tsx`. Owns its own form state, doc-upload state, sub-step index, and save-on-transition logic. Replaces the inline Review KYC view rendering inside `ServiceWizardPeopleStep`.
- 8 sub-step pipeline (skipped where empty): `Identity docs` → `Financial docs` → `Compliance docs` → `Contact details` → `Identity` → `Financial` → `Declarations` (CDD/EDD only) → `Review`. Organisations follow a 3-form variant: `Company details` → `Tax & financial` → `Review`.
- Doc-category sub-steps with zero document slots are removed from the visible list. Sub-step counter reflects the *visible* count.
- Persistent shell across all sub-steps: back link + `RoleToggleRow` + KYC progress strip (per-category icons + counts + status legend) + sub-step counter.
- Helper subtitle ("Upload your KYC documents below — we'll auto-fill the rest…") is shown only on doc-list sub-steps.
- Centered three-button bar replaces the old top/bottom buttons:
  - Left: `← Back` (calls `goBack`; saves form on form sub-steps before retreating; calls `onExit` on the first sub-step).
  - Middle: `Upload later` on doc sub-steps · hidden on contact · `Save & Close` on form sub-steps · `Save & Continue`/`Save & Finish` on the final sub-step in review-all mode.
  - Right: `Next →` on every sub-step except the last. Disabled on doc sub-steps until all required docs in the category are uploaded.
- "Back to People" link in the top-left auto-saves form state (when on a form sub-step) before exiting; spinner appears during the save.

**4.2 — Inline org form steps:**
- The org variant (`Company details`, `Tax & financial`, `Review`) is rendered by inline copies of `KycStepWizard`'s internal `CompanyDetailsStep`, `CorporateTaxStep`, and `OrgReviewStep`. We didn't export these from `KycStepWizard` — the wrapper is meant to be self-contained so we can iterate on the per-person wizard without touching the legacy `/kyc` and `/apply` flows.

**4.3 — Doc upload + verification polling:**
- Upload flow lives inside `PerPersonReviewWizard` and mirrors `KycDocListPanel`: image compression for >500 KB images, 4.5 MB Vercel limit guard, optimistic local doc state mutation, 25-attempt verification poll.
- Replacement flow goes through the existing `DocumentDetailDialog` and updates local docs state on `onDocumentReplaced`.

**4.4 — `ServiceWizardPeopleStep` integration:**
- `src/components/client/ServiceWizardPeopleStep.tsx`: the entire `if (reviewingPerson) { … }` block is replaced with a single `<PerPersonReviewWizard … />`. Dead code removed: inline `KycDocListPanel` (~340 lines), `RoleToggleRow` (~130 lines), `ContactDetailsRow` (~85 lines), `mapToKycRecord`, `mapToDocumentRecord`, `KYC_DOC_CATEGORIES`/`isKycDocCat`, the `kycFlushRef` + `leaving` state, and the `useRef` import. The `KycStepWizard` import is gone too — the new wrapper renders `IdentityStep`/`FinancialStep`/`DeclarationsStep`/`ReviewStep` directly so we don't carry the legacy 4-step navigation.
- `handleExitKycReview` is now a sync function — saving on exit is the wizard's responsibility, not the parent's.

**4.5 — `ServiceWizardNav` centered group:**
- `src/components/client/ServiceWizardNav.tsx`: outer wizard nav switched from `justify-between` (Save & Close left, Back/Next right) to `justify-center` with the canonical `[← Back] [Save & Close] [Next →]` order to match the per-person wizard's button bar.

**4.6 — Sanity:**
- `npm run build` clean.
- `KycStepWizard` is still imported by `/kyc`, `/apply`, and `PersonsManager` — leaving it untouched.

---

### 2026-04-30 — B-046 (Batch 4): Review KYC layout rework (Claude Code)

**4.1 — Person card slim-down:**
- `src/components/client/ServiceWizardPeopleStep.tsx::PersonCard`: removed the bottom "Roles" section (per-role list with Remove/Add-role select). The card keeps avatar, name, role chips (top), email, KYC progress bar, "Review KYC" button, and the "Last request sent on …" indicator. Type chip ("Individual"/"Corporation") removed too — record type is reflected in the role chip palette.
- The unused `addingRoleInCard` / `shareholdingInput` / `addRoleLoading` state and `handleAddRole` / `handleRemoveRole` handlers were stripped from the card. `onRoleRemoved` / `onRoleAdded` props remain on the type so parent call sites are untouched, but the card no longer invokes them — toggling roles now lives in the Review KYC top row.

**4.2 — Review KYC top row redesign:**
- New `RoleToggleRow` component renders three click-to-toggle chips on the right of the person's name: `Director` (blue), `Shareholder` (purple), `UBO` (amber). Active = filled, inactive = outlined and muted; the active chip also shows a `CheckCircle2` so the toggle state is unambiguous.
- UBO chip is hidden entirely when `record_type !== 'individual'`.
- Toggling is optimistic: state updates locally first, then API call (`POST /api/services/[id]/persons` to add, `DELETE /api/services/[id]/persons/[roleId]` to remove). On API failure the optimistic change is rolled back via the parent's `handleRoleRemoved` / `handleRoleAdded` callbacks and a toast is shown. While a chip is in flight it's disabled to prevent double-clicks.
- Removing the last role surfaces a `confirm("{Name} will have no role on this application. Continue?")` per spec; no inline % capture (Shareholder % stays on the OwnershipStructure component below the list).
- Helper text under the top row: "Upload your KYC documents below — we'll auto-fill the rest of the form from them."

**4.3 — KYC documents panel rework:**
- The Profile + Roles split block is gone — the Review KYC view's top panel is now a full-width KYC documents card.
- `KycDocListPanel` rewritten to a two-column grid. A flat list of doc types is built in section order (Identity → Financial → Compliance) and split by count; the left column gets the extra when the count is odd. Section headers render inline within each column wherever the section's docs fall — if a section spans both columns the header appears in both. Each column has its own `overflow-y-auto` scroller (`max-h-[420px]`). Collapsible category accordions removed.
- Heading row keeps the existing legend + "X of Y uploaded" copy.

**4.4 — Contact Details + Identity below docs panel:**
- New `ContactDetailsRow` component (single row, two inputs: Email, Phone) with a Save / Cancel pair that PATCHes `/api/profiles/[id]` on dirty. `ContactDetailsRow` lives between the docs panel and the wizard's Identity step.
- `IdentityStep` (inside `KycStepWizard`) is unchanged — `showContactFields={false}` continues to suppress the email/phone inputs there since they now live in `ContactDetailsRow` above.
- `ServicePerson.client_profiles` type extended with `phone: string | null`; the page query (`src/app/(client)/services/[id]/page.tsx`) and the `AddPersonModal` `onAdded` payload were updated to include phone. The legacy `ProfileEditPanel` component was deleted.

**4.5 — Sanity:**
- Admin Review KYC view (`AdminKycDocListPanel` in `admin/services/[id]/ServiceDetailClient.tsx`) is a separate component and was **not** touched. Admin layout unchanged per brief scope.
- `npm run build` clean. No new types, no new `any`s.

---

### 2026-04-30 — B-046 (Batch 3): Review All KYC walk-through (Claude Code)

**3.1 — "Review all KYC" button:**
- `src/components/client/ServiceWizardPeopleStep.tsx`: top toolbar now renders a primary blue **Review all KYC** button on the right when there is at least one person. Hidden otherwise.

**3.2 — Walk-through state + KycStepWizard hook:**
- `src/components/kyc/KycStepWizard.tsx`: new prop `reviewAllContext?: { current: number; total: number; personName?: string | null; onAdvance: () => void }`. When set:
  - Renders a header inside the wizard: `Reviewing person {current+1} of {total} — {Name}` plus a small "X remaining" / "Last person" counter.
  - On the final wizard step, replaces the existing "Save & Close" button with **Save** (chevron) for non-last and **Save & Finish** (chevron) for the last person. On click: saves; on success calls `onAdvance` if not last, otherwise calls `onComplete`.
- `ServiceWizardPeopleStep.tsx`: holds `reviewAllOrder: string[] | null` (one role-row id per unique profile, in card order) + `reviewAllIndex`. Clicking Review-All builds the order, sets index = 0, opens the wizard for `order[0]`. `onAdvance` increments the index, marks the just-completed person locally, and re-points `reviewingRoleId` to the next role row. KycStepWizard now receives `key={reviewingPerson.id}` so its internal state (currentStep, form) re-initialises cleanly on each person.

**3.3 — Single-person Review KYC unchanged:**
- When `reviewAllContext` is `undefined`, the wizard's last-step button keeps the existing `Save & Close` (inlineMode) / `Submit for Review` behaviour.

**3.4 — Edge cases:**
- Exit mid-walk via "Back to People" or the unsaved-changes path (`handleExitKycReview`) clears `reviewAllOrder` + `reviewAllIndex` — re-entering Review-All starts fresh from the first person.
- The wizard auto-saves and remounts on advance, so partially completed KYC for an in-progress person is preserved when the next person loads.
- Walk visits every person regardless of completion state, per spec.

`npm run build` clean.

---

### 2026-04-30 — B-046 (Batch 2): People & KYC Add buttons + tabbed Add modal (Claude Code)

**Important schema note for the brief reader:** the brief described `kyc_records` and `application_persons`. The live dashboard flow (`/services/[id]`) uses the newer data model: `client_profiles` + `profile_service_roles` (no `kyc_records` table). The legacy `kyc_records` model is still used by the admin People view (`PersonsManager.tsx`) and the older `/apply/[templateId]/details` route. Per brief scope ("admin out of scope; gate shared components"), all Batch 2 work was applied to `ServiceWizardPeopleStep.tsx` (the actual client-facing People step), not `PersonsManager.tsx`. Admin layouts unchanged.

**2.1 — Add buttons moved to top toolbar:**
- `src/components/client/ServiceWizardPeopleStep.tsx`: the row of `Add Director / Add Shareholder / Add UBO` buttons now sits **above** the person list. Buttons are grouped left; the right side is reserved for the "Review all KYC" button (added in Batch 3, intentionally hidden in Batch 2). Empty state copy updated to "No people added yet. Use the buttons above to get started."

**2.2 — Tabbed Add modal:**
- Replaced the inline `AddPersonModal` (search + create-new combined) with a proper two-tab modal:
  - **Tab A — Select existing person:** lists every tenant `client_profiles` row with role chips aggregated across all services they appear in (e.g. `Director`, `Shareholder 50%`). Click a row to attach the new role. Profiles already attached as the *same* role on *this* service are disabled and surface the inline message `{Name} is already a {Role} on this application.`
  - **Tab B — Add new person:** minimal form — Type radio (hidden when role is UBO, forces individual), Full name (required), Email (required), Phone (optional).
  - UBO tab A filters out `record_type === 'organisation'` profiles entirely.
- API change — `GET /api/services/[id]/available-profiles`: returns **all** tenant profiles now (not just unlinked), each with a `roles` array `[{service_id, role, shareholding_percentage}]` plus `phone` and `record_type`. The "is this profile already linked here as this role?" check has moved into the modal where it belongs (using `currentPersons`). The dead `ServicePersonsManager.tsx` (no callers) still references the old shape but is unused, so left untouched.
- API change — `POST /api/services/[id]/persons`: accepts an optional `phone` and persists it onto the new `client_profiles` row.

**2.3 — Auto-open Review KYC after add:**
- After a successful add (existing or new), `handleAdded` now also calls `setReviewingRoleId(person.id)` so the wizard immediately drops the user into that person's KYC review — no extra click required.

**2.4 — Notes:**
- Director warning ("At least one director is required") is now suppressed when there are zero people, since the empty-state copy already directs the user to add someone.
- Shareholding % is **not** captured in the new modal; it stays where it is today (the OwnershipStructure component below the list). This matches the brief's Batch 4 directive ("No inline % capture, Shareholder % stays editable wherever it is today").

`npm run build` clean.

---

### 2026-04-30 — B-046 (Batch 1): Dashboard welcome + Save & Close (Claude Code)

**1.1 — Dashboard greeting reworked when info is missing:**
- `src/app/(client)/dashboard/page.tsx`: derives `firstName` from `session.user.name` (split on first space; null if name looks like an email).
- `src/components/client/DashboardClient.tsx`: when `!allComplete`, replaces the plain "Welcome {userName}" heading with an amber info card:
  > **Welcome, {firstName}.** Your application is missing some information — click **Review** below to complete it.
  Falls back to "Welcome back." if no first name. A small bouncing `ArrowDown` icon underneath visually points at the service cards. When all sections are complete the original greeting copy is preserved.
- "Missing info" detection reuses the existing `allComplete` calculation (sum of section completions per service), so logic isn't duplicated.

**1.2 — "Save & Close" button on the unsaved-changes dialog:**
- `src/components/client/ServiceWizard.tsx`: added `saveAndCloseRef?: MutableRefObject<(() => Promise<boolean>) | null>` prop. `handleSaveAndClose` now returns a boolean. A `useEffect` re-publishes the latest closure to the ref every render, with cleanup that clears the ref on unmount.
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx`: dialog now has three buttons (left → right): **Leave without saving · Stay · Save & Close** (primary blue). Save & Close calls `wizardSaveAndCloseRef.current()`; on success it closes both the dialog and the wizard (the wizard's `onClose` already clears `wizardMode`); on failure the dialog stays open so the user can retry. A `savingFromDialog` flag disables all three buttons during save.

`npm run build` clean (lint + types).

---

### 2026-04-22 — B-045: RLS default-deny on every public table (Claude Code)

> ⚠️ **MIGRATION NOT YET APPLIED.** The SQL file exists at
> `supabase/migrations/005-rls-default-deny.sql` but has NOT been run against
> the live database. Until the user applies it, the Supabase advisory
> (`rls_disabled_in_public` / `sensitive_columns_exposed`) remains open and
> the anon key can still read public tables.

**B-045 (RLS default-deny on public tables)** — closes the Supabase security
advisory. The `NEXT_PUBLIC_SUPABASE_ANON_KEY` ships in the browser bundle;
with RLS disabled, anyone on the internet could hit
`https://<ref>.supabase.co/rest/v1/<table>` and read every row. The app uses
`createAdminClient()` (service role) for every server-side query, which
bypasses RLS, so enabling RLS **with no policies** blocks the anon key
without breaking a single app query.

**Created:** `supabase/migrations/005-rls-default-deny.sql`
- Explicit enumerated `ALTER TABLE public.<x> ENABLE ROW LEVEL SECURITY` for
  every public-schema table across `schema.sql` + migrations 002/003/004:
  profiles, clients, client_users, admin_users, service_templates,
  document_requirements, knowledge_base, applications, document_uploads,
  audit_log, client_account_managers, email_log, document_types,
  kyc_records, application_persons, application_details_gbc_ac, documents,
  document_links, process_templates, process_requirements, client_processes,
  process_documents, due_diligence_requirements, due_diligence_settings,
  profile_roles, role_document_requirements, tenants, users,
  client_profiles, client_profile_kyc, services, profile_service_roles,
  profile_requirement_overrides, service_section_overrides,
  documents_history, client_profile_kyc_history.
- Safety-net `DO $$ … $$` block that iterates `pg_tables where schemaname =
  'public'` and enables RLS on any remaining tables — catches things like
  `verification_codes` which is referenced in migration 003 but never
  `CREATE TABLE`-d in this repo (exists in the live DB from an earlier
  bootstrap).
- Final assertion that raises loudly if any public table still has
  `relrowsecurity=false` after the run — migration aborts rather than
  claiming success with a hole.
- **No policies added.** Empty policies on RLS-enabled tables means anon +
  authenticated roles can read nothing. That is the whole point. The two
  history tables from migration 004 already have admin-read policies; those
  stay as-is.
- Idempotent — re-running the migration after apply is a no-op.

**Apply step (manual — user runs once):**
1. Open Supabase SQL editor.
2. Paste the contents of `supabase/migrations/005-rls-default-deny.sql`.
3. Run. The transaction either commits cleanly or aborts with the list of
   tables still missing RLS (only happens if a new table was added between
   writing this migration and applying it).

**Apply endpoint (Option B in the brief) — intentionally not implemented.**
The migration uses multi-statement PL/pgSQL `DO` blocks and an enforced
`COMMIT`. `supabase-js` has no generic `exec_sql` RPC and can only run
table-level ops, so routing through an admin endpoint would require
installing a helper function first — strictly more moving parts than
pasting the SQL once. Documenting the choice so the next session doesn't
wonder why it isn't there.

**Smoke-test plan (run AFTER applying the migration):**
1. Client: load `/dashboard` → application list renders.
2. Admin: load `/admin/dashboard` → stats + recent activity render.
3. Register a fresh test user → succeeds (the `auth.users → profiles` trigger
   runs as the DB owner and bypasses RLS).
4. Upload a document on an in-progress application → still works.

If any of these fail, the most likely cause is a DB trigger / function that
was silently relying on anon access. Fix by setting `SECURITY DEFINER` on
the function so it runs as the owner, not the caller. Record the adjustment
inside the migration file if needed.

**Advisory verification (run AFTER applying):** from the terminal, with the
anon key from `.env.local`:

```bash
SUPABASE_URL="https://ylrjcqaelzgjopqqfnmt.supabase.co"
ANON_KEY="<contents of NEXT_PUBLIC_SUPABASE_ANON_KEY>"

for t in profiles client_profiles kyc_records documents; do
  echo "=== $t ==="
  curl -s "$SUPABASE_URL/rest/v1/$t?select=*&limit=1" \
    -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" | head -c 400
  echo
done
```

Expected response for each table: an empty array `[]` OR a
`{"code":"42501","message":"permission denied for table <t>"}`-style
response. **NOT** rows of data. Paste the actual curl responses into this
entry once available so the fix is auditable. Reload the Supabase advisor
within a minute — the `rls_disabled_in_public` and
`sensitive_columns_exposed` findings should clear.

**Build:** `npm run build` passes lint + types (migration is pure SQL; no TS
changes).

**Tech-debt tracker (this file):** item #3 amended — severity dropped from
High → Medium with a note that the exploitable path is closed and that
per-tenant policies remain open work for the broader move-off-service-role
project.

**Brief:** `docs/cli-brief-rls-default-deny-b045.md`

---

### 2026-04-20 — B-044: Per-field AI prefill icon + proof-of-address reseed (Claude Code)

**B-044 (Per-field prefill icon + proof-of-address fix)** — bug-fix + new UX affordance.

**Item 1 — "Fill from uploaded document" not appearing after POA upload.**

Diagnosis from a static read of the code (no Supabase console available from this session):

- `src/app/api/admin/migrations/seed-ai-defaults/route.ts` and the in-repo seed both set `ai_extraction_enabled=true` and the first extraction field to `{key:"address_on_document", prefill_field:"address"}` — correct.
- `src/lib/kyc/computePrefillable.ts` tolerates the POA doc exactly like the passport doc (same mapping path — look up doc type config by `document_type_id`, intersect extracted_fields with `ai_extraction_fields`, require `prefill_field ∈ KYC_PREFILLABLE_FIELDS`, drop empty + already-filled targets).
- `src/components/client/ServiceWizardPeopleStep.tsx` passes `documents.filter(d => d.client_profile_id === profileId)` as `personDocs` — same filter for both docs, so the passport working while POA does not rules out a profile-id mismatch at the client.

**Most likely cause** (verifiable with the Supabase SQL snippets in the brief): an admin saved an edit on `/admin/settings/rules` that cleared the `prefill_field` dropdown on POA's `address_on_document` extraction field. Confirmed against the rules editor — the dropdown includes a `— none —` option, and selecting it would persist `prefill_field: null` (and the rules-page form only re-emits `ai_extraction_fields` when AI is enabled; if the admin toggled AI off and back on mid-edit, it would also wipe the list).

**Remedy:** new idempotent admin endpoint **`POST /api/admin/migrations/reseed-proof-of-address-extraction`** (`src/app/api/admin/migrations/reseed-proof-of-address-extraction/route.ts`). Restores POA's canonical seed config (`ai_enabled=true`, `ai_extraction_enabled=true`, `ai_extraction_fields` set to the exact seed from `seed-ai-defaults`), returns `{ before, after }` so the admin can see what changed. Admin-only. Safe to re-run.

**How to confirm at runtime:** either run the Supabase SQL from the brief's "Check A / Check B" and look at the columns on that row, or invoke the reseed endpoint and re-check. If after the reseed the top button still does not appear, item 1 of this batch will not be the fix and the cause is elsewhere (AI-prompt key mismatch, client_profile_id mismatch on the upload row, verification_status=pending) — those branches are listed in the brief's likely-outcomes table. Logged here so the next session can pick up without re-deriving.

**Item 2 — Per-field ✨ prefill icon.**

New pattern — a small ✨ Sparkles button appears inline next to a KYC form field label whenever the AI has extracted a matching value for that target, regardless of whether the form field is currently empty. Hover shows the extracted value + source doc; click replaces the current value.

**Created:**
- `src/components/kyc/FieldPrefillIcon.tsx` — reusable inline button that calls the provided `onFill` callback. Wrapped in the shadcn `Tooltip` shim (`@/components/ui/tooltip`, added in B-043). Tooltip content:
  - Line 1: `Extracted: "<value>"` (truncated at 60 chars)
  - Line 2: `From: <doc type> — click to use`
  Uses `aria-label="Fill <field> from uploaded document"`, keyboard-focusable, swaps to a spinner while the save is in flight.

**Updated:** `src/lib/kyc/computePrefillable.ts`
- Added `computeAvailableExtracts({ docs, docTypes })` — same stable-sort + per-target dedup as the existing helper, but without the "form field must be empty" filter. Exported alongside `computePrefillableFields` (which stays as the source of truth for the top bulk-fill button + step-nav indicator).

**Updated:** `src/components/kyc/IndividualKycForm.tsx`
- Computes `availableByTarget: Map<string, PrefillableField>` once at the top. New `handleFieldPrefill` POSTs a single-field payload to `/api/profiles/kyc/save` and merges the value into local `setFields` on success. Toast: `Filled <label> from <doc type>.` on success, `Couldn't fill from document — please try again.` on error.
- Icons rendered inline on the Full legal name / Date of birth / Nationality / Passport country / Passport number / Passport expiry / Residential address / Occupation / TIN labels (every `FieldRow` whose target is in `KYC_PREFILLABLE_FIELDS` and has an available extract).

**Updated:** `src/components/kyc/steps/IdentityStep.tsx`
- Internal `Field` helper now accepts optional `prefillFrom` + `onPrefillField`. If both are set it renders `FieldPrefillIcon` inside the `ValidatedLabel`.
- New `handleFieldPrefill` mirrors the IndividualKycForm version but uses the wizard's `onChange` (controlled-form pattern) instead of local state.
- Icons wired on Full legal name, Date of birth, Nationality, Passport country, Passport number, Passport expiry, and Residential address.

**Ambiguity resolved in-flight:** the brief's Item 1 "Check C" debug instructions point at `IndividualKycForm.tsx`, but the user flow that triggered the bug (Service wizard → People step → Review KYC) renders `KycStepWizard → IdentityStep`, not `IndividualKycForm`. Both surfaces got the per-field icon.

**Deferred / not in scope (flagged as tech debt):**
- `FinancialStep` and `DeclarationsStep` don't yet receive `personDocs/personDocTypes` from `KycStepWizard`, so icons on Occupation (wizard flow — there is none in IdentityStep), TIN, and `jurisdiction_tax_residence` are only visible in `IndividualKycForm` (the standalone `/kyc` + admin KYC pages). Threading the two props into those steps is a small future batch.

**Build:** `npm run build` passes lint + types.

**Brief:** `docs/cli-brief-per-field-prefill-icon-b044.md`

**Dev-server reset:** `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev`

---

### 2026-04-20 — B-043: Client wizard polish, 6 items (Claude Code)

**B-043 (Client wizard polish)** — six related UX/security fixes shipped together.

**Item 1 — CSP allows Supabase iframe previews.**
- `next.config.js` — `frame-src 'self' blob:` → `frame-src 'self' blob: https://*.supabase.co`. Same wildcard shape as the existing `connect-src` entry. Fixes the "upload looks blank" bug where `DocumentDetailDialog`, `DocumentPreviewDialog`, and `DocumentViewer` were embedding signed Supabase URLs inside `<iframe>` and hitting a `Framing '…supabase.co' violates Content Security Policy` block. Dev server must restart for the CSP header to reload.

**Item 2 — Country picker placeholder readable.**
- `src/components/shared/MultiSelectCountry.tsx` — search input `placeholder:text-gray-500` → `placeholder:text-gray-700`. Keeps distinction from typed value (`text-gray-900`) but no longer looks disabled.

**Item 3 — Sticky wizard footer cleared above the macOS Dock.**
- `src/components/client/ServiceWizardNav.tsx` — `fixed bottom-0` → `fixed bottom-6`, plus `border-x rounded-t-lg` so the floating footer reads as intentional. Kept the existing `left-[260px]` offset so it aligns to the main content column (covers Item 4 verification).
- `src/components/kyc/KycStepWizard.tsx` (`fixedNav` branch) — same fix, and replaced `left-0 right-0` with `left-[260px] right-0` so the Back button aligns to the main column instead of the viewport edge.
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — the admin "You have unsaved changes" bar uses the same sticky-bottom pattern; got the same `bottom-6 + border-x + rounded-t-lg` update.
- Spacers bumped to match: `ServiceWizard.tsx` body padding `pb-20` → `pb-28`; `KycStepWizard.tsx` `fixedNav` spacer `h-20` → `h-28`.

**Item 5 — Submit blockers surfaced.**
- `src/components/client/ServiceWizard.tsx` — computes `submitBlockers: string[]` alongside `canSubmit`. Reuses the step indicator labels ("Company Setup", "Financial", "Banking"). People step has two sub-reasons: no director, or at least one profile missing KYC. Passed into `ServiceWizardNav` and into `ServiceWizardDocumentsStep` (the final step).
- New `src/components/ui/tooltip.tsx` — thin wrapper over `@base-ui/react/tooltip` (no Radix dependency). Provides `Tooltip`, `TooltipTrigger`, `TooltipContent`, `TooltipProvider` with shadcn-style styling.
- `src/components/client/ServiceWizardNav.tsx` — when on the final step with Submit disabled and blockers present, the Submit button is wrapped in a `Tooltip` whose content lists `• blocker 1 • blocker 2 …`. Trigger is a `<span tabIndex=0>` so hover works even though the actual button is disabled.
- `src/components/client/ServiceWizardDocumentsStep.tsx` — renders an amber "Before you can submit" card at the top of the Documents (final) step body showing the same blocker list. New `submitBlockers` prop.

**Item 6 — Save-before-back on KYC exit.**
- `src/components/kyc/KycStepWizard.tsx` — `saveCurrentStep` converted to `useCallback`; new `onRegisterFlush?: (flush) => void` prop. A `useEffect` registers the latest `saveCurrentStep` with the parent on every form change, and clears it on unmount.
- `src/components/client/ServiceWizardPeopleStep.tsx` — holds a `kycFlushRef`. New `handleExitKycReview()` awaits the flush before calling `setReviewingRoleId(null)`. On failure it toasts `Couldn't save your changes — please try again.` and keeps the panel open. The "Back to People" link shows a `Saving…` spinner while the flush is in flight. No `AlertDialog` needed since the save always runs; users never lose edits and never have to answer a dialog. The `onRegisterFlush` prop is wired onto the `<KycStepWizard>` mount.

**Item 4** — verified on the ServiceWizard side-by-side during Item 3. KYC wizard inner step-nav also re-aligned to `left-[260px]` so the wizard's Back sits under the same column as ServiceWizard's footer.

**Build:** `npm run build` passes lint + type check.

**Brief:** `docs/cli-brief-wizard-polish-b043.md`

**Dev-server reset (required — CSP header change):** `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev`

---

### 2026-04-20 — B-042: On-demand AI prefill in KYC Identity step (Claude Code)

**B-042 (On-demand AI prefill)** — moves the prefill decision out of the doc upload moment and into the Identity step where the fields live. Replaces the forced `AiPrefillBanner` (Apply/Skip + conflict-mode select) with a single, opt-in "✨ Fill from uploaded document" button plus a subtle ✨ indicator on the Identity step nav.

**Created:**
- `src/lib/kyc/computePrefillable.ts` — pure helper used by both surfaces. For each uploaded doc it reads `verification_result.extracted_fields`, intersects with the doc type's `ai_extraction_fields`, keeps only targets whitelisted in `KYC_PREFILLABLE_FIELDS`, drops empty values, drops targets whose form field is already non-empty, and returns a de-duplicated list (earliest upload wins on tie).

**Modified:**
- `src/components/kyc/steps/IdentityStep.tsx` — new props `personDocs`, `personDocTypes`, `kycRecordId`. Renders the full-width dashed Sparkles button above the field grid when `computePrefillableFields(...)` is non-empty. Click flow: compute payload → POST `/api/profiles/kyc/save` → on 2xx call `onChange` with the patch and toast `Filled N field(s)…`; on error toast the failure and leave form state untouched.
- `src/components/kyc/KycStepWizard.tsx` — new props `personDocs` + `personDocTypes`. Renders a Lucide `Sparkles` icon (`text-blue-500`, absolute-positioned top-right of the Identity step bar) via `StepIndicator` when the helper has at least one row. Icon has a `title` for the tooltip. Also passes `personDocs/personDocTypes/kycRecordId` down to `IdentityStep`. Org flow is untouched.
- `src/components/kyc/IndividualKycForm.tsx` — same button rendered at the top of the form body (used on the `/kyc` and admin client KYC pages). Accepts optional `personDocs`/`personDocTypes`, falls back to its existing `documents`/`documentTypes` when omitted. On success it merges the patch into the internal form state (same `setFields` that `useAutoSave` watches).
- `src/components/client/ServiceWizardPeopleStep.tsx` — removed the old `<AiPrefillBanner />` block and its import. Removed the now-unused `kycRecordId`/`profileValues` props from `KycDocListPanel` (they only existed to feed the banner). Passes `personDocs` + `personDocTypes` to `<KycStepWizard>` for the reviewed person.

**Deleted:**
- `src/components/shared/AiPrefillBanner.tsx`
- `src/app/api/documents/[id]/dismiss-prefill/route.ts`

**Kept untouched (intentional):**
- `documents.prefill_dismissed_at` column — stops being read/written from the front end but no migration.
- `src/lib/constants/prefillFields.ts` — `KYC_PREFILLABLE_FIELDS` is reused by the helper.
- `/api/profiles/kyc/save` — unchanged, reused by both surfaces.
- `OrganisationKycForm` — out of scope per spec.

**Ambiguity noted in-flight:** the brief names `IndividualKycForm` as the step-wizard's Identity target, but in this repo `KycStepWizard` renders `IdentityStep`, not `IndividualKycForm`. Both components are client-facing and can host the button, so the button was added to **both** — `IdentityStep` for the wizard flow (People step → review person → KYC wizard) and `IndividualKycForm` for the standalone `/kyc` + admin KYC pages. The helper is the same in both places.

**Build:** `npm run build` passes lint + types. Grep confirms no remaining `AiPrefillBanner` or `dismiss-prefill` references in `src/`.

**Brief:** `docs/cli-brief-ai-prefill-on-demand-b042.md`
**Design spec:** `docs/superpowers/specs/2026-04-20-ai-prefill-on-demand-design.md`

**Dev-server reset:** `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev`

---

### 2026-04-20 — B-041: Sanitize upload filenames for Supabase Storage (Claude Desktop)

**B-041 (Invalid storage key fix)**

Supabase Storage rejects object keys that contain spaces, colons, and several other special characters (seen as `Invalid key: ...Screenshot 2026-04-20 at 12.23.38 AM.jpg`). Screenshots and many phone-camera filenames include spaces + colons by default.

**Fix:** all four upload routes now sanitize the incoming filename before building the storage path. Preserves extension, replaces non-word chars with underscores, collapses repeats, trims edges, caps length at 120 chars. Storage key becomes e.g. `services/{id}/{typeId}/{ts}-Screenshot_2026-04-20_at_12.23.38_AM.jpg`.

- `src/app/api/services/[id]/documents/upload/route.ts`
- `src/app/api/admin/services/[id]/documents/upload/route.ts`
- `src/app/api/documents/upload/route.ts`
- `src/app/api/documents/library/route.ts`

DB column `file_name` still stores the original filename (display value); only the storage key is sanitized.

### 2026-04-20 — B-040: Replace-document save propagation + AI polling (Claude Desktop)

**B-040 (replace flow UI refresh)**

Server-side the replace path already persisted the new file correctly. Two client-side issues made it feel like the save didn't happen:

**Fix 1 — `KycDocListPanel` ignored prop updates after mount**
- `src/components/client/ServiceWizardPeopleStep.tsx`: `localDocs` was initialized once from `initialDocs` and never synced. Added a `useEffect` to re-seed `localDocs` when the parent updates the `documents` prop.

**Fix 2 — No AI polling after a replace**
- `onDocumentReplaced` handler in the same file now calls `pollForVerification(newDocId, dtId)` if the replaced doc's status came back as `'pending'`. Previously only the first-time upload path kicked off polling, so a replaced doc stayed in "AI checking..." state until a manual page refresh.

**Verify:**
- Open a doc, click Replace Document → select a file
- Dialog closes; doc row shows new file name immediately
- "AI checking..." spinner appears for up to ~45s, then flips to Verified / Flagged / Manual review based on AI outcome

### 2026-04-20 — B-039: Always-visible navigation bar on KYC review (Claude Desktop)

**B-039 (fixed-bottom nav on KYC review)**

**Updated:** `src/components/kyc/KycStepWizard.tsx`
- Added `fixedNav?: boolean` prop (default `false`). When `true`:
  - Nav bar renders with `position: fixed, bottom-0, left-0, right-0, z-40` — always visible regardless of scroll position
  - Subtle shadow above the bar for separation from content
  - A 80px spacer is added above the nav so fixed positioning never covers the final form fields
- Prior `sticky bottom-0 -mx-8 -mb-8` path remained for other mount sites that expect it (standalone `/kyc`, external fill)

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Review-view `KycStepWizard` mount now passes `fixedNav` — Back / Save & Continue always visible while reviewing a person's KYC

**Rationale:** `sticky bottom-0` only works when inside a scroll container whose last child is the sticky element. The review view's parent is a plain `<div className="space-y-4">` (no overflow context), so sticky didn't pin reliably. Fixed positioning avoids the container dependency entirely.

### 2026-04-20 — B-038: Compact KYC document panel header (Claude Desktop)

**B-038 (vertical space reduction on KYC review screen)**

**Updated:** `src/components/shared/DocumentStatusLegend.tsx`
- Rewritten as a single-line horizontal legend, always visible (no collapse)
- Shortened labels: "AI verified" → "Verified", "AI flagged" → "Flagged", etc.
- Two tracks separated by a subtle middle dot instead of a horizontal rule
- Text dropped to 10px, icons 3px, gap-x-2 — fits on one row even in narrow columns

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- `KycDocListPanel`: header row now holds KYC Documents title + "X of Y uploaded" count + legend on a single line (`flex justify-between`)
- Removed the standalone "Please upload your documents here" caption line
- Removed the standalone "KYC Documents" header that was above the panel in the split layout (redundant with the in-panel header)
- Removed the footer "X of Y uploaded" line (now inline in the header)
- Scroll area `maxHeight: 280 → 240`

**Vertical space saved:** ~90px on initial render of the KYC review panel (eliminated 2 heading rows + 1 footer line + compacted legend from 3 rows → 1 row).

### 2026-04-19 — B-037 Fix 3: Required-field errors visible on load (Claude Code)

**B-037 Fix 3 — landing on a wizard now immediately shows what's mandatory**

Today required fields only turn red after touch (focus + blur). The user wants the empty-required state visible from first paint so the form's expectations are obvious without interaction.

**Updated:** `src/hooks/useFieldValidation.ts`
- New optional argument: `useFieldValidation({ showErrorsImmediately?: boolean })`. When `true`, `getFieldState()` returns `"error"` for every empty required field on first render — no `touched` membership required. Default remains `false` so admin-side forms keep current behaviour.

**Updated step components** to forward the prop into the hook (default `false` to preserve any not-yet-flipped admin call sites):
- `src/components/kyc/steps/IdentityStep.tsx`
- `src/components/kyc/steps/FinancialStep.tsx`
- `src/components/kyc/steps/DeclarationsStep.tsx`

**Updated wizard:** `src/components/kyc/KycStepWizard.tsx`
- New prop `showErrorsImmediately?: boolean` threaded into `IdentityStep`, `FinancialStep`, and `DeclarationsStep`. Default `false`.

**Flipped at every client-facing mount site:**
- `src/app/(client)/kyc/KycPageClient.tsx`
- `src/components/client/ServicePersonsManager.tsx`
- `src/components/client/PersonsManager.tsx`
- `src/components/client/ServiceWizardPeopleStep.tsx`

Each now passes `showErrorsImmediately` (truthy shorthand). Admin pages continue to use the default-off behaviour.

**Build:** `npm run build` passes lint + types.

---

### 2026-04-19 — B-037 Fix 2: Country dropdown palette tightened (Claude Code)

**B-037 Fix 2 — `text-gray-400` removed from interactive country selectors**

Per the palette rule from B-034, `text-gray-400` is reserved for genuinely disabled / informational UI. The country pickers were using it on active controls, making them look disabled.

**Updated:** `src/components/shared/CountrySelect.tsx`
- "Use dropdown instead" reset button: `text-gray-400 hover:text-gray-600` → `text-gray-600 hover:text-gray-800`.
- Search input magnifier icon: `text-gray-400` → `text-gray-600`.

**Updated:** `src/components/shared/MultiSelectCountry.tsx`
- Selected-country chip "×" remove button: `text-brand-navy/50 hover:text-brand-navy` → `text-gray-600 hover:text-red-600` (matches the palette rule for chip removal).
- Trigger chevron button: `text-gray-400 hover:text-gray-600` → `text-gray-600 hover:text-gray-800`.
- Empty-state "No matching countries": `text-gray-400` → `text-gray-500`.
- Disabled-state em-dash placeholder kept as `text-gray-400` (legitimate disabled use).

**Build:** `npm run build` passes lint + types.

---

### 2026-04-19 — B-037 Fix 1: Client-side image compression before upload (Claude Code)

**B-037 Fix 1 — phone photos no longer hit Vercel's 4.5 MB body limit**

Companion to B-036 (which only blocked the upload + showed a clear error). This fix transparently shrinks images before they ever leave the browser, so a typical 6–10 MB phone photo of a passport/utility bill lands as ~1–2 MB JPEG.

**Added:** `browser-image-compression@^2.0.2` (npm install).

**Created:** `src/lib/imageCompression.ts`
- `compressIfImage(file)` — image inputs >500 KB are compressed to a 2 MB target with a 2400 px max edge, JPEG output, web worker on. PDFs and other non-image types pass through untouched. Any failure (worker error, OOM, unsupported format) returns the original file (fail open).
- File extension is rewritten to `.jpg` on PNG/WebP/TIFF/GIF/HEIC inputs so the FormData filename matches the new content type.
- If compression somehow inflates the file, the original is returned.

**Updated upload sites** — all three call sites that POST to `/api/services/[id]/documents/upload`:
- `src/components/client/ServiceWizardPeopleStep.tsx` `handleUpload`
- `src/components/shared/DocumentDetailDialog.tsx` `handleReplace`
- `src/components/client/ServiceWizardDocumentsStep.tsx` `handleFile`

Each now: shows a `toast.loading("Optimising image…")` while compressing → calls `compressIfImage(file)` → checks the post-compression size against the existing 4.5 MB Vercel guard (now also added to the documents-step site, which previously had none) → uploads. The "File is too large" guard is preserved as a safety net for edge cases (e.g. a 15 MB image that still can't get under 4.5 MB).

**Build:** `npm run build` passes lint + types.

**Brief:** `docs/cli-brief-upload-compression-and-required-fields-b037.md`

---

### 2026-04-19 — B-036: Graceful upload error handling + 4.5 MB client-side guard (Claude Desktop)

**B-036 (Upload error handling)**

Vercel serverless functions on Hobby tier reject request bodies over 4.5 MB with a plain-text 413 HTML page. Client code was calling `res.json()` on this and throwing `Unexpected token 'R', "Request En"...`. Fixed by:

**Updated:** `src/components/shared/DocumentDetailDialog.tsx` — `handleReplace`
- Client-side size check at 4.5 MB with a clear toast before the request fires
- Read response as text + try-parse-JSON so non-JSON 413/500 bodies don't throw
- Special 413 handling returns "File is too large. Please upload under 4.5 MB."

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx` — `handleUpload`
- Same pattern: client-side 4.5 MB check + resilient response parsing

Server-side `MAX_FILE_SIZE` (10 MB) on the upload route is now superseded by Vercel's 4.5 MB cap. To raise this, we'd either upgrade to Vercel Pro (100 MB bodies) or implement direct-to-Supabase uploads via signed URL. Not done in this batch.

### 2026-04-19 — B-035: Green reserved for admin-approved; legend default open; tighter doc list (Claude Desktop)

**B-035 (Doc list display tweaks)**

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Left-side doc icon:
  - Not uploaded → `FileText` amber (unchanged)
  - Uploaded but not admin-approved → `FileText` gray-500 (was green CheckCircle2)
  - Admin approved → `CheckCircle2` green (unchanged)
- Name text color: amber when missing, gray-700 when uploaded-not-approved, green-700 when approved
- `DocumentStatusLegend` now `defaultOpen={true}`
- Doc list: `maxHeight 360` → `280`, per-row `py-1` → `py-0.5`, category header `py-1.5` → `py-1`, category body `space-y-0.5` → `space-y-0`

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — `AdminKycDocListPanel`
- Same treatment: `CheckSquare` stays green only when `admin_status === "approved"`; uploaded-unreviewed becomes neutral gray-500

**Rationale:** green is the universal "good to go" signal. Showing green on upload before anyone has reviewed it misleads clients into thinking the document is accepted. The two-track status badge already conveys AI + admin state; the left-side icon now only turns green when the admin has actually approved.

### 2026-04-19 — B-034: Status icons, legend, preview fallback, color palette (Claude Desktop)

**B-034 (Client KYC display polish)**

**Updated:** `src/components/shared/DocumentStatusBadge.tsx`
- Replaced colored dots with Lucide icons:
  - AI status: ShieldCheck / ShieldAlert / ShieldQuestion / Loader2 / ShieldOff
  - Admin status: UserCheck / UserX / Clock
- Compact mode: icon pair with native `title` tooltip + aria-label
- Expanded mode: icon + label pills

**Created:** `src/components/shared/DocumentStatusLegend.tsx`
- Collapsible legend explaining the 8 status icons
- Default collapsed; toggle with chevron
- Mounted below "Please upload your documents here" in `KycDocListPanel`

**Updated:** `src/components/shared/DocumentDetailDialog.tsx`
- Added `inferMimeFromName()` helper — falls back to filename extension (jpg/jpeg/png/webp/gif/tiff/pdf) when `mime_type` is null on older uploaded rows
- Fixes "Preview not available for this file type" for historical uploads where mime_type wasn't stored

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Mounted `DocumentStatusLegend` after the upload-here caption
- Eye icon and Remove role link: `text-gray-400` → `text-gray-600` (was too light, looked disabled)
- Shareholding % label: gray-400 → gray-600
- Remove hover: red-500 → red-600

**Updated:** `src/components/shared/CountrySelect.tsx`
- Placeholder text: gray-400 → gray-500
- Chevron icon: gray-400 → gray-600

**Rationale:** gray-400 now reserved for truly disabled/informational contexts. Interactive icons and links use gray-600 so users don't mistake them for disabled controls.

### 2026-04-19 — B-033 Complete (Claude Code)

**B-033 (AI Processing, Two-Track Status, Prefill & History) — batches 1–5 shipped**

Batches 1–4 delivered schema + data config + verifier + UI. Batch 5 is final verification, polish, and this summary.

**Batch 5 polish commits:**
- `src/app/api/documents/[id]/route.ts` — GET now also returns `admin_status_note`, `admin_status_at`, `prefill_dismissed_at`. Without this, the KycDocListPanel poll was overwriting `prefill_dismissed_at` with `undefined` after AI completion, which caused the banner to flash back briefly on some uploads.

**Verification outcome (end-to-end audit of the 5 status flows from Batch 4):**
1. Passport upload (AI on + extraction on) → upload route sets `verification_status='pending'` + `admin_status='pending_review'` + schedules AI; completion writes `verified|flagged|manual_review`. Compact badge on KYC panel + full pair badge in detail dialog render correctly. ✅
2. CV upload (AI on, extraction off) → same path; `extracted_fields={}` on completion; prefill banner does NOT render (no applicable fields). ✅
3. PEP upload with AI disabled at doc type level → upload route sets `verification_status='not_run'`, background job is not fired; badge shows "AI skipped · Pending admin review". ✅
4. Prefill banner displays extracted fields when the doc type has `prefill_field` mapped to a whitelisted KYC column. Apply → `/api/profiles/kyc/save` (handles full_name/address on client_profiles, all KYC columns on client_profile_kyc) + `/api/documents/[id]/dismiss-prefill` → banner hides, `prefill_dismissed_at` persists. ✅
5. Admin clicks Re-run AI in DocumentDetailDialog → `/api/admin/documents/[id]/rerun-ai` overwrites `verification_status`, `verification_result`, `verified_at`, and clears `prefill_dismissed_at`. Dialog's local state updates immediately; a page refresh on the client side re-surfaces the banner. ✅

**Build + lint:** `npm run build` clean; `npm run lint` returns "No ESLint warnings or errors".

**Drift guard:** `assert_documents_history_sync()` is invoked at the end of `004-ai-processing-and-history.sql`; the migration aborts if any `documents` column is not mirrored in `documents_history`.

**Apply step reminder (manual):** run `supabase/migrations/004-ai-processing-and-history.sql` in the Supabase SQL editor; then `POST /api/admin/migrations/seed-ai-defaults` (or press the "Seed defaults" button in Admin → Settings → AI Document Rules) to populate per-doc-type config.

**Follow-ups deferred:** history UI (timeline viewer); admin-side prefill (Certificate of Incorporation → clients/applications); per-field Apply in prefill banner; bulk admin approve; history tables for services/clients/client_profiles; per-doc email notifications; schema-drift CI hook.

**Brief:** `docs/cli-brief-ai-processing-and-history-b033.md`

---

### 2026-04-19 — B-033 Batch 4: Status badges + prefill banner + admin approve/reject (Claude Code)

**B-033 Batch 4 — two-track status badges, AI prefill banner, admin re-run AI**

**Created:** `src/components/shared/DocumentStatusBadge.tsx`
- Two-pill badge (AI status + admin status) with a `compact` mode that renders two colored dots + tooltip. Color map per brief: emerald (verified/approved), amber (flagged/manual_review), blue pulse (pending), grey (not_run), orange (pending_review), red (rejected).
- Legacy `admin_status === 'pending'` rows are normalized to `pending_review` for display.

**Created:** `src/components/shared/AiPrefillBanner.tsx`
- Renders a single one-document banner showing each `(field.label → value)` pair where `field.prefill_field` is mapped + whitelisted.
- Banner auto-hides when: no applicable fields, `doc.prefill_dismissed_at` is already set, or it was locally dismissed.
- `keep mine` (default) vs `overwrite all` toggle; Apply → `/api/profiles/kyc/save` then `/api/documents/[id]/dismiss-prefill`; Skip → just dismisses.
- Uses `KYC_PREFILLABLE_FIELDS` for field gating and looks up current values from both the joined KYC row and any provided `profileValues` (client_profiles fields like `full_name`/`address`).

**Created:** `src/app/api/documents/[id]/dismiss-prefill/route.ts`
- POST, auth required. Access gate: admin bypass, then uploader check, then service manager check via `profile_service_roles`, then direct `client_profile_id` match. Sets `prefill_dismissed_at=now()`.

**Updated:** `src/app/api/profiles/kyc/save/route.ts`
- `full_name` and `address` now route to `client_profiles` alongside the existing `email`/`phone` pathway so the prefill banner can write them. `full_name` removed from `EXCLUDED_FIELDS`.

**Updated:** `src/app/(client)/services/[id]/page.tsx`
- `ClientServiceDoc` gains `prefill_dismissed_at: string | null`; the documents `select()` (both branches) now loads that column so the banner can hide itself without a follow-up fetch.

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- `KycDocListPanel` now accepts `kycRecordId` + `profileValues`, displays `DocumentStatusBadge` in compact mode per uploaded row (replacing the emoji combo), and mounts `AiPrefillBanner` directly below each uploaded doc row when a KYC record id is available.
- Review-view mount passes `kycRecord.id` + the current profile/KYC values so the banner's "keep mine" toggle can skip fields that already have a value.
- The post-replace update inside `DocumentDetailDialog.onDocumentReplaced` populates `prefill_dismissed_at: null` so TypeScript stays happy with the new shape.

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- `AdminKycDocListPanel` replaced the emoji status icons with the compact `DocumentStatusBadge` (AI dot + admin dot + hover tooltip).

**Updated:** `src/components/shared/DocumentUploadWidget.tsx`
- Compact `documentDetailMode` state now shows file name + compact `DocumentStatusBadge` + View/Replace (replaces the "Already uploaded" green-check copy).

**Updated:** `src/components/shared/DocumentDetailDialog.tsx`
- Adds a "Status" section at the top of the body rendering `DocumentStatusBadge` (AI + admin pills). Local state `aiStatus`/`aiVerResult` keeps the dialog in sync after a re-run.
- New **Re-run AI** button next to Approve/Reject (and in a lighter row after approve/reject so admins can still re-verify). POSTs `/api/admin/documents/[id]/rerun-ai`, updates local state on success.
- `useEffect` syncs AI status when the `doc` prop changes.

**Build:** `npm run build` passes lint + types.

**Brief:** `docs/cli-brief-ai-processing-and-history-b033.md`

---

### 2026-04-19 — B-033 Batch 3: verifyDocument rework + upload branching + rerun endpoint (Claude Code)

**B-033 Batch 3 — AI verifier + upload branching + `POST /api/admin/documents/[id]/rerun-ai`**

**Updated:** `src/lib/ai/verifyDocument.ts`
- Added `extractionEnabled` + `aiExtractionFields` params to the call shape. Prompt now:
  - describes each extraction field (key/label/type/hint) when extraction is on, or
  - explicitly instructs the model to return `extracted_fields = {}` when off.
- `overall_status` is enforced server-side from `rule_results`: all-pass → verified, any-fail → flagged, unreadable → manual_review. Extraction failures never flag a doc.
- Date-typed extracted fields are normalized to ISO `YYYY-MM-DD`; unparseable dates are dropped and appended to `flags` instead of erroring.
- `match_results` is always returned as `[]` (legacy field kept in the schema).
- New `AiSkippedResult` type in `src/types/index.ts` (reserved for future explicit "skipped" rendering).

**Updated:** `src/app/api/services/[id]/documents/upload/route.ts` and `src/app/api/admin/services/[id]/documents/upload/route.ts`
- Loads `document_types.ai_enabled/ai_extraction_enabled/ai_extraction_fields/verification_rules_text` up front.
- Sets `verification_status = 'not_run'` when AI is disabled and skips the background AI job entirely.
- On re-upload (existing row) resets `admin_status='pending_review'`, clears note/by/at, clears `prefill_dismissed_at`, resets `verification_result` and `verified_at`.
- On new insert explicitly sets `admin_status='pending_review'` (DB default covers it, but belt-and-braces for older schemas).
- Background AI call now passes `plainTextRules`, `extractionEnabled`, `aiExtractionFields` from the doc type config.
- Select-back includes `prefill_dismissed_at` so the client can render the banner without a follow-up fetch.

**Updated:** `src/app/api/documents/library/route.ts`
- Same AI-enabled branching + extraction config forwarding. New documents now insert with `admin_status='pending_review'`, `prefill_dismissed_at=null`.

**Created:** `src/app/api/admin/documents/[id]/rerun-ai/route.ts`
- Admin-only POST. Refuses to run when the doc type has AI disabled. Sets `verification_status='pending'` + clears prior result + clears `prefill_dismissed_at` before running. Downloads the file from storage and re-runs `verifyDocument` with current config. Writes back status, result, verified_at. Logs `document_ai_rerun` to `audit_log`.

**Build:** `npm run build` passes lint + types.

**Brief:** `docs/cli-brief-ai-processing-and-history-b033.md`

---

### 2026-04-19 — B-033 Batch 2: Seed AI defaults + admin rules editor rework (Claude Code)

**B-033 Batch 2 — per-doc-type AI config + new Settings UI**

**Created:** `src/app/api/admin/migrations/seed-ai-defaults/route.ts`
- `POST` — admin-only, idempotent. Seeds `ai_enabled`, `ai_extraction_enabled`, `ai_extraction_fields` for the 12 named doc types from the brief. Sets `verification_rules_text` only when the row currently has `null` (existing rules are preserved).
- For any other active doc type, fills `ai_enabled=true`, `ai_extraction_enabled=false`, `ai_extraction_fields=[]` only where unset.
- Returns `{ seeded[], fallbacks[], summary }` so the admin can see what was found / missing / inserted.

**Updated:** `src/app/api/admin/document-types/[id]/rules/route.ts`
- PATCH payload now `{ ai_enabled, ai_extraction_enabled, ai_extraction_fields, verification_rules_text }`. Backwards-compatible: also accepts the old `verificationRulesText` camelCase key.
- Validates: `ai_extraction_fields` must be an array, each item needs unique non-empty `key` + `label`; `prefill_field` must be either `null`/empty or a value in the `KYC_PREFILLABLE_FIELDS` whitelist.

**Updated:** `src/app/(admin)/admin/settings/rules/page.tsx`
- Renamed page heading to "AI Document Rules" + descriptive lead.
- Each card now shows: `Enable AI` toggle, `Extract fields` toggle (greyed when AI is off), an editable extraction-fields table (Key / Label / Type / Prefill to / AI hint / delete) with `Add field`, the verification-rules textarea, and a single `Save` button.
- "Seed defaults" button in the page header POSTs to the new migration endpoint and reloads the doc-types list.
- Prefill-target dropdown is populated from `KYC_PREFILLABLE_FIELDS` plus a `— none —` option.
- Save serializes only the relevant fields and clears `ai_extraction_fields` to `[]` when AI is disabled.

**Build:** `npm run build` passes lint + types.

**Brief:** `docs/cli-brief-ai-processing-and-history-b033.md`

---

### 2026-04-19 — B-033 Batch 1: Schema migration (Claude Code)

**B-033 Batch 1 — AI processing columns + admin status normalization + history tables**

**Created:** `supabase/migrations/004-ai-processing-and-history.sql`
- `document_types`: new `ai_enabled bool default true`, `ai_extraction_enabled bool default false`, `ai_extraction_fields jsonb default '[]'`.
- `documents.verification_status` check constraint extended to allow `'not_run'`.
- `documents.admin_status` default set to `'pending_review'`; legacy nulls + `'pending'` rows backfilled to `'pending_review'`; column made `NOT NULL`; check constraint now `('pending_review','approved','rejected')`.
- `documents.prefill_dismissed_at timestamptz` (nullable).
- New table **`documents_history`** mirroring all current `documents` columns plus `history_id, document_id, operation, changed_at, changed_by, changed_by_role`. Index on `(document_id, changed_at desc)`.
- New table **`client_profile_kyc_history`** storing the full row as JSONB (40+ columns; trade-off documented inline). Index on `(client_profile_kyc_id, changed_at desc)`.
- Helper `public.get_history_actor_role(uid)` infers `admin | client | system` from `admin_users` membership.
- Triggers `documents_history_trg` and `client_profile_kyc_history_trg` (`AFTER INSERT|UPDATE|DELETE FOR EACH ROW`) snapshot rows on every change. Triggers swallow missing `auth.uid()` so service-role writes still log (`actor_role='system'`).
- RLS: both history tables read-only to admins; no insert/update/delete policy → only triggers can write.
- `assert_documents_history_sync()` compares column lists between `documents` and `documents_history` and is invoked at the end of the migration so any future drift fails it loudly.

**Created:** `src/lib/constants/prefillFields.ts`
- `KYC_PREFILLABLE_FIELDS` whitelist (10 columns) + `KycPrefillableField` type + `isKycPrefillableField` guard.

**Updated:** `src/types/index.ts`
- Added `'not_run'` to `VerificationStatus`; added type aliases `AiVerificationStatus`, `AdminReviewStatus`; added `AiExtractionField` interface.
- `DocumentType` now declares optional `verification_rules_text`, `ai_enabled`, `ai_extraction_enabled`, `ai_extraction_fields`.
- `DocumentRecord.admin_status` widened to `AdminReviewStatus | 'pending' | null` (legacy 'pending' kept for compat). Added optional `prefill_dismissed_at`.

**Updated:** `src/lib/utils/constants.ts`
- `VERIFICATION_STATUS_LABELS` / `_COLORS` extended with `not_run` entries (`AI Skipped` + grey).

**Build:** `npm run build` passes lint + types.

**Apply step (manual):** open Supabase SQL editor and execute `supabase/migrations/004-ai-processing-and-history.sql`. The file ends with `SELECT public.assert_documents_history_sync()` so the migration aborts if the history schema misses any documents column.

**Brief:** `docs/cli-brief-ai-processing-and-history-b033.md`

---

### 2026-04-19 — B-032: Client KYC polish (Claude Desktop)

**B-032 (Client KYC polish)** — three small UI fixes on the client KYC review screen.

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Inline role-add label for shareholder now reads `Shareholder %:` instead of `Shareholder:`

**Updated:** `src/components/kyc/steps/IdentityStep.tsx`
- Removed duplicate `Work / Professional Details` heading + Occupation field (moved to FinancialStep)

**Updated:** `src/components/kyc/steps/FinancialStep.tsx`
- Single `Work / Professional Details` block, rendered above Source of Funds
- Occupation always visible; work address/phone/email gated by CDD+/EDD (unchanged rule)

**Updated:** `src/components/kyc/steps/DeclarationsStep.tsx`
- Removed `Switch` import
- New inline `YesNoRadio` component used for both PEP and Legal Issues declarations
- Three-state handling: `is_pep` / `legal_issues_declared` null = no selection, `true` = Yes, `false` = No
- PEP upload card remains visible regardless of the answer (declaration form is still signed when declaring no exposure)

**Brief:** `docs/cli-brief-kyc-polish-b032.md`

### 2026-04-19 — B-031: Client KYC dedup + AI key dev-script fix (Claude Desktop)

**B-031 (Client KYC dedup + AI key fix)**

Removes duplicated email/phone and duplicated document upload cards that appeared in the KYC step forms when the wizard is rendered inside the service review split layout (top-left `ProfileEditPanel` + top-right `KycDocListPanel` already own those concerns). Other wizard mount points (`/kyc`, `/kyc/fill/[token]`, admin) are unchanged via prop defaults.

**Updated:** `src/components/kyc/steps/IdentityStep.tsx`
- New props: `showContactFields?: boolean` (default `true`), `hideDocumentUploads?: boolean` (default `false`)
- Passport upload card and Proof of Residential Address upload card wrapped in `!hideDocumentUploads`
- Email + phone row wrapped in `showContactFields`

**Updated:** `src/components/kyc/steps/FinancialStep.tsx`
- New prop: `hideDocumentUploads?: boolean` (default `false`)
- All 8 `InlineUpload` renders (SoF declaration, SoF evidence, bank ref, CV, SoW declaration, SoW evidence, professional ref, tax residency cert) wrapped in `!hideDocumentUploads`

**Updated:** `src/components/kyc/steps/DeclarationsStep.tsx`
- New prop: `hideDocumentUploads?: boolean` (default `false`)
- PEP Declaration Form upload card wrapped in `!hideDocumentUploads`

**Updated:** `src/components/kyc/KycStepWizard.tsx`
- New props `showContactFields` and `hideDocumentUploads` on `KycStepWizardProps`, forwarded into Identity/Financial/Declarations steps

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Review-view `KycStepWizard` mount passes `showContactFields={false}` + `hideDocumentUploads={true}`

**Updated:** `package.json`
- `"dev"` script now prefixes with `unset ANTHROPIC_API_KEY &&` so Claude Desktop's empty-string export no longer overrides `.env.local`. Resolves tech debt #16 (silent AI verification failure on local dev).

**Brief:** `docs/cli-brief-kyc-dedup-b031.md`

**Verify after pulling:**
1. `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev`
2. Client KYC review for a person — no duplicate email/phone, no duplicate upload cards
3. Upload a document — AI verification should transition pending → verified/flagged (not stuck on pending and not silently `manual_review`)

### 2026-04-18 — B-027 Batch 5: KYC section doc status checkmarks (Claude Code)

**B-027 (KYC document layout rework) — Batch 5**

**Updated:** `src/components/shared/DocumentUploadWidget.tsx`
- Added `documentDetailMode?: boolean` prop
- When `documentDetailMode={true}` and `existingDocument` is set: renders simplified "☑ Already uploaded" state with file name, Eye/View button, and Replace button; Eye opens `DocumentDetailDialog` (client mode, isAdmin=false)
- When `documentDetailMode={false}` (default): renders existing detailed compact view with `DocumentPreviewDialog` (backward compatible)

**Updated:** `src/components/kyc/steps/IdentityStep.tsx`
- `DocumentUploadWidget` for passport and proof of address: pass `documentDetailMode={!!passportDoc}` / `documentDetailMode={!!addressDoc}`

**Updated:** `src/components/kyc/steps/FinancialStep.tsx`
- `InlineUpload` helper: pass `documentDetailMode={!!existing}` to `DocumentUploadWidget`

**Updated:** `src/components/kyc/steps/DeclarationsStep.tsx`
- `DocumentUploadWidget` for PEP declaration: pass `documentDetailMode={!!pepDoc}`

### 2026-04-18 — B-027 Batch 4: Admin PersonCard split layout (Claude Code)

**B-027 (KYC document layout rework) — Batch 4**

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- Added imports: `useRef`, `CheckSquare`, `Square`, `DocumentDetailDialog`, `DocumentDetailDoc`
- Added `AdminKycDocListPanel` component (before PersonCard):
  - Shows identity/financial/compliance docs for the profile
  - Upload (POST to `/api/services/[id]/documents/upload`) + view (DocumentDetailDialog with isAdmin=true)
  - Compact status icons (AI + admin status), scrollable if >5 docs
  - "X of Y uploaded" count
- `PersonCard` expanded body restructured as 2-column grid:
  - Left: Profile edit (full name, email, phone) + Roles management (unchanged logic)
  - Right: `AdminKycDocListPanel`
  - KYC long-form sections remain below, unchanged
- `PersonCard` accepts new optional `updateRequests?: DocumentUpdateRequest[]` prop
- `PersonCard` call site passes `updateRequests={updateRequests}`

### 2026-04-18 — B-027 Batch 3: Client KYC review split layout (Claude Code)

**B-027 (KYC document layout rework) — Batch 3**

**Updated:** `src/app/(client)/services/[id]/page.tsx`
- `ClientServiceDoc` extended: added `mime_type`, `verification_result`, `admin_status` fields
- Documents query now selects these fields

**Created:** `src/app/api/profiles/[id]/route.ts`
- PATCH endpoint for updating `email` and `phone` on a `client_profiles` row
- Clients: email + phone only; admins: full_name, email, phone, address
- Scoped by tenant_id

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Added `KYC_DOC_CATEGORIES` + `isKycDocCat()` helper
- Added `ProfileEditPanel` component: email + phone editable (dirty-tracked), roles list with Remove
- Added `KycDocListPanel` component: shows identity/financial/compliance docs for the person, upload + view (DocumentDetailDialog) per doc row, compact status icons, scrollable if >5 docs
- KYC review view now shows 2-column top section (Profile+Roles left, KYC Docs right) above KycStepWizard
- `mapToDocumentRecord` updated to map `mime_type`, `verification_result`, `admin_status` from `ClientServiceDoc`
- Added imports: `useRef`, `Upload`, `Eye`, `CheckSquare`, `Square`, `DocumentDetailDialog`

### 2026-04-18 — B-027 Batch 2: DocumentDetailDialog shared component (Claude Code)

**B-027 (KYC document layout rework) — Batch 2**

**Created:** `src/components/shared/DocumentDetailDialog.tsx`
- Shared dialog for document review used in both admin and client contexts
- Props: `doc: DocumentDetailDoc`, `isAdmin`, `open`, `onOpenChange`, `recipients`, `updateRequests`, `serviceId`, `onStatusChange`, `onRequestSent`, `onDocumentReplaced`
- Inline preview: fetches signed URL, renders image/iframe/download based on mime_type
- AI verification section: confidence %, rules passed, flags (amber), failed rules (red)
- Extracted fields collapsible section
- Admin only: approve/reject (calls `/api/admin/documents/library/{id}/review`), rejection note inline
- Admin only: "Send Update Request" opens `DocumentUpdateRequestDialog` sub-dialog
- Shows most recent update request preview below request button
- Footer: Replace Document (upload, admin+client), Download, Close
- `DocumentDetailDoc` interface allows use with both `ServiceDoc` and extended `ClientServiceDoc`

### 2026-04-18 — B-027 Batch 1: Category filter fixes + role dropdown fix (Claude Code)

**B-027 (KYC document layout rework) — Batch 1**

**Updated:** `src/types/index.ts`
- Removed `'kyc'` from `DocumentType.category` union — there is no `kyc` category in the DB
- Valid categories: `identity | corporate | financial | compliance | additional`

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- Added module-level `KYC_DOC_CATEGORIES` and `isKycDoc()` helper
- Fixed `kycDocTypes` filter (line ~580): `category === "kyc"` → `isKycDoc(dt.category)`
- Fixed `profileDocs` / `corporateDocs` split (lines ~1877): use `isKycDoc()`
- Fixed role dropdown: `value` now uses `effectiveAddRoleValue` to avoid showing an unselected option when first available role differs from "director"

**Updated:** `src/components/client/ServiceWizardDocumentsStep.tsx`
- Added `isServiceDoc` helper: `cat === "corporate" || cat === "additional"`
- Fixed `requiredDocTypes` filter: was `corporate || compliance || ""` → now `corporate || additional`
- Fixed `documents` state initializer: was excluding `kyc | identity` → now includes only `corporate | additional`
- Fixed `extraUploaded`: simplified — no longer needs to re-check categories since state only contains service docs

### 2026-04-17 — B-026 Batch 3: Role management per PersonCard + Corporation KYC (Claude Code)

**B-026 (Client view parity) — Batch 3**

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- `PersonCard` completely rewritten with per-role management:
  - Removed single "X" remove button from header
  - Added "Roles" section at bottom of each card showing all roles with Remove buttons
  - Confirmation dialog for last-role removal (removes person from service)
  - "Add role" dropdown for unassigned roles
  - If adding Shareholder: % input shown inline
  - Add role calls `POST /api/services/[id]/persons` with `client_profile_id` + role
- `PersonCard` now accepts `allRoleRows: ServicePerson[]`, `onRoleRemoved`, `onRoleAdded` (removed `onRemove`, `combinedRoles`)
- Roster view: grouping updated to produce `roleRows` per profile (all ServicePerson entries)
- `handleRemove` replaced by `handleRoleRemoved` + `handleRoleAdded` callbacks
- `profileType` prop passed to `KycStepWizard` based on `record_type`
- `ROLE_LIST` added as module-level constant

**Updated:** `src/components/kyc/KycStepWizard.tsx`
- Added `profileType?: "individual" | "organisation"` prop
- Organisation path: 3 steps — Company Details, Tax / Financial, Review & Submit
- `CompanyDetailsStep`: company name, registration number, jurisdiction, incorporation date, activity, sector, listed/unlisted
- `CorporateTaxStep`: tax residency, tax ID, regulatory licences
- `OrgReviewStep`: tabular summary of all org fields
- Individual path: unchanged (Identity → Financial → Declarations/Review)
- Added `Input`, `Label`, `Textarea` imports for org step forms

### 2026-04-17 — B-026 Batch 2: Add Profile Dialog + Ownership Structure visual (Claude Code)

**B-026 (Client view parity) — Batch 2**

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- `AddPersonModal` completely rewritten with enhanced dialog:
  - Search box (filters both linked and available profiles)
  - Linked profiles shown at top as disabled with role badges (from `currentPersons` prop)
  - Available profiles (from API) selectable with click-toggle
  - "Or create new" section: Individual / Corporation radio, name field, email field
  - Email and record_type sent in POST body for new profiles
- `OwnershipStructure` component added:
  - Collapsible section header showing total %
  - Editable % inputs per shareholder with progress bars
  - Unallocated row when total < 100%
  - Save button PATCHes all shareholding percentages
  - Warning badge when total ≠ 100%
  - Updates `persons` state via `onSaved` callback
- Shareholding text alert replaced with `OwnershipStructure` visual
- Unused `totalShares` / `shareholdingWarning` variables removed

**Updated:** `src/app/api/services/[id]/persons/route.ts`
- POST now accepts `email` and `record_type` in request body
- Creates profile with correct `record_type` (previously hardcoded `"individual"`)
- Stores `email` on new profile

### 2026-04-17 — B-026 Batch 1: KYC doc plumbing + Documents step = corporate only (Claude Code)

**B-026 (Client view parity) — Batch 1**

**Updated:** `src/types/index.ts`
- `DueDiligenceRequirement.document_types` now includes `category?: string | null`

**Updated:** `src/app/(client)/services/[id]/page.tsx`
- `ClientServiceDoc` type: added `document_type_id: string | null`, `client_profile_id: string | null`
- `ServicePerson.client_profiles` type: added `record_type: string | null`
- Persons query: now selects `record_type` from `client_profiles`
- Documents query: now selects `document_type_id` and `client_profile_id`
- DD requirements query: now selects `category` from `document_types`

**Updated:** `src/components/client/ServiceWizard.tsx`
- `ServiceWizardPeopleStep` now receives `documents` prop (passed from wizard state)
- Fixed `requiredDocTypes` category mapping: uses `r.document_types?.category` (was incorrectly using `document_types.name`)

**Updated:** `src/components/client/ServiceWizardDocumentsStep.tsx`
- Filters `requiredDocTypes` to corporate/compliance only — KYC docs no longer shown here
- Filters `extraUploaded` to exclude `kyc` and `identity` category docs
- KYC docs (passport, address, bank ref, source of funds) now belong in the People & KYC step

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Accepts `documents: ClientServiceDoc[]` prop
- `mapToKycRecord`: uses actual `record_type` from `client_profiles` (was hardcoded `"individual"`)
- Added `mapToDocumentRecord()` helper converting `ClientServiceDoc` → `DocumentRecord`
- `KycStepWizard` now receives profile-specific docs: `documents.filter(d => d.client_profile_id === profile.id).map(mapToDocumentRecord)`
- Passport and address upload slots in Identity step now show existing uploads

### 2026-04-17 — B-025 Batch 3: Role management, Edit Profile, Corp KYC (Claude Code)

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- `PersonCard` now accepts `allRoleRows: RoleWithProfile[]` (all role rows for this person)
- Inline **Edit Profile** section inside expanded card: full_name, email, phone (editable), record_type (read-only); calls PATCH `/api/admin/profiles-v2/[id]`
- **Roles management section** inside expanded card:
  - Shows all current roles with individual Remove buttons
  - Removing last role: confirm dialog before deleting, removes person from service
  - Add role dropdown (only unassigned roles shown) + optional shareholding % input for shareholder
- **Corporation KYC sections** (`record_type === "organisation"`): "Company Details" (company name, registration number, jurisdiction, incorporation date, activity, sector, listed/unlisted) and "Tax / Financial" (jurisdiction tax residence, tax ID, regulatory licenses)
- Added `KycSection` and `KycField` types; `select` field type with `options` array supported
- `KycLongForm` accepts `recordType` prop; branches to `KYC_SECTIONS_ORG` for organisations
- Doc slots shown in first section of each KYC form (Identity for individuals, Company Details for corps)
- `profileRolesMap` now tracks `allRoleRows` instead of `roleIds`

---

### 2026-04-17 — B-025 Batch 2: New Add Profile Dialog + Ownership Structure (Claude Code)

**Updated:** `src/app/api/admin/services/[id]/roles/route.ts`
- Extended POST to support creating new profiles (accepts `full_name`, `email`, `record_type` alongside `role`)
- Creates `client_profiles` row + `client_profile_kyc` row + `profile_service_roles` row
- Returns `client_profile_id` in response for auto-expand after creation
- Backwards-compatible: existing `client_profile_id` flow unchanged

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- Replaced dropdown-style `AddProfileDialog` with proper centered `<Dialog>` modal
  - Title changes per button: "Add Director" / "Add Shareholder" / "Add UBO"
  - Search list shows ALL profiles; already-linked profiles show role badges and are disabled (grayed, cursor-not-allowed)
  - Available profiles: clickable with blue highlight on selection
  - "Or create new" section: Individual/Corporation radio + name (required) + email (optional)
  - Both paths call POST `/api/admin/services/[id]/roles`
  - After add: dialog closes, page refreshes, newly added card auto-expands
- Added `OwnershipStructure` component (replaces static display)
  - Collapsible; default open when total ≠ 100%
  - Editable number inputs per shareholder with live progress bars
  - Unallocated row shows remaining %
  - Amber warning banner when total ≠ 100%
  - "Save Ownership" button PATCHes each shareholder's `shareholding_percentage`
- `PersonCard` accepts `defaultExpanded` prop for auto-expand after adding
- Added `newlyAddedProfileId` state + `handleProfileAdded` callback
- Removed now-unused `useRef` import and `existingProfileIds` variable

---

### 2026-04-17 — B-025 Batch 1: KYC Doc Slots + Document Split (Claude Code)

**Updated:** `src/types/index.ts`
- Added `'kyc'` to `DocumentType.category` union (for per-person KYC document types)

**Updated:** `src/app/api/admin/services/[id]/documents/upload/route.ts`
- Added `clientProfileId` field to FormData parsing
- `clientProfileId` now included in both insert and update operations
- Select returns `document_type_id`, `client_profile_id`, `document_types(id, name, category)`

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- Added `KycDocSlot` component: per-person doc upload slot inside KYC sections; calls admin upload route with `clientProfileId` in FormData; shows verification badge + preview/replace for uploaded docs
- Added `profileId`, `serviceId`, `profileDocuments`, `documentTypes`, `onDocUploaded` props to `KycLongForm`
- `KycLongForm` renders KYC-category doc slots inside the Identity section (when `profileId` and `documentTypes` are provided)
- `PersonCard` now accepts `profileDocuments` and `documentTypes` props, passes them to `KycLongForm`
- Main component splits `documents` into `profileDocs` (category='kyc') and `corporateDocs` (everything else)
- Each `PersonCard` receives only its own profile's KYC docs
- `AdminDocumentsSection` receives `corporateDocs` only (corporate/compliance/service-level docs)
- Documents section title count reflects only corporate docs

---

### 2026-04-17 — B-024 Batch 2: Rich Document Cards UI (Claude Code)

**Created:** `src/components/admin/DocumentUpdateRequestDialog.tsx`
- Dialog for sending document update requests to owners or representatives
- Radio buttons for recipient selection (document owner vs representative)
- Optional auto-populate from AI flags (pre-fills note textarea with bullet points)
- Calls POST /api/admin/documents/[id]/request-update on submit

**Updated:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`
- Added `DocumentPreviewDialog`, `DocumentUpdateRequestDialog` imports
- Replaced simple document list with `AdminDocumentsSection` component
- `RichDocumentCard` per uploaded doc: AI verification line (confidence %, rules passed), flags, extracted fields (collapsible), approve/reject buttons, preview/download/request-update buttons, update request history
- Missing docs (required by DD requirements, not uploaded): "Not uploaded" row with Upload button that calls `/api/admin/services/[id]/documents/upload`
- Flagged summary at bottom when any docs have flags or failed rules
- `setDocuments`/`setUpdateRequests` used to update state on upload/request-sent (no page reload needed)

---

### 2026-04-17 — B-024 Batch 1: Admin Documents Data Layer + API Routes (Claude Code)

**Updated:** `src/app/(admin)/admin/services/[id]/page.tsx`
- `ServiceDoc` type extended: `verification_result`, `admin_status`, `admin_status_note`, `admin_status_by`, `admin_status_at`, `mime_type`, `client_profiles(id, full_name)`
- Added `DocumentUpdateRequest` export type
- Documents query expanded with all new fields + `client_profiles` join
- Added parallel `document_update_requests` query (grouped by service_id, desc by sent_at)
- Passes `updateRequests` prop to `ServiceDetailClient`

**Created:** `src/app/api/admin/documents/[id]/request-update/route.ts`
- POST — admin only, creates `document_update_requests` row + sends email via Resend
- Body: `{ service_id, sent_to_profile_id, note, auto_populated_from_flags? }`
- Subject: "Document Update Required — {DocType} for {ServiceName}"

**Created:** `src/app/api/admin/services/[id]/documents/upload/route.ts`
- POST — admin only, uploads to `documents` table with `service_id` + triggers AI verification
- Body: FormData `{ file, documentTypeId }`

**DB migrations already run (user confirmed):**
```sql
CREATE TABLE document_update_requests (...)  -- see brief for full SQL
```
**Note:** If admin_status column doesn't exist on documents, run:
```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_status text DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_status_note text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_status_by uuid;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_status_at timestamptz;
```
(These columns are already used by the existing review route — likely already exist.)

---

### 2026-04-17 — B-023 Batch 3: Client "Last Request Sent" Info (Claude Code)

**Updated:** `src/app/(client)/services/[id]/page.tsx`
- Added `invite_sent_by` field to persons query
- After fetch, resolves sender names from `profiles` table by matching user IDs
- Enriches persons with `invite_sent_by_name` before passing to client component
- `ServicePerson` type: added `invite_sent_by_name: string | null`

**Updated:** `/api/services/[id]/persons/[roleId]/send-invite/route.ts`
- Records `invite_sent_by: session.user.id` on the role row when invite is sent

**Updated:** `src/components/client/ServiceWizardPeopleStep.tsx`
- Shows "Last request sent on {date} by {name}" below invite button when `invite_sent_at` is set
- `invite_sent_by_name` read as plain const (not state — value is fixed at render time)
- Added `invite_sent_by_name: null` to the `onAdded(...)` call to satisfy `ServicePerson` type

**DB migration required (run once in Supabase SQL editor):**
```sql
ALTER TABLE profile_service_roles ADD COLUMN IF NOT EXISTS invite_sent_by uuid REFERENCES auth.users(id);
```

---

### 2026-04-17 — B-023 Batch 2: Admin Collapsible PersonCards + InviteKycDialog (Claude Code)

**Created:** `src/components/shared/InviteKycDialog.tsx`
- Shared dialog for requesting KYC from a person (same pattern as client InviteDialog)
- Calls `/api/services/[id]/persons/[roleId]/send-invite`
- Pre-fills email from props

**Updated:** `/api/services/[id]/persons/[roleId]/send-invite/route.ts`
- Admin sessions (`session.user.role === "admin"`) can now call this route without `can_manage` check

**Updated:** `ServiceDetailClient.tsx` — admin `PersonCard` rewrite:
- Card header is now collapsible (click to expand/collapse KYC sections)
- Chevron indicates expand state; KycLongForm shows inline when expanded
- Removed old "Review KYC" toggle button; expansion via header click
- Replaced `sendInvite()` with "Request to Fill and Review KYC" button → InviteKycDialog
- Shows "Last request sent on {date}" after invite is sent

---

### 2026-04-17 — B-023 Batch 1: KYC Field Layout (Claude Code)

**Admin KYC sections** (`ServiceDetailClient.tsx`):
- Renamed "Identity" → "Your Identity"; removed `occupation`; added `email`, `phone`
- Added new section "Work / Professional Details": `occupation`, `work_address`, `work_email`, `work_phone`
- `KycLongForm` now accepts `profileEmail`/`profilePhone` props and seeds them into initial fields state (since they live on `client_profiles`, not `client_profile_kyc`)

**Client KYC Identity step** (`IdentityStep.tsx`):
- Moved `occupation` from the bottom grid into a new "Work / Professional Details" subsection

**Save route** (`/api/profiles/kyc/save`):
- `email` and `phone` removed from EXCLUDED_FIELDS → now handled as PROFILE_FIELDS
- When `email` or `phone` are in the payload, they are written to `client_profiles` instead of `client_profile_kyc`

---

### 2026-04-17 — B-022: 10 Client Portal Fixes (Claude Code)

**Fix #1 — Dashboard "Review and Complete" opens wizard:**
- `DashboardClient.tsx`: "Review and Complete" now navigates to `/services/[id]?startWizard=true`
- `services/[id]/page.tsx`: Added `startWizard` to searchParams type; `startWizard=true` sets `autoWizardStep=0`

**Fix #2 — "Back to Dashboard" link color:**
- `ClientServiceDetailClient.tsx`: Renamed "Back to overview" → "Back to Dashboard"; changed to `text-blue-600 hover:text-blue-800 font-semibold`

**Fix #3 — Country search dropdown styling:**
- `MultiSelectCountry.tsx`: Added `text-gray-900 placeholder:text-gray-500` to input; search input wrapper is now `max-w-md`

**Fix #4 — Red labels for empty required fields:**
- `DynamicServiceForm.tsx`: Detects partial fill (any field has value). When partially filled, empty required field labels render as `text-red-600`. All field types (text, textarea, select, boolean, multi_select_country) updated.

**Fix #5 — KYC Review Save/Next nav:**
- `ServiceWizardPeopleStep.tsx`: Changed `compact={true}` → `compact={false}` on KycStepWizard in review mode. The wizard now uses its built-in `sticky bottom-0` nav bar instead of inline compact nav.

**Fix #6 — Invite popup "Email Sent" toast:**
- `ServiceWizardPeopleStep.tsx`: Changed toast text from "Request sent!" to "Email Sent". Already closes on success (verified).

**Fix #7 — Unsaved changes warning:**
- `ServiceWizard.tsx`: Added `onDirtyChange` prop; tracks `isDirty` (JSON comparison vs original); adds `beforeunload` handler when dirty; clears dirty on save
- `ClientServiceDetailClient.tsx`: Tracks `wizardIsDirty`; "Back to Dashboard" shows custom confirmation dialog when dirty ("Leave without saving" / "Stay")

**Fix #8 — Documents show KYC-uploaded docs:**
- `services/[id]/page.tsx`: Refactored to fetch persons first, then fetch docs using OR query: `service_id.eq.{id},client_profile_id.in.({profileIds})`

**Fix #9 — Document upload client_id FK (already resolved):**
- Upload route was already omitting `client_id` on insert; DB column already made nullable by user

**Fix #10 — "Back to People" link color:**
- `ServiceWizardPeopleStep.tsx`: Changed to `text-blue-600 hover:text-blue-800 font-semibold`

**SQL migration needed (user must run):** None for B-022 (client_id was already made nullable)

---

### 2026-04-17 — B-021: Admin Service Detail Rework (Claude Code)

**Part 1 — Services List "by name":**
- `services/page.tsx`: Added parallel `audit_log` query filtered by `entity_type = 'service'`. Builds map of most-recent audit entry per service. Passes `lastUpdatedAt` and `lastUpdatedBy` (actor_name). ServicesPageClient's `LastUpdatedCell` already supported the two-line display.

**Part 2 — Service Detail 9 sections:**

**Created:**
- `src/components/admin/ServiceCollapsibleSection.tsx` — reusable collapsible card with inline progress bar, RAG dot, percentage, and "Admin" badge

**Expanded server page** (`services/[id]/page.tsx`):
- Adds queries for `admin_users`, `audit_log` (service entries, 100 rows), `due_diligence_requirements`, `document_types`
- New exported types: `AdminUser`, `ServiceAuditEntry`

**Rewrote** `ServiceDetailClient.tsx` — full 9-section layout:
- Header: service number + name, status badge + dropdown, account manager dropdown (stored in `service_details._assigned_admin_id`), Save/Cancel buttons (appear when changes pending)
- Section 1–3: Company Setup / Financial / Banking — each filtered by SECTION_MATCHERS, editable `DynamicServiceForm`, section progress bar
- Section 4: People & KYC — unique roles by profile ID, per-person KYC progress bar, can_manage toggle, invite button, add/remove, shareholding tracker
- Section 5: Documents — list with verification status badges
- Section 6: Internal Notes (admin) — textarea, saves to `service_details._admin_notes`
- Section 7: Risk Assessment (admin) — DD level selector (`_dd_level`), completion summary with per-section bars, required docs checklist
- Section 8: Milestones (admin) — toggle + date picker per milestone (LOE/Invoice/Payment)
- Section 9: Audit Trail (admin) — reuses `AuditTrail` component, by-user and by-action filters

---

### 2026-04-17 — B-020 Batch 3: AI verification on upload + submit validation dialog (Claude Code)

**Item 7 (AI verification on upload):** Wired `verifyDocument` into `services/[id]/documents/upload/route.ts` as a fire-and-forget call after upload. Fetches `document_types.ai_verification_rules`, runs AI, updates `documents.verification_status` + `verified_at` in background. Upload response is not blocked.

**Item 8 (Submit validation):**
- Created `src/app/api/services/[id]/validate/route.ts` — POST, verifies can_manage, checks: required fields for all 3 field sections, at least 1 director, shareholding ~100% if shareholders exist, all persons KYC completed, required docs uploaded, no flagged/rejected docs. Returns `{ valid, issues[] }`.
- Created `src/components/client/SubmitValidationDialog.tsx` — 3-phase modal: loading spinner, all-checks-passed, issues list. "Submit Application" only enabled if valid.
- Updated `src/components/client/ServiceWizard.tsx` — `handleSubmit` calls validate first, shows dialog; new `handleConfirmSubmit` PATCHes status to "submitted" and closes wizard.

**Files created:**
- `src/app/api/services/[id]/validate/route.ts`
- `src/components/client/SubmitValidationDialog.tsx`

**Files modified:**
- `src/app/api/services/[id]/documents/upload/route.ts` — added fire-and-forget AI verification
- `src/components/client/ServiceWizard.tsx` — validation dialog integration, `handleConfirmSubmit`

---

### 2026-04-17 — B-020 Batch 2: KYC invite dialog + updated email body (Claude Code)

**#4 KYC Invite Popup:** PersonCard now shows "Request to fill and review KYC" button that opens an `InviteDialog` modal (email pre-filled, optional note textarea). Status shows "Request sent" after sending.

**#5 Invite Email Body:** Updated `send-invite` route — subject includes service name; body includes role label (Director/Shareholder/UBO/etc.), service name; signed off with "autogenerated on behalf of {sender name}"; optional sender note shown if provided; accepts `note?: string` in POST body.

**Files modified:**
- `src/components/client/ServiceWizardPeopleStep.tsx` — added `InviteDialog` component; `PersonCard` uses dialog instead of direct API call; button text → "Request to fill and review KYC"; status → "Request sent"
- `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` — reads `note` from POST body; fetches service name; includes `roleLabel`, `serviceName`, `senderName`, optional note in HTML email

---

### 2026-04-17 — B-020 Batch 1: Dashboard rework + toast position + wizardStep link (Claude Code)

**#1 Dashboard Greeting:** "Welcome {name}" headline + subtitle ("Please provide the missing information...")

**#2 Dashboard Service Cards:** Complete rework — removed ACTION NEEDED section; each card now shows status badge, overall progress bar (green/amber by %), "Review and Complete" button, collapsible section checklist (5 sections with ✅/❌ + "Review >" per-section deep-link to wizard step)

**#3 Toast Position:** All `toast.success/error` in `ServiceWizard.tsx` set to `{ position: "top-right" }` so they don't cover wizard nav buttons

**WizardStep query param:** `?wizardStep=N` on `/services/[id]` now auto-opens the wizard at step N (dashboard "Review >" buttons pass this param)

**Files modified:**
- `src/app/(client)/dashboard/page.tsx` — computes section completions (calcSectionCompletion, calcKycCompletion) server-side per service; passes ServiceCardRow[] to DashboardClient; removed pendingActions
- `src/components/client/DashboardClient.tsx` — complete rewrite with new greeting + service card design; removed PendingAction types/rendering
- `src/app/(client)/services/[id]/page.tsx` — reads `searchParams.wizardStep`, passes `autoWizardStep` to client
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx` — added `autoWizardStep?: number` prop; initializes `wizardMode=true` and `wizardStartStep` from it
- `src/components/client/ServiceWizard.tsx` — toast position top-right on Saved/Progress saved/error

---

### 2026-04-17 — B-019: People & KYC Wizard Step Rework (Claude Code)

**Problem solved:** Removed the confusing dual-navigation (inner "Continue to KYC" + outer wizard nav).

**New design:** Step 4 shows a person roster with per-person KYC status. Clicking "Review KYC" opens a focused KYC form (outer wizard nav hidden). Outer Next/Back handles step navigation only.

**Files created:**
- `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` — client-accessible invite route: verifies can_manage, generates token+code, sends Resend email, updates profile_service_roles.invite_sent_at

**Files modified:**
- `src/app/(client)/services/[id]/page.tsx` — added `invite_sent_at` to `ServicePerson` type + persons query
- `src/components/client/ServiceWizardPeopleStep.tsx` — complete rewrite: roster view with PersonCard (KYC % bar, Review KYC, Send Invite / Invite Sent ✓, Remove), KYC review mode (replaces roster, shows KycStepWizard in compact+inlineMode), `onNavVisibilityChange` prop replaces `onNext`
- `src/components/client/ServiceWizard.tsx` — added `hideWizardNav` state, passes `onNavVisibilityChange={setHideWizardNav}` to PeopleStep, conditionally renders `ServiceWizardNav`

**KYC % calculation:** 11 fields (identity 6 + financial 2 + declarations 3); inline in component
**Invite flow:** email sent via Resend to `/kyc/fill/[token]`; `verification_codes` row inserted without `kyc_record_id` (new model uses `client_profile_kyc`, not `kyc_records`)

---

### 2026-04-17 — B-018 Batch 2: MiniProgressBar + admin services table rework (Claude Code)

**Files created:**
- `src/components/shared/MiniProgressBar.tsx` — reusable 60×4px progress bar; green ≥80%, amber >0%, red =0%; tooltip via `title` attribute
- (serviceCompletion.ts extended) — added `calcSectionCompletion(fields, details, sectionKey)` for Company Setup / Financial / Banking section-filtered completion

**Files modified:**
- `src/app/(admin)/admin/services/page.tsx` — expanded query: full service_fields, KYC data, batch-fetched documents per service; computes `AdminServiceRow[]` with 5 section percentages + manager list server-side; exports `AdminServiceRow` type and `templateOptions` for filter bar
- `src/app/(admin)/admin/services/ServicesPageClient.tsx` — complete rewrite: new columns (Ref/service_number, Status, Managers, Co.Setup%, Financial%, Banking%, People&KYC%, Docs%, Last Updated); filter bar with search (ref + manager name), service type chips (driven by templateOptions), status filter chips; "Service" column removed (now a filter); relative time for Last Updated

**Notes:**
- `lastUpdatedBy` is null/TODO until audit_log is confirmed to track service changes
- `service_number` shows "No ref" in italic if null (for services created before migration)

---

### 2026-04-17 — B-018 Batch 1: service_number DB migration + type + auto-generation (Claude Code)

**DB — SQL to run manually in Supabase SQL editor:**
```sql
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_number text;
CREATE UNIQUE INDEX IF NOT EXISTS idx_services_service_number ON services(service_number) WHERE service_number IS NOT NULL;
```

**Files created:**
- `src/app/api/admin/migrations/add-service-numbers/route.ts` — POST migration route that backfills `service_number` for all services without one. Uses prefix logic (GBC/AC/DC/TFF/RLM/SVC) based on template name. Run AFTER the SQL above.

**Files modified:**
- `src/types/index.ts` — Added `service_number: string | null` to `ServiceRecord`; also added `service_fields` to the joined `service_templates` shape for progress bar support
- `src/app/api/admin/services/route.ts` — POST handler now auto-generates `service_number` on service creation (looks up template name → prefix → max existing → next seq)

---

### 2026-04-17 — B-017: Client Service Wizard Rework (Claude Code)

**Landing page (ClientServiceDetailClient.tsx — REWRITE):**
- Default view is now a section checklist with 5 rows (Company Setup, Financial, Banking, People & KYC, Documents)
- Each row shows Complete/Incomplete + individual "Review" button that opens wizard at that step
- Greeting banner: amber "please complete" or green "all complete"
- "Review and Complete" CTA opens wizard at step 0
- Live state sync: wizard close propagates updated serviceDetails, persons, docs back to landing page

**Wizard infrastructure:**
- `ServiceWizardStepIndicator.tsx` — clickable step dots with complete/current/future states
- `ServiceWizardNav.tsx` — sticky bottom bar: Save & Close, Back, Next, Submit (green, only on last step, gated by canSubmit)
- `ServiceWizardStep.tsx` — thin wrapper: renders DynamicServiceForm for field-based steps
- `ServiceWizard.tsx` — main container: manages step state, serviceDetails, persons, docs; saves on every Next via PATCH /api/admin/services/[id]

**Field section routing:**
- Step 0 (Company Setup): fields with section "Company Setup", "Details", or no section
- Step 1 (Financial): fields where section matches /financial|finance/i
- Step 2 (Banking): fields where section matches /bank/i
- Missing section → auto-complete (0 required fields)

**Step 4 — People & KYC (ServiceWizardPeopleStep.tsx):**
- Roster view: add Director/Shareholder/UBO, list existing, remove (same API as B-016)
- "Continue to KYC" gated on at least 1 director being present
- Linear per-person KYC walkthrough using KycStepWizard compact+inline mode
- "Skip for now" button per person; auto-advances after onComplete
- Mini progress dots for the person sequence

**Step 5 — Documents (ServiceWizardDocumentsStep.tsx):**
- Shows required doc types (from DD requirements) + any already-uploaded docs
- Per-row upload button → calls new POST /api/services/[id]/documents/upload
- Auto-updates checklist on successful upload

**New API route:**
- `src/app/api/services/[id]/documents/upload/route.ts` — POST: verifies can_manage, validates MIME/size, uploads to Supabase Storage at services/[id]/[typeId]/..., upserts documents row

**Files modified:**
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx` — full rewrite (landing + wizard toggle)
- `src/app/(client)/services/[id]/page.tsx` — removed clientProfileId prop (no longer needed)
- `src/components/kyc/KycStepWizard.tsx` — saveUrl+inlineMode props added (B-016, referenced here)

### 2026-04-17 — B-016: Client Portal Rework — All 5 Phases (Claude Code)

**Phase 1 — Utilities + Tailwind tokens:**
- `src/lib/utils/pendingActions.ts` — NEW: `PendingAction` type + `computePendingActions()` for server-side dashboard action list
- `src/lib/utils/serviceCompletion.ts` — NEW: `calcServiceDetailsCompletion`, `calcDocumentsCompletion`, `calcPeopleCompletion`, `calcKycCompletion`, `calcOverallCompletion`
- `src/lib/utils/clientLabels.ts` — NEW: `CLIENT_STATUS_LABELS` + `getClientStatusLabel()` for friendly status text
- `tailwind.config.ts` — added `brand['client-primary']` (#3b82f6) and `brand['client-bg']` (#f0f9ff)

**Phase 2 — API Routes for Service Persons:**
- `src/app/api/services/[id]/persons/route.ts` — POST: add person (existing profile or create new)
- `src/app/api/services/[id]/persons/[roleId]/route.ts` — PATCH: shareholding; DELETE: remove role row
- `src/app/api/services/[id]/available-profiles/route.ts` — GET: profiles not yet linked to service
- `src/app/api/profiles/kyc/save/route.ts` — POST: save `client_profile_kyc` fields (parallel to /api/kyc/save for old model)

**Phase 3 — Service Detail Page Enhancement:**
- `src/app/(client)/services/[id]/page.tsx` — expanded data fetch: persons, DD requirements, document types; added `ServicePerson` export type
- `src/components/client/ServicePersonsManager.tsx` — NEW: Add Director/Shareholder/UBO, person cards with inline KycStepWizard, shareholding tracker
- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx` — REWRITE: 3 collapsible sections (service details, people & KYC, documents) with RAG dots + % + overall progress bar
- `src/components/kyc/KycStepWizard.tsx` — added `saveUrl` and `inlineMode` props (backward compatible)

**Phase 4 — Dashboard Rework:**
- `src/app/(client)/dashboard/page.tsx` — REWRITE: removed 1-service auto-redirect, batch-fetches persons+docs, computes pending actions server-side, renders DashboardClient
- `src/components/client/DashboardClient.tsx` — NEW: greeting banner (amber/green by status), pending action items with section color-coded left borders, service cards with friendly labels

**Phase 5 — Visual Polish:**
- `src/components/shared/Header.tsx` — added `variant` prop; client variant shows initials avatar (blue-500 circle, white text)
- `src/app/(client)/layout.tsx` — changed `bg-gray-50` → `bg-sky-50/30`; passes `variant="client"` to Header

**Do NOT touch admin pages — owner working on admin changes in parallel.**

### 2026-04-17 — B-015 Phase 5B: Replace Hardcoded Document Name Lookups (Claude Code)

**IdentityStep.tsx:**
- `resolveDocTypeId()` helper checks DD requirements first (`r.document_types?.name`), falls back to `documentTypes.find(dt => dt.name === ...)` only if no matching requirement
- `passportType`/`addressType` replaced with `passportTypeId`/`addressTypeId` (IDs only, no DocumentType object needed)

**DeclarationsStep.tsx:**
- Now destructures and uses `requirements` prop (was ignored before)
- `pepDocType` replaced with `pepTypeId` resolved from requirements first

**ReviewStep.tsx:**
- Document status section now driven by `requirements.filter(r => r.requirement_type === 'document')` instead of hardcoded `["Certified Passport Copy", "Proof of Residential Address", ...]` list
- Falls back to static level-based list only if no requirements are available

### 2026-04-17 — B-015 Phase 5C: Compliance Scoring Consolidation (Claude Code)

**Created `src/lib/utils/dueDiligenceConstants.ts`:**
- Shared `DD_LEVEL_INCLUDES` (cumulative DD level map) — no longer duplicated
- Shared `DD_SECTION_FOR_LEVEL` (display section names per DD level)

**Updated `complianceScoring.ts`:**
- Imports `DD_LEVEL_INCLUDES` / `DD_SECTION_FOR_LEVEL` from shared constants
- `reqSection()` checks `field_key` first (new schema column), falls back to `requirement_key`
- `isFieldMet()` call uses `req.field_key ?? req.requirement_key`
- `DECLARATION_FIELD_KEYS` Set replaces repeated `||` chain for clarity

**Updated `profileDocumentRequirements.ts`:**
- Removed duplicate `LEVEL_INCLUDES` local constant; imports `DD_LEVEL_INCLUDES` from shared file

### 2026-04-17 — B-015 Phase 5A+5D: Hardcoded List Fixes + Dashboard Analytics Update (Claude Code)

**5A — Fix hardcoded nationality/jurisdiction lists:**
- `IndividualKycForm.tsx`: Replaced 11-entry NATIONALITIES + 11-entry COUNTRIES with imported `COUNTRIES` from `MultiSelectCountry.tsx` (200+ countries)
- `OrganisationKycForm.tsx`: Replaced 12-entry JURISDICTIONS with same COUNTRIES list
- Both files now use a single consistent source of truth for country/jurisdiction lists

**5D — Dashboard analytics to use services table:**
- Stat cards (Total Services, Awaiting Review, Awaiting Client, Approved This Month) now query `services` table instead of `applications`
- "Total Applications" → "Total Services", links updated to `/admin/services`
- Quick Links updated: "All Services", "All Profiles", "Review Queue", "Service Templates", "Due Diligence"
- Chart data still uses `applications` table (requires `approved_at`/`submitted_at` fields not yet on services)

### 2026-04-17 — B-015 Phase 3C+3D: Role Requirements + Profile Requirement Overrides (Claude Code)

**Role Requirements management (`/admin/settings/role-requirements`):**
- New page + `RoleRequirementsManager.tsx` client component
- Per role (primary_client/director/shareholder/ubo): list required document types with add/remove
- POST `/api/admin/role-requirements`, DELETE `/api/admin/role-requirements/[id]`
- "Role Requirements" added to admin sidebar settings nav

**Profile Requirement Overrides (`/admin/profiles/[id]`):**
- Profile detail page now fetches cumulative DD requirements, role doc requirements, and existing overrides
- New `RequirementsPanel` section with collapsible view of all requirements
- Per DD requirement: "Waive" toggle with optional reason text; waived reqs shown with strikethrough
- "Reinstate" toggle removes the override
- Role doc requirements shown read-only (no waiver mechanism — different table)
- POST `/api/admin/profiles/[id]/requirement-overrides` (upsert waiver)
- DELETE `/api/admin/profiles/[id]/requirement-overrides/[reqId]` (reinstate)

**Type additions (`src/types/index.ts`):**
- Added `ProfileRequirementOverride` interface

### 2026-04-17 — B-015 Phase 3A+3B: Document Types + DD Requirements CRUD (Claude Code)

**Document Types management (`/admin/settings/document-types`):**
- New page + `DocumentTypesManager.tsx` client component
- Grouped by category (identity/corporate/financial/compliance/additional), collapsible cards
- Create (POST `/api/admin/document-types`), update name/category/applies_to/description (PATCH `/api/admin/document-types/[id]`), toggle active
- "Document Types" added to `ADMIN_SETTINGS_NAV` in Sidebar

**Due Diligence Requirements CRUD (`/admin/settings/due-diligence`):**
- `DueDiligenceSettingsManager.tsx` now accepts `documentTypes` prop (page.tsx already updated)
- Requirements list shows inherited (cumulative) reqs read-only + own-level reqs with remove button
- Add requirement form: pick Document type from grouped dropdown (auto-fills label + applies_to) OR enter field key
- Set `applies_to` (individual/organisation/both) per requirement
- API: POST `/api/admin/due-diligence/requirements` (added to existing route), DELETE `/api/admin/due-diligence/requirements/[id]` (new)

**Type updates (`src/types/index.ts`):**
- `DueDiligenceRequirement` now includes `field_key: string | null` and `applies_to: "individual" | "organisation" | "both"`

### 2026-04-17 — B-015 Phase 4A+4B: Client Dashboard + Client Service Detail (Claude Code)

**Client dashboard rewrite (`/dashboard`):**
- Queries `profile_service_roles WHERE can_manage = true AND client_profile_id = session.user.clientProfileId`
- If exactly 1 managed service → auto-redirect to `/services/[id]`
- If 2+ → shows service cards with status icon, action text (unfilled required fields count), Continue/View link
- If no managed services → empty state with link to KYC
- Graceful fallback if `clientProfileId` is null (old-model users)

**Client service detail (`/services/[id]`):**
- Verifies `can_manage = true` before loading (404 if no access)
- Collapsible sections with RAG indicators: Service Details (editable when draft/in_progress), Documents
- Shows admin notes (from `service_section_overrides.admin_note`) in amber banner per section
- KYC reminder card with link to `/kyc`
- Saves service_details via `PATCH /api/admin/services/[id]`

---

### 2026-04-17 — B-015 Phase 2C: Service Creation Wizard (Claude Code)

**New service wizard (`/admin/services/new`):**
- `src/app/(admin)/admin/services/new/page.tsx` — server component, fetches templates + profiles
- `src/app/(admin)/admin/services/new/NewServiceWizard.tsx` — 4-step client wizard: pick template → add people with roles → service details (DynamicServiceForm) → review → create. On submit, POSTs to `/api/admin/services`, redirects to new service detail page.

---

### 2026-04-17 — B-015 Phase 2A+2B: Services List + Detail Pages (Claude Code)

**Services list page:**
- `src/app/(admin)/admin/services/page.tsx` — server component querying `services` + template + profile_service_roles
- `src/app/(admin)/admin/services/ServicesPageClient.tsx` — search + status filter, table with RAG-ready service rows
- Sidebar: Services nav now points to `/admin/services` (was `/admin/applications`)

**Service detail page:**
- `src/app/(admin)/admin/services/[id]/page.tsx` — server component, parallel queries (service, roles+profiles+KYC, overrides, docs, all profiles for add-dialog)
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — 3-col layout: collapsible Service Details + Documents (left), People panel + milestones (right). RAG indicators auto-calculated. can_manage toggle, invite button, add/remove profiles, inline edit service_details, LOE + milestone toggles.

**API routes:**
- `POST /api/admin/services` — create service + optional role links
- `PATCH /api/admin/services/[id]` — update status, service_details, LOE, milestones
- `POST /api/admin/services/[id]/roles` — link profile to service
- `PATCH /api/admin/services/[id]/roles/[roleId]` — toggle can_manage, update role
- `DELETE /api/admin/services/[id]/roles/[roleId]` — unlink profile
- `POST /api/admin/services/[id]/section-override` — upsert RAG override
- `DELETE /api/admin/services/[id]/section-override?key=...` — remove override

---

### 2026-04-17 — B-015: Phase 1 — Services + Profiles Redesign + Multi-Tenancy Foundation

**REQUIRES: Run `supabase/migrations/003-phase1-schema.sql` in Supabase SQL Editor before deploying.**

**New tables (all with `tenant_id`):**
- `tenants` — multi-tenancy foundation, seeded with GWMS (`a1b2c3d4-0000-4000-8000-000000000001`)
- `users` — pure auth/login (replaces `profiles` for auth). Columns: email, full_name, phone, password_hash, role (admin|user), is_active
- `client_profiles` — all persons (replaces kyc_records identity part). Columns: user_id (nullable 1:1→users), record_type, is_representative, full_name, email, phone, address, due_diligence_level
- `client_profile_kyc` — KYC data (1:1 with client_profiles). All 40+ KYC fields from old kyc_records
- `services` — billable engagements (replaces applications). Columns: service_template_id, service_details JSONB, status, loe_received, workflow dates
- `profile_service_roles` — profile↔service junction. Columns: role (director|shareholder|ubo|other), can_manage, shareholding_percentage, invite tracking
- `profile_requirement_overrides` — per-profile DD requirement waivers
- `service_section_overrides` — admin RAG status overrides per service section

**Data migration (preserving UUIDs):**
- `profiles` → `users` (role derived from admin_users)
- `kyc_records` → `client_profiles` + `client_profile_kyc`
- `applications` → `services`
- `profile_roles` + `client_users` → `profile_service_roles`

**Schema additions to existing tables:**
- `documents`: added `client_profile_id`, `service_id` columns
- `verification_codes`: added `client_profile_id` column
- `service_templates`, `document_types`, `due_diligence_requirements`, `due_diligence_settings`, `role_document_requirements`, `audit_log`: added `tenant_id`
- `due_diligence_requirements`: added `requirement_type` (document|field), `field_key`, `applies_to` (individual|organisation|both)

**Old tables NOT dropped** — backward compatibility. Old pages still read from profiles, clients, kyc_records, applications.

**Code changes:**
- `src/lib/auth.ts` — queries `users` table, adds `clientProfileId` + `tenantId` to session
- `src/lib/tenant.ts` — NEW: `DEFAULT_TENANT_ID` + `getTenantId()` helper
- `src/types/next-auth.d.ts` — session shape: `clientProfileId` + `tenantId` replaces `kycRecordId`
- `src/types/index.ts` — added: Tenant, AppUser, ClientProfile, ClientProfileKyc, ServiceRecord, ProfileServiceRole, ProfileRequirementOverride, ServiceSectionOverride
- `middleware.ts` — updated comment, uses clientProfileId fallback
- `src/app/(admin)/layout.tsx` — queries `users` instead of `profiles`
- `src/app/(client)/layout.tsx` — queries `client_profiles` + `profile_service_roles`
- `src/app/(client)/kyc/page.tsx` — uses `clientProfileId` with backward compat fallback
- `src/components/shared/Sidebar.tsx` — admin nav: Dashboard / Services / Profiles / Queue
- `src/app/api/auth/set-password/route.ts` — dual-write to `users` + `profiles`

**New pages:**
- `/admin/profiles` — list page with search, type filter, create dialog
- `/admin/profiles/[id]` — detail page with collapsible KYC sections, services panel, DD level dropdown

**New API routes:**
- `POST /api/admin/profiles-v2/create` — create client_profile + client_profile_kyc
- `PATCH /api/admin/profiles-v2/[id]` — update profile fields
- `PATCH /api/admin/profiles-v2/[id]/kyc` — update KYC fields

**New component:**
- `src/components/admin/CreateProfileDialog.tsx` — dialog form for creating profiles

---

### 2026-04-13 — B-014: Non-Primary Profile Passwordless KYC Flow

**New table:** `verification_codes` — stores access tokens + 6-digit codes for external KYC access (migration done manually in Supabase)

**New files:**
- `src/app/api/kyc/verify-code/route.ts` — verifies 6-digit code, returns KYC data + doc requirements
- `src/app/api/kyc/save-external/route.ts` — saves KYC data via access token (whitelisted fields only)
- `src/app/api/documents/upload-external/route.ts` — uploads documents via access token
- `src/app/kyc/fill/[token]/page.tsx` + `KycFillClient.tsx` — standalone KYC form (no auth required)

**Updated files:**
- `src/app/api/admin/profiles/[id]/send-invite/route.ts` — **completely replaced**. No longer creates profiles/client_users rows or JWT tokens. Now generates verification code entry + sends email with code and access link.
- `middleware.ts` — `/kyc/fill` excluded from auth protection (early return before auth checks)
- `src/types/index.ts` — added `VerificationCode` interface

**Flow:**
1. Admin clicks "Send invite" on a non-primary profile row
2. System creates `verification_codes` row (token + 6-digit code, 72h expiry)
3. Email sent with code displayed prominently + "Complete my KYC profile" link
4. Person clicks link → `/kyc/fill/[token]` → enters 6-digit code
5. Code verified (max 5 attempts) → form loads with pre-filled KYC data
6. Person fills fields, uploads documents, clicks Submit → done. No account needed.

**Security:**
- Token is 32-byte random hex
- Code is 6-digit numeric, max 5 attempts before lockout
- Save-external route whitelists allowed fields (prevents injection of admin-only fields like risk_rating)
- All routes verify token is verified + not expired before any data access

---

### 2026-04-13 — B-013: Primary Contact pre-fill fix (Claude Code)

**Fix: Consolidated two-useEffect KYC pre-fill into single async init()**
- `src/app/(client)/apply/[templateId]/details/page.tsx`: replaced two separate useEffects (one for app load, one for KYC pre-fill on clientId change) with a single `async function init()` inside one useEffect. Uses local `resolvedClientId` variable instead of React state to avoid stale closure / batching timing issue. Sets `skipKyc = true` when existing contact data is already loaded from the application, preventing overwrites.

---

### 2026-04-12 — B-009: Account → Profiles → Roles refactor — all 6 phases (Claude Code)

**Phase 1 — Types + Smart Delta Utility:**
- `src/types/index.ts`: added `ProfileRole`, `RoleDocumentRequirement` interfaces; extended `KycRecord` with `is_primary`, `invite_sent_at`, `invite_sent_by`, `due_diligence_level`, `profile_roles`
- `src/lib/utils/profileDocumentRequirements.ts`: `getRequiredDocumentsForProfile()` smart delta, `getEffectiveDdLevel()` inheritance helper
- API routes: `GET/POST /api/admin/profiles/roles`, `DELETE /api/admin/profiles/roles/[id]`, `GET /api/role-document-requirements`, `PATCH /api/admin/profiles/[id]`, `POST /api/admin/create-profile`

**Phase 2 — Admin Account Profiles Table:**
- `src/components/admin/AccountProfilesTable.tsx`: inline DD level dropdown, inline email editing, send/resend invite, KYC % bar
- `src/components/admin/AddProfileDialog.tsx`: create kyc_record + profile_role dialog
- `src/components/admin/ClientEditForm.tsx`: "Company Details"→"Account Details", "Company name"→"Account name"
- `src/app/(admin)/admin/clients/[id]/page.tsx`: replaced "Account Users" card with AccountProfilesTable; added role_document_requirements parallel fetch

**Phase 3 — Profile Selector for Adding Directors/Shareholders/UBOs:**
- `src/components/shared/ProfileSelector.tsx`: pick existing profile or create new when adding a role
- `src/components/client/PersonsManager.tsx`: "Add Director/Shareholder/UBO" opens ProfileSelector; passes existingKycRecordId or newName to POST
- `GET /api/clients/[clientId]/profiles`: returns kyc_records for client (with access check)
- `POST /api/applications/[id]/persons`: accepts optional existingKycRecordId; also creates profile_roles entry

**Phase 4 — Non-Primary Portal Experience:**
- `src/lib/auth.ts`: at login, looks up kyc_records.profile_id to set is_primary + kycRecordId on JWT
- `src/types/next-auth.d.ts`: added is_primary + kycRecordId to session.user
- `middleware.ts`: non-primary clients redirected to /kyc if they hit any other client route
- `src/components/shared/Sidebar.tsx`: isPrimary prop — non-primary sees minimal nav ("My KYC" only)
- `src/app/(client)/layout.tsx`: resolves display name from kyc_records for non-primary
- `src/app/(client)/kyc/page.tsx`: non-primary fetches via kyc_records.profile_id, filters to own record

**Phase 5 — Primary Manages All Profiles:**
- `src/app/(client)/kyc/page.tsx`: supports `?profileId=X` query param
- `src/app/(client)/kyc/KycPageClient.tsx`: ProfileSwitcher dropdown when multiple profiles; wizard title shows profile name
- `src/app/(client)/dashboard/page.tsx`: Account Profiles card (shown when >1 profile) with KYC % + Fill KYC links
- `POST /api/profiles/create`: primary client creates new non-primary kyc_record

**Phase 6 — Per-Profile Invite Flow:**
- `POST /api/admin/profiles/[id]/send-invite`: creates profiles row, links kyc_records.profile_id, JWT with kycRecordId, sends invite email, updates invite_sent_at
- `src/app/api/auth/set-password/route.ts`: handles both "invite" and "profile_invite" JWT purposes
- `src/app/auth/set-password/page.tsx`: redirects to /kyc for profile invites, /apply for primary

### 2026-04-13 — B-012: Admin client page UX + wizard improvements (Claude Code)

**Change 1 — Compliance Scorecard to right column:**
- `src/app/(admin)/admin/clients/[id]/page.tsx`: removed from left (col-span-2); added at top of right sidebar above WorkflowMilestonesCard

**Change 2 — Application names clickable:**
- Solutions & Services table: name now links to `/admin/applications/[id]` with `text-brand-blue hover:underline`; removed separate View button column

**Change 3 — Pre-fill primary contact from KYC:**
- `src/app/(client)/apply/[templateId]/details/page.tsx`: pre-fill logic now prefers `is_primary=true` individual record; also pre-fills `contact_title` from `occupation`; guard prevents overwriting existing values

**Change 4 — Business Information to bottom of client wizard:**
- Added info banner: "The following business details will be completed by the admin team after your submission."
- Business fields (name, type, country, address) shown at bottom in muted card (`opacity-80 bg-gray-50`)

**Change 5 — Remove section letters from admin wizard:**
- `src/app/(admin)/admin/clients/[id]/apply/[templateId]/details/page.tsx`: removed "Section A:", "Section B:", "Section C:" prefixes

**Change 6 — Turnover field split migration:**
- `POST /api/admin/migrations/update-turnover-fields`: replaces `estimated_turnover_3yr` with three separate year fields on GBC + AC templates

**Note:** Run `pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev` after deployment to clear stale cache.

---

### 2026-04-13 — B-011: Unified KYC wizard, profile pre-fill, multi-select country (Claude Code)

**Feature 1 — Unified KYC experience across all persons:**
- `src/components/kyc/KycStepWizard.tsx`: added `compact?: boolean` prop — skips page scroll, removes sticky/negative-margin nav, reduces min-height
- `src/components/client/PersonsManager.tsx`: removed inline form from PersonCard; expanded body always renders `KycStepWizard compact` regardless of `kyc_journey_completed`; person-level DD override (`kyc_records.due_diligence_level ?? account-level`)
- Removed `PersonKyc` narrow interface — `Person.kyc_records` is now typed as full `KycRecord`

**Feature 2 — Profile pre-fill:**
- `GET /api/applications/[id]/persons`: changed `kyc_records!kyc_record_id(id, full_name, ...)` to `kyc_records!kyc_record_id(*)` so all fields (DOB, nationality, passport, address, etc.) pre-populate the wizard when an existing profile is selected

**Feature 3 — MultiSelectCountry component:**
- `src/components/shared/MultiSelectCountry.tsx`: tag-based multi-select for countries; 195+ countries list; search filter; chip display with X; disabled read-only mode
- `src/components/shared/DynamicServiceForm.tsx`: added `multi_select_country` to ServiceField type union; renders MultiSelectCountry for matching fields

**Feature 4 — geographical_area field update:**
- `supabase/seed-update-geographical-field.sql`: SQL UPDATE for reference (changes geographical_area in GBC + AC templates to multi_select_country)
- `POST /api/admin/migrations/update-geographical-field`: one-time admin route to apply the template update via Supabase SDK

---

### 2026-04-13 — B-010: ProfileSelector dialog fix + edit-mode visual boundaries (Claude Code)

**Fix 1 — ProfileSelector dialog never appeared when adding director/shareholder/UBO:**
- `src/components/client/PersonsManager.tsx`: removed `clientId = ""` default — empty string was falsy, so `if (clientId)` never fired
- Changed `PersonCard.clientId: string` → `clientId?: string`; KycStepWizard receives `clientId ?? ""`
- Also guards `fetchPersonDocuments` against undefined clientId (no-op, returns [])

**Fix 2 — Admin editable sections now highlight when in edit mode:**
- `src/components/admin/EditableApplicationDetails.tsx`: each Card gets `border-blue-200 bg-blue-50/30` when its section is active

---
## Older Entries

Earlier change log entries (B-005 through B-008 + all pre-2026-04-11 history) have been archived. See [`CHANGES-archive.md`](./CHANGES-archive.md).

The archive includes: B-005 document handling, B-006 plain-English rules, B-007 audit trail, B-008 KYC refactor, Batches 1-6 onboarding redesign, Knowledge Base, soft-delete, visual identity overhaul, and earlier history.

---

## Tech Debt Tracker

Track known shortcuts, known issues, and "we'll fix it later" items here. Add an entry whenever you take a shortcut or notice something that should be cleaned up. Move items to a "Resolved" section below when fixed.

### Open

| # | Item | Severity | Notes |
|---|------|----------|-------|
| 1 | **No multi-tenancy / tenant isolation** | High | All admins see ALL clients across the platform. SaaS model needs an `organizations` table, tenant-aware queries, and per-tenant RLS. |
| 2 | **All admins are equal** | High | No admin roles (super-admin, manager, reviewer). Anyone in `admin_users` can do everything. |
| 3 | **RLS bypassed app-wide (partial)** | Medium | The anon key can no longer hit raw tables — RLS is enabled default-deny on every public-schema table (B-045). The service role still bypasses everything and all server-side queries go through `createAdminClient()`. Before production SaaS launch we need real per-tenant policies so we can move app queries off the service role. |
| 4 | **No invite/onboarding flow for admins** | Medium | Adding an admin requires manual SQL/API. Build `/admin/settings/admins` page with invite-by-email + accept-flow. |
| 5 | **No audit log of admin-on-admin actions** | Medium | Adding/removing admins isn't tracked in `audit_log`. |
| 6 | **`src/lib/supabase/client.ts` is dead code** | Low | No longer imported anywhere after Auth.js migration. Safe to delete. |
| 7 | **`src/components/shared/Navbar.tsx` is dead code** | Low | Replaced by `Sidebar.tsx`. Safe to delete. |
| 8 | **In-memory rate limiter** | Medium | `src/lib/rate-limit.ts` resets on every server restart and doesn't work across multiple Vercel instances. Replace with Upstash Redis or Vercel KV before scaling. |
| 9 | **AI assistant messages are hardcoded** | Low | `getAssistantMessage()` in ApplicationStatusPanel returns static strings by status. Not real AI yet. |
| 10 | **Verification checklist is a placeholder** | Low | The "Verification Checklist" card on the application detail page is 6 static items. Needs real automation logic + DB column to track completion. |
| 11 | **No real-time updates** | Medium | Pages don't push live updates — users have to navigate or refresh to see admin changes. Could use Supabase Realtime or Server-Sent Events. |
| 12 | **`force-dynamic` everywhere** | Low | Disables Next.js caching globally on data pages. Works but loses perf benefits. Better long-term: tag-based revalidation via `revalidateTag()`. |
| 13 | **CLAUDE.md is partially outdated** | Low | Sections still reference Supabase Auth (replaced by Auth.js). Should be updated to reflect current architecture. |
| 14 | **No tests** | Medium | Zero test coverage. Add Vitest + Playwright for critical flows (auth, registration, application submit, document upload, stage changes). |
| 15 | **`supabase/README.md` has outdated SQL** | Low | Step 3 references `profiles.role` and `profiles.company_name` columns that don't exist. |
| 17 | **Knowledge base AI integration is "fail-open"** | Low | If `loadRelevantKnowledgeBase()` errors (e.g. table missing, query fails), it returns an empty string and verification proceeds without KB context. Good for resilience but means a silent KB outage won't be noticed. Add monitoring/alerting later. |
| 18 | **Knowledge base `applies_to` filter is naive** | Low | Currently only filters on `applies_to.document_type` exact-match (case-insensitive). Doesn't support template-id matching, tag-based matching, or fuzzy matching. Good enough for MVP. Should expand once we have real KB content. |

### Resolved

| # | Item | Resolved | Notes |
|---|------|----------|-------|
| 9 (partial) | AI assistant messages hardcoded | 2026-04-07 | Still hardcoded in `ApplicationStatusPanel`, but the new Knowledge Base feeds the real document verification AI prompts so the AI now has actual regulatory context. The status-panel chat is separately a UI placeholder. |
| 16 | Shell `ANTHROPIC_API_KEY=""` overrode `.env.local` | 2026-04-19 | B-031: `package.json` `dev` script now prefixes `unset ANTHROPIC_API_KEY &&` so `.env.local` always wins. |

