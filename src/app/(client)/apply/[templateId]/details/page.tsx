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
    // Admin-only fields — kept in state for the save payload but not shown to client
    business_name: businessDetails.business_name,
    business_type: businessDetails.business_type,
    business_country: businessDetails.business_country,
    business_address: businessDetails.business_address,
    // Client-visible fields
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

    if (existingAppId) {
      // Resuming an existing application
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
    } else {
      // New application — resolve clientId from the current user's profile
      fetch("/api/me")
        .then((r) => r.json())
        .then(({ clientId: cid }) => {
          if (cid) setClientId(cid as string);
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingAppId, params.templateId]);

  // Pre-fill contact fields from the individual KYC record when clientId resolves
  useEffect(() => {
    if (!clientId) return;
    if (form.contact_name?.trim() || form.contact_email?.trim()) return; // already filled from saved app
    fetch(`/api/kyc/${clientId}`)
      .then((r) => r.json())
      .then(({ records }: { records?: Array<{ record_type: string; full_name?: string; email?: string; phone?: string }> }) => {
        const individual = (records ?? []).find((r) => r.record_type === "individual");
        if (individual) {
          setForm((prev) => ({
            ...prev,
            contact_name: individual.full_name || prev.contact_name,
            contact_email: individual.email || prev.contact_email,
            contact_phone: individual.phone || prev.contact_phone,
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
