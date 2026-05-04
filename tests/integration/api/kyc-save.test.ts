import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { POST } from "@/app/api/kyc/save/route";

const session = { user: { id: "user-1", role: "client" } };

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/kyc/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
});

describe("POST /api/kyc/save", () => {
  it("returns 401 when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(makeRequest({ kycRecordId: "rec-1", fields: {} }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when kycRecordId is missing", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    const res = await POST(makeRequest({ fields: {} }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/kycRecordId/);
  });

  it("returns 404 when the record does not exist", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    mockSupabase({
      kyc_records: { select: [] },
    });
    const res = await POST(makeRequest({ kycRecordId: "missing", fields: {} }));
    expect(res.status).toBe(404);
  });

  it("upserts fields and derives completion_status when individual fields are filled", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    let updatePayload: Record<string, unknown> | null = null;
    const fullIndividual = {
      full_name: "Jane",
      email: "j@example.com",
      date_of_birth: "1990-04-21",
      nationality: "MU",
      passport_number: "X1",
      passport_expiry: "2030-01-01",
      address: "1 Test St",
      occupation: "Eng",
      source_of_funds_description: "Salary",
      is_pep: false,
      legal_issues_declared: false,
    };
    mockSupabase({
      kyc_records: {
        select: [{ id: "rec-1", record_type: "individual", client_id: "client-1" }],
        update: async (req: Request) => {
          updatePayload = (await req.clone().json().catch(() => null)) as Record<string, unknown> | null;
          return [{ id: "rec-1", ...fullIndividual, completion_status: "complete" }];
        },
      },
      clients: { select: [{ due_diligence_level: "cdd" }] },
    });

    const res = await POST(makeRequest({ kycRecordId: "rec-1", fields: fullIndividual }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.record).toBeDefined();
    expect(updatePayload?.completion_status).toBe("complete");
  });

  it("converts empty-string dates and booleans to null before update", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    let updatePayload: Record<string, unknown> | null = null;
    mockSupabase({
      kyc_records: {
        select: [{ id: "rec-1", record_type: "individual", client_id: "client-1" }],
        update: async (req: Request) => {
          updatePayload = (await req.clone().json().catch(() => null)) as Record<string, unknown> | null;
          return [{ id: "rec-1" }];
        },
      },
      clients: { select: [{ due_diligence_level: "cdd" }] },
    });

    await POST(
      makeRequest({
        kycRecordId: "rec-1",
        fields: { date_of_birth: "", is_pep: "", full_name: "Jane" },
      }),
    );

    expect(updatePayload?.date_of_birth).toBeNull();
    expect(updatePayload?.is_pep).toBeNull();
    expect(updatePayload?.full_name).toBe("Jane");
  });
});
