# CLI Brief — B-104 Real Fix for Address Save Reset (B-100 batch 2 was incomplete)

**Status:** Hold until B-103 lands
**Estimated batches:** 1
**Touches migrations:** No
**Touches AI verification:** No
**Touches API:** Yes — extends `/api/admin/profiles/[id]/kyc-fields` (no new endpoints)
**Builds on:** B-100 batch 2 (which addressed the wrong half of this bug)

---

## Hold rule

Do not start until commit `feat: avatar in top header + right-rail height …` (B-103) is on `origin/main`. Run `git pull origin main` first; `git log --oneline -5` must show the B-103 feat commit.

---

## Why this batch exists

Vanessa is still seeing the admin KYC address field revert after save, even after the B-100 batch 2 fix. The original bug report was correct; the B-100 fix solved half the problem. The form continues to revert because:

- `client_profile_kyc` **and** `client_profiles` both have an `address` column in production.
- The page server-loads `client_profiles(... client_profile_kyc(*))` — so the form's `savedFields.address` comes from `client_profile_kyc.address`.
- The B-100 splitter detects `address` in `PROFILE_FIELD_ALLOWED` and **moves** it out of `kyc_fields` into `profile_fields`, then updates `client_profiles.address`.
- `client_profile_kyc.address` is **never written to**. The response echoes the unchanged kyc row. The client splices `data.kyc` into `savedFields`, which overwrites the form's address with the old kyc value.

End result: `client_profiles.address` gets updated in the DB but the form snaps back. The DB and the screen disagree.

### Live DB check (confirms the dual column)

```bash
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/client_profile_kyc?select=*&limit=1" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

Returns a row whose columns include both `address` and the structured `address_line_*` set.

---

## Hard rules

1. **One batch.** Commit + `git push origin HEAD:main` + CHANGES.md.
2. `npm run build` clean.
3. **No new migrations.** This is a route-layer fix. The eventual consolidation to one address column is logged as tech debt.
4. **No `as any`.**
5. **Don't restart the dev server.**

---

## The fix

Write `address` to **both** `client_profile_kyc.address` and `client_profiles.address`. That way reads (from kyc) and writes stay in sync until the schema is consolidated.

### Step 1 — Stop moving, start copying

File: [`src/app/api/admin/profiles/[id]/kyc-fields/route.ts`](src/app/api/admin/profiles/[id]/kyc-fields/route.ts).

1. **Add `"address"` to `KYC_FIELD_ALLOWED`** so the kyc update branch will persist it on `client_profile_kyc.address`:

```ts
const KYC_FIELD_ALLOWED = new Set<string>([
  // … existing entries …
  "address",  // B-104 — write through to client_profile_kyc.address so the
              // form's reads (from kyc(*)) and writes stay in sync. Keep the
              // entry in PROFILE_FIELD_ALLOWED too — the splitter now COPIES
              // rather than MOVES.
  // existing "address_line_1" … "address_country" stay as-is
]);
```

2. **Change the splitter from MOVE to COPY** (around line 158–172):

Replace:

```ts
if (body.kyc_fields) {
  const lifted: Record<string, unknown> = { ...(body.profile_fields ?? {}) };
  const remainingKyc: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body.kyc_fields)) {
    if (PROFILE_FIELD_ALLOWED.has(key)) {
      lifted[key] = value;
    } else {
      remainingKyc[key] = value;
    }
  }
  body.kyc_fields = remainingKyc;
  if (Object.keys(lifted).length > 0) {
    body.profile_fields = lifted as KycFieldsBody["profile_fields"];
  }
}
```

With:

```ts
// B-104 — fields that live on BOTH tables (address) need to be written to
// both so reads (from kyc(*)) and writes stay in sync. Other fields that
// only live on client_profiles (full_name / email / phone) still need to be
// lifted out of kyc_fields when the client packs them there.
const DUAL_TABLE_KEYS = new Set(["address"]);
if (body.kyc_fields) {
  const liftedToProfile: Record<string, unknown> = { ...(body.profile_fields ?? {}) };
  const remainingKyc: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body.kyc_fields)) {
    if (DUAL_TABLE_KEYS.has(key)) {
      // Copy to profile_fields AND keep in kyc_fields — write to both tables.
      liftedToProfile[key] = value;
      remainingKyc[key] = value;
    } else if (PROFILE_FIELD_ALLOWED.has(key)) {
      // Profile-only field (full_name/email/phone) — move it out of kyc.
      liftedToProfile[key] = value;
    } else {
      remainingKyc[key] = value;
    }
  }
  body.kyc_fields = remainingKyc;
  if (Object.keys(liftedToProfile).length > 0) {
    body.profile_fields = liftedToProfile as KycFieldsBody["profile_fields"];
  }
}
```

### Step 2 — Backfill `client_profile_kyc.address` once on save

The dual-write above handles the forward case (every admin save updates both columns). Reads from kyc will now see the freshly-written value. ✓

No retroactive backfill needed for existing rows because the form re-reads from kyc after every save, so the moment an admin saves an address on a given profile, the two columns reconcile for that profile.

### Step 3 — Audit log update

The current audit log captures the diff as `{ profile_fields: { address: ... } }`. With the dual-write, the same key will also appear under `kyc_fields`. That's slightly noisy but correct. Leave it — explicit dual-table writes deserve to be visible in the trail.

### Step 4 — Manual smoke test

1. Open `/admin/services/<some-id>`, expand a profile in People & KYC.
2. Edit the address field. Hit Save.
3. Verify:
   - Toast confirms save
   - Field stays populated after the post-save re-render
   - Refresh the page — address still shows the new value
   - DB query confirms both `client_profile_kyc.address` and `client_profiles.address` hold the new value:

```bash
curl -s "${NEXT_PUBLIC_SUPABASE_URL}/rest/v1/client_profiles?select=address,client_profile_kyc(address)&id=eq.<profile-id>" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}"
```

Both should match.

### Step 5 — Commit + push + CHANGES.md

```
fix: address now writes to both client_profile_kyc and client_profiles (B-100 fix was half-done)
```

CHANGES.md entry under `## B-104` with a one-line summary of the dual-write rationale + the tech-debt note below.

---

## Acceptance criteria

- [ ] `npm run build` clean
- [ ] Admin edit address → Save → field persists in UI
- [ ] Page refresh shows the saved address
- [ ] DB query confirms `client_profile_kyc.address` and `client_profiles.address` agree after save
- [ ] Audit log row shows the address diff
- [ ] CHANGES.md has a single B-104 entry

---

## Tech debt to log

Append to `docs/tech-debt.md` after the batch:

- **`address` is duplicated between `client_profiles` and `client_profile_kyc`.** Both columns exist; B-104 dual-writes to keep them in sync from the admin save endpoint. Other writers (the legacy `verify-code` magic-link flow at `src/app/api/kyc/verify-code/route.ts:149`, the client wizard auto-save at `/api/services/[id]/persons/[personId]/route.ts`, and direct DB updates) may still only write to one of the two — verify and plug any remaining single-side writes before consolidating. **Plan to consolidate**: pick one column as canonical (likely `client_profiles.address` since it's already the contact-info layer), backfill from the other, drop the duplicate, remove the dual-write logic in the kyc-fields route. ~2-hour follow-up brief once we confirm no other writers are silently relying on the now-dropped column.

---

## After the batch

Final commit + push + CHANGES.md → tell Vanessa one line: "B-104 done — address save fix takes for real now."
