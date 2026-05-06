"use client";

import { CheckCircle2, Flag, XCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionReviewStatus } from "@/types";

interface Props {
  status: SectionReviewStatus | null;
  className?: string;
}

const VARIANTS: Record<
  SectionReviewStatus | "none",
  { label: string; classes: string; Icon: typeof CheckCircle2 }
> = {
  approved: {
    label: "Approved",
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

export function SectionReviewBadge({ status, className }: Props) {
  const variant = VARIANTS[status ?? "none"];
  const Icon = variant.Icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        variant.classes,
        className,
      )}
    >
      <Icon className="size-3" />
      {variant.label}
    </span>
  );
}
