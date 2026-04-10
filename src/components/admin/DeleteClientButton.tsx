"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DeleteClientDialog } from "./DeleteClientDialog";

interface DeleteClientButtonProps {
  clientId: string;
  clientName: string;
  contactName?: string | null;
  contactEmail?: string | null;
  applicationCount: number;
  documentCount: number;
}

export function DeleteClientButton(props: DeleteClientButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400"
      >
        <Trash2 className="h-3.5 w-3.5" />
        Delete Client
      </Button>
      <DeleteClientDialog
        {...props}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  );
}
