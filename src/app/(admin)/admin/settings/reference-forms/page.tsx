import { createAdminClient } from "@/lib/supabase/admin";
import { ReferenceFormsManager } from "./ReferenceFormsManager";

export const dynamic = "force-dynamic";

export interface ReferenceFormRow {
  id: string;
  service_template_id: string;
  action_key: string;
  name: string;
  file_path: string;
  source_url: string | null;
  version_label: string | null;
  status: "active" | "deactivated";
  deactivated_reason: "no_longer_required" | "replaced_by_newer_version" | null;
  deactivated_at: string | null;
  deactivated_note: string | null;
  replaced_by_id: string | null;
  sort_order: number;
  created_at: string;
}

export interface TemplateActionBinding {
  service_template_id: string;
  template_name: string;
  action_key: string;
  action_label: string;
}

export default async function ReferenceFormsPage() {
  const supabase = createAdminClient();

  const [
    { data: forms },
    { data: bindingsRaw },
    { data: templates },
  ] = await Promise.all([
    supabase
      .from("reference_forms")
      .select("*")
      .order("service_template_id")
      .order("action_key")
      .order("sort_order"),
    supabase
      .from("service_template_actions")
      .select("service_template_id, action_key, action_label, sort_order")
      .order("sort_order"),
    supabase.from("service_templates").select("id, name"),
  ]);

  const templateNameById = new Map<string, string>(
    (templates ?? []).map((t) => [t.id as string, t.name as string]),
  );

  const bindings: TemplateActionBinding[] = (bindingsRaw ?? []).map((b) => ({
    service_template_id: b.service_template_id as string,
    template_name: templateNameById.get(b.service_template_id as string) ?? "Unknown template",
    action_key: b.action_key as string,
    action_label: b.action_label as string,
  }));

  return (
    <div className="max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Reference Forms</h1>
        <p className="text-gray-500 text-sm mt-1">
          Blank regulatory templates admins download (and pre-fill in a future
          enhancement). Each form is scoped to a specific Action subsection on
          a single service template. Replace the file when a regulator
          publishes a new version — the old row is kept for audit and any
          submitted copies stay pinned to the historical version.
        </p>
      </div>

      <ReferenceFormsManager
        forms={(forms ?? []) as ReferenceFormRow[]}
        bindings={bindings}
        templateNameById={Object.fromEntries(templateNameById)}
      />
    </div>
  );
}
