# B-046 — People & KYC Client-View Rework

**Goal:** Make the client People & KYC experience guided and low-think. Clients should always know what to do next without having to navigate back/forth. Per-person KYC review breaks into a series of small, focused sub-steps with **centered button groups** so the next action is always visible mid-screen.

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
- "Review all KYC" button on the right (Batch 3 wires its behavior; for this batch hide it and add it in Batch 3).
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

When `reviewAllContext` is set, on the **final sub-step** of the per-person wizard:
- Replace the "Save & Close" button with **"Save"** (or "Save & Continue") with a chevron-right icon.
- Copy: "Save & Continue" if `current + 1 < total`, "Save & Finish" on the last person.
- On click: run the same save handler. On success:
  - If not last: call `onAdvance()` which increments the index and re-mounts the wizard for the next person (start at first sub-step).
  - If last: close the wizard and return to the People & KYC view.
- Render a small banner inside the wizard shell: `Reviewing person {current + 1} of {total} — {Name}` and `{total - current - 1} remaining` so the user knows where they are in the walk.

### 3.3 — Single-person Review KYC unchanged

When `reviewAllContext` is **not** passed, the wizard keeps the existing "Save & Close" final-step behavior.

### 3.4 — Edge cases

- If the user closes the wizard mid-walk via the X / unsaved-changes dialog, treat it as exiting the walk entirely (don't auto-advance).
- The walk **always visits every person** regardless of completion state. Per user direction.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 4 — Per-person wizard restructure + centered button group

This is the main UX rework. The per-person KYC review changes from "single page with docs panel + form steps alongside" into a series of focused **sub-steps**, each with a centered three-button bar.

### 4.1 — New per-person sub-step structure

Order:
1. **Identity documents** (block: Certified Passport, Proof of Residential Address, CV/Resume)
2. **Financial documents** (block: Declaration of Source of Funds, Evidence of Source of Funds, Bank Reference Letter)
3. **Compliance documents** (block: PEP Declaration, etc.)
4. **Contact details** (slim form: Email + Phone)
5. **Identity form** — existing `IdentityStep`
6. **Financial info form** — existing `FinancialStep`
7. **Declarations** — existing `DeclarationsStep`
8. **Review & save** — existing `ReviewStep`

If a doc category has zero document slots configured for the current template / role, **skip that sub-step entirely** (don't render an empty screen). Same for any form step that doesn't apply.

### 4.2 — Persistent shell across all sub-steps

Every sub-step renders the same shell:

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Bruce Banner                       [Director ✓] [Shareholder ✓] [UBO ✓] │
│  Upload your KYC documents below — we'll auto-fill the rest from them.   │
│                                                                          │
│  ┌── KYC DOCUMENTS · X of Y uploaded ──────────────────────────────────┐ │
│  │   ✓ IDENTITY (3/3)    ◔ FINANCIAL (1/3)    ○ COMPLIANCE (0/1)       │ │
│  └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌── { CURRENT SUB-STEP CONTENT } ────────────────────────────────────┐  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│             [ ← Back ]   [ Upload later / Save & Close ]   [ Next → ]    │
│                                                                          │
│  Reviewing person 1 of 3 — Bruce Banner                  2 remaining     │
│  Sub-step 2 of 8 — Financial documents                                   │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Top-row name + role chips** with click-to-toggle behavior:
  - Active state (role attached): filled chip, role-specific color (Director blue, Shareholder purple, UBO yellow — match existing badge palette).
  - Inactive state: outlined / muted chip.
  - Click toggles the role on the underlying `kyc_records` row. Optimistic update, rollback on failure.
  - **UBO chip is hidden** if `record_type !== 'individual'`.
  - **No inline % capture** for Shareholder / UBO. % stays editable wherever it is today.
  - Removing the last role: confirm "{Name} will have no role on this application. Continue?" with Confirm / Cancel.
- **Helper subtitle** below the name row, shown only on doc sub-steps (1–3): "Upload your KYC documents below — we'll auto-fill the rest of the form from them." Hide on form sub-steps.
- **KYC progress strip** (Identity / Financial / Compliance with X/Y counters) is persistent across all sub-steps.
  - State icons: `○` = none uploaded · `◔` = some uploaded · `✓` = all uploaded.
  - Total counter updates live as docs upload.
- **Sub-step counter** at the bottom (e.g. "Sub-step 2 of 8 — Financial documents"). Computed dynamically based on which sub-steps actually render.

### 4.3 — Sub-step content blocks

**Doc sub-steps (1–3) — single block, 3 buttons:**

```
┌── IDENTITY DOCUMENTS ───────────────────────────────────────────────┐
│   📄 Certified Passport Copy                          [ ⬆ Upload ]  │
│   📄 Proof of Residential Address                     [ ⬆ Upload ]  │
│   📄 Curriculum Vitae / Resume                        [ ⬆ Upload ]  │
└─────────────────────────────────────────────────────────────────────┘
```

After upload, a row flips to:

```
✓ Certified Passport Copy           Uploaded     [ 👁 View ]
```

- 👁 icon has a tooltip: "View document" (use existing tooltip primitive).
- "Next" button is **disabled until all docs in this section are uploaded**.
- "Upload later" advances to the next sub-step **without forcing uploads**, only for the current section. Skips only this category, not all remaining doc sub-steps.
- "Back" goes to the previous sub-step (or, on the first sub-step, exits the wizard the same way the current Back button does).

**Contact details sub-step (4) — slim 2-input row, 2 buttons:**

```
┌── CONTACT DETAILS ──────────────────────────────────────────────────┐
│   Email                          Phone                              │
│   [ vanes_vr@yahoo.com      ]    [ +1 718 968 5642             ]    │
└─────────────────────────────────────────────────────────────────────┘
```

Bottom bar: `[ ← Back ]  [ Next → ]` (no "Upload later").

**Form sub-steps (5–8) — existing step components, wrapped in the new shell:**

Mount the existing `IdentityStep`, `FinancialStep`, `DeclarationsStep`, `ReviewStep` inside the shell. Three-button bar:

```
[ ← Back ]   [ Save & Close ]   [ Next → ]
```

(The middle button becomes "Save & Continue" / "Save & Finish" in Review-All mode per Batch 3.)

### 4.4 — Centered button group across all wizards

The current wizards (per-person KYC + outer application wizard) place buttons at the **edges** of the screen (Back bottom-left, Next bottom-right, Save & Close opposite corner). This is hard to notice mid-screen.

Replace with a **centered horizontal group** at the bottom of every wizard step:

```
                  [ ← Back ]   [ middle action ]   [ Next → ]
```

- The button bar is centered horizontally on the page.
- ~12–16px gap between buttons.
- The middle button is the secondary action ("Save & Close", "Upload later", etc.) and varies per screen.
- Apply to:
  - Per-person KYC wizard (Batch 4 work)
  - Outer application wizard (`ServiceWizardNav.tsx` and any wrapper) — same pattern, same gap, same alignment.
- Button visual style stays the same as today; only positioning changes.

### 4.5 — Person card slim-down

Same as the original Batch 4 plan:

- **Remove** the bottom Roles section currently showing `Director / UBO / Shareholder 50%` with Remove links.
- **Keep** on the card: avatar, name, role chips (top), email, progress bar, "Review KYC" button, "Last request sent on …" indicator.

### 4.6 — Sanity checks

- Verify nothing in the admin Review KYC view changes. If a shared component required modification, the admin view must continue rendering the **old** layout (gated by viewer prop).
- Test on a person with all roles, none, and only UBO (Individual). Verify the chip toggles work and reload correctly.
- Test Review-All walk on 1 person, 3 people, 0 people (button hidden).
- Test "Upload later" on each doc sub-step — confirm it advances only the current category.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 5 — Auto-fill indicator (replaces manual "Fill from uploaded document" CTA)

The current Identity step shows a clickable "Fill from uploaded document" button that the user must press to trigger AI prefill. Replace with **automatic prefill on screen entry** + a passive indicator banner.

### 5.1 — Auto-trigger on sub-step entry

In `IdentityStep.tsx` (and any other form step that supports doc-driven prefill):

- On mount of the form sub-step, if the relevant source document(s) for prefill exist (passport / ID for Identity, proof-of-address for address, etc.), fire the existing prefill API call automatically.
- **Do not overwrite fields that already have user-entered values** — only fill fields that are currently empty (or have not been user-edited; if there's already a "user touched" tracker for B-044, reuse it).
- If prefill is already in progress or already completed for this sub-step in this session, don't re-fire.

### 5.2 — Replace the clickable CTA with a passive banner

**Remove** the button "Fill from uploaded document" / its container. In its place, render a passive banner:

**When prefill ran successfully (≥1 field filled from doc):**

```
┌─────────────────────────────────────────────────────────────┐
│  ✨  Filled from uploaded document                          │
│      Values extracted from your passport / ID.              │
└─────────────────────────────────────────────────────────────┘
```

- Same blue-tinted style as the current CTA container.
- Sparkle icon (whatever icon is currently used on the CTA — keep visual continuity).
- **No click target**, no button. Pure indicator.

**When no source doc exists yet (e.g. user clicked "Upload later" in Batch 4):**

```
┌─────────────────────────────────────────────────────────────┐
│  ⓘ  Upload your passport or ID to auto-fill these fields.   │
└─────────────────────────────────────────────────────────────┘
```

- Neutral grey banner. No sparkle. Just a hint.

**When prefill fails (API error, doc OCR failed, etc.):**

```
┌─────────────────────────────────────────────────────────────┐
│  ⚠  Couldn't auto-fill from your document. Please enter     │
│      values manually.                                       │
└─────────────────────────────────────────────────────────────┘
```

- Light yellow warning style.

### 5.3 — Per-field ✨ icon (B-044) stays untouched

The existing per-field prefill icons from B-044 keep working as-is. They tell the user *which* fields were prefilled and let them inspect/override per field. The new screen-level banner is a higher-level summary — both coexist.

If a user manually edits a prefilled field, the per-field ✨ goes away (existing B-044 behavior). The screen-level banner can stay or fade — keep it visible to confirm the action happened, that's fine.

### 5.4 — Apply to all auto-fill capable forms

Audit each form step for doc-driven prefill capability:

- **Identity form** ← passport / ID
- **Address fields** ← proof of residential address (if extracted)
- **Financial form** ← bank reference letter / source of funds (if any field-level extraction is wired up today)

For any form sub-step that has prefill support, apply the same auto-trigger + passive banner pattern. If a form has no prefill source today, leave it untouched.

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
- **Don't introduce `any`.** Use `unknown` + cast if Supabase inference is wrong.
- **Reuse existing prefill API** in Batch 5 — do not write new endpoints. The current "Fill from uploaded document" button hits an endpoint already; just call it automatically.
- **Sub-step skipping**: if a category has zero docs configured for the role / template, skip its sub-step. Don't render an empty screen.
