"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WizardLayout } from "@/components/client/WizardLayout";
import { PersonsManager } from "@/components/client/PersonsManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useWizardStore } from "@/stores/wizardStore";
import { BUSINESS_TYPES } from "@/lib/utils/constants";
import { toast } from "sonner";
import type { ApplicationDetailsGbcAc } from "@/types";

const COUNTRIES = [
  "Mauritius", "United Kingdom", "France", "United States", "India",
  "China", "Singapore", "South Africa", "United Arab Emirates", "Switzerland",
  "Germany", "Netherlands", "Luxembourg", "Cayman Islands", "British Virgin Islands", "Other",
];

const CURRENCIES = ["USD", "EUR", "GBP", "MUR", "SGD", "AED", "CHF", "CNY", "Other"];

function isGbcAc(templateName: string): boolean {
  const n = templateName.toUpperCase();
  return n.includes("GBC") || n.includes("AC ") || n.includes(" AC") || n === "AC";
}

export default function BusinessDetailsPage({
  params,
}: {
  params: { templateId: string };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const existingAppId = searchParams.get("applicationId");
  const {
    applicationId,
    setApplicationId,
    setTemplateId,
    businessDetails,
    setBusinessDetails,
  } = useWizardStore();

  const [saving, setSaving] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);

  const [form, setForm] = useState({
    business_name: businessDetails.business_name,
    business_type: businessDetails.business_type,
    business_country: businessDetails.business_country,
    business_address: businessDetails.business_address,
    contact_name: businessDetails.contact_name,
    contact_email: businessDetails.contact_email,
    contact_phone: businessDetails.contact_phone,
    contact_title: businessDetails.contact_title,
  });

  const [gbcDetails, setGbcDetails] = useState<Partial<ApplicationDetailsGbcAc>>({
    proposed_names: ["", "", ""],
    proposed_business_activity: "",
    geographical_area: "",
    transaction_currency: "",
    estimated_turnover_3yr: "",
    requires_mauritian_bank: false,
    preferred_bank: "",
    estimated_inward_value: "",
    estimated_inward_count: "",
    estimated_outward_value: "",
    estimated_outward_count: "",
    other_mauritius_companies: "",
    balance_sheet_date: "",
    initial_stated_capital: "",
  });

  const currentAppId = applicationId || existingAppId || undefined;
  const showGbcFields = isGbcAc(templateName);

  useEffect(() => {
    setTemplateId(params.templateId);
    // Fetch template name
    fetch(`/api/templates/${params.templateId}`)
      .then((r) => r.json())
      .then(({ template }) => {
        if (template?.name) setTemplateName(template.name);
      })
      .catch(() => {});

    if (existingAppId) {
      setApplicationId(existingAppId);
      fetch(`/api/applications/${existingAppId}`)
        .then((r) => r.json())
        .then(({ application: data }) => {
          if (data) {
            setForm({
              business_name: data.business_name || "",
              business_type: data.business_type || "",
              business_country: data.business_country || "",
              business_address: data.business_address || "",
              contact_name: data.contact_name || "",
              contact_email: data.contact_email || "",
              contact_phone: data.contact_phone || "",
              contact_title: "",
            });
            setClientId(data.client_id ?? null);
          }
        });

      // Fetch GBC/AC details if applicable
      fetch(`/api/applications/${existingAppId}/details-gbc-ac`)
        .then((r) => r.json())
        .then(({ details }) => {
          if (details) {
            setGbcDetails((prev) => ({ ...prev, ...details }));
          }
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingAppId, params.templateId]);

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }));
  }

  async function saveGbcDetails(appId: string) {
    if (!showGbcFields) return;
    await fetch(`/api/applications/${appId}/details-gbc-ac`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(gbcDetails),
    });
  }

  async function saveProgress(andContinue = false) {
    if (andContinue && !form.business_name.trim()) {
      toast.error("Business / Entity name is required");
      return;
    }
    if (!form.business_name.trim()) {
      toast.error("Business / Entity name is required to save");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/applications/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: currentAppId,
          templateId: params.templateId,
          ...form,
          ubo_data: [],
        }),
      });
      const data = await res.json() as { applicationId?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Save failed");

      const appId = data.applicationId!;
      setApplicationId(appId);
      setBusinessDetails({ ...form, ubo_data: [] });

      // Save GBC/AC details alongside
      await saveGbcDetails(appId);

      if (andContinue) {
        router.push(`/apply/${params.templateId}/documents?applicationId=${appId}`);
      } else {
        toast.success("Progress saved");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WizardLayout currentStep={1}>
      <div className="space-y-6 max-w-3xl">
        {/* Company Information */}
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">Section A: Company Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Business / Entity name *</Label>
                <Input
                  value={form.business_name}
                  onChange={(e) => updateField("business_name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Business type *</Label>
                <Select
                  value={form.business_type ?? ""}
                  onValueChange={(v) => updateField("business_type", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Country of incorporation *</Label>
                <Select
                  value={form.business_country ?? ""}
                  onValueChange={(v) => updateField("business_country", v)}
                >
                  <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Registered address *</Label>
                <Textarea
                  value={form.business_address}
                  onChange={(e) => updateField("business_address", e.target.value)}
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Primary Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">Section B: Primary Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Full name *</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => updateField("contact_name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role / title</Label>
                <Input
                  value={form.contact_title}
                  onChange={(e) => updateField("contact_title", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => updateField("contact_email", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={form.contact_phone}
                  onChange={(e) => updateField("contact_phone", e.target.value)}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* GBC / AC specific fields */}
        {showGbcFields && (
          <Card>
            <CardHeader>
              <CardTitle className="text-brand-navy">Section C: GBC/AC Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Proposed company names (3 options)</Label>
                <div className="space-y-2">
                  {[0, 1, 2].map((i) => (
                    <Input
                      key={i}
                      placeholder={`Option ${i + 1}`}
                      value={(gbcDetails.proposed_names ?? ["", "", ""])[i] ?? ""}
                      onChange={(e) => {
                        const names = [...(gbcDetails.proposed_names ?? ["", "", ""])];
                        names[i] = e.target.value;
                        setGbcDetails((p) => ({ ...p, proposed_names: names }));
                      }}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Proposed business activity</Label>
                <Textarea
                  value={gbcDetails.proposed_business_activity ?? ""}
                  onChange={(e) => setGbcDetails((p) => ({ ...p, proposed_business_activity: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Geographical area of operations</Label>
                  <Input
                    value={gbcDetails.geographical_area ?? ""}
                    onChange={(e) => setGbcDetails((p) => ({ ...p, geographical_area: e.target.value }))}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Transaction currency</Label>
                  <Select
                    value={gbcDetails.transaction_currency ?? ""}
                    onValueChange={(v) => setGbcDetails((p) => ({ ...p, transaction_currency: v ?? "" }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select currency" /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estimated annual turnover (3yr)</Label>
                  <Input
                    value={gbcDetails.estimated_turnover_3yr ?? ""}
                    onChange={(e) => setGbcDetails((p) => ({ ...p, estimated_turnover_3yr: e.target.value }))}
                    placeholder="e.g. USD 500,000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Initial stated capital</Label>
                  <Input
                    value={gbcDetails.initial_stated_capital ?? ""}
                    onChange={(e) => setGbcDetails((p) => ({ ...p, initial_stated_capital: e.target.value }))}
                    placeholder="e.g. USD 1,000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Balance sheet date</Label>
                  <Input
                    value={gbcDetails.balance_sheet_date ?? ""}
                    onChange={(e) => setGbcDetails((p) => ({ ...p, balance_sheet_date: e.target.value }))}
                    placeholder="e.g. 31 December"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Requires Mauritian bank account? {templateName.toUpperCase().includes("GBC") && <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ml-1">Mandatory for GBC</span>}</Label>
                  <Select
                    value={gbcDetails.requires_mauritian_bank === true ? "yes" : gbcDetails.requires_mauritian_bank === false ? "no" : ""}
                    onValueChange={(v) => setGbcDetails((p) => ({ ...p, requires_mauritian_bank: v === "yes" }))}
                  >
                    <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes</SelectItem>
                      <SelectItem value="no">No</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {gbcDetails.requires_mauritian_bank && (
                  <>
                    <div className="space-y-1.5">
                      <Label>Preferred bank</Label>
                      <Input
                        value={gbcDetails.preferred_bank ?? ""}
                        onChange={(e) => setGbcDetails((p) => ({ ...p, preferred_bank: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Est. inward transaction value</Label>
                      <Input
                        value={gbcDetails.estimated_inward_value ?? ""}
                        onChange={(e) => setGbcDetails((p) => ({ ...p, estimated_inward_value: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Est. inward transaction count</Label>
                      <Input
                        value={gbcDetails.estimated_inward_count ?? ""}
                        onChange={(e) => setGbcDetails((p) => ({ ...p, estimated_inward_count: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Est. outward transaction value</Label>
                      <Input
                        value={gbcDetails.estimated_outward_value ?? ""}
                        onChange={(e) => setGbcDetails((p) => ({ ...p, estimated_outward_value: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Est. outward transaction count</Label>
                      <Input
                        value={gbcDetails.estimated_outward_count ?? ""}
                        onChange={(e) => setGbcDetails((p) => ({ ...p, estimated_outward_count: e.target.value }))}
                      />
                    </div>
                  </>
                )}
                <div className="col-span-2 space-y-1.5">
                  <Label>Other companies in Mauritius (if any)</Label>
                  <Input
                    value={gbcDetails.other_mauritius_companies ?? ""}
                    onChange={(e) => setGbcDetails((p) => ({ ...p, other_mauritius_companies: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Directors, Shareholders & UBOs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">
              Section {showGbcFields ? "D" : "C"}: Directors, Shareholders &amp; UBOs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentAppId && clientId ? (
              <PersonsManager applicationId={currentAppId} clientId={clientId} />
            ) : (
              <p className="text-sm text-gray-400">Save your business details first to add persons.</p>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button variant="outline" onClick={() => saveProgress(false)} disabled={saving}>
            Save progress
          </Button>
          <Button
            className="bg-brand-navy hover:bg-brand-blue"
            onClick={() => saveProgress(true)}
            disabled={saving}
          >
            {saving ? "Saving…" : "Next: Upload Documents"}
          </Button>
        </div>
      </div>
    </WizardLayout>
  );
}
