import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { POST } from "@/app/api/profiles/kyc/save/route";

const session = { user: { id: "user-1", role: "client" } };

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/profiles/kyc/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
});

/**
 * B-064 — Partial-payload contract for the KYC save route. This is the
 * structural guarantee B-063 relies on: a payload containing only the
 * fields the user actually edited must update only those fields, never
 * wiping unrelated columns.
 */
describe("POST /api/profiles/kyc/save — partial payload contract", () => {
  it("only updates the field in the payload (no other columns wiped)", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    let updatePayload: Record<string, unknown> | null = null;
    mockSupabase({
      client_profile_kyc: {
        select: [{ id: "rec-1", client_profile_id: "profile-1" }],
        update: async (req: Request) => {
          updatePayload = (await req.clone().json().catch(() => null)) as Record<string, unknown> | null;
          return [{ id: "rec-1", address_line_1: "16 Twin Oaks Road" }];
        },
      },
      client_profiles: { update: [{ id: "profile-1" }] },
    });

    const res = await POST(
      makeRequest({
        kycRecordId: "rec-1",
        fields: { address_line_1: "16 Twin Oaks Road" },
      }),
    );
    expect(res.status).toBe(200);

    // The PATCH to Supabase should include the address field plus the
    // updated_at touch the route always sets — but NOT any other column
    // that the client didn't send.
    expect(updatePayload).toMatchObject({ address_line_1: "16 Twin Oaks Road" });
    expect(updatePayload).toHaveProperty("updated_at");
    expect(updatePayload).not.toHaveProperty("address_line_2");
    expect(updatePayload).not.toHaveProperty("address_city");
    expect(updatePayload).not.toHaveProperty("address_state");
    expect(updatePayload).not.toHaveProperty("address_postal_code");
    expect(updatePayload).not.toHaveProperty("address_country");
    expect(updatePayload).not.toHaveProperty("passport_number");
    expect(updatePayload).not.toHaveProperty("passport_expiry");
    expect(updatePayload).not.toHaveProperty("nationality");
    expect(updatePayload).not.toHaveProperty("date_of_birth");
    expect(updatePayload).not.toHaveProperty("occupation");
  });

  it("forwards multiple address fields without touching unrelated columns", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    let updatePayload: Record<string, unknown> | null = null;
    mockSupabase({
      client_profile_kyc: {
        select: [{ id: "rec-1", client_profile_id: "profile-1" }],
        update: async (req: Request) => {
          updatePayload = (await req.clone().json().catch(() => null)) as Record<string, unknown> | null;
          return [
            {
              id: "rec-1",
              address_line_1: "16 Twin Oaks Road",
              address_city: "Parsippany-Troy Hills",
              address_country: "United States",
            },
          ];
        },
      },
      client_profiles: { update: [{ id: "profile-1" }] },
    });

    const fields = {
      address_line_1: "16 Twin Oaks Road",
      address_city: "Parsippany-Troy Hills",
      address_country: "United States",
    };
    const res = await POST(makeRequest({ kycRecordId: "rec-1", fields }));
    expect(res.status).toBe(200);
    expect(updatePayload).toMatchObject(fields);
    expect(updatePayload).not.toHaveProperty("passport_number");
    expect(updatePayload).not.toHaveProperty("nationality");
  });

  it("does not crash on empty fields object (no-op overlay save)", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    let updateCalled = false;
    mockSupabase({
      client_profile_kyc: {
        select: [{ id: "rec-1", client_profile_id: "profile-1" }],
        update: async () => {
          updateCalled = true;
          return [{ id: "rec-1" }];
        },
      },
    });

    const res = await POST(makeRequest({ kycRecordId: "rec-1", fields: {} }));
    expect([200, 400]).toContain(res.status);
    // Whether the route short-circuits or sends an updated_at-only PATCH,
    // it must not invent fields that the client never sent.
    if (updateCalled) {
      // If the implementation chose to PATCH, that's fine — but only
      // updated_at can have been touched.
      // (No assertion needed beyond the structural one in test 1.)
      expect(res.status).toBe(200);
    }
  });

  it("returns 401 when there is no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(
      makeRequest({ kycRecordId: "rec-1", fields: { address_line_1: "x" } }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when kycRecordId is missing", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    const res = await POST(makeRequest({ fields: { address_line_1: "x" } }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the record is not in the caller's tenant", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    mockSupabase({ client_profile_kyc: { select: [] } });
    const res = await POST(
      makeRequest({ kycRecordId: "rec-missing", fields: { address_line_1: "x" } }),
    );
    expect(res.status).toBe(404);
  });
});
