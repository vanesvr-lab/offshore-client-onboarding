# B-032 — Client KYC polish: shareholder label, work details merge, PEP yes/no

**Scope:** Client-only. Three UI fixes on the KYC review screen.

## Changes

### 1. Shareholder inline add — label clarity
`src/components/client/ServiceWizardPeopleStep.tsx` (~line 1336): when inline-adding a shareholder role to a person, label now reads `Shareholder %:` instead of `Shareholder:` so it pairs with the % input visually.

### 2. Single Work / Professional Details section
Previously: Identity step had a "Work / Professional Details" heading with only Occupation; Financial step had another "Work / Professional Details" heading with work address / phone / email (CDD+/EDD only).

Now: Occupation moves to FinancialStep's Work block, always visible. Work address / phone / email continue to render only for CDD+/EDD. IdentityStep no longer has a Work section.

- `src/components/kyc/steps/IdentityStep.tsx` — remove `Work / Professional Details` section
- `src/components/kyc/steps/FinancialStep.tsx` — Work block moved above SoF; Occupation always shown; work address/phone/email gated by `showWorkDetails` (unchanged)

No schema changes; `occupation` field still persists to `client_profile_kyc.occupation`.

### 3. PEP + Legal Issues — switch → Yes/No radio
`src/components/kyc/steps/DeclarationsStep.tsx`:
- Remove `Switch` import
- Add inline `YesNoRadio` component (radio group)
- PEP question and Legal Issues question use radio group
- Upload card for PEP Declaration Form remains visible regardless of PEP yes/no (you still sign a "not a PEP" form)
- Three-state handling: `is_pep` null = neither selected; true = Yes; false = No

## Out of scope
- AI verification split (B-033 candidate)
- Admin portal (separate alignment batch later)

## Verify
1. `npm run build` clean
2. Client KYC review for a shareholder: inline label reads `Shareholder %:`
3. Identity step: no "Work / Professional Details" heading; no Occupation field
4. Financial step: "Work / Professional Details" appears once, occupation first, then work address/phone/email for CDD+/EDD
5. Declarations step: PEP + Legal Issues show `[○ Yes]  [○ No]` radios
6. Selecting Yes reveals details textarea; No hides it
