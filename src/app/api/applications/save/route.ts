import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

const SERVICE_PREFIXES: Record<string, string> = {
  "global business corporation": "GBC",
  "gbc": "GBC",
  "authorised company": "AC",
  "ac": "AC",
  "domestic company": "DC",
  "trust and foundation formation": "TFF",
  "trust": "TFF",
  "foundation": "TFF",
  "relocation to mauritius": "RLM",
  "relocation": "RLM",
};

function getPrefix(templateName: string): string {
  const lower = templateName.toLowerCase();
  for (const [key, prefix] of Object.entries(SERVICE_PREFIXES)) {
    if (lower.includes(key)) return prefix;
  }
  // Fallback: first 3 uppercase letters
  return templateName.replace(/[^a-zA-Z]/g, "").slice(0, 3).toUpperCase() || "APP";
}

async function generateReferenceNumber(
  supabase: ReturnType<typeof createAdminClient>,
  templateName: string
): Promise<string> {
  const prefix = getPrefix(templateName);

  // Find the highest existing number for this prefix
  const { data: existing } = await supabase
    .from("applications")
    .select("reference_number")
    .like("reference_number", `${prefix}-%`)
    .order("reference_number", { ascending: false })
    .limit(1);

  let nextNum = 1;
  if (existing && existing.length > 0 && existing[0].reference_number) {
    const parts = existing[0].reference_number.split("-");
    const last = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(last)) nextNum = last + 1;
  }

  return `${prefix}-${String(nextNum).padStart(4, "0")}`;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { applicationId, templateId, clientId: bodyClientId, ...fields } = body;

  const supabase = createAdminClient();

  // Resolve clientId — admin can pass it explicitly, client resolves from their account
  let resolvedClientId: string | null = null;

  if (session.user.role === "admin" && bodyClientId) {
    // Admin is creating on behalf of a client
    resolvedClientId = bodyClientId;
  } else {
    // Client user — resolve from client_users
    const { data: clientUser } = await supabase
      .from("client_users")
      .select("client_id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (!clientUser) return NextResponse.json({ error: "No client account found" }, { status: 403 });
    resolvedClientId = clientUser.client_id;
  }

  const payload = {
    ...fields,
    template_id: templateId,
    client_id: resolvedClientId,
    status: "draft",
    updated_at: new Date().toISOString(),
  };

  if (applicationId) {
    // Verify ownership before update (admins can edit any application)
    if (session.user.role !== "admin") {
      const { data: existing } = await supabase
        .from("applications")
        .select("client_id")
        .eq("id", applicationId)
        .single();
      if (!existing || existing.client_id !== resolvedClientId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    await supabase.from("applications").update(payload).eq("id", applicationId);
    revalidatePath("/dashboard");
    revalidatePath(`/applications/${applicationId}`);
    return NextResponse.json({ applicationId });
  } else {
    // Generate reference number for new applications
    let referenceNumber: string | undefined;
    if (templateId) {
      const { data: template } = await supabase
        .from("service_templates")
        .select("name")
        .eq("id", templateId)
        .single();
      if (template?.name) {
        referenceNumber = await generateReferenceNumber(supabase, template.name);
      }
    }

    const { data, error } = await supabase
      .from("applications")
      .insert({
        ...payload,
        ...(referenceNumber ? { reference_number: referenceNumber } : {}),
      })
      .select("id, reference_number")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    revalidatePath("/dashboard");
    revalidatePath("/admin/applications");
    revalidatePath("/admin/dashboard");
    return NextResponse.json({ applicationId: data.id, referenceNumber: data.reference_number });
  }
}
