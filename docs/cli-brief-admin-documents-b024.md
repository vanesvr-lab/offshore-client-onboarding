# CLI Brief: Admin Documents Section + Update Requests (B-024)

**Date:** 2026-04-17
**Scope:** Admin service detail Documents section. Do NOT touch client pages (except adding update request notification display if time permits).

---

## Overview

Rework the Documents section in the admin service detail page (`/admin/services/[id]`) to bring back all the document features from the old application detail page: AI verification scores, extracted fields, admin review (approve/reject), preview, download, and a NEW "Request Update" feature for sending notes to profile owners.

---

## DB Migration

### New table: `document_update_requests`

The user needs to run this SQL in Supabase SQL Editor:

```sql
CREATE TABLE IF NOT EXISTS document_update_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT 'a1b2c3d4-0000-4000-8000-000000000001',
  document_id uuid NOT NULL REFERENCES documents(id),
  service_id uuid NOT NULL REFERENCES services(id),
  requested_by uuid NOT NULL,
  requested_by_name text,
  sent_to_profile_id uuid NOT NULL REFERENCES client_profiles(id),
  sent_to_email text,
  note text NOT NULL,
  auto_populated_from_flags boolean DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_doc_update_requests_document ON document_update_requests(document_id);
CREATE INDEX idx_doc_update_requests_service ON document_update_requests(service_id);
```

**IMPORTANT:** Document this SQL in CHANGES.md so the user knows to run it.

---

## Documents Section Layout

### Per uploaded document card:

```
┌────────────────────────────────────────────────────────────┐
│ 📄 {Document Type Name}              {Status Badge}        │
│    Uploaded {date} · {uploader name}                       │
│                                                            │
│    AI Verification: {confidence}%    {X/Y rules passed}   │
│    ▸ Extracted Fields (collapsible)                        │
│      Full Name: Ramanov                                    │
│      DOB: 1980-04-13                                       │
│      Passport No: XX123456                                 │
│                                                            │
│    ⚠ Flags: (if any)                                       │
│    • Flag description 1                                    │
│    • Flag description 2                                    │
│                                                            │
│    Admin: {Pending/Approved/Rejected}                      │
│    [✓ Approve] [✗ Reject] [📝 Request Update]             │
│    [👁 Preview] [⬇ Download]                               │
│                                                            │
│    📩 Update requested on Apr 17 by Jane Doe               │
│    "Please re-upload proof of address..."                  │
└────────────────────────────────────────────────────────────┘
```

### Per missing/required document:

```
┌────────────────────────────────────────────────────────────┐
│ 📄 {Document Type Name}              ○ Not uploaded        │
│    Required · {category}                                   │
│                                          [Upload]          │
└────────────────────────────────────────────────────────────┘
```

### Bottom summary:

```
── Flagged Documents Summary ──────────────────────────────── 
│ X documents flagged — requires admin attention             │
│ • Document Name: Y flags                                   │
──────────────────────────────────────────────────────────────
```

---

## Features to Implement

### 1. Rich Document Cards

Replace the current simple document list in `ServiceDetailClient.tsx` Documents section with rich cards showing:

**For each uploaded document:**
- Document type name + verification status badge (Verified ✓ green, Flagged ⚠ amber, Rejected ✗ red, Pending ○ gray)
- Upload date + uploader name
- **AI Verification line**: confidence score + rules passed count (from `documents.verification_result`)
- **Extracted Fields** (collapsible): parsed fields from `verification_result.match_results` or `verification_result.extracted_fields`
- **Flags** (if any): list of issues from `verification_result.flags` or failed `rule_results`
- **Admin review status**: Pending/Approved/Rejected with date
- **Action buttons**: Approve, Reject, Request Update, Preview, Download

**For each required but not uploaded document:**
- Document type name + "Not uploaded" badge
- Category label
- Upload button

### 2. Existing Components to Reuse

Reuse these existing components (adapt as needed):

- `src/components/admin/DocumentStatusRow.tsx` (280 lines) — AI verification line + admin review buttons. May need adapting from old `document_uploads` model to new `documents` model.
- `src/components/admin/DocumentPreviewDialog.tsx` (160 lines) — preview modal with signed URLs
- `src/components/admin/FlaggedDiscrepanciesCard.tsx` (192 lines) — flagged summary card
- `src/components/admin/AdminDocumentUploader.tsx` (132 lines) — upload dialog

**Key adaptation needed:** These components were built for the old `document_uploads` table. The new model uses the `documents` table. The fields are similar but check column names:
- Old: `document_uploads.requirement_id` → New: `documents.document_type_id`
- Old: `document_uploads.verification_result` → New: `documents.verification_result` (same)
- Old: `document_uploads.admin_status` → Check if this column exists on `documents`

If `admin_status` doesn't exist on `documents`, add it:
```sql
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_status text DEFAULT 'pending';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_reviewed_at timestamptz;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS admin_reviewed_by uuid;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejection_reason text;
```
Document this SQL in CHANGES.md.

### 3. Request Update Feature (NEW)

**"📝 Request Update" button** on each uploaded document card.

When clicked, opens a dialog:

```
┌──────────────────────────────────────────────────────┐
│  Request Document Update                              │
│                                                      │
│  Document: Proof of Residential Address              │
│                                                      │
│  Send to:                                            │
│  ┌────────────────────────────────────────────────┐  │
│  │ ○ Ramanov (document owner) — ramanov@email.com│  │
│  │ ○ Bruce Banner (representative)               │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  Note: *                                             │
│  ┌────────────────────────────────────────────────┐  │
│  │                                                │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ☐ Auto-populate from AI flags                       │
│                                                      │
│                    [Cancel]  [Send Request]           │
└──────────────────────────────────────────────────────┘
```

- **Send to**: radio buttons — document owner (person linked via `client_profile_id`) or representative (person with `can_manage=true` and `is_representative=true`)
- **Note**: required textarea. Admin describes what needs to be updated.
- **Auto-populate checkbox**: When checked, pre-fills the note with AI flags from `verification_result.flags` formatted as bullet points.
- **Send Request**: 
  1. Creates `document_update_requests` row
  2. Sends email via Resend to the selected person
  3. Email subject: "Document Update Required — {Document Type} for {Service Name}"
  4. Email body: "Dear {Name}, An update is required for your {Document Type} submitted for {Service Name}. Note from reviewer: {note}. Please log in to update this document. This email was autogenerated on behalf of {admin name}."

### 4. Request Update API Route

**Create:** `src/app/api/admin/documents/[id]/request-update/route.ts`

```ts
// POST — Send document update request
// Body: { sent_to_profile_id, note, auto_populated_from_flags }
// 1. Verify admin session
// 2. Get document details (document_type name, service name)
// 3. Get recipient email from client_profiles
// 4. Insert document_update_requests row
// 5. Send email via Resend
// 6. Return { ok: true, request_id }
```

### 5. Request History Display

Below each document card, show previous update requests (if any):

```
📩 Update requested on Apr 17 by Jane Doe
"Please re-upload proof of address dated within the last 3 months."
```

Query `document_update_requests` for each document and display in reverse chronological order. Show most recent only, with "Show all" link if multiple.

### 6. Admin Approve/Reject

**Approve button**: PATCH document to set `admin_status = 'approved'`, `admin_reviewed_at`, `admin_reviewed_by`

**Reject button**: Opens inline form with required rejection reason textarea. On submit: PATCH document to set `admin_status = 'rejected'`, `rejection_reason`, `admin_reviewed_at`, `admin_reviewed_by`

**API route:** Check if `/api/admin/documents/library/[id]/review` already handles this. If so, reuse it. If it uses old `document_uploads` table, create a new route or adapt.

### 7. Preview + Download

- **Preview button**: Opens `DocumentPreviewDialog` with signed URL from `/api/documents/[id]/download`
- **Download button**: Direct download link to signed URL

### 8. Upload for Missing Documents

- **Upload button** on not-uploaded document rows: Opens `AdminDocumentUploader` dialog
- After upload, trigger AI verification via `/api/verify-document`
- Refresh document list

### 9. Flagged Documents Summary

At the bottom of the Documents section, show `FlaggedDiscrepanciesCard` if any documents have flags. Show:
- Count of flagged documents
- Per document: flag list + "Override to Pass" + "Request Re-upload" buttons

---

## Data Fetching

The admin service detail page already fetches documents:
```ts
supabase
  .from("documents")
  .select("id, file_name, file_path, verification_status, uploaded_at, document_type_id, client_profile_id, document_types(id, name, category)")
  .eq("service_id", id)
  .eq("is_active", true)
```

Expand to include verification_result and admin fields:
```ts
supabase
  .from("documents")
  .select(`
    id, file_name, file_path, verification_status, verification_result,
    admin_status, admin_reviewed_at, rejection_reason,
    uploaded_at, document_type_id, client_profile_id,
    document_types(id, name, category),
    client_profiles(id, full_name)
  `)
  .eq("service_id", id)
  .eq("is_active", true)
```

Also fetch document_update_requests:
```ts
supabase
  .from("document_update_requests")
  .select("*")
  .eq("service_id", id)
  .order("sent_at", { ascending: false })
```

Also fetch required document types for the template (to show "not uploaded" rows):
```ts
// From service_templates.document_requirements or document_types linked to the template
```

---

## Files to Create

- `src/app/api/admin/documents/[id]/request-update/route.ts` — send update request + email
- `src/components/admin/DocumentUpdateRequestDialog.tsx` — request update dialog (optional — could be inline)

## Files to Modify

- `src/app/(admin)/admin/services/[id]/ServiceDetailClient.tsx` — replace simple doc list with rich cards
- `src/app/(admin)/admin/services/[id]/page.tsx` — expand document query + fetch update requests

## Files to Reuse (adapt as needed)

- `src/components/admin/DocumentStatusRow.tsx` — AI verification + admin review UI
- `src/components/admin/DocumentPreviewDialog.tsx` — preview modal
- `src/components/admin/FlaggedDiscrepanciesCard.tsx` — flagged summary
- `src/components/admin/AdminDocumentUploader.tsx` — upload dialog
- `src/app/api/documents/[id]/download/route.ts` — signed URL for preview
- `src/app/api/verify-document/route.ts` — AI verification trigger

---

## CRITICAL RULES

1. Read `CLAUDE.md` for all project conventions
2. `npm run build` must pass clean before every commit
3. Update `CHANGES.md` in every commit — include SQL migration instructions
4. Commit and push after each logical batch
5. Use `createAdminClient()` for server-side queries
6. Use `getTenantId(session)` on EVERY new query
7. Check if `admin_status` column exists on `documents` — if not, document the ALTER TABLE SQL needed
8. The `documents.tenant_id` column exists (added in B-020)
9. Toast position: `{ position: "top-right" }`

## Verification

1. Admin service detail → Documents section shows rich cards
2. Uploaded docs show AI confidence %, rules, extracted fields
3. Flagged docs show flag list
4. Preview opens document in modal
5. Download works
6. Approve/Reject updates admin_status
7. "Request Update" opens dialog with send-to options + note
8. Auto-populate checkbox fills note from AI flags
9. Email sent on request
10. Request history shows below document card
11. Missing docs show "Not uploaded" with Upload button
12. Upload triggers AI verification
13. Flagged summary at bottom
14. `npm run build` passes clean
