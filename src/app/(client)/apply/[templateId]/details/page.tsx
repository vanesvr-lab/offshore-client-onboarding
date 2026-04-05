"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
  const supabase = createClient();
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
      supabase
        .from("applications")
        .select("*")
        .eq("id", existingAppId)
        .single()
        .then(({ data }) => {
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

  function updateField(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function saveProgress(andContinue = false) {
    if (ubos.length === 0 || ubos.some((u) => !u.full_name)) {
      toast.error("At least one complete UBO is required");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const payload = {
        ...form,
        template_id: params.templateId,
        client_id: user!.id,
        ubo_data: ubos,
        status: "draft" as const,
        updated_at: new Date().toISOString(),
      };

      let appId = applicationId || existingAppId;
      if (appId) {
        await supabase.from("applications").update(payload).eq("id", appId);
      } else {
        const { data, error } = await supabase
          .from("applications")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        appId = data.id;
        setApplicationId(appId!);
      }

      setBusinessDetails({ ...form, ubo_data: ubos });

      if (andContinue) {
        router.push(
          `/apply/${params.templateId}/documents?applicationId=${appId}`
        );
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
              <div className="col-span-2 space-y-2">
                <Label>Business / Entity name *</Label>
                <Input
                  value={form.business_name}
                  onChange={(e) =>
                    updateField("business_name", e.target.value)
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Business type *</Label>
                <Select
                  value={form.business_type}
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
              <div className="space-y-2">
                <Label>Country of incorporation *</Label>
                <Select
                  value={form.business_country}
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
              <div className="col-span-2 space-y-2">
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
              <div className="space-y-2">
                <Label>Full name *</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) =>
                    updateField("contact_name", e.target.value)
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Role / title</Label>
                <Input
                  value={form.contact_title}
                  onChange={(e) =>
                    updateField("contact_title", e.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
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
              <div className="space-y-2">
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
