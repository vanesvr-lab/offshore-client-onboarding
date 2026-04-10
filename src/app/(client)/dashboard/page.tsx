import Link from "next/link";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { OnboardingBanner } from "@/components/client/OnboardingBanner";
import { CompletionChecklist } from "@/components/client/CompletionChecklist";
import { KycTaskGroup, type KycChildTask } from "@/components/client/KycTaskGroup";
import { calculateKycCompletion } from "@/lib/utils/completionCalculator";
import { formatDate } from "@/lib/utils/formatters";
import { CheckCircle2, Circle, AlertTriangle, ArrowRight } from "lucide-react";
import type { Application, KycRecord, DocumentRecord } from "@/types";
import type { OnboardingStage } from "@/components/client/OnboardingBanner";
import type { ChecklistSection } from "@/components/client/CompletionChecklist";

export default async function DashboardPage() {
  const session = await auth();
  const supabase = createAdminClient();

  const { data: clientUser } = await supabase
    .from("client_users")
    .select("client_id, clients(company_name)")
    .eq("user_id", session!.user.id)
    .maybeSingle();

  const companyName =
    (clientUser?.clients as { company_name?: string } | null)?.company_name;
  const clientId = clientUser?.client_id ?? null;

  const [
    { data: applications },
    { data: kycRecords },
    { data: documents },
    { data: appPersons },
  ] = await Promise.all([
    clientId
      ? supabase
          .from("applications")
          .select("*, service_templates(name)")
          .eq("client_id", clientId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    clientId
      ? supabase.from("kyc_records").select("*").eq("client_id", clientId)
      : Promise.resolve({ data: [] }),
    clientId
      ? supabase
          .from("documents")
          .select("*, document_types(name)")
          .eq("client_id", clientId)
      : Promise.resolve({ data: [] }),
    // Fetch application_persons to get roles for KYC records
    clientId
      ? supabase
          .from("application_persons")
          .select("kyc_record_id, role")
          .in(
            "application_id",
            // We'll cross-join after fetch; pass all app IDs
            ([] as string[]) // placeholder — resolved below after apps fetch
          )
      : Promise.resolve({ data: [] }),
  ]);

  type AppWithTemplate = Application & {
    service_templates?: { name: string };
    service_details?: Record<string, unknown>;
  };
  const apps = (applications || []) as AppWithTemplate[];
  const typedKyc = (kycRecords ?? []) as KycRecord[];
  const typedDocs = (documents ?? []) as DocumentRecord[];

  // Fetch application_persons for all apps to resolve roles for KYC records
  const allAppIds = apps.map((a) => a.id);
  const kycRoleMap: Record<string, string> = {}; // kyc_record_id → role
  if (allAppIds.length > 0) {
    const { data: persons } = await supabase
      .from("application_persons")
      .select("kyc_record_id, role")
      .in("application_id", allAppIds);
    for (const p of persons ?? []) {
      if (p.kyc_record_id) kycRoleMap[p.kyc_record_id] = p.role;
    }
  }
  // suppress unused warning from placeholder fetch
  void appPersons;

  // Compute KYC completion across all records
  let totalFilled = 0;
  let totalItems = 0;

  const recordCompletions = typedKyc.map((rec) => {
    const result = calculateKycCompletion(rec, typedDocs);
    const recFilled = result.sections.reduce((s, sec) => s + sec.filled, 0);
    const recTotal = result.sections.reduce((s, sec) => s + sec.total, 0);
    totalFilled += recFilled;
    totalItems += recTotal;
    return { record: rec, result, recFilled, recTotal };
  });

  const kycPct = totalItems > 0 ? Math.round((totalFilled / totalItems) * 100) : 0;
  const emptyFields = totalItems - totalFilled;
  const estMinutes = Math.ceil((emptyFields * 30) / 60);

  // Derive onboarding stage
  const latestApp = apps[0] ?? null;
  let stage: OnboardingStage = "no_kyc";
  if (typedKyc.length === 0) {
    stage = "no_kyc";
  } else if (kycPct < 100) {
    stage = "kyc_incomplete";
  } else if (!latestApp) {
    stage = "kyc_complete_no_app";
  } else if (latestApp.status === "approved") {
    stage = "app_approved";
  } else if (latestApp.status === "rejected") {
    stage = "app_rejected";
  } else if (latestApp.status === "draft") {
    stage = "app_draft";
  } else {
    stage = "app_submitted";
  }

  // Build checklist sections
  const checklistSections: ChecklistSection[] = [
    ...recordCompletions.map(({ record, recFilled, recTotal }) => ({
      label: record.record_type === "individual" ? "Personal KYC" : "Organisation KYC",
      filled: recFilled,
      total: recTotal,
      href: "/kyc",
    })),
    {
      label: "Application",
      filled: latestApp && latestApp.status !== "draft" ? 1 : 0,
      total: 1,
      href:
        latestApp && latestApp.status === "draft"
          ? `/apply/${latestApp.template_id}/details?applicationId=${latestApp.id}`
          : "/apply",
    },
  ];

  // Build KYC child tasks (for grouped KYC item in Next Steps)
  const kycChildren: KycChildTask[] = recordCompletions.map(({ record, recFilled, recTotal }) => {
    const role = kycRoleMap[record.id];
    const roleFallback = role
      ? role.charAt(0).toUpperCase() + role.slice(1)
      : record.record_type === "individual" ? "Individual" : "Organisation";
    const name = (record as unknown as { full_name?: string }).full_name || roleFallback;
    return {
      id: `kyc-${record.id}`,
      name,
      description: recFilled < recTotal
        ? `${recTotal - recFilled} fields remaining`
        : "All fields complete",
      status: recFilled >= recTotal ? "done" : recFilled > 0 ? "in_progress" : "pending",
    };
  });

  // Build non-KYC pending tasks
  interface PendingTask {
    id: string;
    label: string;
    description: string;
    href: string;
    status: "pending" | "in_progress" | "done";
    priority: number;
  }

  const pendingTasks: PendingTask[] = [];

  for (const app of apps) {
    const templateName = app.service_templates?.name ?? "Application";
    const ref = app.reference_number ?? templateName;

    if (app.status === "draft") {
      const missingSections: string[] = [];
      if (!app.contact_name?.trim()) missingSections.push("Primary Contact");
      if (!app.service_details || Object.keys(app.service_details).length === 0) missingSections.push("Service Details");

      pendingTasks.push({
        id: `app-details-${app.id}`,
        label: `Fill details for ${ref}`,
        description: missingSections.length > 0
          ? `Pending: ${missingSections.join(", ")}`
          : "Details filled — upload documents next",
        href: `/apply/${app.template_id}/details?applicationId=${app.id}`,
        status: missingSections.length > 0 ? "pending" : "in_progress",
        priority: 2,
      });
    } else if (app.status === "pending_action") {
      pendingTasks.push({
        id: `app-action-${app.id}`,
        label: `Action required for ${ref}`,
        description: app.admin_notes ?? "Admin has requested additional information",
        href: `/applications/${app.id}`,
        status: "pending",
        priority: 0,
      });
    } else if (app.status === "submitted" || app.status === "in_review" || app.status === "verification") {
      pendingTasks.push({
        id: `app-review-${app.id}`,
        label: `${ref} — Under review`,
        description: `Status: ${app.status.replace(/_/g, " ")}`,
        href: `/applications/${app.id}`,
        status: "done",
        priority: 8,
      });
    } else if (app.status === "approved") {
      pendingTasks.push({
        id: `app-approved-${app.id}`,
        label: `${ref} — Approved`,
        description: "Application has been approved",
        href: `/applications/${app.id}`,
        status: "done",
        priority: 9,
      });
    }
  }

  pendingTasks.sort((a, b) => a.priority - b.priority);

  const nextAction = (() => {
    if (stage === "no_kyc") return { label: "Complete your KYC profile", href: "/kyc" };
    if (stage === "kyc_incomplete") return { label: "Continue your KYC profile", href: "/kyc" };
    if (stage === "kyc_complete_no_app") return { label: "Start your application", href: "/apply" };
    if (stage === "app_draft" && latestApp)
      return {
        label: "Continue your application",
        href: `/apply/${latestApp.template_id}/details?applicationId=${latestApp.id}`,
      };
    return null;
  })();

  // A4: derive per-app button label/message
  function appActionLabel(app: AppWithTemplate): { message: string; buttonLabel: string; buttonHref: string; urgent?: boolean } {
    const detailsHref = `/apply/${app.template_id}/details?applicationId=${app.id}`;
    const viewHref = `/applications/${app.id}`;
    const hasDetails = app.service_details && Object.keys(app.service_details).length > 0;

    if (app.status === "draft") {
      if (!hasDetails) return { message: "Fill in solution details to continue", buttonLabel: "Start →", buttonHref: detailsHref };
      return { message: "Complete and submit to proceed", buttonLabel: "Continue →", buttonHref: detailsHref };
    }
    if (app.status === "pending_action") return { message: "Action required", buttonLabel: "Action Required", buttonHref: viewHref, urgent: true };
    if (app.status === "approved") return { message: "Application approved", buttonLabel: "View", buttonHref: viewHref };
    return { message: `Status: ${app.status.replace(/_/g, " ")}`, buttonLabel: "Track", buttonHref: viewHref };
  }

  return (
    <div className="space-y-6">
      {/* Header + progress bar */}
      <div className="rounded-lg border bg-white px-5 py-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h1 className="text-xl font-bold text-brand-navy">
              {companyName ? companyName : "Welcome"}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">Your Onboarding Progress</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-brand-navy">{kycPct}%</p>
            <p className="text-xs text-gray-400">complete</p>
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden mb-3">
          <div
            className="h-full rounded-full bg-brand-accent transition-all"
            style={{ width: `${kycPct}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-xs text-gray-500">
          {emptyFields > 0 ? (
            <span>Estimated time to finish: ~{estMinutes} {estMinutes === 1 ? "minute" : "minutes"}</span>
          ) : (
            <span className="text-green-600 font-medium">KYC profile complete</span>
          )}
          {nextAction && (
            <Link href={nextAction.href} className="text-brand-blue hover:underline font-medium">
              Next: {nextAction.label} →
            </Link>
          )}
        </div>
      </div>

      {/* Main layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Banner + Tasks + Solutions */}
        <div className="lg:col-span-2 space-y-6">
          <OnboardingBanner
            stage={stage}
            kycPercentage={kycPct}
            appName={latestApp?.business_name ?? undefined}
            appId={latestApp?.id ?? undefined}
            templateId={latestApp?.template_id ?? undefined}
          />

          {/* Pending Tasks & Next Steps */}
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-base text-brand-navy">Your Next Steps</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {kycChildren.length === 0 && pendingTasks.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No pending tasks. You&apos;re all caught up!</p>
              ) : (
                <div className="space-y-1">
                  {/* Grouped KYC tasks */}
                  {kycChildren.length > 0 && (
                    <KycTaskGroup tasks={kycChildren} />
                  )}
                  {/* Non-KYC tasks */}
                  {pendingTasks.map((task) => (
                    <Link
                      key={task.id}
                      href={task.href}
                      className="flex items-center gap-3 rounded-lg px-3 py-3 hover:bg-gray-50 transition-colors group"
                    >
                      <div className="shrink-0">
                        {task.status === "done" ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : task.status === "in_progress" ? (
                          <AlertTriangle className="h-5 w-5 text-amber-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-gray-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${task.status === "done" ? "text-gray-400 line-through" : "text-brand-navy"}`}>
                          {task.label}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{task.description}</p>
                      </div>
                      {task.status !== "done" && (
                        <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-brand-blue shrink-0" />
                      )}
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Solutions & Services */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base text-brand-navy">Solutions & Services</CardTitle>
              <Link href="/apply">
                <Button size="sm" className="bg-brand-navy hover:bg-brand-blue">
                  New Solution
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {apps.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No solutions yet.</p>
              ) : (
                <div className="space-y-2">
                  {apps.map((app) => {
                    const { message, buttonLabel, buttonHref, urgent } = appActionLabel(app);
                    return (
                      <div
                        key={app.id}
                        className="flex items-center justify-between rounded-lg border px-4 py-3"
                      >
                        <div>
                          <p className="font-medium text-brand-navy text-sm">
                            {app.reference_number || app.business_name || "Draft"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {app.service_templates?.name}
                            {app.submitted_at && ` · Submitted ${formatDate(app.submitted_at)}`}
                          </p>
                          <p className={`text-xs mt-0.5 ${urgent ? "text-amber-600 font-medium" : "text-gray-400"}`}>
                            {message}
                          </p>
                        </div>
                        <div className="flex items-center gap-3">
                          <StatusBadge status={app.status} />
                          <Link href={buttonHref}>
                            <Button
                              variant="outline"
                              size="sm"
                              className={urgent ? "border-amber-400 text-amber-600 hover:bg-amber-50" : ""}
                            >
                              {buttonLabel}
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Completion checklist */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <CompletionChecklist sections={checklistSections} />
        </div>
      </div>
    </div>
  );
}
