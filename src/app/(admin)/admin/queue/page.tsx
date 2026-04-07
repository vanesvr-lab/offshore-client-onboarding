import { createAdminClient } from "@/lib/supabase/admin";
import { ApplicationTable } from "@/components/admin/ApplicationTable";
import { CreateClientModal } from "@/components/admin/CreateClientModal";

export const dynamic = "force-dynamic";

export default async function QueuePage() {
  const supabase = createAdminClient();

  const { data: applications } = await supabase
    .from("applications")
    .select("*, clients(company_name), service_templates(name)")
    .neq("status", "draft")
    .order("submitted_at", { ascending: false });

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">Review Queue</h1>
          <p className="text-gray-500 mt-1">Active applications awaiting review</p>
        </div>
        <CreateClientModal />
      </div>
      <ApplicationTable applications={applications || []} />
    </div>
  );
}
