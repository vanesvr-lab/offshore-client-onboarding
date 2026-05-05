# B-062 — Fix the form-state wipe introduced by B-061's form-sync useEffect

## Why

B-061 added a `useEffect` that syncs `PerPersonReviewWizard`'s `form`
state to `initialKycRecord` whenever `initialKycRecord` changes (with
an autosave-state guard). The intent was to pull fresh server data
into the form after `router.refresh()`. The unintended side effect:
the sync overwrites in-memory form state when `initialKycRecord` is
stale (e.g., briefly between wizard remount and the server refetch
landing).

Real-device QA (2026-05-05 14:54-14:55 UTC):

1. User typed Bruce's address.
2. Two saves fired with values (network trace confirms). DB had
   values at 14:54:09. ✓
3. User clicked Save & Close → `handleKycComplete` →
   `router.refresh()` + unmount.
4. User clicked Review Bruce → wizard remounted. `persons` state
   was still stale (router.refresh hadn't propagated the new
   `initialPersons` yet) → `initialKycRecord` had null address →
   form initialized with nulls.
5. The sync useEffect (autosave idle) re-affirmed the null form
   state.
6. A subsequent save (likely from a Back/Next click or another
   effect) sent the null form → DB wiped at 14:55:23.

The fix: drop the sync useEffect entirely. Replace the data-staleness
problem with a remount strategy — when the kyc data updates on the
server, force the wizard to remount so `useState(initialKycRecord)`
takes the fresh value naturally.

## Scope

- **In**: revert the form-sync useEffect in
  `PerPersonReviewWizard.tsx` (B-061 §2). Add a kyc-`updated_at` key
  to the wizard mount in `ServiceWizardPeopleStep.tsx` so it
  remounts when the server kyc data changes.
- **Out**: the persons sync useEffect from B-061 §1 — that one is
  correct and stays. The `router.refresh()` calls from B-058 also
  stay.

## Working agreement

Single batch. Two files. No DB changes. Commit, push, update
CHANGES.md. After CLI finishes, restart the dev server.

---

## Step 1 — Remove the form-sync useEffect

**File**: [`src/components/client/PerPersonReviewWizard.tsx`](src/components/client/PerPersonReviewWizard.tsx)

Find and DELETE this block (lines roughly 567-580 — the exact line
numbers may have shifted; search for `// Sync form from the latest
server-derived initialKycRecord` to locate it):

```tsx
// Sync form from the latest server-derived initialKycRecord, but only
// when no save is in-flight — otherwise user edits in `form` are
// fresher than the server snapshot and a sync would discard them.
// autosaveStateRef is wired below the `useAutosave()` declaration so
// this effect can read the latest state without taking it as a dep.
useEffect(() => {
  if (
    autosaveStateRef.current === "saving" ||
    autosaveStateRef.current === "retrying"
  ) {
    return;
  }
  setForm(initialKycRecord);
}, [initialKycRecord]);
```

Also DELETE the `autosaveStateRef` setup that was added below the
`useAutosave()` declaration (search for `autosaveStateRef = useRef`):

```tsx
const autosaveStateRef = useRef(autosave.state);
useEffect(() => {
  autosaveStateRef.current = autosave.state;
}, [autosave.state]);
```

The `form` state goes back to being initialized once on mount via
`useState(initialKycRecord)` and only updated by user edits via
`handleFormChange`. No automatic sync.

---

## Step 2 — Force wizard remount when kyc data changes

**File**: [`src/components/client/ServiceWizardPeopleStep.tsx`](src/components/client/ServiceWizardPeopleStep.tsx)

Find the `<PerPersonReviewWizard key={reviewingPerson.id}` mount
(currently around line 1083-1084). Replace the key to include the
kyc-record's `updated_at`:

```tsx
<PerPersonReviewWizard
  key={`${reviewingPerson.id}-${
    (reviewingPerson.client_profiles?.client_profile_kyc as { updated_at?: string } | null)?.updated_at ?? "init"
  }`}
  ...
```

What this does:
- When the user opens the wizard, the key is `<role-id>-<kyc-updated_at>`.
- If the server-side data refreshes and the kyc's `updated_at`
  advances (e.g., after the user typed and saved), the key changes
  → React unmounts the old wizard and mounts a fresh one.
- Fresh mount → `useState(initialKycRecord)` initializes form with
  the latest server data. No stale state.
- During typing (no save yet), `updated_at` doesn't change → no
  remount → form state preserved.
- After a save lands and `router.refresh()` fetches new data with
  a new `updated_at` → remount with fresh values.

The "init" fallback covers the case where a person has no kyc record
yet — the key is stable until one is created.

---

## Step 3 — Verification

1. **Restart dev server** (CLAUDE.md):
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```

2. **Reproduce the bug scenario from B-061's incomplete fix**:
   - Open Bruce's KYC review → navigate to Address sub-step.
   - Type a complete address.
   - Click Next.
   - Verify in DB: `address_line_1` and others are populated.
   - Click Save & Close (or finish the walk).
   - Wait 5-10 seconds.
   - Re-query the DB. **Expected: address fields STILL populated.**
     The wipe pattern from B-061 is gone.
   - Click Review Bruce again.
   - Navigate to Address sub-step.
   - Form should show the address values you typed (not empty).
     The remount via the new key pulls in the latest server data.

3. **Edge case — type then refresh mid-typing**:
   - Open Bruce's wizard, type partial address.
   - From a separate browser tab, toggle a role on Bruce (forces
     `router.refresh()` and a kyc data fetch).
   - Original tab: typing is preserved (kyc `updated_at` didn't
     change because no save happened, so no remount).
   - Click Next on the original tab → save fires with the typed
     values → DB has them.
   - DB now reflects new `updated_at`, wizard would remount on
     next interaction.

4. **Run full test suite**:
   ```
   npm run lint && npm run build && npm test
   ```

---

## CHANGES.md

```markdown
### 2026-05-XX — B-062 — Fix form-state wipe introduced by B-061 (Claude Code)

B-061's form-sync useEffect was overwriting `PerPersonReviewWizard`'s
`form` state with stale `initialKycRecord` data after a wizard
remount-then-server-refetch race. Symptom: user typed Bruce's
address, clicked Save & Close (DB had values), opened Bruce again,
and a follow-on save wiped the DB within ~74 seconds.

Replaced the buggy sync mechanism with a remount strategy:

- Removed the form-sync useEffect and `autosaveStateRef` wiring from
  `PerPersonReviewWizard.tsx`. Form state goes back to mount-time
  initialization via `useState(initialKycRecord)`, updated only by
  user edits via `handleFormChange`.
- Added the kyc record's `updated_at` to the
  `<PerPersonReviewWizard>` key in `ServiceWizardPeopleStep.tsx`.
  When the server-side data refetch lands (post-save router.refresh),
  the key changes, React remounts the wizard, and
  `useState(initialKycRecord)` picks up the fresh values naturally.
  Typing in progress is preserved because `updated_at` doesn't
  advance until a save commits.

The persons sync useEffect from B-061 §1 stays — it correctly
propagates fresh persons data after `router.refresh()`.

UI / state only. No DB changes.
```

---

## Things to flag to the user

- No DB migrations.
- This batch REVERTS part of B-061. The persons sync from B-061 stays.
- After deploy, hard-refresh the prod tab to ensure the JS bundle
  updates. Stale browser cache will still run the old (buggy) code.

## Rollback

`git revert` this single commit. Will re-instate the B-061 form-sync
useEffect (which is buggy) — so the rollback path leaves the codebase
in a worse state than before B-062. If you do roll back, plan to ALSO
revert B-061 (`git revert 2bac62a`).
