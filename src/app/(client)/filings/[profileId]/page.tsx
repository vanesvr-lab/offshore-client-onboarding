// B-131/B-134 — Rep-facing KYC editor. Route is gated on
// session.user.email matching the rep profile pointed at by
// client_profiles.filing_rep_profile_id (where is_representative=true);
// the save endpoint (POST /api/profiles/kyc/save) also enforces that
// match so a direct API call from a stale tab would 403. Reuses the
// existing IndividualKycForm / OrganisationKycForm components by
// adapting client_profile_kyc (modern table) into the legacy
// KycRecord shape that those components expect.

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantId } from "@/lib/tenant";
import { IndividualKycForm } from "@/components/kyc/IndividualKycForm";
import { OrganisationKycForm } from "@/components/kyc/OrganisationKycForm";
import type {
  KycRecord,
  DocumentRecord,
  DocumentType,
  DueDiligenceLevel,
} from "@/types";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ profileId: string }>;
}

export default async function FilingPage({ params }: PageProps) {
  const session = await auth();
  if (!session) redirect("/login");

  const { profileId } = await params;
  const supabase = createAdminClient();
  const tenantId = getTenantId(session);

  const { data: profile } = await supabase
    .from("client_profiles")
    .select(
      `
      id, full_name, email, phone, address, record_type,
      due_diligence_level, filing_rep_profile_id,
      filing_rep:filing_rep_profile_id(id, email, is_representative),
      client_profile_kyc(*)
    `,
    )
    .eq("id", profileId)
    .eq("tenant_id", tenantId)
    .eq("is_deleted", false)
    .maybeSingle();

  if (!profile) redirect("/dashboard");

  const sessionEmail = (session.user.email ?? "").toLowerCase();
  const repRef = (profile as unknown as {
    filing_rep: { email: string | null; is_representative: boolean | null } | null;
  }).filing_rep;
  const repEmail =
    repRef?.is_representative === true
      ? (repRef.email ?? "").toLowerCase()
      : "";
  if (!repEmail || repEmail !== sessionEmail) {
    redirect("/dashboard?error=not-a-filing-rep");
  }

  const kycRow = Array.isArray(profile.client_profile_kyc)
    ? profile.client_profile_kyc[0]
    : profile.client_profile_kyc;

  if (!kycRow) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-3">
        <p className="text-lg font-semibold text-brand-navy">
          KYC record not initialised yet
        </p>
        <p className="text-sm text-gray-500">
          Your account manager will set up {profile.full_name}&apos;s KYC
          record before you can edit it.
        </p>
        <Link
          href="/dashboard"
          className="text-sm text-brand-blue hover:underline"
        >
          ← Back to dashboard
        </Link>
      </div>
    );
  }

  // Load uploaded documents (any tied to this client_profile_id) + the
  // active document type catalogue so the forms can render the
  // per-section upload widgets even though the rep edits in isolation.
  const [{ data: rawDocs }, { data: rawDocTypes }] = await Promise.all([
    supabase
      .from("documents")
      .select("*, document_types(*)")
      .eq("client_profile_id", profileId)
      .eq("is_active", true),
    supabase
      .from("document_types")
      .select("*")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  // The two KYC form components expect the legacy `KycRecord` shape.
  // client_profile_kyc shares most field names; we splice in the
  // profile-level fields (name/email/phone/address) + the id of the
  // KYC row (so /api/profiles/kyc/save's kycRecordId aligns).
  const record = {
    ...((kycRow ?? {}) as Record<string, unknown>),
    id: (kycRow as { id?: string }).id ?? "",
    record_type: profile.record_type,
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone,
    address: profile.address,
  } as unknown as KycRecord;

  const documents = (rawDocs ?? []) as unknown as DocumentRecord[];
  const documentTypes = (rawDocTypes ?? []) as DocumentType[];
  const ddLevel = (profile.due_diligence_level ?? "cdd") as DueDiligenceLevel;

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-6">
      <header>
        <Link
          href="/dashboard"
          className="text-xs text-gray-500 hover:text-brand-navy"
        >
          ← Back to dashboard
        </Link>
        <h1 className="text-xl font-semibold text-brand-navy mt-1">
          Filing KYC for {profile.full_name}
        </h1>
        <p className="text-xs text-gray-500 mt-1">
          You&apos;re completing this on behalf of {profile.full_name}. Your
          edits are recorded in the audit log.
        </p>
        <p className="text-[11px] text-gray-400 mt-1">
          Due diligence level: <span className="uppercase">{ddLevel}</span>
        </p>
      </header>

      {profile.record_type === "organisation" ? (
        <OrganisationKycForm
          record={record}
          documents={documents}
          documentTypes={documentTypes}
        />
      ) : (
        <IndividualKycForm
          record={record}
          documents={documents}
          documentTypes={documentTypes}
        />
      )}
    </div>
  );
}
