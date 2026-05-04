import { test, expect } from "@playwright/test";

/**
 * External KYC invite flow. The page lives at `/kyc/fill/[token]` and is
 * accessible without an Auth.js session — the verification token is the only
 * gate. This test runs unauthenticated by clearing the seeded cookie.
 */

const TOKEN = "test-token-abc";

test.use({ storageState: { cookies: [], origins: [] } });

test("invitee can verify, fill, and submit the external KYC form", async ({ page }) => {
  // Initial token resolution returns the KYC record awaiting fill.
  await page.route("**/api/kyc/verify-code", async (route) => {
    const body = JSON.parse(route.request().postData() ?? "{}");
    if (body.code === "123456") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          verified: true,
          kycRecord: {
            id: "rec-1",
            client_id: "c-1",
            record_type: "individual",
            full_name: null,
            email: null,
            profile_roles: [],
          },
          client: { id: "c-1", company_name: "Acme", due_diligence_level: "cdd" },
          documents: [],
          roleDocRequirements: [],
          ddRequirements: [],
        }),
      });
      return;
    }
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: "Incorrect code. 4 attempts remaining." }),
    });
  });

  // Save and submit external endpoints — token-based.
  await page.route("**/api/kyc/save-external", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    });
  });
  await page.route("**/api/kyc/submit*", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });

  await page.goto(`/kyc/fill/${TOKEN}`);

  // Enter the verification code.
  await page.locator("input[inputmode='numeric'], input[type='text']").first().fill("123456");
  await page.getByRole("button", { name: /verify|continue/i }).click();

  // Wizard appears — fill the required identity fields.
  await page.getByLabel(/full name/i).fill("Jane Doe");
  await page.getByLabel(/email/i).fill("jane@example.com");

  // Submit and assert we reach the confirmation page.
  await page.getByRole("button", { name: /submit|finish/i }).last().click();
  await expect(page.getByText(/received|thank you|submitted/i)).toBeVisible();
});
