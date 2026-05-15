import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/audit/writeAuditLog", () => ({ writeAuditLog: vi.fn() }));

import { auth } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import { POST, GET } from "@/app/api/admin/reference-forms/route";
import { POST as DEACTIVATE } from "@/app/api/admin/reference-forms/[id]/deactivate/route";
import { POST as REACTIVATE } from "@/app/api/admin/reference-forms/[id]/reactivate/route";

const adminSession = {
  user: { id: "admin-1", role: "admin", email: "a@a", name: "Admin One" },
};
const clientSession = {
  user: { id: "client-1", role: "client", email: "c@c", name: "C C" },
};

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
  vi.mocked(writeAuditLog).mockReset();
});

// vitest's node environment proxies global Request/Response from undici,
// but `request.formData()` on a Request constructed from a FormData body
// hangs indefinitely. Mock .formData() directly — handlers await it the
// same way regardless of source. Mirrors the documents-upload test.
function makeUploadRequest(fields: Record<string, string | File>): Request {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  return {
    formData: async () => fd,
    headers: new Headers(),
    method: "POST",
    url: "http://localhost/api/admin/reference-forms",
  } as unknown as Request;
}

function pdfFile(name = "form.pdf"): File {
  return new File([new Uint8Array(100)], name, { type: "application/pdf" });
}

describe("POST /api/admin/reference-forms — create", () => {
  it("rejects non-admin sessions", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    const res = await POST(
      makeUploadRequest({
        file: pdfFile(),
        name: "FSC Form A",
        service_template_id: "tmpl-1",
        action_key: "fsc_checklist",
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects missing required fields", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const res = await POST(
      makeUploadRequest({
        file: pdfFile(),
        // name missing
        service_template_id: "tmpl-1",
        action_key: "fsc_checklist",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("rejects an invalid source_url", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const res = await POST(
      makeUploadRequest({
        file: pdfFile(),
        name: "FSC Form A",
        service_template_id: "tmpl-1",
        action_key: "fsc_checklist",
        source_url: "not-a-url",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("creates the row, uploads to storage, and writes the audit log on the happy path", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    let inserted: Record<string, unknown> | null = null;
    let updated: Record<string, unknown> | null = null;
    mockSupabase({
      reference_forms: {
        select: [],
        insert: async (req: Request) => {
          inserted = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [{ id: "new-form-1", ...inserted, sort_order: 0 }];
        },
        update: async (req: Request) => {
          updated = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [{ id: "new-form-1", file_path: (updated?.file_path as string) ?? "" }];
        },
      },
    });

    const res = await POST(
      makeUploadRequest({
        file: pdfFile(),
        name: "FSC Form A",
        service_template_id: "tmpl-1",
        action_key: "fsc_checklist",
        version_label: "v2025-01",
        source_url: "https://www.fscmauritius.org/forms/a",
      }),
    );

    expect(res.status).toBe(200);
    const body = (await res.json()) as { referenceForm: { id: string; file_path: string } };
    expect(body.referenceForm.id).toBe("new-form-1");
    expect(body.referenceForm.file_path).toMatch(/reference-forms\//);
    expect(inserted).toMatchObject({
      name: "FSC Form A",
      service_template_id: "tmpl-1",
      action_key: "fsc_checklist",
      version_label: "v2025-01",
      source_url: "https://www.fscmauritius.org/forms/a",
      status: "active",
    });

    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "reference_form_created",
        entity_type: "reference_form",
        entity_id: "new-form-1",
      }),
    );
  });

  it("handles the Replace flow: deactivates the previous row and links replaced_by_id", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    const previousRow = {
      id: "prev-1",
      service_template_id: "tmpl-1",
      action_key: "fsc_checklist",
      status: "active",
      sort_order: 2,
    };
    const updatedPayloads: Record<string, unknown>[] = [];
    let insertedFinal: Record<string, unknown> | null = null;
    mockSupabase({
      reference_forms: {
        // First .select() resolves the existing row (Replace look-up).
        // Subsequent inserts return the new row id.
        select: [previousRow],
        insert: async (req: Request) => {
          insertedFinal = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [{ id: "new-2", ...insertedFinal, sort_order: 2 }];
        },
        update: async (req: Request) => {
          const body = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          if (body) updatedPayloads.push(body);
          return [{ id: "new-2", file_path: "reference-forms/new-2/foo.pdf" }];
        },
      },
    });

    const res = await POST(
      makeUploadRequest({
        file: pdfFile(),
        name: "FSC Form A",
        service_template_id: "tmpl-1",
        action_key: "fsc_checklist",
        version_label: "v2026-01",
        replace_for_form_id: "prev-1",
      }),
    );

    expect(res.status).toBe(200);
    // Two updates fire: finalise the new row's file_path + deactivate the previous row.
    const deactivation = updatedPayloads.find(
      (p) => p.status === "deactivated",
    );
    expect(deactivation).toMatchObject({
      status: "deactivated",
      deactivated_reason: "replaced_by_newer_version",
      replaced_by_id: "new-2",
    });

    // Audit-log writes for both the replace event AND the create event.
    const actions = vi
      .mocked(writeAuditLog)
      .mock.calls.map((c) => (c[1] as { action: string }).action);
    expect(actions).toContain("reference_form_created");
    expect(actions).toContain("reference_form_replaced");
  });
});

describe("GET /api/admin/reference-forms", () => {
  it("rejects non-admin sessions", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    const res = await GET(
      new Request("http://localhost/api/admin/reference-forms"),
    );
    expect(res.status).toBe(403);
  });

  it("returns the rows the DB sends back", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    mockSupabase({
      reference_forms: {
        select: [
          { id: "a", name: "FSC A", status: "active" },
          { id: "b", name: "FSC B", status: "active" },
        ],
      },
    });
    const res = await GET(
      new Request(
        "http://localhost/api/admin/reference-forms?service_template_id=tmpl-1&action_key=fsc_checklist",
      ),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      referenceForms: Array<{ id: string }>;
    };
    expect(body.referenceForms.map((r) => r.id)).toEqual(["a", "b"]);
  });
});

describe("POST /api/admin/reference-forms/[id]/deactivate", () => {
  it("deactivates an active form and writes an audit-log row", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    let updated: Record<string, unknown> | null = null;
    mockSupabase({
      reference_forms: {
        select: [{ id: "f-1", status: "active", deactivated_reason: null }],
        update: async (req: Request) => {
          updated = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [{ id: "f-1", ...updated }];
        },
      },
    });

    const res = await DEACTIVATE(
      new Request("http://localhost/api/admin/reference-forms/f-1/deactivate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: "Regulator removed Form A" }),
      }),
      { params: { id: "f-1" } },
    );
    expect(res.status).toBe(200);
    expect(updated).toMatchObject({
      status: "deactivated",
      deactivated_reason: "no_longer_required",
      deactivated_note: "Regulator removed Form A",
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "reference_form_deactivated",
        entity_id: "f-1",
      }),
    );
  });

  it("is idempotent for already-deactivated forms — no audit-log row", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    mockSupabase({
      reference_forms: {
        select: [{ id: "f-1", status: "deactivated" }],
      },
    });

    const res = await DEACTIVATE(
      new Request("http://localhost/api/admin/reference-forms/f-1/deactivate", {
        method: "POST",
        body: "{}",
      }),
      { params: { id: "f-1" } },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { alreadyDeactivated?: boolean };
    expect(body.alreadyDeactivated).toBe(true);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/reference-forms/[id]/reactivate", () => {
  it("refuses to reactivate a superseded row (409)", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    mockSupabase({
      reference_forms: {
        select: [
          {
            id: "f-1",
            status: "deactivated",
            replaced_by_id: "f-2",
            deactivated_reason: "replaced_by_newer_version",
          },
        ],
      },
    });
    const res = await REACTIVATE(
      new Request("http://localhost/api/admin/reference-forms/f-1/reactivate", {
        method: "POST",
      }),
      { params: { id: "f-1" } },
    );
    expect(res.status).toBe(409);
    expect(writeAuditLog).not.toHaveBeenCalled();
  });

  it("reactivates a no-longer-required form and writes an audit-log row", async () => {
    vi.mocked(auth).mockResolvedValue(adminSession as never);
    let updated: Record<string, unknown> | null = null;
    mockSupabase({
      reference_forms: {
        select: [
          {
            id: "f-1",
            status: "deactivated",
            replaced_by_id: null,
            deactivated_reason: "no_longer_required",
          },
        ],
        update: async (req: Request) => {
          updated = (await req.clone().json().catch(() => null)) as
            | Record<string, unknown>
            | null;
          return [{ id: "f-1", ...updated }];
        },
      },
    });
    const res = await REACTIVATE(
      new Request("http://localhost/api/admin/reference-forms/f-1/reactivate", {
        method: "POST",
      }),
      { params: { id: "f-1" } },
    );
    expect(res.status).toBe(200);
    expect(updated).toMatchObject({
      status: "active",
      deactivated_reason: null,
      deactivated_at: null,
      deactivated_note: null,
    });
    expect(writeAuditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: "reference_form_reactivated",
        entity_id: "f-1",
      }),
    );
  });
});
