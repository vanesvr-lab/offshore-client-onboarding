# Build Decisions Log

| Date | Decision | Reasoning | Alternatives Considered |
|------|----------|-----------|------------------------|
| 2026-04-05 | Initialized Next.js 14 in project root via subdir hoist | Directory name has capital letters (invalid npm package name); created in `gwms-onboarding/` then hoisted files to root | Direct init in root |
| 2026-04-05 | Used `@supabase/ssr` instead of `auth-helpers-nextjs` | `auth-helpers-nextjs` is deprecated as of 2024 | `auth-helpers-nextjs` |
| 2026-04-05 | Model: `claude-opus-4-6` | User preference over spec's placeholder model ID `claude-sonnet-4-20250514` | `claude-sonnet-4-6` |
| 2026-04-05 | Admin accounts seeded via SQL with manual Supabase auth user creation | No invite flow needed for POC | Separate invite/register admin flow |
| 2026-04-05 | KYC docs (7-13) uploaded once for primary contact | Per-person uploads deferred to v2 per spec | Per-director/per-UBO upload |
| 2026-04-05 | Used `sonner` for toast notifications | Modern replacement for shadcn toast; cleaner API | shadcn toast component |
| 2026-04-05 | Files organized under `src/` directory | create-next-app@14 default with App Router generates `src/app/` structure | Flat `app/` at root |
| 2026-04-05 | shadcn base-nova style (v2 default) | Latest shadcn default; oklch color system | New York style |
| 2026-04-05 | Supabase Auth for POC authentication | Zero-setup, integrates directly with RLS for POC speed | Clerk, Auth.js, custom JWT |
| 2026-04-05 | **FUTURE: Replace Supabase Auth** | Supabase controlling authentication is not desirable long-term. POC only. Production build should migrate to self-hosted auth (Auth.js/NextAuth or custom JWT). Data model, RLS, and UI do not need to change — only the auth layer. | Auth.js (recommended), Clerk, custom JWT |
