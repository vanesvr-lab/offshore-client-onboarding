import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { FileManager } from "@/components/shared/FileManager";
import type { FileEntry } from "@/components/shared/FileManager";
import Link from "next/link";
import type { VerificationStatus } from "@/types";

export default async function ClientFilesPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = await createClient();

  const [{ data: application }, { data: uploads }] = await Promise.all([
    supabase
      .from("applications")
      .select("id, business_name, template_id")
      .eq("id", params.id)
      .single(),
    supabase
      .from("document_uploads")
      .select("*, document_requirements(name, category)")
      .eq("application_id", params.id)
      .order("uploaded_at"),
  ]);

  if (!application) notFound();

  const files: FileEntry[] = (uploads || []).map((u) => {
    const req = u.document_requirements as { name: string; category: string } | null;
    return {
      id: u.id,
      file_name: u.file_name,
      file_size: u.file_size,
      verification_status: u.verification_status as VerificationStatus,
      uploaded_at: u.uploaded_at,
      category: req?.category ?? "corporate",
      requirementName: req?.name ?? "Document",
    };
  });

  const appName = application.business_name || "Application";
  const uploadHref = application.template_id
    ? `/apply/${application.template_id}/documents?applicationId=${application.id}`
    : undefined;

  return (
    <div className="max-w-4xl">
      <nav className="flex items-center gap-1.5 text-sm text-gray-500 mb-6">
        <Link href="/dashboard" className="hover:text-brand-blue">Dashboard</Link>
        <span>/</span>
        <Link href={`/applications/${params.id}`} className="hover:text-brand-blue">
          {appName}
        </Link>
        <span>/</span>
        <span className="text-gray-800">Files</span>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">My Documents</h1>
        <p className="text-gray-500 text-sm mt-1">
          {appName} · {files.length} file{files.length !== 1 ? "s" : ""}
        </p>
      </div>

      <FileManager
        files={files}
        role="client"
        canUpload
        uploadHref={uploadHref}
      />
    </div>
  );
}
