import { createAdminClient } from "@/lib/supabase/admin";
import { RoleRequirementsManager } from "./RoleRequirementsManager";
import type { RoleDocumentRequirement, DocumentType } from "@/types";

export const dynamic = "force-dynamic";

export default async function RoleRequirementsPage() {
  const supabase = createAdminClient();

  const [{ data: requirements }, { data: documentTypes }] = await Promise.all([
    supabase
      .from("role_document_requirements")
      .select("*, document_types(id, name)")
      .order("role")
      .order("sort_order"),
    supabase
      .from("document_types")
      .select("id, name, category, applies_to")
      .eq("is_active", true)
      .order("category")
      .order("name"),
  ]);

  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Role Requirements</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configure which document types are required for each role within a service.
          These requirements apply to all profiles assigned that role.
        </p>
      </div>

      <RoleRequirementsManager
        requirements={(requirements ?? []) as unknown as RoleDocumentRequirement[]}
        documentTypes={(documentTypes ?? []) as unknown as DocumentType[]}
      />
    </div>
  );
}
