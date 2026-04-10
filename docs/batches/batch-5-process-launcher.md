# Batch 5: Process Launcher

Read CHANGES.md first. This is Batch 5 of 6. Batches 1-4 must be complete.

## Context

Process templates and requirements are seeded in the database. The document library exists. KYC records exist. Now we build the admin process launcher that checks document readiness and auto-links existing documents.

## Tasks

### 1. API Routes

**GET /api/admin/processes/templates**
- Returns all active process_templates with their requirements joined to document_types
- Filter by client_type if provided

**POST /api/admin/processes/start**
- Body: `{ clientId, processTemplateId, notes? }`
- Creates a client_processes row (status: 'collecting')
- For each process_requirement:
  - Check if the client already has a matching document in the `documents` table (by document_type_id, for the right client)
  - If per_person=true, check for each application_person matching the role
  - If found: create process_documents row with status='available', source='kyc_reused', link the document_id
  - If not found: create process_documents row with status='missing'
- Creates document_links for all auto-linked documents
- Returns: the process with all process_documents + readiness stats

**GET /api/admin/processes/[id]**
- Returns full process detail: client_processes joined with process_documents, each joined with documents + document_types
- Includes readiness counts (available / missing / requested)

**PATCH /api/admin/processes/[id]**
- Update status, notes
- revalidatePath

**POST /api/admin/processes/[id]/request-documents**
- Body: `{ documentIds: string[], message?: string }`
- Updates process_documents status to 'requested', sets requested_at
- Sends email to client listing the specific missing documents
- Uses existing Resend email infrastructure

**POST /api/admin/processes/[id]/upload**
- Admin uploads a document directly for this process
- Creates entry in `documents` table + links it to the process
- Updates process_documents status to 'received'

### 2. Process Readiness Dashboard Component

Create: `src/components/admin/ProcessReadinessDashboard.tsx` ("use client")

Props:
```typescript
interface ProcessReadinessDashboardProps {
  process: ClientProcess & {
    process_template: ProcessTemplate;
    process_documents: (ProcessDocument & {
      document_type: DocumentType;
      document: DocumentRecord | null;
      kyc_record: { full_name: string } | null;
    })[];
  };
  clientName: string;
}
```

Layout:
- Header: process name + client name + overall readiness "8/14 available (57%)" + progress bar
- Grouped by category:
  - "Corporate Documents" section
  - "Per Director/Shareholder" section (shows each person)
  - "Additional (Bank may request)" section

Each document row:
- ✅ Available: document name, source ("Already uploaded — KYC"), uploaded date, expiry warning if applicable, [Preview] [Use this] buttons
- 🔴 Missing: document name, "Not uploaded — needs to be collected", [Request from client] [Upload manually] buttons
- ⏳ Requested: document name, "Requested on [date]", [Upload manually] [Resend request] buttons

Bottom actions:
- [Request all missing from client] — one email with the full list
- [Generate document package] — creates a summary (future feature, placeholder button for now)

### 3. Process Launcher Dialog

Create: `src/components/admin/ProcessLauncher.tsx` ("use client")

Triggered from a "Start Process" button on the client detail page.

Shows:
- Dropdown of available process templates (filtered by client_type)
- Optional notes field
- "Start Process" button
- On start: calls POST /api/admin/processes/start, then navigates to the process detail page

### 4. Process Detail Page

Create: `src/app/(admin)/admin/clients/[id]/processes/[processId]/page.tsx`

Server component that loads the process + all documents and renders ProcessReadinessDashboard.

Breadcrumb: Clients → [Client Name] → Processes → [Process Name]

### 5. Active Processes Card on Client Detail Page

Modify: `src/app/(admin)/admin/clients/[id]/page.tsx`

Add an "Active Processes" card (in the main column, after Applications):
- Lists all client_processes for this client
- Each row: process name, status badge (collecting/ready/submitted/complete), document readiness "8/14", started date, [View details] link
- If no processes: "No active processes" + the Start Process button

### 6. Update Admin Client Detail — Add Process Launcher Button

Add the ProcessLauncher component to the client detail page header, next to the existing "Start Application" button.

### 7. Sidebar Updates

When viewing a process detail page, add contextual sidebar links:
- Back to client
- Process details
- Documents

### 8. Verify + Git

Run `npm run build`. Follow Git Workflow Rule. Commit + push. Update CHANGES.md.
