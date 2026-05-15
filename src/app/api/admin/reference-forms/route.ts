import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAuditLog } from "@/lib/audit/writeAuditLog";
import {
  DOCUMENTS_BUCKET,
  referenceFormPath,
  sanitizeFilename,
} from "@/lib/supabase/storage";

const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB — regulatory PDFs can be larger than KYC scans
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
];

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const serviceTemplateId = url.searchParams.get("service_template_id");
  const actionKey = url.searchParams.get("action_key");
  const includeDeactivated = url.searchParams.get("include_deactivated") === "true";

  const supabase = createAdminClient();

  let query = supabase
    .from("reference_forms")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (serviceTemplateId) {
    query = query.eq("service_template_id", serviceTemplateId);
  }
  if (actionKey) {
    query = query.eq("action_key", actionKey);
  }
  if (!includeDeactivated) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ referenceForms: data ?? [] });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const name = (formData.get("name") as string | null)?.trim() ?? "";
  const serviceTemplateId = formData.get("service_template_id") as string | null;
  const actionKey = formData.get("action_key") as string | null;
  const versionLabel = (formData.get("version_label") as string | null)?.trim() || null;
  const sourceUrlRaw = (formData.get("source_url") as string | null)?.trim() || null;
  const replaceForFormId = (formData.get("replace_for_form_id") as string | null) || null;
  const sortOrderRaw = formData.get("sort_order") as string | null;

  if (!file || !name || !serviceTemplateId || !actionKey) {
    return NextResponse.json(
      { error: "file, name, service_template_id and action_key are required" },
      { status: 400 },
    );
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "File type not allowed. Use PDF, DOC/DOCX, JPEG, or PNG." },
      { status: 400 },
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: "File exceeds 25MB limit" }, { status: 400 });
  }
  if (sourceUrlRaw && !isValidUrl(sourceUrlRaw)) {
    return NextResponse.json({ error: "source_url must be a valid http(s) URL" }, { status: 400 });
  }

  const supabase = createAdminClient();

  // If this is a Replace flow, confirm the existing row exists + is replaceable.
  let previousRow: {
    id: string;
    service_template_id: string;
    action_key: string;
    status: string;
    sort_order: number;
  } | null = null;
  if (replaceForFormId) {
    const { data: prev, error: prevError } = await supabase
      .from("reference_forms")
      .select("id, service_template_id, action_key, status, sort_order")
      .eq("id", replaceForFormId)
      .maybeSingle();
    if (prevError) return NextResponse.json({ error: prevError.message }, { status: 500 });
    if (!prev) return NextResponse.json({ error: "Form to replace not found" }, { status: 404 });
    if (prev.status !== "active") {
      return NextResponse.json(
        { error: "Can only replace an active reference form" },
        { status: 409 },
      );
    }
    if (prev.service_template_id !== serviceTemplateId || prev.action_key !== actionKey) {
      return NextResponse.json(
        { error: "Replacement must keep the same template + action_key" },
        { status: 400 },
      );
    }
    previousRow = prev;
  }

  // Resolve sort_order:
  // - Replace flow: inherit the previous row's sort_order so the new active row slots in the same place.
  // - New upload: append to the end of the active list for this (template, action_key).
  let sortOrder = 0;
  if (sortOrderRaw && !Number.isNaN(Number(sortOrderRaw))) {
    sortOrder = Number(sortOrderRaw);
  } else if (previousRow) {
    sortOrder = previousRow.sort_order;
  } else {
    const { data: maxRow } = await supabase
      .from("reference_forms")
      .select("sort_order")
      .eq("service_template_id", serviceTemplateId)
      .eq("action_key", actionKey)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    sortOrder = (maxRow?.sort_order ?? -1) + 1;
  }

  // Insert the new row first so we have an id for the storage path.
  const { data: inserted, error: insertError } = await supabase
    .from("reference_forms")
    .insert({
      service_template_id: serviceTemplateId,
      action_key: actionKey,
      name,
      file_path: "pending",
      source_url: sourceUrlRaw,
      version_label: versionLabel,
      status: "active",
      sort_order: sortOrder,
      created_by: session.user.id,
    })
    .select("*")
    .single();
  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? "Failed to insert reference form" },
      { status: 500 },
    );
  }

  const filePath = referenceFormPath(inserted.id, file.name);
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const { error: storageError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(filePath, fileBuffer, { contentType: file.type, upsert: true });
  if (storageError) {
    // Roll back the row so we don't leave an orphan pointing at "pending".
    await supabase.from("reference_forms").delete().eq("id", inserted.id);
    return NextResponse.json({ error: storageError.message }, { status: 500 });
  }

  const { data: finalized, error: finalizeError } = await supabase
    .from("reference_forms")
    .update({ file_path: filePath })
    .eq("id", inserted.id)
    .select("*")
    .single();
  if (finalizeError || !finalized) {
    return NextResponse.json(
      { error: finalizeError?.message ?? "Failed to finalise reference form" },
      { status: 500 },
    );
  }

  // Replace flow: deactivate the previous row and link forward.
  if (previousRow) {
    await supabase
      .from("reference_forms")
      .update({
        status: "deactivated",
        deactivated_reason: "replaced_by_newer_version",
        deactivated_at: new Date().toISOString(),
        replaced_by_id: finalized.id,
      })
      .eq("id", previousRow.id);

    await writeAuditLog(supabase, {
      actor_id: session.user.id,
      actor_role: "admin",
      actor_name: session.user.name ?? session.user.email ?? "Unknown user",
      action: "reference_form_replaced",
      entity_type: "reference_form",
      entity_id: previousRow.id,
      previous_value: { status: previousRow.status },
      new_value: {
        status: "deactivated",
        deactivated_reason: "replaced_by_newer_version",
        replaced_by_id: finalized.id,
      },
      detail: { new_form_id: finalized.id, new_form_name: name },
    });
  }

  await writeAuditLog(supabase, {
    actor_id: session.user.id,
    actor_role: "admin",
    actor_name: session.user.name ?? session.user.email ?? "Unknown user",
    action: "reference_form_created",
    entity_type: "reference_form",
    entity_id: finalized.id,
    new_value: {
      name,
      service_template_id: serviceTemplateId,
      action_key: actionKey,
      version_label: versionLabel,
      replaces: previousRow?.id ?? null,
    },
    detail: { file_name: sanitizeFilename(file.name) },
  });

  revalidatePath("/admin/settings/reference-forms");
  return NextResponse.json({ referenceForm: finalized });
}
