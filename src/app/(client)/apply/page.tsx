import { createClient } from "@/lib/supabase/server";
import { ServiceCard } from "@/components/client/ServiceCard";

export const dynamic = "force-dynamic";

export default async function ServiceSelectorPage() {
  const supabase = await createClient();

  const { data: templates } = await supabase
    .from("service_templates")
    .select("*, document_requirements(id)")
    .eq("is_active", true)
    .order("name");

  const templatesWithCount = (templates || []).map((t) => ({
    ...t,
    document_count: t.document_requirements?.length || 0,
  }));

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-navy">
          Start a new application
        </h1>
        <p className="text-gray-500 mt-1">
          Select the service you are applying for
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templatesWithCount.map((template) => (
          <ServiceCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
}
