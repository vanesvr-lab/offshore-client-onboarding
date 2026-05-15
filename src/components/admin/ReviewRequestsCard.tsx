"use client";

// B-118 — Right-rail "Review Requests" card. Lists open peer/manager
// review requests for this service (both ones the current admin sent
// and ones they were invited on). Closed history collapsed at the bottom.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Users, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  SECTION_LABELS,
  isTopLevelSectionKey,
  PEOPLE_KYC_PROFILE_KEY,
} from "@/lib/review-requests/sections";

// Lightweight relative-time formatter; no dep on date-fns. "5m ago",
// "2h ago", "3d ago", etc. Past-only — caller only ever feeds it dates
// strictly older than now.
function formatDistanceToNow(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return "just now";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  const years = Math.floor(days / 365);
  return `${years}y`;
}
import type {
  HydratedReviewRequest,
  ReviewClosedReason,
} from "@/lib/review-requests/types";

interface Props {
  serviceId: string;
  currentUserId: string;
  requests: HydratedReviewRequest[];
  /** Profile name lookup so the People-KYC section row can show "Jane Doe"
   *  instead of a UUID. */
  profileNamesById: Record<string, string>;
  onOpenModal: () => void;
  /** Splice the post-close hydrated request back into state. */
  onClosed?: (
    request: HydratedReviewRequest,
    communications: Record<string, unknown>[],
  ) => void;
  /** Optional jump target — when the URL has ?reviewRequest=<id> the
   *  parent can highlight that row. */
  highlightRequestId?: string | null;
}

function sectionLabel(
  section: HydratedReviewRequest["sections"][number],
  profileNamesById: Record<string, string>,
): string {
  if (section.section_key === PEOPLE_KYC_PROFILE_KEY) {
    const name = section.profile_id
      ? profileNamesById[section.profile_id] ?? "Profile"
      : "Profile";
    return `People & KYC — ${name}`;
  }
  if (isTopLevelSectionKey(section.section_key)) {
    return SECTION_LABELS[section.section_key];
  }
  return section.section_key;
}

export function ReviewRequestsCard({
  serviceId,
  currentUserId,
  requests,
  profileNamesById,
  onOpenModal,
  onClosed,
  highlightRequestId,
}: Props) {
  const openRequests = useMemo(
    () => requests.filter((r) => r.status === "open"),
    [requests],
  );
  const closedRequests = useMemo(
    () => requests.filter((r) => r.status === "closed"),
    [requests],
  );
  const [showClosed, setShowClosed] = useState(false);
  const [closingId, setClosingId] = useState<string | null>(null);

  async function closeRequest(req: HydratedReviewRequest, reason: ReviewClosedReason) {
    setClosingId(req.id);
    try {
      const res = await fetch(
        `/api/admin/services/${serviceId}/review-requests/${req.id}/close`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reason }),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        request?: HydratedReviewRequest;
        communications?: Record<string, unknown>[];
      };
      if (!res.ok || !data.request) {
        throw new Error(data.error ?? "Failed to close request");
      }
      onClosed?.(data.request, data.communications ?? []);
      toast.success(
        reason === "reviewer_marked"
          ? "Marked as reviewed."
          : "Review request closed.",
        { position: "top-right" },
      );
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to close request",
        { position: "top-right" },
      );
    } finally {
      setClosingId(null);
    }
  }

  return (
    <div className="bg-white border rounded-xl px-4 py-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-gray-400" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Peer / Manager Review
          </p>
          {openRequests.length > 0 && (
            <span className="text-xs font-medium text-brand-navy bg-blue-50 px-1.5 py-0.5 rounded-full">
              {openRequests.length}
            </span>
          )}
        </div>
      </div>

      <Button
        onClick={onOpenModal}
        className="w-full h-9 text-xs bg-brand-navy hover:bg-brand-blue text-white gap-1.5"
      >
        <Plus className="h-3.5 w-3.5" />
        Request Peer / Manager Review
      </Button>

      {openRequests.length === 0 ? (
        <p className="text-xs text-gray-400">
          No open review requests on this service.
        </p>
      ) : (
        <ul className="space-y-2">
          {openRequests.map((req) => {
            const isRequester = req.requester_id === currentUserId;
            const isInvitedReviewer = req.reviewers.some(
              (r) => r.admin_id === currentUserId,
            );
            const highlight = highlightRequestId === req.id;
            return (
              <li
                key={req.id}
                className={`border rounded-md p-2.5 text-xs space-y-1 ${
                  highlight ? "ring-2 ring-brand-navy" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {isRequester
                        ? "You requested"
                        : `${req.requester_name ?? "Someone"} requested`}
                    </p>
                    <p className="text-gray-500">
                      {formatDistanceToNow(req.created_at)} ago
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-semibold uppercase bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full">
                    Open
                  </span>
                </div>
                <p className="text-gray-700 whitespace-pre-wrap break-words">
                  {req.note}
                </p>
                <p className="text-gray-500">
                  <span className="font-medium">Reviewers:</span>{" "}
                  {req.reviewers
                    .map((r) => r.full_name ?? r.email ?? "Unknown")
                    .join(", ") || "—"}
                </p>
                <details className="text-gray-500">
                  <summary className="cursor-pointer select-none hover:text-gray-700">
                    {req.sections.length} section
                    {req.sections.length === 1 ? "" : "s"}
                  </summary>
                  <ul className="mt-1 pl-3 list-disc">
                    {req.sections.map((s) => (
                      <li key={s.id}>{sectionLabel(s, profileNamesById)}</li>
                    ))}
                  </ul>
                </details>
                <div className="flex justify-end gap-2 pt-1">
                  {isInvitedReviewer && (
                    <Button
                      size="sm"
                      className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                      disabled={closingId === req.id}
                      onClick={() => void closeRequest(req, "reviewer_marked")}
                    >
                      Mark as reviewed
                    </Button>
                  )}
                  {isRequester && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 px-2 text-xs"
                      disabled={closingId === req.id}
                      onClick={() =>
                        void closeRequest(req, "requester_force_closed")
                      }
                    >
                      Close
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {closedRequests.length > 0 && (
        <div className="pt-2 border-t">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-700"
            onClick={() => setShowClosed((v) => !v)}
          >
            {showClosed ? "Hide" : "Show"} closed history ({closedRequests.length})
          </button>
          {showClosed && (
            <ul className="mt-2 space-y-1.5">
              {closedRequests.map((req) => (
                <li
                  key={req.id}
                  className="border rounded-md p-2 text-xs text-gray-600"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="truncate">
                      {req.requester_id === currentUserId
                        ? "You requested"
                        : `${req.requester_name ?? "Someone"} requested`}
                    </span>
                    <span className="shrink-0 text-[10px] uppercase bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded-full">
                      Closed
                    </span>
                  </div>
                  <p className="text-gray-500 mt-0.5">
                    {req.closed_reason === "reviewer_marked"
                      ? `Reviewed by ${req.closed_by_name ?? "a reviewer"}`
                      : `Closed by ${req.closed_by_name ?? "requester"}`}
                    {req.closed_at && ` · ${formatDistanceToNow(req.closed_at)} ago`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
