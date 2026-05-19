---
title: "GWMS Onboarding Portal — Video Series Scripts"
subtitle: "Quick-start episodes for admin + client portal walkthrough"
author: "GWMS Ltd."
date: "2026-05-18"
---

# Series overview

Seven short videos showing how the GWMS Onboarding Portal works end-to-end. Each script runs 4–8 minutes on screen.

| Ep | Topic | Audience | Length |
|----|-------|----------|--------|
| 1 | Admin Portal Tour | New admins | 4–5 min |
| 2 | End-to-End Onboarding | All admins | 7–8 min |
| 3 | Section Reviews & Substance Assessment | Reviewers (Manager+, Super User) | 5–6 min |
| 4 | Document Handling | All admins | 5 min |
| 5 | Peer / Manager Review + Audit Trail | All admins | 5 min |
| 6 | Admin Settings | Super Users | 6 min |
| 7 | Client Portal Walkthrough | Onboarding clients, support staff | 5 min |

**Recording tips**
- Record in 1920×1080 (admin views are designed for desktop)
- For the mobile demo in Episode 7, use a 375px-wide responsive frame
- Use a clean test tenant — don't show production client data
- Voiceover lines in **quotes** are scripted; everything else is direction

**[SCREENSHOT]** markers identify slides you should screenshot during editing — the description tells you what to capture and where to add it in the cut.

---

# Episode 1 — Admin Portal Tour

**Duration:** 4–5 minutes
**Audience:** New admins / staff during their first week at GWMS
**Goal:** Orient them to the layout — what's where, what each section does, where to start the day

## Cold open (0:00–0:20)

**[SCREENSHOT]** Login page (`/login`), centered card

> "Welcome to the GWMS Onboarding Portal. In this short tour I'll walk you through the admin side — the queue, the clients list, services, and where to find your settings. By the end you'll know where to look for any task."

Log in as a Super User to begin.

## Scene 1 — The dashboard (0:20–1:10)

**[SCREENSHOT]** `/admin/dashboard` showing the stats cards + recent activity

> "When you log in, you land on the dashboard. The top tiles show this week's headline numbers — services in progress, items awaiting your action, recent approvals. Below that, the activity feed surfaces the latest changes across all clients."

**On-screen actions:**
1. Hover the "Services in progress" tile — show the click affordance
2. Scroll the activity feed to demonstrate it's scrollable

## Scene 2 — Sidebar navigation (1:10–2:30)

**[SCREENSHOT]** Sidebar expanded, all top-level items visible

> "On the left you have the main navigation. Five places matter day-to-day."

Walk through each, hovering as you talk:

- **Dashboard** — where you just were, your home screen
- **Queue** — everything that needs admin attention right now. This is where you start your day.
- **Clients** — every client company you manage. Search by name or filter by status.
- **Services** — the unit of work. Each service is one onboarding application for one client.
- **Settings** — templates, AI verification rules, the knowledge base for the assistant, and admin user management. Only Super Users see this menu.

**Note for voiceover:** mention that the Settings menu visibility depends on the user's role — if their permissions don't include `settings_access`, the item is hidden.

## Scene 3 — The queue (2:30–3:30)

**[SCREENSHOT]** `/admin/queue` with at least 5 services listed, showing the RAG status badges

> "The queue is your work list. Each row is a service that needs something — a section reviewed, a document verified, a status moved forward. The colored dot on the left is the RAG status — red means blocked, amber is in progress, green is ready."

**On-screen actions:**
1. Click a queue row to open the service detail page
2. Show the URL changing to `/admin/services/<id>`
3. Press the browser back button to return to the queue

## Scene 4 — A service at a glance (3:30–4:30)

**[SCREENSHOT]** Service detail page top portion: header, badge, right-rail Status Change + Milestones cards visible

> "Every service page has the same layout. The header shows the service number — that's the GBC-, AC-, BAO-, or other prefix that tells you what kind of service this is. To the right of the page is the rail: status, milestones, peer/manager review requests, the audit trail, and the action queue."

**On-screen actions:**
1. Hover the service number to show its tooltip / explanation
2. Point at the Status Change card
3. Point at the Milestones card
4. Scroll down briefly to show the form sections (Company Setup, Financial, Banking, People & KYC, Documents)

## Closing (4:30–5:00)

> "That's the lay of the land. Next episode I'll walk through onboarding a client from start to finish — creating the service, adding directors, sending the KYC invite, and approving the application."

End card.

---

# Episode 2 — End-to-End Onboarding (the flagship demo)

**Duration:** 7–8 minutes
**Audience:** All admins
**Goal:** Show the complete happy-path flow from creating a client to closing the service

## Cold open (0:00–0:30)

**[SCREENSHOT]** Empty admin dashboard with the "+ Create Client" CTA highlighted

> "In this episode I'll onboard a new client end-to-end. We'll create the client, add a service, attach a director, send a KYC invite, the recipient fills the form, we review it, and we close out the service. About seven minutes total — this is the bread-and-butter workflow."

## Scene 1 — Create the client (0:30–1:30)

**[SCREENSHOT]** Clients page (`/admin/clients`) with the "+ New Client" button highlighted

**[SCREENSHOT]** CreateClientModal open, fields visible

> "Start from the Clients page. Click '+ New Client' — that opens the create modal."

**On-screen actions:**
1. Click "+ New Client"
2. Fill in the modal:
   - **Company name:** "Acme Holdings Ltd"
   - **Primary contact full name:** "John Smith"
   - **Email:** "john.smith@acme.example"
   - **Phone:** (optional)
3. Click "Create Client"

> "The client appears in the list immediately. Click the row to open their detail page."

## Scene 2 — Create the service (1:30–2:30)

**[SCREENSHOT]** Client detail page (`/admin/clients/<id>`) with the "Apply for Service" button visible

**[SCREENSHOT]** Service template picker (`/admin/clients/<id>/apply`)

> "On the client detail page, click 'Apply for Service'. You'll see the list of templates — Global Business Company, Authorised Company, Trust or Foundation, Bank Account Opening, and so on. Pick the one that fits."

**On-screen actions:**
1. Click "Apply for Service" on the client page
2. Pick "Global Business Company" template
3. Confirm creation

> "The service is created with an auto-generated number — GBC-, AC-, TFF-, or whichever prefix matches the template. You land on the new service's detail page."

**[SCREENSHOT]** Newly-created service detail page, status "Start"

## Scene 3 — Add a director (2:30–3:45)

**[SCREENSHOT]** People & KYC section expanded, "+ Add Director" button visible

> "Scroll to the People & KYC section. Click '+ Add Director' to add the first person on this service."

**On-screen actions:**
1. Scroll to People & KYC
2. Click "+ Add Director"

**[SCREENSHOT]** Add Director modal open with the Individual / Corporation radio + name + email fields

3. In the modal: pick "Individual", enter "John Smith" and "john.smith@acme.example"
4. Click "Add Director"

> "John appears in the People & KYC list. He's now a profile on this service with the Director role."

**Note for voiceover:** mention that you can also add shareholders and UBOs the same way, and that a corporate director is just a profile with `record_type = 'organisation'`.

## Scene 4 — Send the KYC invite (3:45–4:30)

**[SCREENSHOT]** John's profile card with the Send Invite affordance

> "Now send him the KYC invite — he'll get a magic-link email that lands him on the KYC long form."

**On-screen actions:**
1. Click "Send Invite" on John's card
2. Confirm the email address in the small dialog
3. Click "Send"

**[SCREENSHOT]** Toast confirming the invite was sent + the audit trail entry visible

> "The invite is logged in the audit trail. Magic links expire in 24 hours — you can resend if needed."

## Scene 5 — Client fills the KYC (4:30–5:30)

> "Let's see what John sees. I'll pop into the email and click the link."

**[SCREENSHOT]** Email inbox (mock or screenshot of the actual Resend email)

**[SCREENSHOT]** `/auth/set-password` page where the user sets their password

**[SCREENSHOT]** `/kyc/fill/<token>` showing the KYC long form

> "John lands on a set-password screen first, picks a password, then fills the KYC long form. The form is four sections — Identity, Financial, Compliance, Tax. He can save progress and come back later."

Cut between sections of the KYC form. Don't show real PII; use clearly fake test data.

**On-screen actions (as John, in a different browser or incognito):**
1. Set password
2. Fill identity section
3. Submit

## Scene 6 — Review the submission (5:30–6:30)

**[SCREENSHOT]** Back in admin view: John's profile card with submitted KYC data visible

> "Switching back to the admin side, John's KYC data has flowed into his profile card. I can review each section."

**On-screen actions:**
1. Expand John's profile card
2. Show the Identity / Financial / Compliance / Tax tabs
3. Click "Mark as reviewed" on the Identity section

**[SCREENSHOT]** Section showing "Reviewed by [name] on [date]"

> "When a section is reviewed, it shows my name and the date. I can do this for each section. To bring in a second pair of eyes, I can use Peer / Manager Review — but I'll cover that in Episode 5."

## Scene 7 — Move the service forward (6:30–7:30)

**[SCREENSHOT]** Right-rail Status Change card showing current stage + Move forward / Override buttons

> "Once the KYC is reviewed and the documents are verified, I move the service forward. The button advances the service through its workflow stages."

**On-screen actions:**
1. Click "Move forward" in the Status Change card
2. Confirm in the dialog
3. Show the badge updating to the next stage

> "If I need to skip a stage or correct a wrong move, the Override dropdown lets me jump anywhere. Both actions are audit-logged with my name and a before/after snapshot."

## Closing (7:30–8:00)

> "That's the whole onboarding flow — five minutes if you skip the client-side waiting. In the next episodes I'll go deeper on section reviews, substance assessment, document handling, and admin settings. Thanks for watching."

End card.

---

# Episode 3 — Section Reviews & Substance Assessment

**Duration:** 5–6 minutes
**Audience:** Reviewers (Manager and Super User by default — anyone with the `can_review` permission)
**Goal:** Show how to formally sign off on a section and complete the substance assessment

## Cold open (0:00–0:20)

> "Section reviews are how we formally sign off that a part of a service is complete and verified. The substance assessment is a specific section for Mauritius offshore entities — it's the FSC §3.2, §3.3, §3.4 compliance check. I'll walk through both."

## Scene 1 — Mark a section as reviewed (0:20–1:30)

**[SCREENSHOT]** Service detail page with the Company Setup section expanded and the "Mark as reviewed" button visible at the top-right of the card

> "On any section card — Company Setup, Financial, Banking, Documents, or People & KYC — you'll see a 'Mark as reviewed' button at the top-right. Click it after you've checked that the fields are filled and accurate."

**On-screen actions:**
1. Open a service in mid-review state
2. Expand Company Setup
3. Click "Mark as reviewed"
4. Show the header updating to "Reviewed by [your name] on [date]"

> "The review is audit-logged. To unmark, click the same area again and confirm — useful if you spot something after signing off."

**Note:** Mention that the button is greyed out for roles without `can_review` (Officer and Junior Officer don't get it by default). They can still edit fields and propose changes; they just can't formally sign off.

## Scene 2 — Substance assessment (1:30–4:00)

**[SCREENSHOT]** Substance Review section on a GBC service, showing §3.2 / §3.3 / §3.4 sub-cards

> "Substance assessment is the FSC §3.2, §3.3, §3.4 compliance check — confirming the entity has economic substance in Mauritius. You see three sections."

**Walkthrough each:**

**§3.2 mandatory criteria** — six Yes/No/Unknown questions:
- Two Mauritius-resident directors
- Principal bank account in Mauritius
- Accounting records in Mauritius
- Audited in Mauritius
- Board meetings with Mauritius quorum
- For CIS: administered from Mauritius

**[SCREENSHOT]** §3.2 with three answers filled (mix of Yes/No)

> "Each question auto-saves as you click. The answers feed into the overall pass/fail decision."

**§3.3 at-least-one criteria with evidence** — six conditions, the entity needs at least one with supporting evidence:
- Office premises in Mauritius (address)
- Full-time MU employee (count)
- MU arbitration clause (text)
- Holds MU assets above $100k USD (value + description)
- Listed on MU exchange (listing reference)
- Reasonable MU expenditure (yearly USD + justification)

**[SCREENSHOT]** §3.3 with one row filled in and the evidence visible

**§3.4 fallback** — if §3.3 isn't satisfied, you can inherit substance from a related corporation that itself satisfies §3.3.

**[SCREENSHOT]** §3.4 toggle + related corp name field

## Scene 3 — Admin assessment + PDF (4:00–5:30)

**[SCREENSHOT]** Admin assessment block at the bottom: dropdown (Pass / Review / Fail), notes field, "Save substance review" button

> "Once the criteria are filled, set your admin assessment — Pass, Review, or Fail. Notes are optional for Pass, required for Review or Fail. Hit 'Save substance review' to commit."

**On-screen actions:**
1. Pick "Pass" from the dropdown
2. (Optional) add a one-line note
3. Click "Save substance review"
4. Show the toast confirmation

> "If your role doesn't have `can_review` permission, the Save button is disabled with a tooltip. Substance assessment is a review action — only Managers and Super Users can sign it off by default."

**[SCREENSHOT]** Generate PDF button (location TBD — verify in actual UI) + the resulting download

> "Once the assessment is saved, you can generate a PDF — regulator-ready document covering everything we just filled in. Attach this to your FSC submission."

## Closing (5:30–6:00)

> "Section reviews and substance are the two main 'review' actions in the portal. Next episode I'll cover document handling — uploads, AI verification, and what to do when a document is flagged."

End card.

---

# Episode 4 — Document Handling

**Duration:** 5 minutes
**Audience:** All admins
**Goal:** Show the document upload + AI verification flow from both sides + how to handle flagged docs

## Cold open (0:00–0:20)

> "Every service needs documents — certificates of incorporation, proof of address, passport scans, reference letters. The portal runs each upload through AI verification before it lands in the queue. Here's how the flow works."

## Scene 1 — Client uploads a document (0:20–1:30)

**[SCREENSHOT]** Client portal — wizard step 2 (Documents) showing required document tiles

> "On the client side, the documents step shows each required document as a tile with a status badge — Required (red), Submitted (yellow), Verified (green), or Flagged (orange)."

**On-screen actions (as client):**
1. Click a "Required" tile (e.g. Certificate of Incorporation)
2. Drag-and-drop a PDF onto the drop zone (or click Upload)
3. Wait for the badge to flip to "Reviewing"

**[SCREENSHOT]** Mobile view of the same step showing the "Take Photo" button

> "On mobile, there's a camera button that opens the phone's native camera — useful for capturing passports or utility bills on the spot."

## Scene 2 — AI verification (1:30–2:30)

**[SCREENSHOT]** Document detail dialog showing AI extraction fields with values + confidence

> "Behind the scenes, the upload triggers AI verification. The model extracts the key fields from the document — for a Certificate of Incorporation, that's company name, registration number, incorporation date, jurisdiction. It cross-checks them against what's already on file and either passes or flags the document."

**Note for voiceover:** mention the rules are admin-configurable at `/admin/settings/rules`.

**On-screen actions:**
1. (As admin) click the document tile that just turned "Reviewing"
2. Show the AI extraction tab with the extracted values
3. Show the confidence indicators

## Scene 3 — Flagged document recovery (2:30–4:00)

**[SCREENSHOT]** Document detail with a "Flagged" status + reason text ("Document expired" or "Name mismatch")

> "When the AI flags something, the reason is shown at the top — typical flags are expired documents, name mismatches, or low-confidence extractions."

**On-screen actions (as client):**
1. Open the flagged document
2. Read the reason
3. Click "Replace" → upload a fresh file

> "The replacement runs through the same AI flow. If it passes, the flag clears automatically."

**Admin side — override:**

> "If the AI is wrong — say it misread a clear scan — admins can override the verdict."

**On-screen actions (as admin):**
1. Open the flagged document
2. Click "Override" or "Mark as verified manually" (CLI to confirm exact label)
3. Confirm in the dialog
4. Show the audit_log entry capturing the override + the admin's name

## Scene 4 — Document audit (4:00–4:30)

**[SCREENSHOT]** Audit Trail card filtered to "Document" actions

> "Every document event — upload, verification, flag, replace, override — is logged. You can filter the audit trail to just document events to see the document history at a glance."

## Closing (4:30–5:00)

> "Documents are where most onboarding back-and-forth happens. The AI handles the routine stuff; you handle the edge cases. Next episode: peer / manager reviews and the audit trail."

End card.

---

# Episode 5 — Peer / Manager Review + Audit Trail

**Duration:** 5 minutes
**Audience:** All admins
**Goal:** Show how to ask another admin to review your work + use the audit trail for traceability

## Cold open (0:00–0:20)

> "When you want a second pair of eyes on a service — or you're escalating to a manager for sign-off — you use peer / manager review. Plus I'll walk through the audit trail, which is your traceability for everything that's ever happened on a service."

## Scene 1 — Request a peer review (0:20–2:00)

**[SCREENSHOT]** Service detail right rail with the "Peer / Manager Review" card visible

> "On the right rail of every service detail page is the Peer / Manager Review card. Click 'Request Peer / Manager Review' to start."

**On-screen actions:**
1. Click "Request Peer / Manager Review"

**[SCREENSHOT]** Request modal showing the section checkboxes + reviewer dropdown + note field

2. In the modal: tick the sections you want reviewed (Company Setup, Financial, People & KYC by profile, etc.)
3. Pick one or more reviewers from the dropdown
4. Type a note explaining what you need them to look at
5. Click "Send Request"

**[SCREENSHOT]** Card now showing the open request as a row with the requester, reviewer count, and section count

> "The request shows up as a row on the card. Reviewers also get a banner at the top of the service page the next time they open it."

## Scene 2 — Reviewer flow (2:00–3:30)

> "Let's switch to a reviewer's view."

**[SCREENSHOT]** Same service page from the reviewer's session — sticky amber banner at the top

> "The banner shows who asked, what they want reviewed, and section chips. Click any chip to jump straight to that section."

**On-screen actions:**
1. Click a section chip in the banner — show the page scrolling + the section expanding
2. Show the reviewer reading the section
3. Go back up, click "Mark as reviewed" on the banner
4. Show the toast confirmation

> "The request closes; the requester sees it disappear from their open list. The whole exchange is in the audit trail."

**[SCREENSHOT]** Eye icon on a review request row + the detail modal that opens

> "From the right-rail card you can also click the eye icon to see the full request detail — notes, all sections, who's invited, the close history."

## Scene 3 — Audit trail (3:30–4:30)

**[SCREENSHOT]** Audit Trail card filled with ~20 entries showing different actors and actions

> "Below the Peer Review card is the Audit Trail. Every action on this service — status changes, document uploads, AI verifications, KYC edits, milestones, you name it — is logged here."

**On-screen actions:**
1. Show the filter chips at the top: actor, action type, date preset
2. Filter to just "Document" actions
3. Filter to a date range (Last 7 days)
4. Click a row to expand it and show the before/after values

> "If you have export permission, the CSV button at the top-right downloads the filtered view. Hand it to your auditor."

**[SCREENSHOT]** CSV export button + the downloaded file opened in a spreadsheet

## Closing (4:30–5:00)

> "Peer review is for collaboration; audit trail is for traceability. Together they're how we keep onboarding accountable. Next: admin settings — where the platform itself is configured."

End card.

---

# Episode 6 — Admin Settings

**Duration:** 6 minutes
**Audience:** Super Users (anyone with `settings_access`)
**Goal:** Tour each settings page so admins know what's configurable

## Cold open (0:00–0:20)

> "Behind the scenes, the GWMS portal is configurable. In this episode I'll walk through each settings page — templates, AI rules, knowledge base, admin roles, and workflow. This is Super-User territory."

## Scene 1 — Settings menu (0:20–0:50)

**[SCREENSHOT]** Sidebar with Settings expanded, sub-items visible

> "Settings is a sub-menu in the sidebar. If you don't see it, your role doesn't have `settings_access` — ask a Super User to enable it."

Items in the menu:
- Templates
- AI Rules
- Knowledge Base
- Admins (B-127 — new)
- Workflow
- (Plus document types, due diligence, reference forms, role requirements — mention briefly)

## Scene 2 — Templates (0:50–1:50)

**[SCREENSHOT]** `/admin/settings/templates` showing the list of service templates

> "Templates define what a service is. Each template — Global Business Company, Authorised Company, Trust, Bank Account Opening, etc. — has its own fields, required documents, and stages. When you 'Apply for Service' from a client page, the template list is what you pick from."

**On-screen actions:**
1. Click a template row
2. Show the editor: fields, documents, stages
3. Don't actually save changes — just show what's editable

## Scene 3 — AI Rules (1:50–2:50)

**[SCREENSHOT]** `/admin/settings/rules` showing the JSON editor

> "AI Rules controls how the document-verification AI behaves. Each document type has a rule that tells the model what fields to extract, what to compare against, and what to flag. Editing is JSON-direct for now — careful with the syntax."

**On-screen actions:**
1. Click a rule (e.g. Certificate of Incorporation)
2. Show the JSON: field definitions, validation rules
3. Don't save — just demonstrate

## Scene 4 — Knowledge Base (2:50–3:50)

**[SCREENSHOT]** `/admin/settings/knowledge-base` showing the entry list

> "Knowledge Base powers two things: the AI document verification's regulatory context, and the chatbot in the bottom-right corner. Add an entry, set the category (how-to / nav / glossary) and audience (admin / client / both), write the content in markdown, and it's instantly searchable."

**On-screen actions:**
1. Click "+ New Entry"
2. Fill the modal: title, category, content, applies_to
3. Save
4. Show the entry in the list

## Scene 5 — Admins (3:50–5:00)

**[SCREENSHOT]** `/admin/settings/admins` showing the admins list + invite button + role editor cards

> "Admins is where you invite new staff to the portal and manage their roles. Five roles ship by default: Super User, Manager, Officer, Junior Officer, and Auditor."

**On-screen actions:**
1. Click "+ Invite Admin"
2. Fill: name, email, role (pick Officer)
3. Send — show the toast + the new row appearing
4. Scroll down to the Roles section
5. Expand the Officer card — show the 10 permission toggles
6. Toggle one (e.g. `export_data` on)
7. Show the audit_log entry capturing the change

> "Each toggle is a real permission. Changes apply to every admin in that role. One exception — `admin_mgmt_access` on Super User is locked on, so nobody can accidentally lock everyone out of admin management."

## Scene 6 — Workflow (5:00–5:40)

**[SCREENSHOT]** `/admin/settings/workflow` showing the stage progression

> "Workflow shows the stages a service moves through — Start, KYC Collection, Review, Substance, Approval, Closed. This page is mostly read-only; the actual stage transitions happen from the Status Change card on each service."

## Closing (5:40–6:00)

> "Settings is how the platform stays flexible — add new service types via Templates, tune the AI behavior via Rules, keep the assistant up-to-date via Knowledge Base, and manage your team via Admins. Last episode is the client portal walkthrough."

End card.

---

# Episode 7 — Client Portal Walkthrough

**Duration:** 5 minutes
**Audience:** Onboarding clients, GWMS support staff, anyone helping a client through the portal
**Goal:** Show what a client sees from sign-in to submission

## Cold open (0:00–0:20)

> "We've been on the admin side throughout this series. In this final episode, I'll show what the client sees — the email invite, sign-in, applying for a service, uploading documents, and tracking application status."

## Scene 1 — Email invite + first login (0:20–1:30)

**[SCREENSHOT]** Inbox view of the magic-link email

> "Clients come into the portal through a magic-link email. They click the link, land on a set-password screen, choose a password, and they're in."

**On-screen actions (in incognito as the client):**
1. Open the email
2. Click the magic link
3. Land on `/auth/set-password`
4. Set a password
5. Click "Set password & continue"

**[SCREENSHOT]** Client dashboard `/dashboard` — empty state for a brand-new account, or a list of applications for an active one

## Scene 2 — Client dashboard (1:30–2:30)

**[SCREENSHOT]** Dashboard with at least one application visible

> "The dashboard lists every application the client has. Each card shows the current stage, percentage complete, and what's waiting on them. They can click into any application for the detail view."

**On-screen actions:**
1. Hover an application card
2. Click into it

**[SCREENSHOT]** Application detail view (`/applications/<id>`) showing the timeline + the document checklist

> "Inside an application, they see a step-by-step timeline, the documents still needed, and any flagged items. The right side shows status; the left shows actions for them."

## Scene 3 — Apply for a service (2:30–3:30)

**[SCREENSHOT]** `/apply` page with the service template grid

> "If a client needs to apply for a new service, they click 'Apply for Service' from the dashboard."

**On-screen actions:**
1. Click "Apply for Service" / "+ New Application"
2. Pick a template
3. Show the three-step wizard:
   - Step 1: Details (company info)
   - Step 2: Documents (uploads)
   - Step 3: Review (final submit)

**[SCREENSHOT]** Wizard step 2 showing document tiles

> "The wizard saves progress, so they can drop off and come back. Once they submit on step 3, the application lands in the admin queue."

## Scene 4 — Document upload + flag recovery (3:30–4:30)

**[SCREENSHOT]** Documents step on mobile, showing the camera capture button

> "On mobile, the camera capture is the default — tap a tile, snap a photo, done. AI verification runs in the background."

**[SCREENSHOT]** A flagged document with the reason text and the Replace button

> "If a document is flagged, the reason is right at the top — usually a clarity issue or an expired date. They click Replace to upload a fresh file."

## Scene 5 — Tracking status (4:30–5:00)

**[SCREENSHOT]** Application status panel showing current stage + next steps

> "From the dashboard or the application detail page, clients always know where they stand. If they're stuck, the new assistant chatbot in the bottom-right can answer common questions."

**[SCREENSHOT]** Client-side chatbot widget with an example question + answer

## Closing (5:00–5:30)

> "That's the client portal — simple, focused on getting documents in and tracking status. The admin side does the heavy lifting; clients get a clean experience.

That wraps up the series. Seven episodes, end-to-end. If you've got questions, check the in-app assistant or contact your account manager at GWMS."

End card.

---

# Appendix — Recording checklist

For each episode:

- [ ] Use the test tenant / sandbox data (no real client PII)
- [ ] Run B-128's chatbot has landed before recording Episode 6 (Knowledge Base reference) and Episode 7 (client chatbot)
- [ ] Run B-127's admin roles page before recording Episode 6 (Admins section)
- [ ] Have a fresh login each episode so the session is clean
- [ ] Capture screenshots at 1920×1080 (or 375px wide for mobile demos)
- [ ] Record at 1080p, 30fps minimum
- [ ] Voiceover separately from screen capture for cleaner mixing

For the screenshots: each `[SCREENSHOT]` marker in this doc is a slide to capture during editing. Take the screenshot mid-recording or set up a separate screenshot session — your call.
