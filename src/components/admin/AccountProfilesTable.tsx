"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { CheckCircle, Pencil, PlusCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AddProfileDialog } from "./AddProfileDialog";
import { calculateComplianceScore } from "@/lib/utils/complianceScoring";
import { getEffectiveDdLevel } from "@/lib/utils/profileDocumentRequirements";
import { formatDate } from "@/lib/utils/formatters";
import type {
  KycRecord,
  DocumentRecord,
  DueDiligenceLevel,
  DueDiligenceRequirement,
  RoleDocumentRequirement,
} from "@/types";

interface AccountProfilesTableProps {
  clientId: string;
  profiles: KycRecord[];
  accountDdLevel: DueDiligenceLevel;
  roleDocRequirements: RoleDocumentRequirement[];
  ddRequirements: DueDiligenceRequirement[];
  documents: DocumentRecord[];
}

const LEVEL_LABELS: Record<string, string> = {
  sdd: "SDD",
  cdd: "CDD",
  edd: "EDD",
};

function ProfileRow({
  profile,
  clientId,
  accountDdLevel,
  ddRequirements,
  profileDocuments,
}: {
  profile: KycRecord;
  clientId: string;
  accountDdLevel: DueDiligenceLevel;
  ddRequirements: DueDiligenceRequirement[];
  profileDocuments: DocumentRecord[];
}) {
  const effectiveLevel = getEffectiveDdLevel(profile.due_diligence_level, accountDdLevel);
  const [ddLevel, setDdLevel] = useState<string>(profile.due_diligence_level ?? "");
  const [savingLevel, setSavingLevel] = useState(false);
  const [email, setEmail] = useState(profile.email ?? "");
  const [editingEmail, setEditingEmail] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [sendingInvite, setSendingInvite] = useState(false);
  const [inviteSentAt, setInviteSentAt] = useState(profile.invite_sent_at);
  const emailInputRef = useRef<HTMLInputElement>(null);

  const score = calculateComplianceScore(profile, profileDocuments, effectiveLevel, ddRequirements);

  const roles = (profile.profile_roles ?? []).map((r) => {
    let label = r.role.replace("_", " ");
    if (r.role === "shareholder" && r.shareholding_percentage !== null) {
      label += ` (${r.shareholding_percentage}%)`;
    }
    return label;
  });

  async function handleDdLevelChange(val: string) {
    setSavingLevel(true);
    try {
      const res = await fetch(`/api/admin/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ due_diligence_level: val === "inherit" ? null : val }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setDdLevel(val === "inherit" ? "" : val);
      toast.success("DD level updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingLevel(false);
    }
  }

  async function saveEmail() {
    setSavingEmail(true);
    try {
      const res = await fetch(`/api/admin/profiles/${profile.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || null }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setEditingEmail(false);
      toast.success("Email saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingEmail(false);
    }
  }

  async function sendInvite() {
    if (!email.trim()) return;
    setSendingInvite(true);
    try {
      const res = await fetch(`/api/admin/profiles/${profile.id}/send-invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json() as { error?: string; sentAt?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to send invite");
      setInviteSentAt(data.sentAt ?? new Date().toISOString());
      toast.success("Invite sent");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send invite");
    } finally {
      setSendingInvite(false);
    }
  }

  const pct = score.overallPercentage;

  return (
    <tr className="border-b last:border-0 hover:bg-gray-50">
      {/* Name */}
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          <a
            href={`/admin/clients/${clientId}/kyc?profileId=${profile.id}`}
            className="text-sm font-medium text-brand-navy hover:underline"
          >
            {profile.full_name ?? "Unnamed"}
          </a>
          {profile.is_primary && (
            <span className="text-[10px] bg-brand-navy/10 text-brand-navy px-1.5 py-0.5 rounded">Primary</span>
          )}
        </div>
      </td>

      {/* Roles */}
      <td className="py-3 px-3">
        <span className="text-xs text-gray-600">
          {roles.length > 0 ? roles.join(", ") : <span className="text-gray-400">—</span>}
        </span>
      </td>

      {/* DD Level */}
      <td className="py-3 px-3">
        <Select
          value={ddLevel || "inherit"}
          onValueChange={(v) => { void handleDdLevelChange(v ?? "inherit"); }}
          disabled={savingLevel}
        >
          <SelectTrigger className="h-7 text-xs w-32">
            <SelectValue placeholder={`Inherited: ${LEVEL_LABELS[accountDdLevel]}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="inherit" className="text-xs italic text-gray-500">
              Inherited: {LEVEL_LABELS[accountDdLevel]}
            </SelectItem>
            <SelectItem value="sdd" className="text-xs">SDD</SelectItem>
            <SelectItem value="cdd" className="text-xs">CDD</SelectItem>
            <SelectItem value="edd" className="text-xs">EDD</SelectItem>
          </SelectContent>
        </Select>
      </td>

      {/* KYC % */}
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${pct === 100 ? "bg-green-500" : "bg-brand-accent"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className={`text-xs font-medium ${pct === 100 ? "text-green-600" : "text-gray-600"}`}>
            {pct}%
          </span>
        </div>
      </td>

      {/* Email */}
      <td className="py-3 px-3">
        {editingEmail ? (
          <div className="flex items-center gap-1">
            <Input
              ref={emailInputRef}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-7 text-xs w-40"
              onKeyDown={(e) => { if (e.key === "Enter") void saveEmail(); if (e.key === "Escape") setEditingEmail(false); }}
              autoFocus
            />
            <Button size="sm" className="h-7 text-xs px-2 bg-brand-navy hover:bg-brand-blue" onClick={() => void saveEmail()} disabled={savingEmail}>
              {savingEmail ? "…" : "Save"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs px-1" onClick={() => setEditingEmail(false)}>✕</Button>
          </div>
        ) : email ? (
          <button
            onClick={() => setEditingEmail(true)}
            className="text-xs text-gray-600 hover:text-brand-blue flex items-center gap-1 group"
            title="Click to edit email"
          >
            <span className="group-hover:underline">{email}</span>
            <Pencil className="h-2.5 w-2.5 text-gray-400 group-hover:text-brand-blue opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        ) : (
          <button
            onClick={() => setEditingEmail(true)}
            className="text-xs text-brand-blue hover:underline flex items-center gap-1"
          >
            <PlusCircle className="h-3 w-3" />
            Add email
          </button>
        )}
      </td>

      {/* Invite */}
      <td className="py-3 px-3">
        <div className="flex items-center gap-1.5">
          {inviteSentAt ? (
            <>
              <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
              <span className="text-xs text-gray-500">Sent {formatDate(inviteSentAt)}</span>
              <button
                onClick={() => void sendInvite()}
                disabled={sendingInvite || !email}
                className="text-xs text-brand-blue hover:underline ml-1"
                title="Resend"
              >
                Resend
              </button>
            </>
          ) : (
            <button
              onClick={() => void sendInvite()}
              disabled={sendingInvite || !email}
              className={`flex items-center gap-1 text-xs ${!email ? "text-gray-300 cursor-not-allowed" : "text-brand-blue hover:underline"}`}
              title={!email ? "Add email first" : "Send invite"}
            >
              <Send className="h-3 w-3" />
              {sendingInvite ? "Sending…" : "Send invite"}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

export function AccountProfilesTable({
  clientId,
  profiles,
  accountDdLevel,
  ddRequirements,
  documents,
}: AccountProfilesTableProps) {
  const [localProfiles, setLocalProfiles] = useState(profiles);
  const [showAddDialog, setShowAddDialog] = useState(false);

  function handleProfileCreated(newProfile: KycRecord) {
    setLocalProfiles((prev) => [...prev, newProfile]);
    setShowAddDialog(false);
    toast.success("Profile created");
  }

  // Check if primary exists (to control the AddProfileDialog role options)
  const hasPrimary = localProfiles.some((p) => p.is_primary);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base text-brand-navy">Account Profiles</CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowAddDialog(true)}
            className="gap-1.5 h-7 text-xs"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Add Profile
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {localProfiles.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">No profiles yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Name</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Roles</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">DD</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">KYC</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Email</th>
                  <th className="text-left py-2 px-3 text-xs text-gray-500 font-medium">Invite</th>
                </tr>
              </thead>
              <tbody>
                {localProfiles.map((profile) => (
                  <ProfileRow
                    key={profile.id}
                    profile={profile}
                    clientId={clientId}
                    accountDdLevel={accountDdLevel}
                    ddRequirements={ddRequirements}
                    profileDocuments={documents.filter(
                      (d) => d.kyc_record_id === profile.id
                    )}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {showAddDialog && (
        <AddProfileDialog
          clientId={clientId}
          accountDdLevel={accountDdLevel}
          hasPrimary={hasPrimary}
          onCreated={handleProfileCreated}
          onClose={() => setShowAddDialog(false)}
        />
      )}
    </Card>
  );
}
