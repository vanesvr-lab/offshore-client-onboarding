// B-108 Batch 3 — auto-detected service alerts.
//
// Pure, side-effect-free function: deterministic output for the same
// inputs so it's easy to unit-test later (deferred). Rules are tightly
// scoped to two signals that age over time and need human eyes:
//
//   1. Document expiry (admin-effective `expiry_date`)
//        days < 0       → critical, "expired N days ago"
//        days <= 30     → warning, "expires in N days"
//        30 < days <= 60→ info, "expires in N days"
//   2. KYC last-touched (client_profile_kyc.updated_at) > 12 months ago
//        12mo–18mo      → info
//        > 18 months    → warning
//
// The `key` field is what dismissals match on; keep it deterministic
// for the (service, alert-cause) pair so a dismissal idempotently
// suppresses the same logical alert until the underlying cause
// changes shape (different doc id, different profile id).

import type { ServiceDoc } from "@/app/(admin)/admin/services/[id]/page";

const ONE_DAY_MS = 86_400_000;
const TWELVE_MONTHS_MS = 365 * ONE_DAY_MS;

export type AutoAlertSeverity = "info" | "warning" | "critical";

export interface AutoAlert {
  key: string;
  severity: AutoAlertSeverity;
  title: string;
  note: string;
  sourceEntityType: "document" | "profile";
  sourceEntityId: string;
  detectedAt: string;
}

export interface AutoAlertProfile {
  id: string;
  full_name: string | null;
  kyc_updated_at: string | null;
}

export function computeAutoAlerts(input: {
  documents: ServiceDoc[];
  profiles: AutoAlertProfile[];
  now?: Date;
}): AutoAlert[] {
  const out: AutoAlert[] = [];
  const nowDate = input.now ?? new Date();
  const now = nowDate.getTime();
  const detectedAt = nowDate.toISOString();

  for (const d of input.documents) {
    if (!d.expiry_date) continue;
    const expiry = new Date(d.expiry_date).getTime();
    if (Number.isNaN(expiry)) continue;
    const days = Math.round((expiry - now) / ONE_DAY_MS);
    const docName = d.document_types?.name ?? "Document";
    const owner = d.client_profiles?.full_name ?? null;
    if (days < 0) {
      out.push({
        key: `doc_expired_${d.id}`,
        severity: "critical",
        title: `${docName} expired ${Math.abs(days)} day${Math.abs(days) === 1 ? "" : "s"} ago`,
        note: owner ? `Owner: ${owner}.` : "No assigned profile.",
        sourceEntityType: "document",
        sourceEntityId: d.id,
        detectedAt,
      });
    } else if (days <= 60) {
      out.push({
        key: `doc_expiry_${d.id}`,
        severity: days <= 30 ? "warning" : "info",
        title: `${docName} expires in ${days} day${days === 1 ? "" : "s"}`,
        note: owner ? `Owner: ${owner}.` : "No assigned profile.",
        sourceEntityType: "document",
        sourceEntityId: d.id,
        detectedAt,
      });
    }
  }

  for (const p of input.profiles) {
    if (!p.kyc_updated_at) continue;
    const last = new Date(p.kyc_updated_at).getTime();
    if (Number.isNaN(last)) continue;
    const age = now - last;
    if (age > TWELVE_MONTHS_MS) {
      const days = Math.floor(age / ONE_DAY_MS);
      out.push({
        key: `kyc_age_${p.id}`,
        severity: age > TWELVE_MONTHS_MS * 1.5 ? "warning" : "info",
        title: `KYC review overdue — ${p.full_name ?? "Unnamed profile"}`,
        note: `Last reviewed ${days} days ago.`,
        sourceEntityType: "profile",
        sourceEntityId: p.id,
        detectedAt,
      });
    }
  }

  return out;
}

export function severityRank(s: AutoAlertSeverity | "open-manual"): number {
  if (s === "critical") return 3;
  if (s === "warning") return 2;
  return 1;
}
