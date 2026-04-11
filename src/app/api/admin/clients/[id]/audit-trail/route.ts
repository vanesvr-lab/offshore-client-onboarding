import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = createAdminClient();

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!adminRow) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get("search") ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50", 10), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  // Get all application IDs for this client
  const { data: apps } = await supabase
    .from("applications")
    .select("id")
    .eq("client_id", params.id);
  const appIds = (apps ?? []).map((a) => (a as { id: string }).id);

  // Get all user IDs linked to this client
  const { data: clientUsers } = await supabase
    .from("client_users")
    .select("user_id")
    .eq("client_id", params.id);
  const linkedUserIds = (clientUsers ?? []).map((u) => (u as { user_id: string }).user_id);

  // Build query — audit entries where application_id is one of the client's apps,
  // OR where actor_id is one of the client's users (for client-level actions),
  // OR where entity_id is the client_id itself
  let query = supabase
    .from("audit_log")
    .select(
      `id, application_id, actor_id, actor_role, actor_name, action,
       entity_type, entity_id, previous_value, new_value, detail, created_at,
       profiles!actor_id(full_name, email)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  // Build OR filter
  const orParts: string[] = [];
  if (appIds.length > 0) {
    orParts.push(`application_id.in.(${appIds.join(",")})`);
  }
  if (linkedUserIds.length > 0) {
    orParts.push(`actor_id.in.(${linkedUserIds.join(",")})`);
  }
  orParts.push(`entity_id.eq.${params.id}`);

  query = query.or(orParts.join(","));

  if (search) {
    // Filter on action or actor_name — Supabase doesn't support OR across columns
    // in a secondary filter cleanly, so we filter action and actor_name separately
    // using ilike on action as the primary text filter (JSONB search not feasible here)
    query = query.ilike("action", `%${search}%`);
  }

  const { data: entries, count, error } = await query
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also look up application context (business_name, reference_number) for entries with application_id
  const allEntryAppIds = (entries ?? [])
    .map((e) => (e as { application_id: string | null }).application_id)
    .filter(Boolean) as string[];
  const entryAppIds = Array.from(new Set(allEntryAppIds));

  const appContext: Record<string, { business_name: string | null; reference_number: string | null }> = {};
  if (entryAppIds.length > 0) {
    const { data: appRows } = await supabase
      .from("applications")
      .select("id, business_name, reference_number")
      .in("id", entryAppIds);
    for (const a of appRows ?? []) {
      const ar = a as { id: string; business_name: string | null; reference_number: string | null };
      appContext[ar.id] = { business_name: ar.business_name, reference_number: ar.reference_number };
    }
  }

  // Attach app context to each entry
  const enriched = (entries ?? []).map((e) => {
    const entry = e as Record<string, unknown>;
    const appId = entry.application_id as string | null;
    return {
      ...entry,
      application: appId ? (appContext[appId] ?? null) : null,
    };
  });

  return NextResponse.json({ entries: enriched, total: count ?? 0 });
}
