import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import { SignJWT } from "jose";

loadEnv({ path: resolve(__dirname, "../../.env.test") });

const STORAGE_STATE_PATH = resolve(__dirname, "../.auth/user.json");

/**
 * Writes a Playwright `storageState` containing a fake Auth.js session cookie
 * so each E2E test starts authenticated. The token is signed with the same
 * NEXTAUTH_SECRET as the dev server so middleware accepts it.
 *
 * Notes:
 * - Cookie name follows Auth.js v5 default: `authjs.session-token` (or the
 *   `__Secure-` prefix when the URL is https). We use http://localhost so
 *   the bare name is correct.
 * - The decoded JWT contents below are minimal — every E2E test that needs
 *   a real DB-backed user mocks the API responses via `page.route()`.
 */
export default async function globalSetup() {
  const baseUrl = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET missing — load .env.test before running E2E tests.");
  }

  const url = new URL(baseUrl);
  const isSecure = url.protocol === "https:";
  const cookieName = isSecure ? "__Secure-authjs.session-token" : "authjs.session-token";

  const now = Math.floor(Date.now() / 1000);
  const token = await new SignJWT({
    sub: "00000000-0000-0000-0000-000000000001",
    email: "test-client@example.com",
    name: "Test Client",
    role: "client",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + 60 * 60 * 24)
    .sign(new TextEncoder().encode(secret));

  const storageState = {
    cookies: [
      {
        name: cookieName,
        value: token,
        domain: url.hostname,
        path: "/",
        expires: now + 60 * 60 * 24,
        httpOnly: true,
        secure: isSecure,
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };

  mkdirSync(dirname(STORAGE_STATE_PATH), { recursive: true });
  writeFileSync(STORAGE_STATE_PATH, JSON.stringify(storageState, null, 2));
}
