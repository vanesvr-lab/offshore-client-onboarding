import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { POST } from "@/app/api/kyc/verify-code/route";

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/kyc/verify-code", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetSupabaseMocks();
});

describe("POST /api/kyc/verify-code", () => {
  it("returns 400 when token is missing", async () => {
    const res = await POST(makeRequest({ code: "123456" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when code is missing", async () => {
    const res = await POST(makeRequest({ token: "abc" }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when verification_codes lookup yields no row", async () => {
    mockSupabase({
      verification_codes: { select: [] },
    });
    const res = await POST(makeRequest({ token: "missing", code: "123456" }));
    expect(res.status).toBe(404);
  });

  it("returns 410 when the link has expired", async () => {
    mockSupabase({
      verification_codes: {
        select: [
          {
            id: "v-1",
            access_token: "tok",
            kyc_record_id: "rec-1",
            code: "123456",
            attempts: 0,
            verified_at: null,
            expires_at: new Date(Date.now() - 60_000).toISOString(),
          },
        ],
      },
    });
    const res = await POST(makeRequest({ token: "tok", code: "123456" }));
    expect(res.status).toBe(410);
  });

  it("returns 401 with 'attempts remaining' on a wrong code", async () => {
    mockSupabase({
      verification_codes: {
        select: [
          {
            id: "v-1",
            access_token: "tok",
            kyc_record_id: "rec-1",
            code: "123456",
            attempts: 0,
            verified_at: null,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
        update: [{}],
      },
    });
    const res = await POST(makeRequest({ token: "tok", code: "000000" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toMatch(/Incorrect code/);
    expect(body.error).toMatch(/remaining/);
  });

  it("returns 429 after 5 failed attempts", async () => {
    mockSupabase({
      verification_codes: {
        select: [
          {
            id: "v-1",
            access_token: "tok",
            kyc_record_id: "rec-1",
            code: "123456",
            attempts: 5,
            verified_at: null,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
      },
    });
    const res = await POST(makeRequest({ token: "tok", code: "000000" }));
    expect(res.status).toBe(429);
  });

  it("returns 200 with verified:true and the KYC record on the correct code", async () => {
    mockSupabase({
      verification_codes: {
        select: [
          {
            id: "v-1",
            access_token: "tok",
            kyc_record_id: "rec-1",
            code: "123456",
            attempts: 0,
            verified_at: null,
            expires_at: new Date(Date.now() + 60_000).toISOString(),
          },
        ],
        update: [{}],
      },
      kyc_records: {
        select: [{ id: "rec-1", client_id: "c-1", full_name: "Jane", profile_roles: [] }],
      },
      clients: {
        select: [{ id: "c-1", company_name: "Acme", due_diligence_level: "cdd" }],
      },
      documents: { select: [] },
      role_document_requirements: { select: [] },
      due_diligence_requirements: { select: [] },
    });

    const res = await POST(makeRequest({ token: "tok", code: "123456" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.verified).toBe(true);
    expect(body.kycRecord).toMatchObject({ id: "rec-1" });
  });
});
