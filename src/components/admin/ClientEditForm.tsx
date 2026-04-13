"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ClientEditFormProps {
  clientId: string;
  companyName: string;
}

export function ClientEditForm({ clientId, companyName }: ClientEditFormProps) {
  const router = useRouter();
  const [name, setName] = useState(companyName);
  const [loading, setLoading] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim() === companyName) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_name: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update client");
      toast.success("Client updated");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-brand-navy">Account Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="company_name">Account name</Label>
            <Input
              id="company_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <Button
            type="submit"
            disabled={loading || name.trim() === companyName}
            className="bg-brand-navy hover:bg-brand-blue"
          >
            {loading ? "Saving…" : "Save"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
