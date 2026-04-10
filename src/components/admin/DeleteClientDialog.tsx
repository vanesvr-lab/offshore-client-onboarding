"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteClientDialogProps {
  clientId: string;
  clientName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  applicationCount: number;
  documentCount: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteClientDialog({
  clientId,
  clientName,
  contactName,
  contactEmail,
  applicationCount,
  documentCount,
  open,
  onOpenChange,
}: DeleteClientDialogProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    if (confirmation !== "DELETE") return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmationText: "DELETE" }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok || !data.success) throw new Error(data.error ?? "Delete failed");
      toast.success(`${clientName} has been deleted`);
      onOpenChange(false);
      router.push("/admin/clients");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog
      disablePointerDismissal
      open={open}
      onOpenChange={(o) => {
        if (!o && !deleting) {
          setConfirmation("");
          onOpenChange(false);
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            Delete Client
          </DialogTitle>
        </DialogHeader>

        {/* Client summary */}
        <div className="rounded-lg bg-gray-50 border px-4 py-3 text-sm space-y-0.5">
          <p className="font-semibold text-brand-navy">{clientName}</p>
          {contactName && <p className="text-gray-600">{contactName}</p>}
          {contactEmail && <p className="text-gray-500">{contactEmail}</p>}
        </div>

        {/* Consequences */}
        <div className="space-y-2 text-sm text-gray-700">
          <p className="font-medium">This will:</p>
          <ul className="space-y-1 pl-4 list-disc text-gray-600">
            <li>Hide this client from all admin screens</li>
            <li>Disable login for all associated users</li>
            {applicationCount > 0 && (
              <li>Hide {applicationCount} application{applicationCount > 1 ? "s" : ""} and associated documents</li>
            )}
            {documentCount > 0 && (
              <li>Hide {documentCount} document{documentCount > 1 ? "s" : ""} from the document library</li>
            )}
          </ul>
          <p className="font-bold text-red-600 mt-3">This action cannot be undone.</p>
        </div>

        {/* Confirmation input */}
        <div className="space-y-1.5">
          <p className="text-sm text-gray-600">
            Type <span className="font-mono font-bold">DELETE</span> to confirm:
          </p>
          <Input
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder="DELETE"
            className={confirmation === "DELETE" ? "border-red-400" : ""}
            disabled={deleting}
          />
        </div>

        <div className="flex gap-2 justify-end">
          <Button
            variant="outline"
            onClick={() => { setConfirmation(""); onOpenChange(false); }}
            disabled={deleting}
          >
            Cancel
          </Button>
          <Button
            className="bg-red-600 hover:bg-red-700 text-white gap-1.5"
            onClick={handleDelete}
            disabled={confirmation !== "DELETE" || deleting}
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "Deleting…" : "Delete Client"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
