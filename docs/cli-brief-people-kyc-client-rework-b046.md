# B-046 — People & KYC Client-View Rework

**Goal:** Make the client People & KYC experience guided and low-think. Clients should always know what to do next without having to navigate back/forth.

**Out of scope:** Admin-side People & KYC view. Don't touch admin layouts unless a shared component is being modified — in that case, gate the new behavior behind a `mode` / `viewer` prop so admin behavior is unchanged.

**Important:** Run `git pull origin main` before starting.

---

## Batch 1 — Dashboard welcome message + unsaved-changes "Save & Close"

Small warm-up batch, zero coupling with the other batches.

### 1.1 — Dashboard welcome message

**File:** `src/components/client/DashboardClient.tsx` (and adjacent — search for the welcome heading)

- When the user lands on `/dashboard` and they have **at least one application that is not yet submitted / has missing required info**, replace the current welcome with:

  > **Welcome, {firstName}.** Your application is missing some information — click **Review** below to complete it.

- Use the **firstName** from `profiles.full_name` (split on first space). Fall back to "Welcome back." if no name.
- "Review" should be the existing primary CTA on the application card. Make sure the message visually points to it (sit directly above it, or use a connecting visual cue).
- If all applications are complete / submitted, keep the current welcome text untouched.
- "Missing info" detection logic: reuse whatever the existing missing-info banner / completion-checklist is using. Do **not** invent new logic — extract a helper if needed.

### 1.2 — Unsaved-changes dialog: add "Save & Close" button

**File:** `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx` around line 165 (the `showUnsavedWarning` block).

Currently the dialog has two buttons:
- Stay
- Leave without saving

Add a third **primary** button: **Save & Close**.

Behavior:
- Trigger an immediate save of whatever the wizard is currently buffering (autosave already handles this in the background — call the same save handler synchronously).
- On save success, set `setWizardMode(false)` and `setShowUnsavedWarning(false)`.
- On save failure, surface a toast (`sonner` is already in the app) and keep the dialog open so the user can retry / leave without saving.

Order of buttons (left → right): Leave without saving · Stay · **Save & Close** (primary, blue).

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 2 — People & KYC: Add buttons + Add modals

**Primary file:** `src/components/client/PersonsManager.tsx`. Other files as needed.

### 2.1 — Layout changes

Currently the "Add person" controls live wherever they are now (likely below the list). Move to **above the list**, in a single horizontal toolbar row:

```
[Add Director] [Add Shareholder] [Add UBO]                                    [Review all KYC]
```

- Three "Add" buttons grouped left, each opens its **own** modal (one modal per role for now — keeps option open to specialize them per role later).
- "Review all KYC" button on the right (Batch 3 wires its behavior; for this batch render the button as disabled with a tooltip "Coming in next change" — actually, just hide it for this batch and add it in Batch 3).
- If there are **zero** people, render the toolbar without the Review-All button. Empty state below the toolbar: "No people added yet. Use the buttons above to get started."

### 2.2 — Add modal (one shared component, three role-specific entry points)

Create `src/components/client/AddPersonModal.tsx`. Props: `role: 'director' | 'shareholder' | 'ubo'`, `clientId`, `onClose`, `onPersonReady(personId: string)`.

Modal contents — two tabs / sections:

**Tab A: Select existing person**
- Lists every `kyc_records` row attached to this client (across all applications), showing:
  - Name
  - Existing roles as chips (e.g. "Director", "Shareholder 50%")
  - Type (Individual / Company)
- Filter: if `role === 'ubo'`, hide records where `record_type !== 'individual'`.
- Selecting a row attaches the new role to that record:
  - Insert a `kyc_roles` row (or whatever the existing role-link mechanism is — check the schema; if roles are a JSONB array on `kyc_records`, append).
  - If the role already exists on the record, surface an inline message "{Name} is already a {role}" and disable the row.
- On success: `onPersonReady(personId)`.

**Tab B: Add new person**
- Minimal form: `Full name` (required), `Email` (required), `Phone` (optional), `Type: Individual / Company` (radio).
- For `role === 'ubo'`: hide Type, force `record_type = 'individual'`.
- On submit: insert a new `kyc_records` row with the chosen role attached, return its id via `onPersonReady`.

### 2.3 — Auto-open Review KYC after add

In `PersonsManager.tsx`, when `onPersonReady(personId)` fires:
- Close the modal.
- Open the existing Review KYC wizard for that `personId` (the same flow that today fires when the user clicks the "Review KYC" button on a person card).

### 2.4 — Notes

- **Do NOT** add the Review-All-KYC handler in this batch. Just don't render the button yet (or render it disabled with a TODO comment referencing B-046 batch 3).
- Verify role-attachment logic against the existing schema before writing inserts. If `kyc_records` uses a JSONB roles array, append-and-dedupe; if there's a separate `kyc_roles` table, insert with FK.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 3 — Review All KYC walk-through

### 3.1 — Render the button

In the People & KYC toolbar (added in Batch 2), enable the **Review all KYC** button:
- Visible only when there is ≥1 person.
- Primary blue button, same visual weight as the existing per-person "Review KYC" button.

### 3.2 — Walk-through behavior

When clicked:
- Build an ordered list of every person on the application (use the existing `Person[]` from `PersonsManager`).
- Start the wizard for `persons[0]` in a new "review-all mode".
- Track current index in local state.

In `KycStepWizard.tsx`, add a new prop `reviewAllContext?: { current: number; total: number; onAdvance: () => void; }`.

When `reviewAllContext` is set, on the final wizard step:
- Replace the existing **"Save & Close"** button with **"Save"** (with chevron-right icon) — copy: "Save" if `current + 1 < total`, "Save & Finish" on the last person.
- On click: run the same save handler. On success:
  - If not last: call `onAdvance()` which increments the index and re-mounts the wizard for the next person.
  - If last: close the wizard and return to People & KYC view.
- Also render a small header inside the wizard: `Reviewing person {current + 1} of {total} — {Name}` so the user knows where they are in the walk.

### 3.3 — Single-person Review KYC unchanged

When `reviewAllContext` is **not** passed, the wizard keeps the existing "Save & Close" final-step behavior.

### 3.4 — Edge cases

- If the user closes the wizard mid-walk via the X / unsaved-changes dialog, treat it as exiting the walk entirely (don't auto-advance).
- The walk **always visits every person** regardless of completion state. Per user direction.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 4 — Review KYC layout rework

This batch reshapes the Review KYC view itself. All work is **client-side only** — admins continue to use the existing layout. If shared components are touched, gate by a viewer prop (e.g. `viewer: 'client' | 'admin'`).

### 4.1 — Person card slim-down (`PersonsManager.tsx`, person card render)

**Remove** the bottom Roles section currently showing `Director / UBO / Shareholder 50%` with Remove links.

**Keep** on the card: avatar, name, role chips (top), email, progress bar, "Review KYC" button, "Last request sent on …" indicator.

### 4.2 — Review KYC top row redesign

When a person opens Review KYC, the top row should be a **single line**:

```
{FULL NAME}    [Director ✓]  [Shareholder]  [UBO ✓]
```

- Name on the left, in current heading style.
- Role chips on the right of the name, click-to-toggle:
  - Active state (role attached): filled chip, role-specific color (Director blue, Shareholder purple, UBO yellow — match the existing badge palette).
  - Inactive state: outlined / muted chip.
  - Clicking toggles the role on/off on the underlying `kyc_records` row. Update optimistically and roll back on failure.
- **UBO chip is hidden** if `record_type !== 'individual'`.
- **No inline % capture.** Shareholder % stays editable wherever it is today (do not introduce new UI for it in this batch).
- Removing the last role on a person: do **not** delete the person — surface a small confirm "{Name} will have no role on this application. Continue?" with Confirm / Cancel.

Directly below the top row, add helper text:

> **Upload your KYC documents below — we'll auto-fill the rest of the form from them.**

(Tweak phrasing if you find a more natural one within the existing copy voice.)

### 4.3 — KYC documents panel rework

The right-hand panel currently mixes Profile + Roles + KYC Documents. **Remove** the Profile + Roles block — the whole panel is now KYC documents.

Layout:
- Heading row stays: `KYC DOCUMENTS  - X of Y uploaded` + status legend.
- Body becomes a **two-column grid**, even document-count split.
  - Algorithm: take the flat list of documents (preserving section order: Identity → Financial → Compliance), split into two halves by count. If odd count, left column gets the extra.
  - Section headers (Identity / Financial / Compliance) **render inline within each column** wherever the section's documents fall. If a section spans both columns, render the header in both — keep the user oriented.
- Each column has its own scroll container (`overflow-y-auto`, max-height matching the panel height).

### 4.4 — Contact details + Identity below docs panel

Below the documents panel, in the left-hand area:

**Contact Details** — single row, two inputs:
```
[ Email .................... ]   [ Phone ................. ]
```

Section heading "Contact Details" above the row, no other fields.

**Identity** — unchanged from current implementation. Just leave as-is.

### 4.5 — Sanity checks

- Verify nothing in the admin Review KYC view changes. If a shared component required modification, the admin view must continue rendering the **old** layout (gated by viewer prop).
- Test on a person with all roles, none, and only UBO (Individual). Verify the chip toggles work and reload correctly.

**Commit + push + update CHANGES.md**, then stop.

---

## After all batches

- Run `npm run build` — must pass clean (lint + type check).
- Update CHANGES.md with a new dated section per the existing format, summarizing what each batch did.
- Final commit + push.
- Hand back: one line — done / blocked / question.

---

## Open notes

- **Existing role schema**: confirm whether roles are a JSONB array on `kyc_records` or a separate `kyc_roles` table before writing inserts in Batch 2 and Batch 4. If it's a table you may need a migration to ensure proper indexing — flag in CHANGES.md if so.
- **Shareholder %** stays where it is today. Don't add new % UI in this brief.
- **No new email/notification flows** in this brief. The existing "Last request sent on …" mechanism is untouched.
- Don't introduce `any`. Use `unknown` + cast if Supabase inference is wrong.
