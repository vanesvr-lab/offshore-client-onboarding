# B-136 — Extract structured address fields from Proof of Residential Address

## Why

The KYC form has **structured** residential-address fields (B-049): `address_line_1`, `address_line_2`, `address_city`, `address_state`, `address_postal_code`, `address_country`. The prefill whitelist (`KYC_PREFILLABLE_FIELDS` in `src/lib/constants/prefillFields.ts`) already includes all six.

But the live AI extraction config for "Proof of Residential Address" only extracts ONE composite field:

```json
{
  "key": "address_on_document",
  "prefill_field": "address",
  "ai_hint": "Full address shown on document"
}
```

So when a user uploads a utility bill, the AI returns one big string like `"10880 Malibu Point, Malibu, California 90265, United States of America"` mapped to the legacy single-line `address` field. The structured fields stay empty even though the AI is fully capable of parsing the components — it just isn't asked to.

B-136 extends the extraction config so the AI returns both the composite string AND each structured component separately. Combined with B-135 (the persistence fix), uploading a proof of address auto-fills the complete structured form in one click.

## Out of scope (do NOT do in B-136)

- **The KYC prefill persistence bug** — that's B-135. B-136 only fixes the EXTRACTION config; B-135 fixes the SAVE path. Both are needed end-to-end but they're independent diffs.
- **Proof of Company Address** — the corporate variant has empty `ai_extraction_fields` today. Different schema (registered office vs residential address). Out of scope here; separate brief if it becomes pitch-blocking.
- **Address normalization / canonical formatting** — the AI returns the address as it appears on the document. No post-processing to e.g. uppercase, abbreviate "St" → "Street", validate postal-code format, etc.
- **Country-code mapping for `address_country`** — the AI is instructed to return ISO3 (matching B-100's CountrySelect format) directly. If it returns the wrong format occasionally, that's covered by the existing CountrySelect's lenient matching.

---

## Batch 1 — Migration + seed file update

### Migration: `<timestamp>_proof_of_address_structured_fields.sql`

Use `npx supabase migration new proof_of_address_structured_fields` to generate the timestamp.

```sql
-- B-136 — Extend "Proof of Residential Address" AI extraction config to
-- emit structured address components alongside the existing composite
-- string. Each component maps to its own prefill_field so the KYC form's
-- structured residential-address fields get populated automatically on
-- Re-apply (combined with B-135's persistence fix).

UPDATE public.document_types
SET ai_extraction_fields = '[
  {
    "key": "address_on_document",
    "label": "Address",
    "ai_hint": "Full address as it appears on the document (single line, components separated by commas)",
    "type": "string",
    "prefill_field": "address"
  },
  {
    "key": "address_line_1",
    "label": "Address line 1",
    "ai_hint": "Street address line 1 — house/building number plus street name (e.g. ''10880 Malibu Point'')",
    "type": "string",
    "prefill_field": "address_line_1"
  },
  {
    "key": "address_line_2",
    "label": "Address line 2",
    "ai_hint": "Apartment, suite, building, or unit identifier if present; null if not on document",
    "type": "string",
    "prefill_field": "address_line_2"
  },
  {
    "key": "address_city",
    "label": "City",
    "ai_hint": "City or town name",
    "type": "string",
    "prefill_field": "address_city"
  },
  {
    "key": "address_state",
    "label": "State / province",
    "ai_hint": "State, province, or region (full name preferred; e.g. ''California'' not ''CA'')",
    "type": "string",
    "prefill_field": "address_state"
  },
  {
    "key": "address_postal_code",
    "label": "Postal code",
    "ai_hint": "ZIP, postal code, or postcode",
    "type": "string",
    "prefill_field": "address_postal_code"
  },
  {
    "key": "address_country",
    "label": "Country",
    "ai_hint": "Country as an ISO 3166-1 alpha-3 code (e.g. ''USA'' for United States, ''GBR'' for United Kingdom, ''FRA'' for France). Convert full country names to ISO3.",
    "type": "string",
    "prefill_field": "address_country"
  },
  {
    "key": "document_date",
    "label": "Document date",
    "ai_hint": "Statement or issue date",
    "type": "date",
    "prefill_field": null
  },
  {
    "key": "account_holder_name",
    "label": "Name on document",
    "ai_hint": "Account holder or addressee",
    "type": "string",
    "prefill_field": null
  }
]'::jsonb,
updated_at = now()
WHERE name = 'Proof of Residential Address';
```

### Migration lifecycle (CLI is responsible for the full cycle)

Per CLAUDE.md "Database Migration Workflow":

1. Write the migration file.
2. Commit + push the migration file.
3. `npm run db:push` to apply to prod.
4. `npm run db:status` — confirm Local + Remote pair with no drift.
5. CHANGES.md entry noting the migration filename + that it was pushed.

### Update `seed-ai-defaults/route.ts`

In `src/app/api/admin/migrations/seed-ai-defaults/route.ts`, find the `Proof of Residential Address` entry in the `DEFAULTS` array and replace its `ai_extraction_fields` with the same 9-field structure as the migration above. This way, anyone re-running the seed endpoint gets the structured fields too (idempotent with the migration).

### Verification (Batch 1)

```sql
-- Confirm the config update landed
SELECT name, jsonb_array_length(ai_extraction_fields) FROM public.document_types WHERE name = 'Proof of Residential Address';
-- Expect: name='Proof of Residential Address', length=9

-- Inspect one of the new structured fields
SELECT jsonb_path_query(ai_extraction_fields, '$[*] ? (@.prefill_field == "address_line_1")')
FROM public.document_types WHERE name = 'Proof of Residential Address';
-- Expect: a single object with the address_line_1 config
```

Manual end-to-end (requires B-135 to have shipped):
1. Delete Tony Stark's existing Proof of Residential Address upload (so a fresh AI extraction runs).
2. Re-upload `docs/demo-documents/tony-stark/02-proof-of-address-utility-bill.pdf`.
3. Open the document detail dialog → EXTRACTED FIELDS panel — should now show all 9 fields:
   - Address On Document: 10880 Malibu Point, Malibu, California 90265, United States of America
   - Address Line 1: 10880 Malibu Point
   - Address Line 2: (null)
   - Address City: Malibu
   - Address State: California
   - Address Postal Code: 90265
   - Address Country: USA
   - Document Date: 2026-04-01
   - Account Holder Name: Anthony E. Stark
4. Click Re-apply on the KYC form. Confirm in the DB:
   ```sql
   SELECT address_line_1, address_line_2, address_city, address_state,
          address_postal_code, address_country
   FROM client_profile_kyc WHERE client_profile_id = 'ce999018-a9a0-48ba-98ca-579630d9c062';
   ```
   Should now return non-null values for all five structured fields (with B-135's persistence fix in place).
5. Reload the KYC form → the structured Residential Address section shows the broken-down components.

### Commit message (Batch 1)

```
feat(db): structured address extraction for Proof of Residential Address (B-136)

Extends document_types.ai_extraction_fields for "Proof of
Residential Address" from 3 fields to 9. New structured fields
mirror the form's B-049 residential address shape:
address_line_1, address_line_2, address_city, address_state,
address_postal_code, address_country (ISO3). Composite
address_on_document → address stays in place for backward
compatibility. Seed file (seed-ai-defaults/route.ts) updated to
match so re-seeds are idempotent.

End-to-end with B-135's persistence fix: uploading a utility
bill auto-populates all six structured address fields on a
single Re-apply click.
```

---

## Batch 2 — CHANGES.md + tech debt

### CHANGES.md

Top-of-file entry under `## B-136 — Structured address extraction (done YYYY-MM-DD)`. Note the dependency on B-135 for end-to-end functionality.

### Tech debt log

In CHANGES.md Tech Debt Tracker and `docs/tech-debt.md`:

- **Add new Open entry**: "Proof of Company Address — same extraction gap as Proof of Residential Address before B-136. The corporate variant's `ai_extraction_fields` is empty today. If/when the corporate address is needed structurally (e.g. for substance review § 3.3 office premises check, or for incorporation document validation), add the same pattern. Estimate: ~30 minutes."
- **Add new Open entry**: "AI hint quality could regress over time — B-136 specifies ISO3 country codes in the ai_hint. If the AI starts returning full country names occasionally, the CountrySelect's matching may degrade. Add a regression test that uploads each demo document and asserts the expected structured fields are extracted. Estimate: ~2 hours."

### Dev server restart (CLI owns it per memory)

From `/Users/elaris/Documents/Claude_webapp_client_onboarding`:

```bash
pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
```

---

## End-of-brief checklist (CLI)

1. **Migration lifecycle (Batch 1):** write, commit + push file, `db:push`, `db:status`, CHANGES.md.
2. **Per-batch commits:** two commits.
3. **Final check:** `git status` clean + branch up-to-date with origin/main.
4. **Dev server restart** from main project dir.
5. **One-line summary in chat** when done.

## Out-of-scope reminders

- No prefill persistence work (that's B-135).
- No Proof of Company Address changes.
- No country-name → ISO3 mapping helper — the AI does the conversion via the ai_hint.
- No regression tests / fixtures — separate brief if needed.
