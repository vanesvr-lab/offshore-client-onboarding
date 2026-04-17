# CLI Brief: Client Service Wizard Rework (B-017)

**Date:** 2026-04-17
**Prerequisite:** B-016 (client portal rework) is complete. All client-facing utilities, API routes, and visual polish are in place.
**Scope:** Replace the client service detail page with a landing page + wizard flow. Only touch client-facing pages under `(client)`.

---

## Overview

The client service detail page (`/services/[id]`) gets a two-mode experience:

1. **Landing page** — Section checklist showing Complete/Incomplete status for each wizard section, with per-section "Review and Update" buttons and one "Review and Complete" button
2. **Wizard mode** — Full walkthrough of all sections: Company Setup → Financial → Banking → People & KYC → Documents

---

## Landing Page (`/services/[id]` default view)

### Layout

```
┌─────────────────────────────────────────────────────────┐
│  ← Back to dashboard                                    │
│                                                         │
│  Global Business Corporation (GBC)                      │
│  Getting started                                        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Hi Bruce Banner, please provide the missing    │    │
│  │  information below to complete your application │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌──────────────────────────────────────────────┐       │
│  │ 🟢 Company Setup          Complete  [Review] │       │
│  │ 🔴 Financial              Incomplete [Review]│       │
│  │ 🔴 Banking                Incomplete [Review]│       │
│  │ 🔴 People & KYC           Incomplete [Review]│       │
│  │ 🔴 Documents              Incomplete [Review]│       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│     [ Review and Complete → ]                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Section completion logic

Each section's Complete/Incomplete status:

- **Company Setup**: All required fields in `service_templates.service_fields` where `section === "company_setup"` (or similar grouping) are filled in `services.service_details`
- **Financial**: Same for financial-section fields
- **Banking**: Same for banking-section fields
- **People & KYC**: At least 1 director linked, all linked persons have KYC journey completed
- **Documents**: All required document types for this service template have been uploaded

### Buttons

- Per-section **"Review"** button → enters wizard at that specific step
- Bottom **"Review and Complete"** button → enters wizard at step 1

### Implementation

**File:** `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx`

This file already exists from B-016. Rework it to:
1. Add a `wizardMode` state (boolean, default false)
2. Add a `wizardStartStep` state (number, default 0)
3. When `wizardMode === false` → render the landing page (section checklist)
4. When `wizardMode === true` → render the wizard component
5. Per-section "Review" button: `setWizardStartStep(sectionIndex); setWizardMode(true)`
6. "Review and Complete" button: `setWizardStartStep(0); setWizardMode(true)`

---

## Wizard Component

### Create `src/components/client/ServiceWizard.tsx`

**Props:**
```ts
type Props = {
  serviceId: string;
  service: ClientServiceRecord;
  persons: ServicePerson[];
  documents: ClientServiceDoc[];
  overrides: ServiceSectionOverride[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  clientProfileId: string;
  tenantId: string;
  startStep?: number;       // which step to start on (from per-section button)
  onClose: () => void;      // "Save & Close" → returns to landing page
  onSubmit: () => void;     // final submit
};
```

### Wizard Steps

The wizard has 5 main steps. Steps 1-3 are driven by `service_templates.service_fields` grouped by section. Step 4 is person-by-person KYC. Step 5 is document uploads.

**Step 1: Company Setup**
- Renders `DynamicServiceForm` filtered to company-setup fields only
- Fields from `service_templates.service_fields` where the field's section/group is company setup
- Pre-filled from `services.service_details`
- On save: PATCH `/api/admin/services/[id]` with updated `service_details`
- **Contextual docs sidebar**: Show document types relevant to company setup (if any)

**Step 2: Financial**
- Same pattern, filtered to financial fields
- Contextual docs: financial-related document types

**Step 3: Banking**
- Same pattern, filtered to banking fields
- Contextual docs: banking-related document types

**Step 4: People & KYC**
- **Sub-flow**: Linear walkthrough of all persons grouped by role

Structure:
```
Directors:
  → Person 1 KYC (Identity → Financial → Declarations → Review)
  → Person 2 KYC (...)
Shareholders:
  → Person 3 KYC (...)
UBOs:
  → Person 4 KYC (...)
```

For each person:
- Show person name + role at top
- Render `KycStepWizard` in compact mode
- After completing/saving a person's KYC: auto-advance to next person
- **"Skip for now"** button on each person → advances to next person
- After all persons done → advance to step 5

Before the person-by-person flow, show a **People roster** summary:
- List all linked persons with roles
- "Add Director" / "Add Shareholder" / "Add UBO" buttons (using existing `ServicePersonsManager` add logic or `ProfileSelector`)
- Once roster is confirmed → "Continue to KYC" button starts the linear per-person flow

**Step 5: Documents**
- Single page showing ALL required documents for the service as a checklist
- Layout:
```
┌───────────────────────────────────────────────────┐
│  Required Documents                               │
│                                                   │
│  ☐  Certified Passport Copy        [Upload]       │
│  ☑  Proof of Residential Address   ✓ Uploaded     │
│  ☐  Bank Reference Letter          [Upload]       │
│  ☐  Source of Funds Declaration     [Upload]       │
│  ☑  Certificate of Incorporation   ✓ Uploaded     │
│  ☐  Board Resolution               [Upload]       │
│                                                   │
│  4 of 6 documents uploaded                        │
└───────────────────────────────────────────────────┘
```
- Each row: checkbox/status indicator + document type name + Upload button (or "Uploaded" with checkmark)
- Upload button opens file picker → calls existing `/api/documents/upload` endpoint
- Checkbox auto-checks when upload succeeds
- Progress summary at bottom: "X of Y documents uploaded"

### Navigation Bar (sticky bottom)

```
┌──────────────────────────────────────────────────────┐
│  [Save & Close]              [← Back] [Next →]       │
│                                      [Submit ✓]      │
└──────────────────────────────────────────────────────┘
```

- **Save & Close**: Saves current step, returns to landing page (`onClose()`)
- **Back**: Go to previous step
- **Next**: Save current step, advance to next step
- **Submit**: Only visible on the last step (Documents). Only enabled when all mandatory fields across all steps are filled. Calls submit endpoint, returns to landing page with success state.

### Step indicator (top)

```
┌──────────────────────────────────────────────────────┐
│  ● Company Setup → ○ Financial → ○ Banking →        │
│  ○ People & KYC → ○ Documents                       │
│                                                      │
│  Step 1 of 5                                         │
└──────────────────────────────────────────────────────┘
```

- Completed steps: filled circle (green)
- Current step: filled circle (blue)
- Future steps: empty circle (gray)
- Clickable — can jump to any completed step

---

## Service Fields Section Grouping

The wizard needs to know which `service_fields` belong to which step. The existing `service_templates.service_fields` is an array of field objects. We need a way to group them.

**Approach**: Check if `service_fields` already have a `section` or `group` property. If not, add a `section` field to the service_fields JSON schema.

Look at `src/components/shared/DynamicServiceForm.tsx` to understand the current field structure. If fields already have a `section` property, filter by it. If not, you'll need to:

1. Check the existing GBC and AC templates in the `service_templates` table to see how fields are structured
2. If fields have no section grouping, add a `section` property to each field in the template JSON
3. Create a migration or admin API call to update existing templates

**Fallback**: If adding sections to templates is too complex, group fields by the existing visual headers/separators in `DynamicServiceForm`. The form already renders section headers — extract that grouping logic.

---

## Files to Create

- `src/components/client/ServiceWizard.tsx` — main wizard component
- `src/components/client/ServiceWizardStep.tsx` — generic step wrapper (renders DynamicServiceForm for steps 1-3)
- `src/components/client/ServiceWizardPeopleStep.tsx` — step 4: people roster + per-person KYC
- `src/components/client/ServiceWizardDocumentsStep.tsx` — step 5: document checklist with uploads
- `src/components/client/ServiceWizardNav.tsx` — sticky bottom navigation bar
- `src/components/client/ServiceWizardStepIndicator.tsx` — top step progress indicator

## Files to Modify

- `src/app/(client)/services/[id]/ClientServiceDetailClient.tsx` — add wizard mode toggle, landing page with section checklist
- `src/app/(client)/services/[id]/page.tsx` — already expanded with persons/requirements/documentTypes data (done by B-016 / linter)

## Files to Reuse (no changes needed)

- `src/components/shared/DynamicServiceForm.tsx` — renders service fields (used in steps 1-3)
- `src/components/kyc/KycStepWizard.tsx` — compact mode for per-person KYC (step 4)
- `src/components/shared/ProfileSelector.tsx` — for adding new persons in step 4
- `src/app/api/services/[id]/persons/route.ts` — add/remove persons (from B-016)
- `src/app/api/documents/upload/route.ts` — existing upload endpoint (step 5)

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
10. Keep old `/apply` wizard pages working

## Don't ask — just build

The owner is working on admin portal changes in parallel. Make reasonable choices and document in commit messages. If `service_fields` don't have section grouping, add it and note the approach in the commit.

## Verification

1. Login as client (`vanes_vr@yahoo.com` / `Test1234!`)
2. Dashboard → click service → landing page shows section checklist
3. Each section shows Complete (green) or Incomplete (red)
4. Click "Review" on a section → wizard opens at that step
5. Click "Review and Complete" → wizard starts at step 1
6. Steps 1-3: service fields render, can fill and save
7. Step 4: people roster, can add persons, linear KYC walkthrough with "Skip for now"
8. Step 5: all required docs listed, can upload, checklist updates
9. "Save & Close" returns to landing page
10. "Submit" only enabled when mandatory fields filled
11. `npm run build` passes clean
