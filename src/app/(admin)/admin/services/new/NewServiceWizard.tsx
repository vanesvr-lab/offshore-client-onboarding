"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";
import type { ClientProfile } from "@/types";

interface Template {
  id: string;
  name: string;
  description: string | null;
  service_fields: ServiceField[];
}

interface SelectedRole {
  profile: ClientProfile;
  role: "director" | "shareholder" | "ubo" | "other";
  can_manage: boolean;
  shareholding_percentage: string;
}

interface Props {
  templates: Template[];
  profiles: ClientProfile[];
}

const STEPS = ["Service Type", "People", "Details", "Review"] as const;

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div className={`flex items-center justify-center h-7 w-7 rounded-full text-xs font-semibold transition-colors ${
            i < current
              ? "bg-green-500 text-white"
              : i === current
              ? "bg-brand-navy text-white"
              : "bg-gray-100 text-gray-400"
          }`}>
            {i < current ? <Check className="h-3.5 w-3.5" /> : i + 1}
          </div>
          <span className={`text-sm ${i === current ? "font-semibold text-brand-navy" : "text-gray-400"}`}>
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <ChevronRight className="h-4 w-4 text-gray-300 mx-1" />
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Step 1: Pick service type ───────────────────────────────────────────────

function StepPickTemplate({
  templates,
  selectedId,
  onSelect,
}: {
  templates: Template[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-brand-navy mb-1">Select service type</h2>
      <p className="text-sm text-gray-500 mb-5">Choose the type of service you are setting up.</p>
      {templates.length === 0 ? (
        <p className="text-sm text-gray-400">No service templates configured. Add templates in Settings → Templates.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => onSelect(t.id)}
              className={`text-left border-2 rounded-xl p-4 transition-all ${
                selectedId === t.id
                  ? "border-brand-navy bg-brand-navy/5"
                  : "border-gray-200 hover:border-brand-blue hover:bg-gray-50"
              }`}
            >
              <div className="flex items-start justify-between">
                <p className="font-semibold text-brand-navy">{t.name}</p>
                {selectedId === t.id && (
                  <div className="h-5 w-5 rounded-full bg-brand-navy flex items-center justify-center shrink-0 ml-2">
                    <Check className="h-3 w-3 text-white" />
                  </div>
                )}
              </div>
              {t.description && (
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{t.description}</p>
              )}
              {t.service_fields && t.service_fields.length > 0 && (
                <p className="text-[10px] text-gray-400 mt-2">
                  {t.service_fields.length} fields
                </p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Step 2: Add people ──────────────────────────────────────────────────────

function StepAddPeople({
  profiles,
  selectedRoles,
  onAdd,
  onRemove,
  onUpdateRole,
}: {
  profiles: ClientProfile[];
  selectedRoles: SelectedRole[];
  onAdd: (profile: ClientProfile) => void;
  onRemove: (profileId: string) => void;
  onUpdateRole: (profileId: string, field: string, value: unknown) => void;
}) {
  const [search, setSearch] = useState("");
  const selectedIds = new Set(selectedRoles.map((r) => r.profile.id));

  const available = profiles.filter(
    (p) =>
      !selectedIds.has(p.id) &&
      (search === "" ||
        p.full_name.toLowerCase().includes(search.toLowerCase()) ||
        (p.email ?? "").toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Add people</h2>
        <p className="text-sm text-gray-500">Link profiles to this service and assign their roles.</p>
      </div>

      {/* Search + add */}
      <div>
        <input
          type="text"
          placeholder="Search profiles by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue mb-2"
        />
        <div className="max-h-40 overflow-y-auto border rounded-lg divide-y">
          {available.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-400 text-center">
              {search ? "No profiles match" : "All profiles added"}
            </p>
          ) : (
            available.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-3 py-2 hover:bg-gray-50">
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.full_name}</p>
                  {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAdd(p)}
                  className="h-7 text-xs"
                >
                  Add
                </Button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Selected roles */}
      {selectedRoles.length > 0 && (
        <div>
          <p className="text-sm font-medium text-gray-700 mb-2">Added ({selectedRoles.length})</p>
          <div className="space-y-3">
            {selectedRoles.map((sr) => (
              <div key={sr.profile.id} className="border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{sr.profile.full_name}</p>
                    {sr.profile.email && <p className="text-xs text-gray-400">{sr.profile.email}</p>}
                  </div>
                  <button
                    onClick={() => onRemove(sr.profile.id)}
                    className="text-xs text-gray-300 hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-gray-500">Role *</label>
                    <select
                      value={sr.role}
                      onChange={(e) => onUpdateRole(sr.profile.id, "role", e.target.value)}
                      className="w-full mt-1 border rounded-lg px-2 py-1.5 text-sm"
                    >
                      <option value="director">Director</option>
                      <option value="shareholder">Shareholder</option>
                      <option value="ubo">UBO</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  {sr.role === "shareholder" && (
                    <div>
                      <label className="text-xs font-medium text-gray-500">Shareholding %</label>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={sr.shareholding_percentage}
                        onChange={(e) => onUpdateRole(sr.profile.id, "shareholding_percentage", e.target.value)}
                        placeholder="e.g. 25"
                        className="w-full mt-1 border rounded-lg px-2 py-1.5 text-sm"
                      />
                    </div>
                  )}
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={sr.can_manage}
                    onChange={(e) => onUpdateRole(sr.profile.id, "can_manage", e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">Can manage this service</span>
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Step 3: Service details ──────────────────────────────────────────────────

function StepServiceDetails({
  template,
  values,
  onChange,
}: {
  template: Template;
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}) {
  if (!template.service_fields || template.service_fields.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Service details</h2>
        <p className="text-sm text-gray-400">This service type has no configurable fields.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-brand-navy mb-1">Service details</h2>
      <p className="text-sm text-gray-500 mb-5">Fill in the details for this {template.name} service.</p>
      <DynamicServiceForm
        fields={template.service_fields}
        values={values}
        onChange={onChange}
      />
    </div>
  );
}

// ─── Step 4: Review ─────────────────────────────────────────────────────────

function StepReview({
  template,
  selectedRoles,
  serviceDetails,
}: {
  template: Template;
  selectedRoles: SelectedRole[];
  serviceDetails: Record<string, unknown>;
}) {
  const filledFields = (template.service_fields ?? []).filter((f) => {
    const v = serviceDetails[f.key];
    if (Array.isArray(v)) return v.length > 0;
    return v != null && v !== "";
  });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">Review</h2>
        <p className="text-sm text-gray-500">Confirm the details before creating this service.</p>
      </div>

      <div className="border rounded-xl divide-y">
        <div className="px-4 py-3">
          <p className="text-xs font-medium text-gray-400 uppercase">Service type</p>
          <p className="text-sm font-semibold text-brand-navy mt-0.5">{template.name}</p>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs font-medium text-gray-400 uppercase">People ({selectedRoles.length})</p>
          {selectedRoles.length === 0 ? (
            <p className="text-sm text-gray-400 mt-0.5">None added — you can add profiles after creation</p>
          ) : (
            <div className="mt-1 space-y-1">
              {selectedRoles.map((sr) => (
                <div key={sr.profile.id} className="flex items-center gap-2 text-sm">
                  <span className="font-medium text-gray-900">{sr.profile.full_name}</span>
                  <span className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                    {sr.role}
                    {sr.role === "shareholder" && sr.shareholding_percentage ? ` ${sr.shareholding_percentage}%` : ""}
                  </span>
                  {sr.can_manage && (
                    <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded">can manage</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-3">
          <p className="text-xs font-medium text-gray-400 uppercase">Details filled</p>
          <p className="text-sm text-gray-700 mt-0.5">
            {filledFields.length}/{(template.service_fields ?? []).length} fields
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Main wizard ─────────────────────────────────────────────────────────────

export function NewServiceWizard({ templates, profiles }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<SelectedRole[]>([]);
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? null;

  function addProfile(profile: ClientProfile) {
    setSelectedRoles((prev) => [
      ...prev,
      { profile, role: "director", can_manage: false, shareholding_percentage: "" },
    ]);
  }

  function removeProfile(profileId: string) {
    setSelectedRoles((prev) => prev.filter((r) => r.profile.id !== profileId));
  }

  function updateRole(profileId: string, field: string, value: unknown) {
    setSelectedRoles((prev) =>
      prev.map((r) => r.profile.id === profileId ? { ...r, [field]: value } : r)
    );
  }

  function canAdvance(): boolean {
    if (step === 0) return selectedTemplateId !== null;
    return true;
  }

  async function handleSubmit() {
    if (!selectedTemplateId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_template_id: selectedTemplateId,
          service_details: serviceDetails,
          roles: selectedRoles.map((sr) => ({
            client_profile_id: sr.profile.id,
            role: sr.role,
            can_manage: sr.can_manage,
            shareholding_percentage:
              sr.role === "shareholder" && sr.shareholding_percentage
                ? parseFloat(sr.shareholding_percentage)
                : null,
          })),
        }),
      });
      const data = (await res.json()) as { id?: string; warning?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to create service");
      if (data.warning) toast.warning(data.warning);
      else toast.success("Service created");
      router.push(`/admin/services/${data.id!}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create service");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.push("/admin/services")}
          className="text-sm text-gray-500 hover:text-brand-navy mb-4 block"
        >
          ← Back to services
        </button>
        <h1 className="text-2xl font-bold text-brand-navy">New Service</h1>
      </div>

      <StepIndicator current={step} />

      {/* Step content */}
      <div className="min-h-[300px]">
        {step === 0 && (
          <StepPickTemplate
            templates={templates}
            selectedId={selectedTemplateId}
            onSelect={setSelectedTemplateId}
          />
        )}
        {step === 1 && (
          <StepAddPeople
            profiles={profiles}
            selectedRoles={selectedRoles}
            onAdd={addProfile}
            onRemove={removeProfile}
            onUpdateRole={updateRole}
          />
        )}
        {step === 2 && selectedTemplate && (
          <StepServiceDetails
            template={selectedTemplate}
            values={serviceDetails}
            onChange={(key, value) => setServiceDetails((prev) => ({ ...prev, [key]: value }))}
          />
        )}
        {step === 3 && selectedTemplate && (
          <StepReview
            template={selectedTemplate}
            selectedRoles={selectedRoles}
            serviceDetails={serviceDetails}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t">
        <Button
          variant="outline"
          onClick={() => (step === 0 ? router.push("/admin/services") : setStep(step - 1))}
          disabled={submitting}
        >
          {step === 0 ? "Cancel" : "Back"}
        </Button>
        {step < 3 ? (
          <Button
            onClick={() => setStep(step + 1)}
            disabled={!canAdvance()}
            className="bg-brand-navy hover:bg-brand-blue"
          >
            Continue
          </Button>
        ) : (
          <Button
            onClick={() => void handleSubmit()}
            disabled={submitting || !selectedTemplateId}
            className="bg-brand-navy hover:bg-brand-blue"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create service
          </Button>
        )}
      </div>
    </div>
  );
}
