# B-049 — Doc scoping + verification architecture rework

**Goal:** Fix the architectural mismatches surfaced during user testing of B-046 / B-047 / B-048:

- Wizard upload list doesn't match Review required-doc list (per-person docs misclassified at application level).
- AI verification runs at upload time before the comparison context (applicant name, declared occupation, etc.) exists, producing useless "not provided" flags.
- Residential address auto-fill is missing because it's bundled into the same "Identity" sub-step that's sourced from the passport.
- Professional details should be typed manually, then trigger CV re-verification.

**Out of scope:** Admin-side UI. UX polish (button colors, labels, autosave feedback). Those go in B-050.

**Important:** Run `git pull origin main` first.

---

## Batch 1 — Document scope flag (`scope: 'application' | 'person'`)

The root cause of the wizard-vs-review mismatch.

### 1.1 — Schema / template config

Add a `scope` flag to every document entry in the service template configuration. Two values:

- `'person'` — must be uploaded for **each** Director / Shareholder / UBO independently. Renders inside the per-person KYC wizard upload sub-steps (Identity / Financial / Compliance).
- `'application'` — uploaded **once** for the entity. Renders in Step 5 of the outer wizard (Documents).

Add the flag to the existing `service_templates` JSON (or wherever doc requirements are stored). For each existing document, set the right value. Likely classification (verify with the existing template config — these are best guesses):

| Document | scope |
|---|---|
| Certified Passport Copy | person |
| Proof of Residential Address | person |
| Curriculum Vitae / Resume | person |
| Declaration of Source of Funds | person |
| Evidence of Source of Funds | person |
| Bank Reference Letter | person |
| PEP Declaration Form | person |
| Professional Reference Letter | person |
| Tax Residency Certificate | person |
| Proof of Occupation / Employment Letter | person |
| Adverse Media Report | person |
| Declaration of Source of Wealth | person |
| Evidence of Source of Wealth | person |
| Articles of Association | application |
| Certificate of Incorporation | application |
| Memorandum / Charter | application |
| Business Plan | application |
| Beneficial Ownership Statement | application |

Audit the actual template content and confirm. The default for any unflagged doc is `'person'`.

If schema migration is needed, write a SQL migration in `supabase/migrations/` and an `/api/admin/migrations/...` endpoint that applies it. Flag in CHANGES.md so the user runs it before testing.

### 1.2 — Wizard read paths

- **Per-person KYC wizard** (sub-steps 1–3, doc sub-steps): query `template.documents.filter(d => d.scope === 'person')` and group by `category` (Identity / Financial / Compliance / Professional / Tax / Adverse Media / Wealth / etc.). Each category becomes its own sub-step.
- **Outer wizard Documents step** (Step 5): query `template.documents.filter(d => d.scope === 'application')`.

The doc category list per person may grow beyond the current 3 (Identity / Financial / Compliance). Render one sub-step per non-empty category. Sub-step counter at the bottom adjusts dynamically (e.g., "Sub-step 4 of 11 — Professional documents").

### 1.3 — Hide Documents step when empty

In the outer wizard, if `template.documents.filter(d => d.scope === 'application').length === 0`, **omit the Documents step entirely**:

- Don't render it as a wizard step.
- Step indicator at the top collapses (e.g., "Step 4 of 4" instead of "Step 5 of 5").
- Wizard navigation correctly goes from People & KYC → Review.

### 1.4 — Review step required-doc list

Review reads from the same template config:

- Per-person required docs: list under each person's section (already grouped by person), flag `Missing` per slot.
- Application-level required docs: list under "Documents" section.

The two lists (wizard upload + Review missing) MUST be derived from the same source. Add a unit test or a snapshot test that asserts they match.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 2 — Residential address as its own sub-step

### 2.1 — New sub-step inserted after Identity

Per-person wizard sub-step order becomes (assuming Batch 1 doc reclassification adds more categories):

1. Identity documents
2. Financial documents
3. Compliance documents
4. Professional documents (new — from Batch 1)
5. Tax documents (new — from Batch 1)
6. Adverse-media documents (new — from Batch 1)
7. Wealth documents (new — from Batch 1)
8. Contact details
9. **Identity (passport-sourced fields only)** — Full legal name, DOB, Nationality, Passport country, Passport number, Passport expiry, Aliases
10. **Residential Address (POA-sourced fields)** — NEW — Address line 1, Address line 2, City, State / Region, Postal code, Country
11. Financial info / Professional details (manual entry — see Batch 3)
12. Declarations
13. Review & save

Skip any sub-step that has no docs / no fields configured for the role. Sub-step counter adjusts.

### 2.2 — Identity sub-step body changes

Remove residential-address fields from the Identity sub-step. Identity now contains only passport-derived fields. The "Filled from uploaded document" banner subtext stays "Values extracted from your passport / ID."

### 2.3 — Residential Address sub-step body

New sub-step. Layout:

- Section heading: **Residential Address**
- Banner: "Filled from uploaded document — Values extracted from your proof of address."
- If no POA uploaded: neutral "Upload your proof of address to auto-fill these fields."
- Fields (top-aligned labels per B-047):
  - Address line 1 — `w-full` required
  - Address line 2 — `w-full` optional
  - City — `w-64` required
  - State / Region — `w-52` optional (varies by country)
  - Postal code — `w-24` required where country mandates one
  - Country — `w-60` dropdown required
- Auto-fill on mount from the most recent POA document attached to this `kyc_records` row. Don't overwrite user-edited values.

### 2.4 — POA → address extraction

The existing AI prefill API already extracts text from documents (used for passport → Identity). Extend the extraction prompt for proof-of-address documents to return:
```
{ address_line_1, address_line_2, city, state, postal_code, country }
```

If the existing prefill route is `/api/applications/[id]/persons/[personId]/prefill` (or similar — verify in code), add a `source: 'passport' | 'proof_of_address' | 'employer_letter' | 'cv'` parameter so the route knows which document to extract from and which fields to populate.

**Commit + push + update CHANGES.md**, then continue.

---

## Batch 3 — Manual professional details + deferred CV verification

### 3.1 — Professional details sub-step (manual entry)

The Financial info / Professional details sub-step becomes **manual entry only**, no CV prefill. Fields:

- Current occupation / job title — `w-full max-w-md` required
- Current employer — `w-full max-w-md` required
- Years in current role — `w-32` required
- Total years of professional experience — `w-32` required
- Industry — `w-60` dropdown required
- Work address — full width
- Work phone — `w-48`
- Work email — `w-full max-w-md`
- Source of funds — dropdown (Salary / Investments / Inheritance / Business sale / Other) required
- If "Other": text field appears for custom entry

No "Filled from uploaded document" banner on this sub-step. No prefill icons on these fields.

### 3.2 — CV verification deferred

Currently CV verification runs at upload time and flags "Applicant name not provided / occupation not provided" because comparison context doesn't exist yet.

**Change:** the CV verification route does NOT auto-run on upload. Instead:

- On upload of a CV document, the document is stored and marked `verification_status: 'pending'`.
- Verification runs when the user clicks **Save & Continue** on the **Professional details sub-step** — at that point name (from sub-step 9 Identity) AND occupation (from this sub-step) are both available.
- The verification call passes:
  ```json
  {
    "document_id": "...",
    "document_type": "cv_resume",
    "comparison_context": {
      "applicant_full_name": "Bruce Banner",
      "declared_occupation": "Head of Compliance",
      "declared_employer": "Stark Industries Holdings",
      "declared_years_in_role": 7
    }
  }
  ```
- AI rules can now meaningfully evaluate name match + occupation alignment.
- Result is stored on the document. The KYC progress UI updates.

If the user re-edits professional details later, **re-run** the verification (debounced 2s after blur or on next Save & Continue).

### 3.3 — Apply same pattern to other context-dependent verifications

Audit each AI rule for cross-form context dependencies. Likely candidates:

- **Source of Funds Evidence (employer letter)**: needs `declared_source_of_funds`, `declared_employer`, `declared_role`. Verify after Professional details + Declarations sub-step.
- **Source of Wealth Evidence**: needs declared sources from Declarations. Verify after Declarations sub-step.
- **Bank Reference Letter**: needs `applicant_full_name`. Verify after Identity sub-step.
- **Proof of Occupation / Employment Letter**: needs `declared_employer`, `declared_role`. Verify after Professional details.
- **Adverse Media Report**: needs `applicant_full_name`, `declared_jurisdictions`. Verify after Identity + (if exists) Declarations.

For each: don't run at upload. Run when ALL required context fields are filled, on the sub-step that completes the context.

### 3.4 — Verification context plumbing fix (item 6)

The current code passes either an empty or application-level context to the AI verification route. Refactor so the context is **always** built per-`kyc_records` row when the doc is a person-level doc:

```ts
const context = {
  applicant_full_name: kycRecord.full_name,
  applicant_dob: kycRecord.date_of_birth,
  applicant_nationality: kycRecord.nationality,
  applicant_passport_number: kycRecord.passport_number,
  applicant_residential_address: { ... }, // built from kycRecord address fields
  declared_occupation: kycRecord.occupation,
  declared_employer: kycRecord.employer,
  declared_years_in_role: kycRecord.years_in_role,
  declared_source_of_funds: kycRecord.source_of_funds,
  // … add all fields verification rules might reference
};
```

For application-level docs, build the context from `applications` + `clients` rows.

Document the context schema in a comment at the top of the verification route so future rule authors know what's available.

**Commit + push + update CHANGES.md**, then stop.

---

## After all batches

- Run `npm run build` — must pass clean (lint + type check, no warnings).
- Update CHANGES.md with a new dated section per batch.
- Final commit + push.
- Hand back: one line — done / blocked / question.

---

## Open notes

- This brief assumes the existing template config can accept a `scope` flag without breaking existing applications. If the schema is rigid, write the migration first.
- Verify the existing prefill route name and shape before adding the `source` param — don't break current passport prefill.
- Don't introduce `any`. Don't disable strict mode.
- Test with the sample docs at `/Users/elaris/Documents/sample-kyc-docs/` (Bruce Banner identity).
- If you hit a fundamental blocker (e.g. template schema doesn't support per-doc flags and requires a deeper rework), document in CHANGES.md and stop. Don't shotgun a workaround.
