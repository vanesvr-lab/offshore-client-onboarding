# B-121 — Pending items for tomorrow's brainstorm

Captured 2026-05-15 evening before Vanessa went to bed. Tomorrow's session: check B-120 status first, then start asking clarifying questions on each item below.

Not yet a finalized brief — each item needs questions answered before the brief gets written. Items are in capture order, not priority order; tomorrow we'll establish priority too.

## Items

### 1. People & KYC — "account of the local director"

Vanessa's exact phrasing: "I want to add the account of the local director."

Needs clarification — possible meanings:

- A new profile slot in the People & KYC section specifically for the local director (Mauritius regulatory requirement for many service types — local director is mandatory for GBC and others)
- An "Account" / "Account Manager" pill on the local-director profile card
- A field on the local-director profile capturing their account information (login? portal account? account number?)
- Something else

**First clarifying question tomorrow:** what does "account" mean in this context — is this about giving the local director portal access (so they can log in and complete their own KYC), about marking which profile IS the local director (a role flag), or about something accounting-related?

### 2. Move Status card to 3rd slot in right rail

After B-120's Progress-first reorder, the rail will be:

```
1. Progress Meters card
2. View Summary button
3. Pending card
4. Status card
5. Communications card
6. Milestones card
7. Audit Trail
```

She wants Status to move to slot 3:

```
1. Progress Meters card
2. View Summary button
3. Status card           ← moved here
4. Pending card
5. Communications card
6. Milestones card
7. Audit Trail
```

Straightforward 5-line JSX shuffle. No clarification needed; can go straight into the B-121 brief as a small batch.

### 3. Card border consistency

Milestones card and Audit Trail card don't match the border color/style of the top right-rail cards (Progress, View Summary, Pending, Status, Communications). Standardize all right-rail cards to use the same border treatment.

**First clarifying question tomorrow:** what's the desired border treatment — match the lightest current border, or pick a specific Tailwind class (e.g., `border-gray-200`)? Probably easy to lock in once we see them side-by-side.

### 4. "View All" emails popup width

The "View All" affordance on the Communications card opens a list of all emails (separate from the single-email dialog widened in B-119). She wants this list view popup to be wider too so each email row can show more detail (subject + truncated body preview + sender + recipient + sent date all on one row).

**First clarifying question tomorrow:** width target — same +25% bump as the single-email dialog (B-119), or larger? And: any specific fields she wants surfaced in the wider row (since we have more horizontal room)?

### 5. Review Wizard — Actions section bleeding into subsections (B-119 regression)

Vanessa's exact phrasing: "that new action section that we added is showing up on all the subsections now in the review."

The Review Wizard is the focused-review mode on `/admin/services/[id]` (the gate around B-102 hides the stage strip / step indicator / right rail / admin extras when active — see `ServiceDetailClient.tsx:3577+`). After B-119 promoted Actions to a top-level section, it's rendering inside every subsection in the Review Wizard, which it shouldn't.

Most likely cause: the new `ServiceActionsSection` is being unconditionally rendered alongside the per-subsection review content, instead of being scoped to its own step like the other top-level sections. Should be hidden inside Review Wizard, or scoped to its own step like Company Setup / Financial / Banking / People KYC / Documents.

**First clarifying question tomorrow:** in Review Wizard, do you want Actions to (a) be a reviewable step on its own (like the other 5 top-level sections), or (b) be hidden from Review Wizard entirely (review only verifies KYC + Documents work; Actions are operational not compliance)?

Probably (a) for consistency, but worth confirming. After answering, this is a bug-fix more than a design item — should be the **first batch** of the B-121 brief because it's a regression and quick to fix.

## Tomorrow's flow

1. Check B-120 status (`git log --oneline -10`, look for the four B-120 batch commits + the migration in `db:status`).
2. If B-120 is done, archive its completion in CHANGES.md if not already.
3. Start brainstorm on the four items above, **one question at a time** per Vanessa's preferred cadence.
4. Default order to ask in: (1) Review-Wizard Actions regression — bug, quick fix; (2) People/KYC local director — the meatiest, needs unblocking; (3) View All width — small, quick lock-in; (4) Border consistency — small; (5) Status card reorder — already locked, just goes into the brief.
5. Once all five are designed, write the B-121 brief.
