"use client";

// B-118 — Right-rail "Review Requests" card. Lists open peer/manager
// review requests for this service (both ones the current admin sent
// and ones they were invited on). Closed history collapsed at the bottom.
//
// B-124 — body redesigned as a 3-column table (Requester · Reviewers +
// sections · Actions). Detail (note + full section list + audit
// timestamps) now opens in its own modal, triggered by an explicit eye
// icon — the previous "click the row" affordance is gone. Closed
// history moves out of an inline collapsible disclosure into its own
// "View closed history (N)" popup, opened from a header link.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Eye, Plus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SECTION_LABELS,
  isTopLevelSectionKey,
  PEOPLE_KYC_PROFILE_KEY,
  sectionAnchorHref,
} from "@/lib/review-requests/sections";
import { useHasFlag } from "@/lib/admin-permissions-context";
import type {
  HydratedReviewRequest,
  ReviewClosedReason,
} from "@/lib/review-requests/types";

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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// B-124 — paginate the closed-history popup at 50 rows to keep the
// initial render cheap. Pagination beyond that is tech-debt for the
// day services accumulate enough requests for it to matter.
const CLOSED_HISTORY_CAP = 50;

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
  /** Optional handler invoked when the reviewer clicks a section inside
   *  the detail modal. Receives the bare anchor id (e.g. "step-company-setup")
   *  and is expected to (a) expand that section if collapsed and
   *  (b) scroll it into view. The card calls `onClose()` on the modal
   *  first, then delegates here after a short delay so Radix releases
   *  the body scroll lock. */
  onJumpToSection?: (anchorId: string) => void;
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

function requesterLabel(
  req: HydratedReviewRequest,
  currentUserId: string,
): string {
  if (req.requester_id === currentUserId) return "You";
  return req.requester_name ?? "Someone";
}

function reviewersTooltip(req: HydratedReviewRequest): string {
  return req.reviewers
    .map((r) => r.full_name ?? r.email ?? "Unknown")
    .join(", ");
}

export function ReviewRequestsCard({
  serviceId,
  currentUserId,
  requests,
  profileNamesById,
  onOpenModal,
  onClosed,
  highlightRequestId,
  onJumpToSection,
}: Props) {
  const openRequests = useMemo(
    () => requests.filter((r) => r.status === "open"),
    [requests],
  );
  const closedRequests = useMemo(
    () =>
      requests
        .filter((r) => r.status === "closed")
        .sort((a, b) =>
          (b.closed_at ?? b.created_at).localeCompare(a.closed_at ?? a.created_at),
        ),
    [requests],
  );
  const [showClosedDialog, setShowClosedDialog] = useState(false);
  const [detailRequest, setDetailRequest] = useState<HydratedReviewRequest | null>(
    null,
  );
  const [closingId, setClosingId] = useState<string | null>(null);
  // B-127 — Mark-as-reviewed (the small green check icon + the detail
  // dialog's Mark Reviewed button) is a review action.
  const canReview = useHasFlag("can_review");

  async function closeRequest(
    req: HydratedReviewRequest,
    reason: ReviewClosedReason,
  ) {
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
      // If the detail dialog is open for the request that just closed,
      // close it — the parent's onClosed splice will rebuild the row
      // shape, so re-opening from the popup gets the fresh state.
      setDetailRequest((cur) => (cur?.id === req.id ? null : cur));
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
        <div className="flex items-center gap-2 min-w-0">
          <Users className="h-4 w-4 text-gray-400 shrink-0" />
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Peer / Manager Review
          </p>
          {openRequests.length > 0 && (
            <span className="text-xs font-medium text-brand-navy bg-blue-50 px-1.5 py-0.5 rounded-full shrink-0">
              {openRequests.length}
            </span>
          )}
        </div>
        {closedRequests.length > 0 && (
          <button
            type="button"
            onClick={() => setShowClosedDialog(true)}
            className="text-[10px] text-gray-500 hover:text-gray-700 underline-offset-2 hover:underline shrink-0"
          >
            View closed history ({closedRequests.length})
          </button>
        )}
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
        <table className="w-full text-xs">
          <tbody>
            {openRequests.map((req) => {
              const isRequester = req.requester_id === currentUserId;
              const isInvitedReviewer = req.reviewers.some(
                (r) => r.admin_id === currentUserId,
              );
              const highlight = highlightRequestId === req.id;
              const sectionCount = req.sections.length;
              return (
                <tr
                  key={req.id}
                  className={`border-t first:border-t-0 align-middle ${
                    highlight ? "bg-amber-50" : ""
                  }`}
                >
                  {/* Col 1 — Requester + relative time */}
                  <td className="py-1.5 pr-2">
                    <div className="leading-tight">
                      <p className="font-medium text-gray-900 truncate">
                        {requesterLabel(req, currentUserId)}
                      </p>
                      <p className="text-[10px] text-gray-500">
                        {formatDistanceToNow(req.created_at)} ago
                      </p>
                    </div>
                  </td>

                  {/* Col 2 — Reviewers + sections (compact, hover tooltip) */}
                  <td
                    className="py-1.5 pr-2 text-gray-600"
                    title={reviewersTooltip(req)}
                  >
                    {req.reviewers.length} reviewer
                    {req.reviewers.length === 1 ? "" : "s"} · {sectionCount} section
                    {sectionCount === 1 ? "" : "s"}
                  </td>

                  {/* Col 3 — Actions: explicit eye + contextual close/mark */}
                  <td className="py-1.5 pl-1">
                    <div className="flex items-center justify-end gap-1">
                      <IconAction
                        label="View details"
                        onClick={() => setDetailRequest(req)}
                      >
                        <Eye className="h-4 w-4" />
                      </IconAction>
                      {isInvitedReviewer && (
                        <IconAction
                          label={
                            canReview
                              ? "Mark as reviewed"
                              : "Your role can't sign off on reviews."
                          }
                          tone="emerald"
                          disabled={closingId === req.id || !canReview}
                          onClick={() => void closeRequest(req, "reviewer_marked")}
                        >
                          <Check className="h-4 w-4" />
                        </IconAction>
                      )}
                      {isRequester && (
                        <IconAction
                          label="Close request"
                          tone="gray"
                          disabled={closingId === req.id}
                          onClick={() =>
                            void closeRequest(req, "requester_force_closed")
                          }
                        >
                          <X className="h-4 w-4" />
                        </IconAction>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Detail modal — opened from eye icon. Renders the request note,
          full section list, reviewer chips, and close/mark affordances
          if the current admin is in the right role. */}
      {detailRequest && (
        <ReviewRequestDetailDialog
          open
          request={detailRequest}
          currentUserId={currentUserId}
          profileNamesById={profileNamesById}
          onClose={() => setDetailRequest(null)}
          closing={closingId === detailRequest.id}
          onMarkReviewed={() =>
            void closeRequest(detailRequest, "reviewer_marked")
          }
          onForceClose={() =>
            void closeRequest(detailRequest, "requester_force_closed")
          }
          onJumpToSection={onJumpToSection}
        />
      )}

      {/* Closed history popup — header-link triggered. Lists up to
          CLOSED_HISTORY_CAP rows; eye click opens the same detail
          dialog above. */}
      {showClosedDialog && (
        <ClosedHistoryDialog
          open
          requests={closedRequests}
          currentUserId={currentUserId}
          onClose={() => setShowClosedDialog(false)}
          onOpenDetail={(req) => setDetailRequest(req)}
          cap={CLOSED_HISTORY_CAP}
        />
      )}
    </div>
  );
}

// Small inline button used in the actions column. Keeps the visual
// language consistent: 24×24 hit target, neutral gray default, tinted
// hover, disabled goes muted.
function IconAction({
  label,
  onClick,
  disabled,
  tone,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  tone?: "emerald" | "gray";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "emerald"
      ? "text-emerald-600 hover:bg-emerald-50"
      : tone === "gray"
        ? "text-gray-500 hover:bg-gray-100"
        : "text-gray-500 hover:text-gray-900 hover:bg-gray-100";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${toneClass}`}
    >
      {children}
    </button>
  );
}

function ReviewRequestDetailDialog({
  open,
  request,
  currentUserId,
  profileNamesById,
  onClose,
  closing,
  onMarkReviewed,
  onForceClose,
  onJumpToSection,
}: {
  open: boolean;
  request: HydratedReviewRequest;
  currentUserId: string;
  profileNamesById: Record<string, string>;
  onClose: () => void;
  closing: boolean;
  onMarkReviewed: () => void;
  onForceClose: () => void;
  onJumpToSection?: (anchorId: string) => void;
}) {
  const isRequester = request.requester_id === currentUserId;
  const isInvitedReviewer = request.reviewers.some(
    (r) => r.admin_id === currentUserId,
  );
  const isOpen = request.status === "open";
  // B-127 — detail dialog also reads the can_review flag so its
  // "Mark as reviewed" button stays in sync with the table's icon.
  const canReview = useHasFlag("can_review");
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl w-[min(100vw-2rem,36rem)]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            Review request
            <span
              className={
                isOpen
                  ? "text-[10px] font-semibold uppercase bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full"
                  : "text-[10px] font-semibold uppercase bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full"
              }
            >
              {isOpen ? "Open" : "Closed"}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="text-xs text-gray-500 space-y-0.5">
          <p>
            Requested by{" "}
            <span className="text-gray-700">
              {isRequester ? "you" : request.requester_name ?? "Someone"}
            </span>{" "}
            on{" "}
            <span className="text-gray-700">
              {formatDate(request.created_at)}
            </span>{" "}
            ({formatDistanceToNow(request.created_at)} ago)
          </p>
          {request.closed_at && (
            <p>
              {request.closed_reason === "reviewer_marked"
                ? "Marked as reviewed"
                : "Force-closed"}{" "}
              by{" "}
              <span className="text-gray-700">
                {request.closed_by_name ?? "—"}
              </span>{" "}
              on{" "}
              <span className="text-gray-700">
                {formatDate(request.closed_at)}
              </span>
            </p>
          )}
        </div>

        <div className="text-xs space-y-1">
          <p className="text-gray-500 font-medium uppercase tracking-wider text-[10px]">
            Note
          </p>
          <p className="text-gray-700 whitespace-pre-wrap break-words">
            {request.note}
          </p>
        </div>

        <div className="text-xs space-y-1">
          <p className="text-gray-500 font-medium uppercase tracking-wider text-[10px]">
            Reviewers ({request.reviewers.length})
          </p>
          <p className="text-gray-700">
            {request.reviewers
              .map((r) => r.full_name ?? r.email ?? "Unknown")
              .join(", ") || "—"}
          </p>
        </div>

        <div className="text-xs space-y-1">
          <p className="text-gray-500 font-medium uppercase tracking-wider text-[10px]">
            Sections ({request.sections.length})
          </p>
          <ul className="list-disc pl-5 text-gray-700 space-y-0.5">
            {request.sections.map((s) => {
              const href = sectionAnchorHref(s);
              const label = sectionLabel(s, profileNamesById);
              if (!href) {
                return <li key={s.id}>{label}</li>;
              }
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      // Defer until the dialog has begun its close
                      // animation — Radix locks body scroll while open,
                      // so any open/scroll on the same tick is a no-op.
                      const targetId = href.replace(/^#/, "");
                      setTimeout(() => {
                        if (onJumpToSection) {
                          // Parent handler: expands the accordion section
                          // and scrolls in one go.
                          onJumpToSection(targetId);
                        } else {
                          // Fallback: scroll-only (used by surfaces that
                          // don't supply an expand handler).
                          document
                            .getElementById(targetId)
                            ?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }
                      }, 100);
                    }}
                    className="text-left text-brand-navy hover:text-brand-blue underline underline-offset-2 hover:no-underline"
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose} className="h-8 text-xs">
            Close
          </Button>
          {isOpen && isInvitedReviewer && (
            <Button
              onClick={onMarkReviewed}
              disabled={closing || !canReview}
              title={
                canReview
                  ? undefined
                  : "Your role can't sign off on reviews."
              }
              className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Mark as reviewed
            </Button>
          )}
          {isOpen && isRequester && (
            <Button
              onClick={onForceClose}
              disabled={closing}
              variant="outline"
              className="h-8 text-xs"
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Close request
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ClosedHistoryDialog({
  open,
  requests,
  currentUserId,
  onClose,
  onOpenDetail,
  cap,
}: {
  open: boolean;
  requests: HydratedReviewRequest[];
  currentUserId: string;
  onClose: () => void;
  onOpenDetail: (req: HydratedReviewRequest) => void;
  cap: number;
}) {
  const limited = requests.slice(0, cap);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-3xl w-[min(100vw-2rem,48rem)]">
        <DialogHeader>
          <DialogTitle className="text-base">
            Closed review requests
            <span className="text-xs font-normal text-gray-500 ml-2">
              ({limited.length}
              {requests.length > limited.length
                ? ` of ${requests.length}`
                : ""}
              )
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-[10px] uppercase text-gray-500 sticky top-0">
              <tr>
                <th className="text-left py-2 px-3 font-semibold">Requester</th>
                <th className="text-left py-2 px-3 font-semibold">
                  Reviewers + sections
                </th>
                <th className="text-left py-2 px-3 font-semibold">Closed by</th>
                <th className="text-left py-2 px-3 font-semibold">Closed at</th>
                <th className="text-left py-2 px-3 font-semibold">Reason</th>
                <th className="text-right py-2 px-3 font-semibold">View</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {limited.map((req) => (
                <tr key={req.id} className="hover:bg-gray-50/50">
                  <td className="py-2 px-3 text-gray-700">
                    {requesterLabel(req, currentUserId)}
                  </td>
                  <td
                    className="py-2 px-3 text-gray-600"
                    title={reviewersTooltip(req)}
                  >
                    {req.reviewers.length} · {req.sections.length}
                  </td>
                  <td className="py-2 px-3 text-gray-700">
                    {req.closed_by_name ?? "—"}
                  </td>
                  <td className="py-2 px-3 text-gray-600 whitespace-nowrap">
                    {req.closed_at ? formatDate(req.closed_at) : "—"}
                  </td>
                  <td className="py-2 px-3 text-gray-600">
                    {req.closed_reason === "reviewer_marked"
                      ? "Reviewer marked"
                      : req.closed_reason === "requester_force_closed"
                        ? "Force-closed"
                        : "—"}
                  </td>
                  <td className="py-2 px-3 text-right">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(req)}
                      title="View details"
                      aria-label="View details"
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {limited.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="py-8 text-center text-gray-400"
                  >
                    No closed review requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {requests.length > cap && (
          <p className="text-[10px] text-gray-400 text-right pt-1">
            Showing {cap} of {requests.length}. Pagination is a future
            enhancement.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
