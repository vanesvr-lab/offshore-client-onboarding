# B-135 — KYC AI prefill silently drops `date_of_birth` + `passport_country`

## Why

Vanessa uploaded the demo passport for Tony Stark (`docs/demo-documents/tony-stark/01-passport-certified-copy.pdf`). The AI extracted all 6 fields correctly — the EXTRACTED FIELDS UI box on the document detail dialog shows:

| Field | Extracted value |
|---|---|
| Full Name | ANTHONY EDWARD STARK |
| Date Of Birth | **1970-05-29** |
| Nationality | USA |
| Passport Number | 599384279 |
| Expiry Date | 2032-05-13 |
| Passport Country | **USA** |

After clicking the prefill / Re-apply button, four of six values persisted to `client_profile_kyc`. The two **bold** ones above silently failed. Direct DB inspection confirms the bug is at the persistence layer (not just a render issue):

```json
// SELECT … FROM client_profile_kyc WHERE client_profile_id = '<tony's id>'
{
  "date_of_birth": null,        // ← AI extracted "1970-05-29"
  "nationality": "USA",         // (may have been pre-populated)
  "passport_country": null,     // ← AI extracted "USA"
  "passport_number": "599384279",
  "passport_expiry": "2032-05-13"
}
```

So the bulk prefill path either:

A) Never includes these two targets in the payload it sends to `/api/profiles/kyc/save`, OR
B) Includes them, the save succeeds, then a per-field auto-save fires immediately afterward with stale React state and overwrites them back to null.

Both fields are columns on `client_profile_kyc` (per `supabase/migrations/20260301000003_phase1_schema.sql:102`, both have existed since the phase 1 schema). The save route's field-handling logic accepts them (no allowlist exclusion).

## Out of scope (do NOT do in B-135)

- **AI extraction accuracy** — the AI is correct. Don't tune prompts or rules.
- **Country-code normalization** — the AI returns `"USA"`, which is ISO3, which is what `CountrySelect` expects per B-100. No translation needed.
- **Date format normalization** — the AI returns `"1970-05-29"`, which is ISO8601, which is what `<input type="date">` expects. No translation needed.
- **Other KYC fields beyond these two** — fix the root cause once, but the fix should be general (any extracted field that's whitelisted in `KYC_PREFILLABLE_FIELDS` should persist).
- **Refactor the prefill architecture** — patch the bug, don't redesign.

---

## Batch 1 — Diagnose + fix the root cause

### Investigation path

CLI traces the flow end-to-end:

1. **Confirm what `computePrefillableFields` returns.**
   Add a temporary `console.log("prefillable payload", payload)` inside `handlePrefillClick` in `src/components/kyc/IndividualKycForm.tsx`. Re-run the demo scenario:
   - Re-upload the demo passport on a fresh director profile (or reset Tony's KYC row to NULLs first).
   - Click Re-apply.
   - Check the browser console for the payload object.

   **If `date_of_birth` and `passport_country` are missing from the payload** → bug is in `computePrefillableFields` or `computeAvailableExtracts` (`src/lib/kyc/computePrefillable.ts`). Likely cause: an early-return condition (e.g. `isEmpty(form[target])` check) is incorrectly excluding these fields. Possible: stale `form` argument passed in, where `form.date_of_birth` is `null` but treated as non-empty.

   **If both keys ARE in the payload** → bug is in the save path. Continue.

2. **Confirm the save route receives them.**
   Add a `console.log("kyc save body", fields)` at the top of `POST /api/profiles/kyc/save` in `src/app/api/profiles/kyc/save/route.ts`. Re-run.

   **If only 3 keys arrive** → bug is in the network layer / fetch body serialization (unlikely but check).

   **If all 5 keys arrive** → check `cleanedFields` after the loop. Console.log it. Confirm date_of_birth and passport_country are present.

3. **Confirm the UPDATE writes them.**
   In the save route, log the result of the `supabase.from("client_profile_kyc").update(...)` call. If `data` includes the new values, the write happened. Then re-query the DB to see if a subsequent save overwrote them.

4. **Check for auto-save races.**
   Look at how `set(key, value)` (line ~127 in `IndividualKycForm.tsx`) interacts with auto-save. If `set` triggers an auto-save that POSTs the **full form state**, and React's state update from `handlePrefillClick`'s `setFields(...)` hasn't yet committed when the auto-save fires, the auto-save would POST stale empty values and clobber the just-written DB row.

   **The smoking-gun test:** after Re-apply, immediately check the DB row before touching anything else in the UI. If the values ARE there but disappear after touching another field, that confirms the auto-save clobber theory.

### Likely root cause (pending CLI's verification)

Based on the symptom pattern (specific fields, persistent failure across uploads, no client-side error), my read is one of:

- **`computePrefillableFields` race**: when Re-apply runs, the `form` argument passed in reflects a partially-stale state. Some fields like `date_of_birth` and `passport_country` get filtered out by the `!isEmpty(form[target])` guard because the form is in the middle of an auto-save cycle that wrote temporary placeholder values.
- **Per-field auto-save clobber**: same as above but on the write side. The bulk save writes correctly, then a per-field set fires immediately and overwrites with the stale empty React state.

Both point to the prefill flow needing **atomicity** — either:
- The auto-save should pause / be suppressed during the bulk Re-apply window, OR
- The bulk Re-apply should explicitly re-fetch + re-set the React state after the save completes (rather than relying on `setFields(prev => …)` which may collide with concurrent setFields from auto-save), OR
- `computePrefillableFields` should be called against the SERVER state (re-fetched) instead of the client React state at click time.

### Fix

The cleanest fix, depending on root cause:

**If it's a stale-state race in `setFields`:** after `await fetch(...)` succeeds in `handlePrefillClick`, **also refresh `initialRecord`** from the server (re-fetch the KYC row + replace `fields` with the canonical value), instead of merging `payload` into React state. This makes the server the source of truth and avoids stale-state races entirely.

**If it's `computePrefillableFields` dropping the fields:** verify the `form` arg passed in is the live form state at click time. If it's stale, either pass a server-fetched snapshot or remove the `!isEmpty(form[target])` guard from the bulk-Re-apply path (the user explicitly clicked Re-apply, they want everything overwritten).

**Either way**: end with one canonical update + a re-fetch. Make the Re-apply button's behaviour deterministic: "all whitelisted extractable values from this document are written to the DB, then the form re-reads from the DB."

### Verification (Batch 1)

Manual:
1. Find a director with a fresh KYC row (or reset Tony's: `UPDATE client_profile_kyc SET date_of_birth = NULL, passport_country = NULL WHERE client_profile_id = 'ce999018-a9a0-48ba-98ca-579630d9c062';`).
2. Re-upload the demo passport.
3. Click Re-apply.
4. Immediately verify the DB row — all 6 expected fields should be populated (including date_of_birth and passport_country).
5. Refresh the page. The form should now show:
   - Date of birth: 05/29/1970 (or 1970-05-29 depending on locale)
   - Passport country: United States (rendered from ISO3 "USA")
   - Nationality: United States
   - Full legal name: ANTHONY EDWARD STARK
   - Passport number: 599384279
   - Passport expiry: 05/13/2032

6. Repeat with a fresh upload of any other realistic identity document — date and country fields should populate reliably.

### Commit message (Batch 1)

```
fix: KYC prefill writes date_of_birth + passport_country (B-135)

The bulk Re-apply path silently dropped date_of_birth and
passport_country values from the AI-extracted payload. Root cause:
<CLI fills in based on what was actually wrong>. Fix: <CLI fills
in>.

Demo passport upload for Tony Stark now persists all six
extracted fields (full_name, date_of_birth, nationality,
passport_country, passport_number, passport_expiry) on a single
Re-apply click.
```

---

## Batch 2 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-135 — KYC prefill bug fix (done YYYY-MM-DD)`. Include:
- Symptom (date_of_birth + passport_country didn't persist)
- Root cause (CLI fills in after investigation)
- Fix description

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry** (if the fix exposed broader issues): "KYC form auto-save vs bulk Re-apply race — B-135 patched the symptom (date_of_birth + passport_country). If other prefilled fields show similar persistence issues in future, consider re-architecting the form so Re-apply is the ONLY write path during the prefill operation, with auto-save suppressed until it completes."
- **Add new Open entry**: "Demo documents could include a CSV/JSON manifest of expected extracted values per document — useful for end-to-end testing of the prefill flow and as a sanity check that AI extraction stays accurate. Estimate: ~30 minutes."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **No migration** — pure app-code bug fix.
2. **Per-batch commits:** two commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No AI prompt tuning.
- No country-code or date-format translation (the formats are already correct).
- No architectural refactor of the prefill flow — patch the bug, don't redesign.
- Audit-log behavior unchanged.
