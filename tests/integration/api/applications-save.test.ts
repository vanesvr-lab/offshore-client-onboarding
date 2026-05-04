import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

import { auth } from "@/lib/auth";
import { POST } from "@/app/api/applications/save/route";

const clientSession = {
  user: { id: "user-1", role: "client", email: "client@example.com" },
};

const adminSession = {
  user: { id: "admin-1", role: "admin", email: "admin@example.com" },
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/applications/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
});

describe("POST /api/applications/save", () => {
  it("returns 401 when no session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(makeRequest({ templateId: "tpl-1" }));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("returns 403 when client user has no client_users row", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    mockSupabase({
      client_users: { select: [] },
    });

    const res = await POST(makeRequest({ templateId: "tpl-1" }));
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("No client account found");
  });

  it("creates a new application when no applicationId is provided", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    mockSupabase({
      client_users: { select: [{ client_id: "client-1" }] },
      service_templates: { select: [{ name: "Global Business Corporation" }] },
      applications: {
        // First call: select highest ref number (returns empty)
        // Second call: insert (returns new row). We use a function so the insert
        // can capture the request and respond accordingly.
        select: ({ url }: Request) => {
          if (url.includes("reference_number=like")) return [];
          return [];
        },
        insert: { id: "app-new", reference_number: "GBC-0001" },
      },
    });

    const res = await POST(makeRequest({ templateId: "tpl-1", proposed_business_activity: "Trading" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applicationId).toBe("app-new");
    expect(body.referenceNumber).toBe("GBC-0001");
  });

  it("updates an existing application when applicationId is provided", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    mockSupabase({
      client_users: { select: [{ client_id: "client-1" }] },
      applications: {
        // Ownership check returns the same client_id
        select: [{ client_id: "client-1" }],
        update: [{ id: "app-existing" }],
      },
    });

    const res = await POST(
      makeRequest({ applicationId: "app-existing", templateId: "tpl-1", proposed_business_activity: "Trading" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applicationId).toBe("app-existing");
  });

  it("returns 403 when the client tries to update another client's application", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    mockSupabase({
      client_users: { select: [{ client_id: "client-1" }] },
      applications: {
        // Owner is a different client
        select: [{ client_id: "client-other" }],
      },
    });

    const res = await POST(
      makeRequest({ applicationId: "app-other", templateId: "tpl-1" }),
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("admin can create on behalf of a client by passing clientId in body", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    mockSupabase({
      service_templates: { select: [{ name: "Authorised Company" }] },
      applications: {
        select: [],
        insert: { id: "app-admin-1", reference_number: "AC-0001" },
      },
    });

    const res = await POST(
      makeRequest({ templateId: "tpl-2", clientId: "client-target" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.applicationId).toBe("app-admin-1");
    expect(body.referenceNumber).toBe("AC-0001");
  });
});
