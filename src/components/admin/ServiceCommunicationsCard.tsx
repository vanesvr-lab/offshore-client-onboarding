"use client";

// B-108 — right-rail "Communications" card. Renders the count of outbound
// emails for this service plus a View all button that opens the full
// modal viewer. Disabled-empty state when nothing has been sent yet.

import { useState } from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ServiceCommunication } from "@/app/(admin)/admin/services/[id]/page";
import { ServiceCommunicationsDialog } from "./ServiceCommunicationsDialog";

export function ServiceCommunicationsCard({
  communications,
}: {
  communications: ServiceCommunication[];
}) {
  const [open, setOpen] = useState(false);
  const count = communications.length;
  const empty = count === 0;

  return (
    <div className="bg-white border rounded-xl px-4 py-3 space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
        Communications
      </p>

      <div className="flex items-center gap-2">
        <Mail className="h-4 w-4 text-gray-400" />
        {empty ? (
          <span className="text-sm text-gray-400">No emails sent yet</span>
        ) : (
          <span className="text-sm font-semibold text-gray-700">
            {count} email{count === 1 ? "" : "s"} sent
          </span>
        )}
      </div>

      <Button
        onClick={() => setOpen(true)}
        disabled={empty}
        className="w-full h-9 text-xs bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        View all
      </Button>

      <ServiceCommunicationsDialog
        open={open}
        onClose={() => setOpen(false)}
        communications={communications}
      />
    </div>
  );
}
