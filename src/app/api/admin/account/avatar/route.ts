// B-101 Batch 4 — admin account: avatar upload + remove.
//
// POST   → multipart form upload (image/png, jpeg, webp; max 2 MB). Stores
//          at `${user_id}/${randomId}.${ext}` in the public `avatars`
//          bucket. Updates `users.avatar_url` to the public URL. Returns
//          { avatar_url }.
// DELETE → clears `users.avatar_url` and best-effort removes the
//          underlying storage object.
//
// Auth: must be in `admin_users`.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB

const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function extractStoragePathFromUrl(url: string): string | null {
  // Public URL shape:
  // {SUPABASE_URL}/storage/v1/object/public/avatars/{user_id}/{file}
  const marker = "/storage/v1/object/public/avatars/";
  const idx = url.indexOf(marker);
  if (idx < 0) return null;
  return url.slice(idx + marker.length);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "multipart/form-data expected" }, { status: 400 });
  }
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "file is required" }, { status: 400 });
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Use PNG, JPEG, or WebP." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 2 MB limit" }, { status: 400 });
  }

  // Remove any previous avatar so the bucket doesn't accumulate orphans.
  const { data: prev } = await supabase
    .from("users")
    .select("avatar_url")
    .eq("id", session.user.id)
    .maybeSingle();
  if (prev?.avatar_url) {
    const oldPath = extractStoragePathFromUrl(prev.avatar_url);
    if (oldPath) {
      await supabase.storage.from("avatars").remove([oldPath]);
    }
  }

  const ext = MIME_TO_EXT[file.type] ?? "png";
  const randomId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const storagePath = `${session.user.id}/${randomId}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadErr } = await supabase.storage
    .from("avatars")
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage
    .from("avatars")
    .getPublicUrl(storagePath);
  const publicUrl = publicUrlData?.publicUrl ?? null;
  if (!publicUrl) {
    return NextResponse.json({ error: "Could not resolve public URL" }, { status: 500 });
  }

  const { error: updateErr } = await supabase
    .from("users")
    .update({ avatar_url: publicUrl })
    .eq("id", session.user.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "account_avatar_updated",
    entity_type: "user",
    entity_id: session.user.id,
    previous_value: { avatar_url: prev?.avatar_url ?? null },
    new_value: { avatar_url: publicUrl },
  });

  return NextResponse.json({ avatar_url: publicUrl });
}

export async function DELETE() {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();
  const { data: prev } = await supabase
    .from("users")
    .select("avatar_url")
    .eq("id", session.user.id)
    .maybeSingle();

  const { error: updateErr } = await supabase
    .from("users")
    .update({ avatar_url: null })
    .eq("id", session.user.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (prev?.avatar_url) {
    const oldPath = extractStoragePathFromUrl(prev.avatar_url);
    if (oldPath) {
      await supabase.storage.from("avatars").remove([oldPath]);
    }
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "account_avatar_removed",
    entity_type: "user",
    entity_id: session.user.id,
    previous_value: { avatar_url: prev?.avatar_url ?? null },
    new_value: { avatar_url: null },
  });

  return NextResponse.json({ ok: true });
}
