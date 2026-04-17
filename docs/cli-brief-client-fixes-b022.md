# CLI Brief: Client Portal Fixes (B-022)

**Date:** 2026-04-17
**Scope:** Client portal only. Do NOT touch admin pages.

---

## 10 Fixes

### 1. Dashboard "Review and Complete" should open wizard
When user clicks "Review and Complete" from the dashboard service card, it should navigate to `/services/[id]` AND automatically open the wizard at step 1. Pass a query param: `/services/[id]?startWizard=true`. In `ClientServiceDetailClient.tsx`, read this param and auto-enter wizard mode on mount.

### 2. "Back to overview" link color
**File:** `src/components/client/ServiceWizard.tsx` or `ClientServiceDetailClient.tsx`

The "← Back to overview" link is gray and looks inactive. Change to:
- Default: `text-blue-600` 
- Hover: `hover:text-blue-800 font-semibold`
- Also rename from "Back to overview" to **"Back to Dashboard"**

### 3. Country search dropdown — too light and too wide
**File:** `src/components/shared/MultiSelectCountry.tsx` or wherever the country search renders

- Text color too light — make placeholder darker (`placeholder:text-gray-400` → `placeholder:text-gray-500`)
- Input text should be `text-gray-900`
- Reduce width: the dropdown input should match the standard input field width (not full-width). Use `max-w-md` or match adjacent input widths.

### 4. Mandatory field labels red when partially filled
**File:** Wizard step components (`ServiceWizardStep.tsx`) and/or `DynamicServiceForm.tsx`

When a form is partially filled (some fields have values, some don't), mandatory fields that are still empty should have their label text in red (`text-red-600`). Fields that are filled keep normal label color.

Logic: if field has `required: true` in the service_fields definition AND the current value is empty/null/undefined, render the label with `text-red-600`. Otherwise normal.

### 5. KYC Review — show Save/Next at bottom with scroll
**File:** `src/components/client/ServiceWizardPeopleStep.tsx`

When user clicks "Review KYC" on a person, the KYC form should render with:
- Fixed bottom bar with Save/Next navigation (same as the wizard nav pattern)
- Scrollable content area above the fixed bar
- Currently the KYC review has no bottom nav — add it using the `KycStepWizard`'s built-in navigation

Ensure the KYC wizard compact mode renders with its internal step navigation visible and the content scrolls properly.

### 6. Invite popup — close on send + show "Email Sent" toast
**File:** `src/components/client/ServiceWizardPeopleStep.tsx` (InviteDialog)

When user clicks "Send Request":
1. Send the invite (existing logic)
2. Close the popup immediately on success
3. Show toast: `toast.success("Email Sent", { position: "top-right" })` (same position as the moved "Saved" toast)

Check that the popup closes — `onClose()` should be called after successful send. The existing code may already do this but verify.

### 7. Unsaved changes warning on navigation
**File:** `src/components/client/ServiceWizard.tsx` and/or `ClientServiceDetailClient.tsx`

When user has modified form fields and clicks "Back to Dashboard" or any navigation link without saving:
- Show a confirmation dialog: "You have unsaved changes. Are you sure you want to leave?"
- Two buttons: "Leave without saving" and "Stay"
- Track dirty state: compare current `serviceDetails` to the original values passed as props

Implementation: use `beforeunload` event for browser back/refresh, and intercept the "Back to Dashboard" click with a state check.

### 8. Documents — reuse KYC-uploaded docs
**File:** `src/components/client/ServiceWizardDocumentsStep.tsx` and/or the document upload logic

If a user uploaded a passport or proof of address during the KYC step, and the same document type is required in the Documents section, it should already show as uploaded. Don't require re-upload.

The KYC step uploads documents to the `documents` table with `client_profile_id` set. The Documents step should query documents by both `service_id` AND `client_profile_id` for linked profiles, so KYC-uploaded docs appear in the documents list.

Fix: when computing which documents are uploaded, query:
```ts
// All docs for this service OR for any profile linked to this service
const { data: allDocs } = await supabase
  .from("documents")
  .select("*, document_types(name, category)")
  .or(`service_id.eq.${serviceId},client_profile_id.in.(${profileIds.join(",")})`)
  .eq("is_active", true);
```

### 9. Documents upload — foreign key error on client_id
**Error:** `insert or update on table "documents" violates foreign key constraint "documents_client_id_fkey"`

The `documents` table has a `client_id` column that references the old `clients` table. When uploading from the new service wizard, there's no `client_id` available (the new model uses `service_id` + `client_profile_id` instead).

**Fix options (pick one):**

**Option A (recommended):** Make `client_id` nullable on the documents table. The wizard uploads should set `service_id` and `client_profile_id` but leave `client_id` as NULL.

Run this SQL (document in CHANGES.md for the user to run):
```sql
ALTER TABLE documents ALTER COLUMN client_id DROP NOT NULL;
```

Then update the upload route to not require client_id when service_id is provided.

**Option B:** Look up the client_id from the service's linked profiles. Find the client via `client_users` table for the profile's user_id.

Go with Option A — cleaner and forward-compatible.

**File to check:** `src/app/api/documents/upload/route.ts` — find where `client_id` is set on insert and make it optional when `service_id` is provided.

Also check the wizard's document upload — it may be passing an empty or invalid `client_id`. Ensure it passes `service_id` and `client_profile_id` instead.

### 10. "Back to People" in KYC Review — same color fix
Same as fix #2 — the "← Back to People" link in the KYC review mode is likely gray too. Change to `text-blue-600 hover:text-blue-800`.

---

## SQL Migration Needed (user must run manually)

For fix #9, the user needs to run:
```sql
ALTER TABLE documents ALTER COLUMN client_id DROP NOT NULL;
```

Document this clearly in CHANGES.md.

---

## CRITICAL RULES

1. Read `CLAUDE.md` for all project conventions
2. `npm run build` must pass clean before every commit
3. Update `CHANGES.md` in every commit
4. Commit and push after each logical batch
5. Do NOT touch admin pages
6. Toast position: use `{ position: "top-right" }` for all toasts in client portal
7. shadcn/ui uses `@base-ui/react` — use `render` prop, not `asChild`

## Verification

1. Dashboard "Review and Complete" → opens wizard at step 1
2. "Back to Dashboard" link is blue, bold on hover
3. Country dropdown is normal width, text is visible
4. Empty mandatory fields have red labels when form is partially filled
5. KYC Review has Save/Next bar at bottom, content scrolls
6. Invite send → popup closes → "Email Sent" toast top-right
7. Modify fields → click Back to Dashboard → unsaved changes warning
8. Upload passport in KYC → same doc shows in Documents section
9. Document upload works without client_id foreign key error
10. "Back to People" link is blue
11. `npm run build` passes clean
