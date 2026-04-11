"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientAuditTrailDialog } from "@/components/admin/ClientAuditTrailDialog";

interface ClientAuditTrailButtonProps {
  clientId: string;
  clientName: string;
}

export function ClientAuditTrailButton({ clientId, clientName }: ClientAuditTrailButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5"
      >
        <History className="h-4 w-4" />
        Audit Trail
      </Button>

      <ClientAuditTrailDialog
        clientId={clientId}
        clientName={clientName}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
