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

export default async function KycPage({
  searchParams,
}: {
  searchParams: { profileId?: string };
}) {
  const session = await auth();
  if (!session) redirect("/login");

  const supabase = createAdminClient();
  const isPrimary = session.user.is_primary !== false;

  let clientId: string;
  let dueDiligenceLevel: DueDiligenceLevel;
  let kycRecordFilter: string | null = null; // if set, only return this one record

  if (!isPrimary && session.user.kycRecordId) {
    // Non-primary: get client via kyc_records row
    const { data: kycRow } = await supabase
      .from("kyc_records")
      .select("id, client_id, due_diligence_level, clients(due_diligence_level)")
      .eq("id", session.user.kycRecordId)
      .single();
    if (!kycRow?.client_id) redirect("/kyc");
    clientId = kycRow.client_id;
    kycRecordFilter = kycRow.id;
    const accountDdLevel = (kycRow.clients as unknown as { due_diligence_level?: DueDiligenceLevel } | null)?.due_diligence_level ?? "cdd";
    dueDiligenceLevel = (kycRow.due_diligence_level as DueDiligenceLevel | null) ?? accountDdLevel;
  } else {
    // Primary: get client via client_users
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

    clientId = clientUser.client_id;
    dueDiligenceLevel = client?.due_diligence_level ?? "cdd";
  }

  // For primary users, also get client metadata for clientType + kyc_completed_at
  const { data: clientMeta } = isPrimary
    ? await supabase.from("clients").select("client_type, kyc_completed_at").eq("id", clientId).single()
    : { data: null };
  const levels = CUMULATIVE[dueDiligenceLevel] ?? CUMULATIVE.cdd;

  const recordsQuery = supabase
    .from("kyc_records")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: true });
  if (kycRecordFilter) recordsQuery.eq("id", kycRecordFilter);

  const [{ data: records }, { data: documents }, { data: documentTypes }, { data: requirements }] =
    await Promise.all([
      recordsQuery,
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
      clientType={(clientMeta as { client_type?: string } | null)?.client_type as "individual" | "organisation" | null ?? null}
      kycCompletedAt={(clientMeta as { kyc_completed_at?: string } | null)?.kyc_completed_at ?? null}
      dueDiligenceLevel={dueDiligenceLevel}
      records={(records ?? []) as KycRecord[]}
      documents={(documents ?? []) as unknown as DocumentRecord[]}
      documentTypes={(documentTypes ?? []) as DocumentType[]}
      requirements={(requirements ?? []) as unknown as DueDiligenceRequirement[]}
      selectedProfileId={searchParams.profileId ?? null}
      isPrimary={isPrimary}
    />
  );
}
