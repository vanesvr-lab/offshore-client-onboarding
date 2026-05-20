# B-148 — Last profile reviewed → "Continue to Documents" advances the wizard

## Why

In the Review/Update Wizard's People & KYC step (step 3), when admin is iterating through profiles (after clicking the B-146 "Review Profiles (N)" entry), the bottom-nav Next button reads `"Next Profile"`. On the **last** profile, that button becomes disabled because there's no next profile to go to — leaving admin without a visible path to advance to step 4 (Documents). Today they have to click "Back to list" + then Next, which is awkward.

Fix: when admin is on the last profile in the iteration, change the Next button's label to **"Continue to Documents"** and its click behavior to advance the wizard one step instead of attempting to iterate to a non-existent next profile.

## Out of scope (do NOT do in B-148)

- **Auto-advance on Mark Profile Reviewed.** Vanessa explicitly asked for a user-driven button, not auto. Mark Profile Reviewed stays the same on the last profile (saves the review + stays in profile view).
- **"Skip to Documents" affordance from earlier profiles.** Only the LAST profile gets the "Continue to Documents" treatment. From profile 1 of 3, admin still has to iterate through 2 and 3 (or use Back to list).
- **Generic "next step" support.** The label is hardcoded "Continue to Documents" since Documents is always step 4 after the B-146 5-step layout. If the wizard structure changes again (Documents moves, gets dropped, etc.), this label would need adjusting then.

---

## Batch 1 — Conditional Next button on last profile

### Locate the bottom-nav button logic

In `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`, `ReviewWizardBottomNav` (around lines 4625-4800 after B-146):

```tsx
const nextLabel = profileSubstep
  ? "Next Profile"
  : isLastStep
    ? "Finish"
    : "Next";

const nextDisabled = advancing
  || (profileSubstep ? profileSubstep.profileIndex >= totalProfilesInStep - 1 : false);
```

The `nextDisabled` check on the last profile is what makes the button dead-end today.

### The fix

Add an explicit "on last profile" branch:

```tsx
const isLastProfile =
  !!profileSubstep && profileSubstep.profileIndex >= totalProfilesInStep - 1;

const nextLabel = profileSubstep
  ? isLastProfile
    ? "Continue to Documents"
    : "Next Profile"
  : isLastStep
    ? "Finish"
    : "Next";

const nextDisabled = advancing
  || (profileSubstep && !isLastProfile && profileSubstep.profileIndex >= totalProfilesInStep - 1);
  // Note: the && !isLastProfile is now redundant given the outer check, but
  // keep the structure obvious: never disable on last-profile because the
  // button has different semantics there.
```

Simpler refactor — drop the redundant check:

```tsx
const nextDisabled = advancing
  || (profileSubstep && !isLastProfile
       ? profileSubstep.profileIndex >= totalProfilesInStep - 1
       : false);
```

And the click handler:

```ts
async function handleNext() {
  if (profileSubstep && !isLastProfile) {
    profileSubstep.onNextProfile();
    return;
  }
  if (profileSubstep && isLastProfile) {
    // Advance the wizard out of profile substep and on to the next step
    // (step 4 = Documents in the post-B-146 layout).
    await goTo(step + 1);
    return;
  }
  await goTo(step + 1);
}
```

The `goTo(step + 1)` call advances the wizard from step 3 (People & KYC) to step 4 (Documents). `goTo` already handles URL replace + clearing the `?profile=...` param (verify; if it doesn't, add the param removal). The router replace strips query params by default when only `?step=4` is set, so the profile substep is naturally exited.

### Verification (Batch 1)

Manual:
1. Open the Review/Update Wizard on a service with 2+ profiles. Click "Review Profiles (N)" to enter the iteration.
2. On profile 1 of N: Next button reads "Next Profile" → clicking goes to profile 2.
3. On profile N of N (last one): Next button reads **"Continue to Documents"** and is **clickable**.
4. Click "Continue to Documents" → wizard advances to step 4 (Documents). The profile substep is exited.
5. As a sanity check: on a service with only ONE profile attached, "Review Profiles (1)" → first (and only) profile → Next reads "Continue to Documents" immediately. Click → advances to step 4.
6. From Documents step, Previous goes back to step 3 (People & KYC) in list view (not into a specific profile).

### Commit message (Batch 1)

```
feat: last profile's Next button → "Continue to Documents" (B-148)

When iterating profiles via the B-146 "Review Profiles (N)" entry,
the Next button on the last profile previously sat disabled,
forcing admins to click "Back to list" + Next to advance. Now the
label flips to "Continue to Documents" and clicking it advances
the wizard to step 4 (Documents) — exiting the profile substep
naturally. From the first to the second-last profile, the button
still reads "Next Profile" with iteration semantics unchanged.
```

---

## Batch 2 — CHANGES.md

### CHANGES.md

Top-of-file entry under `## B-148 — Last-profile advance to Documents (done YYYY-MM-DD)`. One-liner; references B-146 as parent.

### Tech debt log

No new entries.

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure UI logic change.
2. **Per-batch commits:** two commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No auto-advance on Mark Profile Reviewed.
- No skip-to-Documents from earlier profiles.
- No generic "next step" label support — hardcoded "Continue to Documents" since the B-146 wizard layout has Documents as step 4 always.
