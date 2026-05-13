"use client";

// B-108 — Communications viewer for /admin/services/[id].
//
// Two layers of dialog:
//   1. List dialog: paginated/filterable table of every email sent for
//      this service (most recent first).
//   2. Body dialog (nested): renders the full HTML body inside an
//      <iframe sandbox=""> so the message can never run scripts or make
//      network calls even if a future inbound flow ever wrote into this
//      table.
//
// Email-type labels are static here — we keep the column readable when
// new types are added by falling back to the raw key.

import { useMemo, useState } from "react";
import { Eye, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateTime } from "@/lib/utils/formatters";
import type { ServiceCommunication } from "@/app/(admin)/admin/services/[id]/page";

const EMAIL_TYPE_LABELS: Record<string, string> = {
  client_signup_invite: "Client signup invite",
  profile_kyc_invite: "Profile KYC invite",
  service_kyc_invite: "Service KYC invite",
  document_update_request: "Document update request",
  process_documents_request: "Process documents request",
};

function labelForEmailType(key: string): string {
  return EMAIL_TYPE_LABELS[key] ?? key.replace(/_/g, " ");
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + "…";
}

export function ServiceCommunicationsDialog({
  open,
  onClose,
  communications,
}: {
  open: boolean;
  onClose: () => void;
  communications: ServiceCommunication[];
}) {
  const [filter, setFilter] = useState<string>("all");
  const [viewing, setViewing] = useState<ServiceCommunication | null>(null);

  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const c of communications) set.add(c.email_type);
    return Array.from(set).sort();
  }, [communications]);

  const filtered = useMemo(() => {
    if (filter === "all") return communications;
    return communications.filter((c) => c.email_type === filter);
  }, [communications, filter]);

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
        <DialogContent className="max-w-5xl w-[min(100vw-2rem,72rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-brand-navy" />
              Communications
              <span className="text-xs font-normal text-gray-500">
                ({filtered.length} of {communications.length})
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex items-center gap-2 pb-2 flex-wrap">
            <button
              onClick={() => setFilter("all")}
              className={`px-3 py-1 rounded-full text-xs border ${
                filter === "all"
                  ? "bg-brand-navy text-white border-brand-navy"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              All
            </button>
            {availableTypes.map((t) => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`px-3 py-1 rounded-full text-xs border ${
                  filter === t
                    ? "bg-brand-navy text-white border-brand-navy"
                    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
                }`}
              >
                {labelForEmailType(t)}
              </button>
            ))}
          </div>

          <div className="max-h-[70vh] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500 sticky top-0">
                <tr>
                  <th className="text-left py-2 px-3 font-semibold">Date</th>
                  <th className="text-left py-2 px-3 font-semibold">To</th>
                  <th className="text-left py-2 px-3 font-semibold">Type</th>
                  <th className="text-left py-2 px-3 font-semibold">Subject</th>
                  <th className="text-right py-2 px-3 font-semibold">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-gray-400">
                      No emails match this filter.
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="py-2 px-3 text-gray-700 whitespace-nowrap">
                        {formatDateTime(c.sent_at)}
                      </td>
                      <td className="py-2 px-3 text-gray-700">
                        {c.sent_to_email ?? "—"}
                        {c.status === "failed" && (
                          <span className="ml-1.5 text-xs text-red-600 font-medium">
                            (failed)
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-gray-600">
                        {labelForEmailType(c.email_type)}
                      </td>
                      <td className="py-2 px-3 text-gray-700">
                        {truncate(c.subject, 80)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          onClick={() => setViewing(c)}
                          className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-gray-100 text-gray-500 hover:text-brand-navy"
                          aria-label="View email body"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* Nested body dialog. `sandbox=""` with no allow-flags blocks
          scripts, forms, popups, and same-origin access. The HTML still
          renders for visual review. */}
      <Dialog open={viewing !== null} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-3xl w-[min(100vw-2rem,48rem)]">
          {viewing && (
            <>
              <DialogHeader>
                <DialogTitle className="text-base">{viewing.subject}</DialogTitle>
              </DialogHeader>
              <div className="text-xs text-gray-500 space-y-0.5 pb-2">
                <p>Sent {formatDateTime(viewing.sent_at)}</p>
                <p>To {viewing.sent_to_email ?? "—"}</p>
                <p>Type: {labelForEmailType(viewing.email_type)}</p>
              </div>
              <iframe
                title="email body"
                sandbox=""
                srcDoc={viewing.body_html}
                className="w-full min-h-[60vh] border rounded-md bg-white"
              />
              <div className="flex justify-end pt-2">
                <Button
                  onClick={() => setViewing(null)}
                  className="h-9 text-xs bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
