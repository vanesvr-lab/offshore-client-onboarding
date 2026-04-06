"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";

const EMPTY_FORM = { company_name: "", full_name: "", email: "", phone: "" };

export function CreateClientModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  // Reset form whenever the modal closes
  useEffect(() => {
    if (!open) setForm(EMPTY_FORM);
  }, [open]);

  function update(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch("/api/admin/create-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create client");

      toast.success(`Client account created for ${form.company_name}`);
      setOpen(false);
      router.push(`/admin/clients/${data.clientId}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog disablePointerDismissal open={open} onOpenChange={(o) => setOpen(o)}>
      <DialogTrigger render={
        <Button className="bg-brand-navy hover:bg-brand-blue gap-2">
          <UserPlus className="h-4 w-4" />
          New Client
        </Button>
      } />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">Create client account</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-2">
            <Label htmlFor="company_name">Company name *</Label>
            <Input
              id="company_name"
              value={form.company_name}
              onChange={update("company_name")}
              placeholder="Acme Holdings Ltd"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="full_name">Primary contact name *</Label>
            <Input
              id="full_name"
              value={form.full_name}
              onChange={update("full_name")}
              placeholder="John Smith"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email address *</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={update("email")}
              placeholder="john@acme.com"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone (optional)</Label>
            <Input
              id="phone"
              value={form.phone}
              onChange={update("phone")}
              placeholder="+1 555 000 0000"
            />
          </div>
          <p className="text-xs text-gray-500">
            The account will be created. You can send the welcome email from the client detail page.
          </p>
          <div className="flex gap-3 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-brand-navy hover:bg-brand-blue"
              disabled={loading}
            >
              {loading ? "Creating…" : "Create client"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
