"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  ConnectedSectionHeader,
  ConnectedNotesHistory,
  useAggregateStatus,
} from "./AdminApplicationSections";
import { SectionReviewBadge } from "./SectionReviewBadge";

// B-069 Batch 3 — admin-only per-profile KYC subsection review panel.
//
// Pragmatic interpretation: rather than refactor the 600-line
// `KycStepWizard` (or 2k-line `PerPersonReviewWizard`) to take a
// `readOnly` prop tonight, ship the SectionHeader + SectionNotesHistory
// affordances per (profile × category) below the existing PersonsManager
// card. The admin still uses PersonsManager / KycStepWizard for the
// interactive read+edit flow; this panel adds the per-subsection review
// audit trail and badges. See tech-debt entry for the full mirror.

const KYC_CATEGORIES: { key: string; label: string }[] = [
  { key: "identity", label: "Identity" },
  { key: "financial", label: "Financial" },
  { key: "compliance", label: "Compliance" },
  { key: "professional", label: "Professional" },
  { key: "tax", label: "Tax" },
  { key: "adverse_media", label: "Adverse Media" },
  { key: "wealth", label: "Wealth" },
  { key: "additional", label: "Additional" },
];

const ROLE_LABELS: Record<string, string> = {
  director: "Director",
  shareholder: "Shareholder",
  ubo: "UBO",
  contact: "Contact",
};

export interface PersonRow {
  id: string;
  role: string;
  shareholding_percentage: number | null;
  // kyc_records.id is also client_profiles.id (see migration 003 line 360)
  kyc_records: { id: string; full_name: string | null } | null;
}

interface Props {
  applicationId: string;
  // B-073 — when provided, skips the legacy `/api/applications/[id]/persons`
  // fetch. Required for the services detail page which has roles loaded
  // server-side and whose `applicationId` is actually a `service.id` (the
  // legacy persons API returns 404 for service ids).
  persons?: PersonRow[];
}

export function AdminKycPersonReviewPanel({ applicationId, persons: presetPersons }: Props) {
  const [persons, setPersons] = useState<PersonRow[]>(presetPersons ?? []);
  const [loading, setLoading] = useState(presetPersons === undefined);

  useEffect(() => {
    if (presetPersons !== undefined) {
      setPersons(presetPersons);
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/applications/${applicationId}/persons`)
      .then((r) => r.json())
      .then((data: { persons?: PersonRow[] }) => {
        if (cancelled) return;
        setPersons(data.persons ?? []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [applicationId, presetPersons]);

  if (loading) {
    return (
      <p className="text-sm text-gray-400">Loading per-profile reviews…</p>
    );
  }
  if (persons.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No profiles yet — add a Director, Shareholder, or UBO above to review.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {persons.map((p) => {
        const profileId = p.kyc_records?.id;
        const name =
          p.kyc_records?.full_name?.trim() ||
          `Unnamed ${ROLE_LABELS[p.role] ?? "person"}`;
        if (!profileId) return null;
        return (
          <PersonReviewCard
            key={p.id}
            profileId={profileId}
            name={name}
            role={p.role}
          />
        );
      })}
    </div>
  );
}

function PersonReviewCard({
  profileId,
  name,
  role,
}: {
  profileId: string;
  name: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const aggregate = useAggregateStatus(
    KYC_CATEGORIES.map((c) => `kyc:${profileId}:${c.key}`),
  );

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-3">
          {open ? (
            <ChevronDown className="size-4 text-gray-400" />
          ) : (
            <ChevronRight className="size-4 text-gray-400" />
          )}
          <div>
            <p className="text-sm font-medium text-brand-navy">{name}</p>
            <p className="text-xs text-gray-500">
              {ROLE_LABELS[role] ?? role}
              {aggregate.totalCount > 0 ? (
                <span className="ml-2">
                  · {aggregate.reviewedCount}/{aggregate.totalCount} reviewed
                </span>
              ) : null}
            </p>
          </div>
        </div>
        <SectionReviewBadge status={aggregate.status} />
      </button>

      <div
        className={cn(
          "border-t bg-gray-50/40",
          open ? "block" : "hidden",
        )}
      >
        <CardContent className="space-y-4 py-4">
          {KYC_CATEGORIES.map((cat) => {
            const sectionKey = `kyc:${profileId}:${cat.key}`;
            return (
              <div
                key={cat.key}
                className="rounded-md border bg-white"
              >
                <ConnectedSectionHeader
                  title={`${name} — ${cat.label}`}
                  sectionKey={sectionKey}
                />
                <div className="px-4 pb-3">
                  <ConnectedNotesHistory sectionKey={sectionKey} />
                </div>
              </div>
            );
          })}
        </CardContent>
      </div>
    </Card>
  );
}
