# CLI Brief: Client View Parity with Admin (B-026)

**Date:** 2026-04-17
**Scope:** Client portal only — service wizard People & KYC step + Documents step. Do NOT touch admin pages.

---

## Overview

Align the client view with admin features. The client keeps its wizard flow (not long-form), but gets these four changes:

1. **Profile docs inside KYC** — passport, address proof upload slots inside each person's KYC wizard steps
2. **Documents step = corporate docs only** — Certificate of Incorporation, Board Resolution, etc.
3. **Ownership Structure visual** — bar chart with editable percentages (same as admin)
4. **Individual vs Corporation** — proper Add Profile dialog + Corporation KYC fields
5. **Role management per person** — add/remove roles inline

---

## 1. Profile Documents Inside KYC (CRITICAL)

### Current state
All documents (passport, address proof, corporate docs) are in the Documents step (step 5) as a flat list.

### Required change
Move profile/KYC documents into the person's KYC wizard. When a person clicks "Review KYC" and goes through Identity → Financial → Declarations steps:

**Identity step**: Add upload slots for:
- Certified Passport Copy
- Proof of Residential Address

**Financial step**: Add upload slots for:
- Bank Reference Letter
- Source of Funds Declaration

**Declarations step**: Add upload slots for:
- PEP Declaration (if applicable)

The existing `IdentityStep.tsx` already has document upload widgets (lines 98-148 show `DocumentUploadWidget` for passport and address). Verify this works when rendered from the `ServiceWizardPeopleStep` KYC review mode.

**Key**: Each person gets their OWN document upload slots. Documents are linked via `documents.client_profile_id`. If Ramanov uploads a passport, it's Ramanov's passport — not shared.

### Files to check/modify
- `src/components/kyc/steps/IdentityStep.tsx` — already has doc uploads, verify they work in wizard context
- `src/components/kyc/steps/FinancialStep.tsx` — add doc upload slots if not present
- `src/components/kyc/steps/DeclarationsStep.tsx` — add PEP doc upload if not present
- `src/components/client/ServiceWizardPeopleStep.tsx` — ensure KYC wizard receives document props

### Document type filtering
Use `document_types.category` to determine which docs belong in KYC:
- `category = 'kyc'` or `category = 'identity'` → inside person's KYC steps
- `category = 'corporate'` or `category = 'compliance'` → in Documents step

---

## 2. Documents Step = Corporate Docs Only

### Current state
`ServiceWizardDocumentsStep.tsx` shows ALL document types for the service template.

### Required change
Filter to show ONLY corporate/service-level documents:
```ts
const corporateDocTypes = requiredDocTypes.filter(
  dt => dt.category === 'corporate' || dt.category === 'compliance'
);
```

KYC docs (passport, address proof) should NOT appear here — they're in each person's KYC section now.

### Files to modify
- `src/components/client/ServiceWizardDocumentsStep.tsx` — filter out KYC docs

---

## 3. Ownership Structure Visual

### Current state
Simple text alert: "Shareholding: 0% of 100% — must reach 100%"

### Required change
Replace with visual ownership chart matching admin view:

```
┌──────────────────────────────────────────────────────────────┐
│  ▼ Ownership Structure                      75% / 100%      │
│    ⚠ Shareholding must total 100%                            │
├──────────────────────────────────────────────────────────────┤
│  Bruce Banner          ┌────┐  ████████░░░  25%             │
│                        │ 25 │%                               │
│  Steve Rogers          ┌────┐  ██████████░  50%             │
│                        │ 50 │%                               │
│  (Unallocated)                 ░░░░░░░░░░░  25%             │
│                                    Total:  75% / 100%        │
└──────────────────────────────────────────────────────────────┘
```

- Editable percentage inputs per shareholder
- Progress bars per person
- Unallocated row
- Total at bottom
- Collapsible section
- Warning when total ≠ 100%
- Position: after person cards and add buttons

### Files to modify
- `src/components/client/ServiceWizardPeopleStep.tsx` — replace text alert with visual ownership section

---

## 4. Individual vs Corporation + Add Profile Dialog

### Current state
`AddPersonModal` is a basic dialog with "Create new profile" (name only) or select existing. No Individual/Corporation distinction.

### Required change
Match the admin Add Profile dialog:

```
┌──────────────────────────────────────────────────────────────┐
│  Add Director                                          [✕]  │
│                                                              │
│  ── Search existing profiles ──────────────────────────────  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 🔍 Search by name or email...                         │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 👤 Ramanov                              ⚠ Director   │  │  ← disabled
│  │ 👤 Steve Rogers                                       │  │  ← selectable
│  │ 👤 Fabio                                              │  │
│  │ (max 6 visible, scroll)                               │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ── Or create new ─────────────────────────────────────────  │
│  Type:  ○ Individual    ○ Corporation                        │
│  Full name / Corporation name *  ┌─────────────────────┐    │
│                                  │                     │    │
│  Email address                   ┌─────────────────────┐    │
│                                  │                     │    │
│                              [Cancel]  [Add Director]        │
└──────────────────────────────────────────────────────────────┘
```

- Proper centered Dialog (not dropdown popup)
- Max 6 profiles visible with scroll
- Already-linked profiles show role badges and are disabled
- Individual / Corporation radio for new profiles
- After adding: auto-expand the new person card

### KYC adjusts based on type

When a Corporation profile is selected/created, the KYC wizard should render corporation-specific steps:
- Company Details (instead of Identity): company name, registration number, jurisdiction, date of incorporation, business description
- Tax/Financial: jurisdiction, tax ID, regulatory licenses
- Corporate Declarations: listed/unlisted, industry sector

For Individual: keep existing Identity → Financial → Declarations steps.

**Implementation**: Check `client_profiles.record_type` when rendering KYC. If "organisation", render a different set of wizard steps. The `KycStepWizard` may need a `profileType` prop to switch between Individual and Corporation step sets.

### Files to modify
- `src/components/client/ServiceWizardPeopleStep.tsx` — replace AddPersonModal with new dialog
- `src/components/kyc/KycStepWizard.tsx` — add Corporation step support (or create separate component)
- `src/app/api/services/[id]/persons/route.ts` — accept `record_type` in POST body

---

## 5. Role Management Per Person

### Current state
Each person card shows combined role badges but no way to add/remove individual roles.

### Required change
Add a Roles section inside each person card (when expanded or in the roster view):

```
── Roles ──────────────────────────
☑ Director                  [Remove]
☑ Shareholder  (25%)        [Remove]
☐ Add role: [UBO ▾]         [+ Add]
```

- Show current roles with remove buttons
- Dropdown to add roles not yet assigned
- If adding "shareholder", prompt for shareholding_percentage
- Remove role: DELETE `/api/services/[id]/persons/[roleId]`
- Add role: POST `/api/services/[id]/persons` with existing `client_profile_id` and new role
- If last role removed, remove person from service (with confirmation)

### Files to modify
- `src/components/client/ServiceWizardPeopleStep.tsx` — add roles section to PersonCard

---

## CRITICAL RULES

1. Read `CLAUDE.md` for all project conventions
2. `npm run build` must pass clean before every commit
3. Update `CHANGES.md` in every commit
4. Commit and push after each logical batch
5. Keep the wizard flow (Identity → Financial → Declarations → Review) — do NOT switch to long-form
6. shadcn/ui uses `@base-ui/react` — use `render` prop, not `asChild`
7. Toast position: `{ position: "top-right" }`
8. Do NOT touch admin pages
9. Profile documents are linked via `documents.client_profile_id`
10. Document type category distinguishes KYC vs corporate docs

## Verification

1. Person KYC wizard Identity step has passport + address upload slots
2. Financial step has bank reference + source of funds doc slots
3. Each person has their OWN document uploads (not shared)
4. Documents wizard step shows ONLY corporate docs
5. No passport/address docs in the Documents step
6. Ownership Structure shows visual chart with editable %
7. Warning when shareholding ≠ 100%
8. "Add Director" opens proper centered modal
9. Can create Individual or Corporation profile
10. Corporation profile shows different KYC fields
11. Role management: can add/remove roles per person
12. `npm run build` passes clean
