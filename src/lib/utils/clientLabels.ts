export const CLIENT_STATUS_LABELS: Record<string, string> = {
  draft: "Getting started",
  in_progress: "In progress",
  submitted: "Submitted for review",
  in_review: "Under review",
  pending_action: "Action needed",
  approved: "Approved",
  rejected: "Needs attention",
};

export function getClientStatusLabel(status: string): string {
  return CLIENT_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}
