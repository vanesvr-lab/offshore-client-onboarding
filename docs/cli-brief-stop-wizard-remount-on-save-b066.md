# B-066 — Stop the wizard from remounting (and snapping to step 1) on every save

## Why

Symptom: every time the user changes anything in the per-person KYC
wizard and clicks Next/Save & Close, the wizard jumps back to the
first sub-step.

Cause: the interaction between B-062 and B-065.

- B-062 added a React `key` to `<PerPersonReviewWizard>` that
  includes `kyc.updated_at`, designed to force a remount when server
  data changes.
- B-065 made `saveKycForm` patch local `persons` state with the
  fresh kyc record from the save response — including its new
  `updated_at`.
- Net effect: every successful save changes `kyc.updated_at` →
  changes the key → React unmounts the wizard and mounts a fresh
  one. The fresh mount initializes `subStepIndex` back to 0.

B-062's purpose (reset internal wizard state when server data
refreshes) is now redundant. B-063's architecture computes `form`
from `serverFormData + overlay` on every render — no remount needed
to pick up fresh data. B-065's local state patching already keeps
the displayed data fresh.

The fix: drop `kyc.updated_at` from the key. Keep only the
`reviewingPerson.id` (the role row id) so the wizard remounts ONLY
when the user switches to a different person — exactly what we want.

## Scope

- **In**: the `<PerPersonReviewWizard>` mount key in
  `ServiceWizardPeopleStep.tsx`. One line.
- **Out**: anything else.

## Working agreement

Tiny batch. One file. No DB changes. Restart dev server after
implementing.

---

## Step 1 — Simplify the wizard mount key

**File**: [`src/components/client/ServiceWizardPeopleStep.tsx`](src/components/client/ServiceWizardPeopleStep.tsx)
around line 1083-1085.

Current:

```tsx
<PerPersonReviewWizard
  key={`${reviewingPerson.id}-${
    (reviewingPerson.client_profiles?.client_profile_kyc as { updated_at?: string } | null)?.updated_at ?? "init"
  }`}
```

Replace with:

```tsx
<PerPersonReviewWizard
  key={reviewingPerson.id}
```

That's it. The wizard now remounts only when `reviewingPerson.id`
changes — i.e., when the user switches to a different person via
"Review KYC" or the review-walk navigation. Saves on the same person
no longer trigger remount; the user stays on whatever sub-step they
were on, and B-063 + B-065 keep the form data fresh in place.

## Step 2 — Verification

1. **Restart dev server** (CLAUDE.md):
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```

2. **Re-test the user's flow**:
   - Open Bruce's KYC → navigate to Address sub-step (sub-step 3 or
     similar — not the first).
   - Type address values.
   - Click Next. Expected:
     - Save fires (DB has values per B-063/B-065).
     - Wizard advances to the NEXT sub-step (Financial, or whatever
       comes after Address).
     - Wizard does NOT jump back to the first sub-step.
   - Type a Financial field. Click Save & Close.
     - Wizard exits cleanly.
   - Re-open Bruce → navigate to Address. Expected: shows the values
     you typed (B-063/B-065 architecture).

3. **Switch persons mid-walk**:
   - From Bruce's review walk, click "Review KYC" on a different
     person. Expected: wizard remounts (different `reviewingPerson.id`
     → key changed) and starts on the first sub-step. This is the
     intended behavior — switching people resets context.

4. **Run the full test suite**:
   ```
   npm run lint && npm run build && npm test
   ```

---

## CHANGES.md

```markdown
### 2026-05-XX — B-066 — Stop wizard from remounting on every save (Claude Code)

B-062 added `kyc.updated_at` to the wizard's mount key to force a
remount when server data changes. After B-063 (form-state arch) and
B-065 (onSaveSuccess patches persons state), the key change happens
on EVERY save — making the wizard snap back to the first sub-step
every time the user clicks Next. Annoying.

Removed the `updated_at` portion of the key. Wizard now remounts
only when `reviewingPerson.id` changes (i.e., switching to a
different person). Saves on the same person preserve sub-step
position; B-063's overlay-based form computation and B-065's
response-based persons patching keep the displayed data fresh
without needing a remount.

UI / state only. No DB changes.
```

---

## Things to flag to the user

- No DB migrations.
- After deploy, hard-refresh the prod tab once to drop the old JS
  bundle.

## Rollback

`git revert` the single commit. Restores the `updated_at` portion
of the key and the snap-to-first-step behavior.
