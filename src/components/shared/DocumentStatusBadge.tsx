"use client";

import type { ComponentType, SVGProps } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  ShieldOff,
  Clock,
  UserCheck,
  UserX,
  Loader2,
  HelpCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminReviewStatus, AiVerificationStatus } from "@/types";

interface Props {
  aiStatus?: AiVerificationStatus | string | null;
  adminStatus?: AdminReviewStatus | "pending" | string | null;
  /** When true, render just the two icons with tooltips. */
  compact?: boolean;
  className?: string;
}

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

interface BadgeSpec {
  label: string;
  icon: LucideIcon;
  /** Icon/text color for compact mode. */
  iconClass: string;
  /** Pill background + text for expanded mode. */
  pillClass: string;
  /** Whether the icon should spin. */
  spin?: boolean;
}

function aiSpec(status: string | null | undefined): BadgeSpec {
  switch (status) {
    case "verified":
      return {
        label: "AI verified",
        icon: ShieldCheck,
        iconClass: "text-emerald-600",
        pillClass: "bg-emerald-100 text-emerald-700",
      };
    case "flagged":
      return {
        label: "AI flagged issues",
        icon: ShieldAlert,
        iconClass: "text-amber-600",
        pillClass: "bg-amber-100 text-amber-700",
      };
    case "manual_review":
      return {
        label: "Needs human review",
        icon: ShieldQuestion,
        iconClass: "text-amber-600",
        pillClass: "bg-amber-100 text-amber-700",
      };
    case "pending":
      return {
        label: "AI checking…",
        icon: Loader2,
        iconClass: "text-blue-600",
        pillClass: "bg-blue-100 text-blue-700",
        spin: true,
      };
    case "not_run":
      return {
        label: "AI skipped",
        icon: ShieldOff,
        iconClass: "text-gray-400",
        pillClass: "bg-gray-100 text-gray-600",
      };
    default:
      return {
        label: "AI status unknown",
        icon: HelpCircle,
        iconClass: "text-gray-300",
        pillClass: "bg-gray-100 text-gray-500",
      };
  }
}

function adminSpec(status: string | null | undefined): BadgeSpec {
  const normalized = status === "pending" ? "pending_review" : status;
  switch (normalized) {
    case "approved":
      return {
        label: "Admin approved",
        icon: UserCheck,
        iconClass: "text-emerald-600",
        pillClass: "bg-emerald-100 text-emerald-700",
      };
    case "rejected":
      return {
        label: "Admin rejected",
        icon: UserX,
        iconClass: "text-red-600",
        pillClass: "bg-red-100 text-red-700",
      };
    case "pending_review":
      return {
        label: "Pending admin review",
        icon: Clock,
        iconClass: "text-orange-500",
        pillClass: "bg-orange-100 text-orange-700",
      };
    default:
      return {
        label: "Admin status unknown",
        icon: HelpCircle,
        iconClass: "text-gray-300",
        pillClass: "bg-gray-100 text-gray-500",
      };
  }
}

function IconPill({ spec }: { spec: BadgeSpec }) {
  const Icon = spec.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        spec.pillClass
      )}
    >
      <Icon className={cn("h-3 w-3", spec.spin && "animate-spin")} />
      {spec.label}
    </span>
  );
}

function IconOnly({ spec }: { spec: BadgeSpec }) {
  const Icon = spec.icon;
  return (
    <span
      className="inline-flex items-center"
      title={spec.label}
      aria-label={spec.label}
    >
      <Icon className={cn("h-3.5 w-3.5", spec.iconClass, spec.spin && "animate-spin")} />
    </span>
  );
}

export function DocumentStatusBadge({ aiStatus, adminStatus, compact, className }: Props) {
  const ai = aiSpec(aiStatus ?? null);
  const admin = adminSpec(adminStatus ?? null);

  if (compact) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <IconOnly spec={ai} />
        <IconOnly spec={admin} />
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5 flex-wrap", className)}>
      <IconPill spec={ai} />
      <IconPill spec={admin} />
    </span>
  );
}

export default DocumentStatusBadge;
