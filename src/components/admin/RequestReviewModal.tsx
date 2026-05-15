"use client";

// B-118 — Modal for requesting a peer/manager review.
//
// Three sections of input:
//   1. Reviewers — multi-select with search + select-all (excludes self)
//   2. Sections — top-level checkboxes + a People KYC group with one
//      checkbox per profile on this service
//   3. Note — required, min 1 char after trim
//
// Submit is gated until ≥1 reviewer + ≥1 section + non-empty note.

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Send, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  TOP_LEVEL_SECTION_KEYS,
  SECTION_LABELS,
  PEOPLE_KYC_PROFILE_KEY,
} from "@/lib/review-requests/sections";
import type {
  CreateReviewRequestBody,
  HydratedReviewRequest,
} from "@/lib/review-requests/types";

export interface ReviewModalAdmin {
  user_id: string;
  full_name: string | null;
  email: string | null;
}

export interface ReviewModalProfile {
  id: string;
  full_name: string;
  role_label?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serviceId: string;
  /** Current admin's user_id — filtered out of the reviewer list. */
  currentUserId: string;
  admins: ReviewModalAdmin[];
  profiles: ReviewModalProfile[];
  /** Splice the hydrated request into the right-rail card without a
   *  full refetch. Communications are also returned so the right-rail
   *  Communications card stays fresh in the same pattern as Hotfix 2. */
  onCreated?: (
    request: HydratedReviewRequest,
    communications: Record<string, unknown>[],
  ) => void;
}

interface SelectedSection {
  section_key: string;
  profile_id: string | null;
}

function sectionsEqual(a: SelectedSection, b: SelectedSection): boolean {
  return a.section_key === b.section_key && a.profile_id === b.profile_id;
}

export function RequestReviewModal({
  open,
  onOpenChange,
  serviceId,
  currentUserId,
  admins,
  profiles,
  onCreated,
}: Props) {
  const eligibleAdmins = useMemo(
    () => admins.filter((a) => a.user_id !== currentUserId),
    [admins, currentUserId],
  );

  const [search, setSearch] = useState("");
  const [selectedReviewerIds, setSelectedReviewerIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedSections, setSelectedSections] = useState<SelectedSection[]>(
    [],
  );
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const filteredAdmins = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return eligibleAdmins;
    return eligibleAdmins.filter((a) => {
      const name = (a.full_name ?? "").toLowerCase();
      const email = (a.email ?? "").toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [eligibleAdmins, search]);

  const allReviewersSelected =
    eligibleAdmins.length > 0 &&
    selectedReviewerIds.size === eligibleAdmins.length;
  const allSectionsSelected =
    selectedSections.length ===
    TOP_LEVEL_SECTION_KEYS.length + profiles.length;

  function toggleReviewer(id: string) {
    setSelectedReviewerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllReviewers() {
    if (allReviewersSelected) {
      setSelectedReviewerIds(new Set());
    } else {
      setSelectedReviewerIds(new Set(eligibleAdmins.map((a) => a.user_id)));
    }
  }

  function isSectionSelected(s: SelectedSection): boolean {
    return selectedSections.some((existing) => sectionsEqual(existing, s));
  }

  function toggleSection(s: SelectedSection) {
    setSelectedSections((prev) => {
      const exists = prev.find((existing) => sectionsEqual(existing, s));
      if (exists) {
        return prev.filter((existing) => !sectionsEqual(existing, s));
      }
      return [...prev, s];
    });
  }

  function toggleAllSections() {
    if (allSectionsSelected) {
      setSelectedSections([]);
      return;
    }
    const all: SelectedSection[] = [
      ...TOP_LEVEL_SECTION_KEYS.map((key) => ({
        section_key: key,
        profile_id: null,
      })),
      ...profiles.map((p) => ({
        section_key: PEOPLE_KYC_PROFILE_KEY,
        profile_id: p.id,
      })),
    ];
    setSelectedSections(all);
  }

  const noteTrimmed = note.trim();
  const canSubmit =
    !submitting &&
    selectedReviewerIds.size > 0 &&
    selectedSections.length > 0 &&
    noteTrimmed.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    const body: CreateReviewRequestBody = {
      reviewerIds: Array.from(selectedReviewerIds),
      sections: selectedSections.map((s) => ({
        section_key: s.section_key as CreateReviewRequestBody["sections"][number]["section_key"],
        profile_id: s.profile_id ?? undefined,
      })),
      note: noteTrimmed,
    };
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/admin/services/${serviceId}/review-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        request?: HydratedReviewRequest;
        communications?: Record<string, unknown>[];
      };
      if (!res.ok || !data.request) {
        throw new Error(data.error ?? "Failed to create review request");
      }
      onCreated?.(data.request, data.communications ?? []);
      toast.success("Review request sent.", { position: "top-right" });
      // Reset state for next open.
      setSearch("");
      setSelectedReviewerIds(new Set());
      setSelectedSections([]);
      setNote("");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : "Failed to create review request",
        { position: "top-right" },
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-brand-navy">
            Request Peer / Manager Review
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5 pt-1">
          {/* Reviewers */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">
                Reviewers <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={toggleAllReviewers}
                className="text-xs text-brand-navy hover:underline"
                disabled={eligibleAdmins.length === 0}
              >
                {allReviewersSelected ? "Clear all" : "Select all"}
              </button>
            </div>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <div className="border rounded-md max-h-44 overflow-y-auto divide-y">
              {filteredAdmins.length === 0 ? (
                <div className="px-3 py-2 text-xs text-gray-500">
                  {eligibleAdmins.length === 0
                    ? "No other admins available."
                    : "No admins match this search."}
                </div>
              ) : (
                filteredAdmins.map((a) => {
                  const checked = selectedReviewerIds.has(a.user_id);
                  return (
                    <label
                      key={a.user_id}
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleReviewer(a.user_id)}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="text-sm text-gray-900 truncate block">
                          {a.full_name ?? a.email ?? a.user_id}
                        </span>
                        {a.full_name && a.email && (
                          <span className="text-xs text-gray-500 truncate block">
                            {a.email}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            {selectedReviewerIds.size > 0 && (
              <p className="text-xs text-gray-500">
                {selectedReviewerIds.size} selected
              </p>
            )}
          </div>

          {/* Sections */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-gray-900">
                Sections <span className="text-red-500">*</span>
              </label>
              <button
                type="button"
                onClick={toggleAllSections}
                className="text-xs text-brand-navy hover:underline"
              >
                {allSectionsSelected ? "Clear all" : "Review all sections"}
              </button>
            </div>
            <div className="border rounded-md divide-y">
              {TOP_LEVEL_SECTION_KEYS.map((key) => {
                const sel: SelectedSection = { section_key: key, profile_id: null };
                const checked = isSectionSelected(sel);
                return (
                  <label
                    key={key}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleSection(sel)}
                    />
                    <span className="text-sm text-gray-900">
                      {SECTION_LABELS[key]}
                    </span>
                  </label>
                );
              })}
              <div className="px-3 py-2 bg-gray-50">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  People &amp; KYC
                </p>
              </div>
              {profiles.length === 0 ? (
                <div className="px-5 py-2 text-xs text-gray-500">
                  No profiles on this service yet.
                </div>
              ) : (
                profiles.map((p) => {
                  const sel: SelectedSection = {
                    section_key: PEOPLE_KYC_PROFILE_KEY,
                    profile_id: p.id,
                  };
                  const checked = isSectionSelected(sel);
                  return (
                    <label
                      key={p.id}
                      className="flex items-center gap-2 px-5 py-2 cursor-pointer hover:bg-gray-50"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleSection(sel)}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="text-sm text-gray-900 truncate block">
                          {p.full_name}
                        </span>
                        {p.role_label && (
                          <span className="text-xs text-gray-500 truncate block">
                            {p.role_label}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
            {selectedSections.length > 0 && (
              <p className="text-xs text-gray-500">
                {selectedSections.length} selected
              </p>
            )}
          </div>

          {/* Note */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-900">
              Note to reviewer{selectedReviewerIds.size === 1 ? "" : "s"}{" "}
              <span className="text-red-500">*</span>
            </label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What should the reviewer focus on?"
              rows={4}
              className="text-sm resize-none"
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
              className="gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit}
              className="bg-brand-navy hover:bg-brand-blue gap-1.5"
            >
              <Send className="h-3.5 w-3.5" />
              {submitting ? "Sending…" : "Send review request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
