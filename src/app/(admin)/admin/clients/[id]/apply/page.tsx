import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export default async function AdminClientApplyPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createAdminClient();

  const [{ data: client }, { data: templates }] = await Promise.all([
    supabase.from("clients").select("id, company_name").eq("id", params.id).single(),
    supabase
      .from("service_templates")
      .select("*, document_requirements(id)")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (!client) notFound();

  const templatesWithCount = (templates || []).map((t) => ({
    ...t,
    document_count: (t.document_requirements as { id: string }[])?.length || 0,
  }));

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/admin/clients/${params.id}`}
          className="text-sm text-brand-blue hover:underline mb-2 block"
        >
          ← Back to {client.company_name}
        </Link>
        <h1 className="text-2xl font-bold text-brand-navy">Start Application</h1>
        <p className="text-gray-500 mt-1">
          Select the service for <strong>{client.company_name}</strong>
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {templatesWithCount.map((template) => (
          <Card key={template.id} className="hover:border-brand-blue transition-colors">
            <CardContent className="p-6">
              <h3 className="font-semibold text-brand-navy mb-1">{template.name}</h3>
              {template.description && (
                <p className="text-sm text-gray-500 mb-4">{template.description}</p>
              )}
              <p className="text-xs text-gray-400 mb-4">
                {template.document_count} document{template.document_count !== 1 ? "s" : ""} required
              </p>
              <Link href={`/admin/clients/${params.id}/apply/${template.id}/details`}>
                <Button className="w-full bg-brand-navy hover:bg-brand-blue gap-2">
                  Select
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </CardContent>
          </Card>
        ))}
        {templatesWithCount.length === 0 && (
          <p className="text-gray-400 col-span-3">No active service templates.</p>
        )}
      </div>
    </div>
  );
}
