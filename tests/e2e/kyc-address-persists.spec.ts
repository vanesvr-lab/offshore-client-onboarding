import { test, expect } from "@playwright/test";

/**
 * B-064 — End-to-end regression for the autosave-wipes-data bug class
 * (B-061 / B-062, structurally fixed in B-063).
 *
 * Why this is `test.fixme` for now:
 * The per-person KYC wizard lives inside the server-rendered route
 * `src/app/(client)/services/[id]/page.tsx`, which fetches the service
 * + persons + KYC records via Supabase from the Next dev server's
 * Node process. Playwright's `page.route()` only intercepts requests
 * made by the browser, so it cannot stub those server-side reads.
 * To run these specs we need one of:
 *   1. A seeded Postgres test database the dev server connects to, or
 *   2. An MSW-style interceptor injected into the dev server process
 *      (not currently set up — `tests/msw/server.ts` runs in Vitest only).
 *
 * Until that infrastructure exists, this file documents the regression
 * shape so a future engineer can lift the `fixme` once the DB / mock
 * wiring is in place. The architectural guarantees are still locked in
 * at lower layers:
 *   - `tests/unit/utils/formStateOverlay.test.ts` — proves the
 *     compose/reconcile helpers behave correctly.
 *   - `tests/integration/api/profiles-kyc-save-partial.test.ts` —
 *     proves the save route's partial-payload contract: a one-field
 *     payload writes one column and never wipes others.
 *
 * The 60-second wait below is the critical browser-level assertion —
 * it catches any future `setTimeout`/autosave/effect that re-fires a
 * save with stale state. Mark this with `test.slow()` and gate behind
 * `run-slow-e2e` once enabled.
 */

const SERVICE_ID = "00000000-0000-4000-8000-000000000010";
const KYC_RECORD_ID = "00000000-0000-4000-8000-000000000020";

test.describe("KYC address — typing + save + reload + wait", () => {
  test.fixme("user-typed address persists after Save & Close, re-open, and 60s wait", async ({ page }) => {
    test.slow();

    // The save endpoint accepts the partial overlay payload and the
    // route handler writes only those fields. The captured-by-route
    // mock here would echo back the merged record so a subsequent
    // navigation reflects the new values.
    let lastSavePayload: unknown = null;
    await page.route("**/api/profiles/kyc/save", async (route) => {
      lastSavePayload = JSON.parse(route.request().postData() ?? "{}");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          record: {
            id: KYC_RECORD_ID,
            address_line_1: "16 Twin Oaks Road",
            address_city: "Parsippany-Troy Hills",
            address_state: "NJ",
            address_postal_code: "07054",
            address_country: "United States",
          },
        }),
      });
    });

    await page.goto(`/services/${SERVICE_ID}`);
    await page.getByRole("button", { name: /Review KYC/i }).first().click();
    await page.getByRole("button", { name: /Address/i }).click();
    await expect(page.getByRole("heading", { name: /Residential Address/i })).toBeVisible();

    await page.getByLabel(/Address line 1/i).fill("16 Twin Oaks Road");
    await page.getByLabel(/^City/i).fill("Parsippany-Troy Hills");
    await page.getByLabel(/State \/ Region/i).fill("NJ");
    await page.getByLabel(/Postal code/i).fill("07054");
    await page.getByLabel(/Country/i).selectOption("United States");

    await page.getByRole("button", { name: /Save & Close/i }).click();
    expect(lastSavePayload).toBeTruthy();

    // Re-open and verify values are visible immediately.
    await page.getByRole("button", { name: /Review KYC/i }).first().click();
    await page.getByRole("button", { name: /Address/i }).click();
    await expect(page.getByLabel(/Address line 1/i)).toHaveValue("16 Twin Oaks Road");
    await expect(page.getByLabel(/^City/i)).toHaveValue("Parsippany-Troy Hills");

    // The critical assertion: 60s of idle time must NOT cause an
    // autosave to fire that wipes other fields. If a future refactor
    // re-introduces the bug class, this expectation fails.
    await page.waitForTimeout(60_000);
    await expect(page.getByLabel(/Address line 1/i)).toHaveValue("16 Twin Oaks Road");
    await expect(page.getByLabel(/^City/i)).toHaveValue("Parsippany-Troy Hills");
  });

  test.fixme("Save & Close with no edits does NOT fire a save (empty overlay = no-op)", async ({ page }) => {
    let saveFired = false;
    await page.route("**/api/profiles/kyc/save", async (route) => {
      saveFired = true;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ record: { id: KYC_RECORD_ID } }),
      });
    });

    await page.goto(`/services/${SERVICE_ID}`);
    await page.getByRole("button", { name: /Review KYC/i }).first().click();
    await page.getByRole("button", { name: /Address/i }).click();

    const initialAddress = await page.getByLabel(/Address line 1/i).inputValue();
    expect(initialAddress).toBeTruthy();

    await page.getByRole("button", { name: /Save & Close/i }).click();

    // The empty overlay must short-circuit the save — no network call.
    expect(saveFired).toBe(false);

    // Re-open: existing values still there.
    await page.getByRole("button", { name: /Review KYC/i }).first().click();
    await page.getByRole("button", { name: /Address/i }).click();
    await expect(page.getByLabel(/Address line 1/i)).toHaveValue(initialAddress);
  });
});
