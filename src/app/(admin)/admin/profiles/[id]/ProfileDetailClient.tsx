"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Shield,
  UserCheck,
  Building2,
  Users2,
  CheckCircle,
  XCircle,
  Send,
  Loader2,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
  UserPlus,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { CreateProfileDialog, type CreatedProfileSummary } from "@/components/admin/CreateProfileDialog";
import type {
  ClientProfile,
  ClientProfileKyc,
  ProfileServiceRole,
  DocumentRecord,
  DocumentType,
  DueDiligenceRequirement,
  RoleDocumentRequirement,
  ProfileRequirementOverride,
  KycRecord,
} from "@/types";
import { getStatusBadgeClass, getStatusLabel } from "@/lib/services/statusChain";
import { IndividualKycForm } from "@/components/kyc/IndividualKycForm";
import { OrganisationKycForm } from "@/components/kyc/OrganisationKycForm";
import { KycDocsSummary } from "@/components/kyc/KycDocsSummary";
import { KycDocsByCategory } from "@/components/kyc/KycDocsByCategory";
import type { KycDocRowData } from "@/components/kyc/KycDocRow";
import { kycCategoryLabel, sortKycCategories } from "@/lib/kyc/categories";

interface RepCandidate {
  id: string;
  full_name: string;
  email: string | null;
}

interface Props {
  profile: ClientProfile;
  kyc: ClientProfileKyc | null;
  roles: ProfileServiceRole[];
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  ddRequirements: DueDiligenceRequirement[];
  roleRequirements: RoleDocumentRequirement[];
  requirementOverrides: ProfileRequirementOverride[];
  availableReps: RepCandidate[];
}

// B-147 — same category gating as the per-director card on
// /admin/services/[id]: only "identity", "financial", "compliance"
// document types belong in the KYC docs grid; everything else
// (Service/Other) shows up on the service detail page instead.
const KYC_DOC_CATEGORIES = ["identity", "financial", "compliance"] as const;
const isKycDoc = (category: string | null | undefined): boolean =>
  (KYC_DOC_CATEGORIES as readonly string[]).includes(category ?? "");

function RequirementsPanel({
  profileId,
  ddRequirements,
  roleRequirements,
  initialOverrides,
}: {
  profileId: string;
  ddRequirements: DueDiligenceRequirement[];
  roleRequirements: RoleDocumentRequirement[];
  initialOverrides: ProfileRequirementOverride[];
}) {
  const [overrides, setOverrides] = useState(
    new Map(initialOverrides.map((o) => [o.requirement_id, o]))
  );
  const [waivedId, setWaivedId] = useState<string | null>(null);
  const [reasonInputs, setReasonInputs] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);

  async function toggleWaiver(reqId: string) {
    const existing = overrides.get(reqId);
    setWaivedId(reqId);
    try {
      if (existing) {
        // Remove waiver → reinstate
        const res = await fetch(
          `/api/admin/profiles/${profileId}/requirement-overrides/${reqId}`,
          { method: "DELETE" }
        );
        const data = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed");
        setOverrides((prev) => {
          const next = new Map(prev);
          next.delete(reqId);
          return next;
        });
        toast.success("Requirement reinstated");
      } else {
        // Create waiver
        const reason = reasonInputs[reqId] ?? "";
        const res = await fetch(`/api/admin/profiles/${profileId}/requirement-overrides`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirement_id: reqId, reason }),
        });
        const data = (await res.json()) as { override?: ProfileRequirementOverride; error?: string };
        if (!res.ok) throw new Error(data.error ?? "Failed");
        setOverrides((prev) => {
          const next = new Map(prev);
          next.set(reqId, data.override!);
          return next;
        });
        toast.success("Requirement waived");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setWaivedId(null);
    }
  }

  const totalReqs = ddRequirements.length + roleRequirements.length;
  const waivedCount = overrides.size;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-medium text-gray-900">Requirements</span>
        <div className="flex items-center gap-2">
          {waivedCount > 0 && (
            <span className="text-xs text-amber-600 font-medium">{waivedCount} waived</span>
          )}
          <span className="text-xs text-gray-500">{totalReqs} total</span>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-4">
          {/* DD Requirements */}
          {ddRequirements.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">
                Due Diligence Requirements
              </p>
              <div className="space-y-2">
                {ddRequirements.map((req) => {
                  const isWaived = overrides.has(req.id);
                  const override = overrides.get(req.id);
                  const isBusy = waivedId === req.id;
                  return (
                    <div
                      key={req.id}
                      className={`border rounded-lg p-2.5 ${isWaived ? "opacity-60 bg-gray-50" : "bg-white"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${isWaived ? "line-through text-gray-400" : "text-gray-800"}`}>
                            {req.label}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] capitalize text-gray-400">{req.requirement_type}</span>
                            <span className="text-[10px] text-gray-300">·</span>
                            <span className="text-[10px] text-gray-400 uppercase">{req.level}</span>
                            <span className="text-[10px] text-gray-300">·</span>
                            <span className="text-[10px] text-gray-400">{req.applies_to}</span>
                          </div>
                          {override?.reason && (
                            <p className="text-[11px] text-amber-600 mt-1">Waiver reason: {override.reason}</p>
                          )}
                          {!isWaived && (
                            <div className="mt-1.5">
                              <input
                                type="text"
                                placeholder="Reason for waiver (optional)"
                                value={reasonInputs[req.id] ?? ""}
                                onChange={(e) => setReasonInputs((p) => ({ ...p, [req.id]: e.target.value }))}
                                className="w-full text-xs border rounded px-2 py-1 text-gray-600 placeholder-gray-300"
                              />
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => void toggleWaiver(req.id)}
                          disabled={isBusy}
                          className={`shrink-0 flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
                            isWaived
                              ? "text-green-600 hover:text-green-700 bg-green-50"
                              : "text-amber-600 hover:text-amber-700 bg-amber-50"
                          }`}
                          title={isWaived ? "Reinstate requirement" : "Waive requirement"}
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : isWaived ? (
                            <ToggleRight className="h-3.5 w-3.5" />
                          ) : (
                            <ToggleLeft className="h-3.5 w-3.5" />
                          )}
                          {isWaived ? "Reinstate" : "Waive"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Role Document Requirements */}
          {roleRequirements.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide mb-2">
                Role Document Requirements
              </p>
              <div className="space-y-1.5">
                {roleRequirements.map((req) => (
                  <div key={req.id} className="flex items-center justify-between border rounded-lg px-3 py-2 bg-white">
                    <div>
                      <p className="text-sm text-gray-700">{req.document_types?.name ?? req.document_type_id}</p>
                      <p className="text-[10px] text-gray-400 capitalize">{req.role.replace("_", " ")}</p>
                    </div>
                    <CheckCircle className="h-3.5 w-3.5 text-gray-300" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalReqs === 0 && (
            <p className="text-sm text-gray-400 py-2">No requirements configured for this profile&apos;s level and roles.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function ProfileDetailClient({ profile, kyc, roles, documents, documentTypes, ddRequirements, roleRequirements, requirementOverrides, availableReps }: Props) {
  const router = useRouter();
  const [ddLevel, setDdLevel] = useState(profile.due_diligence_level);
  const [savingDd, setSavingDd] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  // B-147 Batch 2 — filing-rep affordance state. Mirrors the inline UI on
  // the service-detail per-director card. Uses the same picker dialog +
  // CreateProfileDialog (forced-rep mode) flow; PATCH writes
  // filing_rep_profile_id on /api/admin/profiles-v2/[id], same endpoint
  // as the service-detail surface so the audit log + rep validation are
  // shared.
  const [repPickerOpen, setRepPickerOpen] = useState(false);
  const [repPickerSelectedId, setRepPickerSelectedId] = useState<string | null>(
    profile.filing_rep_profile_id ?? null,
  );
  const [savingRep, setSavingRep] = useState(false);
  const [showCreateRepDialog, setShowCreateRepDialog] = useState(false);
  const [extraReps, setExtraReps] = useState<RepCandidate[]>([]);

  const repsForPicker = (() => {
    const byId = new Map<string, RepCandidate>();
    for (const r of availableReps) byId.set(r.id, r);
    for (const r of extraReps) byId.set(r.id, r);
    // Ensure the currently-linked rep shows in the dropdown even if it
    // isn't in the pool (e.g. created by another admin since the page
    // loaded).
    if (
      profile.filing_rep_profile_id &&
      profile.filing_rep &&
      !byId.has(profile.filing_rep_profile_id)
    ) {
      byId.set(profile.filing_rep_profile_id, {
        id: profile.filing_rep_profile_id,
        full_name: profile.filing_rep.full_name ?? "",
        email: profile.filing_rep.email ?? null,
      });
    }
    return Array.from(byId.values()).sort((a, b) =>
      (a.full_name ?? "").localeCompare(b.full_name ?? ""),
    );
  })();

  function handleRepCreated(summary: CreatedProfileSummary) {
    setShowCreateRepDialog(false);
    const next: RepCandidate = {
      id: summary.id,
      full_name: summary.full_name,
      email: summary.email,
    };
    setExtraReps((prev) =>
      prev.some((r) => r.id === next.id) ? prev : [next, ...prev],
    );
    setRepPickerSelectedId(next.id);
  }

  async function saveFilingRep() {
    setSavingRep(true);
    try {
      const res = await fetch(`/api/admin/profiles-v2/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filing_rep_profile_id: repPickerSelectedId ?? null }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      toast.success(
        repPickerSelectedId ? "Representative linked" : "Representative removed",
      );
      setRepPickerOpen(false);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setSavingRep(false);
    }
  }

  const isRep = profile.is_representative;
  const isOrg = profile.record_type === "organisation";
  const hasLogin = profile.user_id != null;
  const userInfo = profile.users as { email?: string; is_active?: boolean } | null;

  // B-147 — adapt `client_profile_kyc` + the profile contact fields into
  // the legacy `KycRecord` shape that IndividualKycForm / OrganisationKycForm
  // expect. The forms save via /api/profiles/kyc/save using `kycRecordId`,
  // which the endpoint resolves against `client_profile_kyc.id` — so as
  // long as we pass the row's id we're aligned. Mirrors the pattern used
  // by /filings/[profileId]/page.tsx (B-134).
  const kycRecord: KycRecord | null = kyc
    ? ({
        ...(kyc as unknown as Record<string, unknown>),
        id: kyc.id,
        record_type: profile.record_type,
        full_name: profile.full_name,
        email: profile.email,
        phone: profile.phone,
        address: profile.address,
      } as unknown as KycRecord)
    : null;

  // B-147 — KYC documents grid + summary (same data model as
  // ServiceDetailClient's PersonCard). Service-scoped waivers don't
  // apply on the profile-canonical view, so the rows aren't marked
  // as waived here. Document types outside identity/financial/compliance
  // are filtered out (those belong on the service detail page).
  const kycDocTypes = documentTypes.filter((dt) => isKycDoc(dt.category));
  const kycDocsByCategory = (() => {
    const groups: Record<string, DocumentType[]> = {};
    for (const dt of kycDocTypes) {
      const cat = dt.category || "additional";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(dt);
    }
    const present = sortKycCategories(Object.keys(groups));
    return present.map((cat) => ({
      key: cat,
      label: kycCategoryLabel(cat),
      docs: groups[cat].map<KycDocRowData>((dt) => {
        const uploaded = documents.find((d) => d.document_type_id === dt.id);
        return {
          id: uploaded?.id ?? null,
          document_type_id: dt.id,
          document_name: dt.name,
          is_uploaded: !!uploaded,
          verification_status: uploaded?.verification_status ?? null,
          admin_status: (uploaded as { admin_status?: string | null } | undefined)?.admin_status ?? null,
          file_name: uploaded?.file_name ?? null,
          mime_type: (uploaded as { mime_type?: string | null } | undefined)?.mime_type ?? null,
          uploaded_at: uploaded?.uploaded_at ?? null,
          verification_result: (uploaded?.verification_result as Record<string, unknown> | null) ?? null,
          admin_status_note: (uploaded as { admin_status_note?: string | null } | undefined)?.admin_status_note ?? null,
          admin_status_at: (uploaded as { admin_status_at?: string | null } | undefined)?.admin_status_at ?? null,
          expiry_date: (uploaded as { expiry_date?: string | null } | undefined)?.expiry_date ?? null,
          valid_for_months: dt.valid_for_months ?? null,
          is_waived: false,
          waived_at: null,
          waived_by_name: null,
          is_profile_scoped: !!uploaded && (uploaded as { service_id?: string | null }).service_id == null,
        };
      }),
    }));
  })();
  const totalKycDocs = kycDocsByCategory.reduce((acc, c) => acc + c.docs.length, 0);
  const totalKycUploaded = kycDocsByCategory.reduce(
    (acc, c) => acc + c.docs.filter((d) => d.is_uploaded).length,
    0,
  );

  // Unique services from roles
  const serviceMap = new Map<string, { id: string; name: string; status: string; roles: string[]; canManage: boolean }>();
  for (const r of roles) {
    const svc = r.services as { id: string; status: string; service_templates?: { name: string } | null } | null;
    if (!svc) continue;
    const existing = serviceMap.get(svc.id);
    if (existing) {
      existing.roles.push(r.role);
      if (r.can_manage) existing.canManage = true;
    } else {
      serviceMap.set(svc.id, {
        id: svc.id,
        name: svc.service_templates?.name ?? "Unknown",
        status: svc.status,
        roles: [r.role],
        canManage: r.can_manage,
      });
    }
  }
  const services = Array.from(serviceMap.values());

  async function handleDdChange(level: string) {
    setDdLevel(level as "sdd" | "cdd" | "edd");
    setSavingDd(true);
    try {
      const res = await fetch(`/api/admin/profiles-v2/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_diligence_level: level }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("DD level updated");
    } catch {
      toast.error("Failed to update DD level");
    } finally {
      setSavingDd(false);
    }
  }

  async function handleSendInvite() {
    if (!profile.email) {
      toast.error("Profile has no email — add an email first");
      return;
    }
    setSendingInvite(true);
    try {
      const res = await fetch(`/api/admin/profiles/${profile.id}/send-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      toast.success("Invite sent!");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSendingInvite(false);
    }
  }

  return (
    <div>
      {/* Back */}
      <Link
        href="/admin/profiles"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-navy mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to profiles
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2">
            {isRep ? (
              <Users2 className="h-5 w-5 text-blue-500" />
            ) : isOrg ? (
              <Building2 className="h-5 w-5 text-purple-500" />
            ) : (
              <UserCheck className="h-5 w-5 text-emerald-600" />
            )}
            <h1 className="text-2xl font-bold text-brand-navy">{profile.full_name}</h1>
          </div>
          <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
            <span className="capitalize">{isRep ? "Representative" : profile.record_type}</span>
            {profile.email && <span>· {profile.email}</span>}
            {profile.phone && <span>· {profile.phone}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!isRep && (
            <div className="flex items-center gap-1.5">
              <Shield className="h-4 w-4 text-gray-400" />
              <select
                value={ddLevel}
                onChange={(e) => void handleDdChange(e.target.value)}
                disabled={savingDd}
                className="h-8 rounded-md border border-gray-200 px-2 text-xs"
              >
                <option value="sdd">SDD</option>
                <option value="cdd">CDD</option>
                <option value="edd">EDD</option>
              </select>
            </div>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => void handleSendInvite()}
            disabled={sendingInvite || !profile.email}
          >
            {sendingInvite ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}
            Send Invite
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: KYC sections */}
        <div className="col-span-2 space-y-4">
          {/* Contact info card */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-brand-navy">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-3 gap-4">
              <div>
                <span className="text-[10px] uppercase text-gray-400 font-medium">Full Name</span>
                <p className="text-sm text-gray-900">{profile.full_name}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-gray-400 font-medium">Email</span>
                <p className="text-sm text-gray-900">{profile.email ?? "—"}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-gray-400 font-medium">Phone</span>
                <p className="text-sm text-gray-900">{profile.phone ?? "—"}</p>
              </div>
              <div className="col-span-3">
                <span className="text-[10px] uppercase text-gray-400 font-medium">Address</span>
                <p className="text-sm text-gray-900">{profile.address ?? "—"}</p>
              </div>
            </CardContent>
          </Card>

          {/* B-147 Batch 2 — Filing-rep affordance. Same inline pattern as
              the service-detail per-director card (B-134): "Filed by [name]
              [change]" badge when a rep is linked, "+ Add representative
              for KYC" button when not. Hidden for representative profiles
              themselves (reps don't have reps). */}
          {!isRep && (
            <Card>
              <CardContent className="py-3 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Shield className="h-4 w-4 text-gray-400" />
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                    Filing Representative
                  </span>
                </div>
                {!profile.filing_rep_profile_id ? (
                  <button
                    type="button"
                    onClick={() => {
                      setRepPickerSelectedId(profile.filing_rep_profile_id ?? null);
                      setRepPickerOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-xs text-brand-navy hover:text-brand-blue underline-offset-2 hover:underline"
                  >
                    <UserPlus className="h-3 w-3" />
                    + Add representative for KYC
                  </button>
                ) : (
                  <div className="inline-flex items-center gap-2 text-xs text-gray-600">
                    <UserCheck className="h-3 w-3 text-purple-600" />
                    <span>
                      Filed by{" "}
                      <span className="font-medium text-gray-800">
                        {profile.filing_rep?.full_name ?? "representative"}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setRepPickerSelectedId(profile.filing_rep_profile_id ?? null);
                        setRepPickerOpen(true);
                      }}
                      className="text-[10px] text-gray-500 hover:text-gray-700 underline"
                    >
                      change
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* B-147 — Rich editable KYC long form. Replaces the previous
              display-mostly <KycSection> grid. Same form components the
              client portal + filing-rep page use; saves via
              /api/profiles/kyc/save using `client_profile_kyc.id`. */}
          {!isRep && kycRecord && (
            isOrg ? (
              <OrganisationKycForm
                record={kycRecord}
                documents={documents}
                documentTypes={documentTypes}
              />
            ) : (
              <IndividualKycForm
                record={kycRecord}
                documents={documents}
                documentTypes={documentTypes}
              />
            )
          )}

          {isRep && (
            <Card>
              <CardContent className="py-6 text-center text-sm text-gray-400">
                Representatives do not require KYC
              </CardContent>
            </Card>
          )}

          {/* Requirements with waiver toggles */}
          {!isRep && (
            <RequirementsPanel
              profileId={profile.id}
              ddRequirements={ddRequirements}
              roleRequirements={roleRequirements}
              initialOverrides={requirementOverrides}
            />
          )}

          {/* B-147 — KYC Documents card. Replaces the previous flat
              documents list with the per-category grid + summary header
              used on the service-detail per-director card. Waiver
              affordances stay disabled here because waivers are
              service-scoped; admins manage them inside a specific
              service. */}
          {!isRep && totalKycDocs > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-brand-navy">KYC Documents</CardTitle>
                <div className="mt-2">
                  <KycDocsSummary
                    uploadCount={totalKycUploaded}
                    totalCount={totalKycDocs}
                    byCategory={kycDocsByCategory.map((c) => ({
                      key: c.key,
                      label: c.label,
                      uploaded: c.docs.filter((d) => d.is_uploaded).length,
                      total: c.docs.length,
                    }))}
                  />
                </div>
              </CardHeader>
              <CardContent>
                <KycDocsByCategory
                  anchorPrefix={`admin-docs-${profile.id}`}
                  showAdminControls
                  categories={kycDocsByCategory}
                  profileId={profile.id}
                />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Services + Status */}
        <div className="space-y-4">
          {/* Login status */}
          <Card>
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">Portal Access</span>
                {hasLogin ? (
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Has login
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <XCircle className="h-3.5 w-3.5" />
                    No login
                  </span>
                )}
              </div>
              {userInfo?.email && (
                <p className="text-xs text-gray-400 mt-1">Login email: {userInfo.email}</p>
              )}
            </CardContent>
          </Card>

          {/* Services */}
          <Card>
            <CardHeader className="py-3">
              <CardTitle className="text-sm text-brand-navy">
                Services ({services.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {services.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">Not linked to any services</p>
              ) : (
                services.map((svc) => (
                  <div key={svc.id} className="border rounded-lg px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-brand-navy">{svc.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${getStatusBadgeClass(svc.status)}`}>
                        {getStatusLabel(svc.status)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] text-gray-400">
                        {svc.roles.join(", ")}
                      </span>
                      {svc.canManage && (
                        <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">
                          can manage
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* KYC Completion */}
          {!isRep && kyc && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-brand-navy">KYC Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Completion</span>
                  <span className={`text-xs font-medium ${
                    kyc.completion_status === "complete" ? "text-green-600" : "text-amber-600"
                  }`}>
                    {kyc.completion_status === "complete" ? "Complete" : "Incomplete"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-sm text-gray-600">KYC Journey</span>
                  <span className={`text-xs font-medium ${
                    kyc.kyc_journey_completed ? "text-green-600" : "text-gray-400"
                  }`}>
                    {kyc.kyc_journey_completed ? "Completed" : "Not completed"}
                  </span>
                </div>
                {kyc.risk_rating && (
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-sm text-gray-600">Risk Rating</span>
                    <span className={`text-xs font-medium capitalize ${
                      kyc.risk_rating === "low" ? "text-green-600" :
                      kyc.risk_rating === "medium" ? "text-amber-600" :
                      "text-red-600"
                    }`}>
                      {kyc.risk_rating}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* B-147 Batch 2 — Filing-rep picker dialog. Same shape as the
          service-detail per-director card's picker (B-134): existing
          reps in a dropdown + an inline "+ Add new representative"
          escape hatch that opens the forced-rep CreateProfileDialog.
          Save PATCHes /api/admin/profiles-v2/[id] which writes
          filing_rep_profile_id; router.refresh re-fetches the joined
          rep display. */}
      <Dialog
        open={repPickerOpen}
        onOpenChange={(open) => {
          if (!savingRep) setRepPickerOpen(open);
        }}
      >
        <DialogContent className="bg-white max-w-md">
          <DialogHeader>
            <DialogTitle>
              Filing representative for {profile.full_name ?? "this profile"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-700">
                Representative
              </label>
              <select
                value={repPickerSelectedId ?? ""}
                onChange={(e) => setRepPickerSelectedId(e.target.value || null)}
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
              >
                <option value="">— No representative —</option>
                {repsForPicker.map((rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.full_name}
                    {rep.email ? ` — ${rep.email}` : ""}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowCreateRepDialog(true)}
                className="text-xs text-brand-navy hover:underline"
              >
                + Add new representative
              </button>
            </div>
            <p className="text-xs text-gray-500">
              The selected representative can complete KYC paperwork on
              this profile&rsquo;s behalf and will receive a one-time
              login link.
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={savingRep}
              onClick={() => setRepPickerOpen(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={
                savingRep ||
                (repPickerSelectedId ?? null) === (profile.filing_rep_profile_id ?? null)
              }
              onClick={() => void saveFilingRep()}
            >
              {savingRep ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showCreateRepDialog && (
        <CreateProfileDialog
          open
          onClose={() => setShowCreateRepDialog(false)}
          forceIsRepresentative
          onCreated={handleRepCreated}
        />
      )}
    </div>
  );
}
