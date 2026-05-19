// B-131 — "Filings on behalf of" section on the client dashboard.
// Lists every client_profiles row where filing_rep_email matches the
// current user. Click → /filings/[profileId] (Batch 5) for the
// rep-facing KYC editor.

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface FilingForRow {
  id: string;
  full_name: string;
  record_type: "individual" | "organisation";
  due_diligence_level: "sdd" | "cdd" | "edd";
  roles: Array<{
    role: string;
    service_number: string | null;
    service_id: string;
  }>;
}

interface Props {
  rows: FilingForRow[];
}

export function FilingsOnBehalfOf({ rows }: Props) {
  if (rows.length === 0) return null;

  return (
    <section className="mb-6">
      <h2 className="text-base font-semibold text-brand-navy mb-2">
        Filings on behalf of
      </h2>
      <p className="text-xs text-gray-500 mb-3">
        You&apos;ve been designated as the filing representative for the
        following directors. Click any to complete their KYC paperwork.
      </p>
      <div className="space-y-2">
        {rows.map((profile) => {
          const roleSummary =
            profile.roles.length === 0
              ? "No services yet"
              : profile.roles
                  .map((r) =>
                    `${r.service_number ?? r.service_id.slice(0, 8)} (${r.role})`,
                  )
                  .join(" · ");
          return (
            <Link
              key={profile.id}
              href={`/filings/${profile.id}`}
              className="block p-4 bg-white border rounded-xl hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">
                    {profile.full_name}
                    {profile.record_type === "organisation" && (
                      <span className="ml-2 text-[10px] uppercase tracking-wider text-gray-400">
                        org
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{roleSummary}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
