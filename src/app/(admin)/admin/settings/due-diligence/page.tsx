import { createAdminClient } from "@/lib/supabase/admin";
import { DueDiligenceSettingsManager } from "@/components/admin/DueDiligenceSettingsManager";
import type { DueDiligenceSettings, DueDiligenceRequirement } from "@/types";

export const dynamic = "force-dynamic";

export default async function DueDiligenceSettingsPage() {
  const supabase = createAdminClient();

  const [{ data: settings }, { data: requirements }] = await Promise.all([
    supabase
      .from("due_diligence_settings")
      .select("*")
      .order("level"),
    supabase
      .from("due_diligence_requirements")
      .select("*, document_types(id, name)")
      .order("sort_order"),
  ]);

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Due Diligence Configuration</h1>
        <p className="text-gray-500 text-sm mt-1">
          Configure due diligence levels and their requirements. These settings affect which fields and documents clients must provide at each risk level.
        </p>
      </div>

      <DueDiligenceSettingsManager
        settings={(settings ?? []) as DueDiligenceSettings[]}
        requirements={(requirements ?? []) as unknown as DueDiligenceRequirement[]}
      />
    </div>
  );
}
