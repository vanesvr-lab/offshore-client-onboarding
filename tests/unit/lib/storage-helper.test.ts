import { describe, it, expect, vi } from "vitest";
import {
  sanitizeFilename,
  referenceFormPath,
  submittedFormPath,
  createDocumentsSignedUrl,
  DOCUMENTS_BUCKET,
} from "@/lib/supabase/storage";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("storage-helper — sanitizeFilename", () => {
  it("strips spaces and unsafe chars but keeps the extension", () => {
    expect(sanitizeFilename("FSC Form A v1.pdf")).toBe("FSC_Form_A_v1.pdf");
  });

  it("collapses repeated underscores and trims edges", () => {
    expect(sanitizeFilename("__weird   name___.pdf")).toBe("weird_name_.pdf");
  });

  it("returns 'file' when the input has no safe chars", () => {
    expect(sanitizeFilename("@@@/")).toBe("file");
  });

  it("caps the result at 120 characters", () => {
    const long = "a".repeat(300) + ".pdf";
    expect(sanitizeFilename(long).length).toBe(120);
  });
});

describe("storage-helper — path builders", () => {
  it("builds reference-form paths under reference-forms/<id>/", () => {
    expect(referenceFormPath("ref-123", "FSC Form A.pdf")).toBe(
      "reference-forms/ref-123/FSC_Form_A.pdf",
    );
  });

  it("builds submitted-form paths under submitted-forms/<service>/<action>/<ref>/", () => {
    const path = submittedFormPath(
      "svc-1",
      "fsc_checklist",
      "ref-9",
      "filed copy.pdf",
    );
    // Path shape: submitted-forms/svc-1/fsc_checklist/ref-9/<ISO-ish ts>_filed_copy.pdf
    expect(path.startsWith("submitted-forms/svc-1/fsc_checklist/ref-9/")).toBe(true);
    expect(path.endsWith("_filed_copy.pdf")).toBe(true);
    // Timestamp section: no `:` or `.` (they're stripped to `-`).
    const tail = path.slice("submitted-forms/svc-1/fsc_checklist/ref-9/".length);
    const stamp = tail.split("_filed_copy.pdf")[0];
    expect(stamp).not.toMatch(/[:.]/);
  });
});

describe("storage-helper — createDocumentsSignedUrl", () => {
  it("returns the signed URL when the client succeeds", async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://signed.example/foo" },
      error: null,
    }));
    const supabase = {
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    } as unknown as SupabaseClient;

    const url = await createDocumentsSignedUrl(supabase, "reference-forms/a/b.pdf");
    expect(url).toBe("https://signed.example/foo");
    expect(supabase.storage.from).toHaveBeenCalledWith(DOCUMENTS_BUCKET);
    expect(createSignedUrl).toHaveBeenCalledWith("reference-forms/a/b.pdf", 300);
  });

  it("returns null when the client errors", async () => {
    const supabase = {
      storage: {
        from: vi.fn(() => ({
          createSignedUrl: vi.fn(async () => ({
            data: null,
            error: { message: "no such file" },
          })),
        })),
      },
    } as unknown as SupabaseClient;

    const url = await createDocumentsSignedUrl(supabase, "reference-forms/a/b.pdf");
    expect(url).toBeNull();
  });

  it("honours a custom TTL", async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "u" },
      error: null,
    }));
    const supabase = {
      storage: { from: vi.fn(() => ({ createSignedUrl })) },
    } as unknown as SupabaseClient;

    await createDocumentsSignedUrl(supabase, "submitted-forms/a/b/c/file.pdf", 60);
    expect(createSignedUrl).toHaveBeenCalledWith(
      "submitted-forms/a/b/c/file.pdf",
      60,
    );
  });
});
