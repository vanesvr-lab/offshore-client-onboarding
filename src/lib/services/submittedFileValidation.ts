// B-122 — small client-side validator for the SubmittedFileDropZone. The
// server route (`POST /api/admin/services/[id]/submitted-forms`) is the
// authority and re-checks size + MIME; this exists to fail fast in the
// UI on obviously wrong drops (e.g. .exe) and to keep the drop-zone
// component free of pure logic that we want to unit-test from a .ts
// source (vitest's tsconfig doesn't transform JSX, so imports from
// .tsx are blocked at the test layer).

const ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".png", ".jpg", ".jpeg"];
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
]);

export function isAllowedSubmittedFile(file: File): boolean {
  if (ALLOWED_MIME_TYPES.has(file.type)) return true;
  // Some browsers report `application/octet-stream` for .doc/.docx —
  // fall back to the extension check so legit files still upload.
  const name = file.name.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export const SUBMITTED_FILE_ACCEPT_ATTR =
  ".pdf,.doc,.docx,image/jpeg,image/png";
