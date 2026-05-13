"use client";

// B-109 Batch 3 — Admin per-profile sub-wizard for /admin/services/[id]/review
// step 3 (People & KYC).
//
// Mirrors the client `PerPersonReviewWizard` structurally: clicking a profile
// in the wizard's step 3 list opens this sub-wizard which steps the admin
// through one section at a time. Section ordering follows
// `KYC_SECTIONS_INDIVIDUAL` / `KYC_SECTIONS_ORGANISATION` from
// `src/lib/kyc/sections.ts` (Identity → Financial → Compliance for
// individuals; Identity → Tax/Financial for organisations) — both gated by
// DD level — plus a final Documents sub-step that renders the same
// `KycDocsByCategory` block PersonCard already uses.
//
// The brief allows a separate `Address` sub-step when the client wizard has
// one; today's admin KYC schema keeps Address inside the Identity section
// (see `Your Identity` in `sections.ts`), so this sub-wizard rolls Address
// into Identity rather than splitting it. Tech-debt entry tracks unifying
// the section ordering with the client wizard.
//
// State ownership: `fields`, `setFields`, save flow, doc uploads, waivers,
// and the post-save splice all stay in PersonCard. This component is a
// presenter: it renders the sub-step indicator + active section + sub-wizard
// nav and calls back to PersonCard for the work.

import { Fragment, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  CheckCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import {
  KYC_SECTIONS_INDIVIDUAL,
  KYC_SECTIONS_ORGANISATION,
  gateSectionForLevel,
  type KycSection,
  type DueDiligenceLevel,
} from "@/lib/kyc/sections";
import { SectionReviewPanel } from "@/components/admin/SectionReviewPanel";
import { useSectionReview } from "@/components/admin/AdminApplicationSections";
import { KycDocsByCategory } from "@/components/kyc/KycDocsByCategory";
import { KycDocsSummary } from "@/components/kyc/KycDocsSummary";
import type { KycDocRowData } from "@/components/kyc/KycDocRow";
import type { ApplicationSectionReview } from "@/types";
import type {
  ServiceDoc,
  WaivedDocumentRequirement,
} from "@/app/(admin)/admin/services/[id]/page";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type SubStepKind = "form" | "documents";

interface SubStep {
  kind: SubStepKind;
  label: string;
  /** For `form` sub-steps: the KycSection.title that maps to this sub-step. */
  sectionTitle?: string;
}

export interface AdminPerProfileReviewWizardProps {
  // Identity
  serviceId: string;
  profileId: string;
  profileName: string;
  recordType: string | null;
  dueDiligenceLevel: string | null;

  // Save flow
  /** Returns true when the save succeeded (or there was nothing dirty).
   *  Bound to PersonCard.handleKycBarSave with a success return. */
  onSave: () => Promise<boolean>;
  isDirty: boolean;
  saving: boolean;

  // Documents sub-step
  kycDocsByCategory: { key: string; label: string; docs: KycDocRowData[] }[];
  totalKycUploaded: number;
  totalKycRequired: number;
  totalKycWaived: number;
  waivers: WaivedDocumentRequirement[];
  onWaiversChange: (next: WaivedDocumentRequirement[]) => void;
  onUploadClickFromDocs: (docTypeId: string) => void;
  onViewDoc: (docId: string) => void;
  uploadingDocTypeId: string | null;

  // Sub-step nav (URL-synced upstream)
  subStepIndex: number;
  onSubStepChange: (next: number) => void;
  onBackToList: () => void;
  onProfileReviewed: () => void;

  /** Slot for the active form sub-step's body. Caller (PersonCard) renders
   *  `<KycLongForm restrictToSectionTitles={[sectionTitle]} … />` here so
   *  the sub-wizard doesn't need to import the long-form internals. */
  renderFormSection: (sectionTitle: string) => React.ReactNode;

  // Indirect — props the caller doesn't need but the signature wants for
  // documentation / typing alignment with the brief.
  // (Reserved to match the brief's Props block; kept off the interface to
  //  avoid carrying through props that have no consumer here.)
  _profileDocuments?: ServiceDoc[];
}

// ─── Sub-step config ────────────────────────────────────────────────────────

function buildSubSteps(
  recordType: string | null,
  dueDiligenceLevel: string | null,
  hasPersonDocs: boolean,
): SubStep[] {
  const isOrg = recordType === "organisation";
  const ddLevel: DueDiligenceLevel =
    dueDiligenceLevel === "sdd" || dueDiligenceLevel === "edd"
      ? (dueDiligenceLevel as DueDiligenceLevel)
      : "cdd";
  const baseSections: KycSection[] = isOrg
    ? KYC_SECTIONS_ORGANISATION
    : KYC_SECTIONS_INDIVIDUAL;
  const formSteps: SubStep[] = baseSections
    .map((s) => gateSectionForLevel(s, ddLevel))
    .filter((s): s is KycSection => s !== null)
    .map((s) => ({
      kind: "form" as const,
      label: shortLabelForSection(s.title),
      sectionTitle: s.title,
    }));
  const steps: SubStep[] = [...formSteps];
  if (hasPersonDocs) {
    steps.push({ kind: "documents", label: "Documents" });
  }
  return steps;
}

function shortLabelForSection(title: string): string {
  switch (title) {
    case "Your Identity":
      return "Identity";
    case "Financial Profile":
      return "Financial";
    case "Declarations":
      return "Compliance";
    case "Company Details":
      return "Identity";
    case "Tax / Financial":
      return "Tax & Financial";
    default:
      return title;
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function AdminPerProfileReviewWizard(
  props: AdminPerProfileReviewWizardProps,
) {
  const {
    serviceId,
    profileId,
    profileName,
    recordType,
    dueDiligenceLevel,
    onSave,
    isDirty,
    saving,
    kycDocsByCategory,
    totalKycUploaded,
    totalKycRequired,
    totalKycWaived,
    waivers,
    onWaiversChange,
    onUploadClickFromDocs,
    onViewDoc,
    uploadingDocTypeId,
    subStepIndex,
    onSubStepChange,
    onBackToList,
    onProfileReviewed,
    renderFormSection,
  } = props;

  const hasPersonDocs = kycDocsByCategory.some((c) => c.docs.length > 0);
  const subSteps = useMemo(
    () => buildSubSteps(recordType, dueDiligenceLevel, hasPersonDocs),
    [recordType, dueDiligenceLevel, hasPersonDocs],
  );
  // Clamp the URL-provided sub-step into range.
  const safeIndex = Math.max(0, Math.min(subStepIndex, subSteps.length - 1));
  const current = subSteps[safeIndex];

  // Mark Profile Reviewed dialog (Batch 1's SectionReviewPanel). The
  // sectionKey is `people` (the same wizard step's key) — per Batch 1 §1.2
  // a profile-scoped subject id is deferred to a follow-up brief; the
  // dialog still writes the review row and the auto-advance below jumps
  // to the next profile. `useSectionReview` reads the latest aggregate
  // status from the AdminApplicationSectionsProvider so the dialog can
  // show the current status to the reviewer.
  const sectionKey = "people";
  const { currentStatus, onReviewSaved } = useSectionReview(sectionKey);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);

  async function flushIfDirty(): Promise<boolean> {
    if (!isDirty) return true;
    return onSave();
  }

  async function handlePrev() {
    if (safeIndex === 0) {
      onBackToList();
      return;
    }
    const ok = await flushIfDirty();
    if (!ok) return;
    onSubStepChange(safeIndex - 1);
  }

  async function handleNext() {
    if (safeIndex >= subSteps.length - 1) return;
    const ok = await flushIfDirty();
    if (!ok) return;
    onSubStepChange(safeIndex + 1);
  }

  async function openReviewDialog() {
    const ok = await flushIfDirty();
    if (!ok) {
      toast.error("Couldn't save changes — fix the errors and try again.");
      return;
    }
    setReviewDialogOpen(true);
  }

  async function handleReviewSaved(review: ApplicationSectionReview) {
    onReviewSaved(review);
    setReviewDialogOpen(false);
    toast.success(`Marked as ${review.status}.`);
    onProfileReviewed();
  }

  function handleSubStepClick(i: number) {
    if (i === safeIndex) return;
    // Same auto-save semantics as Next: don't lose dirty edits when admin
    // clicks a different sub-step pill.
    void (async () => {
      const ok = await flushIfDirty();
      if (!ok) return;
      onSubStepChange(i);
    })();
  }

  if (!current) {
    // Defensive: empty sub-step list (no fields and no docs). Render the
    // Back-to-list affordance so admin isn't stuck.
    return (
      <div className="rounded-lg border bg-white p-6">
        <p className="text-sm text-gray-600">
          No KYC sections to review for {profileName}.
        </p>
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={onBackToList}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-navy bg-white px-4 py-1.5 text-sm font-medium text-brand-navy hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to list
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-white">
      {/* ── Sub-step indicator ─────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b bg-gray-50">
        <div className="flex items-center gap-3 mb-2">
          <p className="text-xs uppercase tracking-wide text-gray-500">
            Reviewing
          </p>
          <p className="text-sm font-semibold text-brand-navy truncate">
            {profileName}
          </p>
        </div>
        <SubStepBreadcrumb
          steps={subSteps}
          currentIndex={safeIndex}
          onStepClick={handleSubStepClick}
        />
      </div>

      {/* ── Active sub-step body ───────────────────────────────────────── */}
      <div className="px-4 py-4">
        {current.kind === "form" && current.sectionTitle && (
          <>{renderFormSection(current.sectionTitle)}</>
        )}
        {current.kind === "documents" && (
          <DocumentsSubStep
            serviceId={serviceId}
            profileId={profileId}
            kycDocsByCategory={kycDocsByCategory}
            totalKycUploaded={totalKycUploaded}
            totalKycRequired={totalKycRequired}
            totalKycWaived={totalKycWaived}
            waivers={waivers}
            onWaiversChange={onWaiversChange}
            onUploadClick={onUploadClickFromDocs}
            onViewClick={onViewDoc}
            uploadingDocTypeId={uploadingDocTypeId}
          />
        )}
      </div>

      {/* ── Bottom sub-wizard nav ──────────────────────────────────────── */}
      <div className="border-t px-4 py-3 flex items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handlePrev()}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-full border border-brand-navy bg-white px-4 py-1.5 text-sm font-medium text-brand-navy hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            {safeIndex === 0 ? "Back to list" : "Previous"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void openReviewDialog()}
            disabled={saving}
            style={{ backgroundColor: "#24a0ed" }}
            className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Mark Profile Reviewed
          </button>
          {safeIndex < subSteps.length - 1 && (
            <button
              type="button"
              onClick={() => void handleNext()}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand-navy px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-blue disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Next
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <SectionReviewPanel
        applicationId={serviceId}
        sectionKey={sectionKey}
        sectionLabel={`People & KYC · ${profileName}`}
        currentStatus={currentStatus}
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        onSaved={(r) => void handleReviewSaved(r)}
      />
    </div>
  );
}

// ─── Sub-step breadcrumb (small, lifted from the client visual) ─────────────

function SubStepBreadcrumb({
  steps,
  currentIndex,
  onStepClick,
}: {
  steps: SubStep[];
  currentIndex: number;
  onStepClick: (i: number) => void;
}) {
  return (
    <nav
      aria-label="Profile sub-step progress"
      className="flex items-center gap-1 flex-wrap text-sm"
    >
      {steps.map((step, i) => {
        const isCurrent = i === currentIndex;
        const isComplete = i < currentIndex;
        return (
          <Fragment key={`${step.kind}-${step.label}`}>
            {i > 0 && (
              <ChevronRight
                className="h-3.5 w-3.5 text-gray-400 shrink-0"
                aria-hidden="true"
              />
            )}
            <button
              type="button"
              onClick={() => onStepClick(i)}
              aria-current={isCurrent ? "step" : undefined}
              className={cn(
                "h-8 px-2 rounded inline-flex items-center gap-1.5 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                isCurrent && "font-bold text-brand-navy",
                isComplete && !isCurrent && "text-gray-700 hover:bg-gray-50",
                !isCurrent &&
                  !isComplete &&
                  "text-gray-600 hover:bg-gray-50",
              )}
            >
              {isComplete && (
                <Check
                  className="h-3.5 w-3.5 text-emerald-600 shrink-0"
                  aria-hidden="true"
                />
              )}
              <span>{step.label}</span>
            </button>
          </Fragment>
        );
      })}
    </nav>
  );
}

// ─── Documents sub-step ─────────────────────────────────────────────────────

function DocumentsSubStep({
  serviceId,
  profileId,
  kycDocsByCategory,
  totalKycUploaded,
  totalKycRequired,
  totalKycWaived,
  waivers,
  onWaiversChange,
  onUploadClick,
  onViewClick,
  uploadingDocTypeId,
}: {
  serviceId: string;
  profileId: string;
  kycDocsByCategory: { key: string; label: string; docs: KycDocRowData[] }[];
  totalKycUploaded: number;
  totalKycRequired: number;
  totalKycWaived: number;
  waivers: WaivedDocumentRequirement[];
  onWaiversChange: (next: WaivedDocumentRequirement[]) => void;
  onUploadClick: (docTypeId: string) => void;
  onViewClick: (docId: string) => void;
  uploadingDocTypeId: string | null;
}) {
  return (
    <div className="space-y-4">
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
          document
            .getElementById(`admin-subwizard-docs-${profileId}-cat-${cat}`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />
      <KycDocsByCategory
        anchorPrefix={`admin-subwizard-docs-${profileId}`}
        showAdminControls
        uploadingDocTypeId={uploadingDocTypeId}
        categories={kycDocsByCategory}
        onUploadClick={onUploadClick}
        onViewClick={onViewClick}
        serviceId={serviceId}
        profileId={profileId}
        waivers={waivers}
        onWaiversChange={onWaiversChange}
      />
    </div>
  );
}
