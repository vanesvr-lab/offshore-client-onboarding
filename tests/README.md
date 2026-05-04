# Tests

Quick reference for the GWMS Onboarding test suite. See `CLAUDE.md` →
**Testing** for the commands.

## Layout

```
tests/
  unit/               — Vitest, jsdom env, pure-function and store tests
    lib/              — src/lib/* (validation, rate-limit, …)
    utils/            — src/lib/utils/* (formatters, completionCalculator, …)
    stores/           — src/stores/* (wizardStore)
  integration/        — Vitest, node env, route handlers called directly
    api/              — one file per route (POST is imported and invoked)
  e2e/                — Playwright, real dev server + chromium
  fixtures/           — sample PDFs (≤ 1 KB, not real PII)
  msw/                — MSW node server + per-service handlers
    handlers/         — supabase / anthropic / resend
    server.ts         — setupServer(...handlers) entry
  setup/
    vitest.setup.ts   — registers MSW, mocks next/navigation, next/headers,
                        resets the wizard store between tests
    playwright.global-setup.ts — writes a signed Auth.js session JWT to
                        tests/.auth/user.json so E2E tests start authenticated
```

## What's mocked

| Layer            | How                                                             |
|------------------|------------------------------------------------------------------|
| Supabase REST    | MSW (`tests/msw/handlers/supabase.ts`). `mockSupabase({ … })`    |
|                  | per-table-per-method overrides; respects PostgREST single-object |
|                  | Accept header so `[…]` data works for both list and `.single()`  |
| Supabase Storage | MSW catch-all returning `{ Key, Id }` for `documents/*`          |
| Anthropic        | MSW returns a minimal Messages API shape with empty content      |
| Resend           | MSW returns `{ id: "email_test_id" }` from `/emails`             |
| Auth.js          | `vi.mock("@/lib/auth", () => ({ auth: vi.fn() }))` per test      |
| `revalidatePath` | `vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))`     |
| Next router      | `vi.mock("next/navigation")` in `tests/setup/vitest.setup.ts`    |

In E2E tests, **all** API responses are stubbed via Playwright's
`page.route()` — MSW does not run inside the dev server.

## Adding a unit test

```ts
import { describe, it, expect } from "vitest";
import { thingUnderTest } from "@/lib/foo";

describe("thingUnderTest", () => {
  it("returns the expected value", () => {
    expect(thingUnderTest(1)).toBe(2);
  });
});
```

For module-scoped state (closures, in-memory caches, etc.) use
`vi.resetModules()` and a fresh dynamic import in each test — see
`tests/unit/lib/rate-limit.test.ts`.

## Adding an API integration test

```ts
import { vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { POST } from "@/app/api/foo/bar/route";

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
});

it("does the thing", async () => {
  vi.mocked(auth).mockResolvedValue({ user: { id: "u-1", role: "client" } });
  mockSupabase({ my_table: { select: [{ id: "row-1" }] } });
  const res = await POST(new Request("http://localhost/api/foo/bar", {
    method: "POST",
    body: JSON.stringify({ … }),
  }));
  expect(res.status).toBe(200);
});
```

If the route reads `request.formData()`, build the Request as a stub
object — vitest's node env hangs on real Request bodies. See
`tests/integration/api/documents-upload.test.ts`.

## Adding an E2E test

```ts
import { test, expect } from "@playwright/test";

test("does the thing", async ({ page }) => {
  await page.route("**/api/whatever", async (route) => {
    await route.fulfill({ status: 200, body: JSON.stringify({ … }) });
  });
  await page.goto("/whatever");
  await expect(page.getByText(/expected/i)).toBeVisible();
});
```

To run unauthenticated: `test.use({ storageState: { cookies: [], origins: [] } })`
in the spec file.

## Fixtures

`tests/fixtures/*.pdf` are minimal valid PDFs (~600 bytes) generated
programmatically. They contain the literal text "TEST FIXTURE - NOT REAL".
Don't commit anything resembling real PII or scanned identity documents.

## CI

`.github/workflows/test.yml` runs `lint`, `build`, and `test` on every
push and PR. The `e2e` job is gated on either the `run-e2e` PR label or
a push to `main`; failures upload `playwright-report/` as an artifact.
