"use client";

import { useState, useEffect } from "react";
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
  completion_status: string;
}

interface Person {
  id: string;
  role: PersonRole;
  shareholding_percentage: number | null;
  created_at: string;
  kyc_records: PersonKyc | null;
}

interface PersonsManagerProps {
  applicationId: string;
  clientId?: string;
}

const ROLE_LABELS: Record<PersonRole, string> = {
  director: "Director",
  shareholder: "Shareholder",
  ubo: "UBO",
  contact: "Contact",
};

const NATIONALITIES = [
  "Mauritian", "British", "French", "American", "South African", "Indian",
  "Chinese", "Australian", "Canadian", "German", "Other",
];

function PersonCard({
  person,
  applicationId,
  onDelete,
  onUpdate,
}: {
  person: Person;
  applicationId: string;
  onDelete: (id: string) => void;
  onUpdate: (id: string, updated: Partial<Person>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fields, setFields] = useState<Partial<PersonKyc>>(person.kyc_records ?? {});
  const [shareholding, setShareholding] = useState<string>(
    person.shareholding_percentage !== null ? String(person.shareholding_percentage) : ""
  );

  const kyc = person.kyc_records;
  const displayName = kyc?.full_name || `New ${ROLE_LABELS[person.role]}`;

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
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown className="h-4 w-4 text-gray-400 shrink-0" />
          ) : (
            <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
          )}
          <div>
            <p className="text-sm font-medium text-brand-navy">{displayName}</p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span className="capitalize px-1.5 py-0.5 rounded bg-gray-100">
                {ROLE_LABELS[person.role]}
              </span>
              {person.role === "shareholder" && person.shareholding_percentage !== null && (
                <span>{person.shareholding_percentage}% shareholding</span>
              )}
              {kyc?.completion_status === "complete" && (
                <span className="text-green-600">KYC complete</span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete(); }}
          className="text-gray-300 hover:text-red-400 p-1"
          title="Remove"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Expanded KYC fields */}
      {open && kyc && (
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

export function PersonsManager({ applicationId }: PersonsManagerProps) {
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch(`/api/applications/${applicationId}/persons`)
      .then((r) => r.json())
      .then(({ persons: data }) => {
        setPersons((data ?? []) as Person[]);
        setLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applicationId]);

  async function addPerson(role: PersonRole) {
    setAdding(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/persons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
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

  return (
    <div className="space-y-4">
      {/* Action buttons */}
      <div className="flex flex-wrap gap-2">
        {(["director", "shareholder", "ubo"] as PersonRole[]).map((role) => (
          <Button
            key={role}
            variant="outline"
            size="sm"
            onClick={() => addPerson(role)}
            disabled={adding}
            className="gap-1.5"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add {ROLE_LABELS[role]}
          </Button>
        ))}
      </div>

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

      {/* Person cards */}
      {persons.length === 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-6 text-center">
          <Users className="h-8 w-8 text-gray-200 mx-auto" />
        </div>
      ) : (
        <div className="space-y-2">
          {persons.map((p) => (
            <PersonCard
              key={p.id}
              person={p}
              applicationId={applicationId}
              onDelete={handleDelete}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}

      {persons.length === 0 && (
        <p className="text-xs text-gray-400 text-center">
          Add at least one director, shareholder, or UBO.
        </p>
      )}
    </div>
  );
}
