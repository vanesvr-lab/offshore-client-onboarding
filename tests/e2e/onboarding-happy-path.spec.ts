import { test, expect } from "@playwright/test";
import { join } from "node:path";

const fixture = (n: string) => join(__dirname, "..", "fixtures", n);

/**
 * Happy-path onboarding wizard, end-to-end.
 *
 * The Auth.js session cookie is seeded by `playwright.global-setup.ts` so the
 * test starts authenticated. Every API call the wizard makes is intercepted
 * by `page.route()` — we're testing the client flow, not the database.
 */
test("client can complete the 3-step wizard and submit", async ({ page }) => {
  // Capture the order of API calls so the assertion can check sequence later.
  const calls: string[] = [];

  // The wizard reads the available service templates first.
  await page.route("**/api/templates*", async (route) => {
    calls.push("GET /api/templates");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: "tpl-1",
          name: "Global Business Corporation",
          description: "GBC formation",
          required_fields: [
            { key: "proposed_business_activity", label: "Proposed activity", type: "text", required: true, section: "Details" },
          ],
        },
      ]),
    });
  });

  // Autosave POSTs come back with an applicationId.
  await page.route("**/api/applications/save", async (route) => {
    calls.push("POST /api/applications/save");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ applicationId: "app-test-1", referenceNumber: "GBC-0001" }),
    });
  });

  // Document upload returns a stable upload id.
  await page.route("**/api/documents/upload", async (route) => {
    calls.push("POST /api/documents/upload");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        upload: { id: "upload-test-1", file_path: "applications/app-test-1/req-1/test.pdf" },
        uploadId: "upload-test-1",
        filePath: "applications/app-test-1/req-1/test.pdf",
      }),
    });
  });

  // Submit flips the application to submitted.
  await page.route("**/api/applications/*/submit", async (route) => {
    calls.push("POST /api/applications/[id]/submit");
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  // Application status read after submit.
  await page.route("**/api/applications/app-test-1*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "app-test-1",
        reference_number: "GBC-0001",
        status: "submitted",
      }),
    });
  });

  await page.goto("/apply");

  // Pick the first template and start the wizard.
  await page.getByRole("link", { name: /global business corporation/i }).first().click();

  // Step 1 — fill the required field.
  await page.getByLabel(/proposed activity/i).fill("International trading and consulting");
  await page.getByRole("button", { name: /next/i }).click();

  // Step 2 — upload one fixture per requirement (just one for the happy path).
  await page.setInputFiles("input[type=file]", fixture("sample-passport.pdf"));
  await page.getByRole("button", { name: /next/i }).click();

  // Step 3 — review then submit.
  await page.getByRole("button", { name: /submit/i }).click();

  // Lands on the application detail with submitted status visible.
  await expect(page).toHaveURL(/\/applications\/app-test-1/);
  await expect(page.getByText(/submitted/i)).toBeVisible();

  // Spot-check call ordering: save fired before submit.
  const saveIdx = calls.indexOf("POST /api/applications/save");
  const submitIdx = calls.indexOf("POST /api/applications/[id]/submit");
  expect(saveIdx).toBeGreaterThanOrEqual(0);
  expect(submitIdx).toBeGreaterThan(saveIdx);
});
