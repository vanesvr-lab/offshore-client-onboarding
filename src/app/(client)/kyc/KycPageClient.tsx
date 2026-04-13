"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IndividualKycForm } from "@/components/kyc/IndividualKycForm";
import { OrganisationKycForm } from "@/components/kyc/OrganisationKycForm";
import { KycStepWizard } from "@/components/kyc/KycStepWizard";
import { calculateKycCompletion } from "@/lib/utils/completionCalculator";
import type { KycRecord, DocumentRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";

interface KycPageClientProps {
  clientId: string;
  clientType: "individual" | "organisation" | null;
  kycCompletedAt: string | null;
  dueDiligenceLevel: DueDiligenceLevel;
  records: KycRecord[];
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
}

export function KycPageClient({
  clientId,
  clientType,
  kycCompletedAt,
  dueDiligenceLevel,
  records,
  documents,
  documentTypes,
  requirements,
}: KycPageClientProps) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(!!kycCompletedAt);

  // Find the PRIMARY individual record (has profile_id set = the client's owner account)
  // Fall back to first individual record if none has profile_id
  const individualRecord =
    records.find((r) => r.record_type === "individual" && r.profile_id) ??
    records.find((r) => r.record_type === "individual") ??
    null;
  const orgRecord = records.find((r) => r.record_type === "organisation") ?? null;

  // Use step wizard for first-time onboarding (individual only, journey not yet completed)
  const useWizard =
    clientType === "individual" &&
    individualRecord !== null &&
    !individualRecord.kyc_journey_completed &&
    !completed;

  // Compute overall completion across all records (used in accordion view)
  const allCompletions = records.map((r) =>
    calculateKycCompletion(r, documents.filter((d) => d.kyc_record_id === r.id || !d.kyc_record_id))
  );
  const canSubmitAll = allCompletions.length > 0 && allCompletions.every((c) => c.canSubmit);
  const overallPct =
    allCompletions.length > 0
      ? Math.round(allCompletions.reduce((sum, c) => sum + c.overallPercentage, 0) / allCompletions.length)
      : 0;

  const remaining = 100 - overallPct;
  const estimatedMins = Math.max(1, Math.round((remaining / 10) * 2));

  async function handleSubmit() {
    setSubmitting(true);
    try {
      const res = await fetch("/api/kyc/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json() as { error?: string; errors?: string[] };
      if (!res.ok) {
        if (data.errors?.length) {
          toast.error(`Please complete the following: ${data.errors.slice(0, 3).join("; ")}`);
        } else {
          throw new Error(data.error ?? "Submit failed");
        }
        return;
      }
      setCompleted(true);
      toast.success("KYC submitted for review");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (records.length === 0) {
    return (
      <div className="max-w-2xl mx-auto text-center py-16 text-gray-400">
        <UserCheck className="h-12 w-12 mx-auto mb-4 opacity-30" />
        <p className="text-sm">No KYC records found.</p>
        <p className="text-xs mt-1">Please contact GWMS to set up your KYC profile.</p>
      </div>
    );
  }

  // Step wizard for first-time individual onboarding
  if (useWizard && individualRecord) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-brand-navy">KYC / AML Profile</h1>
          <p className="text-gray-500 text-sm mt-1">
            Complete your Know Your Customer profile. All information is stored securely.
          </p>
        </div>
        <KycStepWizard
          clientId={clientId}
          kycRecord={individualRecord}
          documents={documents.filter((d) => d.kyc_record_id === individualRecord.id || !d.kyc_record_id)}
          documentTypes={documentTypes}
          dueDiligenceLevel={dueDiligenceLevel}
          requirements={requirements}
          onComplete={() => {
            setCompleted(true);
            router.refresh();
          }}
        />
      </div>
    );
  }

  // Accordion view for returning / post-submission users
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-brand-navy">KYC / AML Profile</h1>
        <p className="text-gray-500 text-sm mt-1">
          Complete your Know Your Customer profile. All information is stored securely.
        </p>
      </div>

      {/* Progress banner */}
      {completed ? (
        <div className="flex items-center gap-3 rounded-lg bg-green-50 border border-green-200 px-4 py-3">
          <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-green-800">KYC submitted for review</p>
            <p className="text-xs text-green-600">GWMS will review and contact you if additional information is needed.</p>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border bg-white px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-brand-navy">
              Your KYC Progress: {overallPct}% complete
            </span>
            <span className="text-xs text-gray-400">
              Estimated time: ~{estimatedMins} minute{estimatedMins !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-accent transition-all duration-300"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>
      )}

      {/* Individual KYC */}
      {individualRecord && (
        <div>
          {clientType === "organisation" && (
            <h2 className="text-base font-semibold text-brand-navy mb-3">Primary Contact — Individual KYC</h2>
          )}
          <IndividualKycForm
            record={individualRecord}
            documents={documents.filter((d) => d.kyc_record_id === individualRecord.id || !d.kyc_record_id)}
            documentTypes={documentTypes}
          />
        </div>
      )}

      {/* Organisation KYC */}
      {orgRecord && (
        <div className={individualRecord ? "mt-8" : ""}>
          {individualRecord && (
            <h2 className="text-base font-semibold text-brand-navy mb-3">Organisation KYC</h2>
          )}
          <OrganisationKycForm
            record={orgRecord}
            documents={documents.filter((d) => d.kyc_record_id === orgRecord.id || !d.kyc_record_id)}
            documentTypes={documentTypes}
          />
        </div>
      )}

      {/* Submit */}
      {!completed && (
        <div className="sticky bottom-0 bg-white border-t px-4 py-4 -mx-8 -mb-8">
          <div className="max-w-2xl mx-auto flex items-center justify-between">
            <p className="text-xs text-gray-400">
              {canSubmitAll
                ? "All required fields are complete. Ready to submit."
                : "Complete all required fields (*) before submitting."}
            </p>
            <Button
              onClick={handleSubmit}
              disabled={!canSubmitAll || submitting}
              className="bg-brand-navy hover:bg-brand-blue"
            >
              {submitting ? "Submitting…" : "Submit for Review"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
