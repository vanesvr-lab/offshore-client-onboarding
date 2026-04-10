"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

const NATIONALITIES = [
  "Mauritian", "British", "French", "American", "South African", "Indian",
  "Chinese", "Australian", "Canadian", "German", "Other",
];

const JURISDICTIONS = [
  "Mauritius", "British Virgin Islands", "Cayman Islands", "Seychelles",
  "Malta", "Luxembourg", "Ireland", "Singapore", "Hong Kong", "United Kingdom",
  "United States", "Other",
];

const MILESTONES = [
  { key: "loe_sent_at", label: "LOE sent" },
  { key: "invoice_sent_at", label: "Invoice sent" },
  { key: "payment_received_at", label: "Payment received" },
  { key: "portal_link_sent_at", label: "Portal link sent" },
  { key: "kyc_completed_at", label: "KYC complete" },
  { key: "application_submitted_at", label: "Application submitted" },
] as const;

export function NewClientForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  // Basic info
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [clientType, setClientType] = useState<"individual" | "organisation" | "">("");

  // Individual KYC pre-fill
  const [indivKyc, setIndivKyc] = useState({
    address: "",
    nationality: "",
    passport_number: "",
    date_of_birth: "",
    occupation: "",
  });

  // Org KYC pre-fill
  const [orgKyc, setOrgKyc] = useState({
    full_name: "", // company name
    company_registration_number: "",
    jurisdiction_incorporated: "",
    date_of_incorporation: "",
  });

  // Workflow milestones
  const [milestones, setMilestones] = useState<Record<string, string | null>>({
    loe_sent_at: null,
    invoice_sent_at: null,
    payment_received_at: null,
    portal_link_sent_at: null,
    kyc_completed_at: null,
    application_submitted_at: null,
  });

  function toggleMilestone(key: string) {
    setMilestones((prev) => ({
      ...prev,
      [key]: prev[key] ? null : new Date().toISOString(),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { toast.error("Email is required"); return; }
    if (!clientType) { toast.error("Client type is required"); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          email,
          phone,
          clientType,
          kycPreFill: Object.fromEntries(
            Object.entries(indivKyc).filter(([, v]) => v !== "")
          ),
          orgKycPreFill: clientType === "organisation"
            ? Object.fromEntries(Object.entries(orgKyc).filter(([, v]) => v !== ""))
            : {},
          workflowDates: milestones,
        }),
      });
      const data = await res.json() as { error?: string; clientId?: string };
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      toast.success("Client created");
      router.push(`/admin/clients/${data.clientId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Section A: Basic Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-brand-navy">A. Basic Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Contact person's full name" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+230 …" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Client type *</Label>
              <div className="flex gap-3 mt-1">
                {(["individual", "organisation"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setClientType(t)}
                    className={cn(
                      "flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors capitalize",
                      clientType === t
                        ? "border-brand-navy bg-brand-navy/5 text-brand-navy"
                        : "border-gray-200 text-gray-500 hover:border-gray-300"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section B: Pre-fill KYC */}
      {clientType === "individual" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-brand-navy">B. Pre-fill KYC Profile (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Nationality</Label>
                <Select value={indivKyc.nationality} onValueChange={(v) => setIndivKyc((p) => ({ ...p, nationality: v ?? "" }))}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {NATIONALITIES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date of birth</Label>
                <Input type="date" value={indivKyc.date_of_birth} onChange={(e) => setIndivKyc((p) => ({ ...p, date_of_birth: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Passport number</Label>
                <Input value={indivKyc.passport_number} onChange={(e) => setIndivKyc((p) => ({ ...p, passport_number: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Occupation</Label>
                <Input value={indivKyc.occupation} onChange={(e) => setIndivKyc((p) => ({ ...p, occupation: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Residential address</Label>
              <Input value={indivKyc.address} onChange={(e) => setIndivKyc((p) => ({ ...p, address: e.target.value }))} />
            </div>
          </CardContent>
        </Card>
      )}

      {clientType === "organisation" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base text-brand-navy">B. Pre-fill KYC Profile (optional)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-gray-500">Primary contact</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Nationality</Label>
                <Select value={indivKyc.nationality} onValueChange={(v) => setIndivKyc((p) => ({ ...p, nationality: v ?? "" }))}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>
                    {NATIONALITIES.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Occupation</Label>
                <Input value={indivKyc.occupation} onChange={(e) => setIndivKyc((p) => ({ ...p, occupation: e.target.value }))} />
              </div>
            </div>
            <div className="border-t pt-4">
              <p className="text-xs text-gray-500 mb-3">Organisation</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Company name</Label>
                  <Input value={orgKyc.full_name} onChange={(e) => setOrgKyc((p) => ({ ...p, full_name: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Registration number</Label>
                  <Input value={orgKyc.company_registration_number} onChange={(e) => setOrgKyc((p) => ({ ...p, company_registration_number: e.target.value }))} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Jurisdiction of incorporation</Label>
                  <Select value={orgKyc.jurisdiction_incorporated} onValueChange={(v) => setOrgKyc((p) => ({ ...p, jurisdiction_incorporated: v ?? "" }))}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      {JURISDICTIONS.map((j) => <SelectItem key={j} value={j}>{j}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date of incorporation</Label>
                  <Input type="date" value={orgKyc.date_of_incorporation} onChange={(e) => setOrgKyc((p) => ({ ...p, date_of_incorporation: e.target.value }))} />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section C: Workflow Milestones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base text-brand-navy">C. Workflow Milestones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {MILESTONES.map(({ key, label }) => (
            <div key={key} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Checkbox
                  checked={milestones[key] !== null}
                  onCheckedChange={() => toggleMilestone(key)}
                />
                <span className="text-sm text-gray-700">{label}</span>
              </div>
              {milestones[key] && (
                <span className="text-xs text-gray-400">
                  {new Date(milestones[key]!).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                </span>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/clients")}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting} className="bg-brand-navy hover:bg-brand-blue">
          {submitting ? "Creating…" : "Create Client"}
        </Button>
      </div>
    </form>
  );
}
