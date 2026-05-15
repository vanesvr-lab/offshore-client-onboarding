// B-120 — small helpers around the private `documents` Supabase Storage
// bucket. Centralises path construction + signed-URL minting so reference
// forms / submitted forms / future similar features don't each inline
// `supabase.storage.from("documents").createSignedUrl(...)`.

import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "documents";
const DEFAULT_TTL_SECONDS = 5 * 60; // 5 minutes — covers Download blank / View submitted

/**
 * Sanitize a filename for use inside a storage key. Supabase Storage rejects
 * keys containing spaces or several special chars; we normalize, strip
 * unsafe chars, and trim to a reasonable length.
 */
export function sanitizeFilename(name: string): string {
  return (
    name
      .normalize("NFKD")
      .replace(/[^\w.\-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 120) || "file"
  );
}

export function referenceFormPath(referenceFormId: string, filename: string): string {
  return `reference-forms/${referenceFormId}/${sanitizeFilename(filename)}`;
}

export function submittedFormPath(
  serviceId: string,
  actionKey: string,
  referenceFormId: string,
  filename: string,
): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  return `submitted-forms/${serviceId}/${actionKey}/${referenceFormId}/${ts}_${sanitizeFilename(filename)}`;
}

/**
 * Mint a short-lived signed URL for a file in the `documents` bucket.
 * Returns `null` if the file does not exist or the call fails.
 */
export async function createDocumentsSignedUrl(
  supabase: SupabaseClient,
  filePath: string,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(filePath, ttlSeconds);
  if (error || !data?.signedUrl) {
    return null;
  }
  return data.signedUrl;
}

export const DOCUMENTS_BUCKET = BUCKET;
