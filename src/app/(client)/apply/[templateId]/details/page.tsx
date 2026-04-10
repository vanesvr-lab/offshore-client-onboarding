"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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

  // Dynamic service-specific details
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

    if (existingAppId) {
      setApplicationId(existingAppId);
      fetch(`/api/applications/${existingAppId}`)
        .then((r) => r.json())
        .then(({ application: data }) => {
          if (data) {
            setForm((prev) => ({
              ...prev,
              contact_name: data.contact_name || "",
              contact_email: data.contact_email || "",
              contact_phone: data.contact_phone || "",
              contact_title: "",
            }));
            setClientId(data.client_id ?? null);
            if (data.service_details && typeof data.service_details === "object") {
              setServiceDetails(data.service_details as Record<string, unknown>);
            }
          }
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingAppId, params.templateId]);

  // Pre-fill contact from KYC record when clientId is known and fields are empty
  useEffect(() => {
    if (!clientId) return;
    if (form.contact_name || form.contact_email) return; // already filled
    fetch(`/api/kyc/${clientId}`)
      .then((r) => r.json())
      .then(({ kyc }) => {
        if (kyc) {
          setForm((prev) => ({
            ...prev,
            contact_name: kyc.full_name || prev.contact_name,
            contact_email: kyc.email || prev.contact_email,
            contact_phone: kyc.phone || prev.contact_phone,
          }));
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

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
        {/* Primary Contact */}
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">Primary Contact</CardTitle>
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
              {hasServiceFields ? "Section C" : "Section B"}: Directors, Shareholders &amp; UBOs
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
