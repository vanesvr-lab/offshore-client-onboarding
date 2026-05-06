import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { StageSelector } from "@/components/admin/StageSelector";
import { DocumentStatusRow } from "@/components/admin/DocumentStatusRow";
import { AuditTrail } from "@/components/admin/AuditTrail";
import { EmailComposer } from "@/components/admin/EmailComposer";
import { AccountManagerPanel } from "@/components/admin/AccountManagerPanel";
import { WorkflowTracker } from "@/components/admin/WorkflowTracker";
import { FlaggedDiscrepanciesCard } from "@/components/admin/FlaggedDiscrepanciesCard";
import { ApplicationStatusPanel } from "@/components/shared/ApplicationStatusPanel";
import { EditableApplicationDetails } from "@/components/admin/EditableApplicationDetails";
import { AdminDocumentUploader } from "@/components/admin/AdminDocumentUploader";
import { PersonsManager } from "@/components/client/PersonsManager";
import {
  AdminApplicationSectionsProvider,
  ConnectedSectionHeader,
  ConnectedNotesHistory,
} from "@/components/admin/AdminApplicationSections";
import {
  AdminApplicationStepIndicator,
  type AdminStep,
} from "@/components/admin/AdminApplicationStepIndicator";
import { AdminKycPersonReviewPanel } from "@/components/admin/AdminKycPersonReviewPanel";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";
import type {
  Application,
  DocumentUpload,
  DocumentRequirement,
  DocumentRecord,
  DocumentType,
  AuditLogEntry,
  EmailLogEntry,
  ApplicationStatus,
  ClientAccountManager,
  VerificationResult,
  ApplicationSectionReview,
} from "@/types";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

export default async function ApplicationDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const supabase = createAdminClient();

  const [
    { data: application },
    { data: uploads },
    { data: auditLog },
    { data: emailLog },
    { data: allAdmins },
    { data: sectionReviewsRaw },
  ] = await Promise.all([
    supabase
      .from("applications")
      .select("*, clients(company_name), service_templates(name, service_fields)")
      .eq("id", params.id)
      .single(),
    supabase
      .from("document_uploads")
      .select("*, document_requirements(name, category)")
      .eq("application_id", params.id)
      .order("uploaded_at"),
    supabase
      .from("audit_log")
      .select("id, application_id, action, actor_id, actor_role, actor_name, entity_type, entity_id, previous_value, new_value, detail, created_at, profiles(full_name)")
      .eq("application_id", params.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("email_log")
      .select("*")
      .eq("application_id", params.id)
      .order("sent_at", { ascending: false }),
    supabase
      .from("admin_users")
      .select("user_id, profiles(full_name, email)")
      .order("created_at"),
    supabase
      .from("application_section_reviews")
      .select("*, profiles:reviewed_by(full_name)")
      .eq("application_id", params.id)
      .order("reviewed_at", { ascending: false }),
  ]);

  const sectionReviews = (sectionReviewsRaw ?? []) as unknown as ApplicationSectionReview[];

  if (!application) notFound();

  const appTyped = application as Application & {
    clients?: { company_name: string | null };
    service_templates?: { name: string; service_fields?: ServiceField[] };
    service_details?: Record<string, unknown> | null;
  };

  const serviceFields = (appTyped.service_templates?.service_fields ?? []) as ServiceField[];

  // Fetch requirements for task data and status panel
  const { data: requirements } = appTyped.template_id
    ? await supabase
        .from("document_requirements")
        .select("id, name, category")
        .eq("template_id", appTyped.template_id)
        .order("sort_order")
    : { data: [] };

  // Fetch documents (new model) linked to this application
  const clientId = (application as { client_id: string }).client_id;
  const { data: linkedDocRows } = await supabase
    .from("document_links")
    .select("document_id")
    .eq("linked_to_type", "application")
    .eq("linked_to_id", params.id);

  const linkedDocIds = (linkedDocRows ?? []).map((r) => (r as { document_id: string }).document_id);
  const { data: linkedDocRecords } = linkedDocIds.length > 0
    ? await supabase
        .from("documents")
        .select("*, document_types(*)")
        .in("id", linkedDocIds)
        .eq("is_active", true)
        .order("uploaded_at")
    : { data: [] };
  const linkedDocs = linkedDocRecords ?? [];

  // Fetch account manager history
  const { data: managerHistory } = await supabase
    .from("client_account_managers")
    .select("*, profiles!admin_id(full_name, email)")
    .eq("client_id", clientId)
    .order("started_at", { ascending: false });

  const currentManager =
    (managerHistory || []).find((m) => m.ended_at === null) ?? null;
  const pastManagers =
    (managerHistory || []).filter((m) => m.ended_at !== null);

  const app = appTyped;
  const clientEmail = app.contact_email || "";

  const typedUploads = (uploads || []) as (DocumentUpload & {
    document_requirements?: DocumentRequirement | null;
  })[];

  const flaggedUploads = typedUploads.filter(
    (u) => u.verification_status === "flagged"
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/admin/clients/${clientId}`}
            className="text-sm text-brand-blue hover:underline mb-1 block"
          >
            ← Back to client
          </Link>
          <h1 className="text-2xl font-bold text-brand-navy">
            {app.reference_number || app.business_name || "Application"}
          </h1>
          <p className="text-gray-500 text-sm">{app.service_templates?.name}</p>
        </div>
        <StatusBadge status={app.status as ApplicationStatus} />
      </div>

      {/* Workflow progress tracker */}
      <div className="mb-6 rounded-lg border bg-white px-6 py-5">
        <WorkflowTracker status={app.status as ApplicationStatus} />
      </div>

      <AdminApplicationSectionsProvider
        applicationId={params.id}
        initialReviews={sectionReviews}
      >
        {/* B-069 — wizard-shaped step indicator (anchors land in Batch 2) */}
        <div className="mb-6 rounded-lg border bg-white px-4 py-3">
          <AdminApplicationStepIndicator
            steps={ADMIN_STEPS_DEFAULT}
          />
        </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left: Application info (col-span-2 on lg+, full-width below) */}
        <div className="space-y-6 lg:col-span-2">
          {/* ── Step 1 — Company Setup ─────────────────────────────── */}
          <section id="step-company-setup" className="scroll-mt-20 space-y-4">
            <header>
              <h2 className="text-lg font-semibold text-brand-navy">
                1. Company Setup
              </h2>
              <p className="text-xs text-gray-500">
                Business, contact, and service details — what the client filled in Steps 1–3 of the wizard.
              </p>
            </header>
            <EditableApplicationDetails
              app={{
                id: app.id,
                business_name: app.business_name ?? null,
                business_type: app.business_type ?? null,
                business_country: app.business_country ?? null,
                business_address: app.business_address ?? null,
                contact_name: app.contact_name ?? null,
                contact_email: app.contact_email ?? null,
                contact_phone: app.contact_phone ?? null,
                service_details: appTyped.service_details ?? null,
                admin_notes: app.admin_notes ?? null,
              }}
              serviceFields={serviceFields}
              templateName={appTyped.service_templates?.name}
            />
          </section>

          {/* ── Step 4 — People & KYC ──────────────────────────────── */}
          <section id="step-people-kyc" className="scroll-mt-20 space-y-4">
            <header>
              <h2 className="text-lg font-semibold text-brand-navy">
                4. People &amp; KYC
              </h2>
              <p className="text-xs text-gray-500">
                Directors, Shareholders &amp; UBOs and their KYC submissions.
              </p>
            </header>
            <Card>
              <ConnectedSectionHeader
                title="Section D: Directors, Shareholders & UBOs"
                sectionKey="people"
              />
              <CardContent>
                <PersonsManager applicationId={params.id} />
                <ConnectedNotesHistory sectionKey="people" />
              </CardContent>
            </Card>

            {/* B-069 Batch 3 — per-profile KYC subsection reviews */}
            <Card>
              <CardHeader>
                <CardTitle className="text-brand-navy text-base">
                  KYC Review — per profile, per subsection
                </CardTitle>
              </CardHeader>
              <CardContent>
                <AdminKycPersonReviewPanel applicationId={params.id} />
              </CardContent>
            </Card>
          </section>

          {/* ── Step 5 — Documents ─────────────────────────────────── */}
          <section id="step-documents" className="scroll-mt-20 space-y-4">
            <header>
              <h2 className="text-lg font-semibold text-brand-navy">
                5. Documents
              </h2>
              <p className="text-xs text-gray-500">
                Application-scope documents and AI verification results.
              </p>
            </header>
          <Card>
            <ConnectedSectionHeader
              title="Documents"
              sectionKey="documents"
              rightSlot={
                <AdminDocumentUploader
                  applicationId={params.id}
                  requirements={(requirements ?? []) as DocumentRequirement[]}
                  existingUploads={typedUploads}
                />
              }
            />
            <CardContent className="pt-0">
              {linkedDocs.length === 0 && typedUploads.length === 0 ? (
                <p className="py-4 text-sm text-gray-400 text-center">No documents uploaded yet</p>
              ) : (
                <div>
                  {linkedDocs.map((doc) => (
                    <DocumentStatusRow
                      key={doc.id}
                      document={doc as unknown as DocumentRecord & { document_types?: DocumentType | null }}
                      applicationId={params.id}
                    />
                  ))}
                  {typedUploads.map((u) => (
                    <div key={u.id} className="flex items-center justify-between py-2 text-sm border-b last:border-0">
                      <span className="text-brand-navy">{u.document_requirements?.name}</span>
                      <div className="flex items-center gap-3">
                        <Link
                          href={`/admin/applications/${params.id}/documents/${u.id}`}
                          className="text-brand-blue text-xs hover:underline"
                        >
                          View
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <ConnectedNotesHistory sectionKey="documents" />
            </CardContent>
          </Card>

          {/* AI Flagged Discrepancies */}
          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                AI Flagged Discrepancies
              </CardTitle>
            </CardHeader>
            <CardContent>
              <FlaggedDiscrepanciesCard
                applicationId={params.id}
                flaggedDocs={flaggedUploads.map((u) => ({
                  id: u.id,
                  application_id: u.application_id,
                  file_name: u.file_name,
                  verification_result: u.verification_result as VerificationResult | null,
                  document_requirements: u.document_requirements
                    ? { name: u.document_requirements.name, category: u.document_requirements.category }
                    : null,
                }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Verification Checklist
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5">
                {[
                  "Identity documents verified",
                  "Business registration confirmed",
                  "Source of funds reviewed",
                  "UBO declarations cross-checked",
                  "PEP/sanctions screening complete",
                  "Risk assessment completed",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2.5 text-sm">
                    <div className="h-4 w-4 rounded border border-gray-300 bg-white flex-shrink-0" />
                    <span className="text-gray-700">{item}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 mt-4">
                Checklist automation coming in v2
              </p>
            </CardContent>
          </Card>
          </section>
        </div>

        {/* Right: Actions */}
        <div className="space-y-6">
          {/* Application Health Panel */}
          <ApplicationStatusPanel
            application={{
              business_name: app.business_name,
              status: app.status as ApplicationStatus,
              admin_notes: app.admin_notes,
            }}
            requirements={(requirements || []) as Array<{ id: string; name: string; category: string }>}
            uploads={typedUploads.map((u) => ({
              id: u.id,
              requirement_id: u.requirement_id,
              verification_status: u.verification_status,
              verification_result: u.verification_result,
            }))}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Stage Management
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StageSelector
                applicationId={params.id}
                clientId={appTyped.client_id}
                currentStatus={app.status as ApplicationStatus}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Communication
              </CardTitle>
            </CardHeader>
            <CardContent>
              <EmailComposer
                applicationId={params.id}
                clientEmail={clientEmail}
                companyName={app.business_name || ""}
                previousEmails={(emailLog || []) as EmailLogEntry[]}
              />
            </CardContent>
          </Card>

          <AccountManagerPanel
            clientId={clientId}
            current={currentManager as unknown as (ClientAccountManager & { profiles: { full_name: string | null; email: string | null } | null }) | null}
            history={pastManagers as unknown as (ClientAccountManager & { profiles: { full_name: string | null; email: string | null } | null })[]}
            admins={(allAdmins || []) as unknown as { user_id: string; profiles: { full_name: string | null; email: string | null } | null }[]}
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy text-base">
                Audit Trail
              </CardTitle>
            </CardHeader>
            <CardContent>
              <AuditTrail
                entries={
                  (auditLog || []) as unknown as (AuditLogEntry & {
                    profiles?: { full_name: string | null };
                  })[]
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>
      </AdminApplicationSectionsProvider>
    </div>
  );
}

// B-069 — visible admin steps for the indicator. Financial / Banking
// folded into Step 1 (Company Setup) per the brief's POC shortcut —
// service_details JSON isn't easy to split out cleanly, so we omit
// those steps from the indicator until that work is undertaken.
const ADMIN_STEPS_DEFAULT: AdminStep[] = [
  {
    id: "step-company-setup",
    label: "Company Setup",
    sectionKeys: ["business", "contact", "service"],
  },
  {
    id: "step-people-kyc",
    label: "People & KYC",
    sectionKeys: ["people"],
  },
  {
    id: "step-documents",
    label: "Documents",
    sectionKeys: ["documents"],
  },
];
