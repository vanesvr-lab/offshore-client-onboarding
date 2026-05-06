"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronDown, CheckCircle, XCircle, FileText,
  UserCheck, Building2, Users2, Plus, Loader2, Mail,
  StickyNote, ShieldCheck, Milestone, Clock,
  AlertTriangle, Download, Eye, MessageSquarePlus, Upload,
  CheckSquare, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { InviteKycDialog } from "@/components/shared/InviteKycDialog";
import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import { DocumentDetailDialog } from "@/components/shared/DocumentDetailDialog";
import type { DocumentDetailDoc } from "@/components/shared/DocumentDetailDialog";
import { DocumentStatusBadge } from "@/components/shared/DocumentStatusBadge";
import { ServiceCollapsibleSection } from "@/components/admin/ServiceCollapsibleSection";
import { AuditTrail } from "@/components/admin/AuditTrail";
import { DocumentPreviewDialog } from "@/components/admin/DocumentPreviewDialog";
import { DocumentUpdateRequestDialog } from "@/components/admin/DocumentUpdateRequestDialog";
import { VerificationBadge } from "@/components/client/VerificationBadge";
import { normalizeConfidence } from "@/lib/ai/confidence";
import type { VerificationResult, VerificationStatus } from "@/types";
import {
  calcSectionCompletion,
  calcKycCompletion,
  calcDocumentsCompletion,
} from "@/lib/utils/serviceCompletion";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";
import type { ProfileServiceRole, ServiceSectionOverride, ClientProfile, DueDiligenceRequirement, DocumentType, AuditLogEntry, ApplicationSectionReview } from "@/types";
import type { ServiceWithTemplate, ServiceDoc, AdminUser, ServiceAuditEntry, DocumentUpdateRequest } from "./page";
import { AdminApplicationSectionsProvider } from "@/components/admin/AdminApplicationSections";

// ─── Document category helpers ────────────────────────────────────────────────

const KYC_DOC_CATEGORIES = ["identity", "financial", "compliance"] as const;
const isKycDoc = (category: string | null | undefined): boolean =>
  (KYC_DOC_CATEGORIES as readonly string[]).includes(category ?? "");

// ─── Section field matchers (mirrors ServiceWizard STEP_SECTION_MATCH) ────────

const SECTION_MATCHERS: Record<string, (section: string | undefined) => boolean> = {
  company_setup: (s) => !s || s === "Details" || /company\s*setup/i.test(s) || /company/i.test(s),
  financial:     (s) => !!s && /financial|finance/i.test(s),
  banking:       (s) => !!s && /bank/i.test(s),
};

function getFieldsForSection(key: string, fields: ServiceField[]): ServiceField[] {
  const matcher = SECTION_MATCHERS[key];
  if (!matcher) return [];
  return fields.filter((f) => matcher(f.section));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RagStatus = "green" | "amber" | "red";

type KycFull = {
  completion_status?: string;
  kyc_journey_completed?: boolean;
  date_of_birth?: string | null;
  nationality?: string | null;
  passport_number?: string | null;
  passport_expiry?: string | null;
  occupation?: string | null;
  address?: string | null;
  source_of_funds_description?: string | null;
  source_of_wealth_description?: string | null;
  is_pep?: boolean | null;
  legal_issues_declared?: boolean | null;
  [key: string]: unknown;
};

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
    client_profile_kyc: KycFull[] | null;
  } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RAG_DOT: Record<RagStatus, string> = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

function ragFromPct(pct: number): RagStatus {
  if (pct >= 100) return "green";
  if (pct > 0) return "amber";
  return "red";
}

function statusBadgeClass(status: string): string {
  const map: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-50 text-blue-700",
    submitted: "bg-indigo-50 text-indigo-700",
    in_review: "bg-amber-50 text-amber-700",
    pending_action: "bg-orange-50 text-orange-700",
    verification: "bg-purple-50 text-purple-700",
    approved: "bg-green-50 text-green-700",
    rejected: "bg-red-50 text-red-700",
  };
  return map[status] ?? "bg-gray-100 text-gray-600";
}

function calcKycPct(kyc: KycFull | null): number {
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function AddProfileDialog({
  serviceId,
  allProfiles,
  existingRoles,
  onAdded,
  defaultRole = "director",
  trigger,
}: {
  serviceId: string;
  allProfiles: ClientProfile[];
  existingRoles: RoleWithProfile[];
  onAdded: (newProfileId?: string) => void;
  defaultRole?: "director" | "shareholder" | "ubo" | "other";
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newType, setNewType] = useState<"individual" | "organisation">("individual");
  const [saving, setSaving] = useState(false);

  const roleTitle = defaultRole === "ubo" ? "UBO" : defaultRole.charAt(0).toUpperCase() + defaultRole.slice(1);

  // Map profile_id → roles already on this service
  const profileRoleMap = new Map<string, string[]>();
  for (const r of existingRoles) {
    const pid = r.client_profiles?.id;
    if (pid) {
      const arr = profileRoleMap.get(pid) ?? [];
      if (!arr.includes(r.role)) arr.push(r.role);
      profileRoleMap.set(pid, arr);
    }
  }

  const filteredProfiles = allProfiles.filter(
    (p) =>
      search === "" ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setSearch("");
      setSelected(null);
      setNewName("");
      setNewEmail("");
      setNewType("individual");
    }
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const body = selected
        ? { client_profile_id: selected.id, role: defaultRole }
        : { full_name: newName.trim(), email: newEmail.trim() || null, record_type: newType, role: defaultRole };

      const res = await fetch(`/api/admin/services/${serviceId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; client_profile_id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const name = selected ? selected.full_name : newName.trim();
      toast.success(`${name} added as ${roleTitle}`, { position: "top-right" });
      handleOpenChange(false);
      const newId = selected?.id ?? data.client_profile_id;
      onAdded(newId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add profile", { position: "top-right" });
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = !saving && (selected !== null || newName.trim().length > 0);

  return (
    <>
      <div onClick={() => setOpen(true)}>{trigger ?? (
        <Button size="sm" variant="outline" className="gap-1.5">
          <Plus className="h-3.5 w-3.5" />
          Add {roleTitle}
        </Button>
      )}</div>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add {roleTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 mt-1">
            {/* Search existing profiles */}
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Search existing profiles</p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
              <div className="mt-2 max-h-44 overflow-y-auto border rounded-lg divide-y">
                {filteredProfiles.length === 0 ? (
                  <p className="text-xs text-gray-400 py-3 text-center">No profiles found</p>
                ) : filteredProfiles.map((p) => {
                  const currentRoles = profileRoleMap.get(p.id) ?? [];
                  const isLinked = currentRoles.length > 0;
                  const isSelected = selected?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={isLinked}
                      onClick={() => !isLinked && setSelected(isSelected ? null : p)}
                      className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${
                        isLinked
                          ? "opacity-50 cursor-not-allowed bg-gray-50"
                          : isSelected
                          ? "bg-blue-50 border-l-2 border-brand-blue cursor-pointer"
                          : "hover:bg-gray-50 cursor-pointer"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${isLinked ? "text-gray-400" : "text-gray-900"}`}>
                          {p.full_name}
                        </p>
                        {p.email && <p className="text-xs text-gray-400 truncate">{p.email}</p>}
                      </div>
                      {isLinked && currentRoles.length > 0 && (
                        <div className="flex gap-1 shrink-0 ml-2">
                          {currentRoles.map((r) => (
                            <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 capitalize">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                      {isSelected && (
                        <span className="text-[11px] text-brand-blue font-medium shrink-0 ml-2">✓ Selected</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">Or create new</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Create new */}
            <div className="space-y-3">
              <div className="flex gap-4">
                {(["individual", "organisation"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="new_record_type"
                      value={t}
                      checked={newType === t}
                      onChange={() => { setNewType(t); setSelected(null); }}
                    />
                    <span className="text-sm text-gray-700">{t === "organisation" ? "Corporation" : "Individual"}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">
                  {newType === "organisation" ? "Corporation name" : "Full name"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setSelected(null); }}
                  placeholder={newType === "organisation" ? "Acme Corp Ltd" : "Jane Smith"}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Email address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => { setNewEmail(e.target.value); setSelected(null); }}
                  placeholder="jane@example.com"
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" />}>Cancel</DialogClose>
            <Button
              size="sm"
              className="bg-brand-navy hover:bg-brand-blue"
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Add {roleTitle}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── KYC document slot (per-person document upload inside KYC sections) ──────

function KycDocSlot({
  docTypeName,
  docTypeId,
  profileId,
  serviceId,
  existing,
  onUploaded,
}: {
  docTypeName: string;
  docTypeId: string;
  profileId: string;
  serviceId: string;
  existing: ServiceDoc | null;
  onUploaded: (doc: ServiceDoc) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentTypeId", docTypeId);
      fd.append("clientProfileId", profileId);
      const res = await fetch(`/api/admin/services/${serviceId}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { document?: ServiceDoc; error?: string };
      if (!res.ok || !data.document) throw new Error(data.error ?? "Upload failed");
      onUploaded(data.document as ServiceDoc);
      toast.success("Document uploaded", { position: "top-right" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed", { position: "top-right" });
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center justify-between py-1.5 border-b last:border-0">
      <div className="flex items-center gap-2 min-w-0">
        <FileText className="h-3.5 w-3.5 text-gray-400 shrink-0" />
        <span className="text-xs text-gray-700 truncate">{docTypeName}</span>
        {existing && (
          <VerificationBadge status={existing.verification_status as VerificationStatus} />
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0 ml-2">
        {existing ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1.5 text-xs gap-0.5"
              onClick={() => setPreviewOpen(true)}
            >
              <Eye className="h-3 w-3" />
            </Button>
            <label className="cursor-pointer text-[10px] text-gray-400 hover:text-gray-600 px-1">
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleUpload(f);
                  e.target.value = "";
                }}
              />
              Replace
            </label>
          </>
        ) : (
          <label className={`cursor-pointer ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            <input
              type="file"
              className="sr-only"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
              disabled={uploading}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleUpload(f);
                e.target.value = "";
              }}
            />
            <span className="inline-flex items-center gap-1 border rounded px-2 py-0.5 text-xs text-gray-600 hover:bg-gray-50 transition-colors">
              {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
              Upload
            </span>
          </label>
        )}
      </div>
      {existing && (
        <DocumentPreviewDialog
          documentId={existing.id}
          fileName={existing.file_name ?? "Document"}
          mimeType={existing.mime_type ?? "application/octet-stream"}
          open={previewOpen}
          onOpenChange={setPreviewOpen}
        />
      )}
    </div>
  );
}

type KycField = { key: string; label: string; type: string; options?: { value: string; label: string }[] };
type KycSection = { title: string; fields: KycField[] };

// KYC section fields — Individual
const KYC_SECTIONS: KycSection[] = [
  {
    title: "Your Identity",
    fields: [
      { key: "full_name", label: "Full legal name", type: "text" },
      { key: "aliases", label: "Aliases / other names", type: "text" },
      { key: "date_of_birth", label: "Date of birth", type: "date" },
      { key: "nationality", label: "Nationality", type: "text" },
      { key: "passport_country", label: "Passport country", type: "text" },
      { key: "passport_number", label: "Passport number", type: "text" },
      { key: "passport_expiry", label: "Passport expiry date", type: "date" },
      { key: "address", label: "Residential address", type: "textarea" },
      { key: "email", label: "Email address", type: "text" },
      { key: "phone", label: "Phone number", type: "text" },
    ],
  },
  {
    title: "Financial",
    fields: [
      { key: "source_of_funds_description", label: "Source of funds", type: "textarea" },
      { key: "source_of_wealth_description", label: "Source of wealth", type: "textarea" },
      { key: "tax_identification_number", label: "Tax identification number", type: "text" },
    ],
  },
  {
    title: "Declarations",
    fields: [
      { key: "is_pep", label: "Politically Exposed Person (PEP)", type: "boolean" },
      { key: "pep_details", label: "PEP details", type: "textarea" },
      { key: "legal_issues_declared", label: "Legal issues declared", type: "boolean" },
      { key: "legal_issues_details", label: "Legal issue details", type: "textarea" },
    ],
  },
  {
    title: "Work / Professional Details",
    fields: [
      { key: "occupation", label: "Occupation", type: "text" },
      { key: "work_address", label: "Work address", type: "textarea" },
      { key: "work_email", label: "Work email", type: "text" },
      { key: "work_phone", label: "Work phone", type: "text" },
    ],
  },
];

// KYC section fields — Organisation / Corporation
const KYC_SECTIONS_ORG: KycSection[] = [
  {
    title: "Company Details",
    fields: [
      { key: "full_name", label: "Company name", type: "text" },
      { key: "company_registration_number", label: "Registration number", type: "text" },
      { key: "jurisdiction_incorporated", label: "Jurisdiction incorporated", type: "text" },
      { key: "date_of_incorporation", label: "Date of incorporation", type: "date" },
      { key: "description_activity", label: "Description of activity", type: "textarea" },
      { key: "industry_sector", label: "Industry sector", type: "text" },
      {
        key: "listed_or_unlisted",
        label: "Listed / Unlisted",
        type: "select",
        options: [
          { value: "listed", label: "Listed" },
          { value: "unlisted", label: "Unlisted" },
        ],
      },
    ],
  },
  {
    title: "Tax / Financial",
    fields: [
      { key: "jurisdiction_tax_residence", label: "Jurisdiction of tax residence", type: "text" },
      { key: "tax_identification_number", label: "Tax identification number", type: "text" },
      { key: "regulatory_licenses", label: "Regulatory licenses", type: "textarea" },
    ],
  },
];

function KycLongForm({
  kyc,
  profileName,
  profileEmail,
  profilePhone,
  profileId,
  serviceId,
  profileDocuments,
  documentTypes,
  recordType,
  onSaved,
  onDocUploaded,
}: {
  kyc: KycFull;
  profileName?: string | null;
  profileEmail?: string | null;
  profilePhone?: string | null;
  profileId?: string;
  serviceId?: string;
  profileDocuments?: ServiceDoc[];
  documentTypes?: DocumentType[];
  recordType?: string;
  onSaved: () => void;
  onDocUploaded?: (doc: ServiceDoc) => void;
}) {
  const isOrg = recordType === "organisation";
  const sections = isOrg ? KYC_SECTIONS_ORG : KYC_SECTIONS;

  const [fields, setFields] = useState<Record<string, unknown>>({
    ...kyc,
    full_name: profileName ?? kyc.full_name ?? "",
    email: profileEmail ?? kyc.email ?? "",
    phone: profilePhone ?? kyc.phone ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(sections.map(s => s.title)));
  const [localDocs, setLocalDocs] = useState<ServiceDoc[]>(profileDocuments ?? []);

  // KYC-category doc types for this person's doc slots
  const kycDocTypes = (documentTypes ?? []).filter((dt) => isKycDoc(dt.category));

  function handleDocUploaded(doc: ServiceDoc) {
    setLocalDocs(prev => {
      const without = prev.filter(d => d.document_type_id !== doc.document_type_id);
      return [...without, doc];
    });
    onDocUploaded?.(doc);
  }

  function toggleSection(title: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  }

  function sectionPct(section: KycSection): number {
    const filled = section.fields.filter(f => {
      const v = fields[f.key];
      return v !== null && v !== undefined && v !== "";
    }).length;
    return Math.round((filled / section.fields.length) * 100);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const kycId = kyc.id as string;
      if (!kycId) throw new Error("No KYC record ID");
      const res = await fetch("/api/profiles/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId: kycId, fields }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      toast.success("KYC saved", { position: "top-right" });
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save", { position: "top-right" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 mt-3">
      {sections.map(section => {
        const pct = sectionPct(section);
        const isOpen = openSections.has(section.title);
        return (
          <div key={section.title} className="border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection(section.title)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-red-400"}`} />
                <span className="text-sm font-medium text-brand-navy">{section.title}</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-[10px] text-gray-500 tabular-nums w-8">{pct}%</span>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
            </button>
            {isOpen && (
              <div className="px-4 py-3 space-y-3">
                {section.fields.map(f => (
                  <div key={f.key}>
                    <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                    {f.type === "textarea" ? (
                      <textarea
                        value={(fields[f.key] as string | null) ?? ""}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                        rows={2}
                        className="w-full border rounded-lg px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue"
                      />
                    ) : f.type === "boolean" ? (
                      <select
                        value={fields[f.key] === true ? "yes" : fields[f.key] === false ? "no" : ""}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value === "yes" ? true : e.target.value === "no" ? false : null }))}
                        className="border rounded-lg px-3 py-2 text-sm w-full"
                      >
                        <option value="">— Select —</option>
                        <option value="yes">Yes</option>
                        <option value="no">No</option>
                      </select>
                    ) : f.type === "select" ? (
                      <select
                        value={(fields[f.key] as string | null) ?? ""}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value || null }))}
                        className="border rounded-lg px-3 py-2 text-sm w-full"
                      >
                        <option value="">— Select —</option>
                        {(f.options ?? []).map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : f.type === "date" ? (
                      <input
                        type="date"
                        value={(fields[f.key] as string | null) ?? ""}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value || null }))}
                        className="border rounded-lg px-3 py-2 text-sm w-full"
                      />
                    ) : (
                      <input
                        type="text"
                        value={(fields[f.key] as string | null) ?? ""}
                        onChange={e => setFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                      />
                    )}
                  </div>
                ))}
                {/* KYC document slots — shown in first section */}
                {(section.title === "Your Identity" || section.title === "Company Details") && profileId && serviceId && kycDocTypes.length > 0 && (
                  <div className="mt-1 pt-2 border-t">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Documents</p>
                    <div className="space-y-0">
                      {kycDocTypes.map(dt => (
                        <KycDocSlot
                          key={dt.id}
                          docTypeName={dt.name}
                          docTypeId={dt.id}
                          profileId={profileId}
                          serviceId={serviceId}
                          existing={localDocs.find(d => d.document_type_id === dt.id) ?? null}
                          onUploaded={handleDocUploaded}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
      <div className="flex justify-end pt-2">
        <Button size="sm" onClick={() => void handleSave()} disabled={saving} className="bg-brand-navy hover:bg-brand-blue">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
          Save KYC
        </Button>
      </div>
    </div>
  );
}

// ─── Ownership Structure ──────────────────────────────────────────────────────

function OwnershipStructure({
  shareholders,
  serviceId,
  onSaved,
}: {
  shareholders: RoleWithProfile[];
  serviceId: string;
  onSaved: () => void;
}) {
  const initialPcts = Object.fromEntries(
    shareholders.map((r) => [r.id, r.shareholding_percentage ?? 0])
  );
  const [pcts, setPcts] = useState<Record<string, number>>(initialPcts);
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);

  const total = Object.values(pcts).reduce((s, v) => s + (v || 0), 0);
  const isValid = Math.abs(total - 100) < 0.01;
  const unallocated = Math.max(0, 100 - total);

  // Keep in sync if shareholders change (e.g. after refresh)
  useEffect(() => {
    setPcts(Object.fromEntries(shareholders.map((r) => [r.id, r.shareholding_percentage ?? 0])));
  }, [shareholders]);

  // Default open if total ≠ 100
  useEffect(() => {
    if (!isValid) setOpen(true);
  }, [isValid]);

  if (shareholders.length === 0) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all(
        shareholders.map((r) =>
          fetch(`/api/admin/services/${serviceId}/roles/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shareholding_percentage: pcts[r.id] ?? 0 }),
          })
        )
      );
      toast.success("Ownership saved", { position: "top-right" });
      onSaved();
    } catch {
      toast.error("Failed to save ownership", { position: "top-right" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
          <span className="text-sm font-medium text-brand-navy">Ownership Structure</span>
          {!isValid && (
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              ⚠ must total 100%
            </span>
          )}
        </div>
        <span className={`text-xs font-medium tabular-nums ${isValid ? "text-green-600" : "text-amber-600"}`}>
          {total.toFixed(total % 1 === 0 ? 0 : 1)}% / 100%
        </span>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-2.5">
          {!isValid && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Shareholding must total 100% ({total.toFixed(1)}% assigned)
            </div>
          )}

          {shareholders.map((r) => {
            const pct = pcts[r.id] ?? 0;
            return (
              <div key={r.id} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-36 truncate shrink-0">
                  {r.client_profiles?.full_name ?? "Unknown"}
                </span>
                <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={pct}
                    onChange={(e) => setPcts((prev) => ({ ...prev, [r.id]: parseFloat(e.target.value) || 0 }))}
                    className="w-16 border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              </div>
            );
          })}

          {unallocated > 0.01 && (
            <div className="flex items-center gap-3 opacity-50">
              <span className="text-sm text-gray-400 w-36 italic shrink-0">Unallocated</span>
              <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full rounded-full bg-gray-300" style={{ width: `${Math.min(unallocated, 100)}%` }} />
              </div>
              <span className="text-xs text-gray-400 w-16 text-right tabular-nums">{unallocated.toFixed(1)}%</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t mt-1">
            <span className={`text-xs font-medium ${isValid ? "text-green-600" : "text-amber-700"}`}>
              Total: {total.toFixed(total % 1 === 0 ? 0 : 1)}%
            </span>
            <Button
              size="sm"
              className="h-7 px-3 text-xs bg-brand-navy hover:bg-brand-blue"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save Ownership
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Admin KYC Doc List Panel ─────────────────────────────────────────────────

function AdminKycDocListPanel({
  profileId,
  profileName,
  profileEmail,
  serviceId,
  profileDocuments,
  documentTypes,
  updateRequests,
  onRefresh,
}: {
  profileId: string;
  profileName: string | null;
  profileEmail: string | null;
  serviceId: string;
  profileDocuments: ServiceDoc[];
  documentTypes: DocumentType[];
  updateRequests: DocumentUpdateRequest[];
  onRefresh: () => void;
}) {
  const [detailDoc, setDetailDoc] = useState<DocumentDetailDoc | null>(null);
  const [uploadingTypeId, setUploadingTypeId] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadTypeId, setPendingUploadTypeId] = useState<string | null>(null);

  const kycDocTypes = documentTypes.filter((dt) => isKycDoc(dt.category));
  const profileDocs = profileDocuments.filter((d) => d.client_profile_id === profileId);

  function getUploaded(dtId: string) {
    return profileDocs.find((d) => d.document_type_id === dtId);
  }

  async function handleUpload(dtId: string, file: File) {
    setUploadingTypeId(dtId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentTypeId", dtId);
      fd.append("clientProfileId", profileId);
      const res = await fetch(`/api/services/${serviceId}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { document?: unknown; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast.success("Document uploaded", { position: "top-right" });
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingTypeId(null);
    }
  }

  const recipients = [
    { id: profileId, name: profileName ?? "Document owner", email: profileEmail, label: "Document owner" },
  ];

  const uploadedCount = kycDocTypes.filter((dt) => getUploaded(dt.id)).length;

  return (
    <>
      <div className="overflow-y-auto" style={{ maxHeight: 240 }}>
        {kycDocTypes.map((dt) => {
          const uploaded = getUploaded(dt.id);
          const isUploading = uploadingTypeId === dt.id;
          const aiStatus = uploaded?.verification_status;
          const adminStatus = uploaded?.admin_status;
          // Green only when admin has approved. Uploaded-but-unreviewed = neutral.
          const isApproved = uploaded && adminStatus === "approved";

          return (
            <div key={dt.id} className="flex items-center justify-between py-1.5 border-b last:border-0 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {!uploaded && <Square className="h-3.5 w-3.5 text-gray-300 shrink-0" />}
                {uploaded && !isApproved && <CheckSquare className="h-3.5 w-3.5 text-gray-500 shrink-0" />}
                {isApproved && <CheckSquare className="h-3.5 w-3.5 text-green-500 shrink-0" />}
                <span className="text-xs text-gray-700 truncate">{dt.name}</span>
                {uploaded && (
                  <DocumentStatusBadge
                    aiStatus={aiStatus}
                    adminStatus={adminStatus}
                    compact
                    className="shrink-0"
                  />
                )}
              </div>
              <div className="shrink-0">
                {uploaded ? (
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => setDetailDoc({
                      id: uploaded.id,
                      file_name: uploaded.file_name,
                      mime_type: uploaded.mime_type,
                      uploaded_at: uploaded.uploaded_at,
                      document_type_id: uploaded.document_type_id,
                      verification_status: uploaded.verification_status,
                      verification_result: uploaded.verification_result,
                      admin_status: uploaded.admin_status,
                      admin_status_note: uploaded.admin_status_note,
                      admin_status_at: uploaded.admin_status_at,
                      document_types: uploaded.document_types,
                      client_profiles: uploaded.client_profiles,
                    })}
                  >
                    <Eye className="h-3.5 w-3.5 text-gray-400" />
                  </Button>
                ) : (
                  <Button
                    size="sm" variant="outline"
                    className="h-6 px-2 text-[10px] gap-1"
                    disabled={isUploading}
                    onClick={() => {
                      setPendingUploadTypeId(dt.id);
                      uploadInputRef.current?.click();
                    }}
                  >
                    {isUploading
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : <><Upload className="h-3 w-3" />Upload</>
                    }
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-gray-400 pt-1">{uploadedCount} of {kycDocTypes.length} uploaded</p>

      {/* Hidden file input */}
      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && pendingUploadTypeId) void handleUpload(pendingUploadTypeId, file);
          e.target.value = "";
          setPendingUploadTypeId(null);
        }}
      />

      {/* Document detail dialog */}
      {detailDoc && (
        <DocumentDetailDialog
          doc={detailDoc}
          isAdmin={true}
          open={!!detailDoc}
          onOpenChange={(open) => { if (!open) { setDetailDoc(null); onRefresh(); } }}
          serviceId={serviceId}
          recipients={recipients}
          updateRequests={updateRequests.filter((r) => r.document_id === detailDoc.id)}
          onStatusChange={() => onRefresh()}
          onRequestSent={() => onRefresh()}
        />
      )}
    </>
  );
}

// ─── Person Card ──────────────────────────────────────────────────────────────

function PersonCard({
  roleRow,
  allRoleRows,
  combinedRoles,
  serviceId,
  profileDocuments,
  documentTypes,
  updateRequests,
  defaultExpanded,
  onRefresh,
}: {
  roleRow: RoleWithProfile;
  allRoleRows: RoleWithProfile[];
  combinedRoles?: string[];
  serviceId: string;
  profileDocuments?: ServiceDoc[];
  documentTypes?: DocumentType[];
  updateRequests?: DocumentUpdateRequest[];
  defaultExpanded?: boolean;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteSentAt, setInviteSentAt] = useState<string | null>(roleRow.invite_sent_at ?? null);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [addRoleValue, setAddRoleValue] = useState<"director" | "shareholder" | "ubo" | "other">("director");
  const [addSharePct, setAddSharePct] = useState("");
  const [addingRole, setAddingRole] = useState(false);
  const [removingRoleId, setRemovingRoleId] = useState<string | null>(null);

  if (!roleRow.client_profiles) return null;
  const profile = roleRow.client_profiles;

  const kyc = Array.isArray(profile.client_profile_kyc)
    ? profile.client_profile_kyc[0] ?? null
    : (profile.client_profile_kyc as KycFull | null);
  const kycPct = calcKycPct(kyc);
  const kycDone = kyc?.kyc_journey_completed === true;

  const sentDate = inviteSentAt
    ? new Date(inviteSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const roleLabels = (combinedRoles ?? [roleRow.role]).join(", ");

  // Roles not yet assigned to this person
  const assignedRoles = new Set(allRoleRows.map((r) => r.role));
  const availableRolesToAdd = (["director", "shareholder", "ubo", "other"] as const).filter(
    (r) => !assignedRoles.has(r)
  );

  function openEditProfile() {
    setEditName(profile.full_name ?? "");
    setEditEmail(profile.email ?? "");
    setEditPhone(profile.phone ?? "");
    setShowEditProfile(true);
  }

  async function handleSaveProfile() {
    setSavingProfile(true);
    try {
      const res = await fetch(`/api/admin/profiles-v2/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: editName.trim() || undefined,
          email: editEmail.trim() || null,
          phone: editPhone.trim() || null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success("Profile saved", { position: "top-right" });
      setShowEditProfile(false);
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save", { position: "top-right" });
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleRemoveRole(roleId: string, isLastRole: boolean) {
    if (isLastRole) {
      if (!confirm(`Remove ${profile.full_name} from this service?`)) return;
    }
    setRemovingRoleId(roleId);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/roles/${roleId}`, { method: "DELETE" });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(isLastRole ? `${profile.full_name} removed` : "Role removed", { position: "top-right" });
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove", { position: "top-right" });
    } finally {
      setRemovingRoleId(null);
    }
  }

  async function handleAddRole() {
    setAddingRole(true);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_profile_id: profile.id,
          role: addRoleValue,
          shareholding_percentage: addRoleValue === "shareholder" && addSharePct ? parseFloat(addSharePct) : null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(`${addRoleValue} role added`, { position: "top-right" });
      setAddSharePct("");
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add role", { position: "top-right" });
    } finally {
      setAddingRole(false);
    }
  }

  async function toggleManage() {
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/roles/${roleRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ can_manage: !roleRow.can_manage }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(roleRow.can_manage ? "Portal access removed" : "Portal access granted", { position: "top-right" });
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update", { position: "top-right" });
    }
  }

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* ── Clickable header ─────────────────────────────────────────── */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50/70 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0 space-y-1.5">
            {/* Name + type icon + role badges */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {profile.is_representative ? (
                <Users2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
              ) : profile.record_type === "organisation" ? (
                <Building2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
              ) : (
                <UserCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              )}
              <span className="text-sm font-medium text-brand-navy truncate">
                {profile.full_name}
              </span>
              {(combinedRoles ?? [roleRow.role]).map((r) => (
                <span key={r} className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-brand-navy/10 text-brand-navy shrink-0">
                  {r}
                </span>
              ))}
            </div>

            {/* KYC progress */}
            {!profile.is_representative && (
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${kycDone ? "bg-green-500" : kycPct > 0 ? "bg-amber-400" : "bg-red-400"}`}
                    style={{ width: `${kycPct}%` }}
                  />
                </div>
                <span className={`text-[11px] font-medium tabular-nums ${kycDone ? "text-green-600" : kycPct > 0 ? "text-amber-600" : "text-red-500"}`}>
                  {kycDone ? "✓ Complete" : `KYC: ${kycPct}%`}
                </span>
              </div>
            )}

            {/* Quick actions */}
            <div className="flex items-center flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => void toggleManage()}
                className={`flex items-center gap-1 text-xs rounded px-2 py-1 transition-colors ${
                  roleRow.can_manage ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {roleRow.can_manage ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                Portal access
              </button>
              {!profile.is_representative && (
                <Button size="sm" variant="outline" onClick={() => setShowInviteDialog(true)} className="h-6 text-xs gap-1">
                  <Mail className="h-3 w-3" />
                  {inviteSentAt ? "Resend KYC" : "Request KYC"}
                </Button>
              )}
              {inviteSentAt && sentDate && (
                <span className="text-[11px] text-green-600 flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  Sent {sentDate}
                </span>
              )}
            </div>
          </div>

          {!profile.is_representative && kyc && (
            <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform shrink-0 mt-1 ${expanded ? "rotate-180" : ""}`} />
          )}
        </div>
      </div>

      {/* ── Expanded body ────────────────────────────────────────────── */}
      {expanded && (
        <div className="border-t" onClick={(e) => e.stopPropagation()}>

          {/* Split top section: Profile+Roles (left) | KYC Docs (right) */}
          <div className="grid grid-cols-2 gap-4 px-4 py-4 border-b">
            {/* Left: Profile edit + Roles */}
            <div className="space-y-3">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Profile</p>
              {!showEditProfile ? (
                <button onClick={openEditProfile} className="text-xs text-brand-blue hover:underline">✏ Edit email / phone</button>
              ) : (
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-gray-500 font-medium">Full name</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 font-medium">Email</label>
                    <input
                      type="email"
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue mt-0.5"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-gray-500 font-medium">Phone</label>
                    <input
                      type="text"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-brand-blue mt-0.5"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 px-3 text-xs bg-brand-navy hover:bg-brand-blue" disabled={savingProfile} onClick={() => void handleSaveProfile()}>
                      {savingProfile ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}Save
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-3 text-xs" onClick={() => setShowEditProfile(false)}>Cancel</Button>
                  </div>
                </div>
              )}

              <div className="border-t pt-2 space-y-1.5">
                <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Roles</p>
                {allRoleRows.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm capitalize text-gray-700">{r.role}</span>
                      {r.shareholding_percentage != null && (
                        <span className="text-xs text-gray-400">({r.shareholding_percentage}%)</span>
                      )}
                    </div>
                    <button
                      disabled={removingRoleId === r.id}
                      onClick={() => void handleRemoveRole(r.id, allRoleRows.length === 1)}
                      className="text-xs text-gray-400 hover:text-red-500 transition-colors disabled:opacity-40"
                    >
                      {removingRoleId === r.id ? <Loader2 className="h-3 w-3 animate-spin inline" /> : "Remove"}
                    </button>
                  </div>
                ))}
                {availableRolesToAdd.length > 0 && (
                  <div className="flex items-center gap-2 pt-1 border-t mt-1">
                    <select
                      value={availableRolesToAdd.includes(addRoleValue) ? addRoleValue : (availableRolesToAdd[0] ?? addRoleValue)}
                      onChange={(e) => setAddRoleValue(e.target.value as typeof addRoleValue)}
                      className="border rounded px-2 py-1 text-xs flex-1"
                    >
                      {availableRolesToAdd.map((r) => (
                        <option key={r} value={r} className="capitalize">{r === "ubo" ? "UBO" : r.charAt(0).toUpperCase() + r.slice(1)}</option>
                      ))}
                    </select>
                    {addRoleValue === "shareholder" && (
                      <input type="number" min={0} max={100} value={addSharePct} onChange={(e) => setAddSharePct(e.target.value)} placeholder="%" className="border rounded px-2 py-1 text-xs w-14" />
                    )}
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={addingRole} onClick={() => void handleAddRole()}>
                      {addingRole ? <Loader2 className="h-3 w-3 animate-spin" /> : "+ Add"}
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Right: KYC documents list */}
            <div>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-2">KYC Documents</p>
              <AdminKycDocListPanel
                profileId={profile.id}
                profileName={profile.full_name}
                profileEmail={profile.email ?? null}
                serviceId={serviceId}
                profileDocuments={profileDocuments ?? []}
                documentTypes={documentTypes ?? []}
                updateRequests={updateRequests ?? []}
                onRefresh={onRefresh}
              />
            </div>
          </div>

          {/* KYC form (below split section) */}
          {kyc && (
            <div className="px-4 pb-4 pt-3">
              <KycLongForm
                kyc={kyc}
                profileName={profile.full_name}
                profileEmail={profile.email}
                profilePhone={profile.phone}
                profileId={profile.id}
                serviceId={serviceId}
                profileDocuments={profileDocuments}
                documentTypes={documentTypes}
                recordType={profile.record_type}
                onSaved={onRefresh}
                onDocUploaded={onRefresh}
              />
            </div>
          )}
        </div>
      )}

      {/* Invite dialog */}
      {showInviteDialog && (
        <InviteKycDialog
          serviceId={serviceId}
          roleId={roleRow.id}
          personName={profile.full_name}
          personEmail={profile.email}
          roleLabel={roleLabels}
          onClose={() => setShowInviteDialog(false)}
          onSent={(sentAt) => setInviteSentAt(sentAt)}
        />
      )}
    </div>
  );
}

// ─── Admin Documents Section ──────────────────────────────────────────────────

function verificationStatusBadge(status: string) {
  const map: Record<string, string> = {
    verified: "bg-green-50 text-green-700 border-green-200",
    flagged: "bg-amber-50 text-amber-700 border-amber-200",
    rejected: "bg-red-50 text-red-700 border-red-200",
    manual_review: "bg-purple-50 text-purple-700 border-purple-200",
    pending: "bg-gray-100 text-gray-500 border-gray-200",
  };
  const cls = map[status] ?? map.pending;
  const icon = status === "verified" ? "✓" : status === "flagged" ? "⚠" : status === "rejected" ? "✗" : "○";
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border capitalize ${cls}`}>
      {icon} {status.replace(/_/g, " ")}
    </span>
  );
}

function adminStatusBadge(status: string | null) {
  if (status === "approved") return <span className="text-[10px] text-green-700 font-medium">✓ Approved</span>;
  if (status === "rejected") return <span className="text-[10px] text-red-700 font-medium">✗ Rejected</span>;
  return <span className="text-[10px] text-gray-400">○ Pending review</span>;
}

function formatShortDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function RichDocumentCard({
  doc,
  serviceId,
  requests,
  recipients,
  onUpdateRequestAdded,
}: {
  doc: ServiceDoc;
  serviceId: string;
  requests: DocumentUpdateRequest[];
  recipients: Array<{ id: string; name: string; email: string | null; label: string }>;
  onUpdateRequestAdded: (req: DocumentUpdateRequest) => void;
}) {
  const [previewOpen, setPreviewOpen] = useState(false);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminStatus, setAdminStatus] = useState(doc.admin_status);
  const [adminStatusNote, setAdminStatusNote] = useState(doc.admin_status_note);
  const [adminStatusAt, setAdminStatusAt] = useState(doc.admin_status_at);
  const [extractedOpen, setExtractedOpen] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadLoading, setDownloadLoading] = useState(false);

  const verResult = doc.verification_result as VerificationResult | null;
  const flags = verResult?.flags ?? [];
  const ruleResults = verResult?.rule_results ?? [];
  const extractedFields = verResult?.extracted_fields ?? {};
  const confidence = verResult?.confidence_score;
  const passedRules = ruleResults.filter((r) => r.passed).length;
  const typeName = doc.document_types?.name ?? "Document";

  async function handleApprove() {
    setAdminSaving(true);
    try {
      const res = await fetch(`/api/admin/documents/library/${doc.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "approved" }),
      });
      if (!res.ok) throw new Error("Failed");
      setAdminStatus("approved");
      setAdminStatusAt(new Date().toISOString());
    } catch {
      toast.error("Failed to approve");
    } finally {
      setAdminSaving(false);
    }
  }

  async function handleReject() {
    if (!rejectNote.trim()) return;
    setAdminSaving(true);
    try {
      const res = await fetch(`/api/admin/documents/library/${doc.id}/review`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected", note: rejectNote.trim() }),
      });
      if (!res.ok) throw new Error("Failed");
      setAdminStatus("rejected");
      setAdminStatusNote(rejectNote.trim());
      setAdminStatusAt(new Date().toISOString());
      setShowRejectForm(false);
      setRejectNote("");
    } catch {
      toast.error("Failed to reject");
    } finally {
      setAdminSaving(false);
    }
  }

  async function fetchDownloadUrl() {
    if (downloadUrl) return downloadUrl;
    setDownloadLoading(true);
    try {
      const res = await fetch(`/api/documents/${doc.id}/download`);
      const data = (await res.json()) as { url?: string };
      const url = data.url ?? null;
      setDownloadUrl(url);
      return url;
    } catch {
      return null;
    } finally {
      setDownloadLoading(false);
    }
  }

  async function handleDownload() {
    const url = await fetchDownloadUrl();
    if (url) {
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.file_name ?? "document";
      a.target = "_blank";
      a.click();
    }
  }

  // Most recent request for this doc
  const latestRequest = requests[0] ?? null;
  const hasMoreRequests = requests.length > 1;

  return (
    <div className="border rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <FileText className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium text-brand-navy">{typeName}</span>
              {verificationStatusBadge(doc.verification_status)}
              {adminStatusBadge(adminStatus)}
            </div>
            <p className="text-[11px] text-gray-400">
              Uploaded {formatShortDate(doc.uploaded_at)}
              {doc.client_profiles?.full_name ? ` · ${doc.client_profiles.full_name}` : ""}
            </p>
          </div>
        </div>
      </div>

      {/* AI verification line */}
      {verResult && (
        <div className="px-4 pb-2 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-gray-400 font-medium">AI:</span>
            {confidence !== undefined && (
              <span className="text-xs font-medium text-gray-700">{normalizeConfidence(confidence)}% confidence</span>
            )}
            {ruleResults.length > 0 && (
              <span className={`text-xs font-medium ${passedRules === ruleResults.length ? "text-green-600" : "text-red-600"}`}>
                {passedRules}/{ruleResults.length} rules passed
              </span>
            )}
            {flags.length > 0 && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                {flags.length} flag{flags.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Flags */}
          {flags.length > 0 && (
            <div className="space-y-1">
              {flags.map((flag, i) => (
                <p key={i} className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                  ⚠ {flag}
                </p>
              ))}
            </div>
          )}

          {/* Failed rules */}
          {ruleResults.filter((r) => !r.passed).length > 0 && (
            <div className="space-y-1">
              {ruleResults.filter((r) => !r.passed).map((rr) => (
                <div key={rr.rule_number} className="rounded bg-red-50 border border-red-100 px-2 py-1.5 text-xs space-y-0.5">
                  <p className="font-medium text-red-700">{rr.rule_number}. {rr.rule_text}</p>
                  {rr.explanation && <p className="text-gray-600">{rr.explanation}</p>}
                </div>
              ))}
            </div>
          )}

          {/* Extracted fields (collapsible) */}
          {Object.keys(extractedFields).length > 0 && (
            <div>
              <button
                onClick={() => setExtractedOpen(!extractedOpen)}
                className="text-xs text-brand-blue hover:underline flex items-center gap-1"
              >
                <ChevronDown className={`h-3 w-3 transition-transform ${extractedOpen ? "rotate-180" : ""}`} />
                {extractedOpen ? "Hide" : "Show"} extracted fields
              </button>
              {extractedOpen && (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  {Object.entries(extractedFields).map(([k, v]) => (
                    <div key={k} className="text-[11px]">
                      <span className="text-gray-400 capitalize">{k.replace(/_/g, " ")}:</span>{" "}
                      <span className="text-gray-700 font-medium">{String(v ?? "—")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Admin review + actions */}
      <div className="px-4 pb-3 space-y-2 border-t pt-2">
        {/* Status + approve/reject */}
        {adminStatus === "approved" && (
          <p className="text-xs text-green-700 flex items-center gap-1">
            <CheckCircle className="h-3.5 w-3.5" />
            Approved {formatShortDate(adminStatusAt)}
          </p>
        )}
        {adminStatus === "rejected" && (
          <div className="text-xs text-red-700 space-y-0.5">
            <p className="flex items-center gap-1">
              <XCircle className="h-3.5 w-3.5" />
              Rejected {formatShortDate(adminStatusAt)}
            </p>
            {adminStatusNote && <p className="text-gray-500 ml-5">Reason: {adminStatusNote}</p>}
          </div>
        )}

        {adminStatus !== "approved" && adminStatus !== "rejected" && !showRejectForm && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs text-green-700 border-green-300 hover:bg-green-50 gap-1"
              disabled={adminSaving}
              onClick={() => void handleApprove()}
            >
              <CheckCircle className="h-3 w-3" />
              Approve
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 px-2 text-xs text-red-700 border-red-300 hover:bg-red-50 gap-1"
              disabled={adminSaving}
              onClick={() => setShowRejectForm(true)}
            >
              <XCircle className="h-3 w-3" />
              Reject
            </Button>
          </div>
        )}
        {showRejectForm && (
          <div className="space-y-1.5">
            <textarea
              value={rejectNote}
              onChange={(e) => setRejectNote(e.target.value)}
              placeholder="Rejection reason (required)"
              rows={2}
              className="w-full text-xs border rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-brand-blue"
              autoFocus
            />
            <div className="flex gap-1.5">
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2 text-xs text-red-700 border-red-300 hover:bg-red-50"
                disabled={adminSaving || !rejectNote.trim()}
                onClick={() => void handleReject()}
              >
                Confirm Reject
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => { setShowRejectForm(false); setRejectNote(""); }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Preview / Download / Request Update */}
        <div className="flex items-center gap-1.5 flex-wrap pt-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            onClick={() => setPreviewOpen(true)}
          >
            <Eye className="h-3 w-3" />
            Preview
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1"
            disabled={downloadLoading}
            onClick={() => void handleDownload()}
          >
            {downloadLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
            Download
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs gap-1 text-brand-navy border-brand-navy/30 hover:bg-brand-navy/5"
            onClick={() => setRequestDialogOpen(true)}
            disabled={recipients.length === 0}
          >
            <MessageSquarePlus className="h-3 w-3" />
            Request Update
          </Button>
        </div>

        {/* Latest update request */}
        {latestRequest && (
          <div className="mt-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2 space-y-0.5">
            <p className="text-[11px] text-blue-700 flex items-center gap-1">
              <Mail className="h-3 w-3" />
              Update requested {formatShortDate(latestRequest.sent_at)}
              {latestRequest.requested_by_name ? ` by ${latestRequest.requested_by_name}` : ""}
            </p>
            <p className="text-xs text-gray-600 italic line-clamp-2">&ldquo;{latestRequest.note}&rdquo;</p>
            {hasMoreRequests && (
              <p className="text-[10px] text-blue-500">+{requests.length - 1} more request{requests.length - 1 !== 1 ? "s" : ""}</p>
            )}
          </div>
        )}
      </div>

      {/* Preview dialog */}
      <DocumentPreviewDialog
        documentId={doc.id}
        fileName={doc.file_name ?? "Document"}
        mimeType={doc.mime_type ?? "application/octet-stream"}
        uploadedAt={doc.uploaded_at}
        open={previewOpen}
        onOpenChange={setPreviewOpen}
      />

      {/* Request update dialog */}
      {requestDialogOpen && (
        <DocumentUpdateRequestDialog
          documentId={doc.id}
          documentTypeName={typeName}
          serviceId={serviceId}
          recipients={recipients}
          verificationFlags={flags}
          open={requestDialogOpen}
          onOpenChange={setRequestDialogOpen}
          onSent={onUpdateRequestAdded}
        />
      )}
    </div>
  );
}

function AdminDocumentsSection({
  serviceId,
  documents,
  updateRequests,
  roles,
  requirements,
  onDocumentAdded,
  onUpdateRequestAdded,
  onRefresh,
}: {
  serviceId: string;
  documents: ServiceDoc[];
  updateRequests: DocumentUpdateRequest[];
  roles: RoleWithProfile[];
  requirements: DueDiligenceRequirement[];
  onDocumentAdded: (doc: ServiceDoc) => void;
  onUpdateRequestAdded: (req: DocumentUpdateRequest) => void;
  onRefresh: () => void;
}) {
  const [uploadingTypeId, setUploadingTypeId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Build requests map: document_id → sorted requests
  const requestsByDoc = new Map<string, DocumentUpdateRequest[]>();
  for (const req of updateRequests) {
    const arr = requestsByDoc.get(req.document_id) ?? [];
    arr.push(req);
    requestsByDoc.set(req.document_id, arr);
  }

  // Build recipients for a given doc: owner + representative
  function getRecipients(doc: ServiceDoc) {
    const recipients: Array<{ id: string; name: string; email: string | null; label: string }> = [];
    // Document owner (person with matching client_profile_id)
    if (doc.client_profile_id) {
      const ownerRole = roles.find((r) => r.client_profiles?.id === doc.client_profile_id);
      if (ownerRole?.client_profiles) {
        recipients.push({
          id: ownerRole.client_profiles.id,
          name: ownerRole.client_profiles.full_name,
          email: ownerRole.client_profiles.email,
          label: "Document owner",
        });
      }
    }
    // Representatives (is_representative=true with can_manage)
    for (const r of roles) {
      if (r.client_profiles?.is_representative && r.client_profiles.id !== doc.client_profile_id) {
        const alreadyAdded = recipients.some((rr) => rr.id === r.client_profiles!.id);
        if (!alreadyAdded) {
          recipients.push({
            id: r.client_profiles.id,
            name: r.client_profiles.full_name,
            email: r.client_profiles.email,
            label: "Representative",
          });
        }
      }
    }
    // If no owner found but doc exists, try any can_manage person
    if (recipients.length === 0) {
      const manager = roles.find((r) => r.can_manage && r.client_profiles);
      if (manager?.client_profiles) {
        recipients.push({
          id: manager.client_profiles.id,
          name: manager.client_profiles.full_name,
          email: manager.client_profiles.email,
          label: "Service manager",
        });
      }
    }
    return recipients;
  }

  // Required doc types that haven't been uploaded yet
  const uploadedTypeIds = new Set(documents.map((d) => d.document_type_id).filter(Boolean));
  const missingDocTypes = requirements
    .filter((r) => r.requirement_type === "document" && r.document_type_id && !uploadedTypeIds.has(r.document_type_id))
    .map((r) => ({
      id: r.document_type_id!,
      name: (r.document_types as unknown as { name: string } | null)?.name ?? r.label ?? "Document",
      category: "",
    }));

  // Flagged documents
  const flaggedDocs = documents.filter((d) => {
    const vr = d.verification_result as VerificationResult | null;
    return (vr?.flags?.length ?? 0) > 0 || (vr?.rule_results ?? []).some((r) => !r.passed);
  });

  async function handleMissingDocUpload(typeId: string, file: File) {
    setUploadingTypeId(typeId);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentTypeId", typeId);
      const res = await fetch(`/api/admin/services/${serviceId}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { document?: ServiceDoc; error?: string };
      if (!res.ok || !data.document) throw new Error(data.error ?? "Upload failed");
      onDocumentAdded(data.document as ServiceDoc);
      toast.success("Document uploaded", { position: "top-right" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed", { position: "top-right" });
    } finally {
      setUploadingTypeId(null);
      setUploading(false);
    }
  }

  return (
    <div className="pt-4 space-y-3">
      {/* Uploaded documents */}
      {documents.length === 0 && missingDocTypes.length === 0 && (
        <p className="text-sm text-gray-400">No documents uploaded yet.</p>
      )}

      {documents.map((doc) => (
        <RichDocumentCard
          key={doc.id}
          doc={doc}
          serviceId={serviceId}
          requests={requestsByDoc.get(doc.id) ?? []}
          recipients={getRecipients(doc)}
          onUpdateRequestAdded={(req) => {
            onUpdateRequestAdded(req);
            onRefresh();
          }}
        />
      ))}

      {/* Missing / required docs */}
      {missingDocTypes.map((dt) => (
        <div key={dt.id} className="border rounded-xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <FileText className="h-4 w-4 text-gray-300 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-600">{dt.name}</p>
              <p className="text-[11px] text-gray-400">Required · {dt.category}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] px-1.5 py-0.5 rounded border text-gray-400 border-gray-200">○ Not uploaded</span>
            <label className={`cursor-pointer ${uploading && uploadingTypeId === dt.id ? "opacity-60 pointer-events-none" : ""}`}>
              <input
                type="file"
                className="sr-only"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
                disabled={uploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleMissingDocUpload(dt.id, file);
                  e.target.value = "";
                }}
              />
              <span className="inline-flex items-center gap-1 border rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                {uploading && uploadingTypeId === dt.id ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Upload className="h-3 w-3" />
                )}
                Upload
              </span>
            </label>
          </div>
        </div>
      ))}

      {/* Flagged summary */}
      {flaggedDocs.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm font-medium text-amber-800">
              {flaggedDocs.length} flagged document{flaggedDocs.length !== 1 ? "s" : ""} — requires attention
            </p>
          </div>
          <div className="space-y-1">
            {flaggedDocs.map((d) => {
              const vr = d.verification_result as VerificationResult | null;
              const count = (vr?.flags?.length ?? 0) + (vr?.rule_results ?? []).filter((r) => !r.passed).length;
              return (
                <p key={d.id} className="text-xs text-amber-700">
                  • {d.document_types?.name ?? d.file_name}: {count} flag{count !== 1 ? "s" : ""}
                </p>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Props ───────────────────────────────────────────────────────────────

interface Props {
  service: ServiceWithTemplate;
  roles: ProfileServiceRole[];
  overrides: ServiceSectionOverride[]; // reserved for future RAG override display
  documents: ServiceDoc[];
  updateRequests: DocumentUpdateRequest[];
  allProfiles: ClientProfile[];
  adminUsers: AdminUser[];
  auditEntries: ServiceAuditEntry[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  sectionReviews: ApplicationSectionReview[];
}

const STATUS_OPTIONS = [
  "draft", "in_progress", "submitted", "in_review", "pending_action", "verification", "approved", "rejected",
] as const;

const DD_LEVELS = [
  { value: "sdd", label: "SDD — Simplified" },
  { value: "cdd", label: "CDD — Standard" },
  { value: "edd", label: "EDD — Enhanced" },
] as const;

// ─── Main Component ───────────────────────────────────────────────────────────

export function ServiceDetailClient({
  service: initialService,
  roles: initialRoles,
  overrides: _overrides, // eslint-disable-line @typescript-eslint/no-unused-vars
  documents: initialDocuments,
  updateRequests: initialUpdateRequests,
  allProfiles,
  adminUsers,
  auditEntries,
  requirements,
  documentTypes,
  sectionReviews,
}: Props) {
  const router = useRouter();
  const [service, setService] = useState(initialService);
  const [documents, setDocuments] = useState(initialDocuments);
  const [updateRequests, setUpdateRequests] = useState(initialUpdateRequests);

  // Split documents by category: KYC/profile docs go inside person cards; corporate stays in Documents section
  const profileDocs = documents.filter((d) => isKycDoc(d.document_types?.category));
  const corporateDocs = documents.filter((d) => !isKycDoc(d.document_types?.category));
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>(
    service.service_details ?? {}
  );
  const [pendingChanges, setPendingChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // Milestones with date editing
  const [milestones, setMilestones] = useState({
    loe_received: service.loe_received ?? false,
    loe_received_at: service.loe_received_at ?? null as string | null,
    invoice_sent_at: service.invoice_sent_at ?? null as string | null,
    payment_received_at: service.payment_received_at ?? null as string | null,
  });
  const [savingMilestone, setSavingMilestone] = useState<string | null>(null);

  // Audit trail filters
  const [auditActorFilter, setAuditActorFilter] = useState("all");
  const [auditActionFilter, setAuditActionFilter] = useState("all");

  const typedRoles = (initialRoles as unknown as RoleWithProfile[]);
  const serviceFields = (service.service_templates?.service_fields ?? []) as ServiceField[];

  // Deduplicate roles by profile ID — collect all roles per profile
  const profileRolesMap = new Map<string, { person: RoleWithProfile; roles: string[]; allRoleRows: RoleWithProfile[] }>();
  for (const r of typedRoles) {
    const pid = r.client_profiles?.id;
    if (pid) {
      const existing = profileRolesMap.get(pid);
      if (existing) {
        if (!existing.roles.includes(r.role)) existing.roles.push(r.role);
        existing.allRoleRows.push(r);
      } else {
        profileRolesMap.set(pid, { person: r, roles: [r.role], allRoleRows: [r] });
      }
    } else {
      profileRolesMap.set(r.id, { person: r, roles: [r.role], allRoleRows: [r] });
    }
  }
  const uniqueRoles = Array.from(profileRolesMap.values());

  // ── Section completion ────────────────────────────────────────────────────

  const companyFields = getFieldsForSection("company_setup", serviceFields);
  const financialFields = getFieldsForSection("financial", serviceFields);
  const bankingFields = getFieldsForSection("banking", serviceFields);

  const companySetupPct = calcSectionCompletion(serviceFields, serviceDetails, "company_setup").percentage;
  const financialPct = calcSectionCompletion(serviceFields, serviceDetails, "financial").percentage;
  const bankingPct = calcSectionCompletion(serviceFields, serviceDetails, "banking").percentage;

  const hasDirector = typedRoles.some((r) => r.role === "director");
  const kycPersons = typedRoles.map((r) => ({
    client_profiles: r.client_profiles ? {
      client_profile_kyc: (Array.isArray(r.client_profiles.client_profile_kyc)
        ? r.client_profiles.client_profile_kyc[0] ?? null
        : r.client_profiles.client_profile_kyc) as Record<string, unknown> | null,
    } : null,
  }));
  const kycPct = hasDirector ? calcKycCompletion(kycPersons).percentage : 0;
  const peopleKycPct = typedRoles.length === 0 ? 0 : hasDirector ? kycPct : Math.round(kycPct * 0.5);

  const documentsPct = calcDocumentsCompletion(documents).percentage;

  // ── Field change handler ──────────────────────────────────────────────────

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setServiceDetails((prev) => ({ ...prev, [key]: value }));
    setPendingChanges(true);
  }, []);

  // ── Save / Cancel ─────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_details: serviceDetails }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setService((prev) => ({ ...prev, service_details: serviceDetails }));
      setPendingChanges(false);
      toast.success("Service details saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setServiceDetails(service.service_details ?? {});
    setPendingChanges(false);
  }

  // ── Status update ─────────────────────────────────────────────────────────

  async function updateStatus(status: string) {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setService((prev) => ({ ...prev, status: status as typeof prev.status }));
      toast.success("Status updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatingStatus(false);
    }
  }

  // ── Milestones ────────────────────────────────────────────────────────────

  async function toggleMilestone(
    field: "loe_received_at" | "invoice_sent_at" | "payment_received_at",
    boolField?: "loe_received"
  ) {
    setSavingMilestone(field);
    const current = milestones[field as keyof typeof milestones] as string | null | boolean;
    const isOn = boolField ? milestones.loe_received : !!current;
    const newDate = !isOn ? new Date().toISOString() : null;
    const patch: Record<string, unknown> = { [field]: newDate };
    if (boolField) patch[boolField] = !isOn;
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMilestones((prev) => ({
        ...prev,
        [field]: newDate,
        ...(boolField ? { [boolField]: !isOn } : {}),
      }));
      toast.success("Milestone updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingMilestone(null);
    }
  }

  async function updateMilestoneDate(
    field: "loe_received_at" | "invoice_sent_at" | "payment_received_at",
    value: string
  ) {
    setSavingMilestone(field);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value ? new Date(value).toISOString() : null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMilestones((prev) => ({ ...prev, [field]: value ? new Date(value).toISOString() : null }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingMilestone(null);
    }
  }

  // ── Assigned admin (stored in service_details._assigned_admin_id) ─────────

  const assignedAdminId = (serviceDetails._assigned_admin_id as string | null) ?? null;

  async function assignAdmin(userId: string | null) {
    const updated = { ...serviceDetails, _assigned_admin_id: userId };
    setServiceDetails(updated);
    try {
      await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_details: updated }),
      });
      setService((prev) => ({ ...prev, service_details: updated }));
      toast.success("Account manager updated");
    } catch {
      toast.error("Failed to update manager");
    }
  }

  // ── Audit trail filters ───────────────────────────────────────────────────

  const auditActors = Array.from(new Set(auditEntries.map((e) => e.actor_name).filter(Boolean))) as string[];
  const auditActions = Array.from(new Set(auditEntries.map((e) => e.action).filter(Boolean)));

  const filteredAudit = auditEntries.filter((e) => {
    if (auditActorFilter !== "all" && e.actor_name !== auditActorFilter) return false;
    if (auditActionFilter !== "all" && e.action !== auditActionFilter) return false;
    return true;
  });

  // Cast to AuditLogEntry[] for the AuditTrail component
  const auditForComponent = filteredAudit as unknown as AuditLogEntry[];

  const [newlyAddedProfileId, setNewlyAddedProfileId] = useState<string | null>(null);

  function handleRolesRefresh() {
    router.refresh();
  }

  function handleProfileAdded(profileId?: string) {
    if (profileId) setNewlyAddedProfileId(profileId);
    router.refresh();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminApplicationSectionsProvider
      applicationId={service.id}
      initialReviews={sectionReviews}
    >
    <div>
      {/* Back */}
      <Link
        href="/admin/services"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-navy mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to services
      </Link>

      {/* ── Sticky Header ────────────────────────────────────────────────── */}
      <div className="bg-white border rounded-xl px-5 py-4 mb-6 sticky top-0 z-30 shadow-sm">
        {/* Title + Save/Cancel */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            {service.service_number && (
              <span className="text-xs font-mono text-gray-400 mr-2">{service.service_number}</span>
            )}
            <h1 className="text-xl font-bold text-brand-navy inline">
              {service.service_templates?.name ?? "Service"}
            </h1>
            {service.service_templates?.description && (
              <p className="text-sm text-gray-400 mt-0.5">{service.service_templates.description}</p>
            )}
          </div>

        </div>

        {/* Salesforce-style path chevron */}
        <div className="flex items-center mt-3">
          {(["draft", "in_progress", "submitted", "in_review", "verification", "approved"] as const).map((step, idx, arr) => {
            const stepLabels: Record<string, string> = {
              draft: "Draft",
              in_progress: "In Progress",
              submitted: "Submitted",
              in_review: "In Review",
              verification: "Verification",
              approved: "Approved",
            };
            const stepIdx = arr.indexOf(service.status as typeof arr[number]);
            const isActive = idx === stepIdx;
            const isComplete = idx < stepIdx;
            const isRejected = service.status === "rejected";

            // Salesforce-style colors
            const bgColor = isRejected && isActive
              ? "#ef4444"
              : isComplete
              ? "#16a34a"
              : isActive
              ? "#2563eb"
              : "#e5e7eb";
            const textColor = (isComplete || isActive || (isRejected && isActive)) ? "#fff" : "#9ca3af";
            return (
              <div key={step} className="relative flex-1" style={{ marginRight: idx < arr.length - 1 ? "2px" : 0 }}>
                <svg viewBox="0 0 200 36" className="w-full h-9" preserveAspectRatio="none">
                  {/* Main body */}
                  <path
                    d={idx === 0
                      ? "M4,0 L180,0 L200,18 L180,36 L4,36 Q0,36 0,32 L0,4 Q0,0 4,0"
                      : idx === arr.length - 1
                      ? "M0,0 L20,0 L20,0 L196,0 Q200,0 200,4 L200,32 Q200,36 196,36 L0,36 L20,18 Z"
                      : "M0,0 L180,0 L200,18 L180,36 L0,36 L20,18 Z"}
                    fill={bgColor}
                  />
                  {/* Text */}
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
                    fill={textColor} fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif"
                  >
                    {isComplete ? "✓ " : ""}{isRejected && isActive ? "Rejected" : stepLabels[step]}
                  </text>
                </svg>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Two-column layout ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

      {/* ── LEFT: Main Sections (col-span-2) ────────────────────────────── */}
      <div className="lg:col-span-2 space-y-4 divide-y divide-blue-200/60 [&>*]:pt-4 [&>*:first-child]:pt-0">

        {/* ── Section 1: Company Setup ────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Company Setup"
          percentage={companySetupPct}
          ragStatus={ragFromPct(companySetupPct)}
          sectionKey="company_setup"
          anchorId="step-company-setup"
        >
          {companyFields.length === 0 ? (
            <p className="text-sm text-gray-400">No company setup fields for this template.</p>
          ) : (
            <DynamicServiceForm
              fields={companyFields}
              values={serviceDetails}
              onChange={handleFieldChange}
              hideHeaders
            />
          )}
        </ServiceCollapsibleSection>

        {/* ── Section 2: Financial ─────────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Financial"
          percentage={financialPct}
          ragStatus={ragFromPct(financialPct)}
          sectionKey="financial"
          anchorId="step-financial"
        >
          {financialFields.length === 0 ? (
            <p className="text-sm text-gray-400">No financial fields for this template.</p>
          ) : (
            <DynamicServiceForm
              fields={financialFields}
              values={serviceDetails}
              onChange={handleFieldChange}
              hideHeaders
            />
          )}
        </ServiceCollapsibleSection>

        {/* ── Section 3: Banking ───────────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Banking"
          percentage={bankingPct}
          ragStatus={ragFromPct(bankingPct)}
          sectionKey="banking"
          anchorId="step-banking"
        >
          {bankingFields.length === 0 ? (
            <p className="text-sm text-gray-400">No banking fields for this template.</p>
          ) : (
            <DynamicServiceForm
              fields={bankingFields}
              values={serviceDetails}
              onChange={handleFieldChange}
              hideHeaders
            />
          )}
        </ServiceCollapsibleSection>

        {/* ── Section 4: People & KYC ──────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title={`People & KYC (${uniqueRoles.length} ${uniqueRoles.length === 1 ? "person" : "people"})`}
          percentage={peopleKycPct}
          ragStatus={ragFromPct(peopleKycPct)}
          sectionKey="people"
          anchorId="step-people-kyc"
        >
          <div className="pt-4">
            {uniqueRoles.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">No profiles linked yet.</p>
            ) : (
              <div className="space-y-3 mb-4">
                {uniqueRoles.map(({ person, roles: personRoles, allRoleRows }) => {
                  const pid = person.client_profiles?.id;
                  const personProfileDocs = pid
                    ? profileDocs.filter((d) => d.client_profile_id === pid)
                    : [];
                  return (
                    <PersonCard
                      key={pid ?? person.id}
                      roleRow={person}
                      allRoleRows={allRoleRows}
                      combinedRoles={personRoles}
                      serviceId={service.id}
                      profileDocuments={personProfileDocs}
                      documentTypes={documentTypes}
                      updateRequests={updateRequests}
                      defaultExpanded={!!pid && pid === newlyAddedProfileId}
                      onRefresh={handleRolesRefresh}
                    />
                  );
                })}
              </div>
            )}

            {/* Add role buttons */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(["director", "shareholder", "ubo"] as const).map((r) => (
                <AddProfileDialog
                  key={r}
                  serviceId={service.id}
                  allProfiles={allProfiles}
                  existingRoles={typedRoles}
                  onAdded={handleProfileAdded}
                  defaultRole={r}
                  trigger={
                    <Button size="sm" variant="outline" className="gap-1.5 border-dashed">
                      <Plus className="h-3.5 w-3.5" />
                      Add {r === "ubo" ? "UBO" : r.charAt(0).toUpperCase() + r.slice(1)}
                    </Button>
                  }
                />
              ))}
            </div>

            {/* Ownership Structure — editable, collapsible */}
            <OwnershipStructure
              shareholders={typedRoles.filter((r: RoleWithProfile) => r.role === "shareholder")}
              serviceId={service.id}
              onSaved={handleRolesRefresh}
            />
          </div>
        </ServiceCollapsibleSection>

        {/* ── Section 5: Documents ─────────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title={`Documents (${corporateDocs.length})`}
          percentage={documentsPct}
          ragStatus={ragFromPct(documentsPct)}
          sectionKey="documents"
          anchorId="step-documents"
        >
          <AdminDocumentsSection
            serviceId={service.id}
            documents={corporateDocs}
            updateRequests={updateRequests}
            roles={typedRoles}
            requirements={requirements}
            onDocumentAdded={(doc) => setDocuments((prev) => [...prev, doc])}
            onUpdateRequestAdded={(req) => setUpdateRequests((prev) => [req, ...prev])}
            onRefresh={handleRolesRefresh}
          />
        </ServiceCollapsibleSection>

        {/* ── Admin divider ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Admin</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* ── Section 6: Internal Notes ────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Internal Notes"
          icon={<StickyNote className="h-4 w-4" />}
          adminOnly
          defaultOpen={false}
        >
          <div className="pt-4 space-y-3">
            <p className="text-xs text-gray-400">Not visible to the client portal.</p>
            <textarea
              value={(serviceDetails._admin_notes as string | null) ?? ""}
              onChange={(e) => {
                setServiceDetails((prev) => ({ ...prev, _admin_notes: e.target.value }));
                setPendingChanges(true);
              }}
              rows={5}
              placeholder="Add internal notes about this service…"
              className="w-full border rounded-lg px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className="bg-brand-navy hover:bg-brand-blue"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save notes
            </Button>
          </div>
        </ServiceCollapsibleSection>

        {/* ── Section 7: Risk Assessment ───────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Risk Assessment"
          icon={<ShieldCheck className="h-4 w-4" />}
          adminOnly
          defaultOpen={false}
        >
          <div className="pt-4 space-y-4">
            {/* DD Level */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Due Diligence Level:</span>
              <select
                value={(serviceDetails._dd_level as string | null) ?? "cdd"}
                onChange={(e) => {
                  setServiceDetails((prev) => ({ ...prev, _dd_level: e.target.value }));
                  setPendingChanges(true);
                }}
                className="border rounded-lg px-3 py-1.5 text-sm"
              >
                {DD_LEVELS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Completion summary */}
            <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Completion Summary</p>
              {[
                { label: "Company Setup", pct: companySetupPct },
                { label: "Financial", pct: financialPct },
                { label: "Banking", pct: bankingPct },
                { label: "People & KYC", pct: peopleKycPct },
                { label: "Documents", pct: documentsPct },
              ].map(({ label, pct }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-28 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${RAG_DOT[ragFromPct(pct)]}`} />
                </div>
              ))}
              <div className="pt-2 border-t">
                {(() => {
                  const overall = Math.round(
                    (companySetupPct + financialPct + bankingPct + peopleKycPct + documentsPct) / 5
                  );
                  const ready = overall === 100;
                  return (
                    <p className={`text-sm font-medium ${ready ? "text-green-700" : "text-amber-700"}`}>
                      {ready ? "✓ Ready for approval" : `Overall: ${overall}% — not yet ready`}
                    </p>
                  );
                })()}
              </div>
            </div>

            {/* Required docs check */}
            {requirements.filter((r) => r.requirement_type === "document").length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Required Documents</p>
                {requirements
                  .filter((r) => r.requirement_type === "document" && r.document_type_id)
                  .map((req) => {
                    const uploaded = documents.some((d) => d.document_type_id === req.document_type_id);
                    return (
                      <div key={req.id} className="flex items-center gap-2 text-sm">
                        {uploaded ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        )}
                        <span className={uploaded ? "text-gray-700" : "text-gray-500"}>{req.label}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </ServiceCollapsibleSection>

      </div>{/* End left column */}

      {/* ── RIGHT: Sidebar (col-span-1) ─────────────────────────────────── */}
      <div className="space-y-3">

        {/* ── Status Change ───────────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</p>
          <div className="flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${statusBadgeClass(service.status)}`}>
              {service.status.replace(/_/g, " ")}
            </span>
            <div className="relative flex-1">
              <select
                value={service.status}
                onChange={(e) => void updateStatus(e.target.value)}
                disabled={updatingStatus}
                className="w-full h-8 rounded-lg border border-gray-200 pl-2 pr-6 text-xs appearance-none bg-white cursor-pointer"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
            </div>
            {updatingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
          </div>
        </div>

        {/* ── Account Service Owner ───────────────────────────────────────── */}
        <div className="bg-white border rounded-xl px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Service Owner</p>
          <div className="relative">
            <select
              value={assignedAdminId ?? ""}
              onChange={(e) => void assignAdmin(e.target.value || null)}
              className="w-full h-8 rounded-lg border border-gray-200 pl-2 pr-6 text-xs appearance-none bg-white cursor-pointer"
            >
              <option value="">— Unassigned —</option>
              {adminUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.full_name ?? u.email ?? u.user_id}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* ── Section 8: Milestones ────────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Milestones"
          icon={<Milestone className="h-4 w-4" />}
          adminOnly
          defaultOpen={true}
        >
          <div className="pt-4 space-y-4">
            {(
              [
                {
                  label: "LOE Received",
                  field: "loe_received_at" as const,
                  boolField: "loe_received" as const,
                  enabled: milestones.loe_received,
                  date: milestones.loe_received_at,
                },
                {
                  label: "Invoice Sent",
                  field: "invoice_sent_at" as const,
                  boolField: undefined,
                  enabled: !!milestones.invoice_sent_at,
                  date: milestones.invoice_sent_at,
                },
                {
                  label: "Payment Received",
                  field: "payment_received_at" as const,
                  boolField: undefined,
                  enabled: !!milestones.payment_received_at,
                  date: milestones.payment_received_at,
                },
              ] as const
            ).map((m) => (
              <div key={m.label} className="flex items-center gap-4">
                {/* Toggle */}
                <button
                  onClick={() => void toggleMilestone(m.field, m.boolField)}
                  disabled={savingMilestone === m.field}
                  className={`flex items-center gap-2 min-w-[160px] text-sm font-medium transition-colors ${
                    m.enabled ? "text-green-700" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {savingMilestone === m.field ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : m.enabled ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                  )}
                  {m.label}
                </button>

                {/* Date picker (shown when enabled) */}
                {m.enabled && (
                  <input
                    type="date"
                    value={m.date ? new Date(m.date).toISOString().split("T")[0] : ""}
                    onChange={(e) => void updateMilestoneDate(m.field, e.target.value)}
                    className="border rounded-lg px-2 py-1 text-sm text-gray-700"
                  />
                )}
              </div>
            ))}
          </div>
        </ServiceCollapsibleSection>

        {/* ── Section 9: Audit Trail ───────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Audit Trail"
          icon={<Clock className="h-4 w-4" />}
          adminOnly
          defaultOpen={true}
        >
          <div className="pt-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">By user:</span>
                <select
                  value={auditActorFilter}
                  onChange={(e) => setAuditActorFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="all">All users</option>
                  {auditActors.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Action:</span>
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="all">All actions</option>
                  {auditActions.map((a) => (
                    <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              {(auditActorFilter !== "all" || auditActionFilter !== "all") && (
                <button
                  onClick={() => { setAuditActorFilter("all"); setAuditActionFilter("all"); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear filters
                </button>
              )}
            </div>

            {auditEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No audit events for this service yet.</p>
            ) : (
              <AuditTrail entries={auditForComponent} />
            )}
          </div>
        </ServiceCollapsibleSection>

      </div>{/* End right column */}
      </div>{/* End grid */}

      {/* Fixed bottom save bar — only shows when changes are pending */}
      {pendingChanges && (
        <div className="fixed bottom-6 left-[260px] right-0 bg-white border-t border-x rounded-t-lg px-6 py-3 flex items-center justify-between z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
          <p className="text-sm text-amber-600 font-medium">You have unsaved changes</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              className="h-8 text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-8 text-xs bg-brand-navy hover:bg-brand-blue"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save changes
            </Button>
          </div>
        </div>
      )}

      {/* Bottom padding for fixed bar */}
      {pendingChanges && <div className="h-16" />}
    </div>
    </AdminApplicationSectionsProvider>
  );
}
