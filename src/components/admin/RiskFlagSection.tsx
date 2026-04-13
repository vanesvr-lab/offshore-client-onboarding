"use client";

import { RiskFlagBanner } from "./RiskFlagBanner";
import type { RiskFlag } from "@/types";

interface RiskFlagSectionProps {
  clientId: string;
  kycRecordId: string;
  flags: RiskFlag[];
}

export function RiskFlagSection({ clientId, kycRecordId, flags }: RiskFlagSectionProps) {
  const activeFlags = flags.filter((f) => !f.dismissed);
  if (activeFlags.length === 0) return null;

  return (
    <div className="mb-6">
      <RiskFlagBanner flags={flags} clientId={clientId} kycRecordId={kycRecordId} />
    </div>
  );
}
