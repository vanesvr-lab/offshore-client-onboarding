"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { UserPlus, User, Building2, ArrowLeft, Mail, Send, ChevronDown, ChevronRight, Search, Loader2, Upload, Eye, CheckCircle2, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KycStepWizard } from "@/components/kyc/KycStepWizard";
import { DocumentDetailDialog } from "@/components/shared/DocumentDetailDialog";
import type { DocumentDetailDoc } from "@/components/shared/DocumentDetailDialog";
import { DocumentStatusBadge } from "@/components/shared/DocumentStatusBadge";
import { DocumentStatusLegend } from "@/components/shared/DocumentStatusLegend";
import { compressIfImage } from "@/lib/imageCompression";
import type { KycRecord, DocumentRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement, VerificationStatus } from "@/types";
import type { ServicePerson, ClientServiceDoc } from "@/app/(client)/services/[id]/page";
import { DD_LEVEL_INCLUDES } from "@/lib/utils/dueDiligenceConstants";

// KYC fields used to compute per-person completion percentage
const KYC_PCT_FIELDS = [
  "date_of_birth", "nationality", "passport_number", "passport_expiry", "occupation", "address",
  "source_of_funds_description", "source_of_wealth_description",
  "is_pep", "legal_issues_declared", "tax_identification_number",
];

function calcKycPct(kyc: Record<string, unknown> | null): number {
  if (!kyc) return 0;
  const filled = KYC_PCT_FIELDS.filter((f) => {
    const v = kyc[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
  return Math.round((filled / KYC_PCT_FIELDS.length) * 100);
}

// ─── Types ───────────────────────────────────────────────────────────────────

type ServicePersonRole = "director" | "shareholder" | "ubo";

const ROLE_LABELS: Record<ServicePersonRole, string> = {
  director: "Director",
  shareholder: "Shareholder",
  ubo: "UBO",
};

const ROLE_COLORS: Record<ServicePersonRole, string> = {
  director: "bg-blue-100 text-blue-700",
  shareholder: "bg-purple-100 text-purple-700",
  ubo: "bg-amber-100 text-amber-700",
};

const ROLE_LIST: ServicePersonRole[] = ["director", "shareholder", "ubo"];

// ─── mapToKycRecord ───────────────────────────────────────────────────────────

function mapToKycRecord(person: ServicePerson): KycRecord {
  const kyc = person.client_profiles?.client_profile_kyc ?? {};
  const profile = person.client_profiles;
  return {
    id: (kyc.id as string) ?? "",
    client_id: "",
    profile_id: profile?.id ?? null,
    record_type: (profile?.record_type as "individual" | "organisation" | null) ?? "individual",
    full_name: profile?.full_name ?? null,
    email: profile?.email ?? null,
    phone: null,
    address: (kyc.address as string | null) ?? null,
    aliases: (kyc.aliases as string | null) ?? null,
    work_address: null,
    work_phone: null,
    work_email: null,
    date_of_birth: (kyc.date_of_birth as string | null) ?? null,
    nationality: (kyc.nationality as string | null) ?? null,
    passport_country: (kyc.passport_country as string | null) ?? null,
    passport_number: (kyc.passport_number as string | null) ?? null,
    passport_expiry: (kyc.passport_expiry as string | null) ?? null,
    occupation: (kyc.occupation as string | null) ?? null,
    legal_issues_declared: (kyc.legal_issues_declared as boolean | null) ?? null,
    legal_issues_details: (kyc.legal_issues_details as string | null) ?? null,
    tax_identification_number: (kyc.tax_identification_number as string | null) ?? null,
    source_of_funds_description: (kyc.source_of_funds_description as string | null) ?? null,
    source_of_wealth_description: (kyc.source_of_wealth_description as string | null) ?? null,
    is_pep: (kyc.is_pep as boolean | null) ?? null,
    pep_details: (kyc.pep_details as string | null) ?? null,
    business_website: null,
    jurisdiction_incorporated: null,
    date_of_incorporation: null,
    listed_or_unlisted: null,
    jurisdiction_tax_residence: null,
    description_activity: null,
    company_registration_number: null,
    industry_sector: null,
    regulatory_licenses: null,
    sanctions_checked: false,
    sanctions_checked_at: null,
    sanctions_notes: null,
    adverse_media_checked: false,
    adverse_media_checked_at: null,
    adverse_media_notes: null,
    pep_verified: false,
    pep_verified_at: null,
    pep_verified_notes: null,
    risk_rating: null,
    risk_rating_justification: null,
    risk_rated_by: null,
    risk_rated_at: null,
    geographic_risk_assessment: null,
    relationship_history: null,
    risk_flags: null,
    senior_management_approval: null,
    senior_management_approved_by: null,
    senior_management_approved_at: null,
    ongoing_monitoring_plan: null,
    kyc_journey_completed: (kyc.kyc_journey_completed as boolean) ?? false,
    is_primary: false,
    invite_sent_at: null,
    invite_sent_by: null,
    due_diligence_level: (profile?.due_diligence_level as DueDiligenceLevel) ?? "cdd",
    completion_status: (kyc.completion_status as "incomplete" | "complete") ?? "incomplete",
    filled_by: null,
    created_at: (kyc.created_at as string) ?? "",
    updated_at: (kyc.updated_at as string) ?? "",
  };
}

// ─── mapToDocumentRecord ──────────────────────────────────────────────────────

function mapToDocumentRecord(doc: ClientServiceDoc): DocumentRecord {
  return {
    id: doc.id,
    client_id: "",
    kyc_record_id: null,
    document_type_id: doc.document_type_id ?? "",
    file_path: "",
    file_name: doc.file_name,
    file_size: null,
    mime_type: doc.mime_type ?? null,
    verification_status: doc.verification_status as VerificationStatus,
    verification_result: doc.verification_result as import("@/types").VerificationResult | null,
    expiry_date: null,
    notes: null,
    is_active: true,
    uploaded_by: null,
    uploaded_at: doc.uploaded_at,
    verified_at: null,
    admin_status: doc.admin_status as "pending" | "approved" | "rejected" | null,
    admin_status_note: null,
    admin_status_by: null,
    admin_status_at: null,
  };
}

const KYC_DOC_CATEGORIES = ["identity", "financial", "compliance"];
const isKycDocCat = (cat: string) => KYC_DOC_CATEGORIES.includes(cat);

// ─── ProfileEditPanel ─────────────────────────────────────────────────────────

// ─── KycDocListPanel ──────────────────────────────────────────────────────────

function KycDocListPanel({
  profileId,
  serviceId,
  documents: initialDocs,
  documentTypes,
  requirements,
  dueDiligenceLevel,
  onDocUploaded,
}: {
  profileId: string;
  serviceId: string;
  documents: ClientServiceDoc[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  dueDiligenceLevel: DueDiligenceLevel;
  onDocUploaded: (doc: ClientServiceDoc) => void;
}) {
  const [localDocs, setLocalDocs] = useState(initialDocs);
  const [uploadingTypeId, setUploadingTypeId] = useState<string | null>(null);
  const [detailDoc, setDetailDoc] = useState<DocumentDetailDoc | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadTypeId, setPendingUploadTypeId] = useState<string | null>(null);

  // Keep localDocs in sync when the parent updates the docs prop (e.g. after a replace from the detail dialog)
  useEffect(() => {
    setLocalDocs(initialDocs);
  }, [initialDocs]);

  // Derive required KYC doc types — use cumulative levels (cdd includes basic + sdd)
  const includedLevels = DD_LEVEL_INCLUDES[dueDiligenceLevel] ?? ["basic", "sdd", "cdd"];
  const ddReqDocTypeIds = requirements
    .filter((r) => r.requirement_type === "document" && includedLevels.includes(r.level as "basic" | "sdd" | "cdd" | "edd") && r.document_type_id)
    .map((r) => r.document_type_id as string);

  const kycDocTypes = ddReqDocTypeIds.length > 0
    ? documentTypes.filter((dt) => ddReqDocTypeIds.includes(dt.id) && isKycDocCat(dt.category))
    : documentTypes.filter((dt) => isKycDocCat(dt.category));

  const profileDocs = localDocs.filter((d) => d.client_profile_id === profileId);

  function getUploaded(dtId: string) {
    return profileDocs.find((d) => d.document_type_id === dtId);
  }

  async function pollForVerification(docId: string, dtId: string) {
    // Poll every 2s for up to 50s (server has a 45s AI timeout after which doc is marked manual_review)
    const MAX_ATTEMPTS = 25;
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const res = await fetch(`/api/documents/${docId}`);
        if (!res.ok) continue;
        const data = (await res.json()) as { document?: ClientServiceDoc };
        if (data.document && data.document.verification_status !== "pending") {
          setLocalDocs((prev) => {
            const without = prev.filter((d) => !(d.document_type_id === dtId && d.client_profile_id === profileId));
            return [...without, data.document as ClientServiceDoc];
          });
          return;
        }
      } catch {
        // swallow polling errors
      }
    }
    // After max attempts with still-pending status, fetch one last time and accept whatever state it's in
    try {
      const res = await fetch(`/api/documents/${docId}`);
      if (res.ok) {
        const data = (await res.json()) as { document?: ClientServiceDoc };
        const finalDocData = data.document;
        if (finalDocData) {
          setLocalDocs((prev) => {
            const without = prev.filter((d) => !(d.document_type_id === dtId && d.client_profile_id === profileId));
            // Force status to manual_review if still pending after max wait
            const finalDoc = finalDocData.verification_status === "pending"
              ? { ...finalDocData, verification_status: "manual_review" }
              : finalDocData;
            return [...without, finalDoc as ClientServiceDoc];
          });
        }
      }
    } catch {
      // ignore
    }
  }

  async function handleUpload(dtId: string, file: File) {
    setUploadingTypeId(dtId);

    // B-037 — compress images client-side before hitting Vercel.
    let uploadFile = file;
    if (file.type.startsWith("image/") && file.size > 500 * 1024) {
      const optimisingToast = toast.loading("Optimising image…", { position: "top-right" });
      try {
        uploadFile = await compressIfImage(file);
      } finally {
        toast.dismiss(optimisingToast);
      }
    }

    // Vercel serverless body limit (Hobby = 4.5 MB). Catch client-side to avoid HTML 413 → JSON parse error.
    const VERCEL_LIMIT = 4.5 * 1024 * 1024;
    if (uploadFile.size > VERCEL_LIMIT) {
      toast.error(`File is too large (${(uploadFile.size / 1024 / 1024).toFixed(1)} MB). Please upload a file under 4.5 MB.`);
      setUploadingTypeId(null);
      return;
    }
    try {
      const fd = new FormData();
      fd.append("file", uploadFile);
      fd.append("documentTypeId", dtId);
      fd.append("clientProfileId", profileId);
      const res = await fetch(`/api/services/${serviceId}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      const raw = await res.text();
      let data: { document?: ClientServiceDoc; error?: string } = {};
      try { data = raw ? JSON.parse(raw) as typeof data : {}; } catch { /* non-JSON (e.g. 413 HTML) */ }
      if (!res.ok) {
        if (res.status === 413) throw new Error("File is too large. Please upload under 4.5 MB.");
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      if (data.document) {
        const newDoc = data.document as unknown as ClientServiceDoc;
        setLocalDocs((prev) => {
          const without = prev.filter((d) => !(d.document_type_id === dtId && d.client_profile_id === profileId));
          return [...without, newDoc];
        });
        onDocUploaded(newDoc);
        toast.success("Document uploaded — AI verification running...", { position: "top-right" });
        // Start polling for AI verification result
        void pollForVerification(newDoc.id, dtId);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingTypeId(null);
    }
  }

  const uploadedCount = kycDocTypes.filter((dt) => getUploaded(dt.id)).length;

  // B-046 batch 4 — flat list in section order, split into two columns for the
  // new layout. Section headers render inline within each column wherever the
  // section's docs fall; if a section spans both columns, the header appears
  // in both.
  const CATEGORY_LABELS: Record<string, string> = {
    identity: "Identity",
    financial: "Financial",
    compliance: "Compliance",
  };
  const CATEGORY_ORDER = ["identity", "financial", "compliance"];
  const flatList: { dt: DocumentType; section: string }[] = [];
  for (const cat of CATEGORY_ORDER) {
    for (const dt of kycDocTypes) {
      const c = dt.category || "identity";
      if (c === cat) flatList.push({ dt, section: cat });
    }
  }
  const totalDocs = flatList.length;
  const leftCount = Math.ceil(totalDocs / 2); // odd → left gets the extra
  const leftItems = flatList.slice(0, leftCount);
  const rightItems = flatList.slice(leftCount);

  function renderDocRow(dt: DocumentType) {
    const uploaded = getUploaded(dt.id);
    const isUploading = uploadingTypeId === dt.id;
    const aiStatus = uploaded?.verification_status;
    const adminStatus = uploaded?.admin_status;
    const isApproved = !!(uploaded && adminStatus === "approved");
    return (
      <div key={dt.id} className="flex items-center justify-between gap-2 py-1">
        <div className="flex items-center gap-2 min-w-0">
          {!uploaded && <FileText className="h-4 w-4 text-amber-500 shrink-0" />}
          {uploaded && !isApproved && <FileText className="h-4 w-4 text-gray-500 shrink-0" />}
          {isApproved && <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />}
          <span className={`text-xs truncate ${
            !uploaded ? "text-amber-700"
            : isApproved ? "text-green-700 font-medium"
            : "text-gray-700"
          }`}>
            {dt.name}
          </span>
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
              size="sm"
              variant="ghost"
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
                document_types: uploaded.document_types,
              })}
            >
              <Eye className="h-3.5 w-3.5 text-gray-600" />
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px] gap-1 border-amber-300 text-amber-700 hover:bg-amber-50"
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
  }

  function renderColumn(items: { dt: DocumentType; section: string }[]) {
    let currentSection: string | null = null;
    const out: JSX.Element[] = [];
    for (const item of items) {
      if (item.section !== currentSection) {
        currentSection = item.section;
        out.push(
          <p
            key={`hdr-${item.section}-${item.dt.id}`}
            className="text-[11px] font-semibold uppercase tracking-wide text-gray-700 mt-2 first:mt-0 pb-1 border-b border-gray-100"
          >
            {CATEGORY_LABELS[item.section] ?? item.section}
          </p>
        );
      }
      out.push(renderDocRow(item.dt));
    }
    return out;
  }

  return (
    <>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide flex items-center gap-1">
            <FileText className="h-3 w-3" />
            KYC Documents
            <span className={`ml-1 text-[10px] font-medium normal-case tracking-normal ${uploadedCount === kycDocTypes.length ? "text-green-600" : "text-amber-600"}`}>
              · {uploadedCount} of {kycDocTypes.length} uploaded
            </span>
          </p>
          <DocumentStatusLegend />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <div className="overflow-y-auto pr-1 max-h-[420px]">
            {leftItems.length > 0 ? renderColumn(leftItems) : null}
          </div>
          <div className="overflow-y-auto pr-1 max-h-[420px]">
            {rightItems.length > 0 ? renderColumn(rightItems) : null}
          </div>
        </div>
      </div>

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

      {/* Document detail popup */}
      {detailDoc && (
        <DocumentDetailDialog
          doc={detailDoc}
          isAdmin={false}
          open={!!detailDoc}
          onOpenChange={(open) => { if (!open) setDetailDoc(null); }}
          serviceId={serviceId}
          onDocumentReplaced={(newDoc) => {
            if (detailDoc) {
              const updated = { ...detailDoc, ...newDoc } as DocumentDetailDoc;
              const dtId = detailDoc.document_type_id ?? null;
              setDetailDoc(null);
              setLocalDocs((prev) => {
                const without = prev.filter((d) => d.id !== detailDoc.id);
                const asClientDoc: ClientServiceDoc = {
                  id: updated.id,
                  file_name: updated.file_name,
                  mime_type: updated.mime_type ?? null,
                  verification_status: updated.verification_status ?? "pending",
                  verification_result: updated.verification_result ?? null,
                  admin_status: updated.admin_status ?? null,
                  prefill_dismissed_at: null,
                  uploaded_at: updated.uploaded_at,
                  document_type_id: dtId,
                  client_profile_id: profileId,
                  document_types: updated.document_types
                    ? { name: updated.document_types.name, category: updated.document_types.category ?? "" }
                    : null,
                };
                return [...without, asClientDoc];
              });
              // Kick off AI verification polling for the replaced doc so its status updates without a page refresh.
              if (dtId && (updated.verification_status ?? "pending") === "pending") {
                void pollForVerification(updated.id, dtId);
              }
            }
          }}
        />
      )}
    </>
  );
}

// ─── AddPersonModal ───────────────────────────────────────────────────────────

interface AvailableProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  record_type: "individual" | "organisation";
  roles: { service_id: string; role: string; shareholding_percentage: number | null }[];
}

const ROLE_CHIP_TONE: Record<string, string> = {
  director: "bg-blue-50 text-blue-700 border-blue-200",
  shareholder: "bg-purple-50 text-purple-700 border-purple-200",
  ubo: "bg-amber-50 text-amber-800 border-amber-200",
  primary_client: "bg-gray-100 text-gray-700 border-gray-200",
  contact: "bg-gray-100 text-gray-700 border-gray-200",
};

/** Aggregate distinct role chips (e.g. "Director", "Shareholder 50%") across services. */
function aggregateRoleChips(
  roles: AvailableProfile["roles"]
): { key: string; role: string; label: string }[] {
  const seen = new Map<string, { role: string; label: string }>();
  for (const r of roles) {
    const baseLabel = ROLE_LABELS[r.role as ServicePersonRole] ?? r.role;
    const label = r.role === "shareholder" && r.shareholding_percentage != null
      ? `${baseLabel} ${r.shareholding_percentage}%`
      : baseLabel;
    const key = `${r.role}::${r.shareholding_percentage ?? ""}`;
    if (!seen.has(key)) seen.set(key, { role: r.role, label });
  }
  return Array.from(seen.entries()).map(([key, v]) => ({ key, role: v.role, label: v.label }));
}

function AddPersonModal({
  serviceId,
  role,
  currentPersons,
  onClose,
  onAdded,
}: {
  serviceId: string;
  role: ServicePersonRole;
  currentPersons: ServicePerson[];
  onClose: () => void;
  onAdded: (person: ServicePerson) => void;
}) {
  const roleTitle = ROLE_LABELS[role];
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [profiles, setProfiles] = useState<AvailableProfile[] | null>(null);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // New-person form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [recordType, setRecordType] = useState<"individual" | "organisation">("individual");

  useEffect(() => {
    fetch(`/api/services/${serviceId}/available-profiles`)
      .then((r) => r.json() as Promise<AvailableProfile[]>)
      .then((data) => setProfiles(data))
      .catch(() => setProfiles([]));
  }, [serviceId]);

  // Profiles already linked to THIS service for THIS role — used to disable rows + show inline message.
  const sameRoleOnThisServiceByProfile = useMemo(() => {
    const set = new Set<string>();
    for (const p of currentPersons) {
      if (p.client_profiles?.id && p.role === role) set.add(p.client_profiles.id);
    }
    return set;
  }, [currentPersons, role]);

  const visibleProfiles = useMemo(() => {
    const all = profiles ?? [];
    const filtered = role === "ubo"
      ? all.filter((p) => p.record_type === "individual")
      : all;
    if (!search) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(
      (p) =>
        (p.full_name?.toLowerCase().includes(q) ?? false) ||
        (p.email?.toLowerCase().includes(q) ?? false)
    );
  }, [profiles, role, search]);

  async function attachExisting(p: AvailableProfile) {
    if (sameRoleOnThisServiceByProfile.has(p.id)) {
      toast.error(`${p.full_name ?? "This profile"} is already a ${roleTitle} on this application.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/persons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, client_profile_id: p.id }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Failed to add");

      onAdded({
        id: data.id,
        role,
        shareholding_percentage: null,
        can_manage: false,
        invite_sent_at: null,
        invite_sent_by_name: null,
        client_profiles: {
          id: p.id,
          full_name: p.full_name ?? "",
          email: p.email,
          phone: p.phone,
          due_diligence_level: "cdd",
          record_type: p.record_type,
          client_profile_kyc: null,
        },
      });
      toast.success(`${roleTitle} added`);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add person");
      setSubmitting(false);
    }
  }

  async function createNew() {
    if (!newName.trim()) { toast.error("Full name is required"); return; }
    if (!newEmail.trim()) { toast.error("Email is required"); return; }

    const finalRecordType = role === "ubo" ? "individual" : recordType;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/persons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          full_name: newName.trim(),
          email: newEmail.trim(),
          phone: newPhone.trim() || undefined,
          record_type: finalRecordType,
        }),
      });
      const data = (await res.json()) as { id?: string; profileId?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Failed to add");

      onAdded({
        id: data.id,
        role,
        shareholding_percentage: null,
        can_manage: false,
        invite_sent_at: null,
        invite_sent_by_name: null,
        client_profiles: {
          id: data.profileId ?? "",
          full_name: newName.trim(),
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
          due_diligence_level: "cdd",
          record_type: finalRecordType,
          client_profile_kyc: null,
        },
      });
      toast.success(`${roleTitle} added`);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add person");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md z-[100] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Add {roleTitle}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b -mt-1">
          <button
            type="button"
            onClick={() => setTab("existing")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "existing"
                ? "border-brand-navy text-brand-navy"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Select existing person
          </button>
          <button
            type="button"
            onClick={() => setTab("new")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "new"
                ? "border-brand-navy text-brand-navy"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Add new person
          </button>
        </div>

        {tab === "existing" ? (
          <div className="space-y-2 pt-1">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="text-sm pl-8"
              />
            </div>

            {profiles === null ? (
              <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
            ) : visibleProfiles.length === 0 ? (
              <div className="text-center py-6 space-y-1">
                <p className="text-sm text-gray-500">
                  {role === "ubo"
                    ? "No existing individual profiles to attach."
                    : search
                      ? `No profiles match "${search}".`
                      : "No existing profiles to attach."}
                </p>
                <p className="text-xs text-gray-400">
                  Switch to <span className="font-medium">Add new person</span> to create one.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[20rem] overflow-y-auto pr-1">
                {visibleProfiles.map((p) => {
                  const chips = aggregateRoleChips(p.roles);
                  const isAlready = sameRoleOnThisServiceByProfile.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => !isAlready && !submitting && void attachExisting(p)}
                      disabled={isAlready || submitting}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        isAlready
                          ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                          : "border-gray-200 hover:border-brand-navy"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {p.record_type === "organisation" ? (
                          <Building2 className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                        ) : (
                          <User className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-brand-navy truncate">
                              {p.full_name ?? "Unnamed"}
                            </p>
                            <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                              {p.record_type === "organisation" ? "Company" : "Individual"}
                            </span>
                          </div>
                          {p.email && <p className="text-xs text-gray-400 truncate">{p.email}</p>}
                          {chips.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {chips.map((c) => (
                                <span
                                  key={c.key}
                                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                                    ROLE_CHIP_TONE[c.role] ?? "bg-gray-100 text-gray-600 border-gray-200"
                                  }`}
                                >
                                  {c.label}
                                </span>
                              ))}
                            </div>
                          )}
                          {isAlready && (
                            <p className="text-[11px] text-amber-700 mt-1.5">
                              {p.full_name ?? "This profile"} is already a {roleTitle} on this application.
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            {role !== "ubo" && (
              <div className="space-y-1.5">
                <Label className="text-sm">Type</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRecordType("individual")}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      recordType === "individual"
                        ? "border-brand-navy bg-brand-navy/5 text-brand-navy font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordType("organisation")}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      recordType === "organisation"
                        ? "border-brand-navy bg-brand-navy/5 text-brand-navy font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Company
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm">
                Full name <span className="text-red-400">*</span>
              </Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={
                  role === "ubo" || recordType === "individual"
                    ? "As it appears on passport"
                    : "Registered company name"
                }
                className="text-sm"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">
                Email <span className="text-red-400">*</span>
              </Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@example.com"
                className="text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm">Phone</Label>
              <Input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="Optional"
                className="text-sm"
              />
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t">
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          {tab === "new" && (
            <Button
              onClick={() => void createNew()}
              disabled={submitting || !newName.trim() || !newEmail.trim()}
              className="bg-brand-navy hover:bg-brand-blue gap-1"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Adding…
                </>
              ) : (
                `Add ${roleTitle}`
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── OwnershipStructure ───────────────────────────────────────────────────────

function OwnershipStructure({
  shareholders,
  serviceId,
  onSaved,
}: {
  shareholders: ServicePerson[];
  serviceId: string;
  onSaved: (roleId: string, pct: number) => void;
}) {
  const [localPcts, setLocalPcts] = useState<Record<string, string>>(() =>
    Object.fromEntries(shareholders.map((s) => [s.id, String(s.shareholding_percentage ?? 0)]))
  );
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Sync when new shareholders are added
  useEffect(() => {
    setLocalPcts((prev) => {
      const next = { ...prev };
      for (const s of shareholders) {
        if (!(s.id in next)) next[s.id] = String(s.shareholding_percentage ?? 0);
      }
      return next;
    });
  }, [shareholders]);

  const total = shareholders.reduce((sum, s) => sum + (parseFloat(localPcts[s.id] ?? "0") || 0), 0);
  const unallocated = Math.max(0, 100 - total);
  const isValid = Math.abs(total - 100) < 0.5;

  if (shareholders.length === 0) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all(
        shareholders.map(async (s) => {
          const pct = parseFloat(localPcts[s.id] ?? "0") || 0;
          const res = await fetch(`/api/services/${serviceId}/persons/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shareholding_percentage: pct }),
          });
          if (!res.ok) throw new Error("Save failed");
          onSaved(s.id, pct);
        })
      );
      toast.success("Shareholding updated", { position: "top-right" });
    } catch {
      toast.error("Failed to save shareholding", { position: "top-right" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          <span className="text-sm font-medium text-brand-navy">Ownership Structure</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isValid ? "text-green-600" : "text-amber-600"}`}>
            {total.toFixed(0)}% / 100%
          </span>
          {!isValid && (
            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              ⚠ Must total 100%
            </span>
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3 border-t">
          <div className="space-y-2 pt-3">
            {shareholders.map((s) => {
              const pct = parseFloat(localPcts[s.id] ?? "0") || 0;
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <p className="text-sm text-gray-700 w-32 truncate shrink-0">
                    {s.client_profiles?.full_name ?? "Unknown"}
                  </p>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-navy rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={localPcts[s.id] ?? "0"}
                      onChange={(e) =>
                        setLocalPcts((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                      className="h-7 w-16 text-xs text-center px-1"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
              );
            })}

            {unallocated > 0.5 && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-400 w-32 shrink-0">(Unallocated)</p>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-300 rounded-full"
                    style={{ width: `${Math.min(unallocated, 100)}%` }}
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-gray-400 w-16 text-center tabular-nums">
                    {unallocated.toFixed(0)}
                  </span>
                  <span className="text-xs text-gray-400">%</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-500">Total: {total.toFixed(0)}% / 100%</p>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-7 px-3 text-xs bg-brand-navy hover:bg-brand-blue"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── InviteDialog ─────────────────────────────────────────────────────────────

function InviteDialog({
  person,
  serviceId,
  combinedRoleLabels,
  onClose,
  onSent,
}: {
  person: ServicePerson;
  serviceId: string;
  combinedRoleLabels: string;
  onClose: () => void;
  onSent: (sentAt: string) => void;
}) {
  const [email, setEmail] = useState(person.client_profiles?.email ?? "");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!email.trim()) {
      toast.error("Email is required", { position: "top-right" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/persons/${person.id}/send-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), note: note.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; invite_sent_at?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      onSent(data.invite_sent_at ?? new Date().toISOString());
      toast.success("Email Sent", { position: "top-right" });
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send", { position: "top-right" });
    } finally {
      setSending(false);
    }
  }

  const personName = person.client_profiles?.full_name ?? "this person";

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm z-[100]">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Request KYC from {personName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <p className="text-xs text-gray-500">
            An email will be sent asking {personName} ({combinedRoleLabels}) to complete their KYC information.
          </p>

          <div className="space-y-1.5">
            <Label className="text-sm">Email address <span className="text-red-400">*</span></Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@email.com"
              className="text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Additional note <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a personal message..."
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button
              onClick={handleSend}
              disabled={sending || !email.trim()}
              className="bg-brand-navy hover:bg-brand-blue gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? "Sending…" : "Send Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── PersonCard ───────────────────────────────────────────────────────────────

function PersonCard({
  person,
  serviceId,
  kycPct,
  onReviewKyc,
  allRoleRows,
}: {
  person: ServicePerson;
  serviceId: string;
  kycPct: number;
  onReviewKyc: () => void;
  allRoleRows: ServicePerson[];
  // B-046 batch 4 — these props remain on the parent's call signature but the
  // bottom Roles section was removed from the card, so they're no longer used here.
  // Toggling roles now happens in the Review KYC top row.
  onRoleRemoved: (roleId: string) => void;
  onRoleAdded: (person: ServicePerson) => void;
}) {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteSentAt, setInviteSentAt] = useState<string | null>(person.invite_sent_at);
  const inviteSentByName = person.invite_sent_by_name ?? null;

  const currentRoles = allRoleRows.map((r) => r.role as ServicePersonRole);
  const combinedRoleLabels = currentRoles.map((r) => ROLE_LABELS[r] ?? r).join(", ");

  const kycColor =
    kycPct === 100 ? "text-green-600" : kycPct > 0 ? "text-amber-600" : "text-red-500";
  const kycBarColor =
    kycPct === 100 ? "bg-green-500" : kycPct > 0 ? "bg-amber-500" : "bg-red-400";

  const sentDate = inviteSentAt
    ? new Date(inviteSentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div className="border rounded-xl bg-white px-4 py-3.5 space-y-3">
      {/* Header row — avatar, name, role chips, email */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-brand-navy leading-tight">
              {person.client_profiles?.full_name ?? "Unknown"}
            </p>
            {currentRoles.map((r) => (
              <span key={r} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ROLE_COLORS[r] ?? "bg-gray-100 text-gray-600"}`}>
                {ROLE_LABELS[r] ?? r}
              </span>
            ))}
          </div>
          {person.client_profiles?.email && (
            <p className="text-xs text-gray-400">{person.client_profiles.email}</p>
          )}
        </div>
      </div>

      {/* KYC status bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${kycBarColor}`}
            style={{ width: `${kycPct}%` }}
          />
        </div>
        <span className={`text-[11px] font-medium tabular-nums ${kycColor}`}>
          KYC: {kycPct}%
        </span>
      </div>

      {/* Action row: Review KYC + Last request sent / Request KYC */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={onReviewKyc}
          className="h-7 px-3 text-xs gap-1.5"
        >
          Review KYC
        </Button>

        {inviteSentAt ? (
          <span className="text-[11px] text-green-600 flex items-center gap-1">
            <Mail className="h-3 w-3" />
            Last request sent on {sentDate}{inviteSentByName ? ` by ${inviteSentByName}` : ""}
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowInviteDialog(true)}
            className="h-7 px-3 text-xs gap-1.5 text-gray-500 hover:text-brand-navy"
          >
            <Mail className="h-3 w-3" />
            Request KYC
          </Button>
        )}
      </div>

      {showInviteDialog && (
        <InviteDialog
          person={person}
          serviceId={serviceId}
          combinedRoleLabels={combinedRoleLabels}
          onClose={() => setShowInviteDialog(false)}
          onSent={(sentAt) => setInviteSentAt(sentAt)}
        />
      )}
    </div>
  );
}

// ─── RoleToggleRow (B-046 batch 4) ────────────────────────────────────────────

const ROLE_TOGGLE_TONE: Record<ServicePersonRole, { active: string; inactive: string }> = {
  director: {
    active: "bg-blue-100 text-blue-700 border-blue-300",
    inactive: "bg-transparent text-blue-600/70 border-blue-200 hover:bg-blue-50",
  },
  shareholder: {
    active: "bg-purple-100 text-purple-700 border-purple-300",
    inactive: "bg-transparent text-purple-600/70 border-purple-200 hover:bg-purple-50",
  },
  ubo: {
    active: "bg-amber-100 text-amber-800 border-amber-300",
    inactive: "bg-transparent text-amber-700/70 border-amber-200 hover:bg-amber-50",
  },
};

function RoleToggleRow({
  serviceId,
  profileId,
  profileName,
  profileRoleRows,
  isIndividual,
  onRoleRemoved,
  onRoleAdded,
}: {
  serviceId: string;
  profileId: string;
  profileName: string;
  profileRoleRows: ServicePerson[];
  isIndividual: boolean;
  onRoleRemoved: (roleId: string) => void;
  onRoleAdded: (person: ServicePerson) => void;
}) {
  const [pending, setPending] = useState<Set<ServicePersonRole>>(new Set());

  function rowFor(role: ServicePersonRole): ServicePerson | undefined {
    return profileRoleRows.find((r) => r.role === role);
  }

  // UBO is hidden entirely for organisations.
  const visibleRoles: ServicePersonRole[] = isIndividual
    ? ["director", "shareholder", "ubo"]
    : ["director", "shareholder"];

  async function toggle(role: ServicePersonRole) {
    if (pending.has(role)) return;
    const existing = rowFor(role);
    setPending((prev) => new Set(prev).add(role));

    try {
      if (existing) {
        // Removing — confirm if it would leave 0 roles.
        const remainingAfter = profileRoleRows.filter((r) => r.id !== existing.id);
        if (remainingAfter.length === 0) {
          const ok = confirm(`${profileName} will have no role on this application. Continue?`);
          if (!ok) return;
        }
        // Optimistic remove
        onRoleRemoved(existing.id);
        const res = await fetch(`/api/services/${serviceId}/persons/${existing.id}`, {
          method: "DELETE",
        });
        if (!res.ok) {
          // Rollback by re-adding
          onRoleAdded(existing);
          toast.error(`Failed to remove ${ROLE_LABELS[role]} role`);
        }
      } else {
        // Adding — optimistic temp row, replaced with real id after API success.
        const tempId = `temp-${role}-${Date.now()}`;
        const tempPerson: ServicePerson = {
          id: tempId,
          role,
          shareholding_percentage: null,
          can_manage: false,
          invite_sent_at: null,
          invite_sent_by_name: null,
          client_profiles: profileRoleRows[0]?.client_profiles ?? null,
        };
        onRoleAdded(tempPerson);
        const res = await fetch(`/api/services/${serviceId}/persons`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role, client_profile_id: profileId }),
        });
        const data = (await res.json()) as { id?: string; error?: string };
        if (!res.ok || !data.id) {
          // Rollback
          onRoleRemoved(tempId);
          toast.error(data.error ?? `Failed to add ${ROLE_LABELS[role]} role`);
        } else {
          // Swap temp with real — remove temp, add real
          onRoleRemoved(tempId);
          onRoleAdded({ ...tempPerson, id: data.id });
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Role update failed");
    } finally {
      setPending((prev) => {
        const next = new Set(prev);
        next.delete(role);
        return next;
      });
    }
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {visibleRoles.map((role) => {
        const active = !!rowFor(role);
        const tone = ROLE_TOGGLE_TONE[role];
        const busy = pending.has(role);
        return (
          <button
            key={role}
            type="button"
            onClick={() => void toggle(role)}
            disabled={busy}
            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full border transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
              active ? tone.active : tone.inactive
            }`}
          >
            {ROLE_LABELS[role]}
            {active && <CheckCircle2 className="h-3 w-3" />}
          </button>
        );
      })}
    </div>
  );
}

// ─── ContactDetailsRow (B-046 batch 4) ────────────────────────────────────────

function ContactDetailsRow({
  profileId,
  initialEmail,
  initialPhone,
}: {
  profileId: string;
  initialEmail: string | null;
  initialPhone: string | null;
}) {
  const [email, setEmail] = useState(initialEmail ?? "");
  const [phone, setPhone] = useState(initialPhone ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || null, phone: phone.trim() || null }),
      });
      if (!res.ok) throw new Error("Save failed");
      setDirty(false);
      toast.success("Contact details saved", { position: "top-right" });
    } catch {
      toast.error("Failed to save contact details");
    } finally {
      setSaving(false);
    }
  }

  function onCancel() {
    setEmail(initialEmail ?? "");
    setPhone(initialPhone ?? "");
    setDirty(false);
  }

  return (
    <div className="border rounded-xl bg-white p-4 space-y-2">
      <p className="text-[10px] text-gray-600 font-semibold uppercase tracking-wide">
        Contact Details
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Email</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setDirty(true); }}
            placeholder="email@example.com"
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-gray-500">Phone</Label>
          <Input
            type="tel"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setDirty(true); }}
            placeholder="+230 555 0000"
            className="text-sm"
          />
        </div>
      </div>
      {dirty && (
        <div className="flex gap-2 justify-end pt-1">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving} className="h-7 px-3 text-xs">
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={saving}
            className="h-7 px-3 text-xs bg-brand-navy hover:bg-brand-blue"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save contact details"}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  serviceId: string;
  persons: ServicePerson[];
  documents: ClientServiceDoc[];
  onPersonsChange: (persons: ServicePerson[]) => void;
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  onNavVisibilityChange: (hide: boolean) => void;
}

export function ServiceWizardPeopleStep({
  serviceId,
  persons: initialPersons,
  documents,
  onPersonsChange,
  requirements,
  documentTypes,
  onNavVisibilityChange,
}: Props) {
  const [persons, setPersons] = useState<ServicePerson[]>(initialPersons);
  const [addingRole, setAddingRole] = useState<ServicePersonRole | null>(null);
  const [reviewingRoleId, setReviewingRoleId] = useState<string | null>(null);
  // Track which persons have completed KYC in this session (to show 100% locally)
  const [kycCompletedIds, setKycCompletedIds] = useState<Set<string>>(new Set());
  // B-043 — flush handle registered by the inner KycStepWizard so we can save
  // pending edits before the user leaves the review panel.
  const kycFlushRef = useRef<(() => Promise<boolean>) | null>(null);
  const [leaving, setLeaving] = useState(false);
  // B-046 batch 3 — Review-all walk-through state. `reviewAllOrder` is one
  // role-row id per unique profile (deduped, mirrors the card list); when
  // null, the wizard runs in single-person mode.
  const [reviewAllOrder, setReviewAllOrder] = useState<string[] | null>(null);
  const [reviewAllIndex, setReviewAllIndex] = useState(0);

  async function handleExitKycReview() {
    const flush = kycFlushRef.current;
    const exitWalk = () => {
      setReviewingRoleId(null);
      setReviewAllOrder(null);
      setReviewAllIndex(0);
    };
    if (!flush) {
      exitWalk();
      return;
    }
    setLeaving(true);
    try {
      const ok = await flush();
      if (!ok) {
        toast.error("Couldn't save your changes — please try again.");
        return;
      }
      exitWalk();
    } finally {
      setLeaving(false);
    }
  }

  /**
   * Build an ordered list of role-row IDs (one per unique profile, in card order)
   * and start the walk on the first person.
   */
  function startReviewAll() {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const p of persons) {
      const profileId = p.client_profiles?.id ?? p.id;
      if (!seen.has(profileId)) {
        seen.add(profileId);
        order.push(p.id);
      }
    }
    if (order.length === 0) return;
    setReviewAllOrder(order);
    setReviewAllIndex(0);
    setReviewingRoleId(order[0]);
  }

  // Hide/show outer wizard nav when entering/leaving KYC review
  useEffect(() => {
    onNavVisibilityChange(reviewingRoleId !== null);
  }, [reviewingRoleId, onNavVisibilityChange]);

  const handleAdded = useCallback(
    (person: ServicePerson) => {
      const next = [...persons, person];
      setPersons(next);
      onPersonsChange(next);
      // Auto-open Review KYC for the freshly added person.
      setReviewingRoleId(person.id);
    },
    [persons, onPersonsChange]
  );

  const handleRoleRemoved = useCallback(
    (roleId: string) => {
      const next = persons.filter((p) => p.id !== roleId);
      setPersons(next);
      onPersonsChange(next);
    },
    [persons, onPersonsChange]
  );

  const handleRoleAdded = useCallback(
    (person: ServicePerson) => {
      const next = [...persons, person];
      setPersons(next);
      onPersonsChange(next);
    },
    [persons, onPersonsChange]
  );

  // reviewingRoleId is any role ID for the profile being reviewed
  const reviewingPerson = reviewingRoleId
    ? persons.find((p) => p.id === reviewingRoleId) ?? null
    : null;

  // ─── KYC Review view ──────────────────────────────────────────────────────
  if (reviewingPerson) {
    const kycRecord = mapToKycRecord(reviewingPerson);
    const ddLevel = (reviewingPerson.client_profiles?.due_diligence_level as DueDiligenceLevel) ?? "cdd";
    const profileId = reviewingPerson.client_profiles?.id ?? "";
    const isIndividual = (reviewingPerson.client_profiles?.record_type ?? "individual") !== "organisation";
    // All role rows for this profile
    const profileRoleRows = persons.filter((p) => p.client_profiles?.id === profileId);

    const handleKycComplete = () => {
      setKycCompletedIds((prev) => {
        const next = new Set(prev);
        next.add(reviewingPerson.id);
        return next;
      });
      // Exit single-person review AND end any in-progress review-all walk.
      setReviewingRoleId(null);
      setReviewAllOrder(null);
      setReviewAllIndex(0);
    };

    // B-046 batch 3 — review-all walk context (only when reviewAllOrder is set).
    const reviewAllContext = reviewAllOrder
      ? {
          current: reviewAllIndex,
          total: reviewAllOrder.length,
          personName: reviewingPerson.client_profiles?.full_name ?? null,
          onAdvance: () => {
            const nextIndex = reviewAllIndex + 1;
            if (nextIndex >= reviewAllOrder.length) {
              // Defensive — final-step button only fires onAdvance when there's a next.
              setReviewAllOrder(null);
              setReviewAllIndex(0);
              setReviewingRoleId(null);
              return;
            }
            // Mark this person's KYC as completed locally so the card shows 100%.
            setKycCompletedIds((prev) => {
              const next = new Set(prev);
              next.add(reviewingPerson.id);
              return next;
            });
            setReviewAllIndex(nextIndex);
            setReviewingRoleId(reviewAllOrder[nextIndex]);
          },
        }
      : undefined;

    return (
      <div className="space-y-4">
        {/* Back + new top row (name + clickable role chips) */}
        <div className="space-y-2">
          <button
            onClick={() => void handleExitKycReview()}
            disabled={leaving}
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-semibold disabled:opacity-60"
          >
            {leaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />}
            {leaving ? "Saving…" : "Back to People"}
          </button>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-base font-semibold text-brand-navy">
              {reviewingPerson.client_profiles?.full_name ?? "Unknown"}
            </h3>
            <RoleToggleRow
              serviceId={serviceId}
              profileId={profileId}
              profileName={reviewingPerson.client_profiles?.full_name ?? "This person"}
              profileRoleRows={profileRoleRows}
              isIndividual={isIndividual}
              onRoleRemoved={handleRoleRemoved}
              onRoleAdded={handleRoleAdded}
            />
          </div>
          <p className="text-sm text-gray-600">
            Upload your KYC documents below — we&apos;ll auto-fill the rest of the form from them.
          </p>
        </div>

        {/* KYC documents — full-width two-column panel */}
        <div className="border rounded-xl bg-white p-4">
          <KycDocListPanel
            profileId={profileId}
            serviceId={serviceId}
            documents={documents}
            documentTypes={documentTypes}
            requirements={requirements}
            dueDiligenceLevel={ddLevel}
            onDocUploaded={(doc) => {
              const next = [...documents.filter((d) => !(d.document_type_id === doc.document_type_id && d.client_profile_id === doc.client_profile_id)), doc];
              // bubble up through the wizard chain — not strictly needed but kept for parity
              void next;
            }}
          />
        </div>

        {/* Contact details — single row, two inputs */}
        <ContactDetailsRow
          profileId={profileId}
          initialEmail={reviewingPerson.client_profiles?.email ?? null}
          initialPhone={reviewingPerson.client_profiles?.phone ?? null}
        />

        {kycRecord.id ? (
          <KycStepWizard
            // Force a remount when the active person changes — internal state
            // (currentStep, form) initialises from kycRecord on mount only.
            key={reviewingPerson.id}
            clientId={profileId}
            kycRecord={kycRecord}
            documents={documents
              .filter((d) => d.client_profile_id === profileId)
              .map(mapToDocumentRecord)}
            documentTypes={documentTypes}
            dueDiligenceLevel={ddLevel}
            requirements={requirements}
            profileType={reviewingPerson.client_profiles?.record_type === "organisation" ? "organisation" : "individual"}
            onComplete={handleKycComplete}
            compact={false}
            fixedNav
            showErrorsImmediately
            saveUrl="/api/profiles/kyc/save"
            inlineMode={true}
            showContactFields={false}
            hideDocumentUploads={true}
            personDocs={documents
              .filter((d) => d.client_profile_id === profileId)
              .map(mapToDocumentRecord)}
            personDocTypes={documentTypes}
            onRegisterFlush={(fn) => { kycFlushRef.current = fn; }}
            reviewAllContext={reviewAllContext}
          />
        ) : (
          <div className="text-center py-6 rounded-xl border bg-gray-50 space-y-2">
            <p className="text-sm text-gray-500">No KYC record found for this person.</p>
            <p className="text-xs text-gray-400">
              A KYC record is created automatically once the person is linked to a service. Try refreshing if this person was recently added.
            </p>
            <Button onClick={() => setReviewingRoleId(null)} variant="outline" size="sm" className="mt-2">
              Back to People
            </Button>
          </div>
        )}
      </div>
    );
  }

  // ─── Roster view ─────────────────────────────────────────────────────────
  const hasDirector = persons.some((p) => p.role === "director");
  const shareholders = persons.filter((p) => p.role === "shareholder");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">People & KYC</h2>
        <p className="text-sm text-gray-500">
          Add directors, shareholders, and UBOs. Click &quot;Review KYC&quot; to complete each person&apos;s compliance information.
        </p>
      </div>

      {/* Top toolbar — Add buttons left, Review-All on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {ROLE_LIST.map((role) => (
            <Button
              key={role}
              size="sm"
              variant="outline"
              onClick={() => setAddingRole(role)}
              className="gap-1.5 border-dashed"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add {ROLE_LABELS[role]}
            </Button>
          ))}
        </div>
        {persons.length > 0 && (
          <Button
            size="sm"
            onClick={startReviewAll}
            className="bg-brand-navy hover:bg-brand-blue gap-1.5"
          >
            Review all KYC
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Person cards — deduplicated by profile, combined roles */}
      {persons.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">
          No people added yet. Use the buttons above to get started.
        </p>
      ) : (
        <div className="space-y-2.5">
          {(() => {
            // Group by profile ID to deduplicate — keep all role rows per profile
            const profileMap = new Map<string, { person: ServicePerson; roleRows: ServicePerson[] }>();
            for (const p of persons) {
              const profileId = p.client_profiles?.id ?? p.id;
              const existing = profileMap.get(profileId);
              if (existing) {
                existing.roleRows.push(p);
              } else {
                profileMap.set(profileId, { person: p, roleRows: [p] });
              }
            }
            return Array.from(profileMap.values()).map(({ person, roleRows }) => {
              const rawPct = calcKycPct(person.client_profiles?.client_profile_kyc ?? null);
              const kycPct = roleRows.some((rr) => kycCompletedIds.has(rr.id)) ? 100 : rawPct;
              return (
                <PersonCard
                  key={person.client_profiles?.id ?? person.id}
                  person={person}
                  serviceId={serviceId}
                  kycPct={kycPct}
                  onReviewKyc={() => setReviewingRoleId(person.id)}
                  allRoleRows={roleRows}
                  onRoleRemoved={handleRoleRemoved}
                  onRoleAdded={handleRoleAdded}
                />
              );
            });
          })()}
        </div>
      )}

      {/* Ownership Structure visual */}
      <OwnershipStructure
        shareholders={shareholders}
        serviceId={serviceId}
        onSaved={(roleId, pct) => {
          const next = persons.map((p) =>
            p.id === roleId ? { ...p, shareholding_percentage: pct } : p
          );
          setPersons(next);
          onPersonsChange(next);
        }}
      />

      {/* Director warning */}
      {!hasDirector && persons.length > 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          At least one director is required.
        </p>
      )}

      {addingRole && (
        <AddPersonModal
          serviceId={serviceId}
          role={addingRole}
          currentPersons={persons}
          onClose={() => setAddingRole(null)}
          onAdded={handleAdded}
        />
      )}
    </div>
  );
}
