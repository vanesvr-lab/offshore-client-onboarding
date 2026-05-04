import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { POST } from "@/app/api/kyc/submit/route";

const session = { user: { id: "user-1", role: "client" } };

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/kyc/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
});

describe("POST /api/kyc/submit", () => {
  it("returns 401 when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(makeRequest({ clientId: "c-1" }));
    expect(res.status).toBe(401);
  });

  it("returns 400 when clientId is missing", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    const res = await POST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when client does not exist", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    mockSupabase({
      clients: { select: [] },
      kyc_records: { select: [] },
      documents: { select: [] },
      due_diligence_requirements: { select: [] },
      due_diligence_settings: { select: [] },
    });
    const res = await POST(makeRequest({ clientId: "c-missing" }));
    expect(res.status).toBe(404);
  });

  it("returns 422 when a record is incomplete", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    mockSupabase({
      clients: { select: [{ id: "c-1", client_type: "individual", due_diligence_level: "cdd" }] },
      kyc_records: {
        select: [{ id: "rec-1", record_type: "individual", full_name: "Jane" /* others missing */ }],
      },
      documents: { select: [] },
      due_diligence_requirements: { select: [] },
      due_diligence_settings: { select: [] },
    });
    const res = await POST(makeRequest({ clientId: "c-1" }));
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("Incomplete KYC");
    expect(Array.isArray(body.errors)).toBe(true);
    expect(body.errors[0]).toMatch(/missing/);
  });

  it("submits successfully when all records are complete", async () => {
    vi.mocked(auth).mockResolvedValue(session as never);
    const fullIndividualRecord = {
      id: "rec-1",
      record_type: "individual",
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
      clients: { select: [{ id: "c-1", client_type: "individual", due_diligence_level: "cdd" }] },
      kyc_records: {
        select: [fullIndividualRecord],
        update: [fullIndividualRecord],
      },
      documents: { select: [] },
      due_diligence_requirements: { select: [] },
      due_diligence_settings: { select: [] },
    });
    const res = await POST(makeRequest({ clientId: "c-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
