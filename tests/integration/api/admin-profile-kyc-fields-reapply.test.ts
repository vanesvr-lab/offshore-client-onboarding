import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit/writeAuditLog", () => ({ writeAuditLog: vi.fn() }));

import { auth } from "@/lib/auth";
import { PATCH } from "@/app/api/admin/profiles/[id]/kyc-fields/route";

const adminSession = {
  user: { id: "admin-1", role: "admin", email: "a@a", name: "Admin" },
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/profiles/profile-1/kyc-fields", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
});

/**
 * B-117 Batch 3 — regression coverage for the Re-apply persistence bug.
 *
 * The admin per-section "Re-apply" handler now hits this endpoint instead of
 * the legacy `/api/profiles/kyc/save`. Two invariants matter:
 *
 *   1. `address` (a dual-table column) must be written to BOTH
 *      `client_profile_kyc` and `client_profiles`. The legacy endpoint only
 *      wrote to `client_profiles` — the next parent re-fetch returned the
 *      stale kyc copy and the patched values silently disappeared from the
 *      form on the next render. This was Vanessa's "doesn't persist" report.
 *
 *   2. The endpoint must return the post-update `kyc` and `profile` rows so
 *      the caller can reset `savedFields`/`draftFields` and splice into the
 *      parent's `roles` state — without a second fetch.
 */
describe("PATCH /api/admin/profiles/[id]/kyc-fields — Re-apply persistence", () => {
  it("dual-writes address into BOTH client_profile_kyc AND client_profiles", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    let kycUpdate: Record<string, unknown> | null = null;
    let profileUpdate: Record<string, unknown> | null = null;
    mockSupabase({
      client_profiles: {
        select: [
          {
            id: "profile-1",
            full_name: "Jane Doe",
            email: "jane@example.com",
            phone: null,
            address: null,
          },
        ],
        update: async (req: Request) => {
          profileUpdate = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [{ id: "profile-1" }];
        },
      },
      client_profile_kyc: {
        select: [
          {
            id: "kyc-1",
            client_profile_id: "profile-1",
            passport_number: null,
            address: null,
          },
        ],
        update: async (req: Request) => {
          kycUpdate = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [{ id: "kyc-1" }];
        },
      },
    });

    const res = await PATCH(
      makeRequest({
        kyc_fields: {
          // Re-applied from Identity section's source doc (passport).
          passport_number: "ABC123",
          passport_expiry: "2027-05-25",
          address: "16 Twin Oaks Rd, NJ",
        },
      }),
      { params: { id: "profile-1" } },
    );

    expect(res.status).toBe(200);
    // The address must hit BOTH tables — that's the bug fix.
    expect(kycUpdate).toMatchObject({ address: "16 Twin Oaks Rd, NJ" });
    expect(kycUpdate).toMatchObject({ passport_number: "ABC123" });
    expect(profileUpdate).toMatchObject({ address: "16 Twin Oaks Rd, NJ" });
    // Passport-only kyc fields must not leak into the profile branch.
    expect(profileUpdate).not.toHaveProperty("passport_number");
  });

  it("returns post-update kyc + profile rows so the caller can reset savedFields", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const updatedKyc = {
      id: "kyc-1",
      client_profile_id: "profile-1",
      passport_number: "ABC123",
      passport_expiry: "2027-05-25",
      address: "16 Twin Oaks Rd, NJ",
    };
    const updatedProfile = {
      id: "profile-1",
      full_name: "Jane Doe",
      email: "jane@example.com",
      phone: null,
      address: "16 Twin Oaks Rd, NJ",
    };
    let selectCount = 0;
    mockSupabase({
      client_profiles: {
        // First call is the pre-update lookup, second call returns the
        // post-update row.
        select: () => {
          selectCount += 1;
          return [
            selectCount === 1
              ? {
                  id: "profile-1",
                  full_name: "Jane Doe",
                  email: "jane@example.com",
                  phone: null,
                  address: null,
                }
              : updatedProfile,
          ];
        },
        update: [{ id: "profile-1" }],
      },
      client_profile_kyc: {
        select: () => {
          selectCount += 1;
          return [updatedKyc];
        },
        update: [{ id: "kyc-1" }],
      },
    });

    const res = await PATCH(
      makeRequest({
        kyc_fields: {
          passport_number: "ABC123",
          passport_expiry: "2027-05-25",
          address: "16 Twin Oaks Rd, NJ",
        },
      }),
      { params: { id: "profile-1" } },
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profile: typeof updatedProfile | null;
      kyc: typeof updatedKyc | null;
    };
    // These are exactly the shapes PersonCard.handleAfterReapply consumes
    // to reset savedFields/draftFields and splice into the parent's roles.
    expect(body.kyc).toMatchObject({
      passport_number: "ABC123",
      passport_expiry: "2027-05-25",
      address: "16 Twin Oaks Rd, NJ",
    });
    expect(body.profile).toMatchObject({
      full_name: "Jane Doe",
      address: "16 Twin Oaks Rd, NJ",
    });
  });
});
