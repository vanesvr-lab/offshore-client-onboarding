# CLI Brief: KYC Document Layout Rework — Admin + Client (B-027)

**Date:** 2026-04-18
**Scope:** BOTH admin and client views — person card KYC layout.

---

## Overview

Rework how documents and profile info are displayed within each person's expanded KYC card. Both admin and client views get the same top section layout, with minor differences in what actions are available.

---

## 1. Person Card Layout — Top Section (BOTH VIEWS)

When a person card is expanded (admin: click to expand, client: "Review KYC"), show a **fixed top section** split into two halves, with KYC details below.

### Layout

```
┌──────────────────────────────────────────────────────────────┐
│ 👤 Ramanov  Director  UBO  Individual      KYC: 40%    [▼] │
│    ████████░░░░░░░░░░                                       │
│    ⊘ Portal access  [✉ Request KYC]  ✉ Sent Apr 17        │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────┬─────────────────────────────┐  │
│  │  PROFILE (compact)       │  KYC DOCUMENTS    1/5       │  │
│  │                          │                             │  │
│  │  Email                   │  ☐ Passport Copy   [Upload] │  │
│  │  vanes.vr@gmail.com      │  ☑ Proof of Addr  ✓⚠ [👁]  │  │
│  │  Phone                   │  ☐ Bank Ref       [Upload]  │  │
│  │  +230 555 1234           │  ☐ Source of Funds [Upload]  │  │
│  │                          │  ☐ PEP Decl       [Upload]  │  │
│  │  [Save] [Cancel]         │                             │  │
│  │                          │  (scrollable if > 5 docs)   │  │
│  │  ── ROLES ────────────── │                             │  │
│  │  Director         Remove │                             │  │
│  │  UBO              Remove │                             │  │
│  │  [Shareholder ▾] [+Add] │                             │  │
│  └──────────────────────────┴─────────────────────────────┘  │
│                                                              │
│  ── KYC DETAILS (step wizard for client / long-form admin) ─ │
│  ▼ Your Identity          ████░░ 60%                        │
│    Full name, DOB, passport fields...                       │
│    📎 Passport Copy: ☑ Already uploaded (from doc list)     │
│    📎 Proof of Address: ☑ Already uploaded                  │
│  ► Financial              ░░░░░░ 0%                         │
│  ► Declarations           ░░░░░░ 0%                         │
│  ► Work / Professional    ░░░░░░ 0%                         │
│  [Save KYC]                                                  │
└──────────────────────────────────────────────────────────────┘
```

### Header row
- Person name + role badges + **profile type** (Individual/Corporation) + KYC %
- Progress bar
- Portal access toggle (admin only), Request KYC button, last sent info

### Left half — Profile (compact)
- Email (editable)
- Phone (editable)
- [Save] [Cancel] buttons (only show when edited)
- Roles section: list current roles with Remove, dropdown to add new role
- **Compact** — no full_name field here (it's in the header), no profile type field (it's in the header badge)
- Save calls the profile update API

### Right half — KYC Documents (scrollable)
- **Distinct list of ALL KYC documents required** for this person based on DD level
- Document types to include: `category IN ('identity', 'financial', 'compliance')`
- Derive required docs from `due_diligence_requirements` where `requirement_type = 'document'` for this person's DD level
- If no DD requirements configured, fall back to all document_types with those categories

**Per document row (compact — just icons):**

Not uploaded:
```
☐ Certified Passport Copy          [Upload]
```

Uploaded:
```
☑ Proof of Address  ✓ ⚠ 📩       [👁]
```

Status icons (small, inline):
- ✓ = AI verified (green)
- ⚠ = AI flagged (amber) 
- ✗ = AI rejected (red)
- 🟢 = admin approved (green dot)
- 🟡 = admin pending (gray dot)
- 🔴 = admin rejected (red dot)
- 📩 = update requested
- [👁] = click to open Document Detail Popup

**Scroll**: if more than ~5-6 documents, add `overflow-y-auto max-h-[240px]` so the list scrolls within the panel.

**Progress**: "X of Y uploaded" at bottom of the panel.

### Top section stays visible
- **Admin**: top section is always visible when the person card is expanded. KYC long-form sections scroll below.
- **Client**: top section stays visible as user navigates through KYC wizard steps (Identity → Financial → Declarations). The step indicator already exists — keep it as is.

---

## 2. Document Detail Popup (BOTH VIEWS)

When user clicks on a document row (or the [👁] icon), open a **Dialog popup** with full details:

```
┌──────────────────────────────────────────────────────────────┐
│  Proof of Residential Address                          [✕]  │
│  Uploaded Apr 16 by Ramanov                                  │
│                                                              │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              [Document Preview]                        │  │
│  │              (image / PDF inline viewer)                │  │
│  └────────────────────────────────────────────────────────┘  │
│                                                              │
│  ── AI Verification ───────────────────────────────────────  │
│  Confidence: 45%        Rules: 3/5 passed                   │
│  ⚠ Address does not match KYC record                        │
│  ⚠ Document older than 3 months                             │
│                                                              │
│  ── Extracted Fields ──────────────────────────────────────  │
│  Name: Ramanov                                               │
│  Address: 16 Twin Oaks Rd                                    │
│  Issue Date: Jan 2025                                        │
│                                                              │
│  ── Admin Review (ADMIN ONLY) ─────────────────────────────  │
│  Status: ○ Pending                                           │
│  [✓ Approve]  [✗ Reject]                                    │
│  Rejection reason: ┌─────────────────────────────────────┐  │
│                     │                                     │  │
│                     └─────────────────────────────────────┘  │
│                                                              │
│  ── Request Update (ADMIN ONLY) ───────────────────────────  │
│  Send to: [Ramanov ▾] or [Representative ▾]                │
│  Note: ┌─────────────────────────────────────────────────┐  │
│        │                                                 │  │
│        └─────────────────────────────────────────────────┘  │
│  ☐ Auto-populate from AI flags                               │
│  [Send Request]                                              │
│                                                              │
│  📩 Previous: "Please re-upload..." — Apr 17 by Jane Doe   │
│                                                              │
│  [⬇ Download]  [🔄 Re-verify]  [Replace Document]          │
└──────────────────────────────────────────────────────────────┘
```

**Client view**: same popup but WITHOUT Admin Review and Request Update sections. Shows:
- Preview
- AI verification (confidence, flags) — so client knows if doc needs re-uploading
- Extracted fields
- Download
- Replace Document (upload new version)

**Admin view**: full popup with all sections including approve/reject and request update.

### Implementation
Create a shared component: `src/components/shared/DocumentDetailDialog.tsx`
- Props: `doc`, `isAdmin`, `recipients` (for request update), `onStatusChange`, `onRequestSent`
- Reuse `DocumentPreviewDialog` for the preview area
- Reuse existing approve/reject logic from `ServiceDetailClient`
- Reuse `DocumentUpdateRequestDialog` for request update

---

## 3. KYC Section — Document Status Checkmarks

In the KYC detail sections below the top area, where document upload slots currently exist (e.g., "Upload Certified Passport Copy" in Identity section):

- **If the document was already uploaded** (matched by document_type_id from the right panel): show a **checkmark** with "Already uploaded" label. Clicking opens the Document Detail Popup.
- **If not uploaded**: show the existing upload widget as-is (user can upload from either place — the right panel or the section).
- **Both upload locations create the same document record** — linked via `client_profile_id` + `document_type_id`. No duplicates.

---

## 4. Fix Category Filter

**CRITICAL**: Replace ALL instances of `category === "kyc"` with the correct categories.

### Profile/KYC documents (inside person cards):
```ts
const KYC_DOC_CATEGORIES = ["identity", "financial", "compliance"];
const isKycDoc = (category: string) => KYC_DOC_CATEGORIES.includes(category);
```

### Service/Corporate documents (Documents section):
```ts
const SERVICE_DOC_CATEGORIES = ["corporate", "additional"];
const isServiceDoc = (category: string) => SERVICE_DOC_CATEGORIES.includes(category);
```

### Files to update:
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — line 580 `category === "kyc"` and line 1877-1878
- `src/components/client/ServiceWizardDocumentsStep.tsx` — filter to corporate/additional only
- `src/components/client/ServiceWizardPeopleStep.tsx` — filter to identity/financial/compliance for person docs
- `src/lib/utils/pendingActions.ts` — if it checks doc categories
- `src/lib/utils/serviceCompletion.ts` — if it checks doc categories

---

## 5. Role Dropdown Fix

In the per-person role management dropdown (add role), filter out roles the person already has:

```ts
const existingRoles = new Set(personRoleRows.map(r => r.role));
const availableRoles = ["director", "shareholder", "ubo"].filter(r => !existingRoles.has(r));
```

This prevents the "This profile already has this role" error.

Apply to BOTH admin (`ServiceDetailClient.tsx`) and client (`ServiceWizardPeopleStep.tsx`).

---

## 6. Differences Between Admin and Client

| Feature | Admin | Client |
|---------|-------|--------|
| Profile edit (email/phone) | ✅ Editable | ✅ Editable |
| Roles add/remove | ✅ Full control | ✅ Can add/remove |
| Portal access toggle | ✅ Visible | ❌ Hidden |
| Document upload | ✅ Can upload on behalf | ✅ Own uploads |
| Document Detail Popup | ✅ Full: preview, AI, approve/reject, request update | ✅ Partial: preview, AI, download, replace |
| Request Update | ✅ Send notes to person | ❌ Not available |
| Approve/Reject | ✅ Available | ❌ Not available |
| KYC form style | Long-form collapsible | Step wizard |

---

## Files to Create
- `src/components/shared/DocumentDetailDialog.tsx` — shared popup for document review (admin + client)

## Files to Modify
- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — PersonCard layout rework, category fix, role dropdown fix
- `src/components/client/ServiceWizardPeopleStep.tsx` — add top section (profile + docs), category fix, role dropdown fix
- `src/components/client/ServiceWizardDocumentsStep.tsx` — filter to corporate/additional only
- `src/lib/utils/pendingActions.ts` — update category checks if needed
- `src/lib/utils/serviceCompletion.ts` — update category checks if needed

## Files to Reuse
- `src/components/admin/DocumentPreviewDialog.tsx` — for preview area in popup
- `src/components/admin/DocumentUpdateRequestDialog.tsx` — for request update in popup
- `src/app/api/documents/[id]/download/route.ts` — signed URLs for preview/download

---

## CRITICAL RULES

1. Read `CLAUDE.md` for all project conventions
2. `npm run build` must pass clean before every commit
3. Update `CHANGES.md` in every commit
4. Commit and push after each logical batch — DO NOT stop between batches, keep going until entire brief is complete
5. shadcn/ui uses `@base-ui/react` — use `render` prop, not `asChild`
6. Document categories: `identity`, `financial`, `compliance` = KYC docs. `corporate`, `additional` = service docs. There is NO `kyc` category.
7. Toast position: `{ position: "top-right" }`
8. Top section must stay visible — do not scroll it away with KYC details
9. Keep client KYC as step wizard, admin as long-form collapsible

## Verification

1. Admin: expand person → see split layout (Profile+Roles left, Documents right)
2. Client: Review KYC → see same split layout at top
3. Document list shows correct docs based on category (identity/financial/compliance)
4. Documents section (service-level) shows only corporate/additional docs
5. Upload from right panel → checkmark appears in KYC section below
6. Click uploaded doc → Document Detail Popup opens with preview + AI details
7. Admin popup: approve/reject, request update works
8. Client popup: shows AI verification, download, replace — no approve/reject
9. Role dropdown only shows roles person doesn't already have
10. Adding shareholder to Ramanov works (no duplicate error)
11. Profile edit (email/phone) saves correctly
12. Right panel scrolls when > 5 docs
13. `npm run build` passes clean
