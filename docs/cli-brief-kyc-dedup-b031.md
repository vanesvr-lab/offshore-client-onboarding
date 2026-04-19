# B-031 — Client KYC dedup + AI key dev-script fix

**Scope:** Client-only. Removes duplicated email/phone and duplicated document upload blocks when the KYC wizard is rendered inside the `ServiceWizardPeopleStep` split layout (the top-left `ProfileEditPanel` and top-right `KycDocListPanel` already own those concerns).

## Why

On the client KYC review screen a person's contact fields and KYC documents appear twice:

- **Email / phone** — shown in `ProfileEditPanel` (top-left) and again in `IdentityStep` bottom.
- **Passport / proof of address / bank ref / SoF / PEP docs** — shown in `KycDocListPanel` (top-right) and again as full-width upload cards inside each wizard step.

The ~330 vertical px of duplicated upload cards + ~70px of duplicated email/phone are removed from the step forms; the right panel remains the single source of truth for docs; the top-left panel remains the single source of truth for contact info.

Other contexts where the wizard renders WITHOUT those panels (`/kyc` standalone, `/kyc/fill/[token]` external, admin wizard) must keep the current behavior — achieved via opt-in props defaulting to `false`.

## Separately: AI verification silent-fail

Tech debt #16 (CHANGES.md): an empty `ANTHROPIC_API_KEY` export from Claude Desktop overrides `.env.local` in the running dev server. `verifyDocument()` throws "ANTHROPIC_API_KEY is not set"; the upload route's catch block swallows it and marks docs `manual_review`.

Permanent fix: prefix `next dev` with `unset ANTHROPIC_API_KEY` so `.env.local` wins on every start.

## Changes

### 1. `src/components/kyc/steps/IdentityStep.tsx`
- Add props (both optional, default `false`):
  - `showContactFields?: boolean` — when `false`, hide the email + phone row at the bottom of the identity section
  - `hideDocumentUploads?: boolean` — when `true`, hide the "Certified Passport Copy" and "Proof of Residential Address" upload cards
- Wrap the corresponding JSX blocks in conditionals.

### 2. `src/components/kyc/steps/FinancialStep.tsx`
- Add `hideDocumentUploads?: boolean` prop (default `false`)
- When `true`, skip all 8 `InlineUpload` renders (Declaration of SoF, Evidence of SoF, Bank Reference Letter, CV, Declaration of SoW, Evidence of SoW, Professional Reference Letter, Tax Residency Certificate).
- Text fields (source_of_funds_description, work address/phone/email, source_of_wealth_description, tax_identification_number) are preserved.

### 3. `src/components/kyc/steps/DeclarationsStep.tsx`
- Add `hideDocumentUploads?: boolean` prop (default `false`)
- When `true`, hide the inner "PEP Declaration Form" upload card inside the PEP card.

### 4. `src/components/kyc/KycStepWizard.tsx`
- Add to `KycStepWizardProps`:
  - `showContactFields?: boolean`
  - `hideDocumentUploads?: boolean`
- Forward both into `IdentityStep`; forward `hideDocumentUploads` into `FinancialStep` and `DeclarationsStep`.

### 5. `src/components/client/ServiceWizardPeopleStep.tsx`
- Where `<KycStepWizard ... />` is rendered in the review split layout (~ line 1518), add:
  - `showContactFields={false}`
  - `hideDocumentUploads={true}`

No other callers change; all other `KycStepWizard` mount points keep the pre-B-031 behavior via the `false` defaults.

### 6. `package.json`
- `"dev": "next dev --port 3000"` → `"dev": "unset ANTHROPIC_API_KEY && next dev --port 3000"`

## Out of scope

- No schema changes
- No new fields on `client_profile_kyc`
- Admin portal untouched (scheduled for the future B-031-adjacent admin alignment batch — NOT this batch)
- The orphaned `client_profile_kyc.email/phone` columns remain (still a candidate for cleanup but not blocking)

## Verify

1. `npm run build` passes
2. Client KYC review for a person: no duplicate email/phone, no duplicate upload cards
3. `/kyc` standalone (primary client direct nav): unchanged — shows email/phone + upload cards
4. `/kyc/fill/[token]` external invite: unchanged
5. Admin wizard: unchanged (not touched by this batch)
6. After dev restart, upload a document: AI verification status transitions pending → verified / flagged (not stuck on pending and not silently manual_review)
