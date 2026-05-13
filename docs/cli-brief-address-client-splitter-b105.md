# CLI Brief — B-105 Address Save Reset — Real Fix #2 (client splitter)

**Status:** Ready for CLI
**Estimated batches:** 1
**Touches migrations:** No
**Touches API:** No
**Builds on:** B-100 batch 2 (first attempt), B-104 (server splitter dual-write — correct but unreachable)

---

## Why this batch exists

Address still reverts on save after B-100 and B-104. Root cause is now confirmed on the **client side**, not the server.

### The full picture

- `address` lives on **both** `client_profile_kyc.address` and `client_profiles.address`.
- The admin page server-loads `client_profiles(... client_profile_kyc(*))`. `initialFields` is built from the kyc spread (line 1467-1479 of `ServiceDetailClient.tsx`), so `savedFields.address` comes from `client_profile_kyc.address`.
- B-104 added `address` to the server's `DUAL_TABLE_KEYS` so that when `address` arrives in `body.kyc_fields`, the server copies it into `profile_fields` and writes both tables.
- But the **client splitter** in `handleKycBarSave` (line 1683) puts `address` into `PROFILE_FIELD_KEYS`, which forces it into `body.profile_fields` and **never** `body.kyc_fields`.
- Server's splitter only runs when `body.kyc_fields` is truthy — so for address it short-circuits.
- Only `client_profiles.address` is updated; `client_profile_kyc.address` stays stale.
- `onRefresh()` re-fetches, `initialFields` rebuilds from the stale kyc row, `useEffect` resets `savedFields` and `draftFields` to it → field reverts.

The B-104 fix is correct but unreachable from the only caller. This brief fixes that.

---

## Hard rules

1. **One batch.** Commit + `git push origin HEAD:main` + CHANGES.md.
2. `npm run build` clean.
3. **Don't restart the dev server.**

---

## The fix

File: [`src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`](src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx) line 1683.

Change:

```ts
const PROFILE_FIELD_KEYS = new Set(["full_name", "email", "phone", "address"]);
```

To:

```ts
// B-105 — `address` is dual-table (lives on both client_profiles.address
// AND client_profile_kyc.address). Routing it through kyc_fields lets the
// server's DUAL_TABLE_KEYS splitter (B-104) write to BOTH tables. If we
// put it in profile_fields here, the splitter never runs for address and
// only client_profiles is updated — leaving client_profile_kyc.address
// stale, which then overwrites the form on the next refresh.
const PROFILE_FIELD_KEYS = new Set(["full_name", "email", "phone"]);
```

Also remove the address-specific override at line 1763 inside `handleKycBarSave`:

```ts
// B-100 — also sync `address` from the post-update profile row
// so the dirty tracker zeroes out on a successful save.
nextSaved.address = data.profile.address ?? "";
```

It's no longer needed — `address` now flows back through `data.kyc.address` like every other kyc field, picked up by the `for (const [k, v] of Object.entries(data.kyc ?? {}))` loop a few lines above.

Update the comment block at lines 1679-1683 to reflect the new routing.

---

## Smoke test (run before declaring done)

1. Open `/admin/services/<id>`, expand a profile in People & KYC.
2. Edit the address field. Hit Save.
3. Verify: toast confirms, field stays populated, refresh the tab — value persists.
4. DB check (paste your `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from `.env.local`):

```bash
curl -s "$URL/rest/v1/client_profiles?select=address,client_profile_kyc(address)&id=eq.<profile-id>" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY"
```

Both `client_profiles.address` and `client_profile_kyc.address` must equal the saved value.

---

## Commit message

```
fix: route address through kyc_fields so server DUAL_TABLE_KEYS splitter actually runs (B-100/B-104 were unreachable)
```

CHANGES.md under `## B-105`:

```
## B-105 — Address save reset, real fix #2 (done <date>)

- Removed "address" from client-side PROFILE_FIELD_KEYS in `handleKycBarSave`. The B-104 server splitter (DUAL_TABLE_KEYS) only writes to both tables when `address` arrives in `body.kyc_fields`; routing it client-side to `profile_fields` made the splitter unreachable.
- Removed the now-redundant `nextSaved.address = data.profile.address ?? ""` override; address flows back through the kyc spread like every other kyc field.
- Field now writes to both `client_profile_kyc.address` and `client_profiles.address` on every admin save; the post-refresh `initialFields` rebuild reads the freshly-saved value.
```

---

## Acceptance criteria

- [ ] `npm run build` clean
- [ ] Edit address → Save → field persists in UI
- [ ] Refresh tab → value persists
- [ ] DB query confirms both `client_profile_kyc.address` and `client_profiles.address` agree after save
- [ ] CHANGES.md has a single B-105 entry

---

## After the batch

Final commit + push → tell Vanessa one line: "B-105 done — address really sticks now."
