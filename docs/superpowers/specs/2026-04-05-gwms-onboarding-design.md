# GWMS Client Onboarding Portal — Design Spec
**Date:** 2026-04-05
**Status:** Approved

---

## Overview

A two-portal POC web app for GWMS Ltd to digitize their KYC/AML client onboarding process. Business clients submit compliance documents through a guided wizard; GWMS staff review, verify, and approve submissions via an admin portal.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router), TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Forms | react-hook-form + zod |
| File upload | react-dropzone |
| Wizard state | Zustand |
| Database + Auth + Storage | Supabase (PostgreSQL, email/password auth, private Storage bucket) |
| AI Verification | Anthropic `claude-opus-4-6` |
| Email | Resend |
| Hosting | Vercel |

---

## Architecture

**Two portals, one codebase:**
- Client portal: `/dashboard`, `/apply`, `/applications`
- Admin portal: `/admin/*`
- Middleware enforces role-based route protection; post-login redirect based on `profile.role`

**Three Supabase clients:**
- `lib/supabase/client.ts` — browser client
- `lib/supabase/server.ts` — server client (reads cookies)
- `lib/supabase/admin.ts` — service role client (admin operations only)

**Note:** Using `@supabase/ssr` (not deprecated `auth-helpers-nextjs`)

**File storage:** Private `documents` bucket; all access via signed URLs (60-min expiry)

**Project root:** `/Users/elaris/Documents/Claude_webapp_client_onboarding/`

---

## Database Schema

Tables: `profiles`, `service_templates`, `document_requirements`, `applications`, `document_uploads`, `audit_log`, `email_log`

Full SQL in spec source: `gwms-onboarding-spec.md` Section 3

**Seed data:**
- 6 service templates (GBC, AC, Trust, Foundation, CIS, Bank Account Opening)
- 18 GBC document requirements (6 corporate, 7 KYC, 5 compliance)
- Test admin: Jane Doe, `vanes.vr@gmail.com` (seeded via SQL)

---

## Client Portal Flow

1. **Register/Login** → role-based redirect
2. **S1 Dashboard** → application cards or empty state CTA
3. **S2 Service Selector** → grid of template cards
4. **S3 Business Details** → company info + primary contact + UBOs (Zustand wizard)
5. **S4 Document Upload** → one doc at a time, sidebar progress, immediate AI verification
6. **S5 Verification Feedback** → inline in S4 (verified / flagged / manual_review / unreadable)
7. **S6 Review & Submit** → read-only summary, submit gated on doc statuses
8. **S7 Application Status** → stage timeline, client-facing status updates

---

## Admin Portal Flow

1. **A1 Dashboard** → stats + recent activity
2. **A2 Review Queue** → filterable/sortable table of submissions
3. **A3 Application Detail** → full info + stage mover + email + audit trail
4. **A4 Document Viewer** → PDF/image preview + AI result panel + admin override
5. **A5 Email Composer** → inline drawer, sends via Resend, logged to `email_log`
6. **A6 Approve/Reject Modal** → confirmation with reason on rejection
7. **ST1–ST3 Settings** → template manager, verification rules editor (JSON), workflow display

---

## AI Verification

- Triggered immediately on document upload (POST `/api/verify-document`)
- Sends document as base64 + verification rules + application context to `claude-opus-4-6`
- Returns structured JSON: extracted fields, match results, overall_status, confidence_score, flags, reasoning
- Statuses: `verified` | `flagged` | `manual_review`
- Admin can override any result with pass/fail + note

---

## Key Decisions

- Initialize Next.js directly in current working directory (no subfolder)
- Use `claude-opus-4-6` (user preference over spec's placeholder model ID)
- Use `@supabase/ssr` instead of deprecated `auth-helpers-nextjs`
- Admin accounts seeded via SQL (no invite flow for POC)
- KYC docs (7–13) uploaded once for primary contact with UI note about v2 per-person uploads
- All non-trivial decisions logged in `DECISIONS.md`

---

## Build Order (Phase-by-Phase)

**Phase 1 — Foundation:** Next.js init, Supabase setup, DB schema + seed, auth pages, middleware
**Phase 2 — Client Wizard:** S1–S7, Supabase Storage, AI verification API route
**Phase 3 — Admin Portal:** A1–A6, Resend email, audit logging
**Phase 4 — Settings:** Template manager, rules editor, workflow display
**Phase 5 — Polish:** Loading states, error handling, empty states, README
