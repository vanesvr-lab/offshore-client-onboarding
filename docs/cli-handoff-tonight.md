# CLI Handoff — Tonight's Build (2026-04-17)

## What to do

Implement Phases 2-5 of B-015 (Services + Profiles Redesign). The full spec is in two docs — read both before starting:

1. `docs/cli-brief-phase2-5.md` — phase-by-phase implementation instructions (273 lines)
2. `docs/services-profiles-redesign.md` — full schema, decisions, and architecture (718 lines)

## Current state

- **Phase 1 is done and deployed.** Schema, auth migration, profiles pages, sidebar nav — all committed and pushed.
- **DB migration is confirmed run.** All 8 new tables exist with migrated data (tenants: 1, users: 17, client_profiles: 14, services: 20, profile_service_roles: 11). tenant_id columns added to existing tables.
- **Phase 2A was started but NOT committed.** Three untracked files exist:
  - `src/app/(admin)/admin/services/page.tsx` (36 lines)
  - `src/app/(admin)/admin/services/ServicesPageClient.tsx` (186 lines)
  - `src/app/(admin)/admin/services/[id]/page.tsx` (109 lines)
  
  **Read these first** — they may be partially working or need finishing. Build on them, don't start from scratch.

## Priority order (if you can't finish everything)

1. **Phase 2A + 2B** — Services list + detail page (highest impact)
2. **Phase 2C** — Service creation wizard
3. **Phase 4A** — Client dashboard auto-redirect (quick win)
4. **Phase 3A + 3B** — Doc types + DD requirements CRUD
5. Everything else in Phases 3-5

## Critical rules

- Read `CLAUDE.md` for all project conventions
- `npm run build` must pass clean before every commit
- Update `CHANGES.md` in every commit
- Commit and push after each logical batch (Vercel deploys from GitHub)
- Use `createAdminClient()` for server-side queries
- Use `getTenantId(session)` from `src/lib/tenant.ts` on every new query
- shadcn/ui uses `@base-ui/react` — use `render` prop, not `asChild`
- `Select` `onValueChange` returns `string | null` — always coalesce
- Supabase join type inference — cast via `unknown` first
- Keep old pages working (don't delete old routes until Phase 5)
- No `console.log` in production code, no `any` types

## Don't ask — just build

The owner is asleep. There are no open questions. All schema decisions are made, all specs are written. If you hit an ambiguity, make the reasonable choice and document it in your commit message. Only stop for actual build failures you can't resolve.
