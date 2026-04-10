import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { RiskAssessmentPanel } from "@/components/admin/RiskAssessmentPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { User, Building2 } from "lucide-react";
import type { KycRecord } from "@/types";

export const dynamic = "force-dynamic";

export default async function AdminClientRiskPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createAdminClient();

  const [{ data: client }, { data: records }] = await Promise.all([
    supabase.from("clients").select("id, company_name").eq("id", params.id).single(),
    supabase.from("kyc_records").select("*").eq("client_id", params.id).order("created_at"),
  ]);

  if (!client) notFound();

  const typedRecords = (records ?? []) as KycRecord[];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-brand-navy">Risk Assessment</h1>
        <p className="text-gray-500 text-sm mt-1">{client.company_name}</p>
      </div>

      {typedRecords.length === 0 && (
        <p className="text-sm text-gray-400">No KYC records found for this client.</p>
      )}

      <div className="space-y-6">
        {typedRecords.map((record) => (
          <Card key={record.id}>
            <CardHeader>
              <CardTitle className="text-base text-brand-navy flex items-center gap-2">
                {record.record_type === "individual" ? (
                  <User className="h-4 w-4 text-gray-400" />
                ) : (
                  <Building2 className="h-4 w-4 text-gray-400" />
                )}
                {record.full_name ?? (record.record_type === "individual" ? "Individual" : "Organisation")}
                <span className="text-xs font-normal text-gray-400 capitalize ml-1">({record.record_type})</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RiskAssessmentPanel kycRecordId={record.id} kycRecord={record} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
