# B-050 — Client UX polish + small bugs

**Goal:** Land a batch of UX fixes and small bugs surfaced during user testing of B-046 / B-047 / B-048. Does NOT touch the doc-scope / verification architecture (that's B-049). Can ship independently.

**Out of scope:** Doc scoping, residential-address sub-step split, CV verification timing, manual professional details. Those are in B-049.

**Important:** Run `git pull origin main` first.

---

## Reference — apply ui-ux-pro-max throughout

- §1 Accessibility — focus rings, aria-labels, color contrast
- §2 Touch — 44pt min, 8px spacing
- §4 State clarity — buttons must look like buttons
- §8 Forms — visible feedback on save/error

---

## Batch 1 — Upload button + uploaded-row affordance

### 1.1 — Upload button styling

**File:** wherever doc upload rows render in the per-person KYC wizard (likely in `KycStepWizard.tsx` or a shared `DocUploadRow` component).

Currently the `Upload` button is rendered as outlined orange/amber and reads as a status badge, not a button.

Replace with a clear button affordance (matches B-048 chip palette):

```tsx
<Button className="bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100">
  <UploadIcon className="h-4 w-4 mr-2" />
  Upload
</Button>
```

- `rounded-md` (6px corners, not pill)
- `h-10` (40px) with hit-slop padding to meet ≥44pt
- `px-4 py-2`
- `text-sm font-medium`
- Focus ring: `focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500`

### 1.2 — Uploaded-row label

When a document is uploaded, replace the standalone eye icon with text + icon:

```
✓ Certified Passport Copy           Uploaded   👁 View
```

- `Uploaded` text: `text-sm text-green-700` (or whatever success color the project uses), to the left of the View button
- View button stays small, but the label "View" appears alongside the eye icon, not just the icon alone
- Tooltip on the View button: "View document"

This applies to every doc row in the per-person KYC wizard upload sub-steps.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 2 — AI verification display fixes

These are display-side fixes only. The actual verification logic / timing rework is in B-049.

### 2.1 — Confidence percentage cap (item 4)

**Bug:** Confidence values render as 3000%, 5500%, etc. Math error somewhere in the scaling.

Fix in the document viewer component / AI verification panel. Cap the display:

```ts
const display = Math.min(100, Math.max(0, rawConfidence));
return `${display.toFixed(0)}%`;
```

Find the actual scaling bug too (likely a `* 100` on a value that's already a percentage). Search for `confidence` in the codebase, find where it's multiplied / displayed, fix at the source.

### 2.2 — "Pending" instead of "Failed" when context is missing (item 5)

**Bug:** When AI verification flags "applicant name not provided" because the comparison field is empty, the doc renders as failed (red, "Rules: 0/2 passed", AI flagged issues).

Until B-049 fixes the verification timing entirely, soften the display when the AI's failure reason is "context missing" rather than a real rule violation:

- Detect failure messages containing phrases like "not provided in application context" / "cannot verify against missing field" — these are context-missing flags
- Render the doc as **Pending** (amber clock icon) instead of Flagged (red)
- Confidence: don't show a number. Show "Awaiting your application details."
- Don't claim "0/2 passed" — say "Verification will run once you complete your details."

This is a stop-gap. B-049 will rework the timing entirely so context-missing flags never happen.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 3 — Tax ID dedup + Add Person modal optionalisation

### 3.1 — Tax identification number appears twice (item 12)

Find the duplicate. Likely one in Identity-related step and one in Declarations or Financial. Keep the one in Declarations (the more compliance-natural location), remove from the other.

If the field is genuinely needed in both places for different reasons, that suggests a data model issue — flag in CHANGES.md and remove the duplicate UI; the underlying field only exists in one column.

### 3.2 — Add Person modal — email + phone optional (item 20)

**File:** `AddPersonModal.tsx` (created in B-046).

In the "Add new person" tab, mark Email and Phone as optional (no red asterisk, no required validation). Full name remains required. For Director / Shareholder modals, Type radio (Individual / Company) remains required. For UBO modal, Type is fixed to Individual.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 4 — Autosave reliability feedback

### 4.1 — Visible feedback when autosave fails (item 13)

The wizard's autosave currently fires silently. If a POST fails (network error, 5xx, server down), the user gets no signal — they think they're saved when they're not.

**Implementation:**

Wrap the autosave handler so it tracks state:

```ts
type SaveState = 'idle' | 'saving' | 'saved' | 'failed' | 'retrying';
```

UI indicator (small, persistent, top-right of the wizard or in the footer near the buttons):

- `idle` — nothing rendered (or a faint "All changes saved" gray)
- `saving` — small spinner + "Saving…"
- `saved` — green check + "Saved" (auto-fades after 2s)
- `failed` — red exclamation + "Couldn't save — retrying" (clickable to manually retry)
- `retrying` — same as failed but with spinner

**Retry-with-backoff:**

On failure, retry 3 times with exponential backoff (1s, 3s, 9s). If all 3 fail, transition to `failed` state and stop auto-retrying. User can click the indicator to retry manually.

**Block navigation past a failed save:**

The unsaved-changes dialog (B-046 §1.2) detects a `failed` state — disable "Leave without saving" and surface a clearer "You have unsaved changes that haven't been saved to the server. Try Save & Close, or check your connection."

### 4.2 — Apply to all wizard autosave handlers

- Outer application wizard (every step's autosave)
- Per-person KYC wizard (every sub-step's autosave)
- Use a shared `useAutosave` hook so the indicator is consistent everywhere.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 5 — Review-step jump-to-edit + person navigation chips

### 5.1 — Review step "Edit" / "Open" jump-links (item 14)

**File:** `ReviewStep.tsx` (the per-person review/save sub-step) and the outer application Review step.

Currently the Review screen lists sections (Financial Profile, Declarations, Documents, etc.) and items inside each. To fix a missing item, the user has to back-button through every prior step.

Add inline jump-to-edit:

- **Section headers** get a right-aligned `Edit` link (text-link style, not a button — `text-blue-600 hover:underline`).
- **Missing items** (red rows) get a clickable label — the entire missing-item row becomes a button that jumps directly to the relevant sub-step + scrolls the relevant field into view.
- Clicking a link / row navigates to the sub-step. After the user fixes the item and hits Save & Continue, **forward navigation continues from where they jumped to** (option B), not back to Review. They walk through the rest of the wizard normally.

Implementation hint: pass the target sub-step index (and optionally a field id to scroll-and-focus) via the wizard's navigate function. Standard React Router / Next.js navigation, no special state needed.

### 5.2 — Person navigation chips in Review-All-KYC walk (item 16)

**File:** the wizard shell used during Review-All-KYC mode.

Replace the current "Reviewing person 1 of 4 — Bruce Banner — 3 remaining" banner with a chip strip:

```
←  [Bruce Banner ✓]  [Tony Stark •••○○○○○○]  [Pepper Potts ○○○○○○○○○]  [Phil Coulson ○○○○○○○○○]  →
```

- One chip per person in the application
- Chip shows: name + completion status indicator (✓ if 100%, otherwise small dots representing sub-step progress out of total)
- Active person's chip is filled / highlighted
- Click a chip to jump to that person at sub-step 1
- ←  /  → arrows on either end go to previous / next person
- Mid-walk navigation (clicking a different person's chip) **autosaves the current sub-step silently first**, no dialog
- Sub-step navigation within a person stays linear (Back / Next), unchanged

Layout: horizontally scrollable on mobile if many persons.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 6 — Completion percentage + Save & Close on doc sub-steps + View Summary

### 6.1 — KYC completion percentage on person card (item 17)

**File:** `PersonsManager.tsx` (the person card component).

Currently shows 100% for a person who has only Identity docs uploaded (3/3) and no Financial / Compliance / form data. The calculation is broken.

Fix the calculation to be the same data source the Review step uses for "Missing" warnings (option B from clarification). Formula:

```
completion = (
  required_docs_uploaded_count + required_form_fields_filled_count
) / (
  required_docs_total + required_form_fields_total
) * 100
```

Where:

- `required_docs_*` — count of person-scope docs from the template config that are required
- `required_form_fields_*` — count of required fields across all form sub-steps (Identity, Residential Address from B-049, Professional details, Declarations) that have non-empty values on this `kyc_records` row

The progress bar updates live as the user uploads / fills.

When 100%, the person card shows a green check on the avatar in addition to the bar.

### 6.2 — Save & Close on every per-person KYC sub-step (item 22a)

**File:** `KycStepWizard.tsx`.

Currently Save & Close is on form sub-steps but doc sub-steps have only [Back] [Upload Later] [Next]. Per the user's request, **add Save & Close to every sub-step** including doc sub-steps. Layout becomes:

```
Doc sub-steps:  [ ← Back ]  [ Save & Close ]  [ Upload later ]  [ Next → ]
Form sub-steps: [ ← Back ]  [ Save & Close ]  [ Next → ]
```

Save & Close runs the existing save handler (autosave is already running, this is just an explicit trigger) then exits the wizard back to the People & KYC list.

In Review-All-KYC mode (Batch 3 of B-046), Save & Close still works — it exits the entire walk, not just advances to next person. (Save & Continue continues to the next person.)

### 6.3 — View Summary button on person card (item 22b)

**File:** `PersonsManager.tsx`.

Each person card currently has [Review KYC] and [Request KYC]. Add a third button **between** them:

```
[ Review KYC ]  [ View Summary ]  [ ✉ Request KYC ]
```

- "View Summary" is a tertiary button (text-link style, gray-700, no fill)
- Clicking opens the per-person Review sub-step (same as the final sub-step of the Review KYC walk for that person — sub-step 13 / Review & save in B-049's order, or the existing `ReviewStep` component)
- The view is read-only by default (with the jump-to-edit links from §5.1 still working if the user wants to fix something)
- Has a Close button at the bottom to return to the People & KYC list

Tooltip on hover: "See everything you've entered so far."

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 7 — Resend KYC request

### 7.1 — Resend invite (item 21)

**File:** `PersonsManager.tsx`.

Current behavior: clicking "Request KYC" sends the invite email and updates "Last request sent on …" timestamp. After the first send, behavior is unclear / the button might disappear or get disabled permanently.

**New behavior:**

- The button is **always visible** on the person card.
- Label changes:
  - First send: `✉ Request KYC`
  - After at least one send: `✉ Resend invite`
- Rate-limited: one resend per 24 hours per person.
- If user tries to click within the 24h window, the button is disabled with a tooltip:
  > "Already sent today. You can resend after {date+24h, in user's local time}."
- Each successful resend updates `kyc_records.last_request_sent_at` and surfaces a success toast: "Invite resent to {email}."

Server-side: the existing send-invite endpoint already accepts repeat calls (verify in code). Add the 24h check on the server too — don't trust the client's tooltip alone.

**Commit + push + update CHANGES.md**, then stop.

---

## After all batches

- Run `npm run build` — must pass clean (lint + type check, no warnings).
- Update CHANGES.md with a new dated section per batch.
- Final commit + push.
- Hand back: one line — done / blocked / question.

---

## Open notes

- This brief is **independent of B-049**. Both can run in parallel; merge order doesn't matter.
- Most changes touch existing components; minimal new files.
- Reuse existing tokens (brand-navy, role-color palette).
- Don't introduce `any`. Don't disable strict mode.
- Don't restart the dev server while editing — let the user do it after CLI finishes.
