"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { UserPlus, User, Building2, Mail, Send, ChevronDown, ChevronRight, Search, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PerPersonReviewWizard } from "@/components/client/PerPersonReviewWizard";
import { ReviewStep } from "@/components/kyc/steps/ReviewStep";
import { computePersonCompletion } from "@/lib/utils/personCompletion";
import type {
  DocumentType,
  DocumentRecord,
  DueDiligenceLevel,
  DueDiligenceRequirement,
  KycRecord,
  VerificationResult,
  VerificationStatus,
} from "@/types";
import type { ServicePerson, ClientServiceDoc } from "@/app/(client)/services/[id]/page";

// ─── Types ───────────────────────────────────────────────────────────────────

type ServicePersonRole = "director" | "shareholder" | "ubo";

const ROLE_LABELS: Record<ServicePersonRole, string> = {
  director: "Director",
  shareholder: "Shareholder",
  ubo: "UBO",
};

const ROLE_COLORS: Record<ServicePersonRole, string> = {
  director: "bg-blue-100 text-blue-700",
  shareholder: "bg-purple-100 text-purple-700",
  ubo: "bg-amber-100 text-amber-700",
};

const ROLE_LIST: ServicePersonRole[] = ["director", "shareholder", "ubo"];

// ─── AddPersonModal ───────────────────────────────────────────────────────────

interface AvailableProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  record_type: "individual" | "organisation";
  roles: { service_id: string; role: string; shareholding_percentage: number | null }[];
}

const ROLE_CHIP_TONE: Record<string, string> = {
  director: "bg-blue-50 text-blue-700 border-blue-200",
  shareholder: "bg-purple-50 text-purple-700 border-purple-200",
  ubo: "bg-amber-50 text-amber-800 border-amber-200",
  primary_client: "bg-gray-100 text-gray-700 border-gray-200",
  contact: "bg-gray-100 text-gray-700 border-gray-200",
};

/** Aggregate distinct role chips (e.g. "Director", "Shareholder 50%") across services. */
function aggregateRoleChips(
  roles: AvailableProfile["roles"]
): { key: string; role: string; label: string }[] {
  const seen = new Map<string, { role: string; label: string }>();
  for (const r of roles) {
    const baseLabel = ROLE_LABELS[r.role as ServicePersonRole] ?? r.role;
    const label = r.role === "shareholder" && r.shareholding_percentage != null
      ? `${baseLabel} ${r.shareholding_percentage}%`
      : baseLabel;
    const key = `${r.role}::${r.shareholding_percentage ?? ""}`;
    if (!seen.has(key)) seen.set(key, { role: r.role, label });
  }
  return Array.from(seen.entries()).map(([key, v]) => ({ key, role: v.role, label: v.label }));
}

function AddPersonModal({
  serviceId,
  role,
  currentPersons,
  onClose,
  onAdded,
}: {
  serviceId: string;
  role: ServicePersonRole;
  currentPersons: ServicePerson[];
  onClose: () => void;
  onAdded: (person: ServicePerson) => void;
}) {
  const roleTitle = ROLE_LABELS[role];
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [profiles, setProfiles] = useState<AvailableProfile[] | null>(null);
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // New-person form
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [recordType, setRecordType] = useState<"individual" | "organisation">("individual");

  useEffect(() => {
    fetch(`/api/services/${serviceId}/available-profiles`)
      .then((r) => r.json() as Promise<AvailableProfile[]>)
      .then((data) => setProfiles(data))
      .catch(() => setProfiles([]));
  }, [serviceId]);

  // Profiles already linked to THIS service for THIS role — used to disable rows + show inline message.
  const sameRoleOnThisServiceByProfile = useMemo(() => {
    const set = new Set<string>();
    for (const p of currentPersons) {
      if (p.client_profiles?.id && p.role === role) set.add(p.client_profiles.id);
    }
    return set;
  }, [currentPersons, role]);

  const visibleProfiles = useMemo(() => {
    const all = profiles ?? [];
    const filtered = role === "ubo"
      ? all.filter((p) => p.record_type === "individual")
      : all;
    if (!search) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(
      (p) =>
        (p.full_name?.toLowerCase().includes(q) ?? false) ||
        (p.email?.toLowerCase().includes(q) ?? false)
    );
  }, [profiles, role, search]);

  async function attachExisting(p: AvailableProfile) {
    if (sameRoleOnThisServiceByProfile.has(p.id)) {
      toast.error(`${p.full_name ?? "This profile"} is already a ${roleTitle} on this application.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/persons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, client_profile_id: p.id }),
      });
      const data = (await res.json()) as { id?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Failed to add");

      onAdded({
        id: data.id,
        role,
        shareholding_percentage: null,
        can_manage: false,
        invite_sent_at: null,
        invite_sent_by_name: null,
        client_profiles: {
          id: p.id,
          full_name: p.full_name ?? "",
          email: p.email,
          phone: p.phone,
          due_diligence_level: "cdd",
          record_type: p.record_type,
          client_profile_kyc: null,
        },
      });
      toast.success(`${roleTitle} added`);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add person");
      setSubmitting(false);
    }
  }

  async function createNew() {
    if (!newName.trim()) { toast.error("Full name is required"); return; }

    const finalRecordType = role === "ubo" ? "individual" : recordType;

    setSubmitting(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/persons`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role,
          full_name: newName.trim(),
          email: newEmail.trim() || undefined,
          phone: newPhone.trim() || undefined,
          record_type: finalRecordType,
        }),
      });
      const data = (await res.json()) as { id?: string; profileId?: string; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? "Failed to add");

      onAdded({
        id: data.id,
        role,
        shareholding_percentage: null,
        can_manage: false,
        invite_sent_at: null,
        invite_sent_by_name: null,
        client_profiles: {
          id: data.profileId ?? "",
          full_name: newName.trim(),
          email: newEmail.trim() || null,
          phone: newPhone.trim() || null,
          due_diligence_level: "cdd",
          record_type: finalRecordType,
          client_profile_kyc: null,
        },
      });
      toast.success(`${roleTitle} added`);
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add person");
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md z-[100] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Add {roleTitle}</DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex border-b -mt-1">
          <button
            type="button"
            onClick={() => setTab("existing")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "existing"
                ? "border-brand-navy text-brand-navy"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Select existing person
          </button>
          <button
            type="button"
            onClick={() => setTab("new")}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === "new"
                ? "border-brand-navy text-brand-navy"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Add new person
          </button>
        </div>

        {tab === "existing" ? (
          <div className="space-y-2 pt-1">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                className="text-sm pl-8"
              />
            </div>

            {profiles === null ? (
              <p className="text-sm text-gray-400 text-center py-4">Loading…</p>
            ) : visibleProfiles.length === 0 ? (
              <div className="text-center py-6 space-y-1">
                <p className="text-sm text-gray-500">
                  {role === "ubo"
                    ? "No existing individual profiles to attach."
                    : search
                      ? `No profiles match "${search}".`
                      : "No existing profiles to attach."}
                </p>
                <p className="text-xs text-gray-400">
                  Switch to <span className="font-medium">Add new person</span> to create one.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[20rem] overflow-y-auto pr-1">
                {visibleProfiles.map((p) => {
                  const chips = aggregateRoleChips(p.roles);
                  const isAlready = sameRoleOnThisServiceByProfile.has(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => !isAlready && !submitting && void attachExisting(p)}
                      disabled={isAlready || submitting}
                      className={`w-full text-left rounded-lg border px-3 py-2.5 transition-colors ${
                        isAlready
                          ? "border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed"
                          : "border-gray-200 hover:border-brand-navy"
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {p.record_type === "organisation" ? (
                          <Building2 className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                        ) : (
                          <User className="h-4 w-4 text-gray-400 shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-medium text-brand-navy truncate">
                              {p.full_name ?? "Unnamed"}
                            </p>
                            <span className="text-[10px] uppercase tracking-wide text-gray-400 shrink-0">
                              {p.record_type === "organisation" ? "Company" : "Individual"}
                            </span>
                          </div>
                          {p.email && <p className="text-xs text-gray-400 truncate">{p.email}</p>}
                          {chips.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {chips.map((c) => (
                                <span
                                  key={c.key}
                                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                                    ROLE_CHIP_TONE[c.role] ?? "bg-gray-100 text-gray-600 border-gray-200"
                                  }`}
                                >
                                  {c.label}
                                </span>
                              ))}
                            </div>
                          )}
                          {isAlready && (
                            <p className="text-[11px] text-amber-700 mt-1.5">
                              {p.full_name ?? "This profile"} is already a {roleTitle} on this application.
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3 pt-1">
            {role !== "ubo" && (
              <div className="space-y-1.5">
                <Label className="text-sm">Type</Label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setRecordType("individual")}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      recordType === "individual"
                        ? "border-brand-navy bg-brand-navy/5 text-brand-navy font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Individual
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecordType("organisation")}
                    className={`flex-1 px-3 py-2 text-sm rounded-lg border transition-colors ${
                      recordType === "organisation"
                        ? "border-brand-navy bg-brand-navy/5 text-brand-navy font-medium"
                        : "border-gray-200 text-gray-600 hover:border-gray-300"
                    }`}
                  >
                    Company
                  </button>
                </div>
              </div>
            )}

            {/* B-047 §1.1 / §8 — top-aligned labels with red required *,
                semantic input types + autocomplete attributes. */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-900">
                Full name <span className="text-red-600" aria-hidden="true">*</span>
              </Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={
                  role === "ubo" || recordType === "individual"
                    ? "As it appears on passport"
                    : "Registered company name"
                }
                aria-required="true"
                autoComplete={recordType === "organisation" ? "organization" : "name"}
                className="text-sm h-11"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-900">Email</Label>
              <Input
                type="email"
                inputMode="email"
                autoComplete="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="email@example.com"
                className="text-sm h-11"
              />
              <p className="text-xs text-gray-600">Optional. Required only if you want to invite this person to complete their KYC themselves.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-900">Phone</Label>
              <Input
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+230 555 0000"
                className="text-sm h-11"
              />
            </div>
          </div>
        )}

        {/* B-047 §4 — Cancel = tertiary text link, Add = primary brand-navy 44pt. */}
        <div className="flex gap-2 justify-end pt-2 border-t">
          <Button
            onClick={onClose}
            disabled={submitting}
            className="h-11 px-3 bg-transparent border-0 text-gray-600 font-medium hover:text-gray-900 hover:bg-transparent"
          >
            Cancel
          </Button>
          {tab === "new" && (
            <Button
              onClick={() => void createNew()}
              disabled={submitting || !newName.trim()}
              className="h-11 px-5 bg-brand-navy text-white font-semibold hover:bg-brand-navy/90 gap-1"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding…
                </>
              ) : (
                `Add ${roleTitle}`
              )}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── OwnershipStructure ───────────────────────────────────────────────────────

function OwnershipStructure({
  shareholders,
  serviceId,
  onSaved,
}: {
  shareholders: ServicePerson[];
  serviceId: string;
  onSaved: (roleId: string, pct: number) => void;
}) {
  const [localPcts, setLocalPcts] = useState<Record<string, string>>(() =>
    Object.fromEntries(shareholders.map((s) => [s.id, String(s.shareholding_percentage ?? 0)]))
  );
  const [saving, setSaving] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Sync when new shareholders are added
  useEffect(() => {
    setLocalPcts((prev) => {
      const next = { ...prev };
      for (const s of shareholders) {
        if (!(s.id in next)) next[s.id] = String(s.shareholding_percentage ?? 0);
      }
      return next;
    });
  }, [shareholders]);

  const total = shareholders.reduce((sum, s) => sum + (parseFloat(localPcts[s.id] ?? "0") || 0), 0);
  const unallocated = Math.max(0, 100 - total);
  const isValid = Math.abs(total - 100) < 0.5;

  if (shareholders.length === 0) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all(
        shareholders.map(async (s) => {
          const pct = parseFloat(localPcts[s.id] ?? "0") || 0;
          const res = await fetch(`/api/services/${serviceId}/persons/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shareholding_percentage: pct }),
          });
          if (!res.ok) throw new Error("Save failed");
          onSaved(s.id, pct);
        })
      );
      toast.success("Shareholding updated", { position: "top-right" });
    } catch {
      toast.error("Failed to save shareholding", { position: "top-right" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-xl overflow-hidden bg-white">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          <span className="text-sm font-medium text-brand-navy">Ownership Structure</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-medium ${isValid ? "text-green-600" : "text-amber-600"}`}>
            {total.toFixed(0)}% / 100%
          </span>
          {!isValid && (
            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              ⚠ Must total 100%
            </span>
          )}
        </div>
      </button>

      {!collapsed && (
        <div className="px-4 pb-4 space-y-3 border-t">
          <div className="space-y-2 pt-3">
            {shareholders.map((s) => {
              const pct = parseFloat(localPcts[s.id] ?? "0") || 0;
              return (
                <div key={s.id} className="flex items-center gap-3">
                  <p className="text-sm text-gray-700 w-32 truncate shrink-0">
                    {s.client_profiles?.full_name ?? "Unknown"}
                  </p>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-brand-navy rounded-full transition-all"
                      style={{ width: `${Math.min(pct, 100)}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      value={localPcts[s.id] ?? "0"}
                      onChange={(e) =>
                        setLocalPcts((prev) => ({ ...prev, [s.id]: e.target.value }))
                      }
                      className="h-7 w-16 text-xs text-center px-1"
                    />
                    <span className="text-xs text-gray-400">%</span>
                  </div>
                </div>
              );
            })}

            {unallocated > 0.5 && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-gray-400 w-32 shrink-0">(Unallocated)</p>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-300 rounded-full"
                    style={{ width: `${Math.min(unallocated, 100)}%` }}
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-gray-400 w-16 text-center tabular-nums">
                    {unallocated.toFixed(0)}
                  </span>
                  <span className="text-xs text-gray-400">%</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-1">
            <p className="text-xs text-gray-500">Total: {total.toFixed(0)}% / 100%</p>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className="h-7 px-3 text-xs bg-brand-navy hover:bg-brand-blue"
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── InviteDialog ─────────────────────────────────────────────────────────────

function InviteDialog({
  person,
  serviceId,
  combinedRoleLabels,
  onClose,
  onSent,
}: {
  person: ServicePerson;
  serviceId: string;
  combinedRoleLabels: string;
  onClose: () => void;
  onSent: (sentAt: string) => void;
}) {
  const [email, setEmail] = useState(person.client_profiles?.email ?? "");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!email.trim()) {
      toast.error("Email is required", { position: "top-right" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(`/api/services/${serviceId}/persons/${person.id}/send-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), note: note.trim() || undefined }),
      });
      const data = (await res.json()) as { ok?: boolean; invite_sent_at?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      onSent(data.invite_sent_at ?? new Date().toISOString());
      toast.success("Email Sent", { position: "top-right" });
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send", { position: "top-right" });
    } finally {
      setSending(false);
    }
  }

  const personName = person.client_profiles?.full_name ?? "this person";

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm z-[100]">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Request KYC from {personName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <p className="text-xs text-gray-500">
            An email will be sent asking {personName} ({combinedRoleLabels}) to complete their KYC information.
          </p>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-900">Email address <span className="text-red-600" aria-hidden="true">*</span></Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="person@email.com"
              className="text-sm"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">Additional note <span className="text-gray-400 font-normal">(optional)</span></Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a personal message..."
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose} disabled={sending}>Cancel</Button>
            <Button
              onClick={handleSend}
              disabled={sending || !email.trim()}
              className="bg-brand-navy hover:bg-brand-blue gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {sending ? "Sending…" : "Send Request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── PersonCard ───────────────────────────────────────────────────────────────

function PersonCard({
  person,
  serviceId,
  kycPct,
  isComplete,
  onReviewKyc,
  onViewSummary,
  allRoleRows,
}: {
  person: ServicePerson;
  serviceId: string;
  kycPct: number;
  isComplete: boolean;
  onReviewKyc: () => void;
  onViewSummary: () => void;
  allRoleRows: ServicePerson[];
  // B-046 batch 4 — these props remain on the parent's call signature but the
  // bottom Roles section was removed from the card, so they're no longer used here.
  // Toggling roles now happens in the Review KYC top row.
  onRoleRemoved: (roleId: string) => void;
  onRoleAdded: (person: ServicePerson) => void;
}) {
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteSentAt, setInviteSentAt] = useState<string | null>(person.invite_sent_at);
  const inviteSentByName = person.invite_sent_by_name ?? null;

  const currentRoles = allRoleRows.map((r) => r.role as ServicePersonRole);
  const combinedRoleLabels = currentRoles.map((r) => ROLE_LABELS[r] ?? r).join(", ");

  const kycColor =
    kycPct === 100 ? "text-green-600" : kycPct > 0 ? "text-amber-600" : "text-red-500";
  const kycBarColor =
    kycPct === 100 ? "bg-green-500" : kycPct > 0 ? "bg-amber-500" : "bg-red-400";

  const sentDate = inviteSentAt
    ? new Date(inviteSentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
    : null;

  return (
    <div className="border rounded-xl bg-white px-4 py-3.5 space-y-3">
      {/* Header row — avatar, name, role chips, email */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
          <User className="h-4 w-4 text-gray-500" />
          {isComplete && (
            <CheckCircle2
              className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 text-green-500 bg-white rounded-full"
              aria-label="KYC complete"
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-brand-navy leading-tight">
              {person.client_profiles?.full_name ?? "Unknown"}
            </p>
            {currentRoles.map((r) => (
              <span key={r} className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${ROLE_COLORS[r] ?? "bg-gray-100 text-gray-600"}`}>
                {ROLE_LABELS[r] ?? r}
              </span>
            ))}
          </div>
          {person.client_profiles?.email && (
            <p className="text-xs text-gray-400">{person.client_profiles.email}</p>
          )}
        </div>
      </div>

      {/* KYC status bar */}
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${kycBarColor}`}
            style={{ width: `${kycPct}%` }}
          />
        </div>
        <span className={`text-[11px] font-medium tabular-nums ${kycColor}`}>
          KYC: {kycPct}%
        </span>
      </div>

      {/* Action row: Review KYC + View Summary + Request/Resend invite. B-050 §6.3 */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button
          size="sm"
          variant="outline"
          onClick={onReviewKyc}
          className="h-7 px-3 text-xs gap-1.5"
        >
          Review KYC
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={onViewSummary}
          title="See everything you've entered so far."
          className="h-7 px-3 text-xs gap-1.5 text-gray-700 hover:text-brand-navy hover:bg-gray-50"
        >
          View Summary
        </Button>

        {inviteSentAt ? (
          <span className="text-[11px] text-green-600 flex items-center gap-1">
            <Mail className="h-3 w-3" />
            Last request sent on {sentDate}{inviteSentByName ? ` by ${inviteSentByName}` : ""}
          </span>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowInviteDialog(true)}
            className="h-7 px-3 text-xs gap-1.5 text-gray-500 hover:text-brand-navy"
          >
            <Mail className="h-3 w-3" />
            Request KYC
          </Button>
        )}
      </div>

      {showInviteDialog && (
        <InviteDialog
          person={person}
          serviceId={serviceId}
          combinedRoleLabels={combinedRoleLabels}
          onClose={() => setShowInviteDialog(false)}
          onSent={(sentAt) => setInviteSentAt(sentAt)}
        />
      )}
    </div>
  );
}


interface Props {
  serviceId: string;
  persons: ServicePerson[];
  documents: ClientServiceDoc[];
  onPersonsChange: (persons: ServicePerson[]) => void;
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  onNavVisibilityChange: (hide: boolean) => void;
}

export function ServiceWizardPeopleStep({
  serviceId,
  persons: initialPersons,
  documents,
  onPersonsChange,
  requirements,
  documentTypes,
  onNavVisibilityChange,
}: Props) {
  const [persons, setPersons] = useState<ServicePerson[]>(initialPersons);
  const [addingRole, setAddingRole] = useState<ServicePersonRole | null>(null);
  const [reviewingRoleId, setReviewingRoleId] = useState<string | null>(null);
  // Track which persons have completed KYC in this session (to show 100% locally)
  const [kycCompletedIds, setKycCompletedIds] = useState<Set<string>>(new Set());
  // B-046 batch 3 — Review-all walk-through state. `reviewAllOrder` is one
  // role-row id per unique profile (deduped, mirrors the card list); when
  // null, the wizard runs in single-person mode.
  const [reviewAllOrder, setReviewAllOrder] = useState<string[] | null>(null);
  const [reviewAllIndex, setReviewAllIndex] = useState(0);

  // B-050 §6.3 — View Summary opens a read-only ReviewStep dialog for the selected person.
  const [viewingSummaryRoleId, setViewingSummaryRoleId] = useState<string | null>(null);

  function handleExitKycReview() {
    setReviewingRoleId(null);
    setReviewAllOrder(null);
    setReviewAllIndex(0);
  }

  /**
   * Build an ordered list of role-row IDs (one per unique profile, in card order)
   * and start the walk on the first person.
   */
  function startReviewAll() {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const p of persons) {
      const profileId = p.client_profiles?.id ?? p.id;
      if (!seen.has(profileId)) {
        seen.add(profileId);
        order.push(p.id);
      }
    }
    if (order.length === 0) return;
    setReviewAllOrder(order);
    setReviewAllIndex(0);
    setReviewingRoleId(order[0]);
  }

  // Hide/show outer wizard nav when entering/leaving KYC review
  useEffect(() => {
    onNavVisibilityChange(reviewingRoleId !== null);
  }, [reviewingRoleId, onNavVisibilityChange]);

  const handleAdded = useCallback(
    (person: ServicePerson) => {
      const next = [...persons, person];
      setPersons(next);
      onPersonsChange(next);
      // Auto-open Review KYC for the freshly added person.
      setReviewingRoleId(person.id);
    },
    [persons, onPersonsChange]
  );

  const handleRoleRemoved = useCallback(
    (roleId: string) => {
      const next = persons.filter((p) => p.id !== roleId);
      setPersons(next);
      onPersonsChange(next);
    },
    [persons, onPersonsChange]
  );

  const handleRoleAdded = useCallback(
    (person: ServicePerson) => {
      const next = [...persons, person];
      setPersons(next);
      onPersonsChange(next);
    },
    [persons, onPersonsChange]
  );

  // reviewingRoleId is any role ID for the profile being reviewed
  const reviewingPerson = reviewingRoleId
    ? persons.find((p) => p.id === reviewingRoleId) ?? null
    : null;

  // ─── KYC Review view ──────────────────────────────────────────────────────
  if (reviewingPerson) {
    const ddLevel = (reviewingPerson.client_profiles?.due_diligence_level as DueDiligenceLevel) ?? "cdd";
    const profileId = reviewingPerson.client_profiles?.id ?? "";
    // All role rows for this profile
    const profileRoleRows = persons.filter((p) => p.client_profiles?.id === profileId);

    const handleKycComplete = () => {
      setKycCompletedIds((prev) => {
        const next = new Set(prev);
        next.add(reviewingPerson.id);
        return next;
      });
      // Exit single-person review AND end any in-progress review-all walk.
      setReviewingRoleId(null);
      setReviewAllOrder(null);
      setReviewAllIndex(0);
    };

    // B-046 batch 3 — review-all walk context (only when reviewAllOrder is set).
    const reviewAllContext = reviewAllOrder
      ? {
          current: reviewAllIndex,
          total: reviewAllOrder.length,
          personName: reviewingPerson.client_profiles?.full_name ?? null,
          // B-050 §5.2 — pre-compute chip data for every person in the walk.
          chips: reviewAllOrder.map((roleId) => {
            const p = persons.find((pp) => pp.id === roleId);
            const profileId = p?.client_profiles?.id ?? roleId;
            const personDocs = documents.filter((d) => d.client_profile_id === profileId);
            const personDdLevel =
              (p?.client_profiles?.due_diligence_level as DueDiligenceLevel | null) ?? ddLevel;
            const completion = computePersonCompletion({
              kyc: p?.client_profiles?.client_profile_kyc ?? null,
              recordType: (p?.client_profiles?.record_type as "individual" | "organisation" | null) ?? "individual",
              personDocs: personDocs.map((d) => ({
                document_type_id: d.document_type_id ?? null,
                is_active: true,
              })),
              documentTypes,
              requirements,
              dueDiligenceLevel: personDdLevel,
            });
            const markedComplete = kycCompletedIds.has(roleId);
            const completionPct = markedComplete ? 100 : completion.percentage;
            return {
              id: roleId,
              name: p?.client_profiles?.full_name ?? "Unknown",
              completionPct,
              isComplete: completionPct === 100,
            };
          }),
          onJumpToPerson: (idx: number) => {
            if (!reviewAllOrder[idx]) return;
            setReviewAllIndex(idx);
            setReviewingRoleId(reviewAllOrder[idx]);
          },
          onAdvance: () => {
            const nextIndex = reviewAllIndex + 1;
            if (nextIndex >= reviewAllOrder.length) {
              // Defensive — final-step button only fires onAdvance when there's a next.
              setReviewAllOrder(null);
              setReviewAllIndex(0);
              setReviewingRoleId(null);
              return;
            }
            // Mark this person's KYC as completed locally so the card shows 100%.
            setKycCompletedIds((prev) => {
              const next = new Set(prev);
              next.add(reviewingPerson.id);
              return next;
            });
            setReviewAllIndex(nextIndex);
            setReviewingRoleId(reviewAllOrder[nextIndex]);
          },
        }
      : undefined;

    return (
      <PerPersonReviewWizard
        key={reviewingPerson.id}
        serviceId={serviceId}
        reviewingPerson={reviewingPerson}
        profileRoleRows={profileRoleRows}
        documents={documents}
        documentTypes={documentTypes}
        requirements={requirements}
        dueDiligenceLevel={ddLevel}
        onComplete={handleKycComplete}
        onExit={handleExitKycReview}
        onRoleRemoved={handleRoleRemoved}
        onRoleAdded={handleRoleAdded}
        reviewAllContext={reviewAllContext}
      />
    );
  }

  // ─── Roster view ─────────────────────────────────────────────────────────
  const hasDirector = persons.some((p) => p.role === "director");
  const shareholders = persons.filter((p) => p.role === "shareholder");

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-brand-navy mb-1">People & KYC</h2>
        <p className="text-sm text-gray-500">
          Add directors, shareholders, and UBOs. Click &quot;Review KYC&quot; to complete each person&apos;s compliance information.
        </p>
      </div>

      {/* Top toolbar — Add buttons left, Review-All on the right. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {ROLE_LIST.map((role) => (
            <Button
              key={role}
              size="sm"
              variant="outline"
              onClick={() => setAddingRole(role)}
              className="gap-1.5 border-dashed"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Add {ROLE_LABELS[role]}
            </Button>
          ))}
        </div>
        {persons.length > 0 && (
          <Button
            size="sm"
            onClick={startReviewAll}
            className="bg-brand-navy hover:bg-brand-blue gap-1.5"
          >
            Review all KYC
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Person cards — deduplicated by profile, combined roles */}
      {persons.length === 0 ? (
        <p className="text-sm text-gray-500 py-2">
          No people added yet. Use the buttons above to get started.
        </p>
      ) : (
        <div className="space-y-2.5">
          {(() => {
            // Group by profile ID to deduplicate — keep all role rows per profile
            const profileMap = new Map<string, { person: ServicePerson; roleRows: ServicePerson[] }>();
            for (const p of persons) {
              const profileId = p.client_profiles?.id ?? p.id;
              const existing = profileMap.get(profileId);
              if (existing) {
                existing.roleRows.push(p);
              } else {
                profileMap.set(profileId, { person: p, roleRows: [p] });
              }
            }
            return Array.from(profileMap.values()).map(({ person, roleRows }) => {
              const profileId = person.client_profiles?.id ?? person.id;
              const personDocs = documents.filter((d) => d.client_profile_id === profileId);
              const personDdLevel = (person.client_profiles?.due_diligence_level as DueDiligenceLevel | null) ?? "cdd";
              const completion = computePersonCompletion({
                kyc: person.client_profiles?.client_profile_kyc ?? null,
                recordType: (person.client_profiles?.record_type as "individual" | "organisation" | null) ?? "individual",
                personDocs: personDocs.map((d) => ({
                  document_type_id: d.document_type_id ?? null,
                  is_active: true,
                })),
                documentTypes,
                requirements,
                dueDiligenceLevel: personDdLevel,
              });
              const kycPct = roleRows.some((rr) => kycCompletedIds.has(rr.id))
                ? 100
                : completion.percentage;
              const isComplete = kycPct === 100;
              return (
                <PersonCard
                  key={person.client_profiles?.id ?? person.id}
                  person={person}
                  serviceId={serviceId}
                  kycPct={kycPct}
                  isComplete={isComplete}
                  onReviewKyc={() => setReviewingRoleId(person.id)}
                  onViewSummary={() => setViewingSummaryRoleId(person.id)}
                  allRoleRows={roleRows}
                  onRoleRemoved={handleRoleRemoved}
                  onRoleAdded={handleRoleAdded}
                />
              );
            });
          })()}
        </div>
      )}

      {/* Ownership Structure visual */}
      <OwnershipStructure
        shareholders={shareholders}
        serviceId={serviceId}
        onSaved={(roleId, pct) => {
          const next = persons.map((p) =>
            p.id === roleId ? { ...p, shareholding_percentage: pct } : p
          );
          setPersons(next);
          onPersonsChange(next);
        }}
      />

      {/* Director warning */}
      {!hasDirector && persons.length > 0 && (
        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
          At least one director is required.
        </p>
      )}

      {addingRole && (
        <AddPersonModal
          serviceId={serviceId}
          role={addingRole}
          currentPersons={persons}
          onClose={() => setAddingRole(null)}
          onAdded={handleAdded}
        />
      )}

      {viewingSummaryRoleId && (() => {
        const target = persons.find((p) => p.id === viewingSummaryRoleId);
        if (!target) return null;
        return (
          <ViewSummaryDialog
            person={target}
            documents={documents}
            documentTypes={documentTypes}
            requirements={requirements}
            onClose={() => setViewingSummaryRoleId(null)}
            onJumpToReview={() => {
              setViewingSummaryRoleId(null);
              setReviewingRoleId(target.id);
            }}
          />
        );
      })()}
    </div>
  );
}

// ─── ViewSummaryDialog ───────────────────────────────────────────────────────

function mapToReviewKycRecord(person: ServicePerson): KycRecord {
  const kyc = person.client_profiles?.client_profile_kyc ?? {};
  const profile = person.client_profiles;
  return {
    id: (kyc.id as string) ?? "",
    client_id: "",
    profile_id: profile?.id ?? null,
    record_type: (profile?.record_type as "individual" | "organisation" | null) ?? "individual",
    full_name: profile?.full_name ?? null,
    email: profile?.email ?? null,
    phone: profile?.phone ?? null,
    address: (kyc.address as string | null) ?? null,
    address_line_1: (kyc.address_line_1 as string | null) ?? null,
    address_line_2: (kyc.address_line_2 as string | null) ?? null,
    address_city: (kyc.address_city as string | null) ?? null,
    address_state: (kyc.address_state as string | null) ?? null,
    address_postal_code: (kyc.address_postal_code as string | null) ?? null,
    address_country: (kyc.address_country as string | null) ?? null,
    aliases: (kyc.aliases as string | null) ?? null,
    work_address: null,
    work_phone: null,
    work_email: null,
    date_of_birth: (kyc.date_of_birth as string | null) ?? null,
    nationality: (kyc.nationality as string | null) ?? null,
    passport_country: (kyc.passport_country as string | null) ?? null,
    passport_number: (kyc.passport_number as string | null) ?? null,
    passport_expiry: (kyc.passport_expiry as string | null) ?? null,
    occupation: (kyc.occupation as string | null) ?? null,
    employer: (kyc.employer as string | null) ?? null,
    years_in_role: (kyc.years_in_role as number | null) ?? null,
    years_total_experience: (kyc.years_total_experience as number | null) ?? null,
    industry: (kyc.industry as string | null) ?? null,
    source_of_funds_type: (kyc.source_of_funds_type as string | null) ?? null,
    source_of_funds_other: (kyc.source_of_funds_other as string | null) ?? null,
    legal_issues_declared: (kyc.legal_issues_declared as boolean | null) ?? null,
    legal_issues_details: (kyc.legal_issues_details as string | null) ?? null,
    tax_identification_number: (kyc.tax_identification_number as string | null) ?? null,
    source_of_funds_description: (kyc.source_of_funds_description as string | null) ?? null,
    source_of_wealth_description: (kyc.source_of_wealth_description as string | null) ?? null,
    is_pep: (kyc.is_pep as boolean | null) ?? null,
    pep_details: (kyc.pep_details as string | null) ?? null,
    business_website: (kyc.business_website as string | null) ?? null,
    jurisdiction_incorporated: (kyc.jurisdiction_incorporated as string | null) ?? null,
    date_of_incorporation: (kyc.date_of_incorporation as string | null) ?? null,
    listed_or_unlisted: (kyc.listed_or_unlisted as "listed" | "unlisted" | null) ?? null,
    jurisdiction_tax_residence: (kyc.jurisdiction_tax_residence as string | null) ?? null,
    description_activity: (kyc.description_activity as string | null) ?? null,
    company_registration_number: (kyc.company_registration_number as string | null) ?? null,
    industry_sector: (kyc.industry_sector as string | null) ?? null,
    regulatory_licenses: (kyc.regulatory_licenses as string | null) ?? null,
    sanctions_checked: false,
    sanctions_checked_at: null,
    sanctions_notes: null,
    adverse_media_checked: false,
    adverse_media_checked_at: null,
    adverse_media_notes: null,
    pep_verified: false,
    pep_verified_at: null,
    pep_verified_notes: null,
    risk_rating: null,
    risk_rating_justification: null,
    risk_rated_by: null,
    risk_rated_at: null,
    geographic_risk_assessment: null,
    relationship_history: null,
    risk_flags: null,
    senior_management_approval: null,
    senior_management_approved_by: null,
    senior_management_approved_at: null,
    ongoing_monitoring_plan: null,
    kyc_journey_completed: (kyc.kyc_journey_completed as boolean) ?? false,
    is_primary: false,
    invite_sent_at: null,
    invite_sent_by: null,
    due_diligence_level: (profile?.due_diligence_level as DueDiligenceLevel | null) ?? null,
    completion_status: "incomplete",
    filled_by: null,
    created_at: "",
    updated_at: "",
  };
}

function ViewSummaryDialog({
  person,
  documents,
  documentTypes,
  requirements,
  onClose,
  onJumpToReview,
}: {
  person: ServicePerson;
  documents: ClientServiceDoc[];
  documentTypes: DocumentType[];
  requirements: DueDiligenceRequirement[];
  onClose: () => void;
  onJumpToReview: () => void;
}) {
  const profileId = person.client_profiles?.id ?? "";
  const personDocs = documents
    .filter((d) => d.client_profile_id === profileId)
    .map<DocumentRecord>((d) => ({
      id: d.id,
      client_id: "",
      kyc_record_id: null,
      document_type_id: d.document_type_id ?? "",
      file_path: "",
      file_name: d.file_name,
      file_size: null,
      mime_type: d.mime_type ?? null,
      verification_status: d.verification_status as VerificationStatus,
      verification_result: d.verification_result as VerificationResult | null,
      expiry_date: null,
      notes: null,
      is_active: true,
      uploaded_by: null,
      uploaded_at: d.uploaded_at,
      verified_at: null,
      admin_status: d.admin_status as "pending" | "approved" | "rejected" | null,
      admin_status_note: null,
      admin_status_by: null,
      admin_status_at: null,
    }));
  const kycRecord = mapToReviewKycRecord(person);
  const ddLevel = (person.client_profiles?.due_diligence_level as DueDiligenceLevel | null) ?? "cdd";
  const personName = person.client_profiles?.full_name ?? "Person";

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto z-[100]">
        <DialogHeader>
          <DialogTitle>{personName} — Summary</DialogTitle>
        </DialogHeader>
        <div className="pt-2">
          <ReviewStep
            kycRecord={kycRecord}
            documents={personDocs}
            documentTypes={documentTypes}
            dueDiligenceLevel={ddLevel}
            requirements={requirements}
            form={kycRecord}
            onJumpTo={() => onJumpToReview()}
          />
        </div>
        <div className="flex justify-end gap-2 pt-3 border-t">
          <Button
            variant="outline"
            onClick={onJumpToReview}
            className="h-10 px-4"
          >
            Open Review KYC to edit
          </Button>
          <Button
            onClick={onClose}
            className="h-10 px-5 bg-brand-navy text-white hover:bg-brand-navy/90"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
