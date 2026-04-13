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

    if (existingAppId) {
      // Resuming an existing application
      setApplicationId(existingAppId);
      fetch(`/api/applications/${existingAppId}`)
        .then((r) => r.json())
        .then(({ application: data }) => {
          if (data) {
            setForm((prev) => ({
              ...prev,
              business_name: data.business_name || "",
              business_type: data.business_type || "",
              business_country: data.business_country || "",
              business_address: data.business_address || "",
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

  // Pre-fill contact fields from the primary individual KYC record when clientId resolves
  useEffect(() => {
    if (!clientId) return;
    if (form.contact_name?.trim() || form.contact_email?.trim()) return; // don't overwrite user edits
    fetch(`/api/kyc/${clientId}`)
      .then((r) => r.json())
      .then(({ records }: {
        records?: Array<{
          record_type: string;
          full_name?: string;
          email?: string;
          phone?: string;
          occupation?: string;
          is_primary?: boolean;
        }>;
      }) => {
        const individuals = (records ?? []).filter((r) => r.record_type === "individual");
        // Prefer the primary record, fall back to first individual
        const individual = individuals.find((r) => r.is_primary) ?? individuals[0];
        if (individual) {
          setForm((prev) => ({
            ...prev,
            contact_name: individual.full_name || prev.contact_name,
            contact_email: individual.email || prev.contact_email,
            contact_phone: individual.phone || prev.contact_phone,
            contact_title: individual.occupation || prev.contact_title,
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
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label className="text-sm">Business / Entity name</Label>
                <Input
                  value={form.business_name}
                  onChange={(e) => updateField("business_name", e.target.value)}
                  placeholder="Proposed entity name"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Business type</Label>
                <Input
                  value={form.business_type}
                  onChange={(e) => updateField("business_type", e.target.value)}
                  placeholder="e.g. GBC, AC"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">Country of incorporation</Label>
                <Input
                  value={form.business_country}
                  onChange={(e) => updateField("business_country", e.target.value)}
                  placeholder="e.g. Mauritius"
                />
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-sm">Registered address</Label>
                <Input
                  value={form.business_address}
                  onChange={(e) => updateField("business_address", e.target.value)}
                  placeholder="Registered business address"
                />
              </div>
            </div>
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
