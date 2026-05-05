# B-061 — Sync stale useState(prop) patterns so autosaves don't wipe DB values

## Why

Real-device QA on the per-person KYC wizard found that manual address
edits for Bruce Banner were being saved correctly to the DB
(updated_at advanced, response showed populated columns) but were
then wiped within 30-60 seconds by a follow-on autosave that sent the
fields as `null`.

Root cause: two `useState(prop)` anti-patterns where local state is
seeded from a prop on first mount and never re-syncs when the prop
changes.

After B-058 §6.2 added `router.refresh()` to `handleExitKycReview`,
the parent server component re-fetches `persons`. The new prop value
arrives at the client tree, but:

1. **[`ServiceWizardPeopleStep.tsx:906`](src/components/client/ServiceWizardPeopleStep.tsx:906)**
   — `const [persons, setPersons] = useState<ServicePerson[]>(initialPersons)`
   keeps the stale persons array. When the user re-enters a person's
   review, `reviewingPerson` is sourced from this stale state.
2. **[`PerPersonReviewWizard.tsx:558,562`](src/components/client/PerPersonReviewWizard.tsx:558)**
   — `initialKycRecord = useMemo(() => mapToKycRecord(reviewingPerson), …)`
   then `useState(initialKycRecord)` for `form`. Because
   `reviewingPerson` was stale, `initialKycRecord` is stale, and
   `form` initializes from stale data on remount. A subsequent
   autosave then sends those stale nulls back to the DB.

Result: the user's typed values persist in the DB for ~30-60s, then
disappear when the autosave-with-stale-state fires.

## Scope

- **In**: the two `useState(prop)` sites above plus an autosave-aware
  sync guard so we don't blow away in-flight user edits during a
  router.refresh().
- **Out**: the autosave throttling, the form's field-level state, the
  router.refresh placements (those are correct — the bug is downstream
  of them).

## Working agreement

Single batch. Two files. No DB changes. Commit, push, update CHANGES.md.
After CLI finishes, restart the dev server per CLAUDE.md (state
patterns are touchy; .next cache can hold stale references).

---

## Step 1 — Sync `persons` with `initialPersons` prop changes

**File**: [`src/components/client/ServiceWizardPeopleStep.tsx:906`](src/components/client/ServiceWizardPeopleStep.tsx:906)

Current:

```tsx
const [persons, setPersons] = useState<ServicePerson[]>(initialPersons);
```

Add a `useEffect` to keep state aligned with the prop. Persons data
is server-derived; client edits go through API calls that flush to
the server, so the latest `initialPersons` is authoritative.

```tsx
const [persons, setPersons] = useState<ServicePerson[]>(initialPersons);

// Sync with server-fetched persons after router.refresh(). The
// initialPersons prop is the source of truth — local edits via
// onPersonsChange already round-trip through the server, so syncing
// can't drop unsaved user state.
useEffect(() => {
  setPersons(initialPersons);
}, [initialPersons]);
```

Note: `initialPersons` is a new array reference every server render,
so this effect fires on every refresh. That's intentional. The
identity check inside React's setState will skip the re-render if the
content is structurally equal — no perf concern.

---

## Step 2 — Sync `form` with `initialKycRecord` prop changes (with autosave guard)

**File**: [`src/components/client/PerPersonReviewWizard.tsx:558-714`](src/components/client/PerPersonReviewWizard.tsx:558)

This one is more delicate. The `form` state holds the user's
in-flight edits. If we naively sync from the prop on every change,
we'd blow away typing-in-progress.

The right pattern: sync ONLY when the autosave is idle. If a save is
in flight, defer until it completes — by then the server data
includes the user's edits, so a sync is safe.

Replace lines 558-565:

```tsx
const initialKycRecord = useMemo(() => mapToKycRecord(reviewingPerson), [reviewingPerson]);
const kycRecordId = initialKycRecord.id;

const [form, setForm] = useState<Partial<KycRecord>>(initialKycRecord);
const handleFormChange = useCallback((fields: Partial<KycRecord>) => {
  setForm((prev) => ({ ...prev, ...fields }));
}, []);
```

With:

```tsx
const initialKycRecord = useMemo(() => mapToKycRecord(reviewingPerson), [reviewingPerson]);
const kycRecordId = initialKycRecord.id;

const [form, setForm] = useState<Partial<KycRecord>>(initialKycRecord);
const handleFormChange = useCallback((fields: Partial<KycRecord>) => {
  setForm((prev) => ({ ...prev, ...fields }));
}, []);

// Sync form from the latest server-derived initialKycRecord, but only
// when no save is in-flight — otherwise user edits in `form` are
// fresher than the server snapshot and a sync would discard them.
useEffect(() => {
  // The autosave hook is declared further down; reference it via ref
  // to avoid an order-of-declaration issue. See setup of `autosaveStateRef`.
  if (autosaveStateRef.current === "saving" || autosaveStateRef.current === "retrying") {
    return;
  }
  setForm(initialKycRecord);
}, [initialKycRecord]);
```

Then below the existing `const autosave = useAutosave();` line (around
line 711), wire the ref:

```tsx
const autosave = useAutosave();
const autosaveStateRef = useRef(autosave.state);
useEffect(() => {
  autosaveStateRef.current = autosave.state;
}, [autosave.state]);
```

The `autosaveStateRef` mirrors the latest autosave state without
becoming a dependency of the sync effect — so the sync effect doesn't
re-run on every save state transition. It only fires when
`initialKycRecord` changes.

The combined behavior:
- New person OR refreshed `reviewingPerson` data lands in the parent
  → `initialKycRecord` recomputes → sync effect fires.
- If autosave is idle, form syncs to the server snapshot.
- If autosave is mid-save, the sync is skipped this tick. When the
  save completes, the parent will re-render with even-fresher data
  (including the user's just-saved edits) and the sync will run on
  the next refresh cycle.

---

## Step 3 — Verification

1. **Restart dev server** (CLAUDE.md):
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```

2. **Reproduce the original bug scenario**:
   - Open the People step for GBC-0002.
   - Click "Review Bruce Banner" → land in his per-person KYC.
   - Navigate to the Address sub-step.
   - Type a complete address (Address line 1, City, State, Postal
     code, Country).
   - Click Next → autosave fires → values saved.
   - Click Back to People → exits the wizard.
   - Verify in Supabase or via curl that
     `client_profile_kyc.address_line_1` (and the other address
     columns) are populated for Bruce's record.
   - Wait 60 seconds.
   - **Re-query the DB.** Expected: address fields STILL populated.
     Before this batch they would have been wiped within 30-60s.

3. **Re-enter the wizard** without navigating:
   - From the People list, click "Review Bruce Banner" again.
   - Navigate to Address sub-step.
   - Expected: form fields show the values you typed (not empty).

4. **Toggle a role on Bruce** (e.g., add UBO) → router.refresh fires
   per B-058 §5 → expected: PersonCard count updates AND the form
   state in the open wizard isn't disrupted (still showing Bruce's
   address values).

5. **Concurrent edit + refresh test**:
   - Open the Address sub-step, start typing an address.
   - Mid-type, simulate a router.refresh by toggling Bruce's role
     from another tab (or just open dev tools and call `router.refresh()`
     manually if accessible).
   - Expected: your typing isn't lost. The autosave fires when you
     blur, your typed values land, the next refresh pulls the saved
     values.

6. **`npm run lint && npm run build && npm test`** — all green.

---

## CHANGES.md

```markdown
### 2026-05-XX — B-061 — Sync useState(prop) patterns so autosaves don't wipe values (Claude Code)

Fixes a class of "data appears saved then disappears 30-60s later"
bugs caused by two stale-prop state patterns:

- `ServiceWizardPeopleStep.persons` (line 906): now syncs with
  `initialPersons` prop on every change. Previously useState only
  used the prop on first mount, so server data fetched via
  `router.refresh()` (added in B-058) never propagated. This made
  re-entering a person's wizard supply stale `reviewingPerson` data
  to the wizard.
- `PerPersonReviewWizard.form` (line 562): now syncs with
  `initialKycRecord` prop changes, BUT only when the autosave is
  idle. The guard prevents in-flight user edits from being
  overwritten by a stale server snapshot during the brief window
  between user typing and the save completing. The
  `autosaveStateRef` pattern keeps the sync effect from re-running
  on every save-state transition.

Net effect: an edit → save → exit → re-enter cycle no longer
involves form state initialized from pre-edit data. Subsequent
autosaves send the user's saved values, not the stale nulls.

UI / state only. No DB changes.
```

---

## Things to flag to the user

- No DB migrations.
- This batch fixes a STATE bug — values that were already wiped from
  the DB (e.g., Bruce's address from earlier QA) won't come back. The
  user will need to re-enter them once. The fix prevents NEW wipes.
- `useState(prop)` is a common React anti-pattern; if you spot more
  instances during the audit (`grep -n 'useState(initial' src/`),
  flag them but don't fix them in this batch — keep scope tight.

## Rollback

`git revert` the single commit. Pure code change.
