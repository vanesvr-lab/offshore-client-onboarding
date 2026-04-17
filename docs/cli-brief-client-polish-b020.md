# CLI Brief: Client Portal Polish (B-020)

**Date:** 2026-04-17
**Scope:** Client portal only. Do NOT touch admin pages.
**DB prerequisite:** `documents.tenant_id` column has been added. Schema cache reloaded.

---

## 8 Changes

### 1. Dashboard Greeting
**File:** `src/components/client/DashboardClient.tsx`

Change the greeting from:
```
Hi Bruce Banner, please provide the missing information below to complete your application.
Click any item below to go directly to that section.
```
To:
```
Welcome Bruce Banner
Please provide the missing information to complete your application.
```

"Welcome" on first line (larger text), instruction on second line (smaller text).

### 2. Dashboard Service Cards — Add Status + Progress Bar + Collapsible Sections

**File:** `src/components/client/DashboardClient.tsx` + `src/app/(client)/dashboard/page.tsx`

**Remove** the current "ACTION NEEDED" section with individual action items.

**Rework each service card** to show:
```
┌────────────────────────────────────────────────────────────┐
│  Global Business Corporation (GBC)                         │
│  Draft · 45% complete  ████████░░░░░░░░░░                  │
│                                    [Review and Complete →] │
│                                                            │
│  ▼ (collapsible — click to expand)                         │
│  ┌──────────────────────────────────────────────────────┐  │
│  │ ✅ Company Setup          Complete       [Review >]  │  │
│  │ ✅ Financial              Complete       [Review >]  │  │
│  │ ✅ Banking                Complete       [Review >]  │  │
│  │ ❌ People & KYC           Incomplete     [Review >]  │  │
│  │ ❌ Documents              Incomplete     [Review >]  │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
```

- **Status badge** next to service name (Draft, Submitted, In Review, Approved, Rejected) — use friendly labels from `src/lib/utils/clientLabels.ts`
- **Progress bar** showing overall completion %
- **"Review and Complete"** button → navigates to `/services/[id]` which shows the landing page with wizard
- **Collapsible** (default collapsed): shows the 5 sections with Complete/Incomplete indicator
- **Per-section "Review >"** button in the collapsible → navigates to `/services/[id]` and enters wizard at that step. Pass step index as query param: `/services/[id]?wizardStep=3` for People & KYC

The dashboard page.tsx needs to compute section completion for each service (reuse `calcServiceDetailsCompletion`, `calcPeopleKycCompletion`, `calcDocumentsCompletion` from `src/lib/utils/serviceCompletion.ts`). The dashboard already fetches persons and documents per service — pass this data to DashboardClient.

### 3. Wizard Toast Position

**File:** `src/components/client/ServiceWizard.tsx` or wherever the save toast is called

The "Saved" toast notification covers the Next button. Change the toast position:
```ts
toast.success("Saved", { position: "top-right" });
```
Or use `{ position: "top-center" }` — just NOT bottom-right where it covers the nav.

Find all `toast.success` and `toast.error` calls in the wizard components and set position to `"top-right"`.

### 4. KYC Invite — "Request to fill and review KYC" with Email Popup

**File:** `src/components/client/ServiceWizardPeopleStep.tsx`

Replace the current "Send Invite" button with **"Request to fill and review KYC"** button.

When clicked, opens a **dialog/modal** with:
```
┌──────────────────────────────────────────────┐
│  Request KYC from Ramanov                    │
│                                              │
│  Email address                               │
│  ┌────────────────────────────────────────┐  │
│  │ ramanov@email.com                      │  │ (pre-filled from profile)
│  └────────────────────────────────────────┘  │
│                                              │
│  Additional note (optional)                  │
│  ┌────────────────────────────────────────┐  │
│  │                                        │  │
│  │                                        │  │
│  └────────────────────────────────────────┘  │
│                                              │
│              [Cancel]  [Send Request]        │
└──────────────────────────────────────────────┘
```

- Email field pre-filled from `person.client_profiles.email` (editable)
- Optional note textarea
- On "Send Request": call the existing invite endpoint with the note
- After sending: show "Request sent ✓" with date (same as current "Invite sent" behavior)

### 5. KYC Invite Email Body

**File:** `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts`

Update the email template to:

**Subject:** Complete your KYC — {Service Name} at GWMS

**Body:**
```
Dear {Person Name},

You have been added as a {Director, Shareholder, UBO} for the {Service Name} at GWMS.

Please click on the link below to complete your KYC information.

[Complete my KYC profile →] (link to /kyc/fill/[token])

Your verification code is: {6-digit code}

--- (keep existing instructions about the code) ---

This email was autogenerated on behalf of {Sender's full name}.

Sender's Note: {note text}
(only show this line if a note was provided)
```

The sender's name comes from the session (`session.user.name`).
The roles should be comma-separated (e.g., "Director, Shareholder, UBO").
The note comes from the request body — add `note?: string` to the POST body.

### 6. Documents Upload — tenant_id

**Check:** The `documents.tenant_id` column has been added to the DB. But the upload route may not be setting it.

**File:** `src/app/api/documents/upload/route.ts` (or wherever docs are uploaded)

Ensure `tenant_id` is set when inserting a new document:
```ts
const tenantId = getTenantId(session);
// In the insert:
{ ...docData, tenant_id: tenantId }
```

Also check `src/app/api/services/[id]/documents/route.ts` if it exists.

Also check any document queries that filter by `tenant_id` — they should now work since the column exists.

### 7. AI Verification — Per-Doc on Upload + Submit Validation Popup

**Per-doc on upload (existing):** The existing AI verification flow at `src/app/api/verify-document/route.ts` already runs when a document is uploaded. Make sure this is still wired up in the wizard's document upload step. If the upload step calls `/api/documents/upload`, check if it also triggers `/api/verify-document`.

**Submit validation popup:**

**File:** Create `src/components/client/SubmitValidationDialog.tsx`

When the user clicks "Submit" on the last wizard step:
1. Show a modal: "Validating your application..." with a spinner
2. Call a new API route: `POST /api/services/[id]/validate`
3. The API runs validation checks:
   - All required service fields filled
   - At least 1 director linked
   - Shareholding sums to ~100% (if shareholders exist)
   - All persons have KYC completion_status = "complete" (or KYC % > threshold)
   - All required documents uploaded
   - Document AI verification results (check for "flagged" or "rejected" docs)
4. Return `{ valid: boolean, issues: { section: string, message: string }[] }`
5. If valid: modal shows "All checks passed! ✓" with "Submit Application" button
6. If issues: modal shows list of issues with "Go Back and Fix" button

**Create API route:** `src/app/api/services/[id]/validate/route.ts`
- Auth: verify `can_manage=true` for the service
- Run all validation checks listed above
- Return validation result

**Update wizard submit flow:**
In `ServiceWizard.tsx`, the `handleSubmit` function should:
1. First call validate endpoint
2. Show dialog with results
3. Only proceed with actual submit (PATCH status to "submitted") if validation passes and user confirms

---

## Files to Create
- `src/components/client/SubmitValidationDialog.tsx`
- `src/app/api/services/[id]/validate/route.ts`

## Files to Modify
- `src/components/client/DashboardClient.tsx` — greeting + service cards rework
- `src/app/(client)/dashboard/page.tsx` — pass section completion data
- `src/components/client/ServiceWizard.tsx` — toast position + submit validation flow
- `src/components/client/ServiceWizardPeopleStep.tsx` — invite button → popup with email + note
- `src/app/api/services/[id]/persons/[roleId]/send-invite/route.ts` — email body + note
- `src/app/api/documents/upload/route.ts` — add tenant_id on insert

## Files to Reuse
- `src/lib/utils/serviceCompletion.ts` — section completion calcs
- `src/lib/utils/clientLabels.ts` — friendly status labels
- `src/app/api/verify-document/route.ts` — existing AI doc verification

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
9. Do NOT touch admin pages
10. `documents.tenant_id` column already exists in DB — just use it in queries/inserts
11. Toast position: use `{ position: "top-right" }` to avoid covering wizard nav

## Verification

1. Dashboard: "Welcome Bruce Banner" greeting
2. Service cards show status badge + progress bar + collapsible sections
3. Collapsible has per-section Review buttons that jump to wizard step
4. Wizard "Saved" toast doesn't cover Next button
5. "Request to fill and review KYC" opens popup with email + note
6. Invite email has correct body with roles, service name, sender info, note
7. Document upload works without tenant_id error
8. Submit → validation popup → shows pass or issues
9. Per-doc AI verification still runs on upload
10. `npm run build` passes clean
