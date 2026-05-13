// B-098 — Single source of truth for the service status chain.
// Every consumer (B-093 right-rail Status card, the top-of-page stage
// strip, the /admin/services list filter, the PATCH route validator,
// the client-side service detail) imports from here. Do NOT redeclare
// the array inline anywhere.
//
// Forward chain (8) is the normal flow. `rejected` and `closed` are
// override-only terminals reachable solely via the Stage Override
// dropdown — the "Move to <next>" button never advances into them.

export const SERVICE_STATUS_FORWARD_CHAIN = [
  "start",
  "document_collection",
  "verification_and_screening",
  "risk_assessment",
  "final_review",
  "approved",
  "registration",
  "active",
] as const;

export const SERVICE_STATUS_TERMINAL_OVERRIDES = ["rejected", "closed"] as const;

export const SERVICE_STATUS_ALL = [
  ...SERVICE_STATUS_FORWARD_CHAIN,
  ...SERVICE_STATUS_TERMINAL_OVERRIDES,
] as const;

export type ServiceStatus = (typeof SERVICE_STATUS_ALL)[number];
export type ServiceStatusForward = (typeof SERVICE_STATUS_FORWARD_CHAIN)[number];

export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  start: "Start",
  document_collection: "Document Collection",
  verification_and_screening: "Verification & Screening",
  risk_assessment: "Risk Assessment",
  final_review: "Final Review",
  approved: "Approved",
  registration: "Registration",
  active: "Active",
  rejected: "Rejected",
  closed: "Closed",
};

export function getNextStatus(current: string): ServiceStatusForward | null {
  const idx = (SERVICE_STATUS_FORWARD_CHAIN as readonly string[]).indexOf(current);
  if (idx === -1 || idx === SERVICE_STATUS_FORWARD_CHAIN.length - 1) return null;
  return SERVICE_STATUS_FORWARD_CHAIN[idx + 1];
}

export function isTerminalStatus(status: string): boolean {
  return (
    (SERVICE_STATUS_TERMINAL_OVERRIDES as readonly string[]).includes(status) ||
    status === "active"
  );
}

export function isValidServiceStatus(status: string): status is ServiceStatus {
  return (SERVICE_STATUS_ALL as readonly string[]).includes(status);
}

export function getStatusLabel(status: string): string {
  if (isValidServiceStatus(status)) return SERVICE_STATUS_LABELS[status];
  return status.replace(/_/g, " ");
}

// Visual treatment for status badges. Each value distinct; tweak palette
// if the brand evolves but keep this the only place colours live.
export function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "approved":
    case "active":
      return "bg-emerald-100 text-emerald-700";
    case "registration":
      return "bg-blue-100 text-blue-700";
    case "rejected":
      return "bg-red-100 text-red-700";
    case "closed":
      return "bg-gray-200 text-gray-600";
    case "final_review":
    case "risk_assessment":
      return "bg-purple-100 text-purple-700";
    case "verification_and_screening":
      return "bg-amber-100 text-amber-700";
    case "document_collection":
      return "bg-yellow-100 text-yellow-700";
    case "start":
    default:
      return "bg-gray-100 text-gray-600";
  }
}
