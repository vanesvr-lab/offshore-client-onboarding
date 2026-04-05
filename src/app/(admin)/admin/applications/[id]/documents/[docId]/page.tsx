import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { DocumentViewer } from "@/components/admin/DocumentViewer";
import Link from "next/link";
import type { DocumentUpload, DocumentRequirement } from "@/types";

export default async function DocumentViewerPage({
  params,
}: {
  params: { id: string; docId: string };
}) {
  const supabase = createAdminClient();

  const { data: upload } = await supabase
    .from("document_uploads")
    .select("*, document_requirements(name, description, category)")
    .eq("id", params.docId)
    .single();

  if (!upload || !upload.file_path) notFound();

  const { data: signedUrlData } = await supabase.storage
    .from("documents")
    .createSignedUrl(upload.file_path, 3600);

  if (!signedUrlData?.signedUrl) notFound();

  const u = upload as DocumentUpload & {
    document_requirements?: DocumentRequirement;
  };

  return (
    <div>
      <div className="mb-4">
        <Link
          href={`/admin/applications/${params.id}`}
          className="text-sm text-brand-blue hover:underline"
        >
          ← Back to application
        </Link>
        <h2 className="text-xl font-bold text-brand-navy mt-1">
          {u.document_requirements?.name}
        </h2>
        {u.document_requirements?.description && (
          <p className="text-sm text-gray-500">
            {u.document_requirements.description}
          </p>
        )}
      </div>
      <DocumentViewer upload={u} signedUrl={signedUrlData.signedUrl} />
    </div>
  );
}
