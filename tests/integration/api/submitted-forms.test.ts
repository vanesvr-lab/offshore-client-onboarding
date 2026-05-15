import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit/writeAuditLog", () => ({ writeAuditLog: vi.fn() }));

import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import {
  GET,
  POST,
} from "@/app/api/admin/services/[id]/submitted-forms/route";

const adminSession = {
  user: { id: "admin-1", role: "admin", email: "a@a", name: "Admin One" },
};
const clientSession = {
  user: { id: "client-1", role: "client", email: "c@c", name: "C C" },
};

function pdfFile(name = "submission.pdf"): File {
  return new File([new Uint8Array(100)], name, { type: "application/pdf" });
}

// See reference-forms.test.ts — undici's Request.formData() hangs when the
// Request is constructed from a FormData body; mock the method instead.
function makeUploadRequest(fields: Record<string, string | File>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return {
    formData: async () => fd,
    headers: new Headers(),
    method: "POST",
    url: "http://localhost/api/admin/services/svc-1/submitted-forms",
  } as unknown as Request;
}

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
  vi.mocked(writeAuditLog).mockReset();
});

describe("POST /api/admin/services/[id]/submitted-forms", () => {
  it("rejects non-admin sessions", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    const res = await POST(
      makeUploadRequest({
        file: pdfFile(),
        action_key: "fsc_checklist",
        reference_form_id: "ref-1",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(403);
  });

  it("404s when the service does not exist", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    mockSupabase({
      services: { select: [] },
      reference_forms: { select: [{ id: "ref-1", action_key: "fsc_checklist" }] },
    });
    const res = await POST(
      makeUploadRequest({
        file: pdfFile(),
        action_key: "fsc_checklist",
        reference_form_id: "ref-1",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(404);
  });

  it("400s when reference_form.action_key does not match the submission action_key", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    mockSupabase({
      services: { select: [{ id: "svc-1" }] },
      reference_forms: {
        select: [{ id: "ref-1", action_key: "bank_account_opening" }],
      },
    });
    const res = await POST(
      makeUploadRequest({
        file: pdfFile(),
        action_key: "fsc_checklist",
        reference_form_id: "ref-1",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(400);
  });

  it("uploads + records + audit-logs on the happy path", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    let inserted: Record<string, unknown> | null = null;
    mockSupabase({
      services: { select: [{ id: "svc-1" }] },
      reference_forms: {
        select: [{ id: "ref-1", action_key: "fsc_checklist" }],
      },
      submitted_forms: {
        insert: async (req: Request) => {
          inserted = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [
            {
              id: "sub-1",
              ...inserted,
              uploaded_at: new Date().toISOString(),
            },
          ];
        },
      },
    });

    const res = await POST(
      makeUploadRequest({
        file: pdfFile(),
        action_key: "fsc_checklist",
        reference_form_id: "ref-1",
        notes: "Filed at FSC on 12 May",
      }),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      submittedForm: { id: string; reference_form_id: string };
    };
    expect(body.submittedForm.id).toBe("sub-1");
    expect(inserted).toMatchObject({
      service_id: "svc-1",
      action_key: "fsc_checklist",
      reference_form_id: "ref-1",
      notes: "Filed at FSC on 12 May",
    });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "submitted_form_uploaded",
        entity_type: "submitted_form",
        entity_id: "sub-1",
      }),
    );
  });
});

describe("GET /api/admin/services/[id]/submitted-forms", () => {
  it("returns rows in most-recent-first order", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const newer = {
      id: "newer",
      service_id: "svc-1",
      action_key: "fsc_checklist",
      reference_form_id: "ref-1",
      file_name: "later.pdf",
      uploaded_at: "2026-05-12T10:00:00Z",
    };
    const older = {
      id: "older",
      service_id: "svc-1",
      action_key: "fsc_checklist",
      reference_form_id: "ref-1",
      file_name: "earlier.pdf",
      uploaded_at: "2025-12-01T08:00:00Z",
    };
    mockSupabase({
      submitted_forms: { select: [newer, older] },
    });

    const res = await GET(
      new Request(
        "http://localhost/api/admin/services/svc-1/submitted-forms?action_key=fsc_checklist",
      ),
      { params: { id: "svc-1" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      submittedForms: Array<{ id: string }>;
    };
    // The DB query orders by uploaded_at DESC; we mirror that here.
    expect(body.submittedForms.map((r) => r.id)).toEqual(["newer", "older"]);
  });
});
