"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface InviteKycDialogProps {
  serviceId: string;
  roleId: string;
  personName: string;
  personEmail?: string | null;
  roleLabel: string;
  onClose: () => void;
  onSent: (sentAt: string) => void;
}

export function InviteKycDialog({
  serviceId,
  roleId,
  personName,
  personEmail,
  roleLabel,
  onClose,
  onSent,
}: InviteKycDialogProps) {
  const [email, setEmail] = useState(personEmail ?? "");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  async function handleSend() {
    if (!email.trim()) {
      toast.error("Email is required", { position: "top-right" });
      return;
    }
    setSending(true);
    try {
      const res = await fetch(
        `/api/services/${serviceId}/persons/${roleId}/send-invite`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: email.trim(), note: note.trim() || undefined }),
        }
      );
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

  return (
    <Dialog open={true} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-sm z-[100]">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Request KYC from {personName}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <p className="text-xs text-gray-500">
            An email will be sent asking {personName} ({roleLabel}) to complete their KYC information.
          </p>

          <div className="space-y-1.5">
            <Label className="text-sm">Email address <span className="text-red-400">*</span></Label>
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
