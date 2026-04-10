import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { DocumentLibraryTable } from "@/components/admin/DocumentLibraryTable";
import type { DocumentType } from "@/types";

export const dynamic = "force-dynamic";

export default async function ClientDocumentsPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createAdminClient();

  const [{ data: client }, { data: documents }, { data: documentTypes }] =
    await Promise.all([
      supabase.from("clients").select("id, company_name").eq("id", params.id).single(),
      supabase
        .from("documents")
        .select("*, document_types(*), document_links(*)")
        .eq("client_id", params.id)
        .eq("is_active", true)
        .order("uploaded_at", { ascending: false }),
      supabase.from("document_types").select("*").eq("is_active", true).order("sort_order"),
    ]);

  if (!client) notFound();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Document Library</h1>
        <p className="text-gray-500 text-sm mt-1">
          {client.company_name} — all uploaded documents
        </p>
      </div>

      <DocumentLibraryTable
        clientId={params.id}
        documents={documents ?? []}
        documentTypes={(documentTypes ?? []) as DocumentType[]}
      />
    </div>
  );
}
