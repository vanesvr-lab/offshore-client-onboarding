import { describe, it, expect, beforeEach, vi } from "vitest";
import { mockSupabase, resetSupabaseMocks } from "../../msw/handlers/supabase";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

import { auth } from "@/lib/auth";
import { POST } from "@/app/api/documents/upload/route";

const clientSession = { user: { id: "user-1", role: "client" } };

/**
 * vitest's node environment proxies the global Request/Response from undici,
 * but `request.formData()` on a Request constructed from a `FormData` body
 * hangs indefinitely. To exercise the route handler we mock the .formData()
 * method directly — the handler awaits it the same way regardless of source.
 */
function makeRequest(formData: FormData): Request {
  return {
    formData: async () => formData,
    headers: new Headers(),
    method: "POST",
    url: "http://localhost/api/documents/upload",
  } as unknown as Request;
}

function buildFormData(opts: {
  file?: File | null;
  applicationId?: string;
  requirementId?: string;
}): FormData {
  const fd = new FormData();
  if (opts.file !== null && opts.file !== undefined) fd.set("file", opts.file);
  if (opts.applicationId !== undefined) fd.set("applicationId", opts.applicationId);
  if (opts.requirementId !== undefined) fd.set("requirementId", opts.requirementId);
  return fd;
}

function pdf(name = "test.pdf", sizeBytes = 100): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: "application/pdf" });
}

beforeEach(() => {
  resetSupabaseMocks();
  vi.mocked(auth).mockReset();
});

describe("POST /api/documents/upload", () => {
  it("returns 401 without a session", async () => {
    vi.mocked(auth).mockResolvedValue(null);
    const res = await POST(makeRequest(buildFormData({ file: pdf(), applicationId: "app-1", requirementId: "req-1" })));
    expect(res.status).toBe(401);
  });

  it("returns 400 when file is missing", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    const res = await POST(makeRequest(buildFormData({ applicationId: "app-1", requirementId: "req-1" })));
    expect(res.status).toBe(400);
  });

  it("returns 400 when MIME type is not allowed", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    const file = new File([new Uint8Array(100)], "evil.exe", { type: "application/x-msdownload" });
    const res = await POST(makeRequest(buildFormData({ file, applicationId: "app-1", requirementId: "req-1" })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/type/i);
  });

  it("returns 400 when file exceeds the 10MB size limit", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    const file = pdf("big.pdf", 11 * 1024 * 1024);
    const res = await POST(makeRequest(buildFormData({ file, applicationId: "app-1", requirementId: "req-1" })));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/10MB/);
  });

  it("returns 403 when client does not own the application", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    mockSupabase({
      client_users: { select: [{ client_id: "client-1" }] },
      applications: { select: [{ client_id: "client-other" }] },
    });
    const res = await POST(makeRequest(buildFormData({ file: pdf(), applicationId: "app-1", requirementId: "req-1" })));
    expect(res.status).toBe(403);
  });

  it("uploads, inserts a new document_uploads row, and returns uploadId + filePath", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    mockSupabase({
      client_users: { select: [{ client_id: "client-1" }] },
      applications: { select: [{ client_id: "client-1" }] },
      document_uploads: {
        select: [], // no existing row → insert path
        insert: [{ id: "upload-1", file_path: "applications/app-1/req-1/test.pdf" }],
      },
    });
    const res = await POST(makeRequest(buildFormData({ file: pdf(), applicationId: "app-1", requirementId: "req-1" })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uploadId).toBe("upload-1");
    expect(body.filePath).toMatch(/^applications\/app-1\/req-1\//);
  });

  it("updates the existing row when an upload for the same requirement already exists", async () => {
    vi.mocked(auth).mockResolvedValue(clientSession as never);
    let updatePayload: Record<string, unknown> | null = null;
    mockSupabase({
      client_users: { select: [{ client_id: "client-1" }] },
      applications: { select: [{ client_id: "client-1" }] },
      document_uploads: {
        select: [{ id: "upload-existing" }],
        update: async (req: Request) => {
          updatePayload = (await req.clone().json().catch(() => null)) as Record<string, unknown> | null;
          return [{ id: "upload-existing", file_path: "applications/app-1/req-1/new.pdf" }];
        },
      },
    });
    const res = await POST(makeRequest(buildFormData({ file: pdf(), applicationId: "app-1", requirementId: "req-1" })));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.uploadId).toBe("upload-existing");
    expect(updatePayload?.verification_status).toBe("pending");
  });
});
