import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { KycPageClient } from "./KycPageClient";
import type { DocumentType, KycRecord, DocumentRecord, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";

export const dynamic = "force-dynamic";

const CUMULATIVE: Record<string, string[]> = {
  sdd: ["basic", "sdd"],
  cdd: ["basic", "sdd", "cdd"],
  edd: ["basic", "sdd", "cdd", "edd"],
};

export default async function KycPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const supabase = createAdminClient();

  // Get client record for this user
  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id, clients(id, company_name, client_type, kyc_completed_at, due_diligence_level)")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!clientUser?.client_id) redirect("/dashboard");

  const client = clientUser.clients as unknown as {
    id: string;
    company_name: string;
    client_type: "individual" | "organisation" | null;
    kyc_completed_at: string | null;
    due_diligence_level: DueDiligenceLevel | null;
  } | null;

  const clientId = clientUser.client_id;
  const dueDiligenceLevel: DueDiligenceLevel = client?.due_diligence_level ?? "cdd";
  const levels = CUMULATIVE[dueDiligenceLevel] ?? CUMULATIVE.cdd;

  const [{ data: records }, { data: documents }, { data: documentTypes }, { data: requirements }] =
    await Promise.all([
      supabase
        .from("kyc_records")
        .select("*")
        .eq("client_id", clientId)
        .order("created_at", { ascending: true }),
      supabase
        .from("documents")
        .select("*, document_types(*)")
        .eq("client_id", clientId)
        .eq("is_active", true),
      supabase
        .from("document_types")
        .select("*")
        .eq("is_active", true)
        .order("sort_order"),
      supabase
        .from("due_diligence_requirements")
        .select("*, document_types(id, name)")
        .in("level", levels)
        .order("sort_order"),
    ]);

  return (
    <KycPageClient
      clientId={clientId}
      clientType={client?.client_type ?? null}
      kycCompletedAt={client?.kyc_completed_at ?? null}
      dueDiligenceLevel={dueDiligenceLevel}
      records={(records ?? []) as KycRecord[]}
      documents={(documents ?? []) as unknown as DocumentRecord[]}
      documentTypes={(documentTypes ?? []) as DocumentType[]}
      requirements={(requirements ?? []) as unknown as DueDiligenceRequirement[]}
    />
  );
}
