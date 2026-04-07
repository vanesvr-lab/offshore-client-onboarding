"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Mail, CheckCircle } from "lucide-react";
import { formatDate } from "@/lib/utils/formatters";

interface SendInvitePanelProps {
  clientId: string;
  inviteSentAt: string | null;
}

export function SendInvitePanel({ clientId, inviteSentAt: initialSentAt }: SendInvitePanelProps) {
  const router = useRouter();
  const [sentAt, setSentAt] = useState<string | null>(initialSentAt);
  const [sending, setSending] = useState(false);

  async function handleSend() {
    setSending(true);
    try {
      const res = await fetch(`/api/admin/clients/${clientId}/send-invite`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to send invite");
      const now = new Date().toISOString();
      setSentAt(now);
      toast.success("Welcome email sent");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-brand-navy flex items-center gap-2">
          <Mail className="h-4 w-4" />
          Welcome Email
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {sentAt ? (
          <div className="flex items-center gap-2 text-sm text-green-700">
            <CheckCircle className="h-4 w-4 shrink-0" />
            <span>Sent {formatDate(sentAt)}</span>
          </div>
        ) : (
          <p className="text-sm text-gray-500">Invite not sent yet.</p>
        )}
        <Button
          size="sm"
          className="w-full bg-brand-navy hover:bg-brand-blue"
          onClick={handleSend}
          disabled={sending}
        >
          {sending ? "Sending…" : sentAt ? "Resend invite" : "Send invite"}
        </Button>
      </CardContent>
    </Card>
  );
}
