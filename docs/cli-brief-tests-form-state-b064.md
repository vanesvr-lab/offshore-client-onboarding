# B-064 — Regression tests for KYC form-state architecture

## Why

B-063 re-architected `PerPersonReviewWizard`'s form state to a
server-derived + optimistic-overlay pattern. The bug class it fixed
(autosaves wiping multi-field state) survived three previous patches
(B-061, B-062). The structural fix is in place and verified in prod —
but without tests, the bug class can creep back via a future refactor
that doesn't appreciate the constraints.

This batch adds regression tests at three layers:

1. **Unit tests** for the form-state composition logic (
   `serverFormData + overlay = form`, reconciliation behavior).
2. **API integration tests** for the save endpoint's partial-payload
   contract (`POST /api/profiles/kyc/save` with one field only
   updates that field; doesn't wipe others).
3. **E2E test** for the full user flow: type address → save → close
   → re-open → values persist + a wait+re-check that no autosave
   wipes them later.

Uses the existing B-051 testing infrastructure (Vitest + Playwright
+ MSW).

## Scope

- **In**: new test files in `tests/unit/`, `tests/integration/`,
  `tests/e2e/`. No production code changes.
- **Out**: refactoring existing tests, adding fixtures unrelated to
  this scenario.

## Working agreement

Single batch. Tests added alongside the existing test suite. After
CLI implements: `npm run test`, `npm run test:e2e`, all green.

---

## Step 1 — Unit test for form-state composition

**New file**: `tests/unit/components/perPersonFormState.test.ts`

The composition logic itself is internal to `PerPersonReviewWizard`,
so we extract it into a tiny pure helper first.

### 1.1 — Extract the merge + reconcile logic to a pure function

**New file**: `src/lib/utils/formStateOverlay.ts`

```ts
/**
 * B-063 — Compose a form view from server data + optimistic overlay.
 *
 * `serverData` is the source of truth (what's currently in the DB).
 * `overlay` holds user edits that haven't been reconciled yet.
 * The returned object is what the inner steps render.
 */
export function composeFormState<T extends Record<string, unknown>>(
  serverData: T,
  overlay: Partial<T>,
): T {
  return { ...serverData, ...overlay };
}

/**
 * Drop overlay entries whose server value has caught up.
 * Returns a new overlay (or the same reference if nothing changed).
 */
export function reconcileOverlay<T extends Record<string, unknown>>(
  serverData: T,
  overlay: Partial<T>,
): Partial<T> {
  let changed = false;
  const next: Partial<T> = {};
  for (const [key, value] of Object.entries(overlay) as Array<[keyof T, T[keyof T]]>) {
    const serverValue = serverData[key];
    if (serverValue === value) {
      changed = true;
      continue;
    }
    next[key] = value;
  }
  return changed ? next : overlay;
}
```

Then update `PerPersonReviewWizard.tsx` to import and use these
helpers (replacing the inline implementations of the merge useMemo
and the reconcile useEffect). The behavior is identical; we're just
making the logic testable.

### 1.2 — Test the helpers

`tests/unit/utils/formStateOverlay.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { composeFormState, reconcileOverlay } from "@/lib/utils/formStateOverlay";

describe("composeFormState", () => {
  it("returns server data when overlay is empty", () => {
    const server = { address_line_1: "Server St", address_city: "Server City" };
    expect(composeFormState(server, {})).toEqual(server);
  });

  it("overlays user edits over server data", () => {
    const server = { address_line_1: "Server St", address_city: "Server City" };
    const overlay = { address_line_1: "User St" };
    expect(composeFormState(server, overlay)).toEqual({
      address_line_1: "User St",
      address_city: "Server City",
    });
  });

  it("does not mutate inputs", () => {
    const server = { x: 1 };
    const overlay = { x: 2 };
    composeFormState(server, overlay);
    expect(server).toEqual({ x: 1 });
    expect(overlay).toEqual({ x: 2 });
  });
});

describe("reconcileOverlay", () => {
  it("drops overlay entries that match server", () => {
    const server = { a: "x", b: "y" };
    const overlay = { a: "x", b: "z" };
    expect(reconcileOverlay(server, overlay)).toEqual({ b: "z" });
  });

  it("returns same reference when nothing reconciles", () => {
    const server = { a: "x" };
    const overlay = { a: "y" };
    const out = reconcileOverlay(server, overlay);
    expect(out).toBe(overlay);
  });

  it("handles empty overlay", () => {
    expect(reconcileOverlay({ a: "x" }, {})).toEqual({});
  });

  it("handles all entries reconciling", () => {
    const server = { a: "x", b: "y" };
    const overlay = { a: "x", b: "y" };
    const out = reconcileOverlay(server, overlay);
    expect(out).toEqual({});
    expect(out).not.toBe(overlay); // changed → new ref
  });
});
```

---

## Step 2 — API integration test for partial-payload contract

**New file**: `tests/integration/api/profiles-kyc-save-partial.test.ts`

Use the existing MSW + handler infrastructure from `tests/msw/`. The
test imports the route handler directly (per the B-051 pattern) and
verifies that:

1. A payload with one address field updates only that field on the
   mocked Supabase response.
2. The server's UPDATE statement received only the field that was sent
   (no other fields cleared).
3. Empty `fields` object returns 200 with the existing record (no-op).

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { POST } from "@/app/api/profiles/kyc/save/route";
import { server } from "@/tests/msw/server";
import { http, HttpResponse } from "msw";

describe("POST /api/profiles/kyc/save — partial payload contract", () => {
  beforeEach(() => {
    // Mock the auth so the route considers us a valid client session.
    // (The existing B-051 test setup mocks auth — reuse that helper.)
  });

  it("only updates the field in the payload", async () => {
    let capturedUpdate: Record<string, unknown> | null = null;
    server.use(
      http.patch("*/rest/v1/client_profile_kyc*", async ({ request }) => {
        capturedUpdate = await request.json();
        return HttpResponse.json({ id: "rec-1", address_line_1: "16 Twin Oaks Road" });
      }),
    );

    const req = new Request("http://localhost/api/profiles/kyc/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kycRecordId: "rec-1",
        fields: { address_line_1: "16 Twin Oaks Road" },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    // The PATCH to Supabase should have ONLY address_line_1, not the
    // other address fields, not nulls for unrelated columns.
    expect(capturedUpdate).toMatchObject({
      address_line_1: "16 Twin Oaks Road",
    });
    // Critically: no `address_city: null`, no `address_country: null`, etc.
    expect(capturedUpdate).not.toHaveProperty("address_city");
    expect(capturedUpdate).not.toHaveProperty("passport_number");
  });

  it("doesn't crash on empty fields object", async () => {
    const req = new Request("http://localhost/api/profiles/kyc/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kycRecordId: "rec-1", fields: {} }),
    });
    const res = await POST(req);
    expect([200, 400]).toContain(res.status); // either is acceptable
  });
});
```

If the existing `tests/msw/handlers/supabase.ts` doesn't have a
`client_profile_kyc` table handler, add a minimal one. Read the
existing handler patterns (`tests/msw/handlers/supabase.ts`) and
follow the same shape.

---

## Step 3 — E2E test for the typing + persist + reload flow

**New file**: `tests/e2e/kyc-address-persists.spec.ts`

```ts
import { test, expect } from "@playwright/test";

test.describe("KYC address — typing + save + reload + wait", () => {
  test("user-typed address persists after save & close, re-open, and 60s wait", async ({ page }) => {
    // Test fixture user must have a KYC record in the seeded test DB.
    // The B-051 globalSetup writes a signed-in storage state for a test
    // user; this test reuses it.

    await page.goto("/kyc-review"); // routes to the latest service's People view
    await expect(page).toHaveURL(/\/services\//);

    // Click "Review KYC" on the test person card.
    await page.getByRole("button", { name: /Review KYC/i }).first().click();

    // Navigate to the Residential Address sub-step.
    await page.getByRole("button", { name: /Address/i }).click();
    await expect(page.getByRole("heading", { name: /Residential Address/i })).toBeVisible();

    // Type the address.
    await page.getByLabel(/Address line 1/i).fill("16 Twin Oaks Road");
    await page.getByLabel(/^City/i).fill("Parsippany-Troy Hills");
    await page.getByLabel(/State \/ Region/i).fill("NJ");
    await page.getByLabel(/Postal code/i).fill("07054");
    await page.getByLabel(/Country/i).selectOption("United States");

    // Click Save & Close.
    await page.getByRole("button", { name: /Save & Close/i }).click();
    await expect(page.getByText(/Review KYC/i)).toBeVisible({ timeout: 5000 });

    // Re-open the same person.
    await page.getByRole("button", { name: /Review KYC/i }).first().click();
    await page.getByRole("button", { name: /Address/i }).click();

    // Values should be visible immediately (or within ~500ms).
    await expect(page.getByLabel(/Address line 1/i)).toHaveValue("16 Twin Oaks Road");
    await expect(page.getByLabel(/^City/i)).toHaveValue("Parsippany-Troy Hills");

    // Wait 60s and verify they're still there — this catches the
    // autosave-wipe pattern from B-061 / B-062 if it ever regresses.
    await page.waitForTimeout(60_000);
    await expect(page.getByLabel(/Address line 1/i)).toHaveValue("16 Twin Oaks Road");
  });

  test("clicking Save & Close with no edits does NOT wipe existing values", async ({ page }) => {
    // Pre-condition: the test user already has an address saved (use a
    // fixture or the previous test's state).
    await page.goto("/kyc-review");
    await page.getByRole("button", { name: /Review KYC/i }).first().click();
    await page.getByRole("button", { name: /Address/i }).click();

    // Don't change anything.
    const initialAddress = await page.getByLabel(/Address line 1/i).inputValue();
    expect(initialAddress).toBeTruthy(); // sanity

    // Watch for save requests.
    let saveFired = false;
    page.on("request", (req) => {
      if (req.url().includes("/api/profiles/kyc/save") && req.method() === "POST") {
        saveFired = true;
      }
    });

    await page.getByRole("button", { name: /Save & Close/i }).click();

    // No save should have fired (overlay was empty).
    expect(saveFired).toBe(false);

    // Re-open and verify value still there.
    await page.getByRole("button", { name: /Review KYC/i }).first().click();
    await page.getByRole("button", { name: /Address/i }).click();
    await expect(page.getByLabel(/Address line 1/i)).toHaveValue(initialAddress);
  });
});
```

The `page.waitForTimeout(60_000)` is the critical assertion that
guards against the autosave-wipe class. If a future refactor
re-introduces the bug, the test fails after 60s. Slow but specific.

If 60s is too long for routine CI, mark this test with a
`@slow` tag (or use Playwright's `test.slow()`) and only run it on
nightly / pre-release.

---

## Step 4 — Verification

1. **Restart dev server**:
   ```
   pkill -f "next dev"; sleep 2; rm -rf .next; npm run dev
   ```

2. **Unit tests pass**:
   ```
   npm test -- formStateOverlay
   ```

3. **Integration test passes**:
   ```
   npm test -- profiles-kyc-save-partial
   ```

4. **E2E test passes** (slow — has a 60s wait):
   ```
   npm run test:e2e -- kyc-address-persists
   ```

5. **Full suite**:
   ```
   npm run lint && npm run build && npm test
   ```

6. **CI** — push to a branch, label with `run-e2e`, confirm the new
   E2E spec runs in the e2e job.

---

## CHANGES.md

```markdown
### 2026-05-XX — B-064 — Regression tests for KYC form-state architecture (Claude Code)

Locks in the B-063 architecture so the autosave-wipes-data bug class
can't quietly regress.

- `src/lib/utils/formStateOverlay.ts`: extracted the
  `composeFormState` and `reconcileOverlay` helpers from
  `PerPersonReviewWizard.tsx` so they're independently testable. The
  wizard now imports them.
- `tests/unit/utils/formStateOverlay.test.ts`: 7 tests covering
  composition, reconciliation, and reference-equality semantics.
- `tests/integration/api/profiles-kyc-save-partial.test.ts`: verifies
  the route's partial-payload contract — sending one field updates
  only that field, doesn't wipe others. This is the structural
  guarantee that B-063 relies on.
- `tests/e2e/kyc-address-persists.spec.ts`: full user-flow regression.
  Type address → Save & Close → re-open → wait 60s → values still
  there. The 60s wait guards against any future async wipe pattern.

No production behavior changes — pure test + minor refactor for
testability.
```

---

## Things to flag to the user

- No DB migrations.
- No production-code behavior changes (only the helper extraction,
  which is a no-op refactor).
- The E2E test's 60-second wait makes it slow. Consider gating it
  behind a `run-slow-e2e` label or running it nightly.
- The E2E test depends on the seeded auth state from the B-051
  globalSetup. Adapt person/service IDs to match what's in the test
  fixtures.

## Rollback

`git revert` the single commit. Tests removed, helpers re-inlined.
No production impact either way.
