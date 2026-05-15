import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit/writeAuditLog", () => ({ writeAuditLog: vi.fn() }));
vi.mock("@/lib/email/logCommunication", () => ({
  logCommunication: vi.fn(async () => ({ id: "comm-1", status: "sent" })),
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: vi.fn(async () => ({ data: { id: "resend-1" }, error: null })),
    };
  },
}));

import { auth } from "@/lib/auth";
import { POST } from "@/app/api/admin/services/[id]/review-requests/route";

const adminSession = {
  user: { id: "admin-1", role: "admin", email: "a@a", name: "Admin One" },
};

function makeRequest(body: unknown): Request {
  return new Request(
    "http://localhost/api/admin/services/svc-1/review-requests",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
});

describe("POST /api/admin/services/[id]/review-requests", () => {
  it("rejects unauthenticated callers", async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    const res = await POST(
      makeRequest({ reviewerIds: ["a"], sections: [], note: "x" }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(403);
  });

  it("rejects empty note", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const res = await POST(
      makeRequest({
        reviewerIds: ["admin-2"],
        sections: [{ section_key: "company_setup" }],
        note: "   ",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/note is required/i);
  });

  it("rejects empty reviewer list", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const res = await POST(
      makeRequest({
        reviewerIds: [],
        sections: [{ section_key: "company_setup" }],
        note: "Have a look",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/reviewer is required/i);
  });

  it("rejects requesting review from yourself", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const res = await POST(
      makeRequest({
        reviewerIds: ["admin-1"],
        sections: [{ section_key: "company_setup" }],
        note: "Have a look",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(400);
  });

  it("rejects unknown section_key", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const res = await POST(
      makeRequest({
        reviewerIds: ["admin-2"],
        sections: [{ section_key: "bogus_section" }],
        note: "x",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Invalid section/i);
  });

  it("rejects people_kyc_profile without profile_id", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const res = await POST(
      makeRequest({
        reviewerIds: ["admin-2"],
        sections: [{ section_key: "people_kyc_profile" }],
        note: "x",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(400);
  });

  it("rejects top-level section carrying profile_id", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const res = await POST(
      makeRequest({
        reviewerIds: ["admin-2"],
        sections: [{ section_key: "company_setup", profile_id: "p-1" }],
        note: "x",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(400);
  });

  it("creates the request + reviewers + sections on the happy path", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const reviewerInserts: unknown[] = [];
    const sectionInserts: unknown[] = [];
    let createdRequest: Record<string, unknown> | null = null;
    mockSupabase({
      services: {
        select: [
          { id: "svc-1", service_number: "SVC-001", tenant_id: "tenant-1" },
        ],
      },
      admin_users: {
        select: [{ user_id: "admin-2" }, { user_id: "admin-3" }],
      },
      client_profiles: {
        select: [{ id: "p-1", full_name: "Alex P", tenant_id: "tenant-1" }],
      },
      profiles: {
        select: [
          { id: "admin-1", full_name: "Admin One", email: "a1@x" },
          { id: "admin-2", full_name: "Admin Two", email: "a2@x" },
          { id: "admin-3", full_name: "Admin Three", email: "a3@x" },
        ],
      },
      review_requests: {
        insert: async (req: Request) => {
          createdRequest = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [
            {
              id: "rr-1",
              service_id: "svc-1",
              requester_id: "admin-1",
              note: "Please review",
              status: "open",
              closed_at: null,
              closed_by: null,
              closed_reason: null,
              created_at: new Date().toISOString(),
            },
          ];
        },
      },
      review_request_reviewers: {
        select: [
          { request_id: "rr-1", admin_id: "admin-2" },
          { request_id: "rr-1", admin_id: "admin-3" },
        ],
        insert: async (req: Request) => {
          const body = (await req.clone().json().catch(() => null)) as
            | unknown[]
            | null;
          if (Array.isArray(body)) reviewerInserts.push(...body);
          return body ?? [];
        },
      },
      review_request_sections: {
        select: [
          {
            id: "s-1",
            request_id: "rr-1",
            section_key: "company_setup",
            profile_id: null,
          },
          {
            id: "s-2",
            request_id: "rr-1",
            section_key: "people_kyc_profile",
            profile_id: "p-1",
          },
        ],
        insert: async (req: Request) => {
          const body = (await req.clone().json().catch(() => null)) as
            | unknown[]
            | null;
          if (Array.isArray(body)) sectionInserts.push(...body);
          return body ?? [];
        },
      },
    });

    const res = await POST(
      makeRequest({
        reviewerIds: ["admin-2", "admin-3"],
        sections: [
          { section_key: "company_setup" },
          { section_key: "people_kyc_profile", profile_id: "p-1" },
        ],
        note: "Please review the company setup and Alex's KYC.",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      request: {
        id: string;
        status: string;
        reviewers: Array<{ admin_id: string }>;
        sections: Array<{ section_key: string }>;
      };
    };
    expect(body.request.id).toBe("rr-1");
    expect(body.request.status).toBe("open");
    expect(body.request.reviewers.map((r) => r.admin_id).sort()).toEqual([
      "admin-2",
      "admin-3",
    ]);
    expect(body.request.sections.map((s) => s.section_key).sort()).toEqual([
      "company_setup",
      "people_kyc_profile",
    ]);
    expect(reviewerInserts).toHaveLength(2);
    expect(sectionInserts).toHaveLength(2);
    expect(createdRequest).toMatchObject({
      service_id: "svc-1",
      requester_id: "admin-1",
      note: "Please review the company setup and Alex's KYC.",
    });
  });
});
