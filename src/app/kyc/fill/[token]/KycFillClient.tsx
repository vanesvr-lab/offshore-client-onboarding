"use client";

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Shield, CheckCircle, Loader2, Upload, AlertCircle } from "lucide-react";
import type {
  KycRecord,
  DocumentRecord,
  RoleDocumentRequirement,
  DueDiligenceRequirement,
  DueDiligenceLevel,
} from "@/types";
import { getEffectiveDdLevel } from "@/lib/utils/profileDocumentRequirements";

// Individual KYC fields
const INDIVIDUAL_FIELDS: { key: string; label: string; type?: string }[] = [
  { key: "full_name", label: "Full Name" },
  { key: "email", label: "Email", type: "email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Residential Address" },
  { key: "work_address", label: "Work Address" },
  { key: "work_phone", label: "Work Phone" },
  { key: "work_email", label: "Work Email", type: "email" },
  { key: "date_of_birth", label: "Date of Birth", type: "date" },
  { key: "nationality", label: "Nationality" },
  { key: "passport_country", label: "Passport Country" },
  { key: "passport_number", label: "Passport Number" },
  { key: "passport_expiry", label: "Passport Expiry", type: "date" },
  { key: "occupation", label: "Occupation" },
  { key: "tax_identification_number", label: "Tax Identification Number" },
  { key: "source_of_funds_description", label: "Source of Funds" },
  { key: "source_of_wealth_description", label: "Source of Wealth" },
];

type PageState = "code_entry" | "form" | "expired" | "error";

interface ClientInfo {
  id: string;
  company_name: string;
  due_diligence_level: DueDiligenceLevel | null;
}

export function KycFillClient({ token }: { token: string }) {
  const [state, setState] = useState<PageState>("code_entry");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [kycRecord, setKycRecord] = useState<KycRecord | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [roleDocReqs, setRoleDocReqs] = useState<RoleDocumentRequirement[]>([]);
  const [, setDdReqs] = useState<DueDiligenceRequirement[]>([]);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const verifyCode = useCallback(async () => {
    setVerifying(true);
    try {
      const res = await fetch("/api/kyc/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code }),
      });
      const data = (await res.json()) as {
        verified?: boolean;
        error?: string;
        kycRecord?: KycRecord;
        client?: ClientInfo;
        documents?: DocumentRecord[];
        roleDocRequirements?: RoleDocumentRequirement[];
        ddRequirements?: DueDiligenceRequirement[];
      };

      if (!res.ok) {
        if (res.status === 410) {
          setState("expired");
          return;
        }
        toast.error(data.error ?? "Verification failed");
        return;
      }

      if (data.verified && data.kycRecord) {
        setKycRecord(data.kycRecord);
        setClient(data.client ?? null);
        setDocuments(data.documents ?? []);
        setRoleDocReqs(data.roleDocRequirements ?? []);
        setDdReqs(data.ddRequirements ?? []);

        // Pre-fill form with existing KYC data
        const initial: Record<string, string> = {};
        INDIVIDUAL_FIELDS.forEach(({ key }) => {
          const val = (data.kycRecord as unknown as Record<string, unknown>)[key];
          if (val != null && val !== "") initial[key] = String(val);
        });
        setFormData(initial);

        setState("form");
      }
    } catch {
      toast.error("Network error");
    } finally {
      setVerifying(false);
    }
  }, [token, code]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/kyc/save-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, kycData: formData }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      toast.success("Saved successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const res = await fetch("/api/kyc/save-external", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          kycData: {
            ...formData,
            kyc_journey_completed: true,
            completion_status: "complete",
          },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Submit failed");
      setSubmitted(true);
      toast.success("KYC submitted successfully!");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSaving(false);
    }
  }

  async function handleFileUpload(documentTypeId: string, file: File) {
    if (!kycRecord) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("token", token);
    fd.append("documentTypeId", documentTypeId);
    fd.append("kycRecordId", kycRecord.id);

    try {
      const res = await fetch("/api/documents/upload-external", {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { uploadId?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast.success("Document uploaded");
      // Refresh documents by re-verifying
      const refreshRes = await fetch("/api/kyc/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, code }),
      });
      const refreshData = (await refreshRes.json()) as {
        documents?: DocumentRecord[];
      };
      if (refreshData.documents) setDocuments(refreshData.documents);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    }
  }

  // ── Expired ──
  if (state === "expired") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Link Expired
            </h2>
            <p className="text-sm text-gray-500">
              This link has expired. Please contact the administrator to send a
              new invite.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Error ──
  if (state === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              Something went wrong
            </h2>
            <p className="text-sm text-gray-500">
              Please try again later.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Code Entry ──
  if (state === "code_entry") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-brand-navy/10 flex items-center justify-center">
              <Shield className="h-6 w-6 text-brand-navy" />
            </div>
            <CardTitle className="text-xl text-brand-navy">
              Verify Your Identity
            </CardTitle>
            <p className="text-sm text-gray-500 mt-2">
              Enter the 6-digit code from your invitation email to access your
              KYC form.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Input
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                maxLength={6}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && code.length === 6)
                    void verifyCode();
                }}
                autoFocus
              />
              <Button
                onClick={() => void verifyCode()}
                disabled={code.length !== 6 || verifying}
                className="w-full bg-brand-navy hover:bg-brand-blue"
              >
                {verifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Verifying…
                  </>
                ) : (
                  "Verify & Continue"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Submitted ──
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-lg font-semibold text-gray-900 mb-2">
              KYC Submitted
            </h2>
            <p className="text-sm text-gray-500">
              Thank you! Your KYC information has been submitted successfully.
              You can close this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── KYC Form ──
  const effectiveLevel = getEffectiveDdLevel(
    kycRecord?.due_diligence_level as DueDiligenceLevel | null,
    (client?.due_diligence_level ?? "cdd") as DueDiligenceLevel
  );

  // Get required document types from role requirements
  const profileRoles = kycRecord?.profile_roles ?? [];
  const requiredDocTypes = roleDocReqs.filter((rdr) =>
    profileRoles.some((pr) => pr.role === rdr.role)
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-brand-navy">
            KYC Profile — {kycRecord?.full_name ?? "Your Profile"}
          </h1>
          {client && (
            <p className="text-sm text-gray-500 mt-1">
              For {client.company_name}
            </p>
          )}
          <p className="text-xs text-gray-400 mt-1">
            DD Level: {effectiveLevel.toUpperCase()}
          </p>
        </div>

        {/* Form Fields */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-brand-navy">
              Personal Information
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {INDIVIDUAL_FIELDS.map(({ key, label, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {label}
                  </label>
                  <Input
                    type={type ?? "text"}
                    value={formData[key] ?? ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    className="text-sm"
                  />
                </div>
              ))}
            </div>

            {/* Legal issues */}
            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.legal_issues_declared === "true"}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      legal_issues_declared: e.target.checked
                        ? "true"
                        : "false",
                    }))
                  }
                  className="rounded border-gray-300"
                />
                <label className="text-sm text-gray-700">
                  I have been implicated in legal proceedings or regulatory
                  investigations
                </label>
              </div>
              {formData.legal_issues_declared === "true" && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Please provide details
                  </label>
                  <textarea
                    value={formData.legal_issues_details ?? ""}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        legal_issues_details: e.target.value,
                      }))
                    }
                    className="w-full border rounded-md p-2 text-sm min-h-[80px]"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-6">
              <Button
                onClick={() => void handleSave()}
                disabled={saving}
                variant="outline"
                className="flex-1"
              >
                {saving ? "Saving…" : "Save Draft"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Document Uploads */}
        {requiredDocTypes.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-brand-navy">
                Required Documents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {requiredDocTypes.map((rdr) => {
                const docType = rdr.document_types as
                  | { id: string; name: string }
                  | null;
                if (!docType) return null;
                const existing = documents.find(
                  (d) => d.document_type_id === docType.id
                );

                return (
                  <div
                    key={rdr.id}
                    className="flex items-center justify-between border rounded-lg p-3"
                  >
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {docType.name}
                      </p>
                      {existing ? (
                        <p className="text-xs text-green-600 flex items-center gap-1 mt-0.5">
                          <CheckCircle className="h-3 w-3" />
                          {existing.file_name}
                        </p>
                      ) : (
                        <p className="text-xs text-amber-600 mt-0.5">
                          Not uploaded
                        </p>
                      )}
                    </div>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        className="hidden"
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) void handleFileUpload(docType.id, file);
                          e.target.value = "";
                        }}
                      />
                      <span className="flex items-center gap-1 text-xs text-brand-blue hover:underline">
                        <Upload className="h-3 w-3" />
                        {existing ? "Replace" : "Upload"}
                      </span>
                    </label>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* Submit */}
        <Button
          onClick={() => void handleSubmit()}
          disabled={saving}
          className="w-full bg-brand-navy hover:bg-brand-blue h-12 text-base"
        >
          {saving ? "Submitting…" : "Submit KYC"}
        </Button>
      </div>
    </div>
  );
}
