# B-065 — Instant local-state update from save response (no more stale cache after save)

## Why

B-063 fixed the autosave-wipes-data bug. But the user reports a
follow-on UX issue: after a successful Save & Close, the People list
and re-opened wizard show stale (cached) data until a manual hard
refresh. `router.refresh()` is called but the actual UI update lags —
the user sees the OLD `client_profile_kyc` values for several seconds
or until they hard-refresh.

Three causes layered together:
1. `router.refresh()` re-fetches the server component asynchronously
   — there's a window where the client tree is still using stale
   `initialPersons` props.
2. `ServiceWizardPeopleStep` keeps `persons` in `useState`. The B-061
   sync effect updates it from `initialPersons`, but only AFTER a
   re-render — so for a moment the UI shows pre-refresh data.
3. Vercel/Next.js can cache the route's HTML aggressively;
   `router.refresh()` doesn't always bust the browser cache.

The fix: when a save succeeds, **use the API response to update local
state immediately**. The save endpoint already returns the updated
`client_profile_kyc` record. We can splice it into the parent's
`persons` state synchronously. The user sees fresh data the instant
the save resolves — no waiting on `router.refresh()` or cache busts.
Router.refresh still fires for completeness (so other things like
counts on the dashboard refresh too).

## Scope

- **In**: `saveKycForm` returns the saved record; a new
  `onSaveSuccess` callback prop on `PerPersonReviewWizard`;
  `ServiceWizardPeopleStep` handles it by updating local `persons`.
- **Out**: changing the API contract (`/api/profiles/kyc/save`
  already returns the updated record); changing other parts of the
  page that don't touch this flow.

## Working agreement

Single batch. Two files. No DB changes. Restart dev server after
implementing per CLAUDE.md.

---

## Step 1 — `saveKycForm` returns the saved record

**File**: [`src/components/client/PerPersonReviewWizard.tsx`](src/components/client/PerPersonReviewWizard.tsx)
around line 736.

Current (post B-063):

```tsx
const saveKycForm = useCallback(async (): Promise<boolean> => {
  if (!kycRecordId) return true;
  const pending = overlayRef.current;
  if (Object.keys(pending).length === 0) return true;
  return autosave.save(async () => {
    try {
      const res = await fetch("/api/profiles/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId, fields: pending }),
      });
      if (!res.ok) return false;
      return true;
    } catch {
      return false;
    }
  });
}, [kycRecordId, autosave]);
```

Replace with:

```tsx
const saveKycForm = useCallback(async (): Promise<boolean> => {
  if (!kycRecordId) return true;
  const pending = overlayRef.current;
  if (Object.keys(pending).length === 0) return true;

  return autosave.save(async () => {
    try {
      const res = await fetch("/api/profiles/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId, fields: pending }),
      });
      if (!res.ok) return false;
      // The route returns `{ record: <updated client_profile_kyc> }`.
      // Hand it to the parent so it can patch local state immediately,
      // avoiding the router.refresh() lag.
      const data = (await res.json()) as { record?: Record<string, unknown> };
      if (data?.record && onSaveSuccess) {
        onSaveSuccess(data.record);
      }
      return true;
    } catch {
      return false;
    }
  });
}, [kycRecordId, autosave, onSaveSuccess]);
```

Add `onSaveSuccess?: (updatedKyc: Record<string, unknown>) => void`
to the component's `Props` interface (find the existing interface
declaration — likely around line 510-525 — and add the optional prop).

---

## Step 2 — `ServiceWizardPeopleStep` patches `persons` from the response

**File**: [`src/components/client/ServiceWizardPeopleStep.tsx`](src/components/client/ServiceWizardPeopleStep.tsx)

Find the `<PerPersonReviewWizard ... />` render site (line ~1083).

Add an `onSaveSuccess` handler that splices the updated kyc record
into the local `persons` state:

```tsx
<PerPersonReviewWizard
  key={...existing key...}
  serviceId={serviceId}
  reviewingPerson={reviewingPerson}
  ...other props...
  onSaveSuccess={(updatedKyc) => {
    setPersons((prev) =>
      prev.map((p) => {
        if (p.client_profiles?.id !== profileId) return p;
        return {
          ...p,
          client_profiles: {
            ...p.client_profiles,
            client_profile_kyc: updatedKyc,
          },
        };
      })
    );
  }}
  onComplete={handleKycComplete}
  ...
/>
```

This finds every role row for the same profile (`profileId` is
already in scope via `const profileId = reviewingPerson.client_profiles?.id`)
and updates each one's `client_profile_kyc` with the fresh record.

Subsequent renders see the fresh data immediately. The B-063
`serverFormData` recomputes from the new prop, the form view shows
the latest values without waiting on `router.refresh`.

---

## Step 3 — Keep `router.refresh()` as the secondary cache-bust

The existing `router.refresh()` calls in `handleKycComplete`,
`handleExitKycReview`, etc. STAY. Their job now is:
- Refresh the dashboard's KYC % counts
- Bust Next.js's server component cache for other pages
- Ensure that if the user navigates somewhere else, that page also
  has fresh data

The instant local-state update from Step 2 covers the immediate UI;
`router.refresh` covers the rest of the tree.

---

## Step 4 — Verification

1. **Restart dev server** (CLAUDE.md):
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```

2. **Reproduce the user's flow**:
   - Open a person's KYC → Address sub-step.
   - Type address values → click Save & Close.
   - Wizard exits, lands on People list.
   - **Without hard-refreshing**, click Review on the same person.
   - Navigate to Address. Expected: fields show the values you just
     typed. NO need to hard-refresh.
   - Verify in DB: values are persisted (per B-063 already).

3. **Multi-step typing**:
   - On Address sub-step, type values → click Next → land on
     Financial sub-step. Expected: address values are saved (per
     B-063 partial-payload).
   - Type a Financial field → click Next.
   - Click breadcrumb back to Address. Expected: shows your typed
     address (from local state — B-063's overlay still has it OR the
     reconciled server data does).

4. **Navigate away to another person and back**:
   - Click Save & Close on Bruce. Click Review KYC on a different
     person, then navigate back to Bruce. Expected: Bruce's values
     are visible immediately.

5. **Network monkey-patch test** — confirm the save response is
   returning the full record:
   ```js
   (()=>{const o=window.fetch;window.fetch=async(...a)=>{const r=await o(...a);const u=typeof a[0]==='string'?a[0]:a[0]?.url;if(u?.includes('/api/profiles/kyc/save')){const c=r.clone();c.text().then(t=>console.log('SAVE RESP:',t.slice(0,500)));}return r;};console.log('Patched.');})();
   ```
   Type a field, click Next, see `SAVE RESP: {"record": {...}}` in
   console. The record contains all kyc columns including the field
   you just edited.

6. **`npm run lint && npm run build && npm test`** — all green.

---

## CHANGES.md

```markdown
### 2026-05-XX — B-065 — Instant local-state update after KYC save (Claude Code)

After B-063 fixed the data-wiping bug, the user reported a UX
follow-on: after Save & Close, the People list / re-opened wizard
showed stale data until a manual hard refresh. Cause was the
asynchronous router.refresh() lag combined with aggressive Next.js
HTML caching.

Fix: use the save endpoint's response to update local state
immediately, eliminating the wait.

- `saveKycForm` in `PerPersonReviewWizard.tsx` now reads the API
  response (which already returns the updated client_profile_kyc
  record) and calls a new `onSaveSuccess` prop with it.
- `ServiceWizardPeopleStep.tsx` passes an `onSaveSuccess` handler
  that splices the updated kyc record into local `persons` state for
  every role row belonging to that profile. Subsequent renders see
  fresh data instantly — no router.refresh lag.
- `router.refresh()` calls remain in place as the secondary
  cache-bust for other UI surfaces (dashboard counts, etc.).

UI / state only. No DB or API contract changes.
```

---

## Things to flag to the user

- No DB migrations or API changes.
- The save endpoint's response shape was already
  `{ record: <updated kyc> }` — we're just using it now.
- After deploy, hard-refresh the prod tab once to drop the old JS
  bundle. Subsequent saves should not require any further hard
  refreshes.

## Rollback

`git revert` the single commit. Falls back to relying on
`router.refresh()` only — same UX problem the user reported.
