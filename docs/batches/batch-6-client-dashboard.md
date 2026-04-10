# Batch 6: Client Dashboard + Completion Tracker + Application Wizard Rework

Read CHANGES.md first. This is Batch 6 of 6 (FINAL). Batches 1-5 must be complete.

## Context

All backend infrastructure is built. KYC forms exist. Document library exists. Process launcher exists. Now we wire everything together on the client portal and rework the application wizard.

## Tasks

### 1. Client Dashboard Rework

Modify: `src/app/(client)/dashboard/page.tsx`

The dashboard should now be the client's **onboarding command center**. Layout:

**Top: Onboarding Progress Bar**
- "Your Onboarding Progress: 48% complete"
- Full-width progress bar (brand-accent fill)
- "Estimated time to finish: ~15 minutes" (calculate from empty fields × 30sec per field)
- "Next action: [specific action]" with a CTA button

**Middle: Smart Onboarding Banner**
- Adapts message based on the client's onboarding stage:
  - No KYC started → "Welcome! Let's get you set up. Complete your personal details to proceed." [Complete KYC →]
  - KYC incomplete → "Your KYC is 60% complete. A few more details needed." [Continue KYC →]
  - KYC complete, no documents → "Great! Now upload your supporting documents." [Upload Documents →]
  - KYC + docs complete, no application → "You're ready to start your application!" [Start Application →]
  - Application in progress → "Your application for [name] is 60% complete." [Continue →]
  - Application submitted → "Your application has been submitted and is under review." (no CTA)
  - Application approved → "Congratulations! Your application has been approved." 🎉

Banner component: `src/components/client/OnboardingBanner.tsx`

**Right Column: Completion Checklist**
- Sticky card showing per-section progress:
  - ✅ Personal KYC (14/14)
  - ⚠️ Personal Documents (5/7)
  - ⬜ Organisation KYC (0/10) — only if org
  - ⬜ Application (not started)
  - ⬜ Application Documents (0/18)
- Each section is clickable → navigates to the relevant page
- Uses the completionCalculator from Batch 3

Component: `src/components/client/CompletionChecklist.tsx`

**Below: Applications List** (existing, keep it)
- Show existing applications with status badges
- "Start new application" button

**Below: Activity Feed** (existing, keep it)

### 2. Application Wizard Rework — Step 1 (Details)

Modify: `src/app/(client)/apply/[templateId]/details/page.tsx`

This page currently collects business details + contact + UBOs all at once. Rework it:

**If template is GBC or AC:**
Show the GBC/AC-specific fields form (data goes to application_details_gbc_ac table):
- 3 Proposed company names (array input — 3 text fields)
- Proposed business activity (textarea)
- Geographical area of operations (text)
- Transaction currency (dropdown)
- Estimated annual turnover for next 3 years (text)
- Requires Mauritian bank account (yes/no toggle)
- If yes: preferred bank name
- Estimated inward transaction value/count
- Estimated outward transaction value/count
- Other companies UBO has in Mauritius
- Balance sheet date
- Initial stated capital

**For all templates:**
Keep the existing business_name, business_type, business_country, business_address fields on the application itself.

**Replace UBO Form with Persons Manager:**
- "Directors, Shareholders & UBOs" section
- [+ Add Director] [+ Add Shareholder] [+ Add UBO] buttons
- Each person added creates a kyc_record (individual) + application_persons row
- Show as expandable cards — each card has inline KYC fields (reuse IndividualKycForm in compact mode)
- Shareholding % shown for shareholders with running total: "85% allocated — 15% remaining"
- Per-person document uploads inline (passport, proof of address, etc.)
- Remove/edit buttons per person

Create: `src/components/client/PersonsManager.tsx` ("use client")

### 3. API Routes for Application Persons

**POST /api/applications/[id]/persons**
- Body: `{ role, kycFields?, shareholdingPercentage? }`
- Creates kyc_record + application_persons row
- Returns the person with their kyc_record

**DELETE /api/applications/[id]/persons/[personId]**
- Removes the application_persons row
- Optionally removes the kyc_record if not linked elsewhere

**PATCH /api/applications/[id]/persons/[personId]**
- Update role, shareholding_percentage

### 4. API Route for GBC/AC Details

**POST /api/applications/[id]/details-gbc-ac**
- Upsert into application_details_gbc_ac
- All fields optional (partial save)

**GET /api/applications/[id]/details-gbc-ac**
- Returns the GBC/AC details for this application

### 5. Application Wizard — Step 2 (Documents) Rework

Modify: `src/app/(client)/apply/[templateId]/documents/page.tsx`

Instead of uploading documents per-requirement (old model), this page now shows:
- Documents already in the client's library that are relevant to this application
- "Auto-linked" indicator for documents already uploaded during KYC
- Missing documents that still need uploading
- DocumentUploadWidget (standalone mode) for new uploads
- Per-person documents section showing each director/shareholder's document status

The upload goes to the `documents` table (new) and creates a document_link to this application.

### 6. Application Wizard — Step 3 (Review) Rework

Modify: `src/app/(client)/apply/[templateId]/review/page.tsx`

Show a summary of:
- Business details (from application)
- GBC/AC details (from application_details_gbc_ac)
- All persons (from application_persons + kyc_records) with their KYC completion status
- Document checklist showing all linked documents with status
- Blockers list: what's still missing before submit
- "Submit for Review" button — disabled until all required items are complete

On submit:
- Updates application.status = 'submitted', submitted_at = now()
- Updates client.application_submitted_at = now()
- Creates audit_log entry
- revalidatePaths for admin pages

### 7. Update Client Sidebar

Update Sidebar.tsx client nav:
- Dashboard (Home)
- KYC (UserCheck) — from Batch 3
- New Application (PlusCircle)
- My Applications (FileText) — only if has applications
- When on an application: contextual section with Details, Documents, Files, Review

### 8. Client Application Detail Page Update

Modify: `src/app/(client)/applications/[id]/page.tsx`

Show the WorkflowTracker (existing) + ApplicationStatusPanel (existing) but also:
- Persons list with KYC completion per person
- Document library for this application (using document_links)
- Admin notes/feedback visible to client
- "What's needed" section if status is pending_action

### 9. Final Cleanup

- Ensure all new pages have `export const dynamic = "force-dynamic"`
- Ensure all new API routes have revalidatePath calls
- Remove any dead imports or unused old components (but keep document_uploads table and old routes for backward compatibility)

### 10. Verify + Git

Run `npm run build`. Follow Git Workflow Rule. Commit + push. Update CHANGES.md with a comprehensive entry covering all 6 batches.

### 11. FINAL VERIFICATION

After all 6 batches, verify these flows work:
1. Admin creates individual client → fills partial KYC → sends invite
2. Admin creates organisation client → fills company + contact KYC → sends invite
3. Client logs in → sees banner → completes KYC with inline uploads → auto-save works
4. Client starts GBC application → fills GBC/AC fields → adds 2 directors + 1 shareholder
5. Per-person KYC + documents inline
6. Client uploads application documents → reviews → submits
7. Admin sees submitted application with all data
8. Admin starts "Open Bank Account" process → sees readiness dashboard
9. Admin assigns risk rating → approves application
10. All pages return 200, build passes clean
