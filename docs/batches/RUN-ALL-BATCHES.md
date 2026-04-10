# Master Orchestrator — Run All 6 Batches Sequentially

Read CHANGES.md and CLAUDE.md first.

This is a major onboarding redesign split into 6 sequential batches. Execute
them IN ORDER. Each batch must pass `npm run build` before proceeding to the
next. If a batch fails to build, fix the errors before moving on.

The database migration has ALREADY been run in Supabase. All new tables exist
and are seeded. You only need to update the codebase.

## Execution Order

Execute each batch by reading its prompt file and completing ALL tasks in it
before moving to the next:

1. Read `docs/batches/batch-1-schema-types.md` → execute → `npm run build` → commit + push
2. Read `docs/batches/batch-2-document-library.md` → execute → `npm run build` → commit + push
3. Read `docs/batches/batch-3-kyc-forms.md` → execute → `npm run build` → commit + push
4. Read `docs/batches/batch-4-admin-client-risk.md` → execute → `npm run build` → commit + push
5. Read `docs/batches/batch-5-process-launcher.md` → execute → `npm run build` → commit + push
6. Read `docs/batches/batch-6-client-dashboard.md` → execute → `npm run build` → commit + push

## Rules for ALL batches

- Follow the Git Workflow Rule in CLAUDE.md after EACH batch (commit + push)
- Update CHANGES.md after EACH batch with a detailed entry
- Run `npm run build` after EACH batch — it MUST pass clean
- Do NOT proceed to the next batch if the current one has build errors
- Do NOT drop or rename the existing `document_uploads` table — backward compat
- Do NOT remove existing working pages — add new ones alongside
- Use `createAdminClient()` (service role) for all server-side DB queries
- Use `auth()` from `@/lib/auth` for all API route authentication
- Use `export const dynamic = "force-dynamic"` on all new server component pages
- Use `revalidatePath()` in all mutation API routes
- All new "use client" components must prevent dialogs from closing on outside click
- Match existing UI patterns: Tailwind + shadcn/ui (@base-ui/react, NOT Radix)
- Match existing color scheme: brand-dark, brand-navy, brand-accent (gold), brand-success, brand-danger, brand-muted

## Important context

- The `documents` table is NEW and separate from `document_uploads` (old)
- The `kyc_records` table stores BOTH individual and organisation KYC (use `record_type` to distinguish)
- The `application_persons` table replaces the `ubo_data` JSONB column on applications
- The `document_links` table is the junction between documents and whatever uses them
- `process_templates` + `process_requirements` define what documents each process needs
- `client_processes` + `process_documents` track active processes per client

## After all 6 batches

Run the final verification checklist from batch-6 (item 11). Then do one final
commit + push with a summary message covering the full redesign.
