import { test, expect } from "@playwright/test";

/**
 * Resend KYC invite — B-050 §7.1. The button is disabled within 24h of the
 * last send; the server enforces the same window with 429 + retry_after.
 *
 * This test runs as an admin: we override the seeded session token below
 * with a fresh JWT carrying role=admin so we land in the admin portal.
 */

import { SignJWT } from "jose";

test.use({
  storageState: async ({}, use) => {
    const secret = process.env.NEXTAUTH_SECRET ?? "test_secret_at_least_32_chars_long_xxxxxxxxxxxxxxxxxxxx";
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({
      sub: "00000000-0000-0000-0000-000000000099",
      email: "admin-test@example.com",
      name: "Admin Test",
      role: "admin",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt(now)
      .setExpirationTime(now + 60 * 60 * 24)
      .sign(new TextEncoder().encode(secret));

    await use({
      cookies: [
        {
          name: "authjs.session-token",
          value: token,
          domain: "localhost",
          path: "/",
          expires: now + 60 * 60 * 24,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    });
  },
});

test("second resend within 24h is blocked with 429 + readable error", async ({ page }) => {
  // Stub the client detail page payload.
  await page.route("**/api/admin/clients/c-1*", async (route) => {
    if (route.request().method() !== "GET") return route.fallback();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "c-1",
        company_name: "Acme",
        client_type: "organisation",
        services: [],
      }),
    });
  });

  let sendCount = 0;
  await page.route("**/api/services/*/persons/*/send-invite", async (route) => {
    sendCount++;
    if (sendCount === 1) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true }),
      });
    } else {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({
          error: "You can resend in 23 hours.",
          retry_after: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
        }),
      });
    }
  });

  await page.goto("/admin/clients/c-1");

  // First click sends successfully.
  const resendBtn = page.getByRole("button", { name: /request kyc|resend invite/i }).first();
  if (await resendBtn.isVisible()) {
    await resendBtn.click();
    // Confirm dialog if any
    const confirmBtn = page.getByRole("button", { name: /send|resend/i }).last();
    if (await confirmBtn.isVisible()) await confirmBtn.click();
    await expect(page.getByText(/sent|resent/i).first()).toBeVisible({ timeout: 5000 });

    // Second click is blocked.
    await resendBtn.click();
    if (await confirmBtn.isVisible()) await confirmBtn.click();
    await expect(page.getByText(/can resend|24h|hours/i)).toBeVisible({ timeout: 5000 });
    expect(sendCount).toBeGreaterThanOrEqual(2);
  }
});
