"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonSummaryBody, type SummarySection } from "@/components/shared/PersonSummaryDialog";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";
import type {
  DocumentType,
  DueDiligenceRequirement,
  ProfileServiceRole,
} from "@/types";
import type { ServiceWithTemplate, ServiceDoc } from "@/app/(admin)/admin/services/[id]/page";
import type { ServicePerson, ClientServiceDoc } from "@/app/(client)/services/[id]/page";

type RoleWithProfile = ProfileServiceRole & {
  client_profiles: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    is_representative: boolean;
    record_type: string;
    due_diligence_level: string;
    user_id: string | null;
    client_profile_kyc: Record<string, unknown>[] | null;
  } | null;
};

type UniqueRoleEntry = {
  person: RoleWithProfile;
  roles: string[];
  allRoleRows: RoleWithProfile[];
};

interface ServiceSummaryDialogProps {
  service: ServiceWithTemplate;
  serviceFields: ServiceField[];
  serviceDetails: Record<string, unknown>;
  uniqueRoles: UniqueRoleEntry[];
  documents: ServiceDoc[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  onClose: () => void;
  /** Fires when an Edit pencil is clicked. `target` is the anchor id to scroll to. */
  onEdit: (target: string) => void;
}

const SECTION_MATCHERS: Record<string, (section: string | undefined) => boolean> = {
  company_setup: (s) => !s || s === "Details" || /company\s*setup/i.test(s) || /company/i.test(s),
  financial: (s) => !!s && /financial|finance/i.test(s),
  banking: (s) => !!s && /bank/i.test(s),
};

function getFieldsForSection(key: string, fields: ServiceField[]): ServiceField[] {
  const matcher = SECTION_MATCHERS[key];
  if (!matcher) return [];
  return fields.filter((f) => matcher(f.section));
}

function formatValue(field: ServiceField, value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) {
    const arr = value.filter((v) => v !== null && v !== undefined && v !== "");
    return arr.length === 0 ? "" : arr.join(", ");
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (field.type === "date" && typeof value === "string") {
    const d = new Date(value);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
  }
  return String(value);
}

function ReadOnlyFieldSection({
  title,
  anchorId,
  fields,
  values,
  onEdit,
}: {
  title: string;
  anchorId: string;
  fields: ServiceField[];
  values: Record<string, unknown>;
  onEdit: (target: string) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-brand-navy">{title}</h3>
        <button
          type="button"
          onClick={() => onEdit(anchorId)}
          className="text-xs text-gray-500 hover:text-brand-navy flex items-center gap-1"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {fields.map((f) => {
          const display = formatValue(f, values[f.key]);
          return (
            <div key={f.key} className="flex flex-col">
              <dt className="text-xs text-gray-500">{f.label}</dt>
              <dd
                className={
                  display
                    ? "text-gray-900 break-words"
                    : "text-red-500 italic"
                }
              >
                {display || "Not provided"}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function verificationBadge(status: string | null | undefined) {
  const map: Record<string, string> = {
    verified: "bg-emerald-50 text-emerald-700",
    flagged: "bg-amber-50 text-amber-700",
    failed: "bg-red-50 text-red-700",
    pending: "bg-gray-100 text-gray-600",
    processing: "bg-blue-50 text-blue-700",
  };
  const label = (status ?? "pending").replace(/_/g, " ");
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${map[status ?? "pending"] ?? "bg-gray-100 text-gray-600"}`}>
      {label}
    </span>
  );
}

function adminStatusBadge(status: string | null | undefined) {
  if (!status) return null;
  const map: Record<string, string> = {
    approved: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
    pending: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
    </span>
  );
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString();
}

function calcKycPctLite(raw: Record<string, unknown>[] | Record<string, unknown> | null | undefined): number {
  const kyc = (Array.isArray(raw) ? raw[0] ?? null : raw) as Record<string, unknown> | null;
  if (!kyc) return 0;
  const KYC_FIELDS = [
    "date_of_birth", "nationality", "passport_number", "passport_expiry",
    "occupation", "address", "source_of_funds_description", "source_of_wealth_description",
    "is_pep", "legal_issues_declared",
  ];
  const filled = KYC_FIELDS.filter((f) => {
    const v = kyc[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  return Math.round((filled / KYC_FIELDS.length) * 100);
}

function ProfileSummaryRow({
  entry,
  documents,
  documentTypes,
  requirements,
  onEdit,
}: {
  entry: UniqueRoleEntry;
  documents: ClientServiceDoc[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  onEdit: (target: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const profile = entry.person.client_profiles;
  if (!profile) return null;
  const profileId = profile.id;
  const isOrganisation = profile.record_type === "organisation";
  const portalAccess = entry.allRoleRows.some((r) => r.can_manage);
  const kycPct = calcKycPctLite(profile.client_profile_kyc);
  const fullName = profile.full_name ?? "Unnamed";

  const summaryPerson: ServicePerson = {
    id: entry.person.id,
    role: entry.person.role,
    shareholding_percentage: entry.person.shareholding_percentage ?? null,
    can_manage: !!entry.person.can_manage,
    invite_sent_at: entry.person.invite_sent_at ?? null,
    invite_sent_by_name: null,
    client_profiles: {
      id: profileId,
      full_name: fullName,
      email: profile.email,
      phone: profile.phone,
      due_diligence_level: profile.due_diligence_level,
      record_type: profile.record_type,
      client_profile_kyc: (Array.isArray(profile.client_profile_kyc)
        ? profile.client_profile_kyc[0] ?? null
        : profile.client_profile_kyc) as Record<string, unknown> | null,
    },
  };

  function handleInnerEdit(section: SummarySection) {
    if (section === "any") {
      onEdit(`person-card-${profileId}`);
      return;
    }
    if (isOrganisation && section === "compliance") {
      onEdit(`person-card-${profileId}`);
      return;
    }
    onEdit(`kyc-section-${profileId}-${section}`);
  }

  return (
    <div className="border rounded-lg bg-white">
      <div className="flex items-center gap-3 px-3 py-2">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-gray-500 hover:text-brand-navy"
          aria-label={expanded ? "Collapse" : "Expand"}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 truncate">{fullName}</span>
          {entry.roles.map((r) => (
            <span
              key={r}
              className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium uppercase tracking-wide"
            >
              {r}
            </span>
          ))}
          {portalAccess && (
            <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Portal access
            </span>
          )}
        </div>
        <span className="text-xs text-gray-500 whitespace-nowrap">KYC: {kycPct}%</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-gray-500 hover:text-brand-navy whitespace-nowrap"
        >
          {expanded ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          onClick={() => onEdit(`person-card-${profileId}`)}
          className="text-gray-500 hover:text-brand-navy"
          aria-label="Edit profile"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>
      {expanded && (
        <div className="border-t px-3 py-3">
          <PersonSummaryBody
            person={summaryPerson}
            documents={documents}
            documentTypes={documentTypes}
            requirements={requirements}
            onEdit={handleInnerEdit}
          />
        </div>
      )}
    </div>
  );
}

function DocumentsSection({
  documents,
  documentTypes,
  uniqueRoles,
  onEdit,
}: {
  documents: ServiceDoc[];
  documentTypes: DocumentType[];
  uniqueRoles: UniqueRoleEntry[];
  onEdit: (target: string) => void;
}) {
  const docTypeById = new Map(documentTypes.map((dt) => [dt.id, dt]));
  const isServiceLevel = (d: ServiceDoc) =>
    !!d.document_type_id && docTypeById.get(d.document_type_id)?.scope === "application";

  const serviceLevelDocs = documents.filter(isServiceLevel);
  const perProfileDocs = documents.filter((d) => !isServiceLevel(d));

  const profileNameById = new Map<string, string>();
  for (const entry of uniqueRoles) {
    const p = entry.person.client_profiles;
    if (p?.id) profileNameById.set(p.id, p.full_name ?? "Unnamed");
  }

  const grouped = new Map<string, ServiceDoc[]>();
  for (const d of perProfileDocs) {
    const key = d.client_profile_id ?? "__unassigned__";
    const list = grouped.get(key) ?? [];
    list.push(d);
    grouped.set(key, list);
  }

  function renderDocRow(d: ServiceDoc) {
    const type = d.document_type_id ? docTypeById.get(d.document_type_id) : null;
    return (
      <li key={d.id} className="flex items-center gap-2 flex-wrap py-1.5 border-b last:border-b-0">
        <span className="text-sm text-gray-900 truncate flex-1 min-w-0" title={d.file_name}>
          {d.file_name}
        </span>
        <span className="text-xs text-gray-500 whitespace-nowrap">
          {type?.name ?? d.document_types?.name ?? "—"}
        </span>
        {verificationBadge(d.verification_status)}
        {adminStatusBadge(d.admin_status)}
        <span className="text-xs text-gray-400 whitespace-nowrap">{shortDate(d.uploaded_at)}</span>
      </li>
    );
  }

  if (documents.length === 0) {
    return (
      <div className="border rounded-lg p-4 bg-white">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-brand-navy">Documents</h3>
          <button
            type="button"
            onClick={() => onEdit("step-documents")}
            className="text-xs text-gray-500 hover:text-brand-navy flex items-center gap-1"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
        </div>
        <p className="text-sm text-gray-500">No documents uploaded yet</p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-brand-navy">Documents</h3>
        <button
          type="button"
          onClick={() => onEdit("step-documents")}
          className="text-xs text-gray-500 hover:text-brand-navy flex items-center gap-1"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </button>
      </div>
      {serviceLevelDocs.length > 0 && (
        <div className="mb-3">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            Service Documents
          </p>
          <ul>{serviceLevelDocs.map(renderDocRow)}</ul>
        </div>
      )}
      {Array.from(grouped.entries()).map(([profileId, docs]) => (
        <div key={profileId} className="mb-3 last:mb-0">
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
            {profileNameById.get(profileId) ?? "Unassigned"}&apos;s Documents
          </p>
          <ul>{docs.map(renderDocRow)}</ul>
        </div>
      ))}
    </div>
  );
}

export function ServiceSummaryDialog({
  service,
  serviceFields,
  serviceDetails,
  uniqueRoles,
  documents,
  documentTypes,
  requirements,
  onClose,
  onEdit,
}: ServiceSummaryDialogProps) {
  const summaryDocs: ClientServiceDoc[] = documents.map((d) => ({
    id: d.id,
    file_name: d.file_name,
    mime_type: d.mime_type,
    verification_status: d.verification_status,
    verification_result: d.verification_result,
    admin_status: d.admin_status,
    prefill_dismissed_at: null,
    uploaded_at: d.uploaded_at,
    document_type_id: d.document_type_id,
    client_profile_id: d.client_profile_id,
    document_types: d.document_types
      ? { name: d.document_types.name, category: d.document_types.category }
      : null,
  }));

  const companyFields = getFieldsForSection("company_setup", serviceFields);
  const financialFields = getFieldsForSection("financial", serviceFields);
  const bankingFields = getFieldsForSection("banking", serviceFields);

  const titleSuffix = service.service_number
    ? `Service Summary (${service.service_number})`
    : "Service Summary";

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto z-[100]">
        <DialogHeader>
          <DialogTitle>
            {service.service_templates?.name ?? "Service"} — {titleSuffix}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <ReadOnlyFieldSection
            title="Company Setup"
            anchorId="step-company-setup"
            fields={companyFields}
            values={serviceDetails}
            onEdit={onEdit}
          />
          <ReadOnlyFieldSection
            title="Financial"
            anchorId="step-financial"
            fields={financialFields}
            values={serviceDetails}
            onEdit={onEdit}
          />
          <ReadOnlyFieldSection
            title="Banking"
            anchorId="step-banking"
            fields={bankingFields}
            values={serviceDetails}
            onEdit={onEdit}
          />

          <div className="border rounded-lg p-4 bg-white">
            <h3 className="text-sm font-semibold text-brand-navy mb-3">
              Profiles ({uniqueRoles.length})
            </h3>
            {uniqueRoles.length === 0 ? (
              <p className="text-sm text-gray-500">No profiles linked to this service yet.</p>
            ) : (
              <div className="space-y-2">
                {uniqueRoles.map((entry) => (
                  <ProfileSummaryRow
                    key={entry.person.client_profiles?.id ?? entry.person.id}
                    entry={entry}
                    documents={summaryDocs}
                    documentTypes={documentTypes}
                    requirements={requirements}
                    onEdit={onEdit}
                  />
                ))}
              </div>
            )}
          </div>

          <DocumentsSection
            documents={documents}
            documentTypes={documentTypes}
            uniqueRoles={uniqueRoles}
            onEdit={onEdit}
          />
        </div>
        <div className="flex justify-end pt-3 border-t">
          <Button
            onClick={onClose}
            className="h-10 px-5 bg-brand-navy text-white hover:bg-brand-navy/90"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
