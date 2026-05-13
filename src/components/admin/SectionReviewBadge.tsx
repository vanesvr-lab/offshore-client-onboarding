"use client";

import { CheckCircle2, Flag, XCircle, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SectionReviewStatus } from "@/types";

interface Props {
  status: SectionReviewStatus | null;
  className?: string;
  // B-079 — when rendered on a dark band (top-level step header), use a
  // translucent white treatment so all four states stay legible without
  // bleeding through to the navy underneath.
  tone?: "default" | "on-dark";
  // B-100 — tooltip data. When `reviewedAt` is set the badge becomes a
  // Tooltip trigger ("<verb> on <long date> by <reviewer> — <note…>").
  // Callers should pass the most-recent `application_section_reviews`
  // row for the section. Leave all three undefined to render the bare
  // pill (which is what the "Not reviewed" state always does).
  reviewedAt?: string | null;
  reviewerName?: string | null;
  notes?: string | null;
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

const NOTE_PREVIEW_LIMIT = 80;
const VERB_BY_STATUS: Record<SectionReviewStatus, string> = {
  reviewed: "Reviewed",
  flagged: "Flagged",
  rejected: "Rejected",
};

function buildTooltip(
  status: SectionReviewStatus | null,
  reviewedAt?: string | null,
  reviewerName?: string | null,
  notes?: string | null,
): string | null {
  if (!status || !reviewedAt) return null;
  const verb = VERB_BY_STATUS[status];
  const parsed = new Date(reviewedAt);
  if (Number.isNaN(parsed.getTime())) return null;
  const date = parsed.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const who = reviewerName?.trim() ? reviewerName.trim() : "Unknown reviewer";
  const trimmed = (notes ?? "").trim();
  const preview =
    trimmed.length > NOTE_PREVIEW_LIMIT
      ? `${trimmed.slice(0, NOTE_PREVIEW_LIMIT).trimEnd()}…`
      : trimmed;
  return preview
    ? `${verb} on ${date} by ${who} — ${preview}`
    : `${verb} on ${date} by ${who}`;
}

export function SectionReviewBadge({
  status,
  className,
  tone = "default",
  reviewedAt,
  reviewerName,
  notes,
}: Props) {
  const variant = VARIANTS[status ?? "none"];
  const Icon = variant.Icon;
  const tooltipText = buildTooltip(status, reviewedAt, reviewerName, notes);
  const badge = (
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
  if (!tooltipText) return badge;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span
              aria-label={tooltipText}
              className="inline-flex"
            >
              {badge}
            </span>
          }
        />
        <TooltipContent>{tooltipText}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
