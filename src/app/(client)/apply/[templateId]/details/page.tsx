"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WizardLayout } from "@/components/client/WizardLayout";
import { UBOForm } from "@/components/client/UBOForm";
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
import type { UBO } from "@/types";

const COUNTRIES = [
  "Mauritius",
  "United Kingdom",
  "France",
  "United States",
  "India",
  "China",
  "Singapore",
  "South Africa",
  "United Arab Emirates",
  "Switzerland",
  "Germany",
  "Netherlands",
  "Luxembourg",
  "Cayman Islands",
  "British Virgin Islands",
  "Other",
];

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
  const [ubos, setUbos] = useState<UBO[]>(
    businessDetails.ubo_data.length > 0
      ? businessDetails.ubo_data
      : [
          {
            full_name: "",
            nationality: "",
            date_of_birth: "",
            ownership_percentage: 0,
            passport_number: "",
          },
        ]
  );
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

  useEffect(() => {
    setTemplateId(params.templateId);
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
            if (data.ubo_data) setUbos(data.ubo_data);
          }
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingAppId, params.templateId]);

  function updateField(field: string, value: string | null) {
    setForm((prev) => ({ ...prev, [field]: value ?? "" }));
  }

  function validateForm(): string | null {
    if (!form.business_name.trim()) return "Business / Entity name is required";
    if (!form.business_type.trim()) return "Business type is required";
    if (!form.business_country.trim()) return "Country of incorporation is required";
    if (!form.business_address.trim()) return "Registered address is required";
    if (!form.contact_name.trim()) return "Primary contact full name is required";
    if (!form.contact_email.trim()) return "Primary contact email is required";
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email.trim())) {
      return "Primary contact email is not valid";
    }
    if (ubos.length === 0) return "At least one Ultimate Beneficial Owner is required";
    for (let i = 0; i < ubos.length; i++) {
      const u = ubos[i];
      const label = `UBO ${i + 1}`;
      if (!u.full_name?.trim()) return `${label}: full name is required`;
      if (!u.nationality?.trim()) return `${label}: nationality is required`;
      if (!u.date_of_birth?.trim()) return `${label}: date of birth is required`;
      if (!u.ownership_percentage || u.ownership_percentage < 25)
        return `${label}: ownership percentage must be at least 25%`;
      if (!u.passport_number?.trim()) return `${label}: passport number is required`;
    }
    return null;
  }

  async function saveProgress(andContinue = false) {
    // Only validate hard when continuing to next step;
    // "Save progress" allows partial drafts
    if (andContinue) {
      const error = validateForm();
      if (error) {
        toast.error(error);
        return;
      }
    } else {
      // Even on save, require business name so we have something to identify it by
      if (!form.business_name.trim()) {
        toast.error("Business / Entity name is required to save");
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch("/api/applications/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          applicationId: applicationId || existingAppId || undefined,
          templateId: params.templateId,
          ...form,
          ubo_data: ubos,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Save failed");

      const appId = data.applicationId;
      setApplicationId(appId);
      setBusinessDetails({ ...form, ubo_data: ubos });

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
        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">
              Section A: Company Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-1.5">
                <Label>Business / Entity name *</Label>
                <Input
                  value={form.business_name}
                  onChange={(e) =>
                    updateField("business_name", e.target.value)
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Business type *</Label>
                <Select
                  value={form.business_type ?? ""}
                  onValueChange={(v) => updateField("business_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BUSINESS_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
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
                  <SelectTrigger>
                    <SelectValue placeholder="Select country" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label>Registered address *</Label>
                <Textarea
                  value={form.business_address}
                  onChange={(e) =>
                    updateField("business_address", e.target.value)
                  }
                  rows={3}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">
              Section B: Primary Contact
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Full name *</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) =>
                    updateField("contact_name", e.target.value)
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Role / title</Label>
                <Input
                  value={form.contact_title}
                  onChange={(e) =>
                    updateField("contact_title", e.target.value)
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.contact_email}
                  onChange={(e) =>
                    updateField("contact_email", e.target.value)
                  }
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label>Phone</Label>
                <Input
                  type="tel"
                  value={form.contact_phone}
                  onChange={(e) =>
                    updateField("contact_phone", e.target.value)
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-brand-navy">
              Section C: Ultimate Beneficial Owners (UBOs)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <UBOForm ubos={ubos} onChange={setUbos} />
          </CardContent>
        </Card>

        <div className="flex justify-between">
          <Button
            variant="outline"
            onClick={() => saveProgress(false)}
            disabled={saving}
          >
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
