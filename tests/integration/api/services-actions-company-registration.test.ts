import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit/writeAuditLog", () => ({ writeAuditLog: vi.fn() }));

import { auth } from "@/lib/auth";
import { PATCH } from "@/app/api/admin/services/[id]/actions/route";

const adminSession = {
  user: { id: "admin-1", role: "admin", email: "a@a", name: "Admin One" },
};

function makeRequest(body: unknown): Request {
  return new Request(
    "http://localhost/api/admin/services/svc-1/actions",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
}

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
});

/**
 * B-119 — Company Registration subsection persists registration_date,
 * registration_number, registry_country, and notes via the existing
 * actions PATCH route. The columns were added in
 * 20260515050536_actions_section_company_registration.sql; the route
 * must thread them through both update and insert paths.
 */
describe("PATCH /api/admin/services/[id]/actions — company_registration body", () => {
  it("persists all four fields on update when the row already exists", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    let updatePayload: Record<string, unknown> | null = null;
    mockSupabase({
      service_actions: {
        select: [
          {
            id: "act-1",
            service_id: "svc-1",
            action_key: "company_registration",
            status: "pending",
            registration_date: null,
            registration_number: null,
            registry_country: null,
            notes: null,
          },
        ],
        update: async (req: Request) => {
          updatePayload = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [
            {
              id: "act-1",
              service_id: "svc-1",
              action_key: "company_registration",
              status: "pending",
              registration_date: "2026-05-15",
              registration_number: "C12345",
              registry_country: "MUS",
              notes: "Filed via local agent",
            },
          ];
        },
      },
    });

    const res = await PATCH(
      makeRequest({
        action_key: "company_registration",
        registration_date: "2026-05-15",
        registration_number: "C12345",
        registry_country: "MUS",
        notes: "Filed via local agent",
      }),
      { params: Promise.resolve({ id: "svc-1" }) },
    );
    expect(res.status).toBe(200);
    expect(updatePayload).toMatchObject({
      registration_date: "2026-05-15",
      registration_number: "C12345",
      registry_country: "MUS",
      notes: "Filed via local agent",
    });
  });

  it("coerces empty registration_date string to null", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    let updatePayload: Record<string, unknown> | null = null;
    mockSupabase({
      service_actions: {
        select: [
          {
            id: "act-1",
            service_id: "svc-1",
            action_key: "company_registration",
            status: "pending",
          },
        ],
        update: async (req: Request) => {
          updatePayload = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [{ id: "act-1" }];
        },
      },
    });

    const res = await PATCH(
      makeRequest({
        action_key: "company_registration",
        registration_date: "",
      }),
      { params: Promise.resolve({ id: "svc-1" }) },
    );
    expect(res.status).toBe(200);
    expect(updatePayload).toMatchObject({ registration_date: null });
  });

  it("threads new fields through the insert path when the row didn't exist yet", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    let insertPayload: Record<string, unknown> | null = null;
    mockSupabase({
      service_actions: {
        select: [], // forces the insert branch
        insert: async (req: Request) => {
          insertPayload = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [
            {
              id: "act-1",
              service_id: "svc-1",
              action_key: "company_registration",
              status: "pending",
              registration_date: "2026-05-15",
              registration_number: "C99999",
              registry_country: "MUS",
            },
          ];
        },
      },
    });

    const res = await PATCH(
      makeRequest({
        action_key: "company_registration",
        registration_date: "2026-05-15",
        registration_number: "C99999",
        registry_country: "MUS",
      }),
      { params: Promise.resolve({ id: "svc-1" }) },
    );
    expect(res.status).toBe(200);
    expect(insertPayload).toMatchObject({
      action_key: "company_registration",
      registration_date: "2026-05-15",
      registration_number: "C99999",
      registry_country: "MUS",
    });
  });

  it("does not leak registration_* fields onto unrelated actions when omitted", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    let updatePayload: Record<string, unknown> | null = null;
    mockSupabase({
      service_actions: {
        select: [
          {
            id: "act-2",
            service_id: "svc-1",
            action_key: "substance_review",
            status: "pending",
          },
        ],
        update: async (req: Request) => {
          updatePayload = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [{ id: "act-2" }];
        },
      },
    });

    const res = await PATCH(
      makeRequest({
        action_key: "substance_review",
        status: "in_progress",
      }),
      { params: Promise.resolve({ id: "svc-1" }) },
    );
    expect(res.status).toBe(200);
    expect(updatePayload).toMatchObject({ status: "in_progress" });
    expect(updatePayload).not.toHaveProperty("registration_date");
    expect(updatePayload).not.toHaveProperty("registration_number");
    expect(updatePayload).not.toHaveProperty("registry_country");
  });
});
