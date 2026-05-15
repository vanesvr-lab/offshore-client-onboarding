"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronDown, CheckCircle, XCircle,
  UserCheck, Building2, Users2, Plus, Loader2, Mail,
  StickyNote, ShieldCheck, Milestone, Clock,
  AlertTriangle, Bell, Eye,
  Trash2,
  Wand2, ChevronLeft, ChevronRight, X,
  Ban, RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { InviteKycDialog } from "@/components/shared/InviteKycDialog";
import { PersonSummaryDialog, type SummarySection } from "@/components/shared/PersonSummaryDialog";
import { ServiceSummaryDialog } from "@/components/admin/ServiceSummaryDialog";
import type { ServicePerson, ClientServiceDoc } from "@/app/(client)/services/[id]/page";
import { DynamicServiceForm } from "@/components/shared/DynamicServiceForm";
import { DocumentDetailDialog } from "@/components/shared/DocumentDetailDialog";
import type { DocumentDetailDoc } from "@/components/shared/DocumentDetailDialog";
import { ServiceCollapsibleSection } from "@/components/admin/ServiceCollapsibleSection";
import { AuditTrail } from "@/components/admin/AuditTrail";
import { FieldProvenanceMarker } from "@/components/admin/FieldProvenanceMarker";
import type { VerificationResult } from "@/types";
import {
  calcSectionCompletion,
  calcKycSectionRequiredPct,
} from "@/lib/utils/serviceCompletion";
import type { ServiceField } from "@/components/shared/DynamicServiceForm";
import type { ProfileServiceRole, ServiceSectionOverride, ClientProfile, DueDiligenceRequirement, DocumentType, AuditLogEntry, ApplicationSectionReview, ServiceTemplateAction, ServiceAction, ServiceSubstance, FieldExtraction } from "@/types";
import type { ServiceWithTemplate, ServiceDoc, AdminUser, ServiceAuditEntry, DocumentUpdateRequest, WaivedDocumentRequirement, ServiceCommunication, ManualServiceAlert, DismissedAutoAlert } from "./page";
import type { ReferenceFormSummary, SubmittedFormSummary } from "./loadServiceDetail";
import { AdminApplicationSectionsProvider, ConnectedNotesHistory, useSectionReview, useSectionReviews, useAggregateStatus } from "@/components/admin/AdminApplicationSections";
import { SectionReviewBadge } from "@/components/admin/SectionReviewBadge";
import { SectionReviewButton } from "@/components/admin/SectionReviewButton";
import { SectionReviewPanel } from "@/components/admin/SectionReviewPanel";
import { AdminReviewWizardStepIndicator } from "@/components/admin/AdminReviewWizardStepIndicator";
import { AdminPerProfileReviewWizard } from "@/components/admin/AdminPerProfileReviewWizard";
import { PerProfileReviewSummaryPanel, type PerProfileSubsection } from "@/components/admin/PerProfileReviewSummaryPanel";
import {
  AdminApplicationStepIndicator,
  type AdminStep,
  type ReviewState,
} from "@/components/admin/AdminApplicationStepIndicator";
import { ServiceProgressMeters } from "@/components/admin/ServiceProgressMeters";
import { ProfileDdLevelSelector } from "@/components/admin/ProfileDdLevelSelector";
import { ProfilePendingButton } from "@/components/admin/ProfilePendingButton";
import {
  resolvePillState,
  resolveCountBadge,
} from "@/lib/services/stepState";
import { ServiceActionsSection } from "@/components/admin/actions/ServiceActionsSection";
import { CountrySelect } from "@/components/shared/CountrySelect";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { AiPrefillBanner, type AiPrefillBannerStatus } from "@/components/kyc/AiPrefillBanner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { KycDocsSummary } from "@/components/kyc/KycDocsSummary";
import { KycDocsByCategory } from "@/components/kyc/KycDocsByCategory";
import { KycDocRow, type KycDocRowData } from "@/components/kyc/KycDocRow";
import { KycDocumentsTable } from "@/components/admin/KycDocumentsTable";
import { ServiceCommunicationsCard } from "@/components/admin/ServiceCommunicationsCard";
import { ReviewRequestsCard } from "@/components/admin/ReviewRequestsCard";
import { ReviewRequestBanner } from "@/components/admin/ReviewRequestBanner";
import { RequestReviewModal } from "@/components/admin/RequestReviewModal";
import type { HydratedReviewRequest } from "@/lib/review-requests/types";
import { ServicePendingCard } from "@/components/admin/ServicePendingCard";
import {
  computePendingItems,
  computeProfilePendingItems,
  type PendingItem,
  type PendingStepConfig,
  type PendingProfileInput,
} from "@/lib/services/computePendingItems";
import { ServiceAlertsDialog } from "@/components/admin/ServiceAlertsDialog";
import {
  computeAutoAlerts,
  severityRank,
  type AutoAlert,
  type AutoAlertSeverity,
} from "@/lib/alerts/computeAutoAlerts";
import { KycRolesPicker } from "@/components/kyc/KycRolesPicker";
import { kycCategoryLabel, sortKycCategories } from "@/lib/kyc/categories";
import { formatDate } from "@/lib/utils/formatters";
import {
  SERVICE_STATUS_FORWARD_CHAIN,
  SERVICE_STATUS_ALL,
  SERVICE_STATUS_LABELS,
  getNextStatus,
  getStatusBadgeClass,
  getStatusLabel,
} from "@/lib/services/statusChain";
import {
  KYC_SECTIONS_INDIVIDUAL,
  KYC_SECTIONS_ORGANISATION,
  gateSectionForLevel,
  visibleFields,
  type KycSection,
  type KycField,
  type DueDiligenceLevel as KycDueDiligenceLevel,
} from "@/lib/kyc/sections";
import { filterDocTypesForRecordType } from "@/lib/kyc/applicableDocTypes";

// ─── Document category helpers ────────────────────────────────────────────────

const KYC_DOC_CATEGORIES = ["identity", "financial", "compliance"] as const;
const isKycDoc = (category: string | null | undefined): boolean =>
  (KYC_DOC_CATEGORIES as readonly string[]).includes(category ?? "");

// ─── B-084 Batch 2 — button family ────────────────────────────────────────────
// Single navy/pill family applied across every <Button> on this page.
// Status pills, role badges, and B-083 section pills are intentionally
// untouched (they're not buttons). The Button component merges these with
// its base via tw-merge, so later utility wins.
const BTN_PRIMARY =
  "bg-brand-navy hover:bg-brand-blue text-white rounded-full border-transparent";
const BTN_OUTLINE =
  "bg-white hover:bg-gray-50 text-brand-navy hover:text-brand-navy border-brand-navy rounded-full";
const BTN_DESTRUCTIVE_OUTLINE =
  "bg-white hover:bg-red-50 text-red-600 hover:text-red-600 border-red-600 rounded-full";

// ─── Section field matchers (mirrors ServiceWizard STEP_SECTION_MATCH) ────────

const SECTION_MATCHERS: Record<string, (section: string | undefined) => boolean> = {
  company_setup: (s) => !s || s === "Details" || /company\s*setup/i.test(s) || /company/i.test(s),
  financial:     (s) => !!s && /financial|finance/i.test(s),
  banking:       (s) => !!s && /bank/i.test(s),
};

function getFieldsForSection(key: string, fields: ServiceField[]): ServiceField[] {
  const matcher = SECTION_MATCHERS[key];
  if (!matcher) return [];
  return fields.filter((f) => matcher(f.section));
}

// ─── Types ────────────────────────────────────────────────────────────────────

type RagStatus = "green" | "amber" | "red";

type KycFull = {
  completion_status?: string;
  kyc_journey_completed?: boolean;
  date_of_birth?: string | null;
  nationality?: string | null;
  passport_number?: string | null;
  passport_expiry?: string | null;
  occupation?: string | null;
  address?: string | null;
  source_of_funds_description?: string | null;
  source_of_wealth_description?: string | null;
  is_pep?: boolean | null;
  legal_issues_declared?: boolean | null;
  [key: string]: unknown;
};

type RoleWithProfile = ProfileServiceRole & {
  client_profiles: {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    is_representative: boolean;
    record_type: string;
    due_diligence_level: string;
    user_id: string | null;
    client_profile_kyc: KycFull[] | null;
  } | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const RAG_DOT: Record<RagStatus, string> = {
  green: "bg-green-500",
  amber: "bg-amber-400",
  red: "bg-red-500",
};

function ragFromPct(pct: number): RagStatus {
  if (pct >= 100) return "green";
  if (pct > 0) return "amber";
  return "red";
}

// B-098 — status badge colours now live in src/lib/services/statusChain.
// Local alias kept for the existing call sites in this file.
const statusBadgeClass = getStatusBadgeClass;

// B-114 — record_type + DD-aware required-completion counter that
// ALSO includes required KYC docs (waiver-aware) in the denominator.
// Replaces the B-113 field-only helper that hardcoded an individual
// field list — Elarix LLC was permanently stuck at 0% because none of
// the individual fields apply to an organisation profile, and Vanessa
// reported 100% with only 3 of 19 KYC docs actually uploaded.
//
// Drives the per-profile badge on the service-detail page + the
// People & KYC step aggregator (averaged across profiles).
//
// Fields: source of truth is `KYC_SECTIONS_INDIVIDUAL` /
// `KYC_SECTIONS_ORGANISATION`. We apply `gateSectionForLevel` so SDD
// profiles aren't penalised for `cddOrAbove` sections, and EDD-only
// fields only count for EDD. Conditional fields (`showWhen`) are
// excluded from the denominator — a tech-debt note tracks this
// tradeoff (see docs/tech-debt.md).
//
// Docs: every active person-scope `document_types` row is counted as
// required. A doc is "done" when uploaded for this profile OR waived
// with a person-scope waiver pinned to this profile.
//
// A few field keys live on `client_profiles` (full_name, email,
// phone, address) rather than `client_profile_kyc`; we read those off
// `profile` instead.

interface CalcKycPctInput {
  kyc: KycFull | null;
  profile: {
    record_type?: string | null;
    full_name?: string | null;
    email?: string | null;
    phone?: string | null;
    address?: string | null;
    due_diligence_level?: string | null;
  };
  profileDocs: ServiceDoc[];
  kycDocTypes: DocumentType[];
  waivers: WaivedDocumentRequirement[];
  profileId: string;
}

const PROFILE_LEVEL_KEYS = new Set([
  "full_name",
  "email",
  "phone",
  "address",
]);

function pickRequiredKycFields(
  recordType: string | null | undefined,
  ddLevel: string | null | undefined,
): KycField[] {
  const sections =
    recordType === "organisation"
      ? KYC_SECTIONS_ORGANISATION
      : KYC_SECTIONS_INDIVIDUAL;
  const level = (ddLevel ?? "cdd") as KycDueDiligenceLevel;
  const gated = sections
    .map((s) => gateSectionForLevel(s, level))
    .filter((s): s is KycSection => s !== null);
  return gated.flatMap((s) => s.fields.filter((f) => f.required && !f.showWhen));
}

function calcKycPct(input: CalcKycPctInput): number {
  const { kyc, profile, profileDocs, kycDocTypes, waivers, profileId } = input;
  const requiredFields = pickRequiredKycFields(
    profile.record_type,
    profile.due_diligence_level,
  );
  // B-115 — drop doc types whose `applies_to` doesn't match the profile's
  // record_type. Stops org profiles from being penalised for
  // individual-only docs (Driving Licence etc.) and vice versa.
  const requiredDocs = filterDocTypesForRecordType(
    kycDocTypes,
    profile.record_type,
  );
  const totalRequired = requiredFields.length + requiredDocs.length;
  if (totalRequired === 0) return 100;

  const filledFields = requiredFields.filter((f) => {
    // B-114 — `full_name` / `email` / `phone` live on `client_profiles`;
    // `address` is dual-table (B-105). Try profile first when the field
    // is profile-level, fall through to kyc when empty so a profile
    // whose copy is blank but kyc copy isn't still counts as filled.
    const profileVal = PROFILE_LEVEL_KEYS.has(f.key)
      ? (profile as Record<string, unknown>)[f.key]
      : undefined;
    const v =
      profileVal != null && profileVal !== ""
        ? profileVal
        : (kyc as Record<string, unknown> | null)?.[f.key];
    if (f.type === "boolean") return v !== null && v !== undefined;
    if (v == null || v === "") return false;
    return true;
  }).length;

  const filledDocs = requiredDocs.filter((dt) => {
    const uploaded = profileDocs.some((d) => d.document_type_id === dt.id);
    if (uploaded) return true;
    return waivers.some(
      (w) =>
        w.scope === "person" &&
        w.client_profile_id === profileId &&
        w.document_type_id === dt.id,
    );
  }).length;

  return Math.round(((filledFields + filledDocs) / totalRequired) * 100);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AddProfileDialog({
  serviceId,
  allProfiles,
  existingRoles,
  onAdded,
  defaultRole = "director",
  trigger,
}: {
  serviceId: string;
  allProfiles: ClientProfile[];
  existingRoles: RoleWithProfile[];
  onAdded: (newProfileId?: string) => void;
  defaultRole?: "director" | "shareholder" | "ubo" | "other";
  trigger?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newType, setNewType] = useState<"individual" | "organisation">("individual");
  const [saving, setSaving] = useState(false);

  const roleTitle = defaultRole === "ubo" ? "UBO" : defaultRole.charAt(0).toUpperCase() + defaultRole.slice(1);

  // Map profile_id → roles already on this service
  const profileRoleMap = new Map<string, string[]>();
  for (const r of existingRoles) {
    const pid = r.client_profiles?.id;
    if (pid) {
      const arr = profileRoleMap.get(pid) ?? [];
      if (!arr.includes(r.role)) arr.push(r.role);
      profileRoleMap.set(pid, arr);
    }
  }

  const filteredProfiles = allProfiles.filter(
    (p) =>
      search === "" ||
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (p.email ?? "").toLowerCase().includes(search.toLowerCase())
  );

  function handleOpenChange(v: boolean) {
    setOpen(v);
    if (!v) {
      setSearch("");
      setSelected(null);
      setNewName("");
      setNewEmail("");
      setNewType("individual");
    }
  }

  async function handleSubmit() {
    setSaving(true);
    try {
      const body = selected
        ? { client_profile_id: selected.id, role: defaultRole }
        : { full_name: newName.trim(), email: newEmail.trim() || null, record_type: newType, role: defaultRole };

      const res = await fetch(`/api/admin/services/${serviceId}/roles`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as { id?: string; client_profile_id?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      const name = selected ? selected.full_name : newName.trim();
      toast.success(`${name} added as ${roleTitle}`, { position: "top-right" });
      handleOpenChange(false);
      const newId = selected?.id ?? data.client_profile_id;
      onAdded(newId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add profile", { position: "top-right" });
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = !saving && (selected !== null || newName.trim().length > 0);

  return (
    <>
      <div onClick={() => setOpen(true)}>{trigger ?? (
        <Button size="sm" variant="outline" className={`gap-1.5 ${BTN_OUTLINE}`}>
          <Plus className="h-3.5 w-3.5" />
          Add {roleTitle}
        </Button>
      )}</div>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add {roleTitle}</DialogTitle>
          </DialogHeader>

          {/* B-077 Batch 6b — bumped gray contrast across the modal so
              eligible rows + the create-new form read as active rather
              than disabled. Linked rows keep the existing low-contrast
              styling because they really are unavailable. */}
          <div className="space-y-4 mt-1">
            {/* Search existing profiles */}
            <div>
              <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                Search existing profiles
              </p>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or email…"
                autoFocus
                className="w-full border rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue"
              />
              <div className="mt-2 max-h-44 overflow-y-auto border rounded-lg divide-y bg-white">
                {filteredProfiles.length === 0 ? (
                  <p className="text-xs text-gray-500 py-3 text-center">No profiles found</p>
                ) : filteredProfiles.map((p) => {
                  const currentRoles = profileRoleMap.get(p.id) ?? [];
                  const isLinked = currentRoles.length > 0;
                  const isSelected = selected?.id === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={isLinked}
                      onClick={() => !isLinked && setSelected(isSelected ? null : p)}
                      className={`w-full text-left px-3 py-2.5 flex items-center justify-between transition-colors ${
                        isLinked
                          ? "opacity-60 cursor-not-allowed bg-gray-50"
                          : isSelected
                          ? "bg-blue-50 border-l-2 border-brand-blue cursor-pointer"
                          : "bg-white text-gray-900 hover:bg-gray-50 cursor-pointer"
                      }`}
                    >
                      <div className="min-w-0">
                        <p className={`text-sm font-medium truncate ${isLinked ? "text-gray-500" : "text-gray-900"}`}>
                          {p.full_name}
                        </p>
                        {p.email && (
                          <p className={`text-xs truncate ${isLinked ? "text-gray-400" : "text-gray-600"}`}>
                            {p.email}
                          </p>
                        )}
                      </div>
                      {isLinked && currentRoles.length > 0 && (
                        <div className="flex gap-1 shrink-0 ml-2">
                          {currentRoles.map((r) => (
                            <span key={r} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-600 capitalize">
                              {r}
                            </span>
                          ))}
                        </div>
                      )}
                      {isSelected && (
                        <span className="text-[11px] text-brand-blue font-medium shrink-0 ml-2">✓ Selected</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-500">Or create new</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>

            {/* Create new */}
            <div className="space-y-3">
              <div className="flex gap-4">
                {(["individual", "organisation"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="radio"
                      name="new_record_type"
                      value={t}
                      checked={newType === t}
                      onChange={() => { setNewType(t); setSelected(null); }}
                    />
                    <span className="text-sm text-gray-900">{t === "organisation" ? "Corporation" : "Individual"}</span>
                  </label>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">
                  {newType === "organisation" ? "Corporation name" : "Full name"}{" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => { setNewName(e.target.value); setSelected(null); }}
                  placeholder={newType === "organisation" ? "Acme Corp Ltd" : "Jane Smith"}
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 mb-1 block">Email address</label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => { setNewEmail(e.target.value); setSelected(null); }}
                  placeholder="jane@example.com"
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" size="sm" className={BTN_OUTLINE} />}>Cancel</DialogClose>
            <Button
              size="sm"
              className={BTN_PRIMARY}
              disabled={!canSubmit}
              onClick={() => void handleSubmit()}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Add {roleTitle}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// B-077 Batch 3 — `KycDocSlot` (per-person inline upload row used in
// the deleted bottom flat doc list) was removed. Admin's per-section
// surface now shows source-doc rows (read-only View) above each section
// and a grouped collapsible Documents block at the end with full upload
// affordances via `KycDocsByCategory`.

// B-075 — KYC section schema is now imported from `@/lib/kyc/sections` so
// admin and client renderings stay in sync. categoryKey values are
// preserved so existing `kyc:<profileId>:<category>` review rows continue
// to display correctly.

function KycLongForm({
  kyc,
  profileId,
  profileDocuments,
  documentTypes,
  recordType,
  dueDiligenceLevel,
  fieldExtractions,
  onOpenDocumentDetail,
  onSectionDocUpload,
  uploadingDocTypeId,
  fields,
  setFields,
  onAfterReapply,
  restrictToSectionTitles,
  forceOpenAll = false,
}: {
  kyc: KycFull;
  profileId?: string;
  profileDocuments?: ServiceDoc[];
  /** B-078 Batch 4 — full doc type list for the service so per-section
   *  rows can render uploaded + missing categories without depending on
   *  AI extractions. */
  documentTypes?: DocumentType[];
  recordType?: string;
  /** B-075 — DD level for field/section gating; defaults to CDD when unknown. */
  dueDiligenceLevel?: string | null;
  /** B-070 — provenance rows for this profile (any field). */
  fieldExtractions?: FieldExtraction[];
  /** B-077 Batch 3 — open admin DocumentDetailDialog from per-section
   *  source-doc rows or the AiPrefillBanner View button. PersonCard
   *  owns the dialog state. */
  onOpenDocumentDetail?: (docId: string) => void;
  /** B-078 Batch 4 — Upload click on an empty-state per-section row
   *  bubbles up so PersonCard can drive its existing file picker. */
  onSectionDocUpload?: (docTypeId: string) => void;
  uploadingDocTypeId?: string | null;
  /** B-078 Batch 1 — fields state lifted to PersonCard for per-profile
   *  dirty tracking. KycLongForm is now controlled. */
  fields: Record<string, unknown>;
  setFields: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  /** B-078 Batch 1 — after a server-side re-apply, PersonCard syncs
   *  savedFields so dirty tracking resets.
   *
   *  B-117 Batch 3 — receives the server-authoritative post-update rows
   *  so PersonCard can (a) reset both savedFields AND draftFields, (b)
   *  splice the new rows into the parent's `roles` state via
   *  `onProfileSaved`, and (c) trigger `onRefresh` for audit-log + KYC%
   *  recomputation. The old shape (just the dirty patch) couldn't drive
   *  the parent splice, so `initialFields` stayed stale on the next
   *  re-render and silently reset the re-applied values. */
  onAfterReapply?: (server: {
    kyc: Record<string, unknown> | null;
    profile: {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
    } | null;
  }) => void;
  /** B-109 Batch 3 — sub-wizard filter: when set, only sections whose
   *  `title` is in the list render. Lets `AdminPerProfileReviewWizard`
   *  reuse this component to show one section per sub-step without
   *  forking the long-form rendering pipeline. */
  restrictToSectionTitles?: string[];
  /** B-109 Batch 3 — sub-wizard mode wants the active section expanded
   *  automatically (no admin click to open). Default false preserves
   *  the existing "open with everything collapsed" behaviour. */
  forceOpenAll?: boolean;
}) {
  const isOrg = recordType === "organisation";
  const ddLevel: KycDueDiligenceLevel =
    dueDiligenceLevel === "sdd" || dueDiligenceLevel === "edd" ? dueDiligenceLevel : "cdd";
  const baseSections = isOrg ? KYC_SECTIONS_ORGANISATION : KYC_SECTIONS_INDIVIDUAL;
  const sections = useMemo(
    () => baseSections
      .map((s) => gateSectionForLevel(s, ddLevel))
      .filter((s): s is KycSection => s !== null)
      .filter((s) =>
        restrictToSectionTitles
          ? restrictToSectionTitles.includes(s.title)
          : true,
      ),
    [baseSections, ddLevel, restrictToSectionTitles],
  );

  // B-070 — group provenance rows by field_key for O(1) marker lookup.
  const extractionsByField = useMemo(() => {
    const out: Record<string, FieldExtraction[]> = {};
    for (const fe of fieldExtractions ?? []) {
      if (!out[fe.field_key]) out[fe.field_key] = [];
      out[fe.field_key].push(fe);
    }
    return out;
  }, [fieldExtractions]);
  // Source-doc lookup table for the inline preview (only profile-scoped docs).
  const sourceDocsForMarker = useMemo(
    () =>
      (profileDocuments ?? []).map((d) => ({
        id: d.id,
        file_name: d.file_name,
        mime_type: d.mime_type,
        uploaded_at: d.uploaded_at,
        verification_status: d.verification_status,
      })),
    [profileDocuments]
  );

  // B-078 Batch 1 — `fields` + `setFields` are now controlled by PersonCard
  // so dirty tracking can be lifted to the per-profile container.
  // B-075 — admin opens with everything collapsed. Vanessa, 2026-05-07:
  // "by default the page is loaded with all the sections collapsed."
  // B-109 Batch 3 — `forceOpenAll` (sub-wizard mode) opens every gated
  // section by default so the admin sees fields without an extra click.
  const [openSections, setOpenSections] = useState<Set<string>>(() =>
    forceOpenAll ? new Set(sections.map((s) => s.title)) : new Set(),
  );
  useEffect(() => {
    if (forceOpenAll) {
      setOpenSections(new Set(sections.map((s) => s.title)));
    }
  }, [forceOpenAll, sections]);
  const [localDocs, setLocalDocs] = useState<ServiceDoc[]>(profileDocuments ?? []);
  const [reapplyingSection, setReapplyingSection] = useState<string | null>(null);

  // B-075 — sync localDocs when the parent re-fetches (e.g. after an
  // approve/revoke flips admin_status on the source doc).
  useEffect(() => {
    setLocalDocs(profileDocuments ?? []);
  }, [profileDocuments]);

  // B-077 Batch 3 — `findSourceDocForSection` returns the most recent
  // `field_extractions.source_document_id` for any field in the section
  // (used by AiPrefillBanner's primary status pill + View button).
  // `findSourceDocsForFields` returns the unique source docs that fed any
  // of the listed field keys (used by the per-section source-doc rows
  // and Batch 4's Address subdivider split).
  function findSourceDocForSection(section: KycSection): string | null {
    let best: { docId: string; at: number } | null = null;
    for (const f of section.fields) {
      const rows = extractionsByField[f.key];
      if (!rows) continue;
      for (const row of rows) {
        if (row.superseded_at !== null) continue;
        if (!row.source_document_id) continue;
        const at = new Date(row.extracted_at).getTime();
        if (!best || at > best.at) best = { docId: row.source_document_id, at };
      }
    }
    return best?.docId ?? null;
  }

  // B-084 Batch 3 — per-section doc allow-list (replaces B-078/4's
  // category-match). `allowedNames` is `KycSection.sourceDocTypeNames`
  // (or the hardcoded address subdivider list below). Only the docs
  // that actually verify a section's fields show as source-doc rows;
  // other category-matching docs continue to live in the bottom
  // Documents block. Empty `allowedNames` = no per-section rows.
  function findSectionDocs(allowedNames: string[]): {
    uploaded: ServiceDoc[];
    missing: DocumentType[];
  } {
    if (allowedNames.length === 0) return { uploaded: [], missing: [] };
    const allowed = new Set(allowedNames.map((n) => n.toLowerCase()));
    const types = (documentTypes ?? []).filter((dt) =>
      allowed.has(dt.name.toLowerCase()),
    );
    const uploaded: ServiceDoc[] = [];
    const missing: DocumentType[] = [];
    for (const dt of types) {
      const upload = localDocs.find((d) => d.document_type_id === dt.id);
      if (upload) uploaded.push(upload);
      else missing.push(dt);
    }
    return { uploaded, missing };
  }

  // B-084 Batch 3 — Address subdivider inside the individual Identity
  // section keeps its dedicated allow-list. Decoupled from the section's
  // own sourceDocTypeNames so admin sees Passport above and Proof of
  // Residential Address inside the Address subdivider.
  const ADDRESS_SUBDIVIDER_DOC_NAMES = ["Proof of Residential Address"];

  function handleViewSection(section: KycSection) {
    const docId = findSourceDocForSection(section);
    if (!docId) {
      toast.info("No source document found for this section.", {
        position: "top-right",
      });
      return;
    }
    onOpenDocumentDetail?.(docId);
  }

  // B-075 — re-apply: re-pull the most recent extracted value for each field
  // in `section` and PATCH them into the form. Mirrors the client wizard's
  // `Re-apply` behaviour. Admin can still trigger this even though they don't
  // edit the form; useful when a doc has been re-uploaded.
  //
  // B-117 Batch 3 — moved off the legacy `/api/profiles/kyc/save` endpoint
  // onto the same `PATCH /api/admin/profiles/[id]/kyc-fields` endpoint Save
  // uses. The legacy route routed `address` to `client_profiles` only,
  // leaving `client_profile_kyc.address` stale; the next parent re-fetch
  // pulled the stale kyc copy back into `initialFields`, which the dirty-
  // tracker's `useEffect` then reset `savedFields`/`draftFields` to — wiping
  // the re-applied values out of the visible form even though SOME columns
  // had persisted to the DB. The modern endpoint handles `address` as
  // dual-table, writes audit-log rows, and returns the post-update state
  // so the parent can splice via the same `onAfterReapply → onProfileSaved`
  // chain that Save uses.
  async function handleReapplySection(section: KycSection) {
    if (!profileId) return;
    const kycPatch: Record<string, unknown> = {};
    const profilePatch: Record<string, unknown> = {};
    for (const f of section.fields) {
      const rows = extractionsByField[f.key];
      if (!rows || rows.length === 0) continue;
      // Prefer the active (non-superseded) extraction; fall back to the most
      // recent row by extracted_at.
      const active = rows.find((r) => r.superseded_at === null);
      const latest =
        active ??
        [...rows].sort(
          (a, b) =>
            new Date(b.extracted_at).getTime() - new Date(a.extracted_at).getTime(),
        )[0];
      if (latest && latest.extracted_value != null) {
        // Mirror PersonCard's split: full_name / email / phone live on
        // `client_profiles`; everything else (including `address`, which
        // the server dual-writes) goes through kyc_fields.
        if (f.key === "full_name" || f.key === "email" || f.key === "phone") {
          profilePatch[f.key] = latest.extracted_value;
        } else {
          kycPatch[f.key] = latest.extracted_value;
        }
      }
    }
    if (
      Object.keys(kycPatch).length === 0 &&
      Object.keys(profilePatch).length === 0
    ) {
      toast.info("No extracted values to re-apply.", { position: "top-right" });
      return;
    }
    setReapplyingSection(section.title);
    try {
      const body: Record<string, unknown> = {};
      if (Object.keys(kycPatch).length > 0) body.kyc_fields = kycPatch;
      if (Object.keys(profilePatch).length > 0) body.profile_fields = profilePatch;
      const res = await fetch(
        `/api/admin/profiles/${profileId}/kyc-fields`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        profile?: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
        } | null;
        kyc?: Record<string, unknown> | null;
      };
      if (!res.ok) throw new Error(data.error ?? "Re-apply failed");

      // Merge server-authoritative values into the form state. The kyc
      // object is the full row, so we spread it; profile fields override
      // the three flat keys the form holds.
      const patched: Record<string, unknown> = {
        ...((data.kyc as Record<string, unknown> | null) ?? {}),
      };
      if (data.profile) {
        patched.full_name = data.profile.full_name ?? "";
        patched.email = data.profile.email ?? "";
        patched.phone = data.profile.phone ?? "";
      }
      setFields((prev) => ({ ...prev, ...patched }));
      // PersonCard syncs `savedFields` AND splices the post-update rows
      // into the parent's `roles` state. Without that splice the parent's
      // `client_profile_kyc[0]` stays stale, and on the next re-render
      // `initialFields` resets the form back to the pre-re-apply baseline
      // — which was the reported "doesn't persist" bug.
      onAfterReapply?.({
        kyc: (data.kyc as Record<string, unknown> | null) ?? null,
        profile: data.profile ?? null,
      });
      toast.success("Re-applied extracted values.", { position: "top-right" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Re-apply failed", {
        position: "top-right",
      });
    } finally {
      setReapplyingSection(null);
    }
  }

  // B-077 Batch 3 — `kycDocTypes` and `handleDocUploaded` removed
  // alongside the bottom flat doc list. Doc uploads now happen
  // exclusively from the grouped Documents collapsible at the end of
  // the per-profile view (Batch 2), wired through PersonCard's own
  // `handleAdminDocUpload`.

  function toggleSection(title: string) {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title); else next.add(title);
      return next;
    });
  }

  function sectionPct(section: KycSection): number {
    return calcKycSectionRequiredPct(section, fields).percentage;
  }

  return (
    <div className="space-y-3 mt-3">
      {sections.map(section => {
        const pct = sectionPct(section);
        const isOpen = openSections.has(section.title);
        const isIdentityIndividual = section.title === "Your Identity";
        // B-084 Batch 3 — per-section allow-list (`sourceDocTypeNames`).
        // Sections without an allow-list render no source-doc rows; admin
        // consults the bottom Documents block for those.
        const { uploaded: sectionUploaded, missing: sectionMissing } =
          findSectionDocs(section.sourceDocTypeNames ?? []);
        // Address subdivider lives only inside individual Identity. Uses
        // its own allow-list so the Passport row above stays clean.
        const { uploaded: addressUploaded, missing: addressMissing } =
          isIdentityIndividual
            ? findSectionDocs(ADDRESS_SUBDIVIDER_DOC_NAMES)
            : { uploaded: [] as ServiceDoc[], missing: [] as DocumentType[] };
        const primarySourceDocId = findSourceDocForSection(section);
        const primarySourceDoc = primarySourceDocId
          ? localDocs.find((d) => d.id === primarySourceDocId) ?? null
          : null;
        return (
          <KycLongFormSection
            key={section.title}
            section={section}
            pct={pct}
            isOpen={isOpen}
            onToggle={() => toggleSection(section.title)}
            fields={fields}
            setFields={setFields}
            extractionsByField={extractionsByField}
            sourceDocsForMarker={sourceDocsForMarker}
            profileId={profileId}
            sectionUploadedDocs={sectionUploaded}
            sectionMissingDocTypes={sectionMissing}
            addressUploadedDocs={addressUploaded}
            addressMissingDocTypes={addressMissing}
            primarySourceDoc={primarySourceDoc}
            onOpenDocumentDetail={onOpenDocumentDetail}
            onSectionDocUpload={onSectionDocUpload}
            uploadingDocTypeId={uploadingDocTypeId}
            onReapply={() => void handleReapplySection(section)}
            isReapplying={reapplyingSection === section.title}
            onView={
              primarySourceDocId
                ? () => handleViewSection(section)
                : undefined
            }
          />
        );
      })}
      {/* B-077 Batch 3 — InlineDocReviewPanel removed. View now opens
          PersonCard's DocumentDetailDialog via `onOpenDocumentDetail`
          for full Approve / Reject / Re-run AI / Send Update Request. */}
    </div>
  );
}

// B-074 — one row of the admin KYC long form. Renders inline review
// affordances (badge + Review button + notes history) when the section has
// a `categoryKey` and the form has a `profileId`. Replaces the parallel
// AdminKycPersonReviewPanel — same `kyc:<profileId>:<category>` keys, so any
// existing review rows continue to display correctly.
function KycLongFormSection({
  section,
  pct,
  isOpen,
  onToggle,
  fields,
  setFields,
  extractionsByField,
  sourceDocsForMarker,
  profileId,
  sectionUploadedDocs,
  sectionMissingDocTypes,
  addressUploadedDocs = [],
  addressMissingDocTypes = [],
  primarySourceDoc,
  onOpenDocumentDetail,
  onSectionDocUpload,
  uploadingDocTypeId,
  onReapply,
  isReapplying,
  onView,
}: {
  section: KycSection;
  pct: number;
  isOpen: boolean;
  onToggle: () => void;
  fields: Record<string, unknown>;
  setFields: React.Dispatch<React.SetStateAction<Record<string, unknown>>>;
  extractionsByField: Record<string, FieldExtraction[]>;
  sourceDocsForMarker: {
    id: string;
    file_name: string;
    mime_type: string | null;
    uploaded_at: string;
    verification_status: string;
  }[];
  profileId?: string;
  /** B-078 Batch 4 — uploaded docs whose `document_type.category`
   *  matches this section. Render above the AiPrefillBanner with View. */
  sectionUploadedDocs: ServiceDoc[];
  /** B-078 Batch 4 — required doc types in this section's category that
   *  have no upload yet. Render as empty-state rows with Upload. */
  sectionMissingDocTypes: DocumentType[];
  /** B-078 Batch 4 — Identity-only address split: address-named uploads. */
  addressUploadedDocs?: ServiceDoc[];
  /** B-078 Batch 4 — Identity-only address split: missing address types. */
  addressMissingDocTypes?: DocumentType[];
  /** B-077 Batch 3 — most recent source doc; backs the banner's status pill + View. */
  primarySourceDoc: ServiceDoc | null;
  /** B-077 Batch 3 — opens admin DocumentDetailDialog (lifted to PersonCard). */
  onOpenDocumentDetail?: (docId: string) => void;
  /** B-078 Batch 4 — Upload click on an empty-state row. */
  onSectionDocUpload?: (docTypeId: string) => void;
  uploadingDocTypeId?: string | null;
  onReapply?: () => void;
  isReapplying?: boolean;
  /** Admin-only: opens the doc detail dialog. Undefined hides the View button. */
  onView?: () => void;
}) {
  const reviewKey =
    section.categoryKey && profileId
      ? `kyc:${profileId}:${section.categoryKey}`
      : null;
  // Show the AI prefill banner whenever this section has at least one
  // field with a stored extraction — same trigger condition the client
  // wizard's IdentityStep uses.
  const hasExtractions = section.fields.some(
    (f) => (extractionsByField[f.key] ?? []).length > 0,
  );
  // B-077 Batch 3 — derive the AiPrefillBanner status pill from the
  // primary source doc (admin status takes precedence over AI status).
  const bannerStatus: AiPrefillBannerStatus | null = primarySourceDoc
    ? primarySourceDoc.admin_status === "approved"
      ? "approved"
      : primarySourceDoc.admin_status === "rejected"
        ? "rejected"
        : (primarySourceDoc.verification_status as AiPrefillBannerStatus | null) ??
          "pending"
    : null;
  // B-077 Batch 5 — DOM anchor for the per-profile Review Summary panel
  // to scroll into view when admin clicks a subsection row.
  const sectionAnchorId =
    section.categoryKey && profileId
      ? `kyc-section-${profileId}-${section.categoryKey}`
      : undefined;
  // B-087 — has the subsection been touched at all? Mirrors the B-086
  // pattern: any visible field has a non-empty value → flip empty
  // requireds' labels red. Stateless, recomputed each render.
  const sectionHasData = visibleFields(section.fields, fields).some((f) => {
    const v = fields[f.key];
    if (Array.isArray(v)) return v.some((x) => x != null && x !== "");
    return v != null && v !== "";
  });
  return (
    <div className="border rounded-lg overflow-hidden scroll-mt-80" id={sectionAnchorId}>
      <div
        onClick={onToggle}
        role="button"
        tabIndex={0}
        // B-113 — only act when focus is on the header itself, not bubbled
        // from a descendant. Without this guard, typing space inside the
        // SectionReviewPanel notes textarea (which portals to body but
        // still bubbles through React) collapses the section under it.
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`h-2 w-2 rounded-full ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-red-400"}`} />
          <span className="text-sm font-medium text-brand-navy">{section.title}</span>
          {reviewKey && <InlineReviewBadge sectionKey={reviewKey} />}
        </div>
        {/* B-076 — only the inline Review button stops propagation. The
            progress bar + chevron stay inside the toggle target so a
            click anywhere along the row (including the chevron) expands
            or collapses the section. */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
              <div className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[10px] text-gray-500 tabular-nums w-8">{pct}%</span>
          </div>
          {reviewKey && (
            <span onClick={(e) => e.stopPropagation()}>
              <InlineReviewButton
                sectionKey={reviewKey}
                sectionLabel={section.title}
                sectionIncomplete={pct < 100}
              />
            </span>
          )}
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </div>
      </div>
      {isOpen && (
        <div className="px-4 py-4 space-y-4">
          {section.description && (
            <p className="text-sm text-gray-600">{section.description}</p>
          )}
          {/* B-078 Batch 4 — single-line per-section doc rows. Uploaded
              docs render with View; missing required types render as
              empty-state rows with Upload. Both come from a category
              match (`document_types.category === section.categoryKey`)
              instead of AI extractions, so a hand-typed profile with a
              real upload still surfaces as a source-doc row. */}
          {(sectionUploadedDocs.length > 0 || sectionMissingDocTypes.length > 0) && (
            <div className="rounded-lg border bg-white divide-y">
              {sectionUploadedDocs.map((d) => {
                const rowData: KycDocRowData = {
                  id: d.id,
                  document_type_id: d.document_type_id ?? "",
                  document_name: d.document_types?.name ?? d.file_name ?? "Document",
                  is_uploaded: true,
                  verification_status: d.verification_status,
                  admin_status: d.admin_status ?? null,
                  file_name: d.file_name,
                  mime_type: d.mime_type,
                  uploaded_at: d.uploaded_at,
                  verification_result: (d.verification_result ?? null) as Record<string, unknown> | null,
                  admin_status_note: d.admin_status_note ?? null,
                  admin_status_at: d.admin_status_at ?? null,
                  expiry_date: d.expiry_date,
                  valid_for_months: d.document_types?.valid_for_months ?? null,
                };
                return (
                  <KycDocRow
                    key={d.id}
                    doc={rowData}
                    showAdminControls
                    onViewClick={(docId) => onOpenDocumentDetail?.(docId)}
                  />
                );
              })}
              {sectionMissingDocTypes.map((dt) => {
                const rowData: KycDocRowData = {
                  id: null,
                  document_type_id: dt.id,
                  document_name: dt.name,
                  is_uploaded: false,
                };
                return (
                  <KycDocRow
                    key={`missing-${dt.id}`}
                    doc={rowData}
                    showAdminControls
                    isUploading={uploadingDocTypeId === dt.id}
                    onUploadClick={(docTypeId) => onSectionDocUpload?.(docTypeId)}
                  />
                );
              })}
            </div>
          )}
          {hasExtractions && (
            <AiPrefillBanner
              onReapply={onReapply}
              isReapplying={isReapplying}
              onView={onView}
              showStatus={!!primarySourceDoc}
              documentStatus={bannerStatus}
            />
          )}
          {(() => {
            const visible = visibleFields(section.fields, fields);
            const renderField = (f: KycField) => {
              const isWide =
                f.type === "textarea" ||
                f.type === "country" ||
                Boolean(f.helperText) ||
                Boolean(f.showWhen);
              return (
                <div key={f.key} className={isWide ? "md:col-span-2" : ""}>
                  <KycLongFormField
                    field={f}
                    value={fields[f.key]}
                    onChange={(v) => setFields(prev => ({ ...prev, [f.key]: v }))}
                    extractions={extractionsByField[f.key] ?? []}
                    sourceDocs={sourceDocsForMarker}
                    sectionHasData={sectionHasData}
                  />
                </div>
              );
            };

            // B-077 Batch 4 — Identity uses a 3-band layout so the
            // Address subdivider sits between identity fields and the
            // post-address contact fields (email/phone). All other
            // sections fall back to a single grid.
            const isIdentityIndividual = section.title === "Your Identity";
            if (!isIdentityIndividual) {
              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visible.map(renderField)}
                </div>
              );
            }

            const ADDRESS_KEYS = new Set(["address"]);
            const POST_ADDRESS_KEYS = new Set(["email", "phone"]);
            const preAddress = visible.filter(
              (f) => !ADDRESS_KEYS.has(f.key) && !POST_ADDRESS_KEYS.has(f.key),
            );
            const addressFields = visible.filter((f) => ADDRESS_KEYS.has(f.key));
            const postAddress = visible.filter((f) => POST_ADDRESS_KEYS.has(f.key));

            return (
              <>
                {preAddress.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {preAddress.map(renderField)}
                  </div>
                )}

                {addressFields.length > 0 && (
                  <div className="border-t pt-4 mt-4 space-y-3">
                    <h4 className="text-sm font-semibold text-gray-700">
                      Address
                    </h4>
                    {(addressUploadedDocs.length > 0 ||
                      addressMissingDocTypes.length > 0) && (
                      <div className="rounded-lg border bg-white divide-y">
                        {addressUploadedDocs.map((d) => {
                          const rowData: KycDocRowData = {
                            id: d.id,
                            document_type_id: d.document_type_id ?? "",
                            document_name:
                              d.document_types?.name ?? d.file_name ?? "Document",
                            is_uploaded: true,
                            verification_status: d.verification_status,
                            admin_status: d.admin_status ?? null,
                            file_name: d.file_name,
                            mime_type: d.mime_type,
                            uploaded_at: d.uploaded_at,
                            verification_result:
                              (d.verification_result ?? null) as
                                | Record<string, unknown>
                                | null,
                            admin_status_note: d.admin_status_note ?? null,
                            admin_status_at: d.admin_status_at ?? null,
                            expiry_date: d.expiry_date,
                            valid_for_months: d.document_types?.valid_for_months ?? null,
                          };
                          return (
                            <KycDocRow
                              key={d.id}
                              doc={rowData}
                              showAdminControls
                              onViewClick={(docId) =>
                                onOpenDocumentDetail?.(docId)
                              }
                            />
                          );
                        })}
                        {addressMissingDocTypes.map((dt) => {
                          const rowData: KycDocRowData = {
                            id: null,
                            document_type_id: dt.id,
                            document_name: dt.name,
                            is_uploaded: false,
                          };
                          return (
                            <KycDocRow
                              key={`missing-${dt.id}`}
                              doc={rowData}
                              showAdminControls
                              isUploading={uploadingDocTypeId === dt.id}
                              onUploadClick={(docTypeId) =>
                                onSectionDocUpload?.(docTypeId)
                              }
                            />
                          );
                        })}
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {addressFields.map(renderField)}
                    </div>
                  </div>
                )}

                {postAddress.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                    {postAddress.map(renderField)}
                  </div>
                )}
              </>
            );
          })()}
          {/* B-077 Batch 3 — the legacy bottom flat DOCUMENTS list
              (KycDocSlot loop over kycDocTypes) was deleted. Per-section
              source-doc rows above the AiPrefillBanner replace it; the
              full grouped list lives in the collapsible Documents block
              at the END of the per-profile view (Batch 2). */}
          {reviewKey && (
            <div className="pt-2 border-t mt-2">
              <ConnectedNotesHistory sectionKey={reviewKey} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// B-075 — single field renderer for the admin KYC long form.
// Handles every type the shared schema supports (text/textarea/date/select/
// boolean/country) and wires the FieldProvenanceMarker next to the label
// so the admin sees the same provenance affordances the client wizard has.
//
// B-117 — collapsed the twin sparkle (hardcoded `field.aiExtractable` marker
// + dynamic provenance marker) into a single state-driven marker. Mismatch
// detection runs on `commitValue` which is synced from `value` only when the
// field is not actively being typed in — so the red flag doesn't flicker
// keystroke-by-keystroke.
function KycLongFormField({
  field,
  value,
  onChange,
  extractions,
  sourceDocs,
  disabled = false,
  sectionHasData = false,
}: {
  field: KycField;
  value: unknown;
  onChange: (next: unknown) => void;
  extractions: FieldExtraction[];
  sourceDocs: {
    id: string;
    file_name: string;
    mime_type: string | null;
    uploaded_at: string;
    verification_status: string;
  }[];
  /** B-075 — admin renders the form read-only; disables every input. */
  disabled?: boolean;
  /** B-087 — flips empty required labels red once the section has data. */
  sectionHasData?: boolean;
}) {
  const stringValue = (value ?? "") as string;
  // B-087 — match B-086's empty-required convention: array-aware emptiness
  // check, gated on `sectionHasData` so a fresh subsection stays default.
  const empty =
    value == null ||
    value === "" ||
    (Array.isArray(value) && !value.some((x) => x != null && x !== ""));
  const missing = !!field.required && empty && !!sectionHasData;

  // B-117 — committed value drives mismatch detection. For text/textarea we
  // wait for blur; for atomic-change fields (select/date/boolean/country)
  // every change is already a commit, so the isFocused guard never trips.
  const isFocusedRef = useRef(false);
  const [commitValue, setCommitValue] = useState<unknown>(value);
  useEffect(() => {
    if (!isFocusedRef.current) setCommitValue(value);
  }, [value]);
  const handleFocus = () => {
    isFocusedRef.current = true;
  };
  const handleBlur = () => {
    isFocusedRef.current = false;
    setCommitValue(value);
  };

  return (
    <div className="space-y-1">
      <label className={`flex items-center gap-1.5 text-sm font-medium ${missing ? "text-red-600" : "text-gray-900"}`}>
        <span>{field.label}</span>
        {field.required && (
          <span className="text-red-600" aria-hidden="true">*</span>
        )}
        <FieldProvenanceMarker
          extractions={extractions}
          sourceDocs={sourceDocs}
          fieldLabel={field.label}
          currentValue={commitValue}
          fieldType={field.type}
          onApplyValue={(v) => {
            onChange(v);
            setCommitValue(v);
          }}
        />
      </label>
      {field.type === "textarea" ? (
        <Textarea
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          rows={3}
          placeholder={field.placeholder}
          disabled={disabled}
          className="text-sm resize-none disabled:opacity-100 disabled:bg-gray-50 disabled:cursor-default"
        />
      ) : field.type === "boolean" ? (
        <select
          value={value === true ? "yes" : value === false ? "no" : ""}
          onChange={(e) =>
            onChange(
              e.target.value === "yes" ? true : e.target.value === "no" ? false : null,
            )
          }
          disabled={disabled}
          className="w-full border rounded-md px-3 py-2 text-sm bg-white disabled:bg-gray-50 disabled:opacity-100 disabled:cursor-default"
        >
          <option value="">— Select —</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      ) : field.type === "select" ? (
        <select
          value={stringValue}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          className="w-full border rounded-md px-3 py-2 text-sm bg-white disabled:bg-gray-50 disabled:opacity-100 disabled:cursor-default"
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : field.type === "date" ? (
        <Input
          type="date"
          value={stringValue}
          onChange={(e) => onChange(e.target.value || null)}
          disabled={disabled}
          className="text-sm disabled:opacity-100 disabled:bg-gray-50 disabled:cursor-default"
        />
      ) : field.type === "country" ? (
        // CountrySelect doesn't accept `disabled`; wrap in a pointer-events
        // container so admin still sees the value but can't open the picker.
        <div className={disabled ? "pointer-events-none opacity-90" : ""}>
          <CountrySelect
            value={stringValue}
            onChange={(v) => onChange(v)}
            placeholder={field.placeholder}
          />
        </div>
      ) : (
        <Input
          type="text"
          value={stringValue}
          onChange={(e) => onChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={field.placeholder}
          disabled={disabled}
          className="text-sm disabled:opacity-100 disabled:bg-gray-50 disabled:cursor-default"
        />
      )}
      {field.helperText && (
        <p className="mt-1 text-xs text-gray-500">{field.helperText}</p>
      )}
    </div>
  );
}

// B-074 — small wrappers so the long-form section row can read the live
// review status from context without rebuilding the full ConnectedSectionHeader
// (which renders its own CardHeader and would conflict with the existing
// collapsible header design).
function InlineReviewBadge({ sectionKey }: { sectionKey: string }) {
  const { currentStatus, latest } = useSectionReview(sectionKey);
  return (
    <SectionReviewBadge
      status={currentStatus}
      reviewedAt={latest?.reviewed_at}
      reviewerName={latest?.profiles?.full_name ?? null}
      notes={latest?.notes ?? null}
    />
  );
}

function InlineReviewButton({
  sectionKey,
  sectionLabel,
  sectionIncomplete,
}: {
  sectionKey: string;
  sectionLabel: string;
  /** B-110 — forwarded so admin can't silently mark an incomplete KYC
   *  subsection reviewed without acknowledging the override. */
  sectionIncomplete?: boolean;
}) {
  const { applicationId, currentStatus, onReviewSaved } = useSectionReview(sectionKey);
  return (
    <SectionReviewButton
      applicationId={applicationId}
      sectionKey={sectionKey}
      sectionLabel={sectionLabel}
      currentStatus={currentStatus}
      onReviewSaved={onReviewSaved}
      sectionIncomplete={sectionIncomplete}
    />
  );
}

// B-074 Batch 6 — at-a-glance KYC review status on the collapsed person card.
// Derives an aggregate badge from the per-category review keys covered by
// KycLongForm (matches what's reviewable in the inline form). Renders nothing
// until at least one of the categories has a review row, so unreviewed
// profiles stay visually clean.
function PersonAggregateReviewBadge({
  profileId,
  recordType,
}: {
  profileId: string;
  recordType?: string | null;
}) {
  // B-075 — KycLongForm now renders 3 individual sections matching the
  // client wizard (identity / financial / compliance). Legacy `professional`
  // category review rows still exist in DB but no longer have a slot.
  const cats = recordType === "organisation"
    ? ["identity", "tax"]
    : ["identity", "financial", "compliance"];
  const sectionKeys = cats.map((c) => `kyc:${profileId}:${c}`);
  const { status, reviewedCount, latest } = useAggregateStatus(sectionKeys);
  if (reviewedCount === 0) return null;
  return (
    <SectionReviewBadge
      status={status}
      reviewedAt={latest?.reviewed_at}
      reviewerName={latest?.profiles?.full_name ?? null}
      notes={latest?.notes ?? null}
    />
  );
}

// ─── Ownership Structure ──────────────────────────────────────────────────────

function OwnershipStructure({
  shareholders,
  serviceId,
  onSaved,
}: {
  shareholders: RoleWithProfile[];
  serviceId: string;
  onSaved: () => void;
}) {
  const initialPcts = Object.fromEntries(
    shareholders.map((r) => [r.id, r.shareholding_percentage ?? 0])
  );
  const [pcts, setPcts] = useState<Record<string, number>>(initialPcts);
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState(false);

  const total = Object.values(pcts).reduce((s, v) => s + (v || 0), 0);
  const isValid = Math.abs(total - 100) < 0.01;
  const unallocated = Math.max(0, 100 - total);

  // Keep in sync if shareholders change (e.g. after refresh)
  useEffect(() => {
    setPcts(Object.fromEntries(shareholders.map((r) => [r.id, r.shareholding_percentage ?? 0])));
  }, [shareholders]);

  // Default open if total ≠ 100
  useEffect(() => {
    if (!isValid) setOpen(true);
  }, [isValid]);

  if (shareholders.length === 0) return null;

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all(
        shareholders.map((r) =>
          fetch(`/api/admin/services/${serviceId}/roles/${r.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ shareholding_percentage: pcts[r.id] ?? 0 }),
          })
        )
      );
      toast.success("Ownership saved", { position: "top-right" });
      onSaved();
    } catch {
      toast.error("Failed to save ownership", { position: "top-right" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
          <span className="text-sm font-medium text-brand-navy">Ownership Structure</span>
          {!isValid && (
            <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
              ⚠ must total 100%
            </span>
          )}
        </div>
        <span className={`text-xs font-medium tabular-nums ${isValid ? "text-green-600" : "text-amber-600"}`}>
          {total.toFixed(total % 1 === 0 ? 0 : 1)}% / 100%
        </span>
      </button>

      {open && (
        <div className="px-4 py-3 space-y-2.5">
          {!isValid && (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              Shareholding must total 100% ({total.toFixed(1)}% assigned)
            </div>
          )}

          {shareholders.map((r) => {
            const pct = pcts[r.id] ?? 0;
            return (
              <div key={r.id} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 w-36 truncate shrink-0">
                  {r.client_profiles?.full_name ?? "Unknown"}
                </span>
                <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-500 transition-all"
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={0.1}
                    value={pct}
                    onChange={(e) => setPcts((prev) => ({ ...prev, [r.id]: parseFloat(e.target.value) || 0 }))}
                    className="w-16 border rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-blue"
                  />
                  <span className="text-xs text-gray-400">%</span>
                </div>
              </div>
            );
          })}

          {unallocated > 0.01 && (
            <div className="flex items-center gap-3 opacity-50">
              <span className="text-sm text-gray-400 w-36 italic shrink-0">Unallocated</span>
              <div className="flex-1 h-2 rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full rounded-full bg-gray-300" style={{ width: `${Math.min(unallocated, 100)}%` }} />
              </div>
              <span className="text-xs text-gray-400 w-16 text-right tabular-nums">{unallocated.toFixed(1)}%</span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t mt-1">
            <span className={`text-xs font-medium ${isValid ? "text-green-600" : "text-amber-700"}`}>
              Total: {total.toFixed(total % 1 === 0 ? 0 : 1)}%
            </span>
            <Button
              size="sm"
              className={`h-7 px-3 text-xs ${BTN_PRIMARY}`}
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Save Ownership
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// B-076 — `AdminKycDocListPanel` was deleted; the per-profile
// expanded view now uses the shared `KycDocsSummary` +
// `KycDocsByCategory` components directly inside `PersonCard`, with
// admin-only `View` click wired to the same `DocumentDetailDialog`.

// ─── Person Card ──────────────────────────────────────────────────────────────

function PersonCard({
  roleRow,
  allRoleRows,
  combinedRoles,
  serviceId,
  profileDocuments,
  documentTypes,
  requirements,
  updateRequests,
  defaultExpanded,
  fieldExtractions,
  waivers,
  onWaiversChange,
  adminNamesByUserId,
  onRefresh,
  onProfileSaved,
  onRemoved,
  onDdLevelChanged,
  pendingItems,
  onPendingAction,
  wizardSubStep,
  onCommunicationSent,
}: {
  roleRow: RoleWithProfile;
  allRoleRows: RoleWithProfile[];
  combinedRoles?: string[];
  serviceId: string;
  profileDocuments?: ServiceDoc[];
  documentTypes?: DocumentType[];
  /** B-090 — fed through so View Summary's shared dialog can render
   *  the missing-docs section identically to the client wizard. */
  requirements?: DueDiligenceRequirement[];
  updateRequests?: DocumentUpdateRequest[];
  defaultExpanded?: boolean;
  /** B-070 — provenance rows already filtered to this profile. */
  fieldExtractions?: FieldExtraction[];
  /** B-106 — waivers for this service. PersonCard filters internally to
   *  person-scope rows belonging to this profile, then surfaces a
   *  "Waived" badge + tooltip on each waived KYC doc row and adjusts the
   *  uploaded/total counts to exclude waived requirements. */
  waivers?: WaivedDocumentRequirement[];
  /** B-107 — splice waivers up into ServiceDetailClient's state so the
   *  per-profile Documents subsection can fire its own Waive / Un-waive
   *  actions through `KycDocsByCategory`. */
  onWaiversChange?: (next: WaivedDocumentRequirement[]) => void;
  /** B-106 — admin user_id → full_name map for the waiver tooltip's
   *  "by <name>" suffix. Cheap lookup; the page already loads admin users
   *  for other surfaces (loadServiceDetail). */
  adminNamesByUserId?: Record<string, string | null>;
  onRefresh: () => void;
  /** B-084 Batch 1 — splice updated kyc/profile back into the parent's
   *  roles state so the per-profile and aggregate completion % flip
   *  before the RSC refresh lands. */
  onProfileSaved?: (
    profileId: string,
    updatedKyc: Record<string, unknown> | null,
    updatedProfile: {
      full_name: string | null;
      email: string | null;
      phone: string | null;
    } | null,
  ) => void;
  /** B-101 Batch 3 — admin soft-deletes this profile from the service.
   *  Parent splices it out of the roles array immediately so the card
   *  disappears without waiting for the RSC roundtrip. */
  onRemoved?: (profileId: string) => void;
  /** B-113 Batch 2 — inline DD-level change splice. Parent updates the
   *  `roles` state so the KycLongForm below re-renders with the new
   *  `dueDiligenceLevel` and EDD-only fields show/hide immediately. */
  onDdLevelChanged?: (profileId: string, nextLevel: string) => void;
  /** B-113 Batch 3 — pre-computed per-profile pending items (parent
   *  derives via `computeProfilePendingItems`). Drives the "Pending (N)"
   *  popover on the Quick Actions row; empty array hides the button. */
  pendingItems?: PendingItem[];
  /** B-113 Batch 3 — popover row click handler. Parent passes the same
   *  `handlePendingAction` the service-level Pending card uses so the
   *  navigation behaviour stays consistent. */
  onPendingAction?: (item: PendingItem) => void;
  /** B-109 Batch 3 — when set, renders the per-profile sub-wizard in
   *  place of the standard expanded body. State (fields, save, doc
   *  upload, waivers) still lives in PersonCard; the sub-wizard is a
   *  presenter that calls back here. */
  wizardSubStep?: {
    subStepIndex: number;
    onSubStepChange: (next: number) => void;
    onBackToList: () => void;
    onProfileReviewed: () => void;
  } | null;
  /** B-118 Hotfix 2 — fires when a child dialog (InviteKycDialog,
   *  DocumentDetailDialog) just persisted an outbound email and the
   *  route echoed the inserted `service_communications` row. Parent
   *  splices the row into the right-rail Communications card for
   *  instant freshness, no refetch needed. */
  onCommunicationSent?: (communication: Record<string, unknown> | null | undefined) => void;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded ?? false);
  // B-077 Batch 2 — grouped Documents collapsible at the end of the
  // expanded view. Default collapsed to mirror the client wizard, where
  // the full doc list sits at the very end (sub-step 6 of 7).
  const [docsExpanded, setDocsExpanded] = useState(false);
  // B-077 Batch 5 — per-profile aggregate review side panel.
  const [reviewSummaryOpen, setReviewSummaryOpen] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [inviteSentAt, setInviteSentAt] = useState<string | null>(roleRow.invite_sent_at ?? null);
  // B-090 — local View Summary dialog. Opens the shared
  // PersonSummaryDialog; per-section Edit affordances close it and
  // smooth-scroll to the matching kyc-section anchor (handleSummaryEdit
  // below). State stays local to the card so each profile manages its
  // own modal independently.
  const [summaryOpen, setSummaryOpen] = useState(false);
  // B-076 — admin doc upload + detail dialog state, lifted out of the
  // deleted `AdminKycDocListPanel` so the new shared `KycDocsByCategory`
  // can reuse the same upload + view affordances per row.
  const [uploadingDocTypeId, setUploadingDocTypeId] = useState<string | null>(null);
  const [pendingUploadDocTypeId, setPendingUploadDocTypeId] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [detailDoc, setDetailDoc] = useState<DocumentDetailDoc | null>(null);
  // B-101 Batch 3 — soft-delete confirm + in-flight state.
  const [removeOpen, setRemoveOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  // B-078 Batch 1 — per-profile dirty tracking. `savedFields` is the last-
  // known-from-DB snapshot; `draftFields` holds in-flight edits that flow
  // to the Save bar (Batch 2 wires UI, Batch 3 wires the PATCH). Re-sync
  // both from props every time the parent re-fetches (`onRefresh`) so the
  // tracker resets cleanly after persistence elsewhere. Hooks must run
  // unconditionally so they sit before the early-return below.
  const kycForHook = roleRow.client_profiles
    ? Array.isArray(roleRow.client_profiles.client_profile_kyc)
      ? roleRow.client_profiles.client_profile_kyc[0] ?? null
      : (roleRow.client_profiles.client_profile_kyc as KycFull | null)
    : null;
  const initialFields = useMemo<Record<string, unknown>>(
    () => ({
      ...((kycForHook as Record<string, unknown> | null) ?? {}),
      full_name: roleRow.client_profiles?.full_name ?? "",
      email: roleRow.client_profiles?.email ?? "",
      phone: roleRow.client_profiles?.phone ?? "",
    }),
    [
      kycForHook,
      roleRow.client_profiles?.full_name,
      roleRow.client_profiles?.email,
      roleRow.client_profiles?.phone,
    ],
  );
  const [savedFields, setSavedFields] = useState<Record<string, unknown>>(initialFields);
  const [draftFields, setDraftFields] = useState<Record<string, unknown>>(initialFields);
  useEffect(() => {
    setSavedFields(initialFields);
    setDraftFields(initialFields);
  }, [initialFields]);

  const dirtyFieldKeys = useMemo(() => {
    const norm = (v: unknown) => (v === undefined || v === "" ? null : v);
    const valueEqual = (a: unknown, b: unknown) => {
      const na = norm(a);
      const nb = norm(b);
      if (na === nb) return true;
      if (na == null || nb == null) return false;
      if (typeof na === "object" && typeof nb === "object") {
        try {
          return JSON.stringify(na) === JSON.stringify(nb);
        } catch {
          return false;
        }
      }
      return false;
    };
    const keys = new Set<string>([
      ...Object.keys(savedFields),
      ...Object.keys(draftFields),
    ]);
    const out: string[] = [];
    keys.forEach((k) => {
      if (!valueEqual(draftFields[k], savedFields[k])) out.push(k);
    });
    return out;
  }, [draftFields, savedFields]);

  // B-078 Batch 3 — roles tracking. `KycRolesPicker` toggles update
  // `draftRoles` only; the diff against `savedRoles` is sent in the Save
  // payload (no auto-PATCH). Visible role keys depend on profile type
  // (org gets director + shareholder; individuals also get UBO).
  const visibleRoleKeys = useMemo<string[]>(
    () =>
      roleRow.client_profiles?.record_type === "organisation"
        ? ["director", "shareholder"]
        : ["director", "shareholder", "ubo"],
    [roleRow.client_profiles?.record_type],
  );
  const savedRoleSet = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    for (const r of allRoleRows) {
      if (visibleRoleKeys.includes(r.role)) s.add(r.role);
    }
    return s;
  }, [allRoleRows, visibleRoleKeys]);
  const [draftRoles, setDraftRoles] = useState<Set<string>>(savedRoleSet);
  useEffect(() => {
    setDraftRoles(new Set(savedRoleSet));
  }, [savedRoleSet]);

  const isFieldsDirty = dirtyFieldKeys.length > 0;
  const isRolesDirty = useMemo(() => {
    if (draftRoles.size !== savedRoleSet.size) return true;
    return Array.from(draftRoles).some((k) => !savedRoleSet.has(k));
  }, [draftRoles, savedRoleSet]);
  const isDirty = isFieldsDirty || isRolesDirty;
  const [savingKycBar, setSavingKycBar] = useState(false);

  // B-078 Batch 6 — navigation guard. When this profile has unsaved
  // changes, intercept (a) tab close / refresh via `beforeunload`, and
  // (b) clicks on `<a>` tags within the page (Next.js link clicks) plus
  // (c) clicks on a different profile's card header. Browser refresh
  // prompt is the only one we get for free; the in-page intercepts open
  // a 3-button dialog (Save & continue / Discard / Cancel).
  const [navDialog, setNavDialog] = useState<null | {
    onContinue: () => void;
  }>(null);
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);
  // Intercept link clicks within the document while this profile is dirty.
  // When the click lands on an `<a href>` outside this person card, we
  // prevent navigation and show the unsaved-changes dialog instead.
  useEffect(() => {
    if (!isDirty) return;
    const cardSelector = `#person-card-${roleRow.client_profiles?.id}`;
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const link = target.closest("a[href]") as HTMLAnchorElement | null;
      if (!link) return;
      const ownCard = target.closest(cardSelector);
      if (ownCard) return; // links inside this card don't trigger guard
      // Only intercept in-app navigation; allow modifier-clicks / new-tab.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (link.target === "_blank") return;
      e.preventDefault();
      e.stopPropagation();
      const href = link.getAttribute("href");
      setNavDialog({
        onContinue: () => {
          if (href) window.location.href = href;
        },
      });
    }
    document.addEventListener("click", onDocClick, true);
    return () => document.removeEventListener("click", onDocClick, true);
  }, [isDirty, roleRow.client_profiles?.id]);
  // Intercept clicks on other profiles' card headers while this profile
  // is dirty. The other PersonCard's header has `cursor-pointer` and
  // sits inside `#person-card-<id>`. We don't know which profile was
  // clicked from here — we just prompt and let the user re-click after
  // resolving. Keeps the behaviour minimal: if dirty and you clicked
  // outside the dirty card on another card, show the dialog.
  useEffect(() => {
    if (!isDirty) return;
    const ownCardSelector = `#person-card-${roleRow.client_profiles?.id}`;
    function onCardClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const otherCard = target.closest(
        '[id^="person-card-"]',
      ) as HTMLElement | null;
      if (!otherCard) return;
      const own = target.closest(ownCardSelector);
      if (own) return;
      // Only intercept clicks on the other card's header (not its body
      // when expanded). Header is the direct child with `cursor-pointer`.
      const header = target.closest(".cursor-pointer");
      if (!header || !otherCard.contains(header)) return;
      e.preventDefault();
      e.stopPropagation();
      setNavDialog({ onContinue: () => {} });
    }
    document.addEventListener("click", onCardClick, true);
    return () => document.removeEventListener("click", onCardClick, true);
  }, [isDirty, roleRow.client_profiles?.id]);

  // B-106 — must compute before the early return below to keep hook
  // order stable. Uses the optional id so it stays empty for null
  // profiles (which short-circuit on the next line anyway).
  const profileIdForWaivers = roleRow.client_profiles?.id ?? null;
  const waiverByDocTypeForProfile = useMemo(() => {
    const m = new Map<string, WaivedDocumentRequirement>();
    if (!profileIdForWaivers) return m;
    for (const w of waivers ?? []) {
      if (w.scope !== "person" || w.client_profile_id !== profileIdForWaivers) continue;
      m.set(w.document_type_id, w);
    }
    return m;
  }, [waivers, profileIdForWaivers]);

  if (!roleRow.client_profiles) return null;
  const profile = roleRow.client_profiles;
  // B-084 Batch 1 — derive `kyc` from `savedFields` (post-save splice)
  // instead of the prop `kycForHook`. `savedFields` already mirrors the
  // last-known DB state and gets updated immediately on Save, so the
  // per-profile pill flips without waiting for the parent re-fetch.
  const kyc = savedFields as KycFull;
  // B-114 — `kycPct` is computed further down (after `profileDocs` and
  // the scope-filtered `kycDocTypesForPct` are in scope), because the
  // helper now includes required docs + waivers in its denominator.
  // The legacy `kyc_journey_completed` flag is no longer surfaced in
  // the badge — pct ≥ 100 is the structural source of truth.

  // B-100 — Local Director: profile is a director on this service AND
  // `passport_country` is Mauritius (ISO3 = MUS). The dirty-tracker
  // already pulls passport_country into `savedFields`, so toggling
  // either dimension flips the badge live. Profile-level (`isRep` is
  // ineligible by definition — reps don't have KYC).
  const isLocalDirector =
    !profile.is_representative &&
    (kyc?.passport_country === "MUS") &&
    (combinedRoles ?? [roleRow.role]).includes("director");

  const sentDate = inviteSentAt
    ? new Date(inviteSentAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : null;

  const roleLabels = (combinedRoles ?? [roleRow.role]).join(", ");

  // B-076 — checkbox-style role picker mirrors the client. Legacy "other"
  // role is dropped from this surface; admin can still PATCH via DB.
  // B-078 Batch 3 — `visibleRoleKeys` lifted above the early-return so
  // it can feed the dirty-tracker hooks. Same values as before.
  const ROLE_LABEL: Record<string, string> = {
    director: "Director",
    shareholder: "Shareholder",
    ubo: "UBO",
  };
  const ROLE_TONE: Record<string, { active: string; activeHover: string }> = {
    director: { active: "bg-blue-50 text-blue-700 border-blue-200", activeHover: "hover:bg-blue-100" },
    shareholder: { active: "bg-purple-50 text-purple-700 border-purple-200", activeHover: "hover:bg-purple-100" },
    ubo: { active: "bg-amber-50 text-amber-700 border-amber-200", activeHover: "hover:bg-amber-100" },
  };

  // B-078 Batch 3 — toggle now updates `draftRoles` only. The diff is
  // committed by the bottom Save bar via `handleKycBarSave`.
  async function toggleRoleAdmin(roleKey: string) {
    setDraftRoles((prev) => {
      const next = new Set(prev);
      if (next.has(roleKey)) next.delete(roleKey);
      else next.add(roleKey);
      return next;
    });
  }

  // B-078 Batch 3 — bottom Save / Cancel bar handlers, now wired to the
  // unified `PATCH /api/admin/profiles/[id]/kyc-fields` endpoint. One
  // round-trip persists kyc_fields + profile_fields + role diff.
  // Cancel reverts every dirty field + draft roles back to the last-
  // known-from-DB snapshot.
  // B-105 — `address` is dual-table (lives on BOTH `client_profiles.address`
  // AND `client_profile_kyc.address`). The admin page reads address from the
  // kyc spread, so the kyc copy MUST be the one we write to. Routing address
  // through `kyc_fields` lets the server's DUAL_TABLE_KEYS splitter (B-104)
  // write to both tables. If we put it in `profile_fields` here, the server
  // splitter never runs for address and only `client_profiles` updates —
  // leaving `client_profile_kyc.address` stale, which then overwrites the
  // form's value on the post-save refresh. (B-100's profile-only routing
  // and B-104's server splitter were both correct but the splitter was
  // unreachable from this caller until address moved out of this set.)
  const PROFILE_FIELD_KEYS = new Set(["full_name", "email", "phone"]);
  // B-109 Batch 3 — returns true on success / no-op so callers (the
  // per-profile sub-wizard) can gate auto-advance on save success.
  async function handleKycBarSave(): Promise<boolean> {
    if (!isDirty || savingKycBar) return true;
    setSavingKycBar(true);
    try {
      const kycPatch: Record<string, unknown> = {};
      const profilePatch: Record<string, unknown> = {};
      for (const k of dirtyFieldKeys) {
        if (PROFILE_FIELD_KEYS.has(k)) {
          profilePatch[k] = draftFields[k];
        } else {
          kycPatch[k] = draftFields[k];
        }
      }
      // Role diff against the saved set.
      const rolesAdd: Array<{ service_role_type: "director" | "shareholder" | "ubo" }> = [];
      const rolesRemove: Array<{ id: string }> = [];
      if (isRolesDirty) {
        Array.from(draftRoles).forEach((rk) => {
          if (!savedRoleSet.has(rk)) {
            rolesAdd.push({
              service_role_type: rk as "director" | "shareholder" | "ubo",
            });
          }
        });
        Array.from(savedRoleSet).forEach((rk) => {
          if (!draftRoles.has(rk)) {
            const row = allRoleRows.find((r) => r.role === rk);
            if (row) rolesRemove.push({ id: row.id });
          }
        });
      }

      const payload: Record<string, unknown> = {};
      if (Object.keys(kycPatch).length > 0) payload.kyc_fields = kycPatch;
      if (Object.keys(profilePatch).length > 0) payload.profile_fields = profilePatch;
      if (rolesAdd.length > 0 || rolesRemove.length > 0) {
        payload.roles = {
          service_id: serviceId,
          add: rolesAdd,
          remove: rolesRemove,
        };
      }

      const res = await fetch(
        `/api/admin/profiles/${profile.id}/kyc-fields`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const data = (await res.json()) as {
        error?: string;
        profile?: {
          id: string;
          full_name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
        } | null;
        kyc?: Record<string, unknown> | null;
        roles?: Array<{ id: string; role: string; service_id: string }>;
      };
      if (!res.ok) throw new Error(data.error ?? "Failed to save");

      // Reset savedFields from the returned post-update state so the
      // dirty tracker zeroes out without a second fetch. `onRefresh`
      // still kicks off the full parent re-fetch so adjacent UI (audit
      // panel, ownership %, KYC% bar) updates too.
      const nextSaved: Record<string, unknown> = { ...savedFields };
      for (const [k, v] of Object.entries(data.kyc ?? {})) {
        nextSaved[k] = v;
      }
      if (data.profile) {
        nextSaved.full_name = data.profile.full_name ?? "";
        nextSaved.email = data.profile.email ?? "";
        nextSaved.phone = data.profile.phone ?? "";
        // B-105 — `address` flows back through `data.kyc.address` like
        // every other kyc field, picked up by the loop above. No
        // separate override needed.
      }
      setSavedFields(nextSaved);
      setDraftFields(nextSaved);
      // B-084 Batch 1 — splice the post-save kyc + profile rows into the
      // parent so `peopleKycPct` and the per-profile pill recompute with
      // the new data without waiting for the RSC roundtrip below.
      onProfileSaved?.(
        profile.id,
        (data.kyc as Record<string, unknown> | null) ?? null,
        data.profile ?? null,
      );
      toast.success("Changes saved.", { position: "top-right" });
      onRefresh();
      return true;
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? `Failed to save: ${err.message}` : "Failed to save",
        { position: "top-right" },
      );
      return false;
    } finally {
      setSavingKycBar(false);
    }
  }
  function handleKycBarCancel() {
    if (!isDirty || savingKycBar) return;
    setDraftFields(savedFields);
    setDraftRoles(new Set(savedRoleSet));
    toast.info("Changes discarded.", { position: "top-right" });
  }

  // B-117 Batch 3 — single sync handler for Re-apply, mirroring what
  // handleKycBarSave does for the manual Save bar. KycLongForm hits the
  // same kyc-fields endpoint and hands us the post-update rows; we
  // (a) reset both savedFields AND draftFields off the server data so
  // the dirty tracker zeroes out, (b) splice into the parent's `roles`
  // so the per-profile KYC% pill and peopleKycPct recompute immediately,
  // and (c) trigger onRefresh for the audit-log + adjacent UI.
  function handleAfterReapply(server: {
    kyc: Record<string, unknown> | null;
    profile: {
      id: string;
      full_name: string | null;
      email: string | null;
      phone: string | null;
      address: string | null;
    } | null;
  }) {
    const nextSaved: Record<string, unknown> = { ...savedFields };
    for (const [k, v] of Object.entries(server.kyc ?? {})) {
      nextSaved[k] = v;
    }
    if (server.profile) {
      nextSaved.full_name = server.profile.full_name ?? "";
      nextSaved.email = server.profile.email ?? "";
      nextSaved.phone = server.profile.phone ?? "";
    }
    setSavedFields(nextSaved);
    setDraftFields(nextSaved);
    onProfileSaved?.(profile.id, server.kyc, server.profile);
    onRefresh();
  }

  // B-076 — old handleRemoveRole / handleAddRole + dropdown picker
  // were replaced by `toggleRoleAdmin` (above) which the shared
  // `KycRolesPicker` calls per checkbox toggle.

  // B-076 — per-profile KYC doc data builders. Lifted from the deleted
  // `AdminKycDocListPanel`; consumed by `KycDocsSummary` (status box)
  // + `KycDocsByCategory` (grouped per-category list).
  // B-106 — waivers carrying `scope === "person"` for this profile
  // become `is_waived` rows in the list and drop out of the
  // uploaded/total summary counts.
  const profileDocs = (profileDocuments ?? []).filter(
    (d) => d.client_profile_id === profile.id,
  );
  const kycDocTypes = (documentTypes ?? []).filter((dt) => isKycDoc(dt.category));
  // B-114 — scope-filtered list (active person-scope doc types) for the
  // calcKycPct denominator. Mirrors the parent-level memo used by the
  // service-level aggregators. Kept separate from the category-grouped
  // `kycDocTypes` above, which drives the section UI by display category.
  const kycDocTypesForPct = (documentTypes ?? []).filter(
    (dt) => (dt.scope ?? "person") === "person" && dt.is_active !== false,
  );
  // B-114 — profile-level KYC % now counts required fields + required
  // KYC docs (waiver-aware), branched by `record_type` so organisation
  // profiles report against the org schema and the badge tells the truth.
  const kycPct = calcKycPct({
    kyc,
    profile,
    profileDocs,
    kycDocTypes: kycDocTypesForPct,
    waivers: waivers ?? [],
    profileId: profile.id,
  });
  const kycDocsByCategory = (() => {
    const groups: Record<string, DocumentType[]> = {};
    for (const dt of kycDocTypes) {
      const cat = dt.category || "additional";
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(dt);
    }
    const present = sortKycCategories(Object.keys(groups));
    return present.map((cat) => ({
      key: cat,
      label: kycCategoryLabel(cat),
      docs: groups[cat].map<KycDocRowData>((dt) => {
        const uploaded = profileDocs.find((d) => d.document_type_id === dt.id);
        const waiver = waiverByDocTypeForProfile.get(dt.id) ?? null;
        const waivedByName = waiver
          ? adminNamesByUserId?.[waiver.waived_by] ?? null
          : null;
        return {
          id: uploaded?.id ?? null,
          document_type_id: dt.id,
          document_name: dt.name,
          is_uploaded: !!uploaded,
          verification_status: uploaded?.verification_status ?? null,
          admin_status: uploaded?.admin_status ?? null,
          file_name: uploaded?.file_name ?? null,
          mime_type: uploaded?.mime_type ?? null,
          uploaded_at: uploaded?.uploaded_at ?? null,
          verification_result: (uploaded?.verification_result as Record<string, unknown> | null) ?? null,
          admin_status_note: uploaded?.admin_status_note ?? null,
          admin_status_at: uploaded?.admin_status_at ?? null,
          expiry_date: uploaded?.expiry_date ?? null,
          valid_for_months: dt.valid_for_months ?? null,
          is_waived: waiver !== null,
          waived_at: waiver?.waived_at ?? null,
          waived_by_name: waivedByName,
        };
      }),
    }));
  })();

  const totalKycDocs = kycDocsByCategory.reduce((acc, c) => acc + c.docs.length, 0);
  const totalKycWaived = kycDocsByCategory.reduce(
    (acc, c) => acc + c.docs.filter((d) => d.is_waived).length,
    0,
  );
  // B-106 — denominator excludes waived doc types; numerator already
  // counts uploads (waived rows aren't uploaded).
  const totalKycRequired = totalKycDocs - totalKycWaived;
  const totalKycUploaded = kycDocsByCategory.reduce(
    (acc, c) => acc + c.docs.filter((d) => d.is_uploaded && !d.is_waived).length,
    0,
  );
  // B-107 — waived docs count toward "done" for the section pct so a
  // profile with everything either uploaded or waived shows 100% on the
  // collapsed Documents header. The text breakdown still keeps the
  // explicit "uploaded · waived" split for readability.
  const totalKycDone = totalKycUploaded + totalKycWaived;
  const kycDonePct =
    totalKycDocs > 0
      ? Math.round((totalKycDone / totalKycDocs) * 100)
      : 0;
  const kycAllDone = totalKycDocs > 0 && totalKycDone === totalKycDocs;

  async function handleAdminDocUpload(docTypeId: string, file: File) {
    setUploadingDocTypeId(docTypeId);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentTypeId", docTypeId);
      fd.append("clientProfileId", profile.id);
      const res = await fetch(`/api/admin/services/${serviceId}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { document?: unknown; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      toast.success("Document uploaded", { position: "top-right" });
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed", { position: "top-right" });
    } finally {
      setUploadingDocTypeId(null);
    }
  }

  function handleAdminViewDoc(docId: string) {
    const uploaded = profileDocs.find((d) => d.id === docId);
    if (!uploaded) return;
    setDetailDoc({
      id: uploaded.id,
      file_name: uploaded.file_name,
      mime_type: uploaded.mime_type,
      uploaded_at: uploaded.uploaded_at,
      document_type_id: uploaded.document_type_id,
      verification_status: uploaded.verification_status,
      verification_result: uploaded.verification_result,
      admin_status: uploaded.admin_status,
      admin_status_note: uploaded.admin_status_note,
      admin_status_at: uploaded.admin_status_at,
      document_types: uploaded.document_types,
      client_profiles: uploaded.client_profiles,
    });
  }

  const detailDocRecipients = [
    {
      id: profile.id,
      name: profile.full_name ?? "Document owner",
      email: profile.email ?? null,
      label: "Document owner",
    },
  ];

  // B-077 Batch 5 — reviewable subsection set per profile, mirrors
  // PersonAggregateReviewBadge's category list and KycLongForm's
  // section schema.
  const kycSubsections: PerProfileSubsection[] = (() => {
    const cats: { key: string; label: string }[] =
      profile.record_type === "organisation"
        ? [
            { key: "identity", label: "Company Details" },
            { key: "tax", label: "Tax / Financial" },
          ]
        : [
            { key: "identity", label: "Identity" },
            { key: "financial", label: "Financial Profile" },
            { key: "compliance", label: "Declarations" },
          ];
    return cats.map((c) => ({
      key: `kyc:${profile.id}:${c.key}`,
      label: c.label,
      anchorId: `kyc-section-${profile.id}-${c.key}`,
    }));
  })();

  async function toggleManage() {
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/roles/${roleRow.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ can_manage: !roleRow.can_manage }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      toast.success(roleRow.can_manage ? "Portal access removed" : "Portal access granted", { position: "top-right" });
      onRefresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update", { position: "top-right" });
    }
  }

  return (
    <div
      id={`person-card-${profile.id}`}
      className="border rounded-xl overflow-hidden scroll-mt-80"
    >
      {/* ── Clickable header ─────────────────────────────────────────── */}
      {/* B-080..B-082 evolved a #7dbbe3 pill from a tight wrapper around
          the name to a content-width row containing name + roles + KYC%
          + aggregate badge + Show/Hide.
          B-083 — pill becomes a full-width flex justify-between
          container: left cluster (icon + name + role badges + KYC%)
          hugs the left edge, Show/Hide hugs the right edge with empty
          light-blue space between. PersonAggregateReviewBadge moves
          OUTSIDE the pill, mirroring how SectionReviewBadge sits
          outside the top-level pill. Quick actions row stays on the
          regular row background underneath. */}
      <div
        className="p-4 cursor-pointer hover:bg-gray-50/70 transition-colors"
        onClick={() => {
          // B-078 Batch 6 — collapsing while dirty is treated as a
          // navigation: prompt before discarding.
          if (expanded && isDirty) {
            setNavDialog({ onContinue: () => setExpanded(false) });
            return;
          }
          setExpanded(!expanded);
        }}
      >
        <div className="space-y-1.5">
          {/* Top row: full-width pill + PersonAggregateReviewBadge sibling */}
          <div className="flex items-center gap-2">
            <span className="flex flex-1 items-center justify-between gap-3 px-3 py-1 rounded-md bg-[#7dbbe3] text-brand-navy text-sm font-medium min-w-0">
              {/* Left cluster — icon + name + role + KYC% (collapsed only) */}
              <span className="inline-flex items-center gap-1.5 min-w-0">
                {profile.is_representative ? (
                  <Users2 className="h-3.5 w-3.5 text-brand-navy shrink-0" />
                ) : profile.record_type === "organisation" ? (
                  <Building2 className="h-3.5 w-3.5 text-brand-navy shrink-0" />
                ) : (
                  <UserCheck className="h-3.5 w-3.5 text-brand-navy shrink-0" />
                )}
                <span className="font-medium truncate">{profile.full_name}</span>
                {!expanded && (
                  <>
                    {(combinedRoles ?? [roleRow.role]).map((r) => (
                      <span key={r} className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-white/70 text-brand-navy shrink-0">
                        {r}
                      </span>
                    ))}
                    {!profile.is_representative && (
                      // B-114 — color-code by `kycPct` (green ≥100, amber
                      // >0, red 0) so the badge reflects the actual
                      // readiness of fields + docs. `kycDone` is the
                      // user's "I'm done" affirmation; pct ≥100 is the
                      // structural answer and is what admin acts on.
                      <span
                        className={`text-xs font-medium tabular-nums shrink-0 ${
                          kycPct >= 100
                            ? "text-green-700"
                            : kycPct > 0
                              ? "text-amber-700"
                              : "text-red-600"
                        }`}
                      >
                        KYC: {kycPct}%
                      </span>
                    )}
                    {/* B-100 — Local Director badge. director on this
                        service + passport_country = MUS. */}
                    {isLocalDirector && (
                      <span className="inline-flex items-center rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-medium text-brand-navy shrink-0">
                        Local Director
                      </span>
                    )}
                  </>
                )}
                {expanded && (
                  <span className="text-[11px] italic font-normal text-brand-navy/70 shrink-0">
                    scroll for details
                  </span>
                )}
              </span>

              {/* Right: Show/Hide toggle */}
              <span className="inline-flex items-center gap-1 text-xs text-brand-navy/80 shrink-0">
                {expanded ? "Hide" : "Show"}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />
              </span>
            </span>

            {/* Aggregate review badge — sibling on regular row background */}
            {!profile.is_representative && (
              <PersonAggregateReviewBadge
                profileId={profile.id}
                recordType={profile.record_type}
              />
            )}
          </div>

          {/* Quick actions — outside pill, on regular row background */}
          <div className="flex items-center flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => void toggleManage()}
              className={`flex items-center gap-1 text-xs rounded px-2 py-1 transition-colors ${
                roleRow.can_manage ? "bg-green-50 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              {roleRow.can_manage ? <CheckCircle className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
              Portal access
            </button>
            {/* B-113 Batch 2 — inline DD-level selector. Representatives
                don't have KYC of their own, so we don't surface the
                control on rep cards. Parent splices the new level into
                `roles` so the KycLongForm below re-renders with
                `gateSectionForLevel` and EDD-only fields appear/hide
                without a page reload. */}
            {!profile.is_representative && (
              <ProfileDdLevelSelector
                profileId={profile.id}
                currentLevel={profile.due_diligence_level}
                onLevelChanged={(next) =>
                  onDdLevelChanged?.(profile.id, next)
                }
              />
            )}
            {/* B-113 Batch 3 — per-profile Pending popover. Hidden when
                the profile has nothing pending so a clean profile keeps
                the header strip uncluttered. Reuses the page-level
                `handlePendingAction` so navigation is consistent with
                the service-level Pending card. */}
            {!profile.is_representative &&
              pendingItems &&
              onPendingAction && (
                <ProfilePendingButton
                  items={pendingItems}
                  onAction={onPendingAction}
                />
              )}
            {!profile.is_representative && (
              <Button size="sm" variant="outline" onClick={() => setShowInviteDialog(true)} className={`h-6 text-xs gap-1 ${BTN_OUTLINE}`}>
                <Mail className="h-3 w-3" />
                {inviteSentAt ? "Resend KYC" : "Request KYC"}
              </Button>
            )}
            {!profile.is_representative && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSummaryOpen(true)}
                className={`h-6 text-xs gap-1 ${BTN_OUTLINE}`}
              >
                <Eye className="h-3 w-3" />
                View Summary
              </Button>
            )}
            {inviteSentAt && sentDate && (
              <span className="text-[11px] text-green-600 flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Sent {sentDate}
              </span>
            )}
            {/* B-101 Batch 3 — soft-delete profile from this service.
                Only rendered when the card is expanded so the action
                requires a deliberate two-step (expand → remove). */}
            {expanded && onRemoved && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRemoveOpen(true)}
                className={`h-6 text-xs gap-1 ml-auto ${BTN_DESTRUCTIVE_OUTLINE}`}
              >
                <Trash2 className="h-3 w-3" />
                Remove from service
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Expanded body ────────────────────────────────────────────── */}
      {/* B-077 Batch 1 — vertical containment. The sticky banner spans
          the full body width (so it pins to the top of the viewport).
          Everything below the banner is wrapped in a `border-l-4`
          container with left padding so the gray rule is clearly
          visible inside the card edge, mirroring the client wizard's
          per-profile indent. */}
      {expanded && (
        <div
          className="border-t"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sticky profile banner — single source of truth for the
              profile name + role badges + KYC% while expanded. Stays
              visible as admin scrolls through the long form.
              B-078 Batch 3 — name + email are now inline-editable. The
              inputs share the banner's gray-50 background and underline
              on focus; click anywhere on the text to start typing. */}
          <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/80 border-b px-4 py-2 flex items-center gap-2 flex-wrap">
            {profile.is_representative ? (
              <Users2 className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            ) : profile.record_type === "organisation" ? (
              <Building2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            ) : (
              <UserCheck className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            )}
            <input
              type="text"
              aria-label="Profile full name"
              value={(draftFields.full_name as string) ?? ""}
              onChange={(e) =>
                setDraftFields((prev) => ({ ...prev, full_name: e.target.value }))
              }
              placeholder="Full legal name"
              className="text-sm font-semibold text-brand-navy bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-brand-blue focus:outline-none focus:ring-0 px-0 py-0.5 min-w-[120px] max-w-[260px]"
            />
            <input
              type="email"
              aria-label="Profile email"
              value={(draftFields.email as string) ?? ""}
              onChange={(e) =>
                setDraftFields((prev) => ({ ...prev, email: e.target.value }))
              }
              placeholder="email@example.com"
              className="text-xs text-gray-600 bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-brand-blue focus:outline-none focus:ring-0 px-0 py-0.5 min-w-[140px] max-w-[260px]"
            />
            {(combinedRoles ?? [roleRow.role]).map((r) => (
              <span
                key={r}
                className="text-[10px] capitalize px-1.5 py-0.5 rounded bg-brand-navy/10 text-brand-navy shrink-0"
              >
                {r}
              </span>
            ))}
            {!profile.is_representative && (
              <div className="ml-auto flex items-center gap-2 shrink-0 flex-wrap justify-end">
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      // B-114 — pct-based color matches the collapsed-pill badge.
                      className={`h-full rounded-full ${kycPct >= 100 ? "bg-green-500" : kycPct > 0 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${kycPct}%` }}
                    />
                  </div>
                  <span
                    className={`text-[11px] font-medium tabular-nums ${kycPct >= 100 ? "text-green-600" : kycPct > 0 ? "text-amber-600" : "text-red-500"}`}
                  >
                    {kycPct}%
                  </span>
                  {/* B-100 — Local Director badge mirrors the collapsed
                      header so the indicator stays in view while admin
                      is editing the long-form. */}
                  {isLocalDirector && (
                    <span className="inline-flex items-center rounded-full bg-brand-navy/10 px-2 py-0.5 text-[10px] font-medium text-brand-navy">
                      Local Director
                    </span>
                  )}
                </div>
                {kyc && kycSubsections.length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className={`h-7 px-2 text-xs ${BTN_OUTLINE}`}
                    onClick={() => setReviewSummaryOpen(true)}
                  >
                    Review {profile.full_name?.split(" ")[0] ?? "profile"}
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* B-109 Batch 3 — sub-wizard mode replaces the entire vertical
              containment block. The sticky banner above stays so admin sees
              who they're reviewing; the sub-wizard owns the rest (sub-step
              indicator + active section + bottom nav). */}
          {wizardSubStep ? (
          <div className="m-4" data-profile-id={profile.id}>
            <AdminPerProfileReviewWizard
              serviceId={serviceId}
              profileId={profile.id}
              profileName={profile.full_name ?? "Profile"}
              recordType={profile.record_type ?? null}
              dueDiligenceLevel={profile.due_diligence_level ?? null}
              onSave={handleKycBarSave}
              isDirty={isDirty}
              saving={savingKycBar}
              kycDocsByCategory={kycDocsByCategory}
              totalKycUploaded={totalKycUploaded}
              totalKycRequired={totalKycRequired}
              totalKycWaived={totalKycWaived}
              waivers={waivers ?? []}
              onWaiversChange={onWaiversChange ?? (() => {})}
              onUploadClickFromDocs={(docTypeId) => {
                setPendingUploadDocTypeId(docTypeId);
                uploadInputRef.current?.click();
              }}
              onViewDoc={handleAdminViewDoc}
              uploadingDocTypeId={uploadingDocTypeId}
              profileKycPct={kycPct}
              subStepIndex={wizardSubStep.subStepIndex}
              onSubStepChange={wizardSubStep.onSubStepChange}
              onBackToList={wizardSubStep.onBackToList}
              onProfileReviewed={wizardSubStep.onProfileReviewed}
              renderFormSection={(sectionTitle) => (
                <KycLongForm
                  kyc={kyc}
                  profileId={profile.id}
                  profileDocuments={profileDocs}
                  documentTypes={documentTypes}
                  recordType={profile.record_type}
                  dueDiligenceLevel={profile.due_diligence_level}
                  fieldExtractions={fieldExtractions ?? []}
                  onOpenDocumentDetail={handleAdminViewDoc}
                  onSectionDocUpload={(docTypeId) => {
                    setPendingUploadDocTypeId(docTypeId);
                    uploadInputRef.current?.click();
                  }}
                  uploadingDocTypeId={uploadingDocTypeId}
                  fields={draftFields}
                  setFields={setDraftFields}
                  onAfterReapply={(server) => handleAfterReapply(server)}
                  restrictToSectionTitles={[sectionTitle]}
                  forceOpenAll
                />
              )}
            />
            {/* B-109 Batch 3 — sub-wizard mode keeps the upload input
                mounted so KYC docs can still be uploaded from the
                Documents sub-step. */}
            <input
              ref={uploadInputRef}
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file && pendingUploadDocTypeId) {
                  void handleAdminDocUpload(pendingUploadDocTypeId, file);
                }
                e.target.value = "";
                setPendingUploadDocTypeId(null);
              }}
            />
          </div>
          ) : (
          /* Vertical containment wrapper — gray rule down the left edge
              of the entire profile content (B-077 QA #2). The wrapper
              starts inside the card with margins so the rule reads as a
              clear indent rather than blending with the card border. */
          <div
            className="border-l-4 border-[#7dbbe3] ml-4 mr-4 my-4 pl-4"
            data-profile-id={profile.id}
          >

          {/* B-076 — visual parity with client wizard. Stacked top to
              bottom: Roles picker → KYC docs status box → grouped
              category sections. The legacy 2-col PROFILE | KYC DOCUMENTS
              grid is gone; "Edit email / phone" surfaces as an inline
              link below the role picker. */}
          <div className="space-y-4 pb-4 border-b">
            <div className="flex items-center gap-3 flex-wrap">
              <KycRolesPicker
                selectedRoles={Array.from(draftRoles)}
                availableRoles={visibleRoleKeys.map((rk) => ({
                  key: rk,
                  label: ROLE_LABEL[rk] ?? rk,
                  activeClass: ROLE_TONE[rk]?.active,
                  activeHoverClass: ROLE_TONE[rk]?.activeHover,
                }))}
                onToggleRole={toggleRoleAdmin}
              />
            </div>

            {/* B-077 Batch 2 — keep the compact KYC DOCUMENTS status box
                at the top for at-a-glance counts. Clicking a category
                still scrolls to the now-relocated grouped list at the
                bottom (auto-expanding it via setDocsExpanded). */}
            <KycDocsSummary
              uploadCount={totalKycUploaded}
              totalCount={totalKycRequired}
              waivedCount={totalKycWaived}
              byCategory={kycDocsByCategory.map((c) => ({
                key: c.key,
                label: c.label,
                uploaded: c.docs.filter((d) => d.is_uploaded && !d.is_waived).length,
                total: c.docs.filter((d) => !d.is_waived).length,
              }))}
              onCategoryClick={(cat) => {
                setDocsExpanded(true);
                requestAnimationFrame(() =>
                  document
                    .getElementById(`admin-docs-${profile.id}-cat-${cat}`)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                );
              }}
            />
          </div>

          {/* KYC form (below split section) */}
          {kyc && (
            <div className="pt-3">
              <KycLongForm
                kyc={kyc}
                profileId={profile.id}
                profileDocuments={profileDocuments}
                documentTypes={documentTypes}
                recordType={profile.record_type}
                dueDiligenceLevel={profile.due_diligence_level}
                fieldExtractions={fieldExtractions ?? []}
                onOpenDocumentDetail={handleAdminViewDoc}
                onSectionDocUpload={(docTypeId) => {
                  setPendingUploadDocTypeId(docTypeId);
                  uploadInputRef.current?.click();
                }}
                uploadingDocTypeId={uploadingDocTypeId}
                fields={draftFields}
                setFields={setDraftFields}
                onAfterReapply={(server) => handleAfterReapply(server)}
              />
            </div>
          )}

          {/* B-077 Batch 2 — full grouped Documents list moved to the
              END of the per-profile view as a collapsible, mirroring
              the client wizard's sub-step 6 of 7 placement. Default
              collapsed; auto-expands when the user clicks a category
              from the KycDocsSummary at top. */}
          {totalKycDocs > 0 && (
            <div className="border rounded-lg overflow-hidden mt-3">
              <div
                onClick={() => setDocsExpanded((v) => !v)}
                role="button"
                tabIndex={0}
                // B-113 — same guard as the KycLongFormSection header
                // (above): ignore bubbled keydowns from descendants so
                // typing space in a portal'd dialog input doesn't
                // collapse this row.
                onKeyDown={(e) => {
                  if (e.target !== e.currentTarget) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setDocsExpanded((v) => !v);
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      kycAllDone
                        ? "bg-green-500"
                        : totalKycDone > 0
                        ? "bg-amber-400"
                        : "bg-red-400"
                    }`}
                  />
                  <span className="text-sm font-medium text-brand-navy">
                    Documents
                  </span>
                  <span className="text-[11px] text-gray-500">
                    ({totalKycUploaded} of {totalKycRequired} uploaded
                    {totalKycWaived > 0 ? ` · ${totalKycWaived} waived` : ""})
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          kycAllDone
                            ? "bg-green-500"
                            : totalKycDone > 0
                            ? "bg-amber-400"
                            : "bg-red-400"
                        }`}
                        style={{ width: `${kycDonePct}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-gray-500 tabular-nums w-8">
                      {kycDonePct}%
                    </span>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-gray-400 transition-transform ${
                      docsExpanded ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </div>
              {docsExpanded && (
                <div className="px-4 py-4 space-y-4">
                  <KycDocsByCategory
                    anchorPrefix={`admin-docs-${profile.id}`}
                    showAdminControls
                    uploadingDocTypeId={uploadingDocTypeId}
                    categories={kycDocsByCategory}
                    onUploadClick={(docTypeId) => {
                      setPendingUploadDocTypeId(docTypeId);
                      uploadInputRef.current?.click();
                    }}
                    onViewClick={handleAdminViewDoc}
                    serviceId={serviceId}
                    profileId={profile.id}
                    waivers={waivers}
                    onWaiversChange={onWaiversChange}
                  />
                  <input
                    ref={uploadInputRef}
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file && pendingUploadDocTypeId) {
                        void handleAdminDocUpload(pendingUploadDocTypeId, file);
                      }
                      e.target.value = "";
                      setPendingUploadDocTypeId(null);
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {/* B-078 Batch 2 — sticky bottom Save / Cancel bar. Lives inside
              the per-profile vertical containment so it spans the People
              & KYC card width. `sticky bottom-0` pins it to the viewport
              bottom while the user scrolls through the long form, then
              scrolls away with content once the profile container ends.
              Always visible while the profile is expanded — admins
              shouldn't have to guess where it is. */}
          <div className="sticky bottom-0 z-20 -ml-4 mt-3 bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85 border-t border-gray-200 rounded-b-md">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="text-xs">
                {isDirty ? (
                  <span className="text-amber-700 font-medium">
                    You have unsaved changes
                  </span>
                ) : (
                  <span className="text-gray-400">No changes</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-9 px-4 text-sm ${BTN_OUTLINE}`}
                  disabled={!isDirty || savingKycBar}
                  onClick={handleKycBarCancel}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className={`h-9 px-4 text-sm ${BTN_PRIMARY}`}
                  disabled={!isDirty || savingKycBar}
                  onClick={() => void handleKycBarSave()}
                >
                  {savingKycBar && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  )}
                  Save changes
                </Button>
              </div>
            </div>
          </div>

          </div>
          )}{/* /vertical containment wrapper (B-077 Batch 1) — closes the
                 sub-wizard ternary added in B-109 Batch 3. */}

          {/* B-076 — admin doc detail dialog (Approve / Reject / Re-run AI
              / Send Update Request). Same component the deleted
              AdminKycDocListPanel was already using. */}
          {detailDoc && (
            <DocumentDetailDialog
              doc={detailDoc}
              isAdmin={true}
              open={!!detailDoc}
              onOpenChange={(open) => {
                if (!open) {
                  setDetailDoc(null);
                  onRefresh();
                }
              }}
              serviceId={serviceId}
              recipients={detailDocRecipients}
              updateRequests={(updateRequests ?? []).filter(
                (r) => r.document_id === detailDoc.id,
              )}
              onStatusChange={() => {
                // B-076 — Approve / Reject closes the dialog and triggers a
                // parent refresh so the row's status pill flips immediately.
                setDetailDoc(null);
                onRefresh();
              }}
              onRequestSent={(_req, communication) => {
                onCommunicationSent?.(communication);
                onRefresh();
              }}
              clientProfileIdForReplace={profile.id}
              onDocumentReplaced={() => {
                // B-078 Batch 5 — Replace closes the dialog and the parent
                // re-fetches so the per-section + Documents-block rows
                // both flip to the new file's status pill.
                setDetailDoc(null);
                onRefresh();
              }}
            />
          )}
        </div>
      )}

      {/* Invite dialog */}
      {showInviteDialog && (
        <InviteKycDialog
          serviceId={serviceId}
          roleId={roleRow.id}
          personName={profile.full_name}
          personEmail={profile.email}
          roleLabel={roleLabels}
          onClose={() => setShowInviteDialog(false)}
          onSent={(sentAt, communication) => {
            setInviteSentAt(sentAt);
            onCommunicationSent?.(communication);
            // B-118 Hotfix 2 — RSC refresh so the parent re-fetches
            // communications + other adjacent state. Comm-card already
            // shows the spliced row immediately above.
            onRefresh();
          }}
        />
      )}

      {/* B-101 Batch 3 — Remove-from-service confirm dialog. */}
      <Dialog open={removeOpen} onOpenChange={(open) => { if (!removing) setRemoveOpen(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this profile from the service?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            The profile will no longer appear under People &amp; KYC for this
            service. Their role assignments stay saved and can be restored
            by adding them back. This action is recorded in the audit log.
          </p>
          <DialogFooter className="gap-2">
            <DialogClose className={`inline-flex items-center justify-center px-3 py-1.5 text-sm font-medium ${BTN_OUTLINE}`} disabled={removing}>
              Cancel
            </DialogClose>
            <Button
              variant="outline"
              className={BTN_DESTRUCTIVE_OUTLINE}
              disabled={removing}
              onClick={async () => {
                if (!profile.id) return;
                setRemoving(true);
                try {
                  const res = await fetch(
                    `/api/admin/services/${serviceId}/profiles/${profile.id}/remove`,
                    { method: "POST" },
                  );
                  if (!res.ok) {
                    const payload = (await res.json().catch(() => ({}))) as { error?: string };
                    toast.error(payload.error ?? "Failed to remove profile");
                    return;
                  }
                  toast.success(`Removed ${profile.full_name ?? "profile"} from this service`);
                  setRemoveOpen(false);
                  onRemoved?.(profile.id);
                  // Soft re-fetch to keep audit panel + waivers consistent.
                  onRefresh();
                } catch {
                  toast.error("Failed to remove profile");
                } finally {
                  setRemoving(false);
                }
              }}
            >
              {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* B-077 Batch 5 — per-profile aggregate Review summary panel */}
      {kyc && kycSubsections.length > 0 && (
        <PerProfileReviewSummaryPanel
          open={reviewSummaryOpen}
          onOpenChange={setReviewSummaryOpen}
          profileName={profile.full_name ?? "this profile"}
          subsections={kycSubsections}
        />
      )}

      {/* B-078 Batch 6 — unsaved-changes dialog. Shown when admin tries
          to leave a dirty profile (in-page link click, click on a
          different person card, or collapse the chevron). */}
      <Dialog open={!!navDialog} onOpenChange={(open) => { if (!open) setNavDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Unsaved changes for {profile.full_name ?? "this profile"}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            You&rsquo;ve made changes to this profile that haven&rsquo;t been saved.
            What would you like to do?
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className={BTN_OUTLINE}
              onClick={() => setNavDialog(null)}
            >
              Cancel
            </Button>
            <Button
              variant="outline"
              className={BTN_DESTRUCTIVE_OUTLINE}
              onClick={() => {
                const cont = navDialog?.onContinue;
                handleKycBarCancel();
                setNavDialog(null);
                cont?.();
              }}
            >
              Discard changes
            </Button>
            <Button
              className={BTN_PRIMARY}
              disabled={savingKycBar}
              onClick={async () => {
                const cont = navDialog?.onContinue;
                await handleKycBarSave();
                setNavDialog(null);
                cont?.();
              }}
            >
              {savingKycBar ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Save &amp; continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* B-090 — shared PersonSummaryDialog. Adapts roleRow → ServicePerson
            and ServiceDoc[] → ClientServiceDoc[] so the same dialog used by
            the client wizard renders here. onEdit closes the modal,
            expands the card if collapsed, and smooth-scrolls to the
            matching kyc-section anchor (or to `identity` for "any"). */}
      {summaryOpen && (() => {
        const summaryPerson: ServicePerson = {
          id: roleRow.id,
          role: roleRow.role,
          shareholding_percentage: roleRow.shareholding_percentage ?? null,
          can_manage: roleRow.can_manage,
          invite_sent_at: roleRow.invite_sent_at ?? null,
          invite_sent_by_name: null,
          client_profiles: {
            id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
            phone: profile.phone,
            due_diligence_level: profile.due_diligence_level,
            record_type: profile.record_type,
            client_profile_kyc: kycForHook as Record<string, unknown> | null,
          },
        };
        const summaryDocs: ClientServiceDoc[] = (profileDocuments ?? []).map((d) => ({
          id: d.id,
          file_name: d.file_name,
          mime_type: d.mime_type,
          verification_status: d.verification_status,
          verification_result: d.verification_result,
          admin_status: d.admin_status,
          prefill_dismissed_at: null,
          uploaded_at: d.uploaded_at,
          expiry_date: d.expiry_date,
          document_type_id: d.document_type_id,
          client_profile_id: d.client_profile_id,
          document_types: d.document_types
            ? {
                name: d.document_types.name,
                category: d.document_types.category,
                valid_for_months: d.document_types.valid_for_months ?? null,
              }
            : null,
        }));
        function handleSummaryEdit(section: SummarySection) {
          setSummaryOpen(false);
          if (!expanded) setExpanded(true);
          const target = section === "any"
            ? `kyc-section-${profile.id}-identity`
            : `kyc-section-${profile.id}-${section}`;
          // Wait a frame so the expansion DOM update lands first before
          // scrollIntoView measures the target's position.
          requestAnimationFrame(() => {
            document.getElementById(target)?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          });
        }
        return (
          <PersonSummaryDialog
            person={summaryPerson}
            documents={summaryDocs}
            documentTypes={documentTypes ?? []}
            requirements={requirements ?? []}
            onClose={() => setSummaryOpen(false)}
            onEdit={handleSummaryEdit}
          />
        );
      })()}
    </div>
  );
}


function AdminDocumentsSection({
  serviceId,
  documents,
  documentTypes,
  kycDocs,
  kycDocTypes,
  updateRequests,
  roles,
  waivers,
  onWaiversChange,
  onDocumentAdded,
  onUpdateRequestAdded,
  onRefresh,
  onCommunicationSent,
}: {
  serviceId: string;
  /** B-085 — already filtered to service-level (`scope='application'`)
   *  by the parent so this section doesn't double-filter. */
  documents: ServiceDoc[];
  /** B-085 — service-level doc types (`scope='application'` AND active),
   *  used both as the universe of expected docs and as the dedupe key. */
  documentTypes: DocumentType[];
  /** B-097 — all KYC docs (scope='person') across every profile in this service. */
  kycDocs: ServiceDoc[];
  /** B-097 — KYC doc types (scope='person', active). */
  kycDocTypes: DocumentType[];
  updateRequests: DocumentUpdateRequest[];
  roles: RoleWithProfile[];
  /** B-100 — waiver rows for this service. KycDocumentsTable reads them
   *  to render the muted "Waived" pill + the Un-waive action. */
  waivers: WaivedDocumentRequirement[];
  /** B-100 — callback so Waive / Un-waive can optimistically update the
   *  parent's waiver array without a full server refetch. */
  onWaiversChange: (next: WaivedDocumentRequirement[]) => void;
  onDocumentAdded: (doc: ServiceDoc) => void;
  onUpdateRequestAdded: (req: DocumentUpdateRequest) => void;
  onRefresh: () => void;
  /** B-118 Hotfix 2 — splice a freshly-sent communication row into the
   *  right-rail Communications card without waiting for the RSC refetch. */
  onCommunicationSent?: (communication: Record<string, unknown> | null | undefined) => void;
}) {
  // B-097 — Service Docs / KYC Documents tab toggle.
  const [docTab, setDocTab] = useState<"service" | "kyc">("service");
  const [uploadingTypeId, setUploadingTypeId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [pendingUploadDocTypeId, setPendingUploadDocTypeId] = useState<string | null>(null);
  // B-085 — DocumentDetailDialog state lifted in here so KycDocRow View
  // can open it (mirrors PersonCard's pattern for per-profile docs).
  const [detailDoc, setDetailDoc] = useState<DocumentDetailDoc | null>(null);

  // B-106 — Waive / un-waive state for the Service Docs tab. Mirrors the
  // KycDocumentsTable pattern: confirm-then-waive, single-click un-waive.
  // Service waivers carry `scope: "application"` and a NULL profile id.
  const [waivingTypeId, setWaivingTypeId] = useState<string | null>(null);
  const [serviceWaiveConfirm, setServiceWaiveConfirm] = useState<{
    docTypeId: string;
    docTypeName: string;
  } | null>(null);

  // B-106 — index service-scope waivers by doc_type_id for O(1) lookup.
  const serviceWaiverByTypeId = useMemo(() => {
    const m = new Map<string, WaivedDocumentRequirement>();
    for (const w of waivers) {
      if (w.scope !== "application") continue;
      m.set(w.document_type_id, w);
    }
    return m;
  }, [waivers]);

  async function waiveServiceDoc(docTypeId: string) {
    setWaivingTypeId(docTypeId);
    const optimistic: WaivedDocumentRequirement = {
      id: `optimistic-svc-${docTypeId}`,
      client_profile_id: null,
      document_type_id: docTypeId,
      waived_at: new Date().toISOString(),
      waived_by: "",
      scope: "application",
    };
    const prev = waivers;
    onWaiversChange([
      ...prev.filter((w) => !(w.scope === "application" && w.document_type_id === docTypeId)),
      optimistic,
    ]);
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/waive-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "application", document_type_id: docTypeId }),
      });
      const data = (await res.json()) as { data?: WaivedDocumentRequirement; error?: string };
      if (!res.ok || !data.data) throw new Error(data.error ?? "Waive failed");
      onWaiversChange([
        ...prev.filter((w) => !(w.scope === "application" && w.document_type_id === docTypeId)),
        data.data,
      ]);
      toast.success("Document waived", { position: "top-right" });
    } catch (err: unknown) {
      onWaiversChange(prev);
      toast.error(err instanceof Error ? err.message : "Waive failed", { position: "top-right" });
    } finally {
      setWaivingTypeId(null);
    }
  }

  async function unwaiveServiceDoc(docTypeId: string) {
    setWaivingTypeId(docTypeId);
    const prev = waivers;
    onWaiversChange(prev.filter((w) => !(w.scope === "application" && w.document_type_id === docTypeId)));
    try {
      const res = await fetch(`/api/admin/services/${serviceId}/waive-document`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "application", document_type_id: docTypeId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Un-waive failed");
      toast.success("Document un-waived", { position: "top-right" });
    } catch (err: unknown) {
      onWaiversChange(prev);
      toast.error(err instanceof Error ? err.message : "Un-waive failed", { position: "top-right" });
    } finally {
      setWaivingTypeId(null);
    }
  }

  // Build requests map: document_id → sorted requests
  const requestsByDoc = new Map<string, DocumentUpdateRequest[]>();
  for (const req of updateRequests) {
    const arr = requestsByDoc.get(req.document_id) ?? [];
    arr.push(req);
    requestsByDoc.set(req.document_id, arr);
  }

  // B-085 — recipients for service-level docs default to every
  // representative + can_manage member. Service-level docs typically
  // have no `client_profile_id`, so the per-doc-owner branch is
  // effectively skipped.
  function getRecipients(doc: ServiceDoc) {
    const recipients: Array<{ id: string; name: string; email: string | null; label: string }> = [];
    if (doc.client_profile_id) {
      const ownerRole = roles.find((r) => r.client_profiles?.id === doc.client_profile_id);
      if (ownerRole?.client_profiles) {
        recipients.push({
          id: ownerRole.client_profiles.id,
          name: ownerRole.client_profiles.full_name,
          email: ownerRole.client_profiles.email,
          label: "Document owner",
        });
      }
    }
    for (const r of roles) {
      if (r.client_profiles?.is_representative && r.client_profiles.id !== doc.client_profile_id) {
        const alreadyAdded = recipients.some((rr) => rr.id === r.client_profiles!.id);
        if (!alreadyAdded) {
          recipients.push({
            id: r.client_profiles.id,
            name: r.client_profiles.full_name,
            email: r.client_profiles.email,
            label: "Representative",
          });
        }
      }
    }
    if (recipients.length === 0) {
      const manager = roles.find((r) => r.can_manage && r.client_profiles);
      if (manager?.client_profiles) {
        recipients.push({
          id: manager.client_profiles.id,
          name: manager.client_profiles.full_name,
          email: manager.client_profiles.email,
          label: "Service manager",
        });
      }
    }
    return recipients;
  }

  // B-085 — dedupe by `document_type_id`. If the same type was uploaded
  // twice (seed-data duplicate or accidental double-bind in the template
  // table), the rendered list shows it once; pick the most recent upload
  // by `uploaded_at`. Underlying `documents` array stays untouched so
  // audit / verification flows can still reference both rows.
  const uploadByTypeId = new Map<string, ServiceDoc>();
  for (const d of documents) {
    if (!d.document_type_id) continue;
    const existing = uploadByTypeId.get(d.document_type_id);
    if (
      !existing ||
      new Date(d.uploaded_at).getTime() > new Date(existing.uploaded_at).getTime()
    ) {
      uploadByTypeId.set(d.document_type_id, d);
    }
  }
  // B-085 — if the underlying data has duplicate doc_type uploads, log
  // once for follow-up data cleanup (Vanessa: see CHANGES.md note).
  const dedupedTypeCount = uploadByTypeId.size;
  const hasDuplicates = documents.length > dedupedTypeCount;

  // Flagged docs (across the deduped uploads only).
  const flaggedDocs = Array.from(uploadByTypeId.values()).filter((d) => {
    const vr = d.verification_result as VerificationResult | null;
    return (vr?.flags?.length ?? 0) > 0 || (vr?.rule_results ?? []).some((r) => !r.passed);
  });

  async function handleAdminDocUpload(typeId: string, file: File) {
    setUploadingTypeId(typeId);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("documentTypeId", typeId);
      const res = await fetch(`/api/admin/services/${serviceId}/documents/upload`, {
        method: "POST",
        body: fd,
      });
      const data = (await res.json()) as { document?: ServiceDoc; error?: string };
      if (!res.ok || !data.document) throw new Error(data.error ?? "Upload failed");
      onDocumentAdded(data.document as ServiceDoc);
      toast.success("Document uploaded", { position: "top-right" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Upload failed", { position: "top-right" });
    } finally {
      setUploadingTypeId(null);
      setUploading(false);
    }
  }

  function openDetail(docId: string) {
    // B-097 — also search the KYC docs surfaced via the KycDocumentsTable tab.
    const upload =
      documents.find((d) => d.id === docId) ??
      kycDocs.find((d) => d.id === docId);
    if (upload) setDetailDoc(upload as unknown as DocumentDetailDoc);
  }

  const serviceUploadedCount = uploadByTypeId.size;
  const kycUploadedCount = kycDocs.length;

  return (
    <div className="pt-4 space-y-3">
      {/* B-097 — Service Docs / KYC Documents tab pair. */}
      <div className="flex gap-1 border-b">
        <button
          type="button"
          onClick={() => setDocTab("service")}
          className={
            docTab === "service"
              ? "border-b-2 border-brand-navy text-brand-navy px-3 py-2 text-sm font-medium -mb-px"
              : "text-gray-500 hover:text-brand-navy px-3 py-2 text-sm"
          }
        >
          Service Docs ({serviceUploadedCount}/{documentTypes.length})
        </button>
        <button
          type="button"
          onClick={() => setDocTab("kyc")}
          className={
            docTab === "kyc"
              ? "border-b-2 border-brand-navy text-brand-navy px-3 py-2 text-sm font-medium -mb-px"
              : "text-gray-500 hover:text-brand-navy px-3 py-2 text-sm"
          }
        >
          KYC Documents ({kycUploadedCount})
        </button>
      </div>

      {docTab === "kyc" ? (
        <KycDocumentsTable
          serviceId={serviceId}
          docs={kycDocs}
          docTypes={kycDocTypes}
          roles={roles}
          waivers={waivers}
          onWaiversChange={onWaiversChange}
          onViewClick={openDetail}
          onUploaded={onRefresh}
        />
      ) : documentTypes.length === 0 ? (
        <p className="text-sm text-gray-400">
          No service-level documents configured for this template.
        </p>
      ) : (
        <div className="rounded-lg border bg-white divide-y">
          {documentTypes.map((dt) => {
            const upload = uploadByTypeId.get(dt.id);
            const waiver = serviceWaiverByTypeId.get(dt.id) ?? null;
            const rowData: KycDocRowData = upload
              ? {
                  id: upload.id,
                  document_type_id: dt.id,
                  document_name: dt.name,
                  is_uploaded: true,
                  verification_status: upload.verification_status,
                  admin_status: upload.admin_status ?? null,
                  file_name: upload.file_name,
                  mime_type: upload.mime_type,
                  uploaded_at: upload.uploaded_at,
                  verification_result: (upload.verification_result ?? null) as Record<string, unknown> | null,
                  admin_status_note: upload.admin_status_note ?? null,
                  admin_status_at: upload.admin_status_at ?? null,
                  expiry_date: upload.expiry_date,
                  valid_for_months: dt.valid_for_months ?? null,
                }
              : {
                  id: null,
                  document_type_id: dt.id,
                  document_name: dt.name,
                  is_uploaded: false,
                };
            return (
              <div
                key={dt.id}
                className={`flex items-center justify-between gap-2 ${
                  waiver ? "bg-gray-50/70" : ""
                }`}
              >
                <div className={`flex-1 min-w-0 ${waiver ? "opacity-60" : ""}`}>
                  <KycDocRow
                    doc={rowData}
                    showAdminControls
                    isUploading={uploadingTypeId === dt.id}
                    onViewClick={openDetail}
                    onUploadClick={(docTypeId) => {
                      setPendingUploadDocTypeId(docTypeId);
                      uploadInputRef.current?.click();
                    }}
                  />
                </div>
                <div className="pr-3 shrink-0 flex items-center gap-2">
                  {waiver && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span
                              className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-500 italic cursor-help"
                              aria-label={`Waived on ${new Date(waiver.waived_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}
                            >
                              Waived
                            </span>
                          }
                        />
                        <TooltipContent>{`Waived on ${new Date(waiver.waived_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {waiver ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs gap-1 text-gray-500 hover:text-brand-navy"
                      disabled={waivingTypeId === dt.id}
                      onClick={() => void unwaiveServiceDoc(dt.id)}
                    >
                      {waivingTypeId === dt.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RotateCcw className="h-3 w-3" />
                      )}
                      Un-waive
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs gap-1 text-gray-500 hover:text-brand-navy"
                      disabled={waivingTypeId === dt.id}
                      onClick={() =>
                        setServiceWaiveConfirm({ docTypeId: dt.id, docTypeName: dt.name })
                      }
                    >
                      {waivingTypeId === dt.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Ban className="h-3 w-3" />
                      )}
                      Waive
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <input
        ref={uploadInputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file && pendingUploadDocTypeId) {
            void handleAdminDocUpload(pendingUploadDocTypeId, file);
          }
          e.target.value = "";
          setPendingUploadDocTypeId(null);
        }}
      />

      {/* Flagged summary — service tab only. */}
      {docTab === "service" && flaggedDocs.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <p className="text-sm font-medium text-amber-800">
              {flaggedDocs.length} flagged document{flaggedDocs.length !== 1 ? "s" : ""} — requires attention
            </p>
          </div>
          <div className="space-y-1">
            {flaggedDocs.map((d) => {
              const vr = d.verification_result as VerificationResult | null;
              const count = (vr?.flags?.length ?? 0) + (vr?.rule_results ?? []).filter((r) => !r.passed).length;
              return (
                <p key={d.id} className="text-xs text-amber-700">
                  • {d.document_types?.name ?? d.file_name}: {count} flag{count !== 1 ? "s" : ""}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {/* B-085 — heads-up when the data layer has duplicate doc_type uploads. */}
      {docTab === "service" && hasDuplicates && (
        <p className="text-[11px] text-gray-400 italic">
          Note: {documents.length - dedupedTypeCount} duplicate upload(s) collapsed in this list. Source data may need cleanup.
        </p>
      )}

      {/* B-106 — Service Docs waive confirmation dialog. Mirrors the
          KycDocumentsTable confirm — no reason field, single-click
          un-waive is the reversal path. */}
      <Dialog
        open={serviceWaiveConfirm !== null}
        onOpenChange={(o) => { if (!o) setServiceWaiveConfirm(null); }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Waive this document?</DialogTitle>
          </DialogHeader>
          {serviceWaiveConfirm && (
            <p className="text-sm text-gray-600">
              The client will no longer be asked to upload{" "}
              <span className="font-semibold">{serviceWaiveConfirm.docTypeName}</span>.
              You can un-waive it at any time.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setServiceWaiveConfirm(null)}>
              Cancel
            </Button>
            <Button
              className="bg-brand-navy hover:bg-brand-navy/90 text-white"
              onClick={() => {
                if (!serviceWaiveConfirm) return;
                const target = serviceWaiveConfirm;
                setServiceWaiveConfirm(null);
                void waiveServiceDoc(target.docTypeId);
              }}
            >
              Waive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* B-085 — admin doc detail dialog (Approve / Reject / Replace / Send
          Update Request / Re-run AI). Shared with per-profile docs. */}
      {detailDoc && (
        <DocumentDetailDialog
          doc={detailDoc}
          isAdmin={true}
          open={!!detailDoc}
          onOpenChange={(open) => {
            if (!open) {
              setDetailDoc(null);
              onRefresh();
            }
          }}
          serviceId={serviceId}
          recipients={getRecipients(detailDoc as unknown as ServiceDoc)}
          updateRequests={(updateRequests ?? []).filter(
            (r) => r.document_id === detailDoc.id,
          )}
          onStatusChange={() => {
            setDetailDoc(null);
            onRefresh();
          }}
          onRequestSent={(req, communication) => {
            if (req) onUpdateRequestAdded(req as DocumentUpdateRequest);
            onCommunicationSent?.(communication);
            onRefresh();
          }}
          onDocumentReplaced={() => {
            setDetailDoc(null);
            onRefresh();
          }}
        />
      )}
    </div>
  );
}

// ─── Main Props ───────────────────────────────────────────────────────────────

interface Props {
  service: ServiceWithTemplate;
  roles: ProfileServiceRole[];
  overrides: ServiceSectionOverride[]; // reserved for future RAG override display
  documents: ServiceDoc[];
  updateRequests: DocumentUpdateRequest[];
  allProfiles: ClientProfile[];
  adminUsers: AdminUser[];
  auditEntries: ServiceAuditEntry[];
  requirements: DueDiligenceRequirement[];
  documentTypes: DocumentType[];
  sectionReviews: ApplicationSectionReview[];
  // B-072 — admin actions surface (substance review + bank opening + FSC)
  templateActions: ServiceTemplateAction[];
  actionsByKey: Record<string, ServiceAction>;
  substance: ServiceSubstance | null;
  // B-070 — provenance rows for the per-field marker UI in KYC views.
  fieldExtractions: FieldExtraction[];
  // B-093 — most recent status_changed audit row for this service. Used by
  // the right-rail Status card to render "Status updated on <date> by
  // <name>". Null when status has never been changed since service creation.
  lastStatusChange: ServiceAuditEntry | null;
  // B-100 — waiver rows for this service (filtered server-side). The
  // KycDocumentsTab uses them to render a muted "Waived" pill in place
  // of the upload action; the client portal upload list filters them
  // out so the client never sees the slot.
  waivers: WaivedDocumentRequirement[];
  // B-108 — most-recent-first outbound email log for this service. Drives
  // the right-rail Communications card + modal viewer. Empty array when
  // none have been sent (or, currently, when the service had no
  // pre-existing rows — track-from-now).
  communications: ServiceCommunication[];
  // B-108 Batch 3 — admin-authored alerts (open + resolved). Auto alerts
  // are computed at render from `documents` + profiles' kyc updated_at;
  // dismissals match keys against this list.
  manualAlerts: ManualServiceAlert[];
  dismissedAutoAlerts: DismissedAutoAlert[];
  /** B-118 — server-fetched peer/manager review requests for this service.
   *  Open first, then up to 10 most-recent closed. Hydrated with
   *  reviewer names + section list. */
  reviewRequests: HydratedReviewRequest[];
  /** B-118 — current admin's user_id (= profiles.id). Threaded through so
   *  the right-rail card + sticky banner can branch on
   *  `isRequester` / `isInvitedReviewer`. Always provided from the
   *  server component (`page.tsx`). */
  currentUserId: string;
  /** B-120 — active reference forms grouped by action_key for the four
   *  Action subsection panels. */
  referenceFormsByAction: Record<string, ReferenceFormSummary[]>;
  /** B-120 — submitted forms grouped by reference_form_id, most-recent
   *  first per reference form. */
  submittedFormsByRefId: Record<string, SubmittedFormSummary[]>;
  // B-102 — Review Wizard chrome. When `reviewMode` is true the component
  // hides the stage strip + step indicator + right-rail + admin extras +
  // bottom save bar, and renders only the section card whose index matches
  // `reviewStep`. The wizard nav (top + bottom) is mounted by the parent
  // `ReviewWizardClient`, not here, so this stays a pure read-only flag.
  reviewMode?: boolean;
  reviewStep?: number;
}

// B-098 — forward chain + override list now come from the single source
// of truth at src/lib/services/statusChain. `getNextStage` is a thin
// alias so the rest of this file keeps reading naturally.
const getNextStage = getNextStatus;

// B-073 — five wizard steps for the modern services detail page. Section keys
// match what's wired into ServiceCollapsibleSection in this file.
// B-119 — `Actions` joins as a sixth step when the current template has
// ≥1 binding in `service_template_actions`. Templates without bindings
// (Trust / Domestic Co) keep the 5-step bar unchanged.
const ADMIN_STEPS_SERVICES: AdminStep[] = [
  { id: "step-company-setup", label: "Company Setup", sectionKeys: ["company_setup"] },
  { id: "step-financial",     label: "Financial",     sectionKeys: ["financial"] },
  { id: "step-banking",       label: "Banking",       sectionKeys: ["banking"] },
  { id: "step-people-kyc",    label: "People & KYC",  sectionKeys: ["people"] },
  { id: "step-documents",     label: "Documents",     sectionKeys: ["documents"] },
];
const ACTIONS_STEP: AdminStep = {
  id: "step-actions",
  label: "Actions",
  sectionKeys: ["actions"],
};
function buildAdminSteps(hasActions: boolean): AdminStep[] {
  return hasActions ? [...ADMIN_STEPS_SERVICES, ACTIONS_STEP] : ADMIN_STEPS_SERVICES;
}

// B-111 Batch 2 — Pending card wrapper. Consumes the live section-reviews
// context so the list re-derives immediately after a save without
// waiting for a router refresh. All other inputs (step pcts, profile
// list, missing-doc count, alerts) flow through props.
function PendingCardWithState({
  pcts,
  profiles,
  missingDocCount,
  autoAlerts,
  manualAlerts,
  onAction,
  steps: stepsOverride,
  actionSubsections,
}: {
  pcts: number[];
  profiles: PendingProfileInput[];
  missingDocCount: number;
  autoAlerts: AutoAlert[];
  manualAlerts: ManualServiceAlert[];
  onAction: (item: PendingItem) => void;
  /** B-119 — when provided, replaces the default 5-step list so the
   *  Actions step joins the section-review hook + pending derivation. */
  steps?: AdminStep[];
  /** B-119 — per-subsection rows for the Actions step. */
  actionSubsections?: Parameters<typeof computePendingItems>[0]["actionSubsections"];
}) {
  const stepDefs = stepsOverride ?? ADMIN_STEPS_SERVICES;
  const sectionKeys = stepDefs.map((s) => s.sectionKeys[0]);
  const { rows } = useSectionReviews(sectionKeys);
  const sectionReviewsLive = useMemo(
    () => rows.flatMap((r) => r.history),
    [rows],
  );

  const steps: PendingStepConfig[] = useMemo(
    () =>
      stepDefs.map((step, i) => ({
        stepId: step.id,
        sectionKey: step.sectionKeys[0],
        label: step.label,
        pct: pcts[i] ?? 0,
      })),
    [pcts, stepDefs],
  );

  const items = useMemo(
    () =>
      computePendingItems({
        steps,
        sectionReviews: sectionReviewsLive,
        profiles,
        missingDocCount,
        autoAlerts,
        manualAlerts,
        actionSubsections,
      }),
    [
      steps,
      sectionReviewsLive,
      profiles,
      missingDocCount,
      autoAlerts,
      manualAlerts,
      actionSubsections,
    ],
  );

  return <ServicePendingCard items={items} onAction={onAction} />;
}

// B-111 — step pill row that consumes the live section-reviews context so
// the pill state updates immediately after a save without waiting for a
// router refresh. Reads aggregate review status via `useSectionReviews`
// (each step has exactly one section key, so the row is just `latest`).
// B-112 — pill body is uniform brand-navy; each pill carries two SVG
// gauges (completion % + review state). The legacy `state` + tooltip
// values are still computed so downstream consumers (Pending card
// derivation, hover detail) keep working.
function toReviewState(
  review: ApplicationSectionReview | null,
): ReviewState {
  if (!review) return "not_reviewed";
  if (review.status === "reviewed") return "reviewed";
  if (review.status === "flagged") return "flagged";
  if (review.status === "rejected") return "rejected";
  return "not_reviewed";
}

function formatReviewedOn(reviewedAt: string | null | undefined): string | null {
  if (!reviewedAt) return null;
  return new Date(reviewedAt).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function buildStepTooltip({
  label,
  pct,
  reviewState,
  review,
}: {
  label: string;
  pct: number;
  reviewState: ReviewState;
  review: ApplicationSectionReview | null;
}): string {
  // Line 1: section label.
  // Line 2: completion phrase · review phrase (joined when both meaningful).
  const completionPhrase =
    pct >= 100 ? "100% complete" : pct > 0 ? `${pct}% complete` : "Not started";

  const who = review?.profiles?.full_name ?? null;
  const when = formatReviewedOn(review?.reviewed_at);
  const whoWhen = who && when ? ` by ${who} on ${when}` : when ? ` on ${when}` : who ? ` by ${who}` : "";

  let reviewPhrase: string;
  switch (reviewState) {
    case "reviewed":
      reviewPhrase = `Reviewed${whoWhen}`;
      break;
    case "flagged":
      reviewPhrase = `Flagged${whoWhen}`;
      break;
    case "rejected":
      reviewPhrase = `Rejected${whoWhen}`;
      break;
    case "not_reviewed":
    default:
      reviewPhrase = "Not reviewed";
      break;
  }

  return `${label}\n${completionPhrase} · ${reviewPhrase}`;
}

function StepPillsWithState({
  pcts,
  incompleteProfileCount,
  missingDocCount,
  onStepClick,
  steps: stepsOverride,
}: {
  pcts: number[];
  incompleteProfileCount: number;
  missingDocCount: number;
  onStepClick: (stepId: string) => void;
  /** B-119 — when provided, replaces the default 5-step list so the
   *  Actions step appears in the pill bar. */
  steps?: AdminStep[];
}) {
  const stepDefs = stepsOverride ?? ADMIN_STEPS_SERVICES;
  const sectionKeys = stepDefs.map((s) => s.sectionKeys[0]);
  const { rows } = useSectionReviews(sectionKeys);
  // `resolveCountBadge` is still called only so we keep the legacy
  // helper warm for downstream callers; the badge value itself is no
  // longer fed to the pill in B-112.
  const stepsWithState: AdminStep[] = useMemo(
    () =>
      stepDefs.map((step, i) => {
        const review = rows[i]?.latest ?? null;
        const pct = pcts[i] ?? 0;
        const state = resolvePillState({ review, pct });
        // Kept warm — Pending card derivation reads the same logic.
        resolveCountBadge({
          stepId: step.id,
          state,
          pct,
          incompleteProfileCount:
            step.id === "step-people-kyc" ? incompleteProfileCount : undefined,
          missingDocCount:
            step.id === "step-documents" ? missingDocCount : undefined,
        });
        const reviewState = toReviewState(review);
        const completionPct = Math.round(pct);
        const tooltip = buildStepTooltip({
          label: step.label,
          pct: completionPct,
          reviewState,
          review,
        });
        return {
          ...step,
          state,
          completionPct,
          reviewState,
          tooltip,
        };
      }),
    [stepDefs, rows, pcts, incompleteProfileCount, missingDocCount],
  );
  return (
    <AdminApplicationStepIndicator
      steps={stepsWithState}
      onStepClick={onStepClick}
    />
  );
}

// B-112 — right-rail progress meters. Consumes the live section-reviews
// context (same hook as the pill row) so the Reviewed gauge advances
// immediately after a save. Completed count is derived from the same
// pct array fed to the pills; "complete" = pct >= 100.
function ProgressMetersWithState({
  pcts,
  steps: stepsOverride,
}: {
  pcts: number[];
  /** B-119 — when provided, drives the section-reviews hook + the
   *  gauge total. Adds the Actions gauge to the right rail. */
  steps?: AdminStep[];
}) {
  const stepDefs = stepsOverride ?? ADMIN_STEPS_SERVICES;
  const sectionKeys = stepDefs.map((s) => s.sectionKeys[0]);
  const { rows } = useSectionReviews(sectionKeys);
  const total = stepDefs.length;
  const completedCount = useMemo(
    () => pcts.filter((p) => (p ?? 0) >= 100).length,
    [pcts],
  );
  const reviewedCount = useMemo(
    () =>
      rows.reduce(
        (acc, row) => (row?.latest?.status === "reviewed" ? acc + 1 : acc),
        0,
      ),
    [rows],
  );
  return (
    <ServiceProgressMeters
      completedCount={completedCount}
      reviewedCount={reviewedCount}
      total={total}
    />
  );
}

const DD_LEVELS = [
  { value: "sdd", label: "SDD — Simplified" },
  { value: "cdd", label: "CDD — Standard" },
  { value: "edd", label: "EDD — Enhanced" },
] as const;

// B-102 — Review Wizard step → application_section_reviews.section_key
// mapping. Lives next to ADMIN_STEPS_SERVICES so future step additions
// stay obvious. `people` already exists for the People & KYC aggregate.
// B-121 — when the current template has ≥1 action binding, Actions joins
// as the 6th step (mirrors B-119's pill bar + Progress meters). Use the
// `buildReviewSteps` helpers below to get the right list for a service.
const REVIEW_STEP_SECTION_KEYS = [
  "company_setup",
  "financial",
  "banking",
  "people",
  "documents",
] as const;

// B-109 Batch 1 — display labels for the SectionReviewPanel dialog header.
// Mirrors ADMIN_STEPS_SERVICES labels; kept separate so the panel header
// reads consistently if the step strip ever diverges visually.
const REVIEW_STEP_LABELS = [
  "Company Setup",
  "Financial",
  "Banking",
  "People & KYC",
  "Documents",
] as const;

// B-121 — same template-conditional rule as `buildAdminSteps`: Actions
// shows up as the 6th step only when service_template_actions has ≥1
// binding for this service's template. The wizard never reads the
// 5-element constants directly any more — always go through these helpers.
const ACTIONS_REVIEW_SECTION_KEY = "actions" as const;
const ACTIONS_REVIEW_LABEL = "Actions" as const;

function buildReviewStepSectionKeys(hasActions: boolean): readonly string[] {
  return hasActions
    ? [...REVIEW_STEP_SECTION_KEYS, ACTIONS_REVIEW_SECTION_KEY]
    : REVIEW_STEP_SECTION_KEYS;
}

function buildReviewStepLabels(hasActions: boolean): readonly string[] {
  return hasActions
    ? [...REVIEW_STEP_LABELS, ACTIONS_REVIEW_LABEL]
    : REVIEW_STEP_LABELS;
}

const BRAND_REVIEW_BLUE = "#24a0ed";

// ─── Review Wizard chrome ─────────────────────────────────────────────────────
//
// Sticky top bar (replaces the existing back-link + stage-strip + step-pill
// shell) and sticky bottom nav (replaces the bottom save bar) used only when
// ServiceDetailClient is mounted with `reviewMode`.

function ReviewWizardTopBar({
  serviceId,
  step,
  profileLabel,
  service,
  hasActions,
}: {
  serviceId: string;
  step: number;
  profileLabel: string | null;
  service: ServiceWithTemplate;
  /** B-121 — when true, Actions joins as the 6th wizard step. */
  hasActions: boolean;
}) {
  const router = useRouter();
  const adminSteps = buildAdminSteps(hasActions);
  const reviewSectionKeys = buildReviewStepSectionKeys(hasActions);
  const reviewLabels = buildReviewStepLabels(hasActions);
  const stepLabel = adminSteps[step]?.label ?? "Review";

  // B-109 Batch 2 — step click navigates within the wizard. We don't
  // flush dirty edits here because the indicator sits in the always-on
  // sticky band; saves happen on Next / Mark as Reviewed where the
  // intent is unambiguous. Replace (not push) so back-button behaviour
  // stays intuitive within the wizard surface.
  function handleStepClick(nextStep: number) {
    if (nextStep === step) return;
    router.replace(`/admin/services/${serviceId}/review?step=${nextStep}`);
  }

  return (
    <div className="sticky top-0 z-30 bg-white border-b -mx-8 px-8 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex items-center gap-3">
          <Wand2 className="h-4 w-4 text-brand-navy shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-gray-500 leading-none">
              {service.service_number ? `${service.service_number} — ` : ""}
              {service.service_templates?.name ?? "Service"} · Review Wizard
            </p>
            <p className="text-sm font-semibold text-brand-navy truncate">
              Step {step + 1} of {adminSteps.length}: {stepLabel}
              {profileLabel ? ` · ${profileLabel}` : ""}
            </p>
          </div>
        </div>
        <Link
          href={`/admin/services/${serviceId}`}
          className="inline-flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-navy"
        >
          <X className="h-4 w-4" />
          Exit Review
        </Link>
      </div>
      {/* B-109 Batch 2 — step indicator row beneath the title. Reads
          aggregate review status from `AdminApplicationSectionsProvider`
          (which wraps this component upstream) to mark steps complete. */}
      <div className="mt-2 pl-7">
        <AdminReviewWizardStepIndicator
          currentStep={step}
          sectionKeys={reviewSectionKeys}
          labels={reviewLabels}
          onStepClick={handleStepClick}
        />
      </div>
    </div>
  );
}

function ReviewWizardBottomNav({
  serviceId,
  step,
  pendingChanges,
  onSave,
  profileSubstep,
  totalProfilesInStep,
  stepPct,
  hasActions,
}: {
  serviceId: string;
  step: number;
  pendingChanges: boolean;
  onSave: () => Promise<boolean>;
  /** B-102 — When step 3 (People & KYC) has `?profile=<id>`, sub-step nav
   *  swaps in: Previous → Back to list, Next → Next Profile, Mark as
   *  Reviewed → Mark Profile Reviewed. `null` for the list view. */
  profileSubstep: {
    profileIndex: number;
    onBackToList: () => void;
    onNextProfile: () => void;
  } | null;
  totalProfilesInStep: number;
  /** B-110 — completion % for the current step. Drives the
   *  Force-review override flow in the SectionReviewPanel dialog. */
  stepPct: number;
  /** B-121 — wizard length depends on the template's action bindings. */
  hasActions: boolean;
}) {
  const router = useRouter();
  const reviewSectionKeys = buildReviewStepSectionKeys(hasActions);
  const reviewLabels = buildReviewStepLabels(hasActions);
  const sectionKey = reviewSectionKeys[step];
  const { currentStatus, onReviewSaved } = useSectionReview(sectionKey);
  const [advancing, setAdvancing] = useState(false);
  // B-109 Batch 1 — Mark-as-Reviewed now opens the same SectionReviewPanel
  // dialog the inline `Review` button uses (status picker + notes).
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  const isFirstStep = step === 0;
  const isLastStep = step === reviewSectionKeys.length - 1;

  async function flushIfDirty(): Promise<boolean> {
    if (!pendingChanges) return true;
    return onSave();
  }

  async function goTo(nextStep: number) {
    setAdvancing(true);
    try {
      const ok = await flushIfDirty();
      if (!ok) {
        toast.error("Couldn't save changes — fix the errors and try again.");
        return;
      }
      if (nextStep < 0) return;
      if (nextStep >= reviewSectionKeys.length) {
        router.replace(`/admin/services/${serviceId}`);
        return;
      }
      router.replace(`/admin/services/${serviceId}/review?step=${nextStep}`);
    } finally {
      setAdvancing(false);
    }
  }

  async function handleNext() {
    if (profileSubstep) {
      profileSubstep.onNextProfile();
      return;
    }
    await goTo(step + 1);
  }

  async function handlePrevious() {
    if (profileSubstep) {
      profileSubstep.onBackToList();
      return;
    }
    if (isFirstStep) return;
    await goTo(step - 1);
  }

  // B-109 Batch 1 — flush dirty edits before opening the review dialog so
  // the dialog only deals with the review action itself. If save fails,
  // don't open (matches the Next button's UX).
  async function openReviewDialog() {
    const saved = await flushIfDirty();
    if (!saved) {
      toast.error("Couldn't save changes — fix the errors and try again.");
      return;
    }
    setReviewDialogOpen(true);
  }

  async function handleReviewSaved(review: ApplicationSectionReview) {
    onReviewSaved(review);
    setReviewDialogOpen(false);
    toast.success(`Marked as ${review.status}.`);
    if (profileSubstep) {
      profileSubstep.onNextProfile();
    } else {
      await goTo(step + 1);
    }
  }

  const nextLabel = profileSubstep
    ? "Next Profile"
    : isLastStep
      ? "Finish"
      : "Next";
  const prevLabel = profileSubstep ? "Back to list" : "Previous";
  const markLabel = profileSubstep ? "Mark Profile Reviewed" : "Mark as Reviewed";
  const nextDisabled = advancing
    || (profileSubstep ? profileSubstep.profileIndex >= totalProfilesInStep - 1 : false);

  return (
    <>
      <div className="sticky bottom-0 z-30 bg-white border-t -mx-8 px-8 py-3 flex items-center justify-between gap-3 shadow-[0_-2px_10px_rgba(0,0,0,0.06)]">
        <button
          type="button"
          onClick={() => void handlePrevious()}
          disabled={advancing || (!profileSubstep && isFirstStep)}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand-navy bg-white px-4 py-1.5 text-sm font-medium text-brand-navy hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
          {prevLabel}
        </button>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void openReviewDialog()}
            disabled={advancing}
            style={{ backgroundColor: BRAND_REVIEW_BLUE }}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            <CheckCircle className="h-4 w-4" />
            {markLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleNext()}
            disabled={nextDisabled}
            className="inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-blue disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {advancing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {nextLabel}
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <SectionReviewPanel
        applicationId={serviceId}
        sectionKey={sectionKey}
        sectionLabel={reviewLabels[step] ?? "Review"}
        currentStatus={currentStatus}
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        onSaved={(r) => void handleReviewSaved(r)}
        sectionIncomplete={stepPct < 100}
      />
    </>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ServiceDetailClient({
  service: initialService,
  roles: initialRoles,
  overrides: _overrides, // eslint-disable-line @typescript-eslint/no-unused-vars
  documents: initialDocuments,
  updateRequests: initialUpdateRequests,
  allProfiles,
  adminUsers,
  auditEntries,
  requirements,
  documentTypes,
  sectionReviews,
  templateActions,
  actionsByKey,
  substance,
  fieldExtractions,
  lastStatusChange,
  waivers: initialWaivers,
  communications: initialCommunications,
  manualAlerts,
  dismissedAutoAlerts,
  reviewRequests: initialReviewRequests,
  currentUserId,
  referenceFormsByAction,
  submittedFormsByRefId,
  reviewMode = false,
  reviewStep = 0,
}: Props) {
  const router = useRouter();
  const [service, setService] = useState(initialService);
  const [documents, setDocuments] = useState(initialDocuments);
  const [updateRequests, setUpdateRequests] = useState(initialUpdateRequests);
  // B-118 Hotfix 2 — Communications state lifted so handlers can splice
  // freshly-sent comm rows in without a full re-fetch. Prop re-syncs on
  // RSC refresh so the splice and the server view stay aligned.
  const [communications, setCommunications] = useState(initialCommunications);
  useEffect(() => {
    setCommunications(initialCommunications);
  }, [initialCommunications]);
  const appendCommunication = useCallback(
    (row: Record<string, unknown> | null | undefined) => {
      if (!row || !row.id) return;
      setCommunications((prev) => {
        if (prev.some((c) => c.id === (row.id as string))) return prev;
        return [row as unknown as ServiceCommunication, ...prev];
      });
    },
    [],
  );
  const appendCommunications = useCallback(
    (rows: Record<string, unknown>[] | undefined) => {
      if (!rows || rows.length === 0) return;
      setCommunications((prev) => {
        const seen = new Set(prev.map((c) => c.id));
        const next: ServiceCommunication[] = [];
        for (const r of rows) {
          const id = (r as { id?: string }).id;
          if (!id || seen.has(id)) continue;
          next.push(r as unknown as ServiceCommunication);
          seen.add(id);
        }
        return next.length > 0 ? [...next, ...prev] : prev;
      });
    },
    [],
  );

  // B-118 — review-requests state, splicing helpers, modal toggle.
  const [reviewRequests, setReviewRequests] = useState(initialReviewRequests);
  useEffect(() => {
    setReviewRequests(initialReviewRequests);
  }, [initialReviewRequests]);
  const upsertReviewRequest = useCallback(
    (req: HydratedReviewRequest) => {
      setReviewRequests((prev) => {
        const next = prev.filter((r) => r.id !== req.id);
        return [req, ...next];
      });
    },
    [],
  );
  const [requestReviewModalOpen, setRequestReviewModalOpen] = useState(false);

  // B-108 Batch 3 — dialog open state lives high so the button trigger
  // below can flip it. Alert derivation lives after `roles` state is
  // declared further down.
  const [alertsDialogOpen, setAlertsDialogOpen] = useState(false);

  // B-103 — cap the right rail's max-height to the left column's
  // rendered height so the page never leaves a large empty area below
  // a short left column. `window.innerHeight - 320` (the original
  // sticky-rail ceiling) stays as the upper bound so a very tall left
  // column never makes the rail overflow viewport.
  const leftColumnRef = useRef<HTMLDivElement>(null);
  const [railMaxHeight, setRailMaxHeight] = useState<number | null>(null);
  useEffect(() => {
    const el = leftColumnRef.current;
    if (!el) return;
    const ceiling = () => window.innerHeight - 320;
    const recompute = () => {
      const h = el.getBoundingClientRect().height;
      setRailMaxHeight(Math.min(h, ceiling()));
    };
    const observer = new ResizeObserver(() => recompute());
    observer.observe(el);
    const onResize = () => recompute();
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, []);
  // B-106 — admin user_id → display name map for the waiver tooltip's
  // "by <name>" suffix on per-profile docs. The page already loads
  // `adminUsers` for the manager-assignment dropdown.
  const adminNamesByUserId = useMemo(() => {
    const m: Record<string, string | null> = {};
    for (const u of adminUsers) {
      m[u.user_id] = u.full_name ?? u.email ?? null;
    }
    return m;
  }, [adminUsers]);

  // B-084 Batch 1 — lift roles to state so per-profile saves can splice
  // updated kyc/profile fields directly into the parent without waiting
  // for the RSC roundtrip from `router.refresh()`. Sync from prop on
  // every server re-fetch so external mutations (refresh button, other
  // tabs) still flow through.
  const [roles, setRoles] = useState<RoleWithProfile[]>(
    initialRoles as unknown as RoleWithProfile[],
  );
  useEffect(() => {
    setRoles(initialRoles as unknown as RoleWithProfile[]);
  }, [initialRoles]);

  // B-108 Batch 3 — derived alert state. `kyc_updated_at` comes from the
  // joined `client_profile_kyc.updated_at` already present on `roles`,
  // so no extra fetch is needed.
  const profilesForAlerts = useMemo(() => {
    return (roles as unknown as Array<{
      client_profiles: {
        id: string;
        full_name: string | null;
        client_profile_kyc?: { updated_at: string | null } | null;
      } | null;
    }>)
      .map((r) => r.client_profiles)
      .filter(
        (p): p is { id: string; full_name: string | null; client_profile_kyc?: { updated_at: string | null } | null } =>
          !!p,
      )
      .map((p) => ({
        id: p.id,
        full_name: p.full_name,
        kyc_updated_at: p.client_profile_kyc?.updated_at ?? null,
      }));
  }, [roles]);
  const autoAlerts = useMemo(
    () => computeAutoAlerts({ documents, profiles: profilesForAlerts }),
    [documents, profilesForAlerts],
  );
  const dismissedAutoKeys = useMemo(
    () => new Set(dismissedAutoAlerts.map((d) => d.auto_alert_key)),
    [dismissedAutoAlerts],
  );
  const visibleAutoAlerts = useMemo(
    () => autoAlerts.filter((a) => !dismissedAutoKeys.has(a.key)),
    [autoAlerts, dismissedAutoKeys],
  );
  const openManualAlerts = useMemo(
    () => manualAlerts.filter((m) => m.status === "open"),
    [manualAlerts],
  );
  const totalAlertCount = visibleAutoAlerts.length + openManualAlerts.length;
  const topSeverity: AutoAlertSeverity | null = useMemo(() => {
    let best: AutoAlertSeverity | null = null;
    let bestRank = 0;
    const consider = (sev: AutoAlertSeverity) => {
      const r = severityRank(sev);
      if (r > bestRank) {
        best = sev;
        bestRank = r;
      }
    };
    visibleAutoAlerts.forEach((a) => consider(a.severity));
    openManualAlerts.forEach((m) => consider(m.severity));
    return best;
  }, [visibleAutoAlerts, openManualAlerts]);
  // B-084 Batch 1 — sync documents/updateRequests/service from props on
  // server re-fetch. Mirrors the B-075 pattern already used for
  // PersonCard's `localDocs` (line 492).
  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);
  useEffect(() => {
    setUpdateRequests(initialUpdateRequests);
  }, [initialUpdateRequests]);
  useEffect(() => {
    setService(initialService);
  }, [initialService]);

  // B-100 — lift waivers so the KYC Documents tab can optimistically
  // flip a row to "Waived" (or back) without a server round-trip. Sync
  // from prop on every server re-fetch so external mutations propagate.
  const [waivers, setWaivers] = useState<WaivedDocumentRequirement[]>(initialWaivers);
  useEffect(() => {
    setWaivers(initialWaivers);
  }, [initialWaivers]);

  // B-085 — KYC/profile docs go inside person cards; service-level docs
  // (scope='application') flow into the Documents section via `serviceLevelDocs`
  // computed below. The `corporateDocs` category-heuristic was lossy
  // (Reference Letters, Source-of-Funds Declarations etc. with applies_to='both'
  // bled in / out unpredictably) and has been retired.
  const profileDocs = documents.filter((d) => isKycDoc(d.document_types?.category));
  const [serviceDetails, setServiceDetails] = useState<Record<string, unknown>>(
    service.service_details ?? {}
  );
  const [pendingChanges, setPendingChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  // B-099 — step-pill accordion state for the 3 form section cards.
  // People & KYC + Documents pills are scroll-only (their internal
  // expansion mechanics — per-profile cards / Service vs KYC tabs —
  // stay independent). Clicking a form-step pill opens that section
  // and collapses the other two; clicking the same pill again
  // collapses everything.
  type FormStepKey = "company_setup" | "financial" | "banking";
  const [openStepSection, setOpenStepSection] = useState<FormStepKey | null>(null);
  const toggleStepSection = (key: FormStepKey) =>
    setOpenStepSection((current) => (current === key ? null : key));
  function handleStepClick(stepId: string) {
    const FORM_STEP_KEY_BY_ID: Record<string, FormStepKey> = {
      "step-company-setup": "company_setup",
      "step-financial": "financial",
      "step-banking": "banking",
    };
    const key = FORM_STEP_KEY_BY_ID[stepId];
    if (key) setOpenStepSection(key);
    // Defer the scroll a frame so the expansion DOM lands first and the
    // browser scrolls to the correct final offset.
    requestAnimationFrame(() => {
      document.getElementById(stepId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // Milestones with date editing
  const [milestones, setMilestones] = useState({
    loe_received: service.loe_received ?? false,
    loe_received_at: service.loe_received_at ?? null as string | null,
    invoice_sent_at: service.invoice_sent_at ?? null as string | null,
    payment_received_at: service.payment_received_at ?? null as string | null,
  });
  const [savingMilestone, setSavingMilestone] = useState<string | null>(null);

  // Audit trail filters
  const [auditActorFilter, setAuditActorFilter] = useState("all");
  const [auditActionFilter, setAuditActionFilter] = useState("all");

  // B-091 — service-level View Summary modal state
  const [serviceSummaryOpen, setServiceSummaryOpen] = useState(false);
  function handleServiceSummaryEdit(target: string) {
    setServiceSummaryOpen(false);
    // Per-profile expansion state lives inside each PersonCard, so for
    // `kyc-section-{profileId}-…` anchors we fall back to scrolling to the
    // profile card itself; the admin then clicks Show to reach the section.
    // (Documented trade-off in the brief — simpler than lifting per-card
    // expand state out into the page scope.)
    const kycMatch = target.match(/^kyc-section-(.+)-(?:identity|financial|compliance|tax)$/);
    const finalTarget = kycMatch ? `person-card-${kycMatch[1]}` : target;
    requestAnimationFrame(() => {
      document
        .getElementById(finalTarget)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  // B-084 Batch 1 — `typedRoles` is now an alias for the stateful `roles`
  // so callers below pick up live splices from `handleProfileSaved`.
  const typedRoles = roles;

  // B-118 — Profile-name lookup for the review-request card + banner.
  // Use allProfiles (loader pulls every active client_profile on the
  // tenant) so people-KYC rows referencing a profile that isn't yet on
  // this service still get a label.
  const reviewProfileNamesById = useMemo<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const p of allProfiles) {
      out[p.id] = p.full_name ?? "(unnamed profile)";
    }
    for (const r of typedRoles) {
      const pid = r.client_profiles?.id;
      const name = r.client_profiles?.full_name;
      if (pid && name) out[pid] = name;
    }
    return out;
  }, [allProfiles, typedRoles]);
  const serviceFields = (service.service_templates?.service_fields ?? []) as ServiceField[];

  // Deduplicate roles by profile ID — collect all roles per profile
  const profileRolesMap = new Map<string, { person: RoleWithProfile; roles: string[]; allRoleRows: RoleWithProfile[] }>();
  for (const r of typedRoles) {
    const pid = r.client_profiles?.id;
    if (pid) {
      const existing = profileRolesMap.get(pid);
      if (existing) {
        if (!existing.roles.includes(r.role)) existing.roles.push(r.role);
        existing.allRoleRows.push(r);
      } else {
        profileRolesMap.set(pid, { person: r, roles: [r.role], allRoleRows: [r] });
      }
    } else {
      profileRolesMap.set(r.id, { person: r, roles: [r.role], allRoleRows: [r] });
    }
  }
  // B-118 — Profiles passed to the request modal — one row per profile
  // on this service. Role labels keep it scannable when multiple people
  // share the same name. Built off `profileRolesMap` above so it stays
  // in sync with `typedRoles`.
  const reviewModalProfiles = Array.from(profileRolesMap.values()).map(
    ({ person, roles: pRoles }) => ({
      id: (person.client_profiles?.id ?? person.id) as string,
      full_name: person.client_profiles?.full_name ?? "(unnamed profile)",
      role_label: pRoles.join(", "),
    }),
  );

  // B-114 — scope-filtered list of person-scope KYC doc types feeds
  // every `calcKycPct` call below (sort comparator + aggregator). Same
  // filter the parent `kycDocTypes` memo uses further down; memoized so
  // downstream `useMemo`s that depend on it have a stable reference.
  const kycDocTypesForPct = useMemo(
    () =>
      (documentTypes ?? []).filter(
        (dt) => (dt.scope ?? "person") === "person" && dt.is_active !== false,
      ),
    [documentTypes],
  );

  const pctInputForProfile = useCallback(
    (
      p: NonNullable<RoleWithProfile["client_profiles"]>,
    ): CalcKycPctInput => {
      const raw = p.client_profile_kyc;
      const kyc = (Array.isArray(raw) ? raw[0] ?? null : raw) as
        | KycFull
        | null;
      return {
        kyc,
        profile: p,
        profileDocs: documents.filter((d) => d.client_profile_id === p.id),
        kycDocTypes: kycDocTypesForPct,
        waivers: waivers ?? [],
        profileId: p.id,
      };
    },
    [documents, kycDocTypesForPct, waivers],
  );

  // B-091 — sort People & KYC list so most-action-needed profiles surface
  // first: portal-access cluster on top, then KYC % ascending (lower = more
  // work outstanding), then alphabetical name as the predictable tiebreaker.
  // Profiles with no KYC record sort as 0% so they float to the top of
  // their portal-access group.
  const computeKycPctForProfile = useCallback(
    (person: RoleWithProfile): number => {
      const p = person.client_profiles;
      if (!p) return 0;
      // B-114 — DD-aware + record_type-aware + waiver-aware via `calcKycPct`.
      return calcKycPct(pctInputForProfile(p));
    },
    [pctInputForProfile],
  );
  const uniqueRoles = Array.from(profileRolesMap.values()).sort((a, b) => {
    const aPortal = a.allRoleRows.some((r) => r.can_manage) ? 1 : 0;
    const bPortal = b.allRoleRows.some((r) => r.can_manage) ? 1 : 0;
    if (aPortal !== bPortal) return bPortal - aPortal;

    const aKyc = computeKycPctForProfile(a.person);
    const bKyc = computeKycPctForProfile(b.person);
    if (aKyc !== bKyc) return aKyc - bKyc;

    const aName = a.person.client_profiles?.full_name ?? "";
    const bName = b.person.client_profiles?.full_name ?? "";
    return aName.localeCompare(bName);
  });

  // ── B-102 Review Wizard derived state ─────────────────────────────────────
  // When in reviewMode + step 3 + `?profile=<id>` is set, narrow the People
  // & KYC section to a single expanded profile and adapt the bottom nav.
  const searchParams = useSearchParams();
  const rawReviewProfile = reviewMode && reviewStep === 3
    ? searchParams.get("profile")
    : null;
  // B-118 — deep-link from review-request emails surfaces the banner +
  // highlights the relevant card row.
  const highlightReviewRequestId =
    searchParams?.get("reviewRequest") ?? null;
  const reviewProfileId = rawReviewProfile && uniqueRoles.some(
    ({ person }) => person.client_profiles?.id === rawReviewProfile,
  )
    ? rawReviewProfile
    : null;
  const reviewProfileIndex = reviewProfileId
    ? uniqueRoles.findIndex(({ person }) => person.client_profiles?.id === reviewProfileId)
    : -1;
  const reviewProfileLabel = reviewProfileId
    ? uniqueRoles[reviewProfileIndex]?.person.client_profiles?.full_name ?? null
    : null;
  const reviewProfileSubstep = reviewProfileId
    ? {
        profileIndex: reviewProfileIndex,
        onBackToList: () => {
          router.replace(`/admin/services/${service.id}/review?step=3`);
        },
        onNextProfile: () => {
          const nextIdx = reviewProfileIndex + 1;
          if (nextIdx >= uniqueRoles.length) {
            // No more profiles — return to list, let admin advance with Next.
            router.replace(`/admin/services/${service.id}/review?step=3`);
            return;
          }
          const nextPid = uniqueRoles[nextIdx]?.person.client_profiles?.id;
          if (!nextPid) return;
          router.replace(
            `/admin/services/${service.id}/review?step=3&profile=${nextPid}`,
          );
        },
      }
    : null;

  // B-109 Batch 3 — per-profile sub-step. `?substep=<n>` is parsed when
  // step 3 + a profile is selected; defaults to 0. Clamped to >= 0; the
  // sub-wizard itself clamps the upper bound against its computed list.
  const rawSubStep = reviewProfileId ? searchParams.get("substep") : null;
  const reviewSubStepIndex = (() => {
    if (!reviewProfileId) return 0;
    const parsed = rawSubStep ? parseInt(rawSubStep, 10) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  })();
  // Wire the per-profile sub-wizard nav. Built only when a profile is
  // selected; otherwise PersonCard receives `null` and renders normally.
  const reviewProfileWizardSubStep = reviewProfileId
    ? {
        subStepIndex: reviewSubStepIndex,
        onSubStepChange: (next: number) => {
          router.replace(
            `/admin/services/${service.id}/review?step=3&profile=${reviewProfileId}&substep=${next}`,
          );
        },
        onBackToList: () => {
          router.replace(`/admin/services/${service.id}/review?step=3`);
        },
        onProfileReviewed: () => {
          const nextIdx = reviewProfileIndex + 1;
          if (nextIdx >= uniqueRoles.length) {
            router.replace(`/admin/services/${service.id}/review?step=3`);
            return;
          }
          const nextPid = uniqueRoles[nextIdx]?.person.client_profiles?.id;
          if (!nextPid) return;
          // New profile starts at sub-step 0.
          router.replace(
            `/admin/services/${service.id}/review?step=3&profile=${nextPid}`,
          );
        },
      }
    : null;

  // ── Section completion ────────────────────────────────────────────────────

  const companyFields = getFieldsForSection("company_setup", serviceFields);
  const financialFields = getFieldsForSection("financial", serviceFields);
  const bankingFields = getFieldsForSection("banking", serviceFields);

  const companySetupPct = calcSectionCompletion(serviceFields, serviceDetails, "company_setup").percentage;
  const financialPct = calcSectionCompletion(serviceFields, serviceDetails, "financial").percentage;
  const bankingPct = calcSectionCompletion(serviceFields, serviceDetails, "banking").percentage;

  const hasDirector = typedRoles.some((r) => r.role === "director");
  // B-114 — aggregate People & KYC via the new docs-aware `calcKycPct`.
  // Each profile contributes its full per-profile pct (record_type +
  // DD-aware fields + required-doc count) and we average across all
  // profiles with a `client_profiles` row.
  //
  // B-116 — dedupe by profile id. `typedRoles` has one row per
  // (profile × role) so a director+shareholder+UBO profile would be
  // counted three times and over-weight its KYC % in the average.
  const uniqueKycProfiles = useMemo(() => {
    type ProfileRow = NonNullable<typeof typedRoles[number]["client_profiles"]>;
    const byId = new Map<string, ProfileRow>();
    for (const r of typedRoles) {
      const p = r.client_profiles;
      if (!p) continue;
      if (!byId.has(p.id)) byId.set(p.id, p);
    }
    return Array.from(byId.values());
  }, [typedRoles]);
  const kycPct = hasDirector && uniqueKycProfiles.length > 0
    ? Math.round(
        uniqueKycProfiles.reduce(
          (sum, p) => sum + calcKycPct(pctInputForProfile(p)),
          0,
        ) / uniqueKycProfiles.length,
      )
    : 0;
  const peopleKycPct = typedRoles.length === 0 ? 0 : hasDirector ? kycPct : Math.round(kycPct * 0.5);

  // B-085 — service-level Documents pill. Universe is every active
  // `document_types` row with `scope='application'` (B-049 backfill: org-only
  // docs become service-level by default; KYC-per-person docs stay
  // `scope='person'`). Pct is upload-based and deduped by `document_type_id`
  // so the same type uploaded twice still counts once. KYC docs that used to
  // bleed into this pill via category-match are now filtered out — they live
  // in the per-profile Documents block (B-077/2) instead.
  const serviceDocTypes = useMemo(
    () =>
      (documentTypes ?? []).filter(
        (dt) => dt.scope === "application" && dt.is_active !== false,
      ),
    [documentTypes],
  );
  const serviceDocTypeIds = useMemo(
    () => new Set(serviceDocTypes.map((dt) => dt.id)),
    [serviceDocTypes],
  );
  const serviceLevelDocs = useMemo(
    () =>
      documents.filter(
        (d) => !!d.document_type_id && serviceDocTypeIds.has(d.document_type_id),
      ),
    [documents, serviceDocTypeIds],
  );

  // B-097 — KYC doc types (scope='person', active) + uploaded docs flat across profiles.
  const kycDocTypes = useMemo(
    () =>
      (documentTypes ?? []).filter(
        (dt) => (dt.scope ?? "person") === "person" && dt.is_active !== false,
      ),
    [documentTypes],
  );
  const kycDocTypeIds = useMemo(
    () => new Set(kycDocTypes.map((dt) => dt.id)),
    [kycDocTypes],
  );
  const kycDocs = useMemo(
    () =>
      documents.filter(
        (d) => !!d.document_type_id && kycDocTypeIds.has(d.document_type_id),
      ),
    [documents, kycDocTypeIds],
  );
  const uploadedServiceTypeIds = useMemo(() => {
    const out = new Set<string>();
    for (const d of serviceLevelDocs) {
      if (d.document_type_id) out.add(d.document_type_id);
    }
    return out;
  }, [serviceLevelDocs]);

  // B-116 — per-profile applicable KYC doc types (applies_to-aware via
  // B-115's helper). Each unique profile contributes only the docs that
  // apply to its record_type — org profiles drop individual-only types
  // like Driving Licence, individual profiles drop org-only ones.
  const applicableKycDocsByProfile = useMemo(() => {
    const map = new Map<string, DocumentType[]>();
    for (const p of uniqueKycProfiles) {
      map.set(p.id, filterDocTypesForRecordType(kycDocTypes, p.record_type));
    }
    return map;
  }, [uniqueKycProfiles, kycDocTypes]);
  const kycDocsExpectedCount = useMemo(() => {
    let n = 0;
    applicableKycDocsByProfile.forEach((arr) => {
      n += arr.length;
    });
    return n;
  }, [applicableKycDocsByProfile]);
  const kycDocsCompletedCount = useMemo(() => {
    let n = 0;
    for (const p of uniqueKycProfiles) {
      const applicable = applicableKycDocsByProfile.get(p.id) ?? [];
      for (const dt of applicable) {
        const isUploaded = kycDocs.some(
          (d) =>
            d.document_type_id === dt.id && d.client_profile_id === p.id,
        );
        const isWaived = waivers.some(
          (w) =>
            w.scope === "person" &&
            w.client_profile_id === p.id &&
            w.document_type_id === dt.id,
        );
        if (isUploaded || isWaived) n++;
      }
    }
    return n;
  }, [uniqueKycProfiles, applicableKycDocsByProfile, kycDocs, waivers]);

  // B-107 — service-scope waivers count as "done" for the Documents
  // section pct. Filter by `scope === "application"` so per-profile
  // waivers are surfaced via the KYC-doc branch below, not this one.
  const documentsServiceWaivedCount = waivers.filter(
    (w) => w.scope === "application",
  ).length;
  const documentsServiceCompleted =
    uploadedServiceTypeIds.size + documentsServiceWaivedCount;
  // B-116 — Documents step pill + section header now fold service-level
  // docs and per-profile KYC docs into a single denominator/numerator so
  // the pct reflects every doc on the service. Per-tab labels inside
  // `AdminDocumentsSection` stay tab-scoped (computed independently).
  const documentsUploadedCount =
    documentsServiceCompleted + kycDocsCompletedCount;
  const documentsExpectedCount =
    serviceDocTypes.length + kycDocsExpectedCount;
  const documentsPct =
    documentsExpectedCount > 0
      ? Math.round((documentsUploadedCount / documentsExpectedCount) * 100)
      : 0;

  // B-119 — Actions section state + completion %. We hold a stateful
  // copy of `actionsByKey` so subsection saves immediately recompute
  // `actionsPct` without a router refresh, mirroring the existing pcts.
  const [adminActions, setAdminActions] = useState<Record<string, ServiceAction>>(
    actionsByKey,
  );
  useEffect(() => {
    setAdminActions(actionsByKey);
  }, [actionsByKey]);
  const hasActionBindings = templateActions.length > 0;
  const actionsPct = useMemo(() => {
    if (!hasActionBindings) return 0;
    let done = 0;
    for (const ta of templateActions) {
      const inst = adminActions[ta.action_key];
      if (inst?.status === "done") done += 1;
    }
    return Math.round((done / templateActions.length) * 100);
  }, [hasActionBindings, templateActions, adminActions]);

  // B-119 — dynamic step list. Adds the Actions step only when the
  // current template has ≥1 binding.
  const adminSteps = useMemo(
    () => buildAdminSteps(hasActionBindings),
    [hasActionBindings],
  );

  // B-119 — per-subsection pending rows. Surfaces the four action
  // subsections directly under the Actions step row so admin can see
  // which one still needs attention.
  const actionSubsectionRows = useMemo(() => {
    if (!hasActionBindings) return [];
    return templateActions.map((ta) => {
      const inst = adminActions[ta.action_key];
      return {
        action_key: ta.action_key,
        label: ta.action_label,
        status:
          (inst?.status as
            | "pending"
            | "in_progress"
            | "done"
            | "blocked"
            | "not_applicable"
            | undefined) ?? "pending",
      };
    });
  }, [hasActionBindings, templateActions, adminActions]);

  // B-111 — count of required service-level doc types with no upload AND
  // no application-scope waiver. Drives the Documents pill's "N missing"
  // count badge + the right-rail Pending card (Batch 2).
  const waivedAppDocTypeIds = useMemo(() => {
    const out = new Set<string>();
    for (const w of waivers) {
      if (w.scope === "application") out.add(w.document_type_id);
    }
    return out;
  }, [waivers]);
  const missingDocCount = useMemo(() => {
    let n = 0;
    for (const dt of serviceDocTypes) {
      if (uploadedServiceTypeIds.has(dt.id)) continue;
      if (waivedAppDocTypeIds.has(dt.id)) continue;
      n++;
    }
    return n;
  }, [serviceDocTypes, uploadedServiceTypeIds, waivedAppDocTypeIds]);

  // B-111 — count of profiles whose KYC is < 100%. Drives the People &
  // KYC pill's "N incomplete" count badge.
  const incompleteProfileCount = useMemo(() => {
    let n = 0;
    for (const { person } of uniqueRoles) {
      if (person.client_profiles?.is_representative) continue;
      const pct = computeKycPctForProfile(person);
      if (pct < 100) n++;
    }
    return n;
  }, [uniqueRoles, computeKycPctForProfile]);

  // B-111 Batch 2 — click handler for Pending card rows. Routes to the
  // matching surface: section anchor scroll, profile card anchor scroll,
  // service-level Alerts dialog open. `open_document` falls back to the
  // section the doc sits in — full DocumentDetailDialog open from here
  // would require lifting two PersonCard/AdminDocumentsSection local
  // dialog states; admin clicks View on the doc row to drill further.
  const handlePendingAction = useCallback(
    (item: PendingItem) => {
      switch (item.actionType) {
        case "scroll_to_section": {
          const el = document.getElementById(item.actionPayload);
          el?.scrollIntoView({ behavior: "smooth", block: "start" });
          return;
        }
        case "scroll_to_profile": {
          const el = document.getElementById(
            `person-card-${item.actionPayload}`,
          );
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "start" });
            // PersonCard's header is the cursor-pointer div with the
            // role pill — click it to expand if currently collapsed.
            // No state lift needed; mirrors how admin would click it.
            const header = el.querySelector<HTMLDivElement>(".cursor-pointer");
            const isExpanded = el.querySelector("[data-profile-id]") !== null;
            if (header && !isExpanded) header.click();
          }
          return;
        }
        case "open_document": {
          // Find the doc → if profile-scoped, route to that PersonCard;
          // else route to the Documents section. Admin clicks View on the
          // doc row to open the full DocumentDetailDialog.
          const doc = documents.find((d) => d.id === item.actionPayload);
          if (doc?.client_profile_id) {
            const el = document.getElementById(
              `person-card-${doc.client_profile_id}`,
            );
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
            const header = el?.querySelector<HTMLDivElement>(".cursor-pointer");
            const isExpanded =
              el?.querySelector("[data-profile-id]") !== null;
            if (header && !isExpanded) header.click();
          } else {
            document
              .getElementById("step-documents")
              ?.scrollIntoView({ behavior: "smooth", block: "start" });
          }
          return;
        }
        case "open_alert": {
          setAlertsDialogOpen(true);
          return;
        }
      }
    },
    [documents],
  );

  // B-111 Batch 2 — per-profile snapshot for the Pending card. Same
  // `computeKycPctForProfile` helper that drives the step pill count
  // badge; one row per unique profile with their current KYC pct.
  const profilesForPending = useMemo<PendingProfileInput[]>(
    () =>
      uniqueRoles
        .map(({ person }) => person.client_profiles)
        .filter(
          (
            p,
          ): p is NonNullable<RoleWithProfile["client_profiles"]> => !!p,
        )
        .map((p) => {
          // Reuse computeKycPctForProfile by reconstructing a minimal
          // RoleWithProfile-shaped object — only `client_profiles.client_profile_kyc`
          // is read.
          const pseudo: RoleWithProfile = {
            client_profiles: p,
          } as RoleWithProfile;
          return {
            id: p.id,
            full_name: p.full_name ?? null,
            kycPct: computeKycPctForProfile(pseudo),
            isRepresentative: !!p.is_representative,
          };
        }),
    [uniqueRoles, computeKycPctForProfile],
  );
  // B-113 Batch 3 — per-profile pending map. Each profile gets a list
  // of items scoped to that profile only (missing required KYC fields,
  // missing required docs, profile- or doc-scoped auto alerts). The
  // header-mounted `ProfilePendingButton` reads `items.length` to
  // decide whether to render; clicks reuse `handlePendingAction` so the
  // navigation behaviour matches the service-level Pending card.
  const perProfilePending = useMemo<Map<string, PendingItem[]>>(() => {
    const map = new Map<string, PendingItem[]>();
    for (const role of typedRoles) {
      const p = role.client_profiles;
      if (!p) continue;
      if (map.has(p.id)) continue; // skip dup roles for same profile
      const rawKyc = p.client_profile_kyc;
      const kyc = (Array.isArray(rawKyc) ? rawKyc[0] ?? null : rawKyc) as
        | Record<string, unknown>
        | null;
      const items = computeProfilePendingItems({
        profile: {
          id: p.id,
          full_name: p.full_name ?? null,
          email: p.email ?? null,
          phone: p.phone ?? null,
          // B-114 — record_type drives which KYC field schema feeds
          // the popover. Without it an org profile would surface
          // "Date of birth — missing" etc., which is nonsense.
          record_type: p.record_type ?? null,
          is_representative: !!p.is_representative,
        },
        kyc,
        ddLevel: p.due_diligence_level ?? null,
        profileDocuments: documents
          .filter((d) => d.client_profile_id === p.id)
          .map((d) => ({
            id: d.id,
            document_type_id: d.document_type_id,
            client_profile_id: d.client_profile_id,
          })),
        documentTypes: kycDocTypesForPct.map((dt) => ({
          id: dt.id,
          name: dt.name,
          applies_to: dt.applies_to,
        })),
        waivers: (waivers ?? []).map((w) => ({
          scope: w.scope,
          client_profile_id: w.client_profile_id,
          document_type_id: w.document_type_id,
        })),
        autoAlerts: visibleAutoAlerts,
      });
      map.set(p.id, items);
    }
    return map;
  }, [typedRoles, documents, kycDocTypesForPct, waivers, visibleAutoAlerts]);

  const documentsRag: RagStatus =
    documentsPct >= 100 ? "green" : documentsPct > 0 ? "amber" : "red";
  const documentsStatusLabel =
    documentsPct >= 100
      ? "Complete"
      : documentsPct > 0
        ? "Partial"
        : "Not started";

  // ── Field change handler ──────────────────────────────────────────────────

  const handleFieldChange = useCallback((key: string, value: unknown) => {
    setServiceDetails((prev) => ({ ...prev, [key]: value }));
    setPendingChanges(true);
  }, []);

  // ── Save / Cancel ─────────────────────────────────────────────────────────

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_details: serviceDetails }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setService((prev) => ({ ...prev, service_details: serviceDetails }));
      setPendingChanges(false);
      // B-084 Batch 1 — belt-and-suspenders: server-rendered side data
      // (audit trail, derived counts on the page object) refreshes too.
      router.refresh();
      toast.success("Service details saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // B-102 — boolean-returning wrapper for the Review Wizard's save-on-advance.
  // The legacy `handleSave` toasts and swallows the result; this variant
  // surfaces a clean ok/not-ok so the wizard can refuse to advance on failure.
  async function handleSaveReturningOk(): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_details: serviceDetails }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        toast.error(data.error ?? "Failed to save");
        return false;
      }
      setService((prev) => ({ ...prev, service_details: serviceDetails }));
      setPendingChanges(false);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      return false;
    }
  }

  function handleCancel() {
    setServiceDetails(service.service_details ?? {});
    setPendingChanges(false);
  }

  // ── Status update ─────────────────────────────────────────────────────────

  async function updateStatus(status: string) {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setService((prev) => ({ ...prev, status: status as typeof prev.status }));
      toast.success("Status updated");
      // B-093 — refresh so the page re-fetches the latest status_changed
      // audit row written by the PATCH route; the Status card's
      // "updated on <date> by <name>" line reflects it on the next render.
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setUpdatingStatus(false);
    }
  }

  // B-093 — Stage Override confirmation flow. Selecting a non-current
  // value from the override <select> stages the target here; the
  // confirmation Dialog renders when this is non-null. Confirming runs
  // updateStatus; cancelling clears the state.
  const [pendingOverride, setPendingOverride] = useState<string | null>(null);
  function requestOverride(target: string) {
    if (!target || target === service.status) return;
    setPendingOverride(target);
  }
  function confirmOverride() {
    if (pendingOverride) {
      void updateStatus(pendingOverride);
      setPendingOverride(null);
    }
  }

  // ── Milestones ────────────────────────────────────────────────────────────

  async function toggleMilestone(
    field: "loe_received_at" | "invoice_sent_at" | "payment_received_at",
    boolField?: "loe_received"
  ) {
    setSavingMilestone(field);
    const current = milestones[field as keyof typeof milestones] as string | null | boolean;
    const isOn = boolField ? milestones.loe_received : !!current;
    const newDate = !isOn ? new Date().toISOString() : null;
    const patch: Record<string, unknown> = { [field]: newDate };
    if (boolField) patch[boolField] = !isOn;
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMilestones((prev) => ({
        ...prev,
        [field]: newDate,
        ...(boolField ? { [boolField]: !isOn } : {}),
      }));
      toast.success("Milestone updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingMilestone(null);
    }
  }

  async function updateMilestoneDate(
    field: "loe_received_at" | "invoice_sent_at" | "payment_received_at",
    value: string
  ) {
    setSavingMilestone(field);
    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value ? new Date(value).toISOString() : null }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setMilestones((prev) => ({ ...prev, [field]: value ? new Date(value).toISOString() : null }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSavingMilestone(null);
    }
  }

  // ── Assigned admin (stored in service_details._assigned_admin_id) ─────────

  const assignedAdminId = (serviceDetails._assigned_admin_id as string | null) ?? null;

  async function assignAdmin(userId: string | null) {
    const updated = { ...serviceDetails, _assigned_admin_id: userId };
    setServiceDetails(updated);
    try {
      await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service_details: updated }),
      });
      setService((prev) => ({ ...prev, service_details: updated }));
      toast.success("Account manager updated");
    } catch {
      toast.error("Failed to update manager");
    }
  }

  // ── Audit trail filters ───────────────────────────────────────────────────

  const auditActors = Array.from(new Set(auditEntries.map((e) => e.actor_name).filter(Boolean))) as string[];
  const auditActions = Array.from(new Set(auditEntries.map((e) => e.action).filter(Boolean)));

  const filteredAudit = auditEntries.filter((e) => {
    if (auditActorFilter !== "all" && e.actor_name !== auditActorFilter) return false;
    if (auditActionFilter !== "all" && e.action !== auditActionFilter) return false;
    return true;
  });

  // Cast to AuditLogEntry[] for the AuditTrail component
  const auditForComponent = filteredAudit as unknown as AuditLogEntry[];

  const [newlyAddedProfileId, setNewlyAddedProfileId] = useState<string | null>(null);

  function handleRolesRefresh() {
    router.refresh();
  }

  // B-084 Batch 1 — per-profile save splice. PersonCard's `handleKycBarSave`
  // calls this on success with the post-update kyc/profile rows returned
  // from `PATCH /api/admin/profiles/[id]/kyc-fields`. Splicing into the
  // parent's `roles` state lets `peopleKycPct` (and the per-profile pill)
  // recompute immediately, before the RSC refresh lands.
  const handleProfileSaved = useCallback(
    (
      profileId: string,
      updatedKyc: Record<string, unknown> | null,
      updatedProfile: {
        full_name: string | null;
        email: string | null;
        phone: string | null;
      } | null,
    ) => {
      setRoles((prev) =>
        prev.map((r) => {
          if (!r.client_profiles || r.client_profiles.id !== profileId) return r;
          const nextKyc = updatedKyc
            ? [updatedKyc as KycFull]
            : r.client_profiles.client_profile_kyc;
          return {
            ...r,
            client_profiles: {
              ...r.client_profiles,
              full_name:
                updatedProfile?.full_name ?? r.client_profiles.full_name,
              email: updatedProfile?.email ?? r.client_profiles.email,
              phone: updatedProfile?.phone ?? r.client_profiles.phone,
              client_profile_kyc: nextKyc,
            },
          };
        }),
      );
    },
    [],
  );

  function handleProfileAdded(profileId?: string) {
    if (profileId) setNewlyAddedProfileId(profileId);
    router.refresh();
  }

  // B-101 Batch 3 — splice removed profile out of `roles` so the card
  // disappears immediately. KycDocumentsTable + PerProfileReviewSummaryPanel
  // derive everything from `roles`, so the row count for the table and the
  // people accordion both update without an RSC roundtrip. `onRefresh` is
  // still called by the dialog so the audit-log panel + waiver list stay
  // consistent on the next render.
  const handleProfileRemoved = useCallback((profileId: string) => {
    setRoles((prev) =>
      prev.filter((r) => r.client_profiles?.id !== profileId),
    );
  }, []);

  // B-113 Batch 2 — DD-level inline change splice. `ProfileDdLevelSelector`
  // calls this after a successful PATCH. Mirrors `handleProfileSaved`'s
  // pattern: rewrite the matching profile in-place so KycLongForm
  // re-renders with the new `dueDiligenceLevel` and `calcKycPct` recomputes
  // (EDD-only fields toggle visibility, peopleKycPct shifts).
  const handleProfileDdLevelChanged = useCallback(
    (profileId: string, nextLevel: string) => {
      setRoles((prev) =>
        prev.map((r) => {
          if (!r.client_profiles || r.client_profiles.id !== profileId) return r;
          return {
            ...r,
            client_profiles: {
              ...r.client_profiles,
              due_diligence_level: nextLevel,
            },
          };
        }),
      );
    },
    [],
  );

  // B-077 Batch 6c — when a new profile is added/linked, the card mounts
  // (or re-mounts) with `defaultExpanded`. Wait for the next render so
  // the new DOM node exists, then smooth-scroll it into view.
  useEffect(() => {
    if (!newlyAddedProfileId) return;
    let frames = 0;
    const tryScroll = () => {
      const el = document.getElementById(`person-card-${newlyAddedProfileId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      frames++;
      if (frames < 30) requestAnimationFrame(tryScroll);
    };
    requestAnimationFrame(tryScroll);
  }, [newlyAddedProfileId, typedRoles]);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminApplicationSectionsProvider
      applicationId={service.id}
      initialReviews={sectionReviews}
    >
    <div>
      {/* B-102 — Review Wizard top bar replaces the existing sticky shell
          while `reviewMode` is true. */}
      {reviewMode && (
        <ReviewWizardTopBar
          serviceId={service.id}
          step={reviewStep}
          profileLabel={reviewProfileLabel}
          service={service}
          hasActions={hasActionBindings}
        />
      )}
      {/* ── B-090 Sticky shell: back link + title row + stage strip + step
            indicator all pin together at top-0 of <main>. Background
            matches the page (bg-gray-50) so scrolling content underneath
            doesn't bleed through; -mx-8 px-8 extends the bg to the
            edges of <main> beyond the page's p-8 padding so the shadow
            spans the full content width. ──────────────────────────── */}
      {!reviewMode && (
      <div className="sticky top-0 z-30 bg-gray-50 -mx-8 px-8 pt-3 pb-3 shadow-sm">
      <Link
        href="/admin/services"
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-brand-navy mb-3"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to services
      </Link>

      {/* ── Title + stage strip (formerly sticky on its own) ────────────── */}
      <div className="bg-white border rounded-xl px-5 py-4 mb-3 shadow-sm">
        {/* Title + Save/Cancel */}
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="min-w-0">
            {service.service_number && (
              <span className="text-xs font-mono text-gray-400 mr-2">{service.service_number}</span>
            )}
            <h1 className="text-xl font-bold text-brand-navy inline">
              {service.service_templates?.name ?? "Service"}
            </h1>
            {service.service_templates?.description && (
              <p className="text-sm text-gray-400 mt-0.5">{service.service_templates.description}</p>
            )}
          </div>

        </div>

        {/* Salesforce-style path chevron. B-098 — renders the 8 forward
            statuses imported from SERVICE_STATUS_FORWARD_CHAIN. Override
            terminals (`rejected`, `closed`) aren't in the strip; when
            the service sits at one of them the strip shows the chain
            unhighlighted and the right-rail Status card carries the
            terminal indication via its badge. */}
        <div className="flex items-center mt-3">
          {SERVICE_STATUS_FORWARD_CHAIN.map((step, idx, arr) => {
            const stepIdx = (arr as readonly string[]).indexOf(service.status);
            const isActive = idx === stepIdx;
            const isComplete = stepIdx >= 0 && idx < stepIdx;
            const isRejected = service.status === "rejected";
            const isClosed = service.status === "closed";
            const isTerminalOverride = isRejected || isClosed;

            // Salesforce-style colours
            const bgColor = isTerminalOverride && idx === arr.length - 1
              ? (isRejected ? "#ef4444" : "#6b7280")
              : isComplete
              ? "#16a34a"
              : isActive
              ? "#2563eb"
              : "#e5e7eb";
            const textColor =
              isComplete || isActive || (isTerminalOverride && idx === arr.length - 1)
                ? "#fff"
                : "#9ca3af";
            const overrideLabel = isTerminalOverride && idx === arr.length - 1
              ? SERVICE_STATUS_LABELS[isRejected ? "rejected" : "closed"]
              : null;
            return (
              <div
                key={step}
                className="relative flex-1"
                style={{ marginRight: idx < arr.length - 1 ? "2px" : 0 }}
              >
                <svg viewBox="0 0 200 36" className="w-full h-9" preserveAspectRatio="none">
                  {/* Main body */}
                  <path
                    d={idx === 0
                      ? "M4,0 L180,0 L200,18 L180,36 L4,36 Q0,36 0,32 L0,4 Q0,0 4,0"
                      : idx === arr.length - 1
                      ? "M0,0 L20,0 L20,0 L196,0 Q200,0 200,4 L200,32 Q200,36 196,36 L0,36 L20,18 Z"
                      : "M0,0 L180,0 L200,18 L180,36 L0,36 L20,18 Z"}
                    fill={bgColor}
                  />
                  {/* B-101 — fontSize 14 → 12 so all 8 chevrons fit at equal width; Start matches the rest. */}
                  <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
                    fill={textColor} fontSize="12" fontWeight="600" fontFamily="system-ui, sans-serif"
                  >
                    {isComplete ? "✓ " : ""}{overrideLabel ?? SERVICE_STATUS_LABELS[step]}
                  </text>
                </svg>
              </div>
            );
          })}
        </div>
      </div>

      {/* B-073 — wizard-shaped step indicator with smooth-scroll anchors.
          B-102 — entry button to the Review Wizard surface (sky-blue
          `#24a0ed`).
          B-107 — drop `justify-between` so the button sits adjacent to
          the last pill (`gap-3` provides the small breathing space).
          `flex-wrap` lets the button wrap below the pills on narrow
          viewports instead of overflowing horizontally. */}
      <div className="rounded-lg border bg-white px-4 py-3 flex items-center flex-wrap gap-3">
        <StepPillsWithState
          pcts={
            hasActionBindings
              ? [
                  companySetupPct,
                  financialPct,
                  bankingPct,
                  peopleKycPct,
                  documentsPct,
                  actionsPct,
                ]
              : [
                  companySetupPct,
                  financialPct,
                  bankingPct,
                  peopleKycPct,
                  documentsPct,
                ]
          }
          incompleteProfileCount={incompleteProfileCount}
          missingDocCount={missingDocCount}
          onStepClick={handleStepClick}
          steps={adminSteps}
        />
        {/* B-108 Batch 3 — Alerts + Review Wizard sit at the right edge,
            grouped with `gap-x-8` so they are visually separated from
            the step pills and from each other. Alerts color tracks the
            highest-severity open alert; muted gray when zero. */}
        <div className="flex items-center gap-x-8 ml-auto">
          <button
            type="button"
            onClick={() => setAlertsDialogOpen(true)}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-white whitespace-nowrap shadow-sm hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{
              backgroundColor:
                totalAlertCount === 0
                  ? "#94a3b8"
                  : topSeverity === "critical"
                    ? "#dc2626"
                    : topSeverity === "warning"
                      ? "#f59e0b"
                      : "#94a3b8",
            }}
          >
            {topSeverity === "critical" ? (
              <AlertTriangle className="size-4" />
            ) : (
              <Bell className="size-4" />
            )}
            Alerts ({totalAlertCount})
          </button>
          <Link
            href={`/admin/services/${service.id}/review?step=0`}
            className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium text-white whitespace-nowrap shadow-sm hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
            style={{ backgroundColor: "#24a0ed" }}
          >
            <Wand2 className="size-4" />
            Review Wizard
          </Link>
        </div>
      </div>

      {/* B-108 Batch 3 — alerts dialog mount. Open state lives at the
          top of this component; dismissals/resolves call router.refresh()
          so this list always reflects current DB + computed state. */}
      <ServiceAlertsDialog
        open={alertsDialogOpen}
        onClose={() => setAlertsDialogOpen(false)}
        serviceId={service.id}
        autoAlerts={visibleAutoAlerts}
        manualAlerts={manualAlerts}
      />

      {/* B-118 — Peer / Manager review modal. Opened from the right-rail
          card; on success, splice the request into state + splice the
          generated comm rows into the Communications card. */}
      <RequestReviewModal
        open={requestReviewModalOpen}
        onOpenChange={setRequestReviewModalOpen}
        serviceId={service.id}
        currentUserId={currentUserId}
        admins={adminUsers.map((u) => ({
          user_id: u.user_id,
          full_name: u.full_name,
          email: u.email,
        }))}
        profiles={reviewModalProfiles}
        onCreated={(req, comms) => {
          upsertReviewRequest(req);
          appendCommunications(comms);
          router.refresh();
        }}
      />
      </div>
      )}
      {/* ── End sticky shell ────────────────────────────────────────────── */}

      {/* ── Two-column layout ──────────────────────────────────────────── */}
      <div className={reviewMode
        ? "max-w-3xl mx-auto mt-4"
        : "grid grid-cols-1 lg:grid-cols-3 gap-6 mt-4"}>

      {/* ── LEFT: Main Sections (col-span-2) ────────────────────────────── */}
      {/* Each section is its own boxed Card; outer container provides spacing only */}
      <div ref={leftColumnRef} className={reviewMode ? "space-y-4" : "lg:col-span-2 space-y-4"}>

        {/* B-118 — Sticky review-request banner for reviewers. Renders only
              when the current admin is an invited reviewer on at least one
              open request for this service. Honours the ?reviewRequest=<id>
              deep-link from review-request emails. */}
        {!reviewMode && (
          <ReviewRequestBanner
            serviceId={service.id}
            currentUserId={currentUserId}
            requests={reviewRequests}
            highlightRequestId={highlightReviewRequestId}
            profileNamesById={reviewProfileNamesById}
            onClosed={(req, comms) => {
              upsertReviewRequest(req);
              appendCommunications(comms);
              router.refresh();
            }}
          />
        )}

        {/* ── Section 1: Company Setup ────────────────────────────────────── */}
        {(!reviewMode || reviewStep === 0) && (
        <ServiceCollapsibleSection
          title="Company Setup"
          percentage={companySetupPct}
          ragStatus={ragFromPct(companySetupPct)}
          sectionKey="company_setup"
          anchorId="step-company-setup"
          variant="step"
          open={reviewMode ? true : openStepSection === "company_setup"}
          onToggle={() => toggleStepSection("company_setup")}
        >
          {companyFields.length === 0 ? (
            <p className="text-sm text-gray-400">No company setup fields for this template.</p>
          ) : (
            <DynamicServiceForm
              fields={companyFields}
              values={serviceDetails}
              onChange={handleFieldChange}
              hideHeaders
            />
          )}
        </ServiceCollapsibleSection>
        )}

        {/* ── Section 2: Financial ─────────────────────────────────────────── */}
        {(!reviewMode || reviewStep === 1) && (
        <ServiceCollapsibleSection
          title="Financial"
          percentage={financialPct}
          ragStatus={ragFromPct(financialPct)}
          sectionKey="financial"
          anchorId="step-financial"
          variant="step"
          open={reviewMode ? true : openStepSection === "financial"}
          onToggle={() => toggleStepSection("financial")}
        >
          {financialFields.length === 0 ? (
            <p className="text-sm text-gray-400">No financial fields for this template.</p>
          ) : (
            <DynamicServiceForm
              fields={financialFields}
              values={serviceDetails}
              onChange={handleFieldChange}
              hideHeaders
            />
          )}
        </ServiceCollapsibleSection>
        )}

        {/* ── Section 3: Banking ───────────────────────────────────────────── */}
        {(!reviewMode || reviewStep === 2) && (
        <ServiceCollapsibleSection
          title="Banking"
          percentage={bankingPct}
          ragStatus={ragFromPct(bankingPct)}
          sectionKey="banking"
          anchorId="step-banking"
          variant="step"
          open={reviewMode ? true : openStepSection === "banking"}
          onToggle={() => toggleStepSection("banking")}
        >
          {bankingFields.length === 0 ? (
            <p className="text-sm text-gray-400">No banking fields for this template.</p>
          ) : (
            <DynamicServiceForm
              fields={bankingFields}
              values={serviceDetails}
              onChange={handleFieldChange}
              hideHeaders
            />
          )}
        </ServiceCollapsibleSection>
        )}

        {/* ── Section 4: People & KYC ──────────────────────────────────────── */}
        {(!reviewMode || reviewStep === 3) && (
        <ServiceCollapsibleSection
          title={`People & KYC (${uniqueRoles.length} ${uniqueRoles.length === 1 ? "person" : "people"})`}
          percentage={peopleKycPct}
          ragStatus={ragFromPct(peopleKycPct)}
          sectionKey="people"
          anchorId="step-people-kyc"
          variant="step"
          defaultOpen={reviewMode ? true : undefined}
        >
          <div className="pt-4">
            {/* B-077 Batch 6a — Add Director / Shareholder / UBO buttons
                live directly under the People & KYC heading, ABOVE the
                per-person card list (was below it). */}
            <div className="flex flex-wrap gap-2 mb-4">
              {(["director", "shareholder", "ubo"] as const).map((r) => (
                <AddProfileDialog
                  key={r}
                  serviceId={service.id}
                  allProfiles={allProfiles}
                  existingRoles={typedRoles}
                  onAdded={handleProfileAdded}
                  defaultRole={r}
                  trigger={
                    <Button size="sm" variant="outline" className={`gap-1.5 border-dashed ${BTN_OUTLINE}`}>
                      <Plus className="h-3.5 w-3.5" />
                      Add {r === "ubo" ? "UBO" : r.charAt(0).toUpperCase() + r.slice(1)}
                    </Button>
                  }
                />
              ))}
            </div>

            {/* B-102 — Review Wizard sub-step LIST view: in review mode +
                step 3 + no `?profile=<id>`, render a clickable list that
                navigates to the per-profile sub-step instead of the
                expandable PersonCards. Keeps the URL the source of truth
                for which profile is currently being reviewed. */}
            {reviewMode && reviewStep === 3 && !reviewProfileId && uniqueRoles.length > 0 && (
              <div className="space-y-2 mb-4">
                {uniqueRoles.map(({ person, roles: personRoles }) => {
                  const pid = person.client_profiles?.id;
                  const name = person.client_profiles?.full_name ?? "Unnamed profile";
                  if (!pid) return null;
                  return (
                    <Link
                      key={pid}
                      href={`/admin/services/${service.id}/review?step=3&profile=${pid}`}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-white px-4 py-3 hover:bg-gray-50 transition-colors"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-brand-navy truncate">{name}</p>
                        <p className="text-xs text-gray-500 capitalize truncate">
                          {personRoles.join(", ")}
                        </p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400 shrink-0" />
                    </Link>
                  );
                })}
              </div>
            )}

            {uniqueRoles.length === 0 ? (
              <p className="text-sm text-gray-400 mb-4">No profiles linked yet.</p>
            ) : (reviewMode && reviewStep === 3 && !reviewProfileId) ? null : (
              <div className="space-y-3 mb-4">
                {/* B-102 — Review Wizard sub-step DETAIL view: when
                    `?profile=<id>` is set on step 3, render only that
                    profile (expanded). Outside review mode, render the
                    full per-profile card list. */}
                {(reviewMode && reviewProfileId
                  ? uniqueRoles.filter(({ person }) => person.client_profiles?.id === reviewProfileId)
                  : uniqueRoles
                ).map(({ person, roles: personRoles, allRoleRows }) => {
                  const pid = person.client_profiles?.id;
                  const personProfileDocs = pid
                    ? profileDocs.filter((d) => d.client_profile_id === pid)
                    : [];
                  // B-070 — provenance rows scoped to this profile.
                  const personFieldExtractions = pid
                    ? fieldExtractions.filter((fe) => fe.client_profile_id === pid)
                    : [];
                  return (
                    <PersonCard
                      key={pid ?? person.id}
                      roleRow={person}
                      allRoleRows={allRoleRows}
                      combinedRoles={personRoles}
                      serviceId={service.id}
                      profileDocuments={personProfileDocs}
                      documentTypes={documentTypes}
                      requirements={requirements}
                      updateRequests={updateRequests}
                      defaultExpanded={
                        (!!pid && pid === newlyAddedProfileId) ||
                        (reviewMode && reviewProfileId === pid)
                      }
                      fieldExtractions={personFieldExtractions}
                      waivers={waivers}
                      onWaiversChange={setWaivers}
                      adminNamesByUserId={adminNamesByUserId}
                      onRefresh={handleRolesRefresh}
                      onProfileSaved={handleProfileSaved}
                      onRemoved={handleProfileRemoved}
                      onDdLevelChanged={handleProfileDdLevelChanged}
                      onCommunicationSent={appendCommunication}
                      pendingItems={
                        pid ? perProfilePending.get(pid) ?? [] : []
                      }
                      onPendingAction={handlePendingAction}
                      wizardSubStep={
                        reviewMode && reviewProfileId === pid
                          ? reviewProfileWizardSubStep
                          : null
                      }
                    />
                  );
                })}
                {reviewMode && reviewProfileId && (
                  <Link
                    href={`/admin/services/${service.id}/review?step=3`}
                    className="inline-flex items-center gap-1.5 text-xs text-brand-navy hover:underline"
                  >
                    <ChevronLeft className="h-3 w-3" />
                    Back to profile list
                  </Link>
                )}
              </div>
            )}

            {/* Ownership Structure — editable, collapsible. B-102 — hide
                in the Review Wizard list view (step 3 with no profile)
                so the list mirrors the simplified ServiceWizardPeopleStep. */}
            {!(reviewMode && reviewStep === 3 && !reviewProfileId) && (
              <OwnershipStructure
                shareholders={typedRoles.filter((r: RoleWithProfile) => r.role === "shareholder")}
                serviceId={service.id}
                onSaved={handleRolesRefresh}
              />
            )}

            {/* B-074 — per-profile KYC subsection reviews are now inline in
                KycLongForm (each section row carries its own review badge +
                button + history). The parallel AdminKycPersonReviewPanel
                that used to live here was deleted in B-074 — same review
                keys, no data migration. */}
          </div>
        </ServiceCollapsibleSection>
        )}

        {/* ── Section 5: Documents ─────────────────────────────────────────── */}
        {/* B-085 — title carries upload-based count (X of Y uploaded).
            Pct + RAG dot are upload-based too. KYC-per-person docs are
            filtered out — they live in the per-profile Documents block. */}
        {(!reviewMode || reviewStep === 4) && (
        <ServiceCollapsibleSection
          title={`Documents (${documentsUploadedCount} of ${documentsExpectedCount} uploaded)`}
          percentage={documentsPct}
          ragStatus={documentsRag}
          statusLabelOverride={documentsStatusLabel}
          sectionKey="documents"
          anchorId="step-documents"
          variant="step"
          defaultOpen={reviewMode ? true : undefined}
        >
          <AdminDocumentsSection
            serviceId={service.id}
            documents={serviceLevelDocs}
            documentTypes={serviceDocTypes}
            kycDocs={kycDocs}
            kycDocTypes={kycDocTypes}
            updateRequests={updateRequests}
            roles={typedRoles}
            waivers={waivers}
            onWaiversChange={setWaivers}
            onDocumentAdded={(doc) => setDocuments((prev) => [...prev, doc])}
            onUpdateRequestAdded={(req) => setUpdateRequests((prev) => [req, ...prev])}
            onRefresh={handleRolesRefresh}
            onCommunicationSent={appendCommunication}
          />
        </ServiceCollapsibleSection>
        )}

        {/* ── B-119 — Actions (Substance / Bank / Registration / FSC) ──── */}
        {/* Top-level section now — appears in the step pill bar between
            Documents and the admin sections only when the current
            template has ≥1 binding. B-121 — Inside the Review Wizard,
            Actions is its own step (#5, after Documents) instead of
            bleeding into every section's body; gate by reviewStep so
            only step 5 renders this block. */}
        {hasActionBindings && (!reviewMode || reviewStep === 5) && (
          <ServiceCollapsibleSection
            title="Actions"
            percentage={actionsPct}
            ragStatus={ragFromPct(actionsPct)}
            sectionKey="actions"
            anchorId="step-actions"
            variant="step"
            defaultOpen={reviewMode ? true : undefined}
          >
            <ServiceActionsSection
              serviceId={service.id}
              serviceLabel={service.service_templates?.name ?? "Service"}
              templateActions={templateActions}
              actionsByKey={adminActions}
              initialSubstance={substance}
              referenceFormsByAction={referenceFormsByAction}
              submittedFormsByRefId={submittedFormsByRefId}
              onActionSaved={(updated) =>
                setAdminActions((prev) => ({
                  ...prev,
                  [updated.action_key]: updated,
                }))
              }
            />
          </ServiceCollapsibleSection>
        )}

        {/* B-102 — admin-only sections (Internal Notes / Risk
            Assessment) are hidden inside the Review Wizard — they don't
            belong in a focused review flow. */}
        {!reviewMode && (<>
        {/* ── Admin divider ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-3 py-2">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Admin</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* ── Section 6: Internal Notes ────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Internal Notes"
          icon={<StickyNote className="h-4 w-4" />}
          adminOnly
          defaultOpen={false}
        >
          <div className="pt-4 space-y-3">
            <p className="text-xs text-gray-400">Not visible to the client portal.</p>
            <textarea
              value={(serviceDetails._admin_notes as string | null) ?? ""}
              onChange={(e) => {
                setServiceDetails((prev) => ({ ...prev, _admin_notes: e.target.value }));
                setPendingChanges(true);
              }}
              rows={5}
              placeholder="Add internal notes about this service…"
              className="w-full border rounded-lg px-3 py-2.5 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand-blue"
            />
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className={BTN_PRIMARY}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save notes
            </Button>
          </div>
        </ServiceCollapsibleSection>

        {/* ── Section 7: Risk Assessment ───────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Risk Assessment"
          icon={<ShieldCheck className="h-4 w-4" />}
          adminOnly
          defaultOpen={false}
        >
          <div className="pt-4 space-y-4">
            {/* DD Level */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-gray-700">Due Diligence Level:</span>
              <select
                value={(serviceDetails._dd_level as string | null) ?? "cdd"}
                onChange={(e) => {
                  setServiceDetails((prev) => ({ ...prev, _dd_level: e.target.value }));
                  setPendingChanges(true);
                }}
                className="border rounded-lg px-3 py-1.5 text-sm"
              >
                {DD_LEVELS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>

            {/* Completion summary */}
            <div className="rounded-lg border bg-gray-50 p-4 space-y-3">
              <p className="text-sm font-medium text-gray-700">Completion Summary</p>
              {[
                { label: "Company Setup", pct: companySetupPct },
                { label: "Financial", pct: financialPct },
                { label: "Banking", pct: bankingPct },
                { label: "People & KYC", pct: peopleKycPct },
                { label: "Documents", pct: documentsPct },
              ].map(({ label, pct }) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-28 shrink-0">{label}</span>
                  <div className="flex-1 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-400" : "bg-red-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-8 text-right">{pct}%</span>
                  <span className={`h-2 w-2 rounded-full shrink-0 ${RAG_DOT[ragFromPct(pct)]}`} />
                </div>
              ))}
              <div className="pt-2 border-t">
                {(() => {
                  const overall = Math.round(
                    (companySetupPct + financialPct + bankingPct + peopleKycPct + documentsPct) / 5
                  );
                  const ready = overall === 100;
                  return (
                    <p className={`text-sm font-medium ${ready ? "text-green-700" : "text-amber-700"}`}>
                      {ready ? "✓ Ready for approval" : `Overall: ${overall}% — not yet ready`}
                    </p>
                  );
                })()}
              </div>
            </div>

            {/* Required docs check */}
            {requirements.filter((r) => r.requirement_type === "document").length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700">Required Documents</p>
                {requirements
                  .filter((r) => r.requirement_type === "document" && r.document_type_id)
                  .map((req) => {
                    const uploaded = documents.some((d) => d.document_type_id === req.document_type_id);
                    return (
                      <div key={req.id} className="flex items-center gap-2 text-sm">
                        {uploaded ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                        )}
                        <span className={uploaded ? "text-gray-700" : "text-gray-500"}>{req.label}</span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </ServiceCollapsibleSection>

        </>)}
      </div>{/* End left column */}

      {/* B-102 — right rail (Status / Internal Notes summary / Audit Trail)
          is hidden inside the Review Wizard. ── RIGHT: Sidebar (col-span-1).
          B-090 — at lg+ the whole rail pins as one block; if content is
          taller than the viewport, an internal scrollbar appears inside the
          rail. top-[200px] is the approximate height of the sticky shell
          above (back link + title card + stage strip + step indicator);
          Vanessa can tune visually if needed. On <lg the rail stacks below
          the main column with normal scrolling. */}
      {!reviewMode && (
      <div
        className="lg:sticky lg:top-[300px] lg:self-start lg:overflow-y-auto space-y-3"
        style={railMaxHeight ? { maxHeight: railMaxHeight } : undefined}
      >

        {/* B-120 — Progress meters card is the first item in the right
              rail so the at-a-glance state is what admin sees the moment
              the rail pins. Two circular gauges (Completed n/5 + Reviewed
              n/5) give the one-second answer for "how far through this
              service". Counts re-derive live from the section-reviews
              context. */}
        <ProgressMetersWithState
          pcts={
            hasActionBindings
              ? [
                  companySetupPct,
                  financialPct,
                  bankingPct,
                  peopleKycPct,
                  documentsPct,
                  actionsPct,
                ]
              : [
                  companySetupPct,
                  financialPct,
                  bankingPct,
                  peopleKycPct,
                  documentsPct,
                ]
          }
          steps={adminSteps}
        />

        {/* B-091 — service-level View Summary entry point. Falls back to
              a generic label when the service has no number assigned. */}
        <Button
          onClick={() => setServiceSummaryOpen(true)}
          className={`w-full justify-center h-10 ${BTN_PRIMARY}`}
        >
          <Eye className="h-4 w-4 mr-1.5" />
          {service.service_number
            ? `View Summary for ${service.service_number}`
            : "View Service Summary"}
        </Button>

        {/* B-118 — Peer / Manager review requests card. Sits between the
              View Summary button and the Pending card. Opens the request
              modal; lists open requests with reviewer chips + Mark/Close
              actions. */}
        <ReviewRequestsCard
          serviceId={service.id}
          currentUserId={currentUserId}
          requests={reviewRequests}
          profileNamesById={reviewProfileNamesById}
          onOpenModal={() => setRequestReviewModalOpen(true)}
          onClosed={(req, comms) => {
            upsertReviewRequest(req);
            appendCommunications(comms);
            router.refresh();
          }}
          highlightRequestId={highlightReviewRequestId}
        />

        {/* ── Status Change (B-093) — B-121 promoted to slot 3 of the
              right rail (above the Pending card) so admin sees the
              current stage + move/override controls before the action
              list. Four-row layout: label → current status badge →
              "updated on <date> by <name>" → action row (forward Move +
              Override dropdown). Forward button advances along
              FORWARD_CHAIN; greyed at terminals. Override fires a
              confirmation Dialog before applying. */}
        <div className="bg-white border rounded-xl px-4 py-3 space-y-2">
          {/* Row 1 — label */}
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</p>

          {/* Row 2 — current status */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-700">Current status:</span>
            <span className={`text-sm px-2 py-0.5 rounded-full font-medium ${statusBadgeClass(service.status)}`}>
              {getStatusLabel(service.status)}
            </span>
          </div>

          {/* Row 3 — updated-on-by (B-095: no more "by system" fallback —
              when the audit row is service_created we render "Created on …";
              when it's status_changed we render "Status updated on …";
              and if no audit row exists at all we render just the date.
              "Unknown user" would only appear if a new code path forgot to
              call writeAuditLog — treat that as a regression flag. */}
          <p className="text-xs text-gray-500">
            {lastStatusChange ? (
              <>
                {lastStatusChange.action === "status_changed" ? "Status updated" : "Created"} on{" "}
                <span className="text-gray-700">{formatDate(lastStatusChange.created_at)}</span>{" "}
                by{" "}
                <span className="text-gray-700">{lastStatusChange.actor_name ?? "Unknown user"}</span>
              </>
            ) : (
              <>
                Created on{" "}
                <span className="text-gray-700">{formatDate(service.created_at)}</span>
              </>
            )}
          </p>

          {/* Row 4 — actions. B-098: nextStage falls back to the last
              forward step so the button label doesn't collapse at
              terminals (active / rejected / closed); button stays
              greyed in that case. */}
          {(() => {
            const nextStage = getNextStage(service.status);
            const isTerminal = nextStage === null;
            const fallback = SERVICE_STATUS_FORWARD_CHAIN[SERVICE_STATUS_FORWARD_CHAIN.length - 1];
            const nextLabel = SERVICE_STATUS_LABELS[nextStage ?? fallback];
            return (
              <div className="flex items-center gap-2 pt-1">
                <Button
                  onClick={() => nextStage && void updateStatus(nextStage)}
                  disabled={isTerminal || updatingStatus}
                  className={`flex-1 h-9 text-xs ${BTN_PRIMARY} ${isTerminal ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  Move to {nextLabel}
                </Button>

                <div className="relative">
                  <select
                    value=""
                    onChange={(e) => {
                      requestOverride(e.target.value);
                      e.currentTarget.value = "";
                    }}
                    disabled={updatingStatus}
                    className="h-9 rounded-md border border-gray-300 bg-white pl-2.5 pr-6 text-xs cursor-pointer appearance-none hover:bg-gray-50"
                  >
                    <option value="">Stage Override</option>
                    {SERVICE_STATUS_ALL.map((s) => (
                      <option key={s} value={s} disabled={s === service.status}>
                        {SERVICE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                </div>

                {updatingStatus && <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />}
              </div>
            );
          })()}
        </div>

        {/* B-093 — Override confirmation dialog. Forward "Move to" doesn't
             need confirmation (normal flow); only overrides do. */}
        <Dialog open={pendingOverride !== null} onOpenChange={(open) => { if (!open) setPendingOverride(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Override status?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-600">
              This will change status from{" "}
              <span className="font-semibold">{getStatusLabel(service.status)}</span>{" "}
              to{" "}
              <span className="font-semibold">{pendingOverride ? getStatusLabel(pendingOverride) : ""}</span>.{" "}
              Use this for corrections only — normal flow advances via the &quot;Move to&quot; button.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPendingOverride(null)}>
                Cancel
              </Button>
              <Button onClick={confirmOverride} className={BTN_PRIMARY}>
                Override
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* B-111 Batch 2 — Pending card. B-121 — moved to slot 4 (after
              Status) so admins see stage + controls first, then the
              action list. One row per actionable item; click drills to
              the right place. */}
        <PendingCardWithState
          pcts={
            hasActionBindings
              ? [
                  companySetupPct,
                  financialPct,
                  bankingPct,
                  peopleKycPct,
                  documentsPct,
                  actionsPct,
                ]
              : [
                  companySetupPct,
                  financialPct,
                  bankingPct,
                  peopleKycPct,
                  documentsPct,
                ]
          }
          profiles={profilesForPending}
          missingDocCount={missingDocCount}
          autoAlerts={visibleAutoAlerts}
          manualAlerts={openManualAlerts}
          onAction={handlePendingAction}
          steps={adminSteps}
          actionSubsections={actionSubsectionRows}
        />

        {/* ── Assigned Officer ────────────────────────────────────────────── */}
        <div className="bg-white border rounded-xl px-4 py-3 space-y-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Assigned Officer</p>
          <div className="relative">
            <select
              value={assignedAdminId ?? ""}
              onChange={(e) => void assignAdmin(e.target.value || null)}
              className="w-full h-8 rounded-lg border border-gray-200 pl-2 pr-6 text-xs appearance-none bg-white cursor-pointer"
            >
              <option value="">— Unassigned —</option>
              {adminUsers.map((u) => (
                <option key={u.user_id} value={u.user_id}>
                  {u.full_name ?? u.email ?? u.user_id}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* ── Communications (B-108) ──────────────────────────────────────── */}
        <ServiceCommunicationsCard communications={communications} />

        {/* ── Section 8: Milestones ────────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Milestones"
          icon={<Milestone className="h-4 w-4" />}
          adminOnly
          defaultOpen={true}
        >
          {/* B-119 hotfix 2 — compact rows. Single row per milestone:
              toggle+label flex-1 on the left, date input shrink-0 on the
              right, py-1.5 instead of space-y-4 + py-4 wasted whitespace. */}
          <div className="pt-2 divide-y divide-gray-100">
            {(
              [
                {
                  label: "LOE Received",
                  field: "loe_received_at" as const,
                  boolField: "loe_received" as const,
                  enabled: milestones.loe_received,
                  date: milestones.loe_received_at,
                },
                {
                  label: "Invoice Sent",
                  field: "invoice_sent_at" as const,
                  boolField: undefined,
                  enabled: !!milestones.invoice_sent_at,
                  date: milestones.invoice_sent_at,
                },
                {
                  label: "Payment Received",
                  field: "payment_received_at" as const,
                  boolField: undefined,
                  enabled: !!milestones.payment_received_at,
                  date: milestones.payment_received_at,
                },
              ] as const
            ).map((m) => (
              <div
                key={m.label}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <button
                  onClick={() => void toggleMilestone(m.field, m.boolField)}
                  disabled={savingMilestone === m.field}
                  className={`flex items-center gap-2 text-xs font-medium transition-colors min-w-0 truncate ${
                    m.enabled ? "text-green-700" : "text-gray-400 hover:text-gray-600"
                  }`}
                >
                  {savingMilestone === m.field ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  ) : m.enabled ? (
                    <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : (
                    <div className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 shrink-0" />
                  )}
                  <span className="truncate">{m.label}</span>
                </button>

                {m.enabled ? (
                  <input
                    type="date"
                    value={m.date ? new Date(m.date).toISOString().split("T")[0] : ""}
                    onChange={(e) => void updateMilestoneDate(m.field, e.target.value)}
                    className="border rounded px-1.5 py-0.5 text-xs text-gray-700 shrink-0"
                  />
                ) : (
                  <span className="text-xs text-gray-300 shrink-0">—</span>
                )}
              </div>
            ))}
          </div>
        </ServiceCollapsibleSection>

        {/* ── Section 9: Audit Trail ───────────────────────────────────────── */}
        <ServiceCollapsibleSection
          title="Audit Trail"
          icon={<Clock className="h-4 w-4" />}
          adminOnly
          defaultOpen={true}
        >
          <div className="pt-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">By user:</span>
                <select
                  value={auditActorFilter}
                  onChange={(e) => setAuditActorFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="all">All users</option>
                  {auditActors.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Action:</span>
                <select
                  value={auditActionFilter}
                  onChange={(e) => setAuditActionFilter(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="all">All actions</option>
                  {auditActions.map((a) => (
                    <option key={a} value={a}>{a.replace(/_/g, " ")}</option>
                  ))}
                </select>
              </div>
              {(auditActorFilter !== "all" || auditActionFilter !== "all") && (
                <button
                  onClick={() => { setAuditActorFilter("all"); setAuditActionFilter("all"); }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Clear filters
                </button>
              )}
            </div>

            {auditEntries.length === 0 ? (
              <p className="text-sm text-gray-400">No audit events for this service yet.</p>
            ) : (
              <AuditTrail entries={auditForComponent} />
            )}
          </div>
        </ServiceCollapsibleSection>

      </div>
      )}{/* End right column / !reviewMode */}
      </div>{/* End grid */}

      {/* B-102 — Review Wizard sticky bottom nav. Replaces the scroll
          page's save bar; auto-saves dirty changes before advancing.
          B-109 Batch 3 — suppressed when the per-profile sub-wizard is
          active (`?profile=<id>` on step 3). The sub-wizard owns its own
          bottom nav (Back to list / Previous / Next / Mark Profile
          Reviewed); the parent nav would duplicate those affordances. */}
      {reviewMode && !reviewProfileId && (
        <ReviewWizardBottomNav
          serviceId={service.id}
          step={reviewStep}
          pendingChanges={pendingChanges}
          onSave={handleSaveReturningOk}
          profileSubstep={reviewProfileSubstep}
          totalProfilesInStep={uniqueRoles.length}
          stepPct={
            // B-110 — per-step completion drives the Force-review override
            // in `SectionReviewPanel`. Mirrors REVIEW_STEP_SECTION_KEYS
            // ordering: Company Setup / Financial / Banking / People & KYC
            // / Documents (/ Actions when bound — B-121).
            reviewStep === 0
              ? companySetupPct
              : reviewStep === 1
                ? financialPct
                : reviewStep === 2
                  ? bankingPct
                  : reviewStep === 3
                    ? peopleKycPct
                    : reviewStep === 4
                      ? documentsPct
                      : actionsPct
          }
          hasActions={hasActionBindings}
        />
      )}

      {/* Fixed bottom save bar — only shows when changes are pending */}
      {!reviewMode && pendingChanges && (
        <div className="fixed bottom-6 left-[260px] right-0 bg-white border-t border-x rounded-t-lg px-6 py-3 flex items-center justify-between z-50 shadow-[0_-2px_10px_rgba(0,0,0,0.08)]">
          <p className="text-sm text-amber-600 font-medium">You have unsaved changes</p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancel}
              className={`h-8 text-xs ${BTN_OUTLINE}`}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving}
              className={`h-8 text-xs ${BTN_PRIMARY}`}
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
              Save changes
            </Button>
          </div>
        </div>
      )}

      {/* Bottom padding for fixed bar */}
      {!reviewMode && pendingChanges && <div className="h-16" />}

      {/* B-091 — service-level summary modal */}
      {serviceSummaryOpen && (
        <ServiceSummaryDialog
          service={service}
          serviceFields={serviceFields}
          serviceDetails={serviceDetails}
          uniqueRoles={uniqueRoles}
          documents={documents}
          documentTypes={documentTypes}
          requirements={requirements}
          onClose={() => setServiceSummaryOpen(false)}
          onEdit={handleServiceSummaryEdit}
        />
      )}
    </div>
    </AdminApplicationSectionsProvider>
  );
}
