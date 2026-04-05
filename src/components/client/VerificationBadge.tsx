import {
  VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_COLORS,
} from "@/lib/utils/constants";
import type { VerificationStatus } from "@/types";

export function VerificationBadge({ status }: { status: VerificationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${VERIFICATION_STATUS_COLORS[status]}`}
    >
      {VERIFICATION_STATUS_LABELS[status]}
    </span>
  );
}
