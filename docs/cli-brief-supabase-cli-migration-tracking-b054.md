# B-054 — Adopt Supabase CLI for migration tracking

## Why

Three times now (most recently today, with the 500 on `address_city`)
prod has been missing schema columns that local + repo had, because
nothing tracks which migrations have been applied to which environment.
We've been hand-running SQL in the Supabase web editor and trusting
memory.

The official fix is the **Supabase CLI**. It maintains a
`supabase_migrations.schema_migrations` table on every linked project
and refuses to re-apply or skip files. Once the repo and the prod
project speak the same migration language, applying pending changes
becomes a single command:

```
npm run db:push
```

This batch sets that up: link the repo to the prod project, rename the
existing migrations to the CLI's required timestamp format, mark them
as already-applied on prod (so the CLI doesn't try to re-run them), and
document the per-deploy ritual.

**This intentionally does NOT add a CI step.** That requires putting
Supabase credentials in GitHub Actions, which we've decided is too
risky for a compliance product. The discipline is the deploy ritual,
backed by `db:status` showing drift instantly.

## Scope

- **In**: Supabase CLI config, migration renaming, status/push npm scripts, deploy-ritual docs.
- **Out**: any CI integration that requires Supabase credentials in GitHub. Add later if/when we add a project-scoped read-only token.

## Working agreement

Single batch. Some steps require the **user** to run interactive
commands locally (Supabase login, project link, schema_migrations
backfill). CLI cannot do those — call them out clearly so the user
runs them in the right order.

---

## Step-by-step

### 1 — Add Supabase CLI as a dev dependency

```bash
npm install --save-dev supabase
```

After this, `npx supabase` runs the version pinned in `package.json`
(no global install needed for contributors).

### 2 — Initialize the Supabase project structure

```bash
npx supabase init
```

This creates `supabase/config.toml` (committable) and may add things
to `.gitignore`. Verify the config file ends up at
`supabase/config.toml`.

If `supabase init` complains about an existing `supabase/` folder,
check for a stray `supabase/.temp/` and clean it (already in
`.gitignore`).

### 3 — User runs link to prod (interactive — flag this for the user)

The CLI needs the project reference to talk to the prod database. The
user's prod project ref is in their `.env.local`:
`NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co`. Extract
the `<project-ref>` portion (the subdomain).

The user must run **once**:

```bash
npx supabase login          # opens browser to authenticate
npx supabase link --project-ref <project-ref>
```

This stores credentials in `~/.supabase/` (machine-local, never
committed). Future `db:push` / `db:status` commands use that.

**Tell the user this step is theirs to run** — CLI cannot perform an
interactive OAuth login. Document it in the brief's verification
section so it's not missed.

### 4 — Rename migrations to the CLI's timestamp format

Supabase CLI requires `YYYYMMDDHHMMSS_<description>.sql` filenames.
Rename in place, preserving order:

| From | To |
|------|----|
| `002-fix-service-field-labels.sql`         | `20260301000002_fix_service_field_labels.sql` |
| `003-phase1-schema.sql`                    | `20260301000003_phase1_schema.sql` |
| `004-ai-processing-and-history.sql`        | `20260301000004_ai_processing_and_history.sql` |
| `005-rls-default-deny.sql`                 | `20260301000005_rls_default_deny.sql` |
| `006-document-scope-flag.sql`              | `20260301000006_document_scope_flag.sql` |
| `007-residential-address-fields.sql`       | `20260301000007_residential_address_fields.sql` |
| `008-professional-details-and-deferred-ai.sql` | `20260301000008_professional_details_and_deferred_ai.sql` |

The `20260301000002…000008` numbers are deliberately synthetic — they
preserve the original ordering without pretending to encode the real
authorship dates. Use `git mv` so history is preserved.

Note: hyphens in filenames are not allowed by the CLI; use underscores
(matches the convention shown above).

### 5 — User backfills the remote `schema_migrations` table (interactive — flag for the user)

This is the critical step that prevents `supabase db push` from trying
to re-apply migrations that were already manually run via the SQL
editor. The user opens the Supabase SQL editor (the tab they already
have open at `nejnslksicwrerzkthfm/sql/...`) and runs:

```sql
create schema if not exists supabase_migrations;

create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);

-- Mark every migration that has already been applied to prod as 'applied'.
-- These are the ones we know are live (verified earlier today via PostgREST
-- introspection: 003, 004, 007, 008 confirmed; 005 RLS confirmed via B-045
-- entry; 002 ran historically; 006 the user is running today as a hotfix).
insert into supabase_migrations.schema_migrations (version, name) values
  ('20260301000002', 'fix_service_field_labels'),
  ('20260301000003', 'phase1_schema'),
  ('20260301000004', 'ai_processing_and_history'),
  ('20260301000005', 'rls_default_deny'),
  ('20260301000006', 'document_scope_flag'),
  ('20260301000007', 'residential_address_fields'),
  ('20260301000008', 'professional_details_and_deferred_ai')
on conflict (version) do nothing;
```

After running this, `npx supabase migration list --linked` should show
all 7 as "Remote" (= applied) and matching the local files.

**Important**: this step assumes the user has applied migration 006
(the hotfix from earlier today) before running this SQL. If 006 is
NOT yet applied, **run the 006 ALTER TABLE block first**, then this
backfill. Otherwise the CLI will think 006 is applied when it isn't,
and a future check will silently miss it. CHANGES.md should call this
out clearly.

### 6 — Add npm scripts

`package.json` `scripts` block:

```json
"db:status": "supabase migration list --linked",
"db:push":   "supabase db push --linked",
"db:diff":   "supabase db diff --linked"
```

What each does:
- `db:status` — print local vs remote migrations side by side. The
  daily "is anything pending?" command.
- `db:push`  — apply any local migrations that are missing on remote.
  The "deploy" command.
- `db:diff`  — show schema differences (useful for sanity checks
  during a migration write).

### 7 — Document the deploy ritual in CLAUDE.md

Add a new section right after "Dev Commands":

```markdown
## Database Migration Workflow

Migrations are tracked by Supabase CLI in `supabase/migrations/` and on
the prod project's `supabase_migrations.schema_migrations` table.

**Daily check** — see if anyone (you or another instance) added a
migration that hasn't been pushed yet:

```bash
npm run db:status
```

If anything shows "Local" without a matching "Remote", a `db:push` is
pending.

**Adding a new migration:**

1. Create the file: `supabase/migrations/<YYYYMMDDHHMMSS>_<description>.sql`. Use `npx supabase migration new <description>` to auto-generate the timestamp.
2. Write the SQL. Prefer idempotent (`CREATE … IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) when possible.
3. Test locally (if you have a local Supabase running) or in the SQL editor against a non-critical area.
4. Open a PR. After merge:
5. **Run `npm run db:push`** from your local machine. This applies the new migration to prod.
6. Verify with `npm run db:status` — should show no pending.
7. Add a CHANGES.md note that the migration was pushed.

**Why no CI auto-push?** Putting Supabase credentials (DB password or
service role) in GitHub Actions secrets is a leak risk for a
compliance product. The deploy ritual is short and the `db:status`
command makes drift visible immediately.
```

### 8 — Verification

1. **`npm run db:status`** should print 7 rows, all paired (Local +
   Remote, same version each).
2. **Sanity test 1**: `npx supabase migration new test_canary` →
   creates an empty file in `supabase/migrations/`. Run `npm run
   db:status` → it should now show that file as "Local only".
   `git checkout supabase/migrations/` to revert.
3. **Sanity test 2**: `npm run db:push` from a clean tree — should
   say "Remote database is up to date".
4. **Build/lint/test still green**:
   ```
   npm run lint && npm run build && npm test
   ```
5. **Push the PR** — CI should pass exactly as before. No new jobs,
   no new secrets, nothing changes for CI.

---

## CHANGES.md entry

```markdown
### 2026-05-04 — B-054 — Adopt Supabase CLI for migration tracking (Claude Code)

Replaces the ad-hoc "paste SQL into Supabase web editor and remember to
do it" workflow that has caused three production incidents (most
recently today: 500 on KYC autosave because migrations 006/007/008
were never applied). Now the CLI tracks state in
`supabase_migrations.schema_migrations` on the linked project; drift
is one `npm run db:status` away.

- `supabase` added to devDependencies.
- `supabase init` ran — `supabase/config.toml` committed.
- 7 migration files renamed to the CLI's required
  `<YYYYMMDDHHMMSS>_<name>.sql` format. Synthetic timestamps used to
  preserve order. Filenames are listed in the B-054 brief.
- One-time SQL to backfill the remote `schema_migrations` table (so
  the CLI knows existing migrations were already applied) was run by
  the user in the Supabase SQL editor.
- Three new npm scripts: `db:status` / `db:push` / `db:diff`.
- CLAUDE.md gains a "Database Migration Workflow" section.
- **Explicitly NOT done**: CI integration. Adding Supabase
  credentials to GitHub Actions secrets is a leak risk for a
  compliance product. The deploy ritual + `db:status` discipline are
  the guard. Consider revisiting later with a project-scoped
  read-only token.

Tech-debt #14b (recurring missing-migration incidents): tracked but
not flagged in the open list because the workflow is now structurally
preventative.
```

---

## Things to flag to the user (DO NOT SKIP)

These are the steps **only the user can run**, in this order:

1. **Apply migration 006 if not already applied** (the `document_types.scope` ALTER TABLE block you ran earlier today should have already done this — `npm run db:status` will tell you).
2. **`npx supabase login`** (browser OAuth flow).
3. **`npx supabase link --project-ref <ref>`** where `<ref>` is the subdomain of `NEXT_PUBLIC_SUPABASE_URL`.
4. **Run the `schema_migrations` backfill SQL** (Step 5 above) in the Supabase web editor.
5. **`npm run db:status`** — expect all 7 migrations paired Local + Remote.

Until those run, `db:push` will not work for the user.

If `npm run db:status` shows mismatches the brief doesn't anticipate
(e.g., a migration that's "Local only" or "Remote only" beyond what
we've accounted for), STOP and document the mismatch in CHANGES.md
rather than guessing.

## Rollback

`git revert` the batch commit. The remote `schema_migrations` rows can
stay (harmless) or be dropped with:

```sql
drop table supabase_migrations.schema_migrations;
drop schema supabase_migrations;
```

No application code or RLS is touched.
