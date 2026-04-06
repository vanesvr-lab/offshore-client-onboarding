"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { formatDateTime } from "@/lib/utils/formatters";
import { toast } from "sonner";
import { Mail, ChevronDown, ChevronUp } from "lucide-react";
import type { EmailLogEntry } from "@/types";

interface EmailComposerProps {
  applicationId: string;
  clientEmail: string;
  companyName: string;
  previousEmails: EmailLogEntry[];
}

export function EmailComposer({
  applicationId,
  clientEmail,
  companyName,
  previousEmails,
}: EmailComposerProps) {
  const [open, setOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [subject, setSubject] = useState(
    `Re: Your Application — ${companyName}`
  );
  const [body, setBody] = useState("");

  async function handleSend() {
    if (!body.trim()) {
      toast.error("Email body cannot be empty");
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: clientEmail, subject, body, applicationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("Email sent successfully");
      setBody("");
      setOpen(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send email");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet disablePointerDismissal open={open} onOpenChange={(o) => setOpen(o)}>
      <SheetTrigger render={
        <Button variant="outline" size="sm" className="gap-2">
          <Mail className="h-4 w-4" /> Email Client
        </Button>
      } />
      <SheetContent
        className="w-[480px] sm:max-w-[480px] overflow-y-auto"
        side="right"
      >
        <SheetHeader>
          <SheetTitle>Email Client</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">To</Label>
            <Input value={clientEmail} disabled className="bg-gray-50" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Subject</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-gray-600">Message</Label>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Write your message here…"
            />
          </div>
          <Button
            onClick={handleSend}
            disabled={sending}
            className="w-full bg-brand-navy hover:bg-brand-blue"
          >
            {sending ? "Sending…" : "Send Email"}
          </Button>

          {previousEmails.length > 0 && (
            <div className="mt-6 border-t pt-4">
              <button
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-brand-navy"
                onClick={() => setShowHistory(!showHistory)}
              >
                {showHistory ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Previous emails ({previousEmails.length})
              </button>
              {showHistory && (
                <ul className="mt-3 space-y-3">
                  {previousEmails.map((e) => (
                    <li
                      key={e.id}
                      className="rounded-lg border bg-gray-50 p-3 text-xs"
                    >
                      <p className="font-medium">{e.subject}</p>
                      <p className="text-gray-400 mt-0.5">
                        {formatDateTime(e.sent_at)}
                      </p>
                      <p className="text-gray-600 mt-2 whitespace-pre-wrap">
                        {e.body}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
