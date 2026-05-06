"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { SectionReviewBadge } from "./SectionReviewBadge";
import { cn } from "@/lib/utils";
import type { ApplicationSectionReview } from "@/types";

interface Props {
  reviews: ApplicationSectionReview[];
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diff = Math.max(0, now - then);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

export function SectionNotesHistory({ reviews }: Props) {
  const [open, setOpen] = useState(false);
  if (!reviews || reviews.length === 0) return null;

  return (
    <div className="mt-4 border-t pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1 text-xs font-medium text-gray-600 hover:text-gray-900"
      >
        {open ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        Admin notes ({reviews.length})
      </button>

      {open ? (
        <ul className="mt-3 space-y-3">
          {reviews.map((r) => {
            const reviewer = r.profiles?.full_name?.trim() || "Admin";
            return (
              <li
                key={r.id}
                className={cn(
                  "rounded-md border border-gray-200 bg-gray-50/60 p-3 text-xs",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <SectionReviewBadge status={r.status} />
                  <span className="text-gray-500">
                    {reviewer}{" "}
                    <span
                      className="text-gray-400"
                      title={new Date(r.reviewed_at).toLocaleString()}
                    >
                      · {formatRelative(r.reviewed_at)}
                    </span>
                  </span>
                </div>
                {r.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-gray-700">
                    {r.notes}
                  </p>
                ) : (
                  <p className="mt-2 italic text-gray-400">No notes</p>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
