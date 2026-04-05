"use client";

import { useState } from "react";
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

export function CreateClientModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    full_name: "",
    email: "",
    phone: "",
  });

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

      toast.success(`Account created — welcome email sent to ${form.email}`);
      setOpen(false);
      setForm({ company_name: "", full_name: "", email: "", phone: "" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            A welcome email with a password setup link will be sent automatically.
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
              {loading ? "Creating…" : "Create & send invite"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
