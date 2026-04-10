# Batch 2: Document Library + Upload Rework

Read CHANGES.md first. This is Batch 2 of 6. Batch 1 (schema + types) must be complete.

## Context

The new `documents` table + `document_types` table + `document_links` table exist in the database. The old `document_uploads` table still exists and is used by existing pages. In this batch, we build the new document upload flow alongside the old one — we don't remove the old code yet.

## Tasks

### 1. API Routes for Document Library

Create these new API routes (all use createAdminClient, auth-gated via `auth()`):

**GET /api/documents/library**
- Query params: `clientId` (required), `kycRecordId` (optional), `documentTypeId` (optional), `category` (optional)
- Returns: documents joined with document_types and document_links
- Sorted by uploaded_at desc

**POST /api/documents/library**
- Accepts multipart FormData: `file`, `clientId`, `documentTypeId`, `kycRecordId` (optional), `expiryDate` (optional), `notes` (optional)
- Uploads file to Supabase Storage (same `documents` bucket, path: `library/{clientId}/{documentTypeId}/{timestamp}-{filename}`)
- Inserts into `documents` table (NOT document_uploads)
- Triggers AI verification via existing verifyDocument function
- Returns the created document record
- revalidatePath for relevant pages

**PATCH /api/documents/library/[id]**
- Update notes, expiry_date, is_active
- revalidatePath

**DELETE /api/documents/library/[id]**
- Soft delete: sets is_active=false (don't delete from storage)
- revalidatePath

### 2. API Routes for Document Links

**POST /api/documents/[id]/link**
- Body: `{ linkedToType, linkedToId, requiredBy }`
- Creates a document_link row
- Returns the link

**DELETE /api/documents/links/[id]**
- Deletes a specific document_link

**GET /api/documents/links**
- Query params: `linkedToType`, `linkedToId`
- Returns all documents linked to a specific application/process/kyc record, joined with document_types

### 3. API Route for Document Types

**GET /api/document-types**
- Returns all active document types, grouped by category
- No auth required for the listing (used in dropdowns)

### 4. Document Upload Component (new)

Create: `src/components/shared/DocumentUploadWidget.tsx`

A reusable "use client" component for the new document-centric upload. Props:
```typescript
interface DocumentUploadWidgetProps {
  clientId: string;
  kycRecordId?: string;
  documentTypeId?: string;        // pre-selected type (used in inline mode)
  documentTypeName?: string;      // display name when type is pre-selected
  showTypeSelector?: boolean;     // true = show dropdown to pick type (used in standalone mode)
  showPersonSelector?: boolean;   // true = show "who does this belong to?" dropdown
  persons?: { id: string; name: string; role: string }[];  // for person selector
  existingDocument?: DocumentRecord | null;  // show existing upload with replace option
  onUploadComplete?: (doc: DocumentRecord) => void;
  compact?: boolean;              // true = inline mode (small, next to a field)
}
```

Two modes:
- **Inline mode** (`compact=true`, `documentTypeId` pre-set): Shows as a single line "📎 Upload [docName] [Choose file] ✅ Uploaded: filename.pdf" — used next to form fields
- **Standalone mode** (`showTypeSelector=true`): Shows document type dropdown + person selector + drag-drop zone — used in the document library page

Features:
- Drag-and-drop via react-dropzone (already a dependency)
- Shows upload progress
- After upload, shows: filename, size, AI verification status, [Preview] [Replace] [Remove] buttons
- If existingDocument is passed, shows it with Replace option
- "➕ Add additional supporting document" button for uploading extras

### 5. Document Library Page (admin)

Create: `src/app/(admin)/admin/clients/[id]/documents/page.tsx`

Server component. Shows ALL documents for a client in a searchable/filterable table view:
- Grouped by category (Identity, Corporate, Financial, Compliance, Additional)
- Each row: document type name, file name, who uploaded it, when, verification status, expiry warning, linked to (list of applications/processes)
- Search bar at top
- "+ Upload Document" button opens standalone DocumentUploadWidget
- Filter by category, verification status
- Uses the `documents` table (new), NOT `document_uploads` (old)

Add "Documents" link to the admin sidebar under the client contextual section (when viewing a client detail page).

### 6. Verify + Git

Run `npm run build`. Follow Git Workflow Rule. Commit + push. Update CHANGES.md.
