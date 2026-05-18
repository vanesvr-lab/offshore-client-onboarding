"use client";

// B-118 — Sticky top banner shown to a reviewer when they have at least
// one open review request on this service. Persists until the reviewer
// acts or the request closes via another path.

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Inbox, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SECTION_LABELS,
  isTopLevelSectionKey,
  PEOPLE_KYC_PROFILE_KEY,
  sectionAnchorHref,
} from "@/lib/review-requests/sections";
import type {
  HydratedReviewRequest,
  ReviewClosedReason,
} from "@/lib/review-requests/types";

interface Props {
  serviceId: string;
  currentUserId: string;
  requests: HydratedReviewRequest[];
  /** When the URL had `?reviewRequest=<id>`, prefer surfacing that one
   *  (scroll-anchor on mount). */
  highlightRequestId?: string | null;
  /** Splice the post-close hydrated request back into state. */
  onClosed?: (
    request: HydratedReviewRequest,
    communications: Record<string, unknown>[],
  ) => void;
  profileNamesById: Record<string, string>;
}

function sectionLabel(
  section: HydratedReviewRequest["sections"][number],
  profileNamesById: Record<string, string>,
): string {
  if (isTopLevelSectionKey(section.section_key)) {
    return SECTION_LABELS[section.section_key];
  }
  if (section.section_key === PEOPLE_KYC_PROFILE_KEY) {
    const name = section.profile_id
      ? profileNamesById[section.profile_id] ?? "Profile"
      : "Profile";
    return name;
  }
  return section.section_key;
}

export function ReviewRequestBanner({
  serviceId,
  currentUserId,
  requests,
  highlightRequestId,
  onClosed,
  profileNamesById,
}: Props) {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const [noteExpanded, setNoteExpanded] = useState(false);

  // Filter to open requests where current user is invited as a reviewer.
  const eligible = useMemo(
    () =>
      requests.filter(
        (r) =>
          r.status === "open" &&
          r.reviewers.some((rv) => rv.admin_id === currentUserId),
      ),
    [requests, currentUserId],
  );

  // Pick the highlighted one if present, otherwise the most recent.
  const active = useMemo(() => {
    if (eligible.length === 0) return null;
    if (highlightRequestId) {
      const match = eligible.find((r) => r.id === highlightRequestId);
      if (match) return match;
    }
    return eligible[0];
  }, [eligible, highlightRequestId]);

  // Scroll banner into view on mount when the URL pointed at a request.
  useEffect(() => {
    if (highlightRequestId && bannerRef.current) {
      bannerRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [highlightRequestId]);

  if (!active) return null;

  async function markReviewed(req: HydratedReviewRequest) {
    setClosing(true);
    try {
      const res = await fetch(
        `/api/admin/services/${serviceId}/review-requests/${req.id}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reason: "reviewer_marked" as ReviewClosedReason,
          }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        request?: HydratedReviewRequest;
        communications?: Record<string, unknown>[];
      };
      if (!res.ok || !data.request) {
        throw new Error(data.error ?? "Failed to mark as reviewed");
      }
      onClosed?.(data.request, data.communications ?? []);
      toast.success("Marked as reviewed.", { position: "top-right" });
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to mark as reviewed",
        { position: "top-right" },
      );
    } finally {
      setClosing(false);
    }
  }

  const moreCount = eligible.length - 1;
  const noteShort = active.note.length > 220 ? active.note.slice(0, 220) + "…" : active.note;
  const showExpand = active.note.length > 220 && !noteExpanded;

  return (
    <div
      ref={bannerRef}
      className="sticky top-0 z-30 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <Inbox className="h-5 w-5 text-amber-700 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 space-y-1">
          <p className="text-sm font-semibold text-amber-900">
            {active.requester_name ?? "Someone"} asked you to review this service
            {moreCount > 0 && (
              <span className="text-xs font-normal text-amber-700 ml-2">
                (+{moreCount} more)
              </span>
            )}
          </p>
          <p className="text-sm text-amber-900 whitespace-pre-wrap">
            {noteExpanded ? active.note : noteShort}
            {showExpand && (
              <button
                type="button"
                className="ml-1 underline text-amber-900 hover:text-amber-700"
                onClick={() => setNoteExpanded(true)}
              >
                Show more
              </button>
            )}
          </p>
          {active.sections.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {active.sections.map((s) => {
                const href = sectionAnchorHref(s);
                const label = sectionLabel(s, profileNamesById);
                if (!href) {
                  return (
                    <span
                      key={s.id}
                      className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800"
                    >
                      {label}
                    </span>
                  );
                }
                return (
                  <a
                    key={s.id}
                    href={href}
                    className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 hover:bg-amber-200"
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          )}
        </div>
        <Button
          size="sm"
          className="bg-green-600 hover:bg-green-700 text-white gap-1.5 shrink-0"
          disabled={closing}
          onClick={() => void markReviewed(active)}
        >
          <Check className="h-3.5 w-3.5" />
          Mark as reviewed
        </Button>
      </div>
    </div>
  );
}
