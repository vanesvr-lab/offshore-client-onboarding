# B-051 — Testing infrastructure for client onboarding

## Why

The portal has zero test coverage today. Tech-debt item #14 in `CHANGES.md`
flags this. The client onboarding flow (3-step wizard + external KYC invite)
is the most business-critical surface — a regression there silently corrupts
compliance records — so we're standing up a testing foundation focused on it.

## Scope

- **In**: client onboarding wizard (`/apply/[templateId]/{details,documents,review}`), KYC invite flow (`/kyc/fill/[token]`), the API routes those flows hit, and the pure utilities they depend on.
- **Out**: admin portal flows, real AI verification against live Anthropic, RLS policy testing, visual regression, mobile viewports, auth flow tests (Supabase Auth is flagged for replacement).

## Stack (decided)

- **Vitest** + `@vitest/coverage-v8` — unit + API integration runner
- **Playwright** — E2E
- **MSW** — mock Supabase REST/Auth/Storage, Anthropic, Resend at the network layer
- `@testing-library/react` + `@testing-library/jest-dom` + `jsdom` — React-touching unit tests
- DB strategy: **mocked Supabase only** (no real test project for this batch)
- CI: **GitHub Actions** on push + PR; E2E gated by `run-e2e` PR label

## Working agreement

Do NOT stop between batches. Commit and push after each batch using
descriptive messages with no batch ID (per CLAUDE.md). Update CHANGES.md
after each batch with the B-051 + sub-batch entry.

If you hit a real blocker (e.g., a route handler signature has changed since
this brief was written), document the blocker in `CHANGES.md` and stop —
don't guess.

---

## Batch 1 — Install + configs + scaffolding

### 1.1 — Install dev dependencies

Add to `devDependencies`:

```
vitest @vitest/coverage-v8 vite-tsconfig-paths
@testing-library/react @testing-library/jest-dom jsdom
@playwright/test
msw
dotenv-cli
```

After install, run `npx playwright install --with-deps chromium` once locally.

### 1.2 — Add npm scripts

In `package.json` `scripts`:

```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage",
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

### 1.3 — Create `vitest.config.ts`

- Use `vite-tsconfig-paths` so `@/...` imports resolve in tests
- `environmentMatchGlobs`: `tests/integration/**` → `node`, everything else → `jsdom`
- `setupFiles`: `tests/setup/vitest.setup.ts`
- Coverage: include `src/lib/**`, `src/stores/**`, `src/app/api/applications/**`, `src/app/api/documents/**`, `src/app/api/kyc/**`. Exclude `src/app/**/page.tsx`, `src/components/**` (E2E covers UI). Threshold 70 % lines/functions on `src/lib/**`.
- Pass `.env.test` via `loadEnv` or `dotenv` so MSW handlers see `NEXT_PUBLIC_SUPABASE_URL` etc.

### 1.4 — Create `playwright.config.ts`

- `testDir: "./tests/e2e"`
- `webServer`: `npm run dev`, port 3000, reuse existing server
- `baseURL: http://localhost:3000`
- Single project: chromium only
- `fullyParallel: false` locally, `true` in CI
- `globalSetup: "./tests/setup/playwright.global-setup.ts"`
- `use.storageState: "./tests/.auth/user.json"` so each test starts authenticated
- Reporter: `html` (output `playwright-report/`), `list` in CI

### 1.5 — Setup files

- `tests/setup/vitest.setup.ts` — `import "@testing-library/jest-dom"`, register MSW node server (`beforeAll/afterEach/afterAll`), reset Zustand stores between tests, mock `next/navigation` (return `useRouter`/`usePathname`/`useSearchParams` with no-op defaults), mock `next/headers` for API route tests
- `tests/setup/playwright.global-setup.ts` — write a signed-in `storageState` to `tests/.auth/user.json` by stubbing the Auth.js session cookie. Read the cookie name + secret from `.env.test`.

### 1.6 — `.env.test` (committed; values are fake)

```
NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=test_anon_key
SUPABASE_SERVICE_ROLE_KEY=test_service_role_key
ANTHROPIC_API_KEY=test_anthropic_key
RESEND_API_KEY=test_resend_key
RESEND_FROM_EMAIL=test@example.com
NEXTAUTH_SECRET=test_secret_at_least_32_chars_long_xxxxxxxxxxxxxxxxxxxx
NEXTAUTH_URL=http://localhost:3000
```

### 1.7 — `.gitignore` additions

```
playwright-report/
test-results/
coverage/
tests/.auth/
```

### 1.8 — Create empty test directory tree

```
tests/
  unit/{lib,utils,stores}/
  integration/api/
  e2e/
  msw/handlers/
  fixtures/
  setup/
```

Add a placeholder `tests/.gitkeep` if needed.

### 1.9 — MSW handlers (skeleton)

Create `tests/msw/handlers/supabase.ts`, `anthropic.ts`, `resend.ts`, and
`tests/msw/server.ts` that exports `setupServer(...handlers)`. Skeleton only —
flesh out per-test in later batches. Use `http.all(...)` catch-alls that
return 200 with an empty body so unconfigured calls don't crash silently;
log unmatched requests to console.

**Commit/push** at end of Batch 1: `chore: scaffold testing infrastructure (vitest, playwright, msw)`

---

## Batch 2 — Unit tests

Create the following test files. Each test file should import the SUT
directly — no mocks needed for pure functions.

### 2.1 — `tests/unit/lib/validation.test.ts`

Cover every export of `src/lib/validation.ts`:
- `isRequired`: null, undefined, empty string, whitespace-only, valid string. Custom `label` shows in message.
- `isMinLength` / `isMaxLength`: boundary cases (exact min/max, one short, one over).
- `isEmail`: empty (returns OK — not required), valid forms (`a@b.co`), invalid (`a@`, `a.b`, no TLD, whitespace), trims input.
- `isPhone`: empty OK, valid forms (`+230 555 0000`, `(555) 123-4567`), invalid (alpha chars, < 6 digits), digit count check.
- `isISODate`: empty OK, valid `2026-04-21`, invalid format (`04/21/2026`), unreal date (`2026-13-32`).
- `runAll`: returns first failure, returns OK if all pass, calls each in order.

### 2.2 — `tests/unit/lib/rate-limit.test.ts`

Use `vi.useFakeTimers()`.
- First call returns `{ allowed: true, remaining: 9 }`.
- 10 calls fill the window; 11th returns `{ allowed: false, remaining: 0 }`.
- Different keys are independent.
- Advancing time past `WINDOW_MS` resets the window.
- `resetRateLimit(key)` clears immediately.
- **Important**: import the module fresh between tests (`vi.resetModules()`) because the `attempts` map is module-scoped state.

### 2.3 — `tests/unit/utils/completionCalculator.test.ts`

Read `src/lib/utils/completionCalculator.ts` first to determine the function
signature, then write tests for: 0 % when nothing filled, 100 % when all
required filled, partial percentages, weighting if any.

### 2.4 — `tests/unit/utils/riskFlagDetection.test.ts`

Read `src/lib/utils/riskFlagDetection.ts` first. Cover each flag the
function can raise; assert no false positives on a clean record.

### 2.5 — `tests/unit/utils/personCompletion.test.ts`

`computePersonCompletion` per the B-050 reference in CHANGES.md — covers
Identity / Residential / Professional / Declarations sections. Use the same
field set the Review screen warns about. Test: empty person → 0 / not
complete; fully filled → 100 / complete; one missing field per section.

### 2.6 — `tests/unit/utils/serviceCompletion.test.ts`

Same shape — read the file, test 0 / partial / 100 cases.

### 2.7 — `tests/unit/utils/formatters.test.ts`

Read `src/lib/utils/formatters.ts` and write a test per exported formatter.
Each formatter: happy input, empty/null input, edge case (e.g., very long
phone, negative currency).

### 2.8 — `tests/unit/utils/profileDocumentRequirements.test.ts`

Cover: requirement matching by document type, behavior when no requirements
match, ordering / dedup if applicable.

### 2.9 — `tests/unit/stores/wizardStore.test.ts`

- Initial state matches `defaultBusinessDetails`.
- `setApplicationId`, `setTemplateId` update only their fields.
- `setBusinessDetails` does a partial merge (existing fields preserved).
- `reset` returns to initial state.
- Use `useWizardStore.setState({...}, true)` to reset between tests OR call `reset()` in `beforeEach`.

**Commit/push**: `test: add unit tests for validation, rate limit, utils, and wizard store`

---

## Batch 3 — API integration tests

Each API test imports the route handler directly and calls
`POST(new Request("http://localhost/api/...", { method, body }))` — no HTTP
server. MSW intercepts the Supabase calls inside the handler.

Before writing each test, **read the actual route file** to get the request
shape, response shape, and which Supabase tables it touches. Don't assume.

### 3.1 — `tests/msw/handlers/supabase.ts`

Build a small set of helpers that match Supabase REST URLs:

```ts
http.post(`${SUPABASE_URL}/rest/v1/applications`, ({ request }) => …)
http.patch(`${SUPABASE_URL}/rest/v1/applications`, …)
http.get(`${SUPABASE_URL}/rest/v1/applications`, …)
http.post(`${SUPABASE_URL}/storage/v1/object/documents/*`, …)
```

Provide a `mockSupabase({ select, insert, update })` test helper that lets
each test override per-call responses by table name. Default to 200 +
empty array.

### 3.2 — `tests/integration/api/applications-save.test.ts`

Route: `src/app/api/applications/save/route.ts`. Cases:
- Happy create: no `applicationId` in body → calls insert → returns the new ID.
- Happy update: `applicationId` present → calls update → returns same ID.
- Unauthorized: no session → 401.
- Malformed body: missing required fields → 400 with field-level error.

### 3.3 — `tests/integration/api/applications-submit.test.ts`

Route: `src/app/api/applications/[id]/submit/route.ts`. Cases:
- Happy submit: status flips to `submitted`, audit row written.
- Already-submitted: route refuses to re-submit, 409.
- Wrong owner: caller's session doesn't own the application → 403.

### 3.4 — `tests/integration/api/documents-upload.test.ts`

Route: `src/app/api/documents/upload/route.ts`. Cases:
- Happy upload: file → storage write → row in `document_uploads` → 200.
- File-size rejection: > limit (read constant from the route) → 413.
- Wrong owner / no session → 401/403.

### 3.5 — `tests/integration/api/kyc-save.test.ts`

Route: `src/app/api/kyc/save/route.ts`. Cases:
- Token-based save (no auth session, valid token) → upsert.
- Invalid/expired token → 401/403.

### 3.6 — `tests/integration/api/kyc-submit.test.ts`

Route: `src/app/api/kyc/submit/route.ts`. Cases:
- Finalization marks the KYC as submitted, fires email via Resend mock.
- Rate limit: hit the 24h limit → 429.

### 3.7 — `tests/integration/api/kyc-verify-code.test.ts`

Route: `src/app/api/kyc/verify-code/route.ts`. Cases:
- Correct 6-digit code → 200 + sets verified flag.
- Wrong code → 401.
- Malformed code (not 6 digits) → 400.

**Commit/push**: `test: add API integration tests for onboarding routes`

---

## Batch 4 — E2E tests (Playwright)

Each test runs against `npm run dev` on port 3000. The session cookie is
seeded by `globalSetup`. MSW does **not** run in the dev server — instead,
each E2E test uses Playwright's `page.route()` to intercept the relevant
API routes per scenario. (We're not testing the real DB; we're testing the
client flow.)

### 4.1 — Test fixtures

Drop these files in `tests/fixtures/`:
- `sample-passport.pdf` (any small PDF, < 100 KB)
- `sample-utility-bill.pdf`
- `sample-coi.pdf`

Use a tiny test-only PDF. Don't commit anything resembling real PII.

### 4.2 — `tests/e2e/onboarding-happy-path.spec.ts`

Flow: navigate to `/apply` → pick first template → fill all required fields
on `/details` → next → upload one fixture per requirement on `/documents`
→ next → review → submit → assert URL is `/applications/[id]` and status
text reads `submitted`.

Mock the relevant API routes via `page.route()` to return canned success
responses; assert the calls happened in the right order with the right
payloads.

### 4.3 — `tests/e2e/onboarding-validation-errors.spec.ts`

- Step 1: enter invalid email → "Next" disabled or shows the validation
  message from `validation.ts` ("Enter a valid email like name@example.com.").
- Step 1: leave a required field empty → block + message.
- Review: try to submit with a required document missing → block + message
  pointing to the missing requirement.

### 4.4 — `tests/e2e/kyc-invite-flow.spec.ts`

Use a pre-built token (seeded by `globalSetup` or via direct DB insert mock).
Navigate to `/kyc/fill/[token]` as an unauthenticated user → fill identity +
declarations → request code → mocked Resend → enter code → submit → assert
"received" confirmation page.

### 4.5 — `tests/e2e/autosave-retry.spec.ts`

On `/apply/[templateId]/details`, fill a field that triggers autosave.
Use `page.route()` to fail the first `POST /api/applications/save` with
500, then succeed on retry. Assert:
- "Saving…" → "Save failed, retrying" → "Saved" feedback is visible (per the
  B-050 §4 autosave reliability feature).
- The retry actually fires and lands.

### 4.6 — `tests/e2e/kyc-rate-limit.spec.ts`

Admin-side click of "Resend KYC invite" twice within 24h. The second click
must be blocked with the "you can resend in N hours" message (per
e5ea2f6 — KYC resend with 24h rate limit). Mock the `/api/kyc/resend`
route to return the rate-limited response on the second call.

**Commit/push**: `test: add Playwright E2E tests for onboarding flows`

---

## Batch 5 — CI + docs

### 5.1 — `.github/workflows/test.yml`

```yaml
name: test
on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm run test -- --coverage
        env:
          # NEXT_PUBLIC_* vars must be inlined at build/test time
          NODE_ENV: test

  e2e:
    if: contains(github.event.pull_request.labels.*.name, 'run-e2e') || github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
      - if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 7
```

### 5.2 — `CLAUDE.md` — add a "Testing" section

After "Dev Commands", add:

```markdown
## Testing

```bash
npm test                  # vitest unit + integration
npm run test:watch        # vitest watch mode
npm run test:coverage     # vitest with coverage report
npm run test:e2e          # playwright E2E (needs `npm run dev` running OR uses the webServer config)
npm run test:e2e:ui       # playwright UI mode
```

- Unit tests live in `tests/unit/` and cover pure functions in `src/lib/`.
- API integration tests live in `tests/integration/api/` and import route handlers directly.
- E2E tests live in `tests/e2e/` and run against the dev server.
- All external services (Supabase, Anthropic, Resend) are mocked via MSW or Playwright `page.route()` — tests never hit real APIs.
- See `tests/README.md` for fixture conventions and adding new tests.
```

### 5.3 — `tests/README.md`

Short reference: directory structure, how to add a test, MSW handler
patterns, where fixtures live, what's mocked vs real.

### 5.4 — `CHANGES.md` entry

Add a single B-051 entry summarizing all five batches:

```markdown
### 2026-05-XX — B-051 — Testing infrastructure for client onboarding (Claude Code)

Stood up Vitest + Playwright + MSW. Coverage focused on the client
onboarding wizard (3-step) and external KYC invite flow.

- Vitest config with jsdom + node environment matching, tsconfig-paths,
  coverage thresholds on `src/lib/**`.
- Playwright config with chromium-only, dev-server webServer block, seeded
  auth state via `globalSetup`.
- Unit tests: `validation`, `rate-limit`, `completionCalculator`,
  `riskFlagDetection`, `personCompletion`, `serviceCompletion`,
  `formatters`, `profileDocumentRequirements`, `wizardStore`.
- API integration tests: `applications/save`, `applications/[id]/submit`,
  `documents/upload`, `kyc/save`, `kyc/submit`, `kyc/verify-code`.
- E2E tests: onboarding happy path, validation errors, KYC invite flow,
  autosave retry, KYC rate limit.
- GitHub Actions workflow: lint + build + unit/integration on every PR;
  E2E gated by `run-e2e` label or main-branch push.
- Resolves tech-debt #14.
```

Move tech-debt #14 to "Resolved".

**Commit/push**: `ci: add GitHub Actions workflow for tests + update docs`

---

## Verification

After Batch 5, run end-to-end:

1. `rm -rf node_modules && npm install` — clean install, no peer-dep warnings on test packages
2. `npm run test` — all unit + integration pass; coverage ≥ 70% on `src/lib/**`
3. `npm run test:e2e` — all 5 E2E tests pass against the dev server
4. `npm run build` — still green; test types haven't leaked into the prod build (tsconfig should exclude `tests/**`)
5. Push the branch to a draft PR — confirm `test` job runs and passes in < 3 min
6. Add the `run-e2e` label — confirm `e2e` job spins up, runs, and uploads `playwright-report` on the artifacts tab
7. **Sanity check**: temporarily break `isEmail` to accept anything, push — confirm `validation.test.ts` fails. Revert.

If any verification step fails, document it in CHANGES.md under B-051 and
stop. Do NOT mark the batch as done with red tests.

## Things to flag to the user (don't surprise them)

- **No Supabase migrations** in this batch (testing only — pure infra).
- **No seed-data API endpoints** — tests use canned fixtures.
- **`.env.test` is committed** with fake values — confirm this is OK before
  pushing if you have any doubt.
- **`tsconfig.json` may need `"exclude": ["tests/**"]`** so the production
  build doesn't try to typecheck test files. Verify with `npm run build`.
- The auth seeding in `playwright.global-setup.ts` depends on the current
  Auth.js cookie format. If that changes, the global-setup needs updating.

## Rollback

All work is additive — new files in `tests/`, new dev-deps in
`package.json`, one new workflow file. Rollback = `git revert` the commits.
No DB or RLS changes.
