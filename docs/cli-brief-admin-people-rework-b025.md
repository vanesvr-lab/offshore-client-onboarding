# CLI Brief: Admin People & KYC Section Rework (B-025)

**Date:** 2026-04-17
**Scope:** Admin service detail — People & KYC section only. Do NOT touch client pages.

---

## Overview

Major rework of the People & KYC section AND Documents section in the admin service detail page. Five main changes:

1. **New Add Director/Shareholder/UBO dialog** — proper centered modal with search, existing profile indicators, Individual/Corporation selection
2. **Per-person role management** — add/remove roles inline, edit profile, KYC adjusts based on profile type
3. **Ownership Structure** — collapsible section with editable percentages, positioned after add buttons
4. **Profile documents inside KYC** — passport, proof of address, PEP docs go inside each person's KYC section (not the service-level Documents section)
5. **Documents section = corporate docs only** — Certificate of Incorporation, Board Resolution, etc. stay in the separate Documents section

---

## 1. Add Profile Dialog Rework

**File:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — replace existing `AddProfileDialog`

Replace the current dropdown-style popup with a proper **centered Dialog modal**.

### Layout

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
│  │ 👤 Ramanov                                            │  │
│  │    ramanov@email.com                     ⚠ Director   │  │  ← grayed out, not selectable
│  ├────────────────────────────────────────────────────────┤  │
│  │ 👤 Steve Rogers                                       │  │  ← available, clickable
│  │    steve@email.com                                    │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │ (max 6 visible, scroll for more)                      │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ── Or create new ─────────────────────────────────────────  │
│                                                              │
│  Type:  ○ Individual    ○ Corporation                        │
│                                                              │
│  Full name / Corporation name *                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Email address                                               │
│  ┌────────────────────────────────────────────────────────┐  │
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│                              [Cancel]  [Add Director]        │
└──────────────────────────────────────────────────────────────┘
```

### Behavior

- **Search list**: max 6 items visible with overflow-y scroll. Search filters real-time by name or email.
- **Already-linked profiles**: show their current role(s) as gray badges (e.g., "Director, Shareholder"). These rows are **disabled** — grayed out, cursor not-allowed, cannot be selected.
- **Available profiles**: clickable, highlight on selection with blue border.
- **Create new section**: 
  - Radio buttons: Individual / Corporation
  - Name field (required)
  - Email field (optional)
- **On submit**: 
  - Existing profile: POST `/api/admin/services/[id]/roles` with `{ client_profile_id, role }`
  - New profile: POST `/api/services/[id]/persons` with `{ role, full_name, record_type }` (record_type: "individual" or "organisation")
  - After adding: close dialog, refresh, **auto-expand** the newly added person card

### Dialog title changes based on which button was clicked:
- "Add Director" / "Add Shareholder" / "Add UBO"

Use proper shadcn Dialog component (not a dropdown):
```tsx
<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-w-md">
    ...
  </DialogContent>
</Dialog>
```

Remember: shadcn/ui uses `@base-ui/react` — use `render` prop, not `asChild`.

---

## 2. PersonCard — Role Management + Edit Profile

### Per-person card expanded layout

```
┌────────────────────────────────────────────────────────────┐
│ 👤 Bruce Banner                              KYC: 36% [▼] │
│    Director  Shareholder  UBO                              │
│                                                            │
│    [✏ Edit Profile]  [Request KYC]  [Portal Access ✓]     │
│    ℹ Last request sent Apr 17 by Jane Doe                  │
│                                                            │
│  ── Roles ──────────────────────────────────────────────── │
│  ☑ Director                                    [Remove]    │
│  ☑ Shareholder  (25%)                          [Remove]    │
│  ☑ UBO                                         [Remove]    │
│  ☐ Add role: [Director ▾]                      [+ Add]     │
│                                                            │
│  ── KYC ────────────────────────────────────────────────── │
│  ▼ Identity          ████░░ 60%                            │
│    (fields rendered based on Individual vs Corporation)    │
│  ► Financial         ░░░░░░ 0%                             │
│  ► Declarations      ░░░░░░ 0%                             │
│  ► Work / Professional  ░░░░░░ 0%                          │
│                                                            │
│  [Save KYC]                                                │
└────────────────────────────────────────────────────────────┘
```

### Roles section inside PersonCard

Show all current roles with remove buttons. Add dropdown to assign additional roles.

- **Remove role**: DELETE `/api/admin/services/[id]/roles/[roleId]`
  - If person has multiple roles, removing one just removes that role row
  - If person has only one role, removing it removes them from the service entirely (with confirmation)
- **Add role**: dropdown showing roles not yet assigned to this person + "Add" button
  - POST `/api/admin/services/[id]/roles` with `{ client_profile_id, role }`
  - If adding "shareholder", show shareholding_percentage input

### Edit Profile button

Opens an inline edit section (or modal) with:
- Full name (editable)
- Email (editable)
- Phone (editable)
- Profile type (Individual / Corporation — read-only display, cannot change after creation)
- Save calls PATCH on the profile

### KYC adjusts based on profile type

Check `client_profiles.record_type`:

**Individual** (record_type = "individual"):
- Identity: full_name, aliases, date_of_birth, nationality, passport fields, email, phone, address
- Financial: source_of_funds, source_of_wealth, tax_id
- Declarations: PEP, legal issues
- Work/Professional: occupation, work_address, work_email, work_phone

**Corporation** (record_type = "organisation"):
- Company Details: full_name (company name), company_registration_number, jurisdiction_incorporated, date_of_incorporation, description_activity, industry_sector, listed_or_unlisted
- Tax/Financial: jurisdiction_tax_residence, tax_identification_number, regulatory_licenses
- Documents: corporate-specific doc uploads

The existing `KYC_SECTIONS` in the `KycLongForm` component should branch based on `record_type`. Check `client_profiles.record_type` and render appropriate sections.

### KYC requirements adjust based on roles

When a person is assigned as Director:
- Standard KYC + PEP declarations required

When assigned as Shareholder:
- Standard KYC + source of funds emphasis

When assigned as UBO:
- Enhanced due diligence, source of wealth required

For now, the fields are the same across roles — the difference is which DD requirements apply. This is already handled by the `due_diligence_requirements` table. Just ensure the KYC completion percentage accounts for all required fields based on the person's DD level.

---

## 3. Ownership Structure Section

### Position: After Add Director/Shareholder/UBO buttons

### Layout (collapsible)

```
┌──────────────────────────────────────────────────────────────┐
│  ▼ Ownership Structure                      75% / 100%      │
│    ⚠ Shareholding must total 100%                            │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Bruce Banner          ┌────┐  ████████░░░  25%             │
│                        │ 25 │%                               │
│                        └────┘                                │
│  Steve Rogers          ┌────┐  ██████████░  50%             │
│                        │ 50 │%                               │
│                        └────┘                                │
│  (Unallocated)                 ░░░░░░░░░░░  25%             │
│                                            ──────────────── │
│                                    Total:  75% / 100%        │
│                                                              │
│  [Save Ownership]                                            │
└──────────────────────────────────────────────────────────────┘
```

### Behavior

- Each shareholder has an **editable number input** for percentage
- Progress bar per shareholder (colored: blue for allocated)
- Unallocated row shows remaining (gray bar)
- Warning banner when total ≠ 100% (amber background)
- **"Save Ownership"** button: PATCH each shareholder's `profile_service_roles.shareholding_percentage`
- Collapsible — default open if total ≠ 100%
- Move the existing shareholding warning ("Shareholding: 0% — must total 100%") inside this section

### API

Use existing `PATCH /api/admin/services/[id]/roles/[roleId]` with `{ shareholding_percentage }` for each updated shareholder.

---

## 4. Document Split — Profile Docs Inside KYC, Corporate Docs in Documents Section

**CRITICAL CHANGE**: Documents must be split into two categories:

### Profile/KYC Documents (inside each person's KYC)

These are tied to a specific person via `documents.client_profile_id`:
- Certified Passport Copy
- Proof of Residential Address
- Bank Reference Letter (individual)
- Source of Funds Declaration
- PEP Declaration
- Any document type with category "kyc" in `document_types`

**Where they go:** Inside each person's KYC section, within the relevant sub-section:
- Identity section: Passport Copy, Proof of Address
- Financial section: Bank Reference, Source of Funds Declaration
- Declarations section: PEP Declaration

For each document slot:
- If uploaded: show file name, verification status, preview/download buttons
- If not uploaded: show upload button
- Admin can upload on behalf

**Per-person rendering:** If there are 3 profiles (Ramanov, Steve Rogers, Bruce Banner), each one has their OWN passport upload, proof of address upload, etc. inside their own KYC section.

```
▼ Ramanov — Director                          KYC: 36%
  ▼ Identity          ████░░ 60%
    Full legal name: Ramanov
    Date of birth: 04/13/1980
    ...
    ─── Documents ───
    📎 Certified Passport Copy      [Upload]
    📎 Proof of Residential Address  ✓ Uploaded  [Preview] [Download]
  ► Financial         ░░░░░░ 0%
  ► Declarations      ░░░░░░ 0%
```

**Implementation:** In the `KycLongForm` component, add document upload widgets at the bottom of each relevant section. Query documents by `client_profile_id` for each person. The `IdentityStep` in the client wizard already does this — reuse that pattern.

Pass these additional props to `KycLongForm`:
```ts
profileId: string;          // client_profiles.id — for document queries
serviceId: string;          // for upload context
profileDocuments: ServiceDoc[];  // pre-fetched docs for this profile
```

### Service/Corporate Documents (in the separate Documents section)

These are tied to the service, NOT to any individual person. They have `documents.service_id` set but `documents.client_profile_id` is null or irrelevant:
- Certificate of Incorporation
- Memorandum and Articles of Association
- Register of Directors
- Register of Shareholders
- Proof of Registered Address
- Certificate of Good Standing
- Board Resolution
- Any document type with category "corporate" in `document_types`

**Where they go:** The existing "Documents" collapsible section (Section 5). This section should:
- Filter to show ONLY corporate/service-level documents (where `document_types.category = 'corporate'`)
- NOT show KYC/profile documents (passport, address proof, etc.)
- Keep all existing features: AI verification, admin review, request update, preview, download

### How to distinguish

Use `document_types.category` to determine where each document belongs:
- `category = 'kyc'` → goes inside person's KYC section
- `category = 'corporate'` or `category = 'compliance'` → goes in the Documents section

If a document type doesn't have a category, default to the Documents section.

### Data query changes

In the server page, when fetching documents, include `document_types.category`:
```ts
supabase
  .from("documents")
  .select("*, document_types(id, name, category), client_profiles(id, full_name)")
  .eq("service_id", id)
  .eq("is_active", true)
```

Then split in the client component:
```ts
const profileDocs = documents.filter(d => d.document_types?.category === 'kyc');
const corporateDocs = documents.filter(d => d.document_types?.category !== 'kyc');
```

Group `profileDocs` by `client_profile_id` and pass to each person's `KycLongForm`.

## 5. Fix: KYC values — full_name from client_profiles

**Already fixed** in the latest commit. `KycLongForm` now accepts `profileName` prop for `full_name` since it lives on `client_profiles`, not `client_profile_kyc`. Same pattern already used for `email` and `phone`.

The remaining blank fields (passport, financial, declarations) are genuinely null in the DB — data was never filled for those profiles. Not a bug.

---

## Files to Modify

- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — major rework of AddProfileDialog, PersonCard, Ownership Structure section
- `src/app/api/services/[id]/persons/route.ts` — ensure POST accepts `record_type` for new profiles

## Files to Reuse

- `src/components/shared/InviteKycDialog.tsx` — for Request KYC button
- `src/components/ui/dialog.tsx` — proper Dialog for Add Profile

---

## CRITICAL RULES

1. Read `CLAUDE.md` for all project conventions
2. `npm run build` must pass clean before every commit
3. Update `CHANGES.md` in every commit
4. Commit and push after each logical batch
5. shadcn/ui uses `@base-ui/react` — use `render` prop, not `asChild`
6. Supabase join type inference — cast via `unknown` first
7. Deduplicate persons by profile ID (existing pattern — don't break it)
8. Toast position: `{ position: "top-right" }`
9. Do NOT touch client pages

## Verification

1. Click "Add Director" → proper centered modal opens
2. Search filters profiles, max 6 visible with scroll
3. Already-linked profiles show role badges and are disabled
4. Select existing profile → adds as director, card auto-expands
5. Create new Individual → KYC shows individual fields
6. Create new Corporation → KYC shows corporation fields
16. Profile docs (passport, address proof) appear INSIDE each person's KYC section
17. Each person has their own document upload slots
18. Documents section (Section 5) shows ONLY corporate docs (Certificate of Incorporation, etc.)
19. No KYC docs appear in the corporate Documents section
7. Expanded person card shows Roles section with add/remove
8. Remove a role → updates correctly, removes if last role
9. Add additional role → updates badge display
10. Ownership Structure shows editable percentages with progress bars
11. Save Ownership updates DB correctly
12. Warning shows when total ≠ 100%
13. KYC values display correctly (not blank) when data exists
14. Edit Profile saves name/email changes
15. `npm run build` passes clean
