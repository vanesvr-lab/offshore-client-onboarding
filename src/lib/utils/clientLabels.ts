// B-098 — client-facing labels for services.status. Mirrors the
// canonical chain at `@/lib/services/statusChain` but with softer
// copy for the client portal (admin sees the canonical labels).
// Keep this list in sync whenever the chain changes.
export const CLIENT_STATUS_LABELS: Record<string, string> = {
  start: "Getting started",
  document_collection: "Collecting documents",
  verification_and_screening: "Verification underway",
  risk_assessment: "Risk assessment",
  final_review: "Final review",
  approved: "Approved",
  registration: "Registering",
  active: "Active",
  rejected: "Needs attention",
  closed: "Closed",
};

export function getClientStatusLabel(status: string): string {
  return CLIENT_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}
