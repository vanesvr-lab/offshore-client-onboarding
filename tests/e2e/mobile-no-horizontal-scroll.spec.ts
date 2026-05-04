import { test, expect } from "@playwright/test";

/**
 * B-052 §5.1 — regression guard: every primary client route must fit in
 * a 375px viewport without horizontal scroll. Catches future grid-cols-N
 * or fixed-width offenders before they ship.
 *
 * Routes are stubbed via page.route so this doesn't depend on a real DB.
 */

const ROUTES = [
  "/dashboard",
  "/apply",
  "/applications/test-app-id",
  "/services/test-service-id",
];

for (const route of ROUTES) {
  test(`no horizontal scroll at 375px on ${route}`, async ({ page }) => {
    // Stub the catch-all API surface so server components and client fetches
    // never block on a missing DB.
    await page.route("**/api/**", async (r) => {
      await r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
    });

    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto(route, { waitUntil: "domcontentloaded" });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    // 1px tolerance for sub-pixel rounding
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });
}
