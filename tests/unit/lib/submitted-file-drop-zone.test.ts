import { describe, it, expect } from "vitest";
import { isAllowedSubmittedFile } from "@/lib/services/submittedFileValidation";

// B-122 — client-side validation for the drop-zone. The server route
// re-checks, so this exists to fail fast in the UI on obviously wrong
// drops (e.g. someone drags a .exe). Allowed: PDF, DOC, DOCX, JPEG, PNG.

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array(1)], name, { type });
}

describe("SubmittedFileDropZone — isAllowedSubmittedFile", () => {
  it("accepts standard PDF MIME", () => {
    expect(isAllowedSubmittedFile(makeFile("a.pdf", "application/pdf"))).toBe(true);
  });

  it("accepts JPEG + PNG MIMEs", () => {
    expect(isAllowedSubmittedFile(makeFile("a.jpg", "image/jpeg"))).toBe(true);
    expect(isAllowedSubmittedFile(makeFile("a.png", "image/png"))).toBe(true);
  });

  it("accepts DOCX (long MIME)", () => {
    expect(
      isAllowedSubmittedFile(
        makeFile(
          "a.docx",
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        ),
      ),
    ).toBe(true);
  });

  it("accepts files where the browser reports octet-stream but the extension is valid (.doc / .docx)", () => {
    expect(
      isAllowedSubmittedFile(
        makeFile("contract.doc", "application/octet-stream"),
      ),
    ).toBe(true);
    expect(
      isAllowedSubmittedFile(
        makeFile("contract.docx", "application/octet-stream"),
      ),
    ).toBe(true);
  });

  it("rejects obvious bad MIMEs even when extension looks safe", () => {
    expect(
      isAllowedSubmittedFile(makeFile("payload.pdf.exe", "application/x-msdownload")),
    ).toBe(false);
  });

  it("rejects .exe / .sh / unknown extensions", () => {
    expect(
      isAllowedSubmittedFile(makeFile("evil.exe", "application/x-msdownload")),
    ).toBe(false);
    expect(
      isAllowedSubmittedFile(makeFile("evil.sh", "text/x-shellscript")),
    ).toBe(false);
    expect(
      isAllowedSubmittedFile(makeFile("notes.txt", "text/plain")),
    ).toBe(false);
  });

  it("is case-insensitive on the extension fallback path", () => {
    expect(
      isAllowedSubmittedFile(makeFile("Report.PDF", "application/octet-stream")),
    ).toBe(true);
  });
});
