# B-063 — Re-architect KYC form state: server-derived + optimistic overlay

## Why

The autosave-wipes-data bug class has survived B-061 and B-062. Real
reproduction (2026-05-05 14:55 UTC): user types Bruce's address →
clicks Save & Close → DB has values briefly → DB null again 74s later.

Root cause is structural, not a single line: the wizard maintains a
local `form: useState<Partial<KycRecord>>(initialKycRecord)` that's
seeded from props once on mount, plus a `saveKycForm` that sends the
**entire** form snapshot on every save. Any path that resets `form`
to stale data — remount races, prop syncs that misfire, etc. — turns
the next save into a multi-field overwrite that wipes other fields
the user previously saved.

The user's directive: "Re-architect form state to be derived from
server data without local useState — read from props directly, write
through API + optimistic updates." This batch implements that.

## The new pattern

```
serverFormData    ← derived from reviewingPerson.client_profile_kyc
overlay           ← user's in-flight edits (Partial<KycRecord>)
form              ← { ...serverFormData, ...overlay }   (computed)
```

- The inner steps still receive a `form` prop and an `onChange`
  callback — no API change for them.
- `form` is recomputed every render from server data + overlay, so
  stale state literally cannot exist: server data is the source of
  truth and overlay only holds user's unsaved edits.
- `saveKycForm` sends **only the overlay** (the fields the user has
  actually changed), never the full record. A wipe via stale state
  becomes impossible because stale state means an empty overlay,
  which means an empty save payload.
- After a save succeeds and the server data refreshes (via
  `router.refresh()` already wired in B-058), the overlay is
  reconciled: any overlay entry whose value now matches the server
  is dropped, leaving overlay representing only "still-pending" edits.

This pattern preserves user typing across remounts, prevents
multi-field wipes, and aligns with how the project's autosave is
actually called (only on explicit user actions).

## Scope

- **In**: `PerPersonReviewWizard.tsx`'s form-state architecture and
  the `saveKycForm` helper.
- **Out**: every inner step component (`ResidentialAddressStep`,
  `IdentityStep`, `FinancialStep`, `DeclarationsStep`, etc.) — they
  continue receiving `form` and `onChange` from the parent and don't
  need to know how those are produced.

## Working agreement

Single batch but careful — this touches a high-traffic component.
After CLI implements: restart the dev server, run the suite,
verify per the brief, commit, push, update CHANGES.md.

This batch supersedes parts of B-061 and B-062. Specifically:
- B-061 §1 (persons sync useEffect) STAYS — still needed.
- B-061 §2 (form-sync useEffect) was already reverted by B-062.
- B-062 (kyc.updated_at remount key) STAYS as a safety net for
  banner state and other inner-step state that should reset on
  data refresh.

---

## Step 1 — Replace the form state architecture in `PerPersonReviewWizard.tsx`

**File**: [`src/components/client/PerPersonReviewWizard.tsx`](src/components/client/PerPersonReviewWizard.tsx)
lines around 558-735.

### 1.1 — Replace `initialKycRecord` + `useState(form)` with the overlay pattern

Find the current block (around line 558-568):

```tsx
const initialKycRecord = useMemo(() => mapToKycRecord(reviewingPerson), [reviewingPerson]);
const kycRecordId = initialKycRecord.id;

// ── Form state (synced once, then user-owned) ─────────────────────────────
// Form state initializes from `initialKycRecord` on mount and is only
// mutated by user edits via `handleFormChange`. Fresh server data is
// pulled in via a key-based remount (see ServiceWizardPeopleStep where
// <PerPersonReviewWizard> keys on kyc.updated_at) — not a sync effect.
const [form, setForm] = useState<Partial<KycRecord>>(initialKycRecord);
const handleFormChange = useCallback((fields: Partial<KycRecord>) => {
  setForm((prev) => ({ ...prev, ...fields }));
}, []);
```

Replace with:

```tsx
// ── Form state — server-derived + optimistic overlay (B-063) ────────────────
// `serverFormData` is recomputed from the server-derived
// reviewingPerson on every render — it's the source of truth for what's
// in the DB.
// `overlay` holds the user's in-flight edits (fields they've changed
// but the server may not yet reflect, OR for which a save is in
// flight). `form` is the merged view shown to the inner steps.
//
// When the server data refreshes (post-save router.refresh) and the
// server value for a field equals the overlay value, that field is
// reconciled out of overlay — the edit has landed.
//
// `saveKycForm` sends ONLY the overlay (the fields the user actually
// touched), so a stale or empty overlay can never wipe other fields
// in the DB. This is the structural fix for the autosave-wipes-data
// bug class.
const serverFormData = useMemo(
  () => mapToKycRecord(reviewingPerson),
  [reviewingPerson]
);
const kycRecordId = serverFormData.id;

const [overlay, setOverlay] = useState<Partial<KycRecord>>({});

const form = useMemo<Partial<KycRecord>>(
  () => ({ ...serverFormData, ...overlay }),
  [serverFormData, overlay]
);

const handleFormChange = useCallback((fields: Partial<KycRecord>) => {
  setOverlay((prev) => ({ ...prev, ...fields }));
}, []);

// Reconcile overlay entries whose server value has caught up with
// the user's edit. Run on every server-data refresh.
useEffect(() => {
  setOverlay((prev) => {
    let changed = false;
    const next: Partial<KycRecord> = {};
    for (const [key, overlayValue] of Object.entries(prev) as Array<[keyof KycRecord, unknown]>) {
      const serverValue = (serverFormData as Record<string, unknown>)[key as string];
      if (serverValue === overlayValue) {
        // Edit has landed on the server — drop it from overlay.
        changed = true;
        continue;
      }
      // Still pending or diverged — keep in overlay.
      (next as Record<string, unknown>)[key as string] = overlayValue;
    }
    return changed ? next : prev;
  });
}, [serverFormData]);
```

### 1.2 — Update `saveKycForm` to send only the overlay

Find (around line 736-751):

```tsx
const formRef = useRef(form);
formRef.current = form;
const saveKycForm = useCallback(async (): Promise<boolean> => {
  if (!kycRecordId) return true;
  return autosave.save(async () => {
    try {
      const res = await fetch("/api/profiles/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId, fields: formRef.current }),
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
const overlayRef = useRef(overlay);
overlayRef.current = overlay;

const saveKycForm = useCallback(async (): Promise<boolean> => {
  if (!kycRecordId) return true; // no record yet — nothing to save server-side
  const pending = overlayRef.current;
  if (Object.keys(pending).length === 0) return true; // nothing dirty — no-op success
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

Key behaviors:
- If overlay is empty, save is a no-op success — important: we no
  longer fire empty saves that could wipe data.
- The payload is just the user's pending edits, not the full record.
- The route handler at `/api/profiles/kyc/save` already merges
  field-by-field; sending only changed fields means untouched fields
  aren't overwritten.

### 1.3 — Verify all `form` consumers still work

Search the file for `form` (just the variable, not `formRef`):

```bash
grep -n 'form\b' src/components/client/PerPersonReviewWizard.tsx | grep -v '// ' | head -30
```

Confirm that:
- `form` is passed as a prop to `ResidentialAddressStep`,
  `IdentityStep`, `FinancialStep`, `DeclarationsStep`,
  `CompanyDetailsStep`, `CorporateTaxStep` — all still receive a
  computed merged record. No changes needed there.
- `formRef` is gone (replaced by `overlayRef`).
- No reference to `setForm` remains.

### 1.4 — Audit other call sites that read `form` for save semantics

The `triggerDeferredVerifications` helper (around line 938-1003) also
reads `form` to build context for AI verification. That's fine —
deferred verification needs the full merged view, which `form` still
provides.

The B-058 §4 manual prefill handler in inner steps (`handleManualPrefill`
in ResidentialAddressStep / IdentityStep) calls `onChange` with new
values. After this batch, `onChange` (= `handleFormChange`) updates
the overlay. The next save sends those overlay fields. Same behavior,
cleaner data flow.

---

## Step 2 — Strip the now-unneeded autosave-state coupling

**File**: same.

The `autosaveStateRef` block was added in B-061 to gate the form-sync
useEffect. B-062 removed the form-sync useEffect but left the ref.
After B-063 the ref is unused — delete it.

```bash
grep -n 'autosaveStateRef' src/components/client/PerPersonReviewWizard.tsx
```

Delete every line that references `autosaveStateRef`. There should be
2-3 lines (the declaration, the mirror useEffect, and any reads). If
anything still depends on it, leave that — the audit is the safety
check.

---

## Step 3 — Verification

1. **Restart dev server** (CLAUDE.md):
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```

2. **Re-test the original bug scenario**:
   - Open Bruce's KYC → Address sub-step.
   - Type a complete address.
   - Click Next.
   - **Verify in DB**: address fields are populated. `updated_at` advanced.
   - **Wait 60 seconds.** Re-query DB. Expected: address fields STILL populated.
   - Click Save & Close.
   - **Re-query DB.** Expected: address fields STILL populated.
   - Click Review Bruce again.
   - Navigate to Address sub-step. Expected: form shows the address
     values you typed.

3. **Re-test the multi-field-wipe scenario**:
   - Type into Address line 1, click Next without filling other
     address fields. Expected: only `address_line_1` is sent in the
     payload (verify with the network monkey-patch); other address
     fields stay null in DB. The save no longer wipes; it patches.

4. **Edge case — no edits then click Next**:
   - Open a sub-step. Don't change anything. Click Next.
   - Expected: NO save fires (overlay is empty). Console logs no
     network call to `/api/profiles/kyc/save` from `saveKycForm`.

5. **Edge case — type, navigate, type more, save**:
   - Address sub-step: type address line 1.
   - Click Next → save fires with `{address_line_1: "..."}`. Overlay
     clears after server reconciles.
   - Identity sub-step: type a passport number.
   - Click Save & Close → save fires with `{passport_number: "..."}`.
     Address line 1 was already saved earlier; not in payload, not
     touched.

6. **`npm run lint && npm run build && npm test`** — all green.

7. **Network monkey-patch test** — re-run the diagnostic from
   earlier to confirm payloads are now overlay-only:
   ```js
   (()=>{const o=window.fetch;window.fetch=async(...a)=>{const r=await o(...a);const u=typeof a[0]==='string'?a[0]:a[0]?.url;if(u?.includes('/api/profiles/kyc/save')){const c=r.clone();const body=a[1]?.body;c.text().then(t=>console.log('SAVE REQ:',body,'\nSTATUS:',r.status));}return r;};console.log('Patched.');})();
   ```
   Type a single field, click Next, see the payload contain ONLY that
   field (plus `kycRecordId`). NOT the full record.

---

## CHANGES.md

```markdown
### 2026-05-XX — B-063 — Re-architect KYC form state: server-derived + optimistic overlay (Claude Code)

Structural fix for the autosave-wipes-data bug class that survived
B-061 and B-062. Real reproduction: user types Bruce's address,
clicks Save & Close (DB has values briefly), DB nulled within ~60s.

Root cause was that `PerPersonReviewWizard` maintained a local form
state initialized from props on mount, and `saveKycForm` sent the
ENTIRE form snapshot every save. Any path that reset `form` to stale
data turned the next save into a multi-field wipe.

New architecture in `PerPersonReviewWizard.tsx`:

- `serverFormData = useMemo(() => mapToKycRecord(reviewingPerson))` —
  source of truth, recomputed from the server-derived prop on every
  render.
- `overlay = useState<Partial<KycRecord>>({})` — user's in-flight
  edits.
- `form = { ...serverFormData, ...overlay }` — merged view passed to
  inner steps. Computed, never stale, always reflects the latest
  server data plus the user's pending edits.
- `handleFormChange` updates only the overlay.
- `saveKycForm` sends ONLY the overlay (the fields the user actually
  touched), not the full form. Empty overlay = no-op save (no
  network call, no chance of wiping).
- A reconciliation useEffect drops overlay entries when the server
  data catches up to the user's edit (post-save + router.refresh).
- Removed the now-unused `autosaveStateRef` and `formRef` from the
  earlier batches.

Net effect: stale state can no longer wipe DB values because there's
nothing to wipe with. The save payload structurally cannot include
fields the user didn't edit. Multi-field wipes become impossible.

Inner step components are unchanged — they still receive `form` and
`onChange` props with the same shape.

UI / state architecture only. No DB or API changes.
```

---

## Things to flag to the user

- No DB migrations.
- No API contract changes — the server-side `/api/profiles/kyc/save`
  route already merges field-by-field, so receiving partial payloads
  is backward-compatible.
- After deploy, hard-refresh the prod tab to drop the old JS bundle.
- The fields wiped from earlier sessions (Bruce's address, etc.) are
  not coming back — re-enter once after this lands.
- If during verification you see the Pre-fill button on banners
  stop working, it might be because `availableExtracts` and `prefillable`
  in `ResidentialAddressStep` / `IdentityStep` are computed from
  `form` — which is now the merged view. They should keep working
  identically.

## Rollback

`git revert` the single commit. The `useState(form)` pattern with
`saveKycForm` sending the full record returns. Combined with B-061's
persons sync and B-062's remount key, this is the same broken state
we had before B-063.

To fully revert to pre-bug-class state, also revert B-062
(`git revert efa4210`), B-061 (`git revert 2bac62a`), and B-058's
router.refresh additions.

A cleaner rollback path is to NOT revert and instead diagnose any
new issue with the new architecture in place — it's structurally
sound.
