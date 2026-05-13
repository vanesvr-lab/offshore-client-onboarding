"use client";

import { CheckCircle2, Flag, XCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionReviewStatus } from "@/types";

interface Props {
  status: SectionReviewStatus | null;
  className?: string;
  // B-079 — when rendered on a dark band (top-level step header), use a
  // translucent white treatment so all four states stay legible without
  // bleeding through to the navy underneath.
  tone?: "default" | "on-dark";
}

const VARIANTS: Record<
  SectionReviewStatus | "none",
  { label: string; classes: string; Icon: typeof CheckCircle2 }
> = {
  reviewed: {
    label: "Reviewed",
    classes: "bg-green-100 text-green-700",
    Icon: CheckCircle2,
  },
  flagged: {
    label: "Flagged",
    classes: "bg-amber-100 text-amber-700",
    Icon: Flag,
  },
  rejected: {
    label: "Rejected",
    classes: "bg-red-100 text-red-700",
    Icon: XCircle,
  },
  none: {
    label: "Not reviewed",
    classes: "bg-gray-100 text-gray-500",
    Icon: Circle,
  },
};

const ON_DARK_CLASSES = "bg-white/15 text-white border border-white/30";

export function SectionReviewBadge({ status, className, tone = "default" }: Props) {
  const variant = VARIANTS[status ?? "none"];
  const Icon = variant.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tone === "on-dark" ? ON_DARK_CLASSES : variant.classes,
        className,
      )}
    >
      <Icon className="size-3" />
      {variant.label}
    </span>
  );
}
