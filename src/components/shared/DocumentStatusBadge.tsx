"use client";

import { cn } from "@/lib/utils";
import type { AdminReviewStatus, AiVerificationStatus } from "@/types";

interface Props {
  aiStatus?: AiVerificationStatus | string | null;
  adminStatus?: AdminReviewStatus | "pending" | string | null;
  /** When true, render just two colored dots with a tooltip. */
  compact?: boolean;
  className?: string;
}

interface BadgeSpec {
  label: string;
  classes: string;
  dot: string;
}

function aiSpec(status: string | null | undefined): BadgeSpec {
  switch (status) {
    case "verified":
      return { label: "AI verified", classes: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" };
    case "flagged":
      return { label: "AI flagged", classes: "bg-amber-100 text-amber-700", dot: "bg-amber-500" };
    case "manual_review":
      return { label: "Needs review", classes: "bg-amber-100 text-amber-700", dot: "bg-amber-500" };
    case "pending":
      return {
        label: "AI running",
        classes: "bg-blue-100 text-blue-700 animate-pulse",
        dot: "bg-blue-500 animate-pulse",
      };
    case "not_run":
      return { label: "AI skipped", classes: "bg-gray-100 text-gray-600", dot: "bg-gray-400" };
    default:
      return { label: "AI —", classes: "bg-gray-100 text-gray-500", dot: "bg-gray-300" };
  }
}

function adminSpec(status: string | null | undefined): BadgeSpec {
  // Treat legacy 'pending' rows as 'pending_review' for display.
  const normalized = status === "pending" ? "pending_review" : status;
  switch (normalized) {
    case "approved":
      return { label: "Admin approved", classes: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" };
    case "rejected":
      return { label: "Admin rejected", classes: "bg-red-100 text-red-700", dot: "bg-red-500" };
    case "pending_review":
      return {
        label: "Pending admin review",
        classes: "bg-orange-100 text-orange-700",
        dot: "bg-orange-500",
      };
    default:
      return { label: "Admin —", classes: "bg-gray-100 text-gray-500", dot: "bg-gray-300" };
  }
}

function Pill({ spec }: { spec: BadgeSpec }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        spec.classes
      )}
    >
      <span className={cn("inline-block h-1.5 w-1.5 rounded-full", spec.dot)} />
      {spec.label}
    </span>
  );
}

export function DocumentStatusBadge({ aiStatus, adminStatus, compact, className }: Props) {
  const ai = aiSpec(aiStatus ?? null);
  const admin = adminSpec(adminStatus ?? null);

  if (compact) {
    return (
      <span
        className={cn("inline-flex items-center gap-1.5", className)}
        title={`${ai.label} · ${admin.label}`}
      >
        <span className={cn("h-2 w-2 rounded-full", ai.dot)} />
        <span className={cn("h-2 w-2 rounded-full", admin.dot)} />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
      <Pill spec={ai} />
      <Pill spec={admin} />
    </span>
  );
}

export default DocumentStatusBadge;
