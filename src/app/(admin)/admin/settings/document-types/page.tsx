import { createAdminClient } from "@/lib/supabase/admin";
import { DocumentTypesManager } from "./DocumentTypesManager";
import type { DocumentType } from "@/types";

export const dynamic = "force-dynamic";

export default async function DocumentTypesPage() {
  const supabase = createAdminClient();

  const { data: documentTypes } = await supabase
    .from("document_types")
    .select("*")
    .order("category")
    .order("sort_order")
    .order("name");

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Document Types</h1>
        <p className="text-gray-500 text-sm mt-1">
          Manage the types of documents that can be requested and uploaded. Document types are used by
          due diligence requirements and AI verification rules.
        </p>
      </div>

      <DocumentTypesManager documentTypes={(documentTypes ?? []) as DocumentType[]} />
    </div>
  );
}
