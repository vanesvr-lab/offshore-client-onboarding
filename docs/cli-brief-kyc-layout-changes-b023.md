# CLI Brief: KYC Layout Changes — Admin + Client (B-023)

**Date:** 2026-04-17
**Scope:** KYC sections in BOTH admin service detail AND client wizard People & KYC step.

---

## 4 Changes

### 1. Admin People & KYC — Collapsible Person Cards with Inline KYC

**File:** `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx`

Replace the current PersonCard + separate KycLongForm with a new pattern:

**Person cards are collapsible.** Each card shows:
- Name, combined role badges, KYC % progress bar
- "Request to Fill and Review KYC" button (opens invite popup — same as client view's `InviteDialog`)
- "Last request sent on Apr 17 by Bruce Banner" info line (if invite was sent). Get `invite_sent_at` from `profile_service_roles` and sender name from the user who sent it.
- Expand chevron [▼]

**When expanded:** Shows 3 collapsible KYC sub-sections, each with RAG dot + progress %:
- **Your Identity** — full_name, aliases, date_of_birth, nationality, passport_country, passport_number, passport_expiry, email, phone, address + document uploads (Passport, Proof of Address)
- **Financial** — source_of_funds_description, source_of_wealth_description, tax_identification_number
- **Declarations** — is_pep, pep_details, legal_issues_declared, legal_issues_details

Each sub-section is collapsible (expand to see/edit fields). Save KYC button at bottom.

**Reuse** the existing `KycLongForm` component already in the file — it has the exact collapsible section pattern. Just wire it into the expandable PersonCard instead of being behind a separate "Review KYC" toggle.

**The invite popup** should be the same as the client view's `InviteDialog` from `src/components/client/ServiceWizardPeopleStep.tsx`. Either:
- Extract it into a shared component `src/components/shared/InviteKycDialog.tsx`
- Or copy the pattern into the admin PersonCard

The invite popup should pre-fill the email from `person.client_profiles.email`.

### 2. Client People & KYC — Add "Last request sent" Info

**File:** `src/components/client/ServiceWizardPeopleStep.tsx`

The client already has the "Request to fill and review KYC" button + InviteDialog. Add the "Last request sent on {date} by {name}" info line below it.

Currently `inviteSentAt` is tracked but the sender name is not. Update the invite API response and the person data to include the sender name:
- `profile_service_roles.invite_sent_by` — this should contain the sender's user_id
- Query the sender's name when displaying

If `invite_sent_by` is not available, just show "Last request sent on Apr 17" without the sender name.

### 3. Move Email + Phone to Identity Section

**Files:**
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` (KycLongForm / KYC_SECTIONS)
- `src/components/client/ServiceWizardPeopleStep.tsx` (if it has KYC field definitions)
- `src/components/kyc/steps/IdentityStep.tsx` (client wizard step)

Add `email` and `phone` fields to the Identity section in the KYC long-form.

**Important:** These fields live on `client_profiles` (not `client_profile_kyc`). When saving, the save route needs to handle them differently — update `client_profiles.email` and `client_profiles.phone` instead of `client_profile_kyc`.

In the admin `KYC_SECTIONS` constant, add to the Identity section:
```
{ key: "email", label: "Email address", type: "text" },
{ key: "phone", label: "Phone number", type: "text" },
```

In the `mapToKycRecord` function (client side) and the KycLongForm (admin side), ensure email and phone are included in the form data and saved correctly.

The save route (`/api/profiles/kyc/save`) should check if `email` or `phone` are in the fields and update `client_profiles` instead of `client_profile_kyc` for those two fields.

### 4. Move Occupation to Work/Professional Details

**Files:** Same as #3

In the KYC long-form sections, move `occupation` out of Identity and into a new or existing section:

**Admin KYC_SECTIONS:** Change the Identity section to remove `occupation`. Add a new section or rename:
```
{
  title: "Work / Professional Details",
  fields: [
    { key: "occupation", label: "Occupation", type: "text" },
    { key: "work_address", label: "Work address", type: "textarea" },
    { key: "work_email", label: "Work email", type: "text" },
    { key: "work_phone", label: "Work phone", type: "text" },
  ],
},
```

**Client IdentityStep:** Move the occupation field out. Either:
- Create a new step/section for Work/Professional Details
- Or add it to the Financial step (since it's related to source of funds context)

**Recommended:** Add "Work / Professional Details" as a sub-section within the Identity step for the client wizard (keep it simple — don't add a whole new wizard step). In the admin long-form, add it as a 4th collapsible section.

### 5. Pre-fill Email in Invite Popup

**Files:**
- `src/components/client/ServiceWizardPeopleStep.tsx` (InviteDialog)
- Admin equivalent invite dialog

The InviteDialog already pre-fills email from `person.client_profiles?.email`. Verify this works in both admin and client views. If the admin doesn't have an InviteDialog yet, create one using the same pattern.

---

## Files to Create
- `src/components/shared/InviteKycDialog.tsx` (optional — shared invite popup for both admin and client)

## Files to Modify
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — collapsible person cards, invite button + info, KYC sections with email/phone/occupation moves
- `src/components/client/ServiceWizardPeopleStep.tsx` — add "last request sent" info, email/phone in identity
- `src/components/kyc/steps/IdentityStep.tsx` — move occupation, add email/phone if not already there
- `src/app/api/profiles/kyc/save/route.ts` — handle email/phone writes to client_profiles
- `src/lib/utils/pendingActions.ts` — update KYC field lists if needed

---

## CRITICAL RULES

1. Read `CLAUDE.md` for all project conventions
2. `npm run build` must pass clean before every commit
3. Update `CHANGES.md` in every commit
4. Commit and push after each logical batch
5. Deduplicate persons by profile ID in admin view (already done — don't break it)
6. The `address` column exists on `client_profile_kyc` (added earlier)
7. `email` and `phone` live on `client_profiles`, not `client_profile_kyc` — save route must handle this
8. Use `createAdminClient()` for server-side queries
9. Toast position: `{ position: "top-right" }`

## Verification

1. Admin service detail → People & KYC → person cards are collapsible
2. Expand person → 3-4 collapsible KYC sub-sections with RAG + %
3. Identity section has email + phone fields
4. Occupation is in "Work / Professional Details" section
5. "Request to Fill and Review KYC" button opens popup with pre-filled email
6. "Last request sent on Apr 17 by Bruce Banner" shows after sending
7. Save KYC works (email/phone save to client_profiles, rest to client_profile_kyc)
8. Client wizard People & KYC has same "last request sent" info
9. Client KYC Identity step has email + phone, occupation moved
10. `npm run build` passes clean
