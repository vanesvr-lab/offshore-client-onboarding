"use client";

import { useState, useCallback } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, CheckCircle, AlertTriangle, Loader2, Save, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import { COUNTRIES } from "@/components/shared/MultiSelectCountry";
import { useAutoSave } from "@/hooks/useAutoSave";
import { calculateKycCompletion } from "@/lib/utils/completionCalculator";
import { computeAvailableExtracts, computePrefillableFields } from "@/lib/kyc/computePrefillable";
import type { PrefillableField } from "@/lib/kyc/computePrefillable";
import { FieldPrefillIcon } from "@/components/kyc/FieldPrefillIcon";
import { cn } from "@/lib/utils";
import type { KycRecord, DocumentRecord, DocumentType } from "@/types";

interface IndividualKycFormProps {
  record: KycRecord;
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  prefilled?: Set<string>;
  /** B-042 — uploaded documents to mine for AI-extracted prefill values. Defaults to `documents` when omitted. */
  personDocs?: DocumentRecord[];
  /** B-042 — document type definitions for the prefill helper. Defaults to `documentTypes` when omitted. */
  personDocTypes?: DocumentType[];
}

function SectionHeader({
  title,
  filled,
  total,
  open,
  onToggle,
}: {
  title: string;
  filled: number;
  total: number;
  open: boolean;
  onToggle: () => void;
}) {
  const complete = filled === total;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 rounded-lg border transition-colors text-left"
    >
      <div className="flex items-center gap-3">
        {complete ? (
          <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
        )}
        <span className="font-medium text-sm text-brand-navy">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={cn("text-xs", complete ? "text-green-600" : "text-amber-600")}>
          {filled}/{total} complete
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
      </div>
    </button>
  );
}

function FieldRow({ children, prefilled, mandatory }: { children: React.ReactNode; prefilled?: boolean; mandatory?: boolean }) {
  return (
    <div className="space-y-1.5 relative">
      {children}
      {mandatory && (
        <div className="absolute top-0 right-0">
          <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Required</span>
        </div>
      )}
      {prefilled && (
        <p className="text-[11px] text-brand-blue/70">ℹ️ Pre-filled by GWMS</p>
      )}
    </div>
  );
}

function FieldLegend() {
  return (
    <div className="flex items-center gap-4 text-[11px] text-gray-500 px-1 pb-2 border-b border-gray-100 mb-3">
      <span className="flex items-center gap-1">
        <span className="text-amber-600 bg-amber-50 px-1 py-0.5 rounded text-[10px]">Required</span>
        Mandatory for compliance
      </span>
      <span className="flex items-center gap-1">
        <span className="text-gray-400">No tag</span>
        = Optional
      </span>
    </div>
  );
}

function SaveIndicator({ saving, lastSaved }: { saving: boolean; lastSaved: Date | null }) {
  if (saving) return <span className="text-xs text-gray-400">Saving…</span>;
  if (lastSaved) {
    return (
      <span className="text-xs text-green-600 flex items-center gap-1">
        <Save className="h-3 w-3" /> Saved
      </span>
    );
  }
  return null;
}

export function IndividualKycForm({
  record: initialRecord,
  documents: initialDocs,
  documentTypes,
  prefilled = new Set(),
  personDocs,
  personDocTypes,
}: IndividualKycFormProps) {
  const [fields, setFields] = useState<Partial<KycRecord>>({
    full_name: initialRecord.full_name ?? "",
    aliases: initialRecord.aliases ?? "",
    date_of_birth: initialRecord.date_of_birth ?? "",
    nationality: initialRecord.nationality ?? "",
    passport_country: initialRecord.passport_country ?? "",
    passport_number: initialRecord.passport_number ?? "",
    passport_expiry: initialRecord.passport_expiry ?? "",
    address: initialRecord.address ?? "",
    phone: initialRecord.phone ?? "",
    email: initialRecord.email ?? "",
    work_address: initialRecord.work_address ?? "",
    work_phone: initialRecord.work_phone ?? "",
    work_email: initialRecord.work_email ?? "",
    occupation: initialRecord.occupation ?? "",
    source_of_funds_description: initialRecord.source_of_funds_description ?? "",
    source_of_wealth_description: initialRecord.source_of_wealth_description ?? "",
    is_pep: initialRecord.is_pep,
    pep_details: initialRecord.pep_details ?? "",
    legal_issues_declared: initialRecord.legal_issues_declared,
    legal_issues_details: initialRecord.legal_issues_details ?? "",
    tax_identification_number: initialRecord.tax_identification_number ?? "",
  });
  const [docs, setDocs] = useState<DocumentRecord[]>(initialDocs);

  const { saving, lastSaved } = useAutoSave(
    initialRecord.id,
    fields as Record<string, unknown>
  );

  const completion = calculateKycCompletion(
    { ...initialRecord, ...fields } as KycRecord,
    docs
  );

  // First incomplete section is open by default
  const firstIncomplete = completion.sections.findIndex((s) => s.filled < s.total);
  const [openSections, setOpenSections] = useState<Set<number>>(
    new Set(firstIncomplete >= 0 ? [firstIncomplete] : [0])
  );

  function toggle(i: number) {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function set(key: keyof KycRecord, value: unknown) {
    setFields((prev) => ({ ...prev, [key]: value }));
  }

  function findDocType(name: string): DocumentType | undefined {
    return documentTypes.find((dt) => dt.name === name);
  }

  function docsForType(name: string): DocumentRecord | null {
    const dt = findDocType(name);
    if (!dt) return null;
    // Return the LATEST document of this type (last in array if sorted ascending, or sort here)
    const matching = docs.filter((d) => d.document_type_id === dt.id);
    if (matching.length === 0) return null;
    // Sort by uploaded_at descending, return the newest
    return matching.sort((a, b) =>
      new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime()
    )[0];
  }

  const onDocUploaded = useCallback((doc: DocumentRecord) => {
    setDocs((prev) => {
      const existing = prev.findIndex((d) => d.document_type_id === doc.document_type_id);
      if (existing >= 0) {
        const next = [...prev];
        next[existing] = doc;
        return next;
      }
      return [doc, ...prev];
    });
  }, []);

  const isPep = fields.is_pep;
  const hasLegalIssues = fields.legal_issues_declared;

  const [prefilling, setPrefilling] = useState(false);
  const prefillSourceDocs = personDocs ?? docs;
  const prefillSourceDocTypes = personDocTypes ?? documentTypes;
  const prefillInput = {
    docs: prefillSourceDocs.map((d) => ({
      id: d.id,
      document_type_id: d.document_type_id ?? null,
      uploaded_at: d.uploaded_at ?? null,
      verification_result: (d.verification_result ?? null) as {
        extracted_fields?: Record<string, unknown> | null;
      } | null,
    })),
    docTypes: prefillSourceDocTypes.map((t) => ({
      id: t.id,
      name: t.name,
      ai_extraction_fields: t.ai_extraction_fields ?? null,
    })),
  };
  const availableExtracts = computeAvailableExtracts(prefillInput);
  const availableByTarget = new Map<string, PrefillableField>();
  for (const row of availableExtracts) availableByTarget.set(row.target, row);

  async function handleFieldPrefill(
    target: string,
    value: string,
    sourceDocLabel: string,
    fieldLabel: string,
  ) {
    if (!initialRecord.id) {
      toast.error("Couldn't fill from document — please try again.");
      return;
    }
    try {
      const res = await fetch("/api/profiles/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId: initialRecord.id, fields: { [target]: value } }),
      });
      if (!res.ok) throw new Error("save failed");
      setFields((prev) => ({ ...prev, [target]: value }));
      toast.success(`Filled ${fieldLabel} from ${sourceDocLabel}.`);
    } catch {
      toast.error("Couldn't fill from document — please try again.");
    }
  }
  const prefillable = computePrefillableFields({
    form: fields as Record<string, unknown>,
    docs: prefillInput.docs,
    docTypes: prefillInput.docTypes,
  });

  async function handlePrefillClick() {
    if (!initialRecord.id) {
      toast.error("Couldn't fill from document — please try again.");
      return;
    }
    setPrefilling(true);
    try {
      const payload: Record<string, string> = {};
      for (const row of prefillable) payload[row.target] = row.value;
      if (Object.keys(payload).length === 0) {
        toast.message("All extractable fields are already filled.");
        setPrefilling(false);
        return;
      }
      const res = await fetch("/api/profiles/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId: initialRecord.id, fields: payload }),
      });
      if (!res.ok) throw new Error("save failed");

      setFields((prev) => ({ ...prev, ...payload }));
      const n = Object.keys(payload).length;
      toast.success(`Filled ${n} field${n === 1 ? "" : "s"} from your uploaded document.`);
    } catch {
      toast.error("Couldn't fill from document — please try again.");
    } finally {
      setPrefilling(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Save indicator */}
      <div className="flex justify-end h-5">
        <SaveIndicator saving={saving} lastSaved={lastSaved} />
      </div>

      {/* Field legend */}
      <FieldLegend />

      {/* B-042 — on-demand AI prefill */}
      {prefillable.length > 0 && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void handlePrefillClick()}
          disabled={prefilling}
          className="w-full h-auto py-3 border-2 border-dashed border-brand-blue/60 bg-brand-blue/5 hover:bg-brand-blue/10 text-brand-navy flex flex-col items-center justify-center gap-0.5"
        >
          <span className="inline-flex items-center gap-2 text-sm font-medium">
            {prefilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-brand-blue" />}
            Fill from uploaded document
          </span>
          <span className="text-[11px] text-gray-500 font-normal">
            Uses values extracted from your passport / ID.
          </span>
        </Button>
      )}

      {/* Section 1: Personal Details */}
      <div>
        <SectionHeader
          title="Personal Details"
          filled={completion.sections[0]?.filled ?? 0}
          total={completion.sections[0]?.total ?? 1}
          open={openSections.has(0)}
          onToggle={() => toggle(0)}
        />
        {openSections.has(0) && (
          <div className="border border-t-0 rounded-b-lg px-4 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldRow prefilled={prefilled.has("full_name")} mandatory>
                <Label className="text-xs">
                  Full legal name *
                  {availableByTarget.get("full_name") && (
                    <FieldPrefillIcon
                      prefillFrom={availableByTarget.get("full_name")!}
                      fieldLabel="Full legal name"
                      onFill={handleFieldPrefill}
                    />
                  )}
                </Label>
                <Input
                  value={fields.full_name ?? ""}
                  onChange={(e) => set("full_name", e.target.value)}
                  placeholder="As it appears on passport"
                />
              </FieldRow>
              <FieldRow>
                <Label className="text-xs">Known aliases / other names</Label>
                <Input
                  value={fields.aliases ?? ""}
                  onChange={(e) => set("aliases", e.target.value)}
                  placeholder="e.g. maiden name"
                />
              </FieldRow>
              <FieldRow prefilled={prefilled.has("date_of_birth")} mandatory>
                <Label className="text-xs">
                  Date of birth *
                  {availableByTarget.get("date_of_birth") && (
                    <FieldPrefillIcon
                      prefillFrom={availableByTarget.get("date_of_birth")!}
                      fieldLabel="Date of birth"
                      onFill={handleFieldPrefill}
                    />
                  )}
                </Label>
                <Input
                  type="date"
                  value={fields.date_of_birth ?? ""}
                  onChange={(e) => set("date_of_birth", e.target.value)}
                />
              </FieldRow>
              <FieldRow prefilled={prefilled.has("nationality")} mandatory>
                <Label className="text-xs">
                  Nationality *
                  {availableByTarget.get("nationality") && (
                    <FieldPrefillIcon
                      prefillFrom={availableByTarget.get("nationality")!}
                      fieldLabel="Nationality"
                      onFill={handleFieldPrefill}
                    />
                  )}
                </Label>
                <Select
                  value={fields.nationality ?? ""}
                  onValueChange={(v) => set("nationality", v ?? "")}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select nationality…" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((n) => (
                      <SelectItem key={n} value={n}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow>
                <Label className="text-xs">
                  Passport issuing country
                  {availableByTarget.get("passport_country") && (
                    <FieldPrefillIcon
                      prefillFrom={availableByTarget.get("passport_country")!}
                      fieldLabel="Passport issuing country"
                      onFill={handleFieldPrefill}
                    />
                  )}
                </Label>
                <Select
                  value={fields.passport_country ?? ""}
                  onValueChange={(v) => set("passport_country", v ?? "")}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select country…" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow prefilled={prefilled.has("passport_number")} mandatory>
                <Label className="text-xs">
                  Passport number *
                  {availableByTarget.get("passport_number") && (
                    <FieldPrefillIcon
                      prefillFrom={availableByTarget.get("passport_number")!}
                      fieldLabel="Passport number"
                      onFill={handleFieldPrefill}
                    />
                  )}
                </Label>
                <Input
                  value={fields.passport_number ?? ""}
                  onChange={(e) => set("passport_number", e.target.value)}
                />
              </FieldRow>
              <FieldRow prefilled={prefilled.has("passport_expiry")} mandatory>
                <Label className="text-xs">
                  Passport expiry date *
                  {availableByTarget.get("passport_expiry") && (
                    <FieldPrefillIcon
                      prefillFrom={availableByTarget.get("passport_expiry")!}
                      fieldLabel="Passport expiry date"
                      onFill={handleFieldPrefill}
                    />
                  )}
                </Label>
                <Input
                  type="date"
                  value={fields.passport_expiry ?? ""}
                  onChange={(e) => set("passport_expiry", e.target.value)}
                />
                {fields.passport_expiry && (() => {
                  const days = (new Date(fields.passport_expiry as string).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
                  if (days < 0) return <p className="text-xs text-red-600">Passport has expired</p>;
                  if (days < 180) return <p className="text-xs text-amber-600">Passport expires within 6 months — a new passport may be required</p>;
                  return null;
                })()}
              </FieldRow>
            </div>

            {/* Passport upload */}
            <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-600">Certified Passport Copy</span>
              <DocumentUploadWidget
                clientId={initialRecord.client_id}
                kycRecordId={initialRecord.id}
                documentTypeId={findDocType("Certified Passport Copy")?.id}
                documentTypeName="Certified Passport Copy"
                existingDocument={docsForType("Certified Passport Copy")}
                onUploadComplete={onDocUploaded}
                compact
              />
            </div>

            <FieldRow prefilled={prefilled.has("address")} mandatory>
              <Label className="text-xs">
                Residential address *
                {availableByTarget.get("address") && (
                  <FieldPrefillIcon
                    prefillFrom={availableByTarget.get("address")!}
                    fieldLabel="Residential address"
                    onFill={handleFieldPrefill}
                  />
                )}
              </Label>
              <Textarea
                value={fields.address ?? ""}
                onChange={(e) => set("address", e.target.value)}
                rows={2}
                placeholder="Full residential address"
              />
            </FieldRow>

            {/* Proof of address upload */}
            <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
              <div>
                <span className="text-xs text-gray-600">Proof of Residential Address</span>
                <p className="text-[11px] text-gray-400">Must be dated within 3 months</p>
              </div>
              <DocumentUploadWidget
                clientId={initialRecord.client_id}
                kycRecordId={initialRecord.id}
                documentTypeId={findDocType("Proof of Residential Address")?.id}
                documentTypeName="Proof of Residential Address"
                existingDocument={docsForType("Proof of Residential Address")}
                onUploadComplete={onDocUploaded}
                compact
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldRow prefilled={prefilled.has("phone")}>
                <Label className="text-xs">Personal phone</Label>
                <Input value={fields.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="+230 …" />
              </FieldRow>
              <FieldRow prefilled={prefilled.has("email")} mandatory>
                <Label className="text-xs">Personal email *</Label>
                <Input type="email" value={fields.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </FieldRow>
              <FieldRow>
                <Label className="text-xs">Work address</Label>
                <Input value={fields.work_address ?? ""} onChange={(e) => set("work_address", e.target.value)} />
              </FieldRow>
              <FieldRow>
                <Label className="text-xs">Work phone</Label>
                <Input value={fields.work_phone ?? ""} onChange={(e) => set("work_phone", e.target.value)} />
              </FieldRow>
              <FieldRow>
                <Label className="text-xs">Work email</Label>
                <Input type="email" value={fields.work_email ?? ""} onChange={(e) => set("work_email", e.target.value)} />
              </FieldRow>
              <FieldRow prefilled={prefilled.has("occupation")} mandatory>
                <Label className="text-xs">
                  Occupation / Profession *
                  {availableByTarget.get("occupation") && (
                    <FieldPrefillIcon
                      prefillFrom={availableByTarget.get("occupation")!}
                      fieldLabel="Occupation / Profession"
                      onFill={handleFieldPrefill}
                    />
                  )}
                </Label>
                <Input value={fields.occupation ?? ""} onChange={(e) => set("occupation", e.target.value)} />
              </FieldRow>
            </div>

            <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-600">Proof of Occupation (optional)</span>
              <DocumentUploadWidget
                clientId={initialRecord.client_id}
                kycRecordId={initialRecord.id}
                documentTypeId={findDocType("Proof of Employment")?.id}
                documentTypeName="Proof of Occupation"
                existingDocument={docsForType("Proof of Employment")}
                onUploadComplete={onDocUploaded}
                compact
              />
            </div>

            <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-600">CV / Resume (optional)</span>
              <DocumentUploadWidget
                clientId={initialRecord.client_id}
                kycRecordId={initialRecord.id}
                documentTypeId={findDocType("CV / Resume")?.id}
                documentTypeName="CV / Resume"
                existingDocument={docsForType("CV / Resume")}
                onUploadComplete={onDocUploaded}
                compact
              />
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Funding & Financial Profile */}
      <div>
        <SectionHeader
          title="Funding & Financial Profile"
          filled={completion.sections[1]?.filled ?? 0}
          total={completion.sections[1]?.total ?? 1}
          open={openSections.has(1)}
          onToggle={() => toggle(1)}
        />
        {openSections.has(1) && (
          <div className="border border-t-0 rounded-b-lg px-4 py-4 space-y-4">
            <FieldRow mandatory>
              <Label className="text-xs">Source of funds — description *</Label>
              <Textarea
                value={fields.source_of_funds_description ?? ""}
                onChange={(e) => set("source_of_funds_description", e.target.value)}
                rows={3}
                placeholder="Describe how the funds to be used in this matter were accumulated (e.g. salary, business profits, inheritance, property sale…)"
              />
            </FieldRow>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
                <span className="text-xs text-gray-600">Declaration of Source of Funds</span>
                <DocumentUploadWidget
                  clientId={initialRecord.client_id}
                  kycRecordId={initialRecord.id}
                  documentTypeId={findDocType("Declaration of Source of Funds")?.id}
                  documentTypeName="Declaration of Source of Funds"
                  existingDocument={docsForType("Declaration of Source of Funds")}
                  onUploadComplete={onDocUploaded}
                  compact
                />
              </div>
              <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
                <span className="text-xs text-gray-600">Evidence of Source of Funds</span>
                <DocumentUploadWidget
                  clientId={initialRecord.client_id}
                  kycRecordId={initialRecord.id}
                  documentTypeId={findDocType("Evidence of Source of Funds")?.id}
                  documentTypeName="Evidence of Source of Funds"
                  existingDocument={docsForType("Evidence of Source of Funds")}
                  onUploadComplete={onDocUploaded}
                  compact
                />
              </div>
            </div>

            <FieldRow>
              <Label className="text-xs">Source of wealth — description</Label>
              <Textarea
                value={fields.source_of_wealth_description ?? ""}
                onChange={(e) => set("source_of_wealth_description", e.target.value)}
                rows={2}
                placeholder="Describe overall wealth accumulation (may differ from source of funds)"
              />
            </FieldRow>

            <div className="space-y-2">
              <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
                <span className="text-xs text-gray-600">Declaration of Source of Wealth (optional)</span>
                <DocumentUploadWidget
                  clientId={initialRecord.client_id}
                  kycRecordId={initialRecord.id}
                  documentTypeId={findDocType("Declaration of Source of Wealth")?.id}
                  documentTypeName="Declaration of Source of Wealth"
                  existingDocument={docsForType("Declaration of Source of Wealth")}
                  onUploadComplete={onDocUploaded}
                  compact
                />
              </div>
              <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
                <span className="text-xs text-gray-600">Evidence of Source of Wealth (optional)</span>
                <DocumentUploadWidget
                  clientId={initialRecord.client_id}
                  kycRecordId={initialRecord.id}
                  documentTypeId={findDocType("Evidence of Source of Wealth")?.id}
                  documentTypeName="Evidence of Source of Wealth"
                  existingDocument={docsForType("Evidence of Source of Wealth")}
                  onUploadComplete={onDocUploaded}
                  compact
                />
              </div>
              <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
                <span className="text-xs text-gray-600">Bank Reference Letter (optional)</span>
                <DocumentUploadWidget
                  clientId={initialRecord.client_id}
                  kycRecordId={initialRecord.id}
                  documentTypeId={findDocType("Bank Reference Letter")?.id}
                  documentTypeName="Bank Reference Letter"
                  existingDocument={docsForType("Bank Reference Letter")}
                  onUploadComplete={onDocUploaded}
                  compact
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Declarations */}
      <div>
        <SectionHeader
          title="Declarations"
          filled={completion.sections[2]?.filled ?? 0}
          total={completion.sections[2]?.total ?? 1}
          open={openSections.has(2)}
          onToggle={() => toggle(2)}
        />
        {openSections.has(2) && (
          <div className="border border-t-0 rounded-b-lg px-4 py-4 space-y-4">
            {/* PEP */}
            <div className="space-y-2">
              <Label className="text-xs">Are you, or have you ever been, a Politically Exposed Person (PEP)? * <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded ml-2">Required</span></Label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={isPep === true ? "default" : "outline"}
                  size="sm"
                  className={isPep === true ? "bg-brand-navy" : ""}
                  onClick={() => set("is_pep", true)}
                >
                  Yes
                </Button>
                <Button
                  type="button"
                  variant={isPep === false ? "default" : "outline"}
                  size="sm"
                  className={isPep === false ? "bg-brand-navy" : ""}
                  onClick={() => set("is_pep", false)}
                >
                  No
                </Button>
              </div>
              {isPep && (
                <div className="space-y-2 pl-2 border-l-2 border-amber-300">
                  <Textarea
                    value={fields.pep_details ?? ""}
                    onChange={(e) => set("pep_details", e.target.value)}
                    rows={2}
                    placeholder="Please provide details of your PEP status"
                  />
                  <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
                    <span className="text-xs text-gray-600">PEP Declaration Form</span>
                    <DocumentUploadWidget
                      clientId={initialRecord.client_id}
                      kycRecordId={initialRecord.id}
                      documentTypeId={findDocType("PEP Declaration Form")?.id}
                      documentTypeName="PEP Declaration Form"
                      existingDocument={docsForType("PEP Declaration Form")}
                      onUploadComplete={onDocUploaded}
                      compact
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Legal issues */}
            <div className="space-y-2">
              <Label className="text-xs">Have you been involved in any criminal, civil or regulatory proceedings? *</Label>
              <div className="flex gap-3">
                <Button
                  type="button"
                  variant={hasLegalIssues === true ? "default" : "outline"}
                  size="sm"
                  className={hasLegalIssues === true ? "bg-brand-navy" : ""}
                  onClick={() => set("legal_issues_declared", true)}
                >
                  Yes
                </Button>
                <Button
                  type="button"
                  variant={hasLegalIssues === false ? "default" : "outline"}
                  size="sm"
                  className={hasLegalIssues === false ? "bg-brand-navy" : ""}
                  onClick={() => set("legal_issues_declared", false)}
                >
                  No
                </Button>
              </div>
              {hasLegalIssues && (
                <div className="pl-2 border-l-2 border-amber-300">
                  <Textarea
                    value={fields.legal_issues_details ?? ""}
                    onChange={(e) => set("legal_issues_details", e.target.value)}
                    rows={2}
                    placeholder="Please provide details"
                  />
                </div>
              )}
            </div>

            {/* TIN */}
            <FieldRow>
              <Label className="text-xs">
                Tax Identification Number (TIN)
                {availableByTarget.get("tax_identification_number") && (
                  <FieldPrefillIcon
                    prefillFrom={availableByTarget.get("tax_identification_number")!}
                    fieldLabel="Tax Identification Number"
                    onFill={handleFieldPrefill}
                  />
                )}
              </Label>
              <Input
                value={fields.tax_identification_number ?? ""}
                onChange={(e) => set("tax_identification_number", e.target.value)}
              />
            </FieldRow>
            <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-600">Tax Identification Document (optional)</span>
              <DocumentUploadWidget
                clientId={initialRecord.client_id}
                kycRecordId={initialRecord.id}
                documentTypeId={findDocType("Tax Identification Document")?.id}
                documentTypeName="Tax Identification Document"
                existingDocument={docsForType("Tax Identification Document")}
                onUploadComplete={onDocUploaded}
                compact
              />
            </div>
          </div>
        )}
      </div>

      {/* Section 4: Additional Documents */}
      <div>
        <SectionHeader
          title="Additional Documents"
          filled={completion.sections[3]?.filled ?? 0}
          total={completion.sections[3]?.total ?? 1}
          open={openSections.has(3)}
          onToggle={() => toggle(3)}
        />
        {openSections.has(3) && (
          <div className="border border-t-0 rounded-b-lg px-4 py-4 space-y-3">
            <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
              <span className="text-xs text-gray-600">Professional Reference Letter (optional)</span>
              <DocumentUploadWidget
                clientId={initialRecord.client_id}
                kycRecordId={initialRecord.id}
                documentTypeId={findDocType("Professional Reference Letter")?.id}
                documentTypeName="Professional Reference Letter"
                existingDocument={docsForType("Professional Reference Letter")}
                onUploadComplete={onDocUploaded}
                compact
              />
            </div>
            <div className="border rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-2">Upload any additional supporting document</p>
              <DocumentUploadWidget
                clientId={initialRecord.client_id}
                kycRecordId={initialRecord.id}
                showTypeSelector
                documentTypes={documentTypes}
                onUploadComplete={onDocUploaded}
                compact={false}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
