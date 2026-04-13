"use client";

import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { KycStepWizard } from "@/components/kyc/KycStepWizard";
import { ProfileSelector } from "@/components/shared/ProfileSelector";
import { calculateComplianceScore } from "@/lib/utils/complianceScoring";
import type { KycRecord, DocumentRecord, DocumentType, DueDiligenceLevel, DueDiligenceRequirement } from "@/types";

type PersonRole = "director" | "shareholder" | "ubo" | "contact";

interface PersonKyc {
  id: string;
  full_name: string | null;
  email: string | null;
  date_of_birth: string | null;
  nationality: string | null;
  passport_number: string | null;
  passport_expiry: string | null;
  occupation: string | null;
  address: string | null;
  source_of_funds_description: string | null;
  is_pep: boolean | null;
  legal_issues_declared: boolean | null;
  completion_status: string;
  kyc_journey_completed: boolean;
  client_id: string;
}

interface Person {
  id: string;
  role: PersonRole;
  shareholding_percentage: number | null;
  created_at: string;
  kyc_records: PersonKyc | null;
  doc_count: number;
}

interface PersonsManagerProps {
  applicationId: string;
  clientId?: string;
  dueDiligenceLevel?: DueDiligenceLevel;
  requirements?: DueDiligenceRequirement[];
  documentTypes?: DocumentType[];
}

const ROLE_LABELS: Record<PersonRole, string> = {
  director: "Director",
  shareholder: "Shareholder",
  ubo: "UBO",
  contact: "Contact",
};

const ROLE_ORDER: PersonRole[] = ["director", "shareholder", "ubo", "contact"];

const NATIONALITIES = [
  "Mauritian", "British", "French", "American", "South African", "Indian",
  "Chinese", "Australian", "Canadian", "German", "Other",
];

// 11 required KYC fields for progress tracking
const KYC_REQUIRED_FIELDS: (keyof PersonKyc)[] = [
  "full_name", "email", "date_of_birth", "nationality",
  "passport_number", "passport_expiry", "address", "occupation",
  "source_of_funds_description", "is_pep", "legal_issues_declared",
];
const KYC_TOTAL = KYC_REQUIRED_FIELDS.length;
const DOCS_TOTAL = 6; // per-person identity document types

function kycFilled(kyc: PersonKyc | null): number {
  if (!kyc) return 0;
  return KYC_REQUIRED_FIELDS.filter((f) => {
    const v = kyc[f];
    return v !== null && v !== undefined && v !== "";
  }).length;
}

/** Thin dual progress bars shown on each person card header */
function PersonProgress({ kyc, docCount }: { kyc: PersonKyc | null; docCount: number }) {
  const kycCount = kycFilled(kyc);
  const kycPct = Math.round((kycCount / KYC_TOTAL) * 100);
  const docPct = Math.round((Math.min(docCount, DOCS_TOTAL) / DOCS_TOTAL) * 100);

  return (
    <div className="space-y-1 min-w-[120px]">
      {/* KYC bar */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
          <span>KYC</span>
          <span>{kycCount}/{KYC_TOTAL}</span>
        </div>
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-success transition-all"
            style={{ width: `${kycPct}%` }}
          />
        </div>
      </div>
      {/* Docs bar */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
          <span>Docs</span>
          <span>{docCount}/{DOCS_TOTAL}</span>
        </div>
        <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-success transition-all"
            style={{ width: `${docPct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function PersonCard({
  person,
  applicationId,
  clientId,
  dueDiligenceLevel,
  requirements,
  documentTypes,
  onDelete,
  onUpdate,
}: {
  person: Person;
  applicationId: string;
  clientId?: string;
  dueDiligenceLevel: DueDiligenceLevel;
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  onDelete: (id: string) => void;
  onUpdate: (id: string, updated: Partial<Person>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Partial<PersonKyc>>(person.kyc_records ?? {});
  const [shareholding, setShareholding] = useState<string>(
    person.shareholding_percentage !== null ? String(person.shareholding_percentage) : ""
  );
  const [personDocuments, setPersonDocuments] = useState<DocumentRecord[] | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const fetchPersonDocuments = useCallback(async (kycRecordId: string) => {
    if (personDocuments !== null) return;
    if (!clientId) { setPersonDocuments([]); return; }
    setLoadingDocs(true);
    try {
      const res = await fetch(`/api/documents/library?clientId=${clientId}&kycRecordId=${kycRecordId}`);
      const data = await res.json() as { documents?: DocumentRecord[] };
      setPersonDocuments(data.documents ?? []);
    } catch {
      setPersonDocuments([]);
    } finally {
      setLoadingDocs(false);
    }
  }, [clientId, personDocuments]);

  const kyc = person.kyc_records;
  const displayName = kyc?.full_name || `New ${ROLE_LABELS[person.role]}`;
  const showWizard = kyc && !kyc.kyc_journey_completed;

  // Compute per-person compliance score (using doc_count as proxy before docs are fetched)
  const complianceScore = kyc && requirements.length > 0
    ? calculateComplianceScore(
        kyc as unknown as KycRecord,
        personDocuments ?? [],
        dueDiligenceLevel,
        requirements
      )
    : null;

  function handleToggle() {
    if (!open && kyc) {
      void fetchPersonDocuments(kyc.id);
    }
    setOpen(!open);
  }

  async function saveKyc() {
    if (!kyc) return;
    setSaving(true);
    try {
      const res = await fetch("/api/kyc/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kycRecordId: kyc.id, fields }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      // Optimistically update local kyc for progress recalculation
      onUpdate(person.id, { kyc_records: { ...kyc, ...fields } as PersonKyc });
      toast.success("Saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveShareholding(val: string) {
    const pct = parseFloat(val);
    if (isNaN(pct)) return;
    const res = await fetch(`/api/applications/${applicationId}/persons/${person.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareholdingPercentage: pct }),
    });
    if (res.ok) {
      onUpdate(person.id, { shareholding_percentage: pct });
    }
  }

  async function handleDelete() {
    if (!confirm(`Remove this ${ROLE_LABELS[person.role]}?`)) return;
    onDelete(person.id);
  }

  return (
    <div className="rounded-lg border bg-white overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-50"
        onClick={handleToggle}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {open ? (
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-brand-navy truncate">{displayName}</p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              {person.role === "shareholder" && person.shareholding_percentage !== null && (
                <span>{person.shareholding_percentage}% shareholding</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {complianceScore ? (
            <div className="text-right">
              <p className={`text-xs font-semibold ${complianceScore.overallPercentage === 100 ? "text-green-600" : "text-brand-navy"}`}>
                {complianceScore.overallPercentage}%
              </p>
              <p className="text-[10px] text-gray-400">compliance</p>
            </div>
          ) : (
            <PersonProgress kyc={person.kyc_records} docCount={person.doc_count} />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(); }}
            className="text-gray-300 hover:text-red-400 p-1"
            title="Remove"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Expanded: wizard for first-time, accordion for returning */}
      {open && kyc && showWizard && (
        <div className="border-t bg-gray-50">
          {loadingDocs ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">Loading…</div>
          ) : (
            <div className="px-4 py-4">
              <KycStepWizard
                clientId={clientId ?? ""}
                kycRecord={kyc as unknown as KycRecord}
                documents={personDocuments ?? []}
                documentTypes={documentTypes}
                dueDiligenceLevel={dueDiligenceLevel}
                requirements={requirements}
                onComplete={() => {
                  onUpdate(person.id, {
                    kyc_records: { ...kyc, kyc_journey_completed: true },
                  });
                  setOpen(false);
                }}
              />
            </div>
          )}
        </div>
      )}

      {open && kyc && !showWizard && (
        <div className="border-t px-4 py-4 space-y-4 bg-gray-50">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Full name</Label>
              <Input
                value={fields.full_name ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, full_name: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Date of birth</Label>
              <Input
                type="date"
                value={fields.date_of_birth ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, date_of_birth: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Nationality</Label>
              <Select
                value={fields.nationality ?? ""}
                onValueChange={(v) => setFields((p) => ({ ...p, nationality: v ?? "" }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {NATIONALITIES.map((n) => (
                    <SelectItem key={n} value={n}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Passport number</Label>
              <Input
                value={fields.passport_number ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, passport_number: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Passport expiry</Label>
              <Input
                type="date"
                value={fields.passport_expiry ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, passport_expiry: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Email</Label>
              <Input
                type="email"
                value={fields.email ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, email: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Occupation</Label>
              <Input
                value={fields.occupation ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, occupation: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Address</Label>
              <Input
                value={fields.address ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, address: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Source of funds description</Label>
              <Input
                value={fields.source_of_funds_description ?? ""}
                onChange={(e) => setFields((p) => ({ ...p, source_of_funds_description: e.target.value }))}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Politically exposed person (PEP)?</Label>
              <Select
                value={fields.is_pep === true ? "yes" : fields.is_pep === false ? "no" : ""}
                onValueChange={(v) => setFields((p) => ({ ...p, is_pep: v === "yes" }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Legal issues declared?</Label>
              <Select
                value={fields.legal_issues_declared === true ? "yes" : fields.legal_issues_declared === false ? "no" : ""}
                onValueChange={(v) => setFields((p) => ({ ...p, legal_issues_declared: v === "yes" }))}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Yes</SelectItem>
                  <SelectItem value="no">No</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {person.role === "shareholder" && (
              <div className="space-y-1">
                <Label className="text-xs">Shareholding %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={shareholding}
                  onChange={(e) => setShareholding(e.target.value)}
                  onBlur={() => saveShareholding(shareholding)}
                  className="h-8 text-sm"
                />
              </div>
            )}
          </div>
          <Button
            size="sm"
            className="bg-brand-navy hover:bg-brand-blue"
            onClick={saveKyc}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      )}
    </div>
  );
}

export function PersonsManager({
  applicationId,
  clientId: propClientId,
  dueDiligenceLevel = "cdd",
  requirements = [],
  documentTypes = [],
}: PersonsManagerProps) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectorRole, setSelectorRole] = useState<PersonRole | null>(null);
  const [resolvedClientId, setResolvedClientId] = useState<string | null>(propClientId || null);

  // Resolve clientId: use prop if available, otherwise fetch from application
  useEffect(() => {
    if (propClientId && propClientId.length > 0) {
      setResolvedClientId(propClientId);
    } else {
      // Fetch application to get client_id
      fetch(`/api/applications/${applicationId}`)
        .then((r) => r.json())
        .then(({ application }) => {
          if (application?.client_id) {
            setResolvedClientId(application.client_id);
          }
        })
        .catch(() => {});
    }
  }, [propClientId, applicationId]);

  useEffect(() => {
    fetch(`/api/applications/${applicationId}/persons`)
      .then((r) => r.json())
      .then(({ persons: data }) => {
        setPersons((data ?? []) as Person[]);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  async function addPerson(role: PersonRole, existingKycRecordId?: string, newName?: string) {
    setAdding(true);
    setSelectorRole(null);
    try {
      const body: Record<string, unknown> = { role };
      if (existingKycRecordId) {
        body.existingKycRecordId = existingKycRecordId;
      } else if (newName) {
        body.kycFields = { full_name: newName };
      }
      const res = await fetch(`/api/applications/${applicationId}/persons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { person?: Person; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to add person");
      setPersons((prev) => [...prev, data.person!]);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add person");
    } finally {
      setAdding(false);
    }
  }

  function handleDelete(personId: string): void {
    fetch(`/api/applications/${applicationId}/persons/${personId}`, { method: "DELETE" })
      .then((r) => r.json())
      .then((data: { success?: boolean; error?: string }) => {
        if (data.success) {
          setPersons((prev) => prev.filter((p) => p.id !== personId));
          toast.success("Person removed");
        } else {
          toast.error(data.error ?? "Failed to remove");
        }
      });
  }

  function handleUpdate(personId: string, updated: Partial<Person>) {
    setPersons((prev) =>
      prev.map((p) => (p.id === personId ? { ...p, ...updated } : p))
    );
  }

  // Running shareholding total
  const totalShareholding = persons
    .filter((p) => p.role === "shareholder")
    .reduce((sum, p) => sum + (p.shareholding_percentage ?? 0), 0);
  const hasShareholders = persons.some((p) => p.role === "shareholder");

  if (loading) return <p className="text-sm text-gray-400">Loading…</p>;

  // Group persons by role
  const grouped = ROLE_ORDER.reduce<Record<PersonRole, Person[]>>(
    (acc, role) => {
      acc[role] = persons.filter((p) => p.role === role);
      return acc;
    },
    { director: [], shareholder: [], ubo: [], contact: [] }
  );

  const roleGroups = ROLE_ORDER.filter((role) => grouped[role].length > 0 || role !== "contact");

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {(["director", "shareholder", "ubo"] as PersonRole[]).map((role) => (
          <Button
            key={role}
            variant="outline"
            size="sm"
            onClick={() => {
              if (resolvedClientId && resolvedClientId.length > 0) {
                setSelectorRole(role);
              } else {
                void addPerson(role);
              }
            }}
            disabled={adding}
            className="gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add {ROLE_LABELS[role]}
          </Button>
        ))}
      </div>

      {selectorRole !== null && resolvedClientId && resolvedClientId.length > 0 && (
        <ProfileSelector
          clientId={resolvedClientId}
          role={selectorRole as "director" | "shareholder" | "ubo"}
          existingPersonKycIds={persons
            .filter((p) => p.role === selectorRole)
            .map((p) => p.kyc_record_id)
            .filter(Boolean) as string[]}
          onSelect={(kycRecordId, newName) => void addPerson(selectorRole, kycRecordId ?? undefined, newName)}
          onClose={() => setSelectorRole(null)}
        />
      )}

      {/* Shareholding progress */}
      {hasShareholders && (
        <div className="text-xs text-gray-600 bg-gray-50 rounded px-3 py-2">
          <span className="font-medium">{totalShareholding}%</span> allocated
          {totalShareholding < 100 && (
            <span className="text-amber-600 ml-1">— {100 - totalShareholding}% remaining</span>
          )}
          {totalShareholding > 100 && (
            <span className="text-red-500 ml-1">— exceeds 100%</span>
          )}
        </div>
      )}

      {/* Persons grouped by role */}
      {persons.length === 0 ? (
        <div className="space-y-3">
          <div className="flex items-center justify-center rounded-lg border border-dashed p-6">
            <Users className="h-8 w-8 text-gray-200" />
          </div>
          <p className="text-xs text-gray-400 text-center">
            Add at least one director, shareholder, or UBO.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {roleGroups.map((role) => {
            const group = grouped[role];
            if (group.length === 0) return null;
            return (
              <div key={role} className="space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  {ROLE_LABELS[role]}s ({group.length})
                </p>
                {group.map((p) => (
                  <PersonCard
                    key={p.id}
                    person={p}
                    applicationId={applicationId}
                    clientId={resolvedClientId ?? undefined}
                    dueDiligenceLevel={dueDiligenceLevel}
                    requirements={requirements}
                    documentTypes={documentTypes}
                    onDelete={handleDelete}
                    onUpdate={handleUpdate}
                  />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
