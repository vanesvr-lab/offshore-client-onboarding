import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { KycPageClient } from "./KycPageClient";
import type { DocumentType, KycRecord, DocumentRecord } from "@/types";

export const dynamic = "force-dynamic";

export default async function KycPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const supabase = createAdminClient();

  // Get client record for this user
  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id, clients(id, company_name, client_type, kyc_completed_at)")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!clientUser?.client_id) redirect("/dashboard");

  const client = clientUser.clients as unknown as {
    id: string;
    company_name: string;
    client_type: "individual" | "organisation" | null;
    kyc_completed_at: string | null;
  } | null;

  const clientId = clientUser.client_id;

  const [{ data: records }, { data: documents }, { data: documentTypes }] =
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
    ]);

  return (
    <KycPageClient
      clientId={clientId}
      clientType={client?.client_type ?? null}
      kycCompletedAt={client?.kyc_completed_at ?? null}
      records={(records ?? []) as KycRecord[]}
      documents={(documents ?? []) as unknown as DocumentRecord[]}
      documentTypes={(documentTypes ?? []) as DocumentType[]}
    />
  );
}
