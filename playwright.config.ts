import { defineConfig, devices } from "@playwright/test";

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  fullyParallel: isCI,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  workers: isCI ? 2 : 1,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : [["html", { open: "never" }]],
  globalSetup: "./tests/setup/playwright.global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    storageState: "./tests/.auth/user.json",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    port: 3000,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    env: {
      NODE_ENV: "test",
    },
  },
});
