import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { IndividualKycForm } from "@/components/kyc/IndividualKycForm";
import { OrganisationKycForm } from "@/components/kyc/OrganisationKycForm";
import { RiskAssessmentPanel } from "@/components/admin/RiskAssessmentPanel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import type { KycRecord, DocumentRecord, DocumentType } from "@/types";

export const dynamic = "force-dynamic";

export default async function AdminClientKycPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { profileId?: string };
}) {
  const supabase = createAdminClient();

  const [{ data: client }, { data: records }, { data: documents }, { data: documentTypes }] =
    await Promise.all([
      supabase.from("clients").select("id, company_name").eq("id", params.id).single(),
      supabase.from("kyc_records").select("*").eq("client_id", params.id).order("created_at"),
      supabase.from("documents").select("*, document_types(*)").eq("client_id", params.id).eq("is_active", true),
      supabase.from("document_types").select("*").eq("is_active", true).order("sort_order"),
    ]);

  if (!client) notFound();

  const typedRecords = (records ?? []) as KycRecord[];
  const typedDocs = (documents ?? []) as unknown as DocumentRecord[];
  const typedTypes = (documentTypes ?? []) as DocumentType[];

  // If profileId is specified in the URL, show that specific profile
  // Otherwise show the primary individual record
  const selectedProfileId = searchParams?.profileId;
  const individualRecord = selectedProfileId
    ? (typedRecords.find((r) => r.id === selectedProfileId) ?? null)
    : (typedRecords.find((r) => r.record_type === "individual" && r.is_primary) ??
       typedRecords.find((r) => r.record_type === "individual") ??
       null);
  const orgRecord = typedRecords.find((r) => r.record_type === "organisation") ?? null;

  function docsForRecord(record: KycRecord) {
    return typedDocs.filter((d) => d.kyc_record_id === record.id || !d.kyc_record_id);
  }

  return (
    <div>
      <div className="mb-6">
        <Link href={`/admin/clients/${params.id}`} className="text-sm text-brand-blue hover:underline mb-2 block">
          ← Back to {client.company_name}
        </Link>
        <h1 className="text-2xl font-bold text-brand-navy">KYC Profile</h1>
        <p className="text-gray-500 text-sm mt-1">{client.company_name}</p>
      </div>

      {typedRecords.length === 0 && (
        <p className="text-sm text-gray-400">No KYC records found for this client.</p>
      )}

      <div className="space-y-8">
        {individualRecord && (
          <div className="space-y-6">
            <h2 className="text-base font-semibold text-brand-navy">Individual KYC — {individualRecord.full_name ?? "Primary Contact"}</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <IndividualKycForm
                record={individualRecord}
                documents={docsForRecord(individualRecord)}
                documentTypes={typedTypes}
              />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-brand-navy">Risk Assessment</CardTitle>
                </CardHeader>
                <CardContent>
                  <RiskAssessmentPanel
                    kycRecordId={individualRecord.id}
                    kycRecord={individualRecord}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {orgRecord && (
          <div className="space-y-6">
            <h2 className="text-base font-semibold text-brand-navy">Organisation KYC — {orgRecord.full_name ?? "Organisation"}</h2>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <OrganisationKycForm
                record={orgRecord}
                documents={docsForRecord(orgRecord)}
                documentTypes={typedTypes}
              />
              <Card>
                <CardHeader>
                  <CardTitle className="text-base text-brand-navy">Risk Assessment</CardTitle>
                </CardHeader>
                <CardContent>
                  <RiskAssessmentPanel
                    kycRecordId={orgRecord.id}
                    kycRecord={orgRecord}
                  />
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
