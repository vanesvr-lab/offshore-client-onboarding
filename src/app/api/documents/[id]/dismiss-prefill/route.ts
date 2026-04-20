import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";

/**
 * B-033 — mark the AI prefill banner as dismissed for a specific document.
 * POST /api/documents/[id]/dismiss-prefill
 *
 * Caller must have access to the doc (admin, uploader, or a profile that can
 * manage the related service). We verify via admin check first, then fall back
 * to a service-role lookup against `profile_service_roles`.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = getTenantId(session);
  const supabase = createAdminClient();

  const { data: doc, error: fetchError } = await supabase
    .from("documents")
    .select("id, tenant_id, uploaded_by, service_id, client_profile_id")
    .eq("id", params.id)
    .maybeSingle();
  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (doc.tenant_id && doc.tenant_id !== tenantId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let allowed = false;

  // Admin bypass
  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (adminRow) allowed = true;

  // Uploader
  if (!allowed && doc.uploaded_by && doc.uploaded_by === session.user.id) allowed = true;

  // Someone who can manage the service for this doc
  if (!allowed && doc.service_id) {
    const clientProfileId = session.user.clientProfileId;
    if (clientProfileId) {
      const { data: role } = await supabase
        .from("profile_service_roles")
        .select("id")
        .eq("service_id", doc.service_id)
        .eq("client_profile_id", clientProfileId)
        .eq("can_manage", true)
        .eq("tenant_id", tenantId)
        .limit(1)
        .maybeSingle();
      if (role) allowed = true;
    }
  }

  // Owner of the client_profile the doc belongs to
  if (!allowed && doc.client_profile_id) {
    const clientProfileId = session.user.clientProfileId;
    if (clientProfileId && clientProfileId === doc.client_profile_id) allowed = true;
  }

  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("documents")
    .update({ prefill_dismissed_at: now })
    .eq("id", params.id);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ success: true, prefill_dismissed_at: now });
}
