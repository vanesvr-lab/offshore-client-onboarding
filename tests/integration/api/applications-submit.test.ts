import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { POST } from "@/app/api/applications/[id]/submit/route";

const clientSession = { user: { id: "user-1", role: "client" } };
const adminSession = { user: { id: "admin-1", role: "admin" } };

function makeRequest(): Request {
  return new Request("http://localhost/api/applications/app-1/submit", { method: "POST" });
}

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
});

describe("POST /api/applications/[id]/submit", () => {
  it("returns 401 when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(makeRequest(), { params: { id: "app-1" } });
    expect(res.status).toBe(401);
  });

  it("returns 404 when application not found", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    mockSupabase({
      applications: { select: [] },
    });
    const res = await POST(makeRequest(), { params: { id: "app-missing" } });
    expect(res.status).toBe(404);
  });

  it("returns 403 when caller is a client and does not own the application", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    mockSupabase({
      applications: { select: [{ client_id: "client-other", status: "draft" }] },
      client_users: { select: [{ client_id: "client-1" }] },
    });
    const res = await POST(makeRequest(), { params: { id: "app-1" } });
    expect(res.status).toBe(403);
  });

  it("submits successfully when client owns the application", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    let updatePayload: unknown = null;
    mockSupabase({
      applications: {
        select: [{ client_id: "client-1", status: "draft" }],
        update: async (req: Request) => {
          updatePayload = await req.clone().json().catch(() => null);
          return [{ id: "app-1" }];
        },
      },
      client_users: { select: [{ client_id: "client-1" }] },
      audit_log: { insert: [{ id: "log-1" }] },
    });
    const res = await POST(makeRequest(), { params: { id: "app-1" } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(updatePayload).toMatchObject({ status: "submitted" });
  });

  it("admin can submit any application without ownership check", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    mockSupabase({
      applications: {
        select: [{ client_id: "client-other", status: "draft" }],
        update: [{ id: "app-1" }],
      },
      audit_log: { insert: [{ id: "log-1" }] },
    });
    const res = await POST(makeRequest(), { params: { id: "app-1" } });
    expect(res.status).toBe(200);
  });
});
