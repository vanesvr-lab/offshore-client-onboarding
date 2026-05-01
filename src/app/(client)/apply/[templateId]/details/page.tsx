"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { WizardLayout } from "@/components/client/WizardLayout";
import { PersonsManager } from "@/components/client/PersonsManager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useWizardStore } from "@/stores/wizardStore";
import { toast } from "sonner";
import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";

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
  const [serviceFields, setServiceFields] = useState<ServiceField[]>([]);
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

  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>({});

  const currentAppId = applicationId || existingAppId || undefined;
  const hasServiceFields = serviceFields.length > 0;

  useEffect(() => {
    setTemplateId(params.templateId);

    // Fetch template service_fields
    fetch(`/api/templates/${params.templateId}`)
      .then((r) => r.json())
      .then(({ template }) => {
        if (template?.service_fields && Array.isArray(template.service_fields)) {
          setServiceFields(template.service_fields as ServiceField[]);
        }
      })
      .catch(() => {});

    async function init() {
      let resolvedClientId: string | null = null;
      let skipKyc = false;

      if (existingAppId) {
        setApplicationId(existingAppId);
        try {
          const r = await fetch(`/api/applications/${existingAppId}`);
          const { application: data } = await r.json() as { application?: Record<string, unknown> };
          if (data) {
            const contactName = (data.contact_name as string) || "";
            const contactEmail = (data.contact_email as string) || "";
            setForm((prev) => ({
              ...prev,
              business_name: (data.business_name as string) || "",
              business_type: (data.business_type as string) || "",
              business_country: (data.business_country as string) || "",
              business_address: (data.business_address as string) || "",
              contact_name: contactName,
              contact_email: contactEmail,
              contact_phone: (data.contact_phone as string) || "",
              contact_title: "",
            }));
            resolvedClientId = (data.client_id as string) ?? null;
            if (resolvedClientId) setClientId(resolvedClientId);
            if (data.service_details && typeof data.service_details === "object") {
              setServiceDetails(data.service_details as Record<string, unknown>);
            }
            if (contactName.trim() || contactEmail.trim()) skipKyc = true;
          }
        } catch {}
      } else {
        try {
          const r = await fetch("/api/me");
          const { clientId: cid } = await r.json() as { clientId?: string };
          if (cid) { resolvedClientId = cid; setClientId(cid); }
        } catch {}
      }

      if (resolvedClientId && !skipKyc) {
        try {
          const r = await fetch(`/api/kyc/${resolvedClientId}`);
          const { records } = await r.json() as {
            records?: Array<{
              record_type: string;
              full_name?: string;
              email?: string;
              phone?: string;
              occupation?: string;
              is_primary?: boolean;
            }>;
          };
          const individuals = (records ?? []).filter((rec) => rec.record_type === "individual");
          const individual = individuals.find((rec) => rec.is_primary) ?? individuals[0];
          if (individual) {
            setForm((prev) => ({
              ...prev,
              contact_name: individual.full_name || prev.contact_name,
              contact_email: individual.email || prev.contact_email,
              contact_phone: individual.phone || prev.contact_phone,
              contact_title: individual.occupation || prev.contact_title,
            }));
          }
        } catch {}
      }
    }
    void init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingAppId, params.templateId]);

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }));
  }

  async function saveProgress(andContinue = false) {
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
          service_details: serviceDetails,
        }),
      });
      const data = await res.json() as { applicationId?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error || "Save failed");

      const appId = data.applicationId!;
      setApplicationId(appId);
      setBusinessDetails({ ...form, ubo_data: [] });

      // After first save we know the clientId from the application
      if (!clientId) {
        fetch(`/api/applications/${appId}`)
          .then((r) => r.json())
          .then(({ application: d }) => {
            if (d?.client_id) setClientId(d.client_id as string);
          })
          .catch(() => {});
      }

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
        {/* B-047 §1.1 / §8 — Primary Contact: top-aligned labels with red required *,
            content-aware widths, semantic input types + autocomplete attributes. */}
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">Primary Contact</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-900">
                  Full name <span className="text-red-600" aria-hidden="true">*</span>
                </Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => updateField("contact_name", e.target.value)}
                  autoComplete="name"
                  aria-required="true"
                  className="h-11 md:w-80"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-900">Role / title</Label>
                <Input
                  value={form.contact_title}
                  onChange={(e) => updateField("contact_title", e.target.value)}
                  autoComplete="organization-title"
                  placeholder="e.g. CEO, Director"
                  className="h-11 md:w-64"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-900">
                  Email <span className="text-red-600" aria-hidden="true">*</span>
                </Label>
                <Input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  value={form.contact_email}
                  onChange={(e) => updateField("contact_email", e.target.value)}
                  placeholder="you@example.com"
                  aria-required="true"
                  className="h-11 md:w-80"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-900">Phone</Label>
                <Input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.contact_phone}
                  onChange={(e) => updateField("contact_phone", e.target.value)}
                  placeholder="+230 555 0000"
                  className="h-11 md:w-48"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Service-specific fields (dynamic, driven by template.service_fields) */}
        {hasServiceFields && (
          <DynamicServiceForm
            fields={serviceFields}
            values={serviceDetails}
            onChange={(key, value) =>
              setServiceDetails((prev) => ({ ...prev, [key]: value }))
            }
          />
        )}

        {/* Directors, Shareholders & UBOs */}
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">
              Directors, Shareholders &amp; UBOs
            </CardTitle>
          </CardHeader>
          <CardContent>
            {currentAppId && clientId ? (
              <PersonsManager applicationId={currentAppId} clientId={clientId} />
            ) : (
              <p className="text-sm text-gray-400">Save your details first to add persons.</p>
            )}
          </CardContent>
        </Card>

        {/* Admin-completed section — shown at bottom, muted */}
        <div className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
          <Info className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
          <p className="text-sm text-gray-500">
            The following business details will be completed by the admin team after your submission.
          </p>
        </div>

        <Card className="opacity-80 bg-gray-50 border-gray-200">
          <CardHeader>
            <CardTitle className="text-brand-navy text-base">Business Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-sm font-medium text-gray-900">Business / Entity name</Label>
                <Input
                  value={form.business_name}
                  onChange={(e) => updateField("business_name", e.target.value)}
                  placeholder="Proposed entity name"
                  autoComplete="organization"
                  className="h-11 md:w-96"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-900">Business type</Label>
                <Input
                  value={form.business_type}
                  onChange={(e) => updateField("business_type", e.target.value)}
                  placeholder="e.g. GBC, AC"
                  className="h-11 md:w-48"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-900">Country of incorporation</Label>
                <Input
                  value={form.business_country}
                  onChange={(e) => updateField("business_country", e.target.value)}
                  placeholder="e.g. Mauritius"
                  autoComplete="country-name"
                  className="h-11 md:w-60"
                />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-sm font-medium text-gray-900">Registered address</Label>
                <Input
                  value={form.business_address}
                  onChange={(e) => updateField("business_address", e.target.value)}
                  placeholder="Registered business address"
                  autoComplete="street-address"
                  className="h-11"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* B-047 §4 — three-tier buttons: Save progress = secondary, Next = primary brand-navy 44pt. */}
        <div className="flex items-center justify-between">
          <Button
            onClick={() => saveProgress(false)}
            disabled={saving}
            className="h-11 px-5 bg-white border border-gray-300 text-gray-700 font-medium hover:bg-gray-50"
          >
            Save progress
          </Button>
          <Button
            className="h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90"
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
