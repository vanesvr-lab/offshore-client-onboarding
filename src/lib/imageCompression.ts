import imageCompression from "browser-image-compression";

/**
 * B-037 — best-effort browser-side image compression before upload.
 *
 * - Image inputs (`file.type` starts with `image/`) are compressed to a 2 MB
 *   target with a 2400 px max edge, JPEG output. The original format is
 *   replaced with JPEG to keep the compressor predictable.
 * - PDFs and other non-image types are returned untouched.
 * - Any failure (worker error, OOM, unsupported format) returns the original
 *   file — fail open. The 4.5 MB Vercel body guard at the call site is the
 *   safety net.
 */
export async function compressIfImage(file: File): Promise<File> {
  if (!file || !file.type.startsWith("image/")) return file;

  // Skip work when the file is already small. The compressor still rewrites
  // the bytes which is wasteful for already-tiny images.
  const ALREADY_SMALL = 500 * 1024; // 500 KB
  if (file.size <= ALREADY_SMALL) return file;

  try {
    const compressed = await imageCompression(file, {
      maxSizeMB: 2,
      maxWidthOrHeight: 2400,
      useWebWorker: true,
      fileType: "image/jpeg",
      initialQuality: 0.85,
    });

    // browser-image-compression returns a Blob in some paths; normalise to File
    // so the FormData call site keeps a usable filename.
    const compressedName = file.name.replace(/\.(png|webp|tiff?|gif|heic|heif)$/i, ".jpg");
    const out = compressed instanceof File
      ? compressed
      : new File([compressed], compressedName, { type: "image/jpeg" });

    // If compression somehow inflated the file, return the original.
    return out.size < file.size ? out : file;
  } catch {
    return file;
  }
}
