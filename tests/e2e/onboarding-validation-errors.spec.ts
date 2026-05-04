import { test, expect } from "@playwright/test";

/**
 * Validation behavior on the wizard. The wizard surfaces messages from
 * `src/lib/validation.ts` (see B-047). We don't mock the API for these
 * because validation runs client-side before any save fires.
 */

test.beforeEach(async ({ page }) => {
  // Templates lookup — same canned shape as the happy-path test.
  await page.route("**/api/templates*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "tpl-1",
          name: "Global Business Corporation",
          description: "GBC formation",
          required_fields: [
            { key: "contact_email", label: "Contact email", type: "email", required: true, section: "Details" },
            { key: "proposed_business_activity", label: "Proposed activity", type: "text", required: true, section: "Details" },
          ],
        },
      ]),
    });
  });
});

test("entering an invalid email surfaces the validation message", async ({ page }) => {
  await page.goto("/apply/tpl-1/details");

  await page.getByLabel(/contact email/i).fill("not-an-email");
  await page.getByLabel(/proposed activity/i).fill("Trading");
  await page.getByRole("button", { name: /next/i }).click();

  await expect(
    page.getByText(/Enter a valid email like name@example\.com\./i),
  ).toBeVisible();
});

test("leaving a required field empty blocks navigation with a message", async ({ page }) => {
  await page.goto("/apply/tpl-1/details");

  // Touch and leave the required field empty
  await page.getByLabel(/proposed activity/i).fill("");
  await page.getByRole("button", { name: /next/i }).click();

  await expect(page.getByText(/required/i)).toBeVisible();
});

test("submitting Review with a missing required document is blocked", async ({ page }) => {
  // Application data with no uploaded documents
  await page.route("**/api/applications/*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "app-test-1",
        reference_number: "GBC-0001",
        status: "draft",
        contact_email: "client@example.com",
        proposed_business_activity: "Trading",
        documents: [],
      }),
    });
  });

  await page.goto("/apply/tpl-1/review");

  // Submit should be disabled OR show a "missing requirement" message.
  const submitButton = page.getByRole("button", { name: /submit/i });
  if (await submitButton.isVisible()) {
    await submitButton.click();
    await expect(page.getByText(/missing|required document|upload/i)).toBeVisible();
  } else {
    await expect(page.getByText(/missing|required document|upload/i)).toBeVisible();
  }
});
