// B-118 — Wire types for the peer/manager review feature. Both the API
// routes and the right-rail card + banner share these shapes via the
// JSON responses.

import type { ReviewSectionKey } from "./sections";

export type ReviewRequestStatus = "open" | "closed";
export type ReviewClosedReason = "reviewer_marked" | "requester_force_closed";

export interface ReviewRequestReviewer {
  admin_id: string;
  full_name: string | null;
  email: string | null;
}

export interface ReviewRequestSection {
  id: string;
  section_key: ReviewSectionKey;
  profile_id: string | null;
}

export interface HydratedReviewRequest {
  id: string;
  service_id: string;
  requester_id: string;
  requester_name: string | null;
  note: string;
  status: ReviewRequestStatus;
  closed_at: string | null;
  closed_by: string | null;
  closed_by_name: string | null;
  closed_reason: ReviewClosedReason | null;
  created_at: string;
  reviewers: ReviewRequestReviewer[];
  sections: ReviewRequestSection[];
}

export interface CreateReviewRequestBody {
  reviewerIds: string[];
  sections: Array<{
    section_key: ReviewSectionKey;
    profile_id?: string | null;
  }>;
  note: string;
}

export interface CloseReviewRequestBody {
  reason: ReviewClosedReason;
}
