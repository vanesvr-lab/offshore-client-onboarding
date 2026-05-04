import { test, expect } from "@playwright/test";

/**
 * Autosave reliability — B-050 §4. A field change triggers `POST
 * /api/applications/save`. If the first attempt fails (500), the wizard
 * retries with backoff and shows status pills: Saving… → Save failed,
 * retrying → Saved.
 */

test("autosave retries after a 500 and lands as Saved", async ({ page }) => {
  await page.route("**/api/templates*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "tpl-1",
          name: "Global Business Corporation",
          required_fields: [
            { key: "proposed_business_activity", label: "Proposed activity", type: "text", required: true, section: "Details" },
          ],
        },
      ]),
    });
  });

  let saveCalls = 0;
  await page.route("**/api/applications/save", async (route) => {
    saveCalls++;
    if (saveCalls === 1) {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Simulated upstream failure" }),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ applicationId: "app-test-1", referenceNumber: "GBC-0001" }),
      });
    }
  });

  await page.goto("/apply/tpl-1/details");
  await page.getByLabel(/proposed activity/i).fill("Trading");
  // Blur to trigger autosave
  await page.keyboard.press("Tab");

  // Saving feedback (the exact wording is per B-050 §4: Saving…/Save failed, retrying/Saved)
  await expect(page.getByText(/saving|save failed|retrying|saved/i).first()).toBeVisible({ timeout: 10_000 });
  // Ultimately the retry succeeds → "Saved" appears.
  await expect(page.getByText(/^saved$/i)).toBeVisible({ timeout: 15_000 });
  expect(saveCalls).toBeGreaterThanOrEqual(2);
});
