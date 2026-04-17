# CLI Brief: People & KYC Wizard Step Rework (B-019)

**Date:** 2026-04-17
**Scope:** Rework Step 4 (People & KYC) of the client service wizard only. Do NOT touch admin pages or steps 1-3/5.

---

## Problem

The current People & KYC step has confusing dual navigation — an inner "Continue to KYC" button plus the outer wizard nav buttons. Users don't know which buttons to click.

## New Design

Step 4 shows a **person roster** with KYC status per person. Each person has a **"Review KYC"** button that opens a focused KYC-only view. The outer wizard Next/Back buttons only navigate between wizard steps, not between persons.

---

## Person Roster (default view of Step 4)

```
┌──────────────────────────────────────────────────────────────┐
│  People & KYC                                                │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 👤 Bruce Banner — Director                            │  │
│  │    KYC: 45% complete                                  │  │
│  │    [Review KYC]  [Send Invite]  [✕ Remove]            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 👤 Steve Rogers — Shareholder (25%)                   │  │
│  │    KYC: 0% complete                                   │  │
│  │    [Review KYC]  [Send Invite]  [✕ Remove]            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ 👤 Ramanov — UBO                                      │  │
│  │    KYC: 0% complete                                   │  │
│  │    [Review KYC]  [Send Invite]  [✕ Remove]            │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  Shareholding: 25% of 100%                                   │
│                                                              │
│  [+ Add Director]  [+ Add Shareholder]  [+ Add UBO]         │
│                                                              │
└──────────────────────────────────────────────────────────────┘

Outer wizard nav: [Save & Close]  [← Back]  [Next →]
```

### Per-person card shows:
- Person name + role (+ shareholding % if shareholder)
- **KYC status**: percentage complete, calculated from `client_profile_kyc` fields
  - Use the same `countKycIncomplete()` logic from `src/lib/utils/pendingActions.ts`
  - Show as: "KYC: X% complete" with color (green if 100%, amber if partial, red if 0%)
- **"Review KYC" button** — opens the KYC review view (see below)
- **"Send Invite" button** — sends passwordless KYC invite (B-014 flow)
  - Calls `POST /api/admin/profiles/[id]/send-invite` (or create a client-accessible equivalent)
  - The invite sends an email with a link to `/kyc/fill/[token]` where the external person fills out their own KYC
  - Show "Invite Sent ✓" with timestamp if already sent (check `invite_sent_at` on `profile_service_roles` or `verification_codes`)
- **"Remove" button** — removes the person from the service (DELETE `/api/services/[id]/persons/[roleId]`)

### Add buttons:
- "Add Director" / "Add Shareholder" / "Add UBO" — reuse existing `ProfileSelector` pattern
- Calls POST `/api/services/[id]/persons` to link the profile

### Shareholding tracker:
- Shows total shareholding % for shareholders
- Warning if doesn't sum to ~100%

---

## Review KYC View (opened from "Review KYC" button)

When user clicks "Review KYC" on a person:

1. The roster view is **replaced** by a full KYC form for that person
2. Show person name + role at the top as a header
3. Render the `KycStepWizard` component in **compact mode** — this is the existing 3-4 step wizard (Identity → Financial → Declarations → Review)
4. **The outer wizard navigation (Save & Close / Back / Next) is HIDDEN** while in KYC review mode
5. Instead, show a **"← Back to People"** button at the top that exits the KYC view and returns to the roster
6. The KycStepWizard has its own internal navigation (Save & Continue between KYC steps)
7. When the user completes or exits the KYC wizard, they return to the roster with updated status

### Implementation approach:

Add state to `ServiceWizardPeopleStep.tsx`:
```tsx
const [reviewingProfileId, setReviewingProfileId] = useState<string | null>(null);
```

When `reviewingProfileId` is set:
- Hide the roster
- Show the KYC review header: "← Back to People" + "{Person Name} — {Role} KYC"
- Render `KycStepWizard` with compact mode for that person's `client_profile_kyc` data
- Pass `onComplete` callback that sets `reviewingProfileId = null` (returns to roster)

When `reviewingProfileId` is null:
- Show the normal roster view

### Hiding outer wizard nav during KYC review:

Pass a `hideNav` prop up from `ServiceWizardPeopleStep` to `ServiceWizard`:
```tsx
// In ServiceWizard.tsx
const [hideWizardNav, setHideWizardNav] = useState(false);

// Pass to PeopleStep
<ServiceWizardPeopleStep
  ...
  onNavVisibilityChange={setHideWizardNav}
/>

// Conditionally render nav
{!hideWizardNav && <ServiceWizardNav ... />}
```

---

## Send Invite Flow

The "Send Invite" button needs a client-accessible route. The existing `POST /api/admin/profiles/[id]/send-invite` is admin-only.

### Option A (Recommended): Create client-accessible invite route

**Create:** `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts`

```ts
// POST — Send KYC invite to a person linked to this service
// 1. Verify caller has can_manage=true for this service
// 2. Get the person's client_profile (email, full_name)
// 3. Create verification_codes row (token + 6-digit code, 72h expiry)
// 4. Send email via Resend with code + link to /kyc/fill/[token]
// 5. Update profile_service_roles.invite_sent_at
// 6. Return { ok: true, invite_sent_at }
```

Reuse the invite logic from `src/app/api/admin/profiles/[id]/send-invite/route.ts` — copy the verification code generation and email sending parts.

### Option B: Allow client to call admin invite route

Add an exception in the admin invite route for clients with `can_manage=true`. Less clean but less code.

**Go with Option A.**

---

## KYC Data Mapping

The `KycStepWizard` expects a `KycRecord` type (from the old `kyc_records` table). The new data comes from `client_profile_kyc`. The fields are the same — map them:

```ts
// In ServiceWizardPeopleStep, when opening KYC review:
const kycAsRecord = {
  id: person.client_profiles.client_profile_kyc.id,
  ...person.client_profiles.client_profile_kyc,
  // Fields that live on client_profiles, not client_profile_kyc:
  full_name: person.client_profiles.full_name,
  email: person.client_profiles.email,
  phone: person.client_profiles.phone ?? "",
  due_diligence_level: person.client_profiles.due_diligence_level,
} as KycRecord;
```

The KYC save route (`POST /api/kyc/save`) currently writes to `kyc_records`. You may need to create a client-accessible route that writes to `client_profile_kyc` instead, OR update the existing route to handle both tables.

**Check:** Does `POST /api/kyc/save` already work with `client_profile_kyc`? If not, create `POST /api/services/[id]/kyc/save` that writes to `client_profile_kyc`.

---

## Files to Create

- `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` — client invite route
- `src/app/api/services/[id]/kyc/save/route.ts` — client KYC save to client_profile_kyc (if needed)

## Files to Modify

- `src/components/client/ServiceWizardPeopleStep.tsx` — replace current content with roster + Review KYC toggle
- `src/components/client/ServiceWizard.tsx` — add `hideWizardNav` state, pass to PeopleStep
- `src/components/client/ServiceWizardNav.tsx` — no change needed (just conditionally hidden)

## Files to Reuse

- `src/components/kyc/KycStepWizard.tsx` — compact mode for inline KYC review
- `src/components/shared/ProfileSelector.tsx` — for adding persons
- `src/lib/utils/pendingActions.ts` — `countKycIncomplete()` for KYC status %

---

## CRITICAL RULES

1. Read `CLAUDE.md` for all project conventions
2. `npm run build` must pass clean before every commit
3. Update `CHANGES.md` in every commit
4. Commit and push after each logical batch
5. Use `createAdminClient()` for server-side queries
6. Use `getTenantId(session)` on EVERY new query
7. shadcn/ui uses `@base-ui/react` — use `render` prop, not `asChild`
8. Supabase join type inference — cast via `unknown` first
9. Do NOT touch admin pages or wizard steps 1-3/5
10. The `address` column was just added to `client_profile_kyc` — it exists now

## Don't ask — just build

Owner is working on other changes in parallel. Make reasonable choices.

## Verification

1. Login as client (`vanes_vr@yahoo.com` / `Test1234!`)
2. Go to service → wizard → Step 4 (People & KYC)
3. See person roster with KYC status % per person
4. Click "Review KYC" → KYC form opens, outer wizard nav hidden
5. Fill KYC fields → save works (no errors)
6. Click "← Back to People" → returns to roster with updated status
7. Click "Send Invite" → invite sent (check server logs for email)
8. Add a new person via "Add Director" → appears in roster
9. Outer Next/Back buttons work to navigate to Step 3 and Step 5
10. `npm run build` passes clean
