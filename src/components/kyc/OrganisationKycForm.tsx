"use client";

import { useState, useCallback } from "react";
import { ChevronDown, ChevronRight, CheckCircle, AlertTriangle, Save } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { DocumentUploadWidget } from "@/components/shared/DocumentUploadWidget";
import { COUNTRIES } from "@/components/shared/MultiSelectCountry";
import { useAutoSave } from "@/hooks/useAutoSave";
import { calculateKycCompletion } from "@/lib/utils/completionCalculator";
import { cn } from "@/lib/utils";
import type { KycRecord, DocumentRecord, DocumentType } from "@/types";

interface OrganisationKycFormProps {
  record: KycRecord;
  documents: DocumentRecord[];
  documentTypes: DocumentType[];
  prefilled?: Set<string>;
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

function FieldRow({ children, prefilled }: { children: React.ReactNode; prefilled?: boolean }) {
  return (
    <div className="space-y-1.5">
      {children}
      {prefilled && (
        <p className="text-[11px] text-brand-blue/70">ℹ️ Pre-filled by GWMS</p>
      )}
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

export function OrganisationKycForm({
  record: initialRecord,
  documents: initialDocs,
  documentTypes,
  prefilled = new Set(),
}: OrganisationKycFormProps) {
  const [fields, setFields] = useState<Partial<KycRecord>>({
    full_name: initialRecord.full_name ?? "",
    email: initialRecord.email ?? "",
    phone: initialRecord.phone ?? "",
    address: initialRecord.address ?? "",
    business_website: initialRecord.business_website ?? "",
    jurisdiction_incorporated: initialRecord.jurisdiction_incorporated ?? "",
    date_of_incorporation: initialRecord.date_of_incorporation ?? "",
    listed_or_unlisted: initialRecord.listed_or_unlisted,
    jurisdiction_tax_residence: initialRecord.jurisdiction_tax_residence ?? "",
    description_activity: initialRecord.description_activity ?? "",
    company_registration_number: initialRecord.company_registration_number ?? "",
    industry_sector: initialRecord.industry_sector ?? "",
    regulatory_licenses: initialRecord.regulatory_licenses ?? "",
    source_of_funds_description: initialRecord.source_of_funds_description ?? "",
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
    return docs.find((d) => d.document_type_id === dt.id) ?? null;
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

  return (
    <div className="space-y-3">
      <div className="flex justify-end h-5">
        <SaveIndicator saving={saving} lastSaved={lastSaved} />
      </div>

      {/* Section 1: Company Information */}
      <div>
        <SectionHeader
          title="Company Information"
          filled={completion.sections[0]?.filled ?? 0}
          total={completion.sections[0]?.total ?? 1}
          open={openSections.has(0)}
          onToggle={() => toggle(0)}
        />
        {openSections.has(0) && (
          <div className="border border-t-0 rounded-b-lg px-4 py-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldRow prefilled={prefilled.has("full_name")}>
                <Label className="text-xs">Company / entity name *</Label>
                <Input
                  value={fields.full_name ?? ""}
                  onChange={(e) => set("full_name", e.target.value)}
                />
              </FieldRow>
              <FieldRow>
                <Label className="text-xs">Registration number</Label>
                <Input
                  value={fields.company_registration_number ?? ""}
                  onChange={(e) => set("company_registration_number", e.target.value)}
                />
              </FieldRow>
              <FieldRow prefilled={prefilled.has("email")}>
                <Label className="text-xs">Email *</Label>
                <Input type="email" value={fields.email ?? ""} onChange={(e) => set("email", e.target.value)} />
              </FieldRow>
              <FieldRow>
                <Label className="text-xs">Phone</Label>
                <Input value={fields.phone ?? ""} onChange={(e) => set("phone", e.target.value)} />
              </FieldRow>
              <FieldRow>
                <Label className="text-xs">Website</Label>
                <Input value={fields.business_website ?? ""} onChange={(e) => set("business_website", e.target.value)} placeholder="https://…" />
              </FieldRow>
              <FieldRow>
                <Label className="text-xs">Industry / Sector</Label>
                <Input value={fields.industry_sector ?? ""} onChange={(e) => set("industry_sector", e.target.value)} />
              </FieldRow>
            </div>

            <FieldRow prefilled={prefilled.has("address")}>
              <Label className="text-xs">Registered business address *</Label>
              <Textarea
                value={fields.address ?? ""}
                onChange={(e) => set("address", e.target.value)}
                rows={2}
              />
            </FieldRow>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <FieldRow prefilled={prefilled.has("jurisdiction_incorporated")}>
                <Label className="text-xs">Jurisdiction of incorporation *</Label>
                <Select
                  value={fields.jurisdiction_incorporated ?? ""}
                  onValueChange={(v) => set("jurisdiction_incorporated", v ?? "")}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="Select jurisdiction…" />
                  </SelectTrigger>
                  <SelectContent>
                    {COUNTRIES.map((j) => (
                      <SelectItem key={j} value={j}>{j}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow prefilled={prefilled.has("date_of_incorporation")}>
                <Label className="text-xs">Date of incorporation *</Label>
                <Input
                  type="date"
                  value={fields.date_of_incorporation ?? ""}
                  onChange={(e) => set("date_of_incorporation", e.target.value)}
                />
              </FieldRow>
              <FieldRow>
                <Label className="text-xs">Tax residence jurisdiction</Label>
                <Input
                  value={fields.jurisdiction_tax_residence ?? ""}
                  onChange={(e) => set("jurisdiction_tax_residence", e.target.value)}
                />
              </FieldRow>
              <FieldRow prefilled={prefilled.has("listed_or_unlisted")}>
                <Label className="text-xs">Listed or unlisted? *</Label>
                <div className="flex gap-3 mt-1">
                  <Button
                    type="button"
                    variant={fields.listed_or_unlisted === "listed" ? "default" : "outline"}
                    size="sm"
                    className={fields.listed_or_unlisted === "listed" ? "bg-brand-navy" : ""}
                    onClick={() => set("listed_or_unlisted", "listed")}
                  >
                    Listed
                  </Button>
                  <Button
                    type="button"
                    variant={fields.listed_or_unlisted === "unlisted" ? "default" : "outline"}
                    size="sm"
                    className={fields.listed_or_unlisted === "unlisted" ? "bg-brand-navy" : ""}
                    onClick={() => set("listed_or_unlisted", "unlisted")}
                  >
                    Unlisted
                  </Button>
                </div>
              </FieldRow>
            </div>

            <FieldRow prefilled={prefilled.has("description_activity")}>
              <Label className="text-xs">Description of business activity *</Label>
              <Textarea
                value={fields.description_activity ?? ""}
                onChange={(e) => set("description_activity", e.target.value)}
                rows={2}
                placeholder="Describe the nature of the business, products or services"
              />
            </FieldRow>

            <FieldRow>
              <Label className="text-xs">Regulatory licenses held</Label>
              <Textarea
                value={fields.regulatory_licenses ?? ""}
                onChange={(e) => set("regulatory_licenses", e.target.value)}
                rows={2}
                placeholder="List any regulatory licenses, permits, or authorisations"
              />
            </FieldRow>

            {/* Incorporation documents */}
            <div className="space-y-2">
              {[
                "Certificate of Incorporation",
                "Proof of Company Address",
                "Company Registration Number Document",
              ].map((name) => (
                <div key={name} className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
                  <span className="text-xs text-gray-600">{name}</span>
                  <DocumentUploadWidget
                    clientId={initialRecord.client_id}
                    kycRecordId={initialRecord.id}
                    documentTypeId={findDocType(name)?.id}
                    documentTypeName={name}
                    existingDocument={docsForType(name)}
                    onUploadComplete={onDocUploaded}
                    compact
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Corporate Documents */}
      <div>
        <SectionHeader
          title="Corporate Documents"
          filled={completion.sections[1]?.filled ?? 0}
          total={completion.sections[1]?.total ?? 1}
          open={openSections.has(1)}
          onToggle={() => toggle(1)}
        />
        {openSections.has(1) && (
          <div className="border border-t-0 rounded-b-lg px-4 py-4 space-y-2">
            {[
              "Memorandum & Articles of Association",
              "Certificate of Good Standing",
              "Register of Directors",
              "Register of Shareholders/Members",
              "Structure Chart",
              "AML/CFT Declaration Form",
            ].map((name) => (
              <div key={name} className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
                <span className="text-xs text-gray-600">{name}</span>
                <DocumentUploadWidget
                  clientId={initialRecord.client_id}
                  kycRecordId={initialRecord.id}
                  documentTypeId={findDocType(name)?.id}
                  documentTypeName={name}
                  existingDocument={docsForType(name)}
                  onUploadComplete={onDocUploaded}
                  compact
                />
              </div>
            ))}
            <div className="border rounded-lg p-3 mt-2">
              <p className="text-xs text-gray-500 mb-2">Upload additional corporate document</p>
              <DocumentUploadWidget
                clientId={initialRecord.client_id}
                kycRecordId={initialRecord.id}
                showTypeSelector
                documentTypes={documentTypes.filter((dt) => dt.category === "corporate")}
                onUploadComplete={onDocUploaded}
                compact={false}
              />
            </div>
          </div>
        )}
      </div>

      {/* Section 3: Financial Documents */}
      <div>
        <SectionHeader
          title="Financial Documents"
          filled={completion.sections[2]?.filled ?? 0}
          total={completion.sections[2]?.total ?? 1}
          open={openSections.has(2)}
          onToggle={() => toggle(2)}
        />
        {openSections.has(2) && (
          <div className="border border-t-0 rounded-b-lg px-4 py-4 space-y-4">
            <FieldRow>
              <Label className="text-xs">Source of funds — description</Label>
              <Textarea
                value={fields.source_of_funds_description ?? ""}
                onChange={(e) => set("source_of_funds_description", e.target.value)}
                rows={2}
                placeholder="Describe the origin of funds used in this engagement"
              />
            </FieldRow>

            <div className="space-y-2">
              {[
                "Declaration of Source of Funds",
                "Evidence of Source of Funds",
                "Audited Financial Statements",
              ].map((name) => (
                <div key={name} className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
                  <span className="text-xs text-gray-600">{name}</span>
                  <DocumentUploadWidget
                    clientId={initialRecord.client_id}
                    kycRecordId={initialRecord.id}
                    documentTypeId={findDocType(name)?.id}
                    documentTypeName={name}
                    existingDocument={docsForType(name)}
                    onUploadComplete={onDocUploaded}
                    compact
                  />
                </div>
              ))}
              <div className="flex items-center justify-between rounded border bg-gray-50 px-3 py-2">
                <span className="text-xs text-gray-600">Business Plan (optional)</span>
                <DocumentUploadWidget
                  clientId={initialRecord.client_id}
                  kycRecordId={initialRecord.id}
                  documentTypeId={findDocType("Business Plan")?.id}
                  documentTypeName="Business Plan"
                  existingDocument={docsForType("Business Plan")}
                  onUploadComplete={onDocUploaded}
                  compact
                />
              </div>
            </div>

            <div className="border rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-2">Upload additional financial document</p>
              <DocumentUploadWidget
                clientId={initialRecord.client_id}
                kycRecordId={initialRecord.id}
                showTypeSelector
                documentTypes={documentTypes.filter((dt) => dt.category === "financial")}
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
