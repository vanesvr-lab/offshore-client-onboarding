"use client";

import { useState } from "react";
import { CheckCircle2, AlertTriangle, Clock, Sparkles, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApplicationStatus, VerificationStatus } from "@/types";

interface Requirement {
  id: string;
  name: string;
  category: string;
}

interface Upload {
  id: string;
  requirement_id: string | null;
  verification_status: VerificationStatus;
  verification_result: unknown;
}

interface ApplicationData {
  business_name: string | null;
  status: ApplicationStatus;
  admin_notes: string | null;
}

interface ApplicationStatusPanelProps {
  application: ApplicationData;
  requirements: Requirement[];
  uploads: Upload[];
}

function getAssistantMessage(
  status: ApplicationStatus,
  flaggedCount: number
): string {
  switch (status) {
    case "draft":
      return "The client hasn't started uploading yet. Want me to send a gentle reminder?";
    case "submitted":
      return "Application just landed in the queue. I can run a first-pass review and highlight anything that needs your attention. Want me to start?";
    case "in_review":
      return flaggedCount > 0
        ? `I flagged ${flaggedCount} document${flaggedCount > 1 ? "s" : ""} that need your review. Want me to summarize the issues?`
        : "All documents look compliant so far. Let me know if you'd like a summary report or want me to draft any client communications.";
    case "pending_action":
      return "Waiting on the client. I can send a follow-up reminder if it's been more than 3 days. Want me to check?";
    case "verification":
      return "All documents are verified. Ready to recommend approval?";
    case "approved":
      return "Approved ✓  I can draft the welcome email and onboarding kit. Want me to prepare it?";
    case "rejected":
      return "Application closed. I can archive the file and notify the client team.";
    default:
      return "How can I assist with this application?";
  }
}

type RowStatus = "complete" | "action" | "pending";

function getRowStatus(vs: VerificationStatus | null): RowStatus {
  if (vs === "verified") return "complete";
  if (vs === "flagged" || vs === "manual_review") return "action";
  return "pending";
}

function getRowLabel(vs: VerificationStatus | null): string {
  if (vs === "verified") return "Verified";
  if (vs === "flagged") return "Flagged";
  if (vs === "manual_review") return "Review";
  if (vs === "pending") return "Processing";
  return "Awaiting";
}

function getRowSubtitle(vs: VerificationStatus | null, reqName: string): string {
  if (vs === "verified") return `${reqName} — valid, format confirmed`;
  if (vs === "flagged") return `${reqName} — discrepancy detected`;
  if (vs === "manual_review") return `${reqName} — manual review required`;
  if (vs === "pending") return `${reqName} — AI processing`;
  return `${reqName} — awaiting upload`;
}

export function ApplicationStatusPanel({
  application,
  requirements,
  uploads,
}: ApplicationStatusPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Build display rows
  const rows = requirements.map((req) => {
    const upload = uploads.find((u) => u.requirement_id === req.id) ?? null;
    const vs = upload?.verification_status ?? null;
    const status = getRowStatus(vs);
    return { req, vs, status };
  });

  const orphanRows =
    requirements.length === 0
      ? uploads.map((u) => ({
          req: { id: u.id, name: "Document", category: "" },
          vs: u.verification_status,
          status: getRowStatus(u.verification_status),
        }))
      : [];

  const displayRows = [...rows, ...orphanRows];

  // Summary counts for collapsed header
  const verifiedCount = displayRows.filter((r) => r.status === "complete").length;
  const flaggedCount = displayRows.filter((r) => r.status === "action").length;
  const awaitingCount = displayRows.filter((r) => r.status === "pending").length;

  const summaryParts: string[] = [];
  if (verifiedCount > 0) summaryParts.push(`${verifiedCount} verified`);
  if (flaggedCount > 0) summaryParts.push(`${flaggedCount} flagged`);
  if (awaitingCount > 0) summaryParts.push(`${awaitingCount} awaiting`);
  const summaryLine = summaryParts.join(" · ") || "No documents yet";

  const assistantMsg = getAssistantMessage(application.status, flaggedCount);

  return (
    <div className="rounded-xl bg-white border border-gray-200 shadow-sm overflow-hidden">
      {/* Header — always visible, click to toggle.
          Title color matches Stage Management card title (text-brand-navy text-base);
          summary line size matches the "Move to stage" label (text-sm font-medium text-gray-700). */}
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-start justify-between px-5 py-4 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="text-brand-navy text-base font-semibold leading-tight truncate">
            Application Health
          </p>
          <p className="text-gray-600 text-xs mt-0.5 truncate">
            {application.business_name || "Application"}
          </p>
          {!isOpen && (
            <p className="text-sm font-medium text-gray-700 mt-2">
              {summaryLine}
            </p>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-5 w-5 text-gray-500 shrink-0 mt-1 ml-2 transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>

      {/* Collapsible body */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300",
          isOpen ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}
      >
        {/* Document status rows */}
        <div className="divide-y divide-gray-100">
          {displayRows.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-gray-400 text-xs">No document requirements defined</p>
            </div>
          ) : (
            displayRows.map(({ req, vs, status }) => (
              <div
                key={req.id}
                className={cn(
                  "relative flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors",
                  status === "action" && "border-l-2 border-brand-accent"
                )}
              >
                {/* Status icon */}
                <div
                  className={cn(
                    "h-6 w-6 rounded-full flex items-center justify-center shrink-0",
                    status === "complete" && "bg-brand-success/10",
                    status === "action" && "bg-brand-accent/10",
                    status === "pending" && "bg-gray-200"
                  )}
                >
                  {status === "complete" && (
                    <CheckCircle2 className="h-3.5 w-3.5 text-brand-success" />
                  )}
                  {status === "action" && (
                    <AlertTriangle className="h-3.5 w-3.5 text-brand-accent" />
                  )}
                  {status === "pending" && (
                    <Clock className="h-3.5 w-3.5 text-gray-400" />
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <p className="text-gray-900 text-sm font-medium truncate">{req.name}</p>
                  <p className="text-gray-500 text-xs truncate mt-0.5">
                    {getRowSubtitle(vs, req.name)}
                  </p>
                </div>

                {/* Right badge */}
                <div className="shrink-0">
                  {status === "complete" && (
                    <CheckCircle2 className="h-4 w-4 text-brand-success" />
                  )}
                  {status === "action" && (
                    <span className="text-[10px] bg-brand-accent text-brand-dark font-semibold px-1.5 py-0.5 rounded">
                      Action
                    </span>
                  )}
                  {status === "pending" && (
                    <span className="text-[10px] bg-gray-200 text-gray-500 px-1.5 py-0.5 rounded">
                      {getRowLabel(vs)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Elarix AI assistant card */}
        <div className="px-4 py-4 border-t border-gray-100 bg-amber-50 border-b border-amber-100">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-full bg-brand-accent flex items-center justify-center shrink-0">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-amber-700 text-xs font-medium mb-1">Elarix AI</p>
              <p className="text-gray-700 text-xs leading-relaxed">{assistantMsg}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
