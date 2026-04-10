# Batch 4: Admin Client Creation + Risk Assessment

Read CHANGES.md first. This is Batch 4 of 6. Batches 1-3 must be complete.

## Tasks

### 1. New Client Page (replaces CreateClientModal)

Create: `src/app/(admin)/admin/clients/new/page.tsx`

A full page (not modal) with 3 sections:

**Section A: Basic Information**
- Full name* (text input)
- Email* (required — this is the only hard requirement)
- Phone (optional)
- Client type* (radio: Individual / Organisation)

**Section B: Pre-fill KYC (optional)**

If client_type = Individual, show a subset of IndividualKycForm fields:
- Residential address, nationality, passport number, date of birth, occupation
- All optional — admin fills whatever they have

If client_type = Organisation, show both:
- Primary contact fields (name, email, phone, nationality)
- Company fields (company name, registration number, jurisdiction, date of incorporation)

**Section C: Workflow Milestones**

6 checkboxes with auto-filled dates:
- ☐ LOE sent → when checked, sets loe_sent_at = now()
- ☐ Invoice sent → invoice_sent_at
- ☐ Payment received → payment_received_at
- ☐ Portal link sent → portal_link_sent_at
- ☐ KYC complete → kyc_completed_at (auto-checked when KYC is submitted)
- ☐ Application submitted → application_submitted_at (auto-checked)

Admin can check/uncheck these at any time. Dates show next to each checkbox when checked.

**On Submit:**
1. Create profile (full_name, email, password_hash = null)
2. Create client (company_name or full_name based on type, client_type, workflow dates)
3. Create client_users (owner)
4. Create skeleton kyc_records (individual for the person; if org, also organisation record)
5. Pre-fill any KYC fields the admin provided
6. Navigate to `/admin/clients/[newClientId]`

### 2. Update API Route: /api/admin/create-client

Rework the existing route to support:
- Accept: fullName, email, phone, clientType, kycPreFill (Record<string, unknown>), workflowDates
- Create profile + client + client_users + kyc_records in one transaction
- Return clientId

### 3. Update Admin Client Detail Page

Modify: `src/app/(admin)/admin/clients/[id]/page.tsx`

Add new sections:

**Workflow Milestones Card** (in the right column)
- Shows the 6 checkboxes with dates
- Admin can toggle any checkbox — calls PATCH /api/admin/clients/[id] to update the timestamp
- Each checkbox: label + date (if set) + who set it

**KYC Summary Card** (in the main column, above Applications)
- For each kyc_record linked to this client:
  - Record type badge (Individual / Organisation)
  - Person name
  - Completion: "14/24 fields complete"
  - "View / Edit KYC" button → opens the KYC form (admin version)
  - Inline risk indicators: PEP status, sanctions status, risk rating

### 4. Risk Assessment Panel (Admin Only)

Create: `src/components/admin/RiskAssessmentPanel.tsx` ("use client")

Props: `{ kycRecordId: string; kycRecord: KycRecord }`

Shows ALL admin-only risk fields with edit capability:

**Sanctions Screening**
- Checkbox: Checked / Not checked
- Date field (auto-fills on check)
- Notes textarea
- Inline upload: Sanctions Screening Report (DocumentUploadWidget)
- Status indicator: 🟢 Clear / 🟡 Findings / 🔴 Not done

**Adverse Media Check**
- Same pattern as sanctions

**PEP Verification**
- Shows client's self-declaration: "Client declared: [Yes/No]"
- Admin verification checkbox + date + notes
- Status indicator

**Overall Risk Rating**
- Radio buttons: Low / Medium / High / Prohibited
- Justification textarea (required when rating is set)
- Rated by + rated at (auto-filled)
- Changing the rating requires a new justification

**Risk Flags Summary**
- Auto-generated list of color-coded flags:
  - 🟢 Sanctions: Clear
  - 🟡 Adverse media: Findings noted
  - 🔴 Source of wealth: NOT PROVIDED
  - etc.
- "Cannot approve until:" list of blockers

All saves go through: `PATCH /api/kyc/save` with the risk fields.

Risk rating changes are logged to audit_log with action: 'risk_rating_changed'.

### 5. API Route: PATCH /api/admin/clients/[id]

Update the existing route (or create if it only handles company name) to also accept:
- Workflow milestone updates (loe_sent_at, invoice_sent_at, etc.)
- revalidatePath for the client detail page

### 6. Block Approval Without Risk Assessment

Modify: `src/components/admin/StageSelector.tsx`

Before allowing status change to 'approved':
- Fetch the client's kyc_records
- Check: risk_rating is set, sanctions_checked=true, adverse_media_checked=true, pep_verified=true
- If any are missing, show a warning: "Cannot approve: [list of missing items]"
- Disable the Update button until all are complete

### 7. Update Sidebar

In admin sidebar, when viewing a client detail page:
- Add "KYC" link → `/admin/clients/[id]/kyc` (shows the KYC forms in admin mode)
- Add "Risk" link → `/admin/clients/[id]/risk` (shows risk assessment)
- Add "Documents" link → `/admin/clients/[id]/documents` (from Batch 2)

### 8. Admin KYC Review Page

Create: `src/app/(admin)/admin/clients/[id]/kyc/page.tsx`

Server component that loads the client's kyc_records and renders the same IndividualKycForm / OrganisationKycForm components but in "admin mode" — all fields editable, plus the RiskAssessmentPanel below each form.

### 9. Verify + Git

Run `npm run build`. Follow Git Workflow Rule. Commit + push. Update CHANGES.md.
