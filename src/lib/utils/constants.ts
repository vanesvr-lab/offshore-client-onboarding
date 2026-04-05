import type { ApplicationStatus, VerificationStatus } from "@/types";

export const ACCEPTED_FILE_TYPES = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  in_review: "In Review",
  pending_action: "Action Required",
  verification: "Verification",
  approved: "Approved",
  rejected: "Rejected",
};

export const APPLICATION_STATUS_COLORS: Record<ApplicationStatus, string> = {
  draft: "bg-gray-100 text-gray-700",
  submitted: "bg-blue-100 text-blue-700",
  in_review: "bg-yellow-100 text-yellow-700",
  pending_action: "bg-orange-100 text-orange-700",
  verification: "bg-purple-100 text-purple-700",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: "Pending",
  verified: "Verified",
  flagged: "Flagged",
  manual_review: "Manual Review",
};

export const VERIFICATION_STATUS_COLORS: Record<VerificationStatus, string> = {
  pending: "bg-gray-100 text-gray-600",
  verified: "bg-green-100 text-green-700",
  flagged: "bg-amber-100 text-amber-700",
  manual_review: "bg-blue-100 text-blue-700",
};

export const BUSINESS_TYPES = [
  "Corporation",
  "LLC",
  "Partnership",
  "Trust",
  "Foundation",
  "Other",
];

export const WORKFLOW_STAGES: ApplicationStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "pending_action",
  "verification",
  "approved",
];
