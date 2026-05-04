import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const WINDOW_MS = 15 * 60 * 1000;

async function freshRateLimit() {
  vi.resetModules();
  return await import("@/lib/rate-limit");
}

describe("rate-limit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first call returns allowed:true with remaining 9", async () => {
    const { checkRateLimit } = await freshRateLimit();
    expect(checkRateLimit("user:a")).toEqual({ allowed: true, remaining: 9 });
  });

  it("10 calls fill the window; 11th is blocked", async () => {
    const { checkRateLimit } = await freshRateLimit();
    for (let i = 0; i < 10; i++) {
      const r = checkRateLimit("user:a");
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(9 - i);
    }
    expect(checkRateLimit("user:a")).toEqual({ allowed: false, remaining: 0 });
  });

  it("different keys are independent", async () => {
    const { checkRateLimit } = await freshRateLimit();
    for (let i = 0; i < 10; i++) {
      checkRateLimit("user:a");
    }
    expect(checkRateLimit("user:a")).toEqual({ allowed: false, remaining: 0 });
    // user:b should still be on its first call
    expect(checkRateLimit("user:b")).toEqual({ allowed: true, remaining: 9 });
  });

  it("advancing time past WINDOW_MS resets the window", async () => {
    const { checkRateLimit } = await freshRateLimit();
    for (let i = 0; i < 10; i++) checkRateLimit("user:a");
    expect(checkRateLimit("user:a").allowed).toBe(false);

    vi.advanceTimersByTime(WINDOW_MS + 1);
    expect(checkRateLimit("user:a")).toEqual({ allowed: true, remaining: 9 });
  });

  it("resetRateLimit clears the key immediately", async () => {
    const { checkRateLimit, resetRateLimit } = await freshRateLimit();
    for (let i = 0; i < 10; i++) checkRateLimit("user:a");
    expect(checkRateLimit("user:a").allowed).toBe(false);

    resetRateLimit("user:a");
    expect(checkRateLimit("user:a")).toEqual({ allowed: true, remaining: 9 });
  });
});
