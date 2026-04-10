import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { ProcessReadinessDashboard } from "@/components/admin/ProcessReadinessDashboard";
import Link from "next/link";
import type { DocumentType } from "@/types";

export const dynamic = "force-dynamic";

export default async function ProcessDetailPage({
  params,
}: {
  params: { id: string; processId: string };
}) {
  const supabase = createAdminClient();

  const [{ data: process }, { data: client }, { data: documentTypes }] = await Promise.all([
    supabase
      .from("client_processes")
      .select(`
        id, status, notes, started_at,
        process_templates(id, name),
        process_documents(
          id, requirement_id, document_id, status, source, requested_at, received_at,
          documents(id, file_name, uploaded_at, expiry_date),
          process_requirements:requirement_id(
            id, document_type_id, per_person,
            document_types(id, name, category)
          )
        )
      `)
      .eq("id", params.processId)
      .single(),
    supabase
      .from("clients")
      .select("id, company_name, client_type")
      .eq("id", params.id)
      .single(),
    supabase
      .from("document_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (!process || !client) notFound();

  const processTemplate = process.process_templates as unknown as { id: string; name: string } | null;
  const rawDocs = (process.process_documents ?? []) as unknown as Array<{
    id: string;
    requirement_id: string;
    document_id: string | null;
    status: "available" | "missing" | "requested" | "received";
    source: string | null;
    requested_at: string | null;
    received_at: string | null;
    documents: { id: string; file_name: string; uploaded_at: string; expiry_date: string | null } | null;
    process_requirements: {
      id: string;
      document_type_id: string;
      per_person: boolean;
      document_types: { id: string; name: string; category: string } | null;
    } | null;
  }>;

  // Flatten: bring document_types up from process_requirements
  const flatDocs = rawDocs.map((pd) => ({
    id: pd.id,
    requirement_id: pd.requirement_id,
    document_id: pd.document_id,
    status: pd.status,
    source: pd.source,
    requested_at: pd.requested_at,
    received_at: pd.received_at,
    documents: pd.documents,
    document_types: pd.process_requirements?.document_types ?? null,
  }));

  return (
    <div>
      {/* Breadcrumb */}
      <nav className="text-sm text-gray-400 mb-4 flex items-center gap-1.5">
        <Link href="/admin/clients" className="hover:text-brand-blue">Clients</Link>
        <span>/</span>
        <Link href={`/admin/clients/${client.id}`} className="hover:text-brand-blue">{client.company_name}</Link>
        <span>/</span>
        <span className="text-gray-600">{processTemplate?.name ?? "Process"}</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">{processTemplate?.name ?? "Process"}</h1>
        <p className="text-gray-500 text-sm mt-1">
          {client.company_name} · Started {new Date(process.started_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
        </p>
      </div>

      <ProcessReadinessDashboard
        processId={params.processId}
        processName={processTemplate?.name ?? "Process"}
        clientId={client.id}
        clientName={client.company_name}
        processDocs={flatDocs}
        allDocumentTypes={(documentTypes ?? []) as DocumentType[]}
      />
    </div>
  );
}
