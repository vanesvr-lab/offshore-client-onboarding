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
  FileText,
  ToggleLeft,
  ToggleRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ClientProfile, ClientProfileKyc, ProfileServiceRole, DocumentRecord, DueDiligenceRequirement, RoleDocumentRequirement, ProfileRequirementOverride } from "@/types";

interface Props {
  profile: ClientProfile;
  kyc: ClientProfileKyc | null;
  roles: ProfileServiceRole[];
  documents: DocumentRecord[];
  ddRequirements: DueDiligenceRequirement[];
  roleRequirements: RoleDocumentRequirement[];
  requirementOverrides: ProfileRequirementOverride[];
}

// KYC field definitions for display
const INDIVIDUAL_SECTIONS = [
  {
    title: "Identity",
    fields: [
      { key: "aliases", label: "Aliases" },
      { key: "date_of_birth", label: "Date of Birth" },
      { key: "nationality", label: "Nationality" },
      { key: "passport_country", label: "Passport Country" },
      { key: "passport_number", label: "Passport Number" },
      { key: "passport_expiry", label: "Passport Expiry" },
      { key: "occupation", label: "Occupation" },
      { key: "tax_identification_number", label: "Tax ID" },
    ],
  },
  {
    title: "Financial",
    fields: [
      { key: "source_of_funds_description", label: "Source of Funds" },
      { key: "source_of_wealth_description", label: "Source of Wealth" },
    ],
  },
  {
    title: "Declarations",
    fields: [
      { key: "is_pep", label: "Politically Exposed Person" },
      { key: "pep_details", label: "PEP Details" },
      { key: "legal_issues_declared", label: "Legal Issues Declared" },
      { key: "legal_issues_details", label: "Legal Issue Details" },
    ],
  },
];

const ORG_SECTIONS = [
  {
    title: "Organisation Details",
    fields: [
      { key: "business_website", label: "Website" },
      { key: "jurisdiction_incorporated", label: "Jurisdiction" },
      { key: "date_of_incorporation", label: "Date of Incorporation" },
      { key: "listed_or_unlisted", label: "Listed / Unlisted" },
      { key: "jurisdiction_tax_residence", label: "Tax Jurisdiction" },
      { key: "description_activity", label: "Business Activity" },
      { key: "company_registration_number", label: "Registration #" },
      { key: "industry_sector", label: "Industry" },
      { key: "regulatory_licenses", label: "Licenses" },
    ],
  },
];

function KycSection({
  title,
  fields,
  data,
}: {
  title: string;
  fields: { key: string; label: string }[];
  data: Record<string, unknown>;
}) {
  const [open, setOpen] = useState(true);
  const filled = fields.filter((f) => data[f.key] != null && data[f.key] !== "").length;
  const total = fields.length;
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  const color = pct === 100 ? "text-green-600" : pct > 0 ? "text-amber-600" : "text-red-500";

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <span className="text-sm font-medium text-gray-900">{title}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${color}`}>
            {filled}/{total}
          </span>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
        </div>
      </button>
      {open && (
        <div className="px-4 py-3 grid grid-cols-2 gap-3">
          {fields.map((f) => {
            const val = data[f.key];
            const display =
              val === true ? "Yes" : val === false ? "No" : val != null ? String(val) : "—";
            return (
              <div key={f.key}>
                <span className="text-[10px] uppercase text-gray-400 font-medium">{f.label}</span>
                <p className={`text-sm ${val != null && val !== "" ? "text-gray-900" : "text-gray-300"}`}>
                  {display}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

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

export function ProfileDetailClient({ profile, kyc, roles, documents, ddRequirements, roleRequirements, requirementOverrides }: Props) {
  const router = useRouter();
  const [ddLevel, setDdLevel] = useState(profile.due_diligence_level);
  const [savingDd, setSavingDd] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);

  const isRep = profile.is_representative;
  const isOrg = profile.record_type === "organisation";
  const hasLogin = profile.user_id != null;
  const userInfo = profile.users as { email?: string; is_active?: boolean } | null;

  const sections = isOrg ? ORG_SECTIONS : INDIVIDUAL_SECTIONS;

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

          {/* KYC Sections (only for non-representatives) */}
          {!isRep && kyc && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-gray-700">KYC Details</h2>
              {sections.map((s) => (
                <KycSection
                  key={s.title}
                  title={s.title}
                  fields={s.fields}
                  data={kyc as unknown as Record<string, unknown>}
                />
              ))}
            </div>
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

          {/* Documents */}
          {documents.length > 0 && (
            <Card>
              <CardHeader className="py-3">
                <CardTitle className="text-sm text-brand-navy">Documents ({documents.length})</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between border rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <div>
                        <p className="text-sm text-gray-900">{doc.file_name}</p>
                        <p className="text-[10px] text-gray-400">
                          {(doc as unknown as { document_types?: { name: string } }).document_types?.name ?? "Unknown type"}
                        </p>
                      </div>
                    </div>
                    <span className={`text-xs ${
                      doc.verification_status === "verified" ? "text-green-600" :
                      doc.verification_status === "flagged" ? "text-amber-600" : "text-gray-400"
                    }`}>
                      {doc.verification_status}
                    </span>
                  </div>
                ))}
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
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize ${
                        svc.status === "approved" ? "bg-green-100 text-green-700" :
                        svc.status === "rejected" ? "bg-red-100 text-red-700" :
                        svc.status === "draft" ? "bg-gray-100 text-gray-600" :
                        "bg-blue-100 text-blue-700"
                      }`}>
                        {svc.status.replace("_", " ")}
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
    </div>
  );
}
