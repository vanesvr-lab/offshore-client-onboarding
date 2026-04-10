import Link from "next/link";
import { auth } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { ActivityFeed } from "@/components/shared/ActivityFeed";
import { OnboardingBanner } from "@/components/client/OnboardingBanner";
import { CompletionChecklist } from "@/components/client/CompletionChecklist";
import { calculateKycCompletion } from "@/lib/utils/completionCalculator";
import { formatDate } from "@/lib/utils/formatters";
import type { ActivityEntry } from "@/components/shared/ActivityFeed";
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
  ]);

  type AppWithTemplate = Application & { service_templates?: { name: string } };
  const apps = (applications || []) as AppWithTemplate[];
  const typedKyc = (kycRecords ?? []) as KycRecord[];
  const typedDocs = (documents ?? []) as DocumentRecord[];

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

  // Activity feed: audit_log entries for this client's apps
  const appIds = apps.map((a) => a.id);
  const { data: rawActivity } = appIds.length > 0
    ? await supabase
        .from("audit_log")
        .select("id, action, actor_name, actor_role, created_at, application_id, detail, applications(business_name)")
        .in("application_id", appIds)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [] };

  const activityEntries: ActivityEntry[] = (rawActivity || []).map((entry) => {
    const app = entry.applications as { business_name?: string | null } | null;
    return {
      id: entry.id,
      action: entry.action,
      actor_name: entry.actor_name,
      actor_role: entry.actor_role,
      created_at: entry.created_at,
      application_id: entry.application_id,
      detail: entry.detail as Record<string, unknown> | null,
      applicationName: app?.business_name ?? null,
      applicationHref: entry.application_id
        ? `/applications/${entry.application_id}`
        : null,
    };
  });

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
        {/* Left: Banner + Applications + Activity */}
        <div className="lg:col-span-2 space-y-6">
          {/* Smart banner */}
          <OnboardingBanner
            stage={stage}
            kycPercentage={kycPct}
            appName={latestApp?.business_name ?? undefined}
            appId={latestApp?.id ?? undefined}
            templateId={latestApp?.template_id ?? undefined}
          />

          {/* Applications list */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <CardTitle className="text-base text-brand-navy">Applications</CardTitle>
              <Link href="/apply">
                <Button size="sm" className="bg-brand-navy hover:bg-brand-blue">
                  New application
                </Button>
              </Link>
            </CardHeader>
            <CardContent className="pt-0">
              {apps.length === 0 ? (
                <p className="text-sm text-gray-400 py-4 text-center">No applications yet.</p>
              ) : (
                <div className="space-y-2">
                  {apps.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between rounded-lg border px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-brand-navy text-sm">
                          {app.business_name || "Untitled Application"}
                        </p>
                        <p className="text-xs text-gray-500">
                          {app.service_templates?.name}
                          {app.submitted_at && ` · Submitted ${formatDate(app.submitted_at)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <StatusBadge status={app.status} />
                        <Link
                          href={
                            app.status === "draft"
                              ? `/apply/${app.template_id}/details?applicationId=${app.id}`
                              : `/applications/${app.id}`
                          }
                        >
                          <Button variant="outline" size="sm">
                            {app.status === "draft" ? "Continue" : "View"}
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity feed */}
          {activityEntries.length > 0 && (
            <Card>
              <CardHeader className="py-4">
                <CardTitle className="text-base text-brand-navy">Activity</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ActivityFeed entries={activityEntries} />
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Completion checklist (sticky) */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <CompletionChecklist sections={checklistSections} />
        </div>
      </div>
    </div>
  );
}
