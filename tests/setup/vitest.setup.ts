import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "../msw/server";
import { useWizardStore } from "@/stores/wizardStore";

// ── MSW lifecycle ────────────────────────────────────────────────────────────
beforeAll(() => {
  server.listen({ onUnhandledRequest: "warn" });
});

afterEach(() => {
  server.resetHandlers();
  // Reset Zustand store between tests so module-scoped state can't leak.
  useWizardStore.getState().reset();
});

afterAll(() => {
  server.close();
});

// ── next/navigation mock (for client components in unit tests) ──────────────
vi.mock("next/navigation", () => {
  const router = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  };
  return {
    useRouter: () => router,
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(),
    useParams: () => ({}),
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
});

// ── next/headers mock (for API route handler tests) ─────────────────────────
vi.mock("next/headers", () => ({
  cookies: () => ({
    get: vi.fn(() => undefined),
    getAll: vi.fn(() => []),
    set: vi.fn(),
    delete: vi.fn(),
    has: vi.fn(() => false),
  }),
  headers: () => ({
    get: vi.fn(() => null),
    has: vi.fn(() => false),
    entries: vi.fn(() => [].entries()),
  }),
}));
