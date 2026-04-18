"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Mail } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DocumentUpdateRequest } from "@/app/(admin)/admin/services/[id]/page";

interface Recipient {
  id: string;
  name: string;
  email: string | null;
  label: string; // e.g. "Document owner" or "Representative"
}

interface DocumentUpdateRequestDialogProps {
  documentId: string;
  documentTypeName: string;
  serviceId: string;
  recipients: Recipient[];
  verificationFlags: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: (req: DocumentUpdateRequest) => void;
}

export function DocumentUpdateRequestDialog({
  documentId,
  documentTypeName,
  serviceId,
  recipients,
  verificationFlags,
  open,
  onOpenChange,
  onSent,
}: DocumentUpdateRequestDialogProps) {
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>(
    recipients[0]?.id ?? ""
  );
  const [note, setNote] = useState("");
  const [autoPopulate, setAutoPopulate] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAutoPopulate(checked: boolean) {
    setAutoPopulate(checked);
    if (checked && verificationFlags.length > 0) {
      setNote(verificationFlags.map((f) => `• ${f}`).join("\n"));
    } else if (checked) {
      setNote("");
    }
  }

  async function handleSend() {
    if (!note.trim()) {
      setError("Note is required");
      return;
    }
    if (!selectedRecipientId) {
      setError("Please select a recipient");
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/documents/${documentId}/request-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          service_id: serviceId,
          sent_to_profile_id: selectedRecipientId,
          note: note.trim(),
          auto_populated_from_flags: autoPopulate,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        request_id?: string;
        sent_at?: string;
        error?: string;
      };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to send request");

      const recipient = recipients.find((r) => r.id === selectedRecipientId);
      toast.success("Update request sent", { position: "top-right" });

      onSent({
        id: data.request_id ?? "",
        document_id: documentId,
        service_id: serviceId,
        requested_by: "",
        requested_by_name: null,
        sent_to_profile_id: selectedRecipientId,
        sent_to_email: recipient?.email ?? null,
        note: note.trim(),
        auto_populated_from_flags: autoPopulate,
        sent_at: data.sent_at ?? new Date().toISOString(),
      });

      onOpenChange(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send request");
    } finally {
      setSending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Request Document Update</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-1">
          {/* Document name */}
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
            <span className="text-gray-400 text-xs uppercase tracking-wide font-medium mr-2">Document:</span>
            {documentTypeName}
          </div>

          {/* Send to */}
          {recipients.length > 0 ? (
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">Send to</label>
              <div className="space-y-2">
                {recipients.map((r) => (
                  <label
                    key={r.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      selectedRecipientId === r.id
                        ? "border-brand-navy bg-brand-navy/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="recipient"
                      value={r.id}
                      checked={selectedRecipientId === r.id}
                      onChange={() => setSelectedRecipientId(r.id)}
                      className="mt-0.5"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{r.name}</p>
                      <p className="text-xs text-gray-500">{r.label}{r.email ? ` · ${r.email}` : " · no email"}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              No recipients found for this document.
            </p>
          )}

          {/* Auto-populate */}
          {verificationFlags.length > 0 && (
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoPopulate}
                onChange={(e) => handleAutoPopulate(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-700">
                Auto-populate from AI flags ({verificationFlags.length} flag{verificationFlags.length !== 1 ? "s" : ""})
              </span>
            </label>
          )}

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-600 uppercase tracking-wide">
              Note <span className="text-red-500">*</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => { setNote(e.target.value); setError(null); }}
              placeholder="Describe what needs to be updated or resubmitted…"
              rows={4}
              className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={sending}>
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-brand-navy hover:bg-brand-blue gap-1.5"
              onClick={() => void handleSend()}
              disabled={sending || recipients.length === 0}
            >
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
              Send Request
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
