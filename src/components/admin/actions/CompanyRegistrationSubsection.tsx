"use client";

// B-119 — Company Registration subsection. New in this brief; persists
// `registration_date`, `registration_number`, `registry_country`, and
// `notes` on `service_actions` via the same PATCH endpoint the other
// action subsections use. Wrapped in <ActionSubsection> for the shared
// header (chevron + label + status pill + Save indicator).

import { useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CountrySelect } from "@/components/shared/CountrySelect";
import { ActionSubsection } from "./ActionSubsection";
import {
  ReferenceFormsPanel,
  type ReferenceFormSummary,
  type SubmittedFormSummary,
} from "./ReferenceFormsPanel";
import type { ServiceAction } from "@/types";

interface Props {
  serviceId: string;
  action: ServiceAction;
  onSaved?: (action: ServiceAction) => void;
  defaultOpen?: boolean;
  referenceForms?: ReferenceFormSummary[];
  submittedFormsByRefId?: Record<string, SubmittedFormSummary[]>;
}

function normalize(s: string): string {
  return s.trim();
}

function isoOrEmpty(value: string | null | undefined): string {
  if (!value) return "";
  // Accept either "2026-05-15" or full ISO; collapse to YYYY-MM-DD.
  const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

export function CompanyRegistrationSubsection({
  serviceId,
  action,
  onSaved,
  defaultOpen,
  referenceForms = [],
  submittedFormsByRefId = {},
}: Props) {
  const [date, setDate] = useState(isoOrEmpty(action.registration_date ?? null));
  const [number, setNumber] = useState(action.registration_number ?? "");
  const [country, setCountry] = useState(action.registry_country ?? "");
  const [notes, setNotes] = useState(action.notes ?? "");
  const [saving, setSaving] = useState(false);

  const dirty =
    isoOrEmpty(action.registration_date ?? null) !== date ||
    (action.registration_number ?? "") !== normalize(number) ||
    (action.registry_country ?? "") !== country ||
    (action.notes ?? "") !== normalize(notes);

  function handleCancel() {
    setDate(isoOrEmpty(action.registration_date ?? null));
    setNumber(action.registration_number ?? "");
    setCountry(action.registry_country ?? "");
    setNotes(action.notes ?? "");
  }

  async function handleSave() {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/actions`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_key: "company_registration",
          registration_date: date || null,
          registration_number: normalize(number) || null,
          registry_country: country || null,
          notes: normalize(notes) || null,
        }),
      });
      const data = (await res.json()) as {
        data?: ServiceAction;
        error?: string;
      };
      if (!res.ok || !data.data) throw new Error(data.error ?? "Save failed");
      onSaved?.(data.data);
      toast.success("Company Registration saved", { position: "top-right" });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Save failed",
        { position: "top-right" },
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <ActionSubsection
      serviceId={serviceId}
      action={action}
      title="Company Registration"
      icon={<Building2 className="h-3.5 w-3.5" />}
      onSaved={onSaved}
      defaultOpen={defaultOpen}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Registration date</Label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Registration number</Label>
          <Input
            type="text"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="Registry-issued number"
            className="text-sm"
          />
        </div>
        <div className="md:col-span-2 space-y-1">
          <Label className="text-xs">Registry country</Label>
          <CountrySelect
            value={country}
            onChange={(v) => setCountry(v)}
            placeholder="Country of registration…"
          />
        </div>
        <div className="md:col-span-2 space-y-1">
          <Label className="text-xs">Notes</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Filing reference, registry contact, blockers…"
            rows={3}
            className="text-sm resize-none"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-1">
        <Button
          variant="outline"
          onClick={handleCancel}
          disabled={!dirty || saving}
          className="h-8 text-xs"
        >
          Cancel
        </Button>
        <Button
          onClick={() => void handleSave()}
          disabled={!dirty || saving}
          className="h-8 text-xs bg-brand-navy hover:bg-brand-blue text-white"
        >
          {saving && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
          Save
        </Button>
      </div>
      <ReferenceFormsPanel
        serviceId={serviceId}
        actionKey="company_registration"
        referenceForms={referenceForms}
        submittedFormsByRefId={submittedFormsByRefId}
      />
    </ActionSubsection>
  );
}
