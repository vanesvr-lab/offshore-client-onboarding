# B-143 — Filing representative must be an individual (not an organisation)

## Why

The "New Representative" dialog (forced-rep mode of `CreateProfileDialog`, opened from B-134's AddDirector flow or the "+ Add representative for KYC" button on the service detail page) currently lets the user pick **Individual** or **Organisation** as the Type. Conceptually wrong:

- A filing representative is a person who actually fills out KYC paperwork on behalf of a director.
- An organisation can't physically operate a form; only an individual person can.
- Even if the rep is acting on behalf of a corporate secretarial firm, the LOGIN account + form filler is still the human there.

Vanessa flagged this UX gap on the New Representative dialog screenshot. Fix: when `CreateProfileDialog` is in forced-rep mode (`forceIsRepresentative={true}` from B-134), hide the Type selector entirely and lock `record_type` to `"individual"` in the POST body.

## Out of scope (do NOT do in B-143)

- **The standalone Create Profile flow at `/admin/profiles`** — that path keeps the Individual / Organisation toggle visible since you can create corporate directors there. Only forced-rep mode locks to individual.
- **Existing organisation-typed representatives** — if any have been created (probably none yet since the feature shipped recently), they stay as-is. No data migration. If admins want to clean up, they can do it manually via the profiles page.
- **Other rep-related UX polish** — phone field, address fields, etc. stay as they are.

---

## Batch 1 — Lock forced-rep mode to Individual

### Update `src/components/admin/CreateProfileDialog.tsx`

The component already accepts a `forceIsRepresentative?: boolean` prop (from B-134). Two changes:

1. **Hide the Type selector** when `forceIsRepresentative === true`:

```tsx
{!forceIsRepresentative && (
  <div>
    <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
    <div className="flex gap-2">
      {(["individual", "organisation"] as const).map((t) => (
        <button … onClick={() => setRecordType(t)} … >{t}</button>
      ))}
    </div>
  </div>
)}
```

2. **Force the initial state + the POST body to `"individual"`** when in forced-rep mode:

```tsx
// Initial state — if forced, start as individual and ignore any prop default
const [recordType, setRecordType] = useState<"individual" | "organisation">(
  forceIsRepresentative ? "individual" : "individual"
);

// On submit (handleCreate), always send "individual" when forced
body: JSON.stringify({
  // … other fields …
  record_type: forceIsRepresentative ? "individual" : recordType,
  is_representative: forceIsRepresentative || isRepresentative,
  // … rest …
}),
```

This double-locks it: the UI hides the toggle, and the server-side body always sends `"individual"` regardless of any leftover state.

### Verification (Batch 1)

Manual:
1. On a service detail page, open AddDirector modal → check "Filed by a representative" → click "+ Add new representative".
2. The "New Representative" dialog opens. Confirm:
   - Title is "New Representative"
   - The "Type" selector with Individual / Organisation buttons is **gone**
   - Full Name, Email, Phone fields are visible
   - No "This is a representative" checkbox (already hidden by B-134's forced-rep mode)
3. Fill in name + email → click "Create Representative".
4. Inspect the resulting `client_profiles` row in the DB: `record_type = 'individual'`, `is_representative = true`.
5. Open `/admin/profiles` (the standalone profiles page) and click "+ Create Profile". This is NOT forced-rep mode. Confirm:
   - The Type selector IS visible (Individual / Organisation toggle)
   - The "This is a representative" checkbox IS visible
6. So forced-rep mode is the only path where Type is hidden.

### Commit message (Batch 1)

```
fix: representative must be individual, not organisation (B-143)

CreateProfileDialog's forced-rep mode (used by the "+ Add new
representative" inline create from AddDirector + the "+ Add
representative for KYC" affordance on the service detail page)
now hides the Type selector and locks record_type='individual'
in the POST body. Filing representatives are humans filling out
KYC paperwork on behalf of a director — they can't be
organisations.

The standalone Create Profile flow at /admin/profiles is unchanged
— you can still create corporate directors there.
```

---

## Batch 2 — CHANGES.md

### CHANGES.md

Top-of-file entry under `## B-143 — Representative must be individual (done YYYY-MM-DD)`. One-liner.

### Tech debt log

No new tech debt entries.

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure UI change.
2. **Per-batch commits:** two commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- Standalone `/admin/profiles` flow unchanged.
- No data migration for any organisation-typed reps that may already exist.
- No other rep dialog polish.
