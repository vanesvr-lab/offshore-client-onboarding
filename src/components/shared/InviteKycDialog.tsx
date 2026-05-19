"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface InviteKycRecipientOption {
  email: string;
  name: string;
  /** Display label like "Director" or "Filing Representative". */
  role: string;
}

interface InviteKycDialogProps {
  serviceId: string;
  roleId: string;
  personName: string;
  roleLabel: string;
  /** B-134 — every email linked to the director (their own + the
   *  filing rep's, when set). Each row shows email + "Name · Role".
   *  Admin can multi-select to send one magic-link per recipient. */
  recipients: InviteKycRecipientOption[];
  /** B-134 — emails to pre-check on open. Typically the rep's email
   *  if a rep is set, else the director's own email. */
  defaultSelectedEmails: string[];
  onClose: () => void;
  /** B-118 Hotfix 2 — the second arg is an array of
   *  service_communications rows the route inserted (one per
   *  recipient). Caller splices them into local state for instant
   *  right-rail Communications card freshness instead of waiting for
   *  a refetch. */
  onSent: (
    sentAt: string,
    communications: Array<Record<string, unknown>>,
  ) => void;
}

export function InviteKycDialog({
  serviceId,
  roleId,
  personName,
  roleLabel,
  recipients,
  defaultSelectedEmails,
  onClose,
  onSent,
}: InviteKycDialogProps) {
  const [selectedEmails, setSelectedEmails] = useState<Set<string>>(
    () => new Set(defaultSelectedEmails),
  );
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  // Re-sync when the recipient list changes (e.g. admin attaches a rep
  // while the dialog is mounted but closed and reopens it).
  useEffect(() => {
    setSelectedEmails(new Set(defaultSelectedEmails));
  }, [defaultSelectedEmails]);

  const uniqueRecipients = useMemo(() => {
    const byEmail = new Map<string, InviteKycRecipientOption>();
    for (const r of recipients) {
      const key = r.email.trim().toLowerCase();
      if (!byEmail.has(key)) byEmail.set(key, { ...r, email: key });
    }
    return Array.from(byEmail.values());
  }, [recipients]);

  function toggleEmail(email: string, checked: boolean) {
    setSelectedEmails((prev) => {
      const next = new Set(prev);
      if (checked) next.add(email);
      else next.delete(email);
      return next;
    });
  }

  async function handleSend() {
    if (selectedEmails.size === 0) {
      toast.error("Pick at least one recipient", { position: "top-right" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(
        `/api/services/${serviceId}/persons/${roleId}/send-invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            recipientEmails: Array.from(selectedEmails),
            note: note.trim() || undefined,
          }),
        }
      );
      const data = (await res.json()) as {
        ok?: boolean;
        invite_sent_at?: string;
        error?: string;
        communications?: Array<Record<string, unknown>>;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to send");
      onSent(
        data.invite_sent_at ?? new Date().toISOString(),
        data.communications ?? [],
      );
      toast.success(
        selectedEmails.size === 1
          ? "Email sent"
          : `Sent to ${selectedEmails.size} recipients`,
        { position: "top-right" },
      );
      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send", { position: "top-right" });
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md z-[100]">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Request KYC from {personName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <p className="text-xs text-gray-500">
            An email will be sent asking {personName} ({roleLabel}) to complete their KYC information. Pick one or more recipients.
          </p>

          <div className="space-y-1.5">
            <Label className="text-sm">
              Send to <span className="text-red-400">*</span>
            </Label>
            {uniqueRecipients.length === 0 ? (
              <div className="border rounded-md px-3 py-2 text-xs text-gray-500">
                No email is on file for this director. Add an email or attach a filing representative before sending.
              </div>
            ) : (
              <div className="border rounded-md divide-y">
                {uniqueRecipients.map((r) => {
                  const checked = selectedEmails.has(r.email);
                  return (
                    <label
                      key={r.email}
                      className="flex items-center gap-2 p-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => toggleEmail(r.email, v === true)}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900 truncate">{r.email}</div>
                        <div className="text-[11px] text-gray-500 truncate">
                          {r.name} <span className="text-gray-400">·</span> {r.role}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm">
              Additional note{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a personal message..."
              className="text-sm resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={onClose} disabled={sending}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSend()}
              disabled={sending || selectedEmails.size === 0}
              className="bg-brand-navy hover:bg-brand-blue gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {sending
                ? "Sending…"
                : `Send to ${selectedEmails.size} recipient${selectedEmails.size === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
