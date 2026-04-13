import { createAdminClient } from "@/lib/supabase/admin";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActivityFeed } from "@/components/shared/ActivityFeed";

export const dynamic = "force-dynamic";
import type { ActivityEntry } from "@/components/shared/ActivityFeed";
import { DashboardAnalytics } from "@/components/admin/DashboardAnalytics";
import type {
  DashboardAnalyticsData,
  AvgDaysPoint,
  StageTimeRow,
  ApprovalRatePoint,
  StatusCountBar,
} from "@/components/admin/DashboardAnalytics";
import Link from "next/link";
import { APPLICATION_STATUS_LABELS } from "@/lib/utils/constants";
import type { ApplicationStatus } from "@/types";

// ── Helpers ────────────────────────────────────────────────────────────────

function getLast6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    );
  }
  return months;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return new Date(parseInt(y), parseInt(m) - 1, 1).toLocaleString("default", {
    month: "short",
  });
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return (
    Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
  );
}

function toMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

const STATUS_HEX: Record<string, string> = {
  draft: "#9ca3af",
  submitted: "#3b82f6",
  in_review: "#eab308",
  pending_action: "#f97316",
  verification: "#a855f7",
  approved: "#22c55e",
  rejected: "#ef4444",
};

const ALL_STATUSES: ApplicationStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "pending_action",
  "verification",
  "approved",
  "rejected",
];

const FLOW_STAGES: ApplicationStatus[] = [
  "draft",
  "submitted",
  "in_review",
  "pending_action",
  "verification",
  "approved",
];

// ── Page ───────────────────────────────────────────────────────────────────

export default async function AdminDashboardPage() {
  const supabase = createAdminClient();

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  const fourMonthsAgo = new Date();
  fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

  const [
    { count: total },
    { count: submitted },
    { count: pendingAction },
    { data: rawActivity },
    { data: approvedApps },
    { data: stageChanges },
    { data: completedApps },
    { data: allStatusApps },
  ] = await Promise.all([
    supabase.from("applications").select("*", { count: "exact", head: true }).eq("is_deleted", false),
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("is_deleted", false)
      .eq("status", "submitted"),
    supabase
      .from("applications")
      .select("*", { count: "exact", head: true })
      .eq("is_deleted", false)
      .eq("status", "pending_action"),
    supabase
      .from("audit_log")
      .select(
        "id, action, actor_name, actor_role, created_at, application_id, detail, applications(business_name)"
      )
      .order("created_at", { ascending: false })
      .limit(10),
    // Card 1: applications approved in the last 6 months
    // Note: submitted_at can be null if admin approved directly — fall back to created_at
    supabase
      .from("applications")
      .select("approved_at, submitted_at, created_at")
      .eq("is_deleted", false)
      .eq("status", "approved")
      .gte("approved_at", sixMonthsAgo.toISOString())
      .not("approved_at", "is", null),
    // Card 2: all status change events (for stage duration calc)
    supabase
      .from("audit_log")
      .select("application_id, previous_value, new_value, created_at")
      .eq("action", "status_changed")
      .order("application_id")
      .order("created_at"),
    // Card 3: approved/rejected apps in last 4 months
    supabase
      .from("applications")
      .select("status, updated_at")
      .eq("is_deleted", false)
      .in("status", ["approved", "rejected"])
      .gte("updated_at", fourMonthsAgo.toISOString()),
    // Card 4: all apps for status count
    supabase.from("applications").select("status").eq("is_deleted", false),
  ]);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);
  const { count: approvedThisMonth } = await supabase
    .from("applications")
    .select("*", { count: "exact", head: true })
    .eq("is_deleted", false)
    .eq("status", "approved")
    .gte("updated_at", startOfMonth.toISOString());

  // ── Stat cards ────────────────────────────────────────────────────────────

  const stats = [
    { label: "Total Applications", value: total ?? 0, href: "/admin/applications" },
    {
      label: "Awaiting Review",
      value: submitted ?? 0,
      href: "/admin/queue",
    },
    {
      label: "Awaiting Client",
      value: pendingAction ?? 0,
      href: "/admin/queue",
    },
    {
      label: "Approved This Month",
      value: approvedThisMonth ?? 0,
      href: "/admin/applications",
    },
  ];

  // ── Activity feed ─────────────────────────────────────────────────────────

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
        ? `/admin/applications/${entry.application_id}`
        : null,
    };
  });

  // ── Card 1: Avg days to approval ──────────────────────────────────────────

  const last6 = getLast6Months();
  const byApprovalMonth: Record<string, number[]> = {};
  (approvedApps || []).forEach((app) => {
    if (!app.approved_at) return;
    // Fall back to created_at if submitted_at is null (admin-approved without submit flow)
    const startDate = app.submitted_at ?? app.created_at;
    if (!startDate) return;
    const days =
      (new Date(app.approved_at).getTime() - new Date(startDate).getTime()) /
      (1000 * 60 * 60 * 24);
    if (days < 0) return; // sanity check
    const key = toMonthKey(app.approved_at);
    if (!byApprovalMonth[key]) byApprovalMonth[key] = [];
    byApprovalMonth[key].push(days);
  });
  const avgDaysToApproval: AvgDaysPoint[] = last6.map((key) => ({
    month: monthLabel(key),
    days: byApprovalMonth[key] ? avg(byApprovalMonth[key]) : null,
  }));

  // ── Card 2: Time in stage ────────────────────────────────────────────────

  // Group status changes by application, sorted by created_at
  const appChanges: Record<
    string,
    { status: string; ts: number }[]
  > = {};
  (stageChanges || []).forEach((entry) => {
    const nv = entry.new_value as Record<string, string> | null;
    if (!nv?.status) return;
    if (!appChanges[entry.application_id]) {
      appChanges[entry.application_id] = [];
    }
    appChanges[entry.application_id].push({
      status: nv.status,
      ts: new Date(entry.created_at).getTime(),
    });
  });
  // For each app, compute time between consecutive transitions.
  // The time delta between events[i] and events[i+1] is the duration spent in events[i].status
  const stageDurations: Record<string, number[]> = {};
  Object.values(appChanges).forEach((events) => {
    events.sort((a, b) => a.ts - b.ts);
    for (let i = 0; i < events.length - 1; i++) {
      const stage = events[i].status;
      const days = (events[i + 1].ts - events[i].ts) / (1000 * 60 * 60 * 24);
      if (!stageDurations[stage]) stageDurations[stage] = [];
      stageDurations[stage].push(days);
    }
  });
  const timeInStage: StageTimeRow[] = FLOW_STAGES.map((s) => ({
    stageKey: s,
    stageName: APPLICATION_STATUS_LABELS[s],
    avgDays: stageDurations[s] ? avg(stageDurations[s]) : 0,
  }));

  // ── Card 3: Approval rate per month ──────────────────────────────────────

  const last4 = last6.slice(2);
  const byCompleteMonth: Record<string, { approved: number; rejected: number }> =
    {};
  (completedApps || []).forEach((app) => {
    const key = toMonthKey(app.updated_at);
    if (!byCompleteMonth[key]) byCompleteMonth[key] = { approved: 0, rejected: 0 };
    if (app.status === "approved") byCompleteMonth[key].approved++;
    if (app.status === "rejected") byCompleteMonth[key].rejected++;
  });
  const approvalRate: ApprovalRatePoint[] = last4.map((key) => {
    const d = byCompleteMonth[key];
    const t = (d?.approved ?? 0) + (d?.rejected ?? 0);
    return {
      month: monthLabel(key),
      rate: t > 0 ? Math.round(((d?.approved ?? 0) / t) * 100) : 0,
    };
  });

  // ── Card 4: Applications by status ───────────────────────────────────────

  const statusCount: Record<string, number> = {};
  (allStatusApps || []).forEach((app) => {
    statusCount[app.status] = (statusCount[app.status] || 0) + 1;
  });
  const appsByStatus: StatusCountBar[] = ALL_STATUSES.map((s) => ({
    status: s,
    label: APPLICATION_STATUS_LABELS[s],
    count: statusCount[s] ?? 0,
    fill: STATUS_HEX[s] ?? "#94a3b8",
  }));

  const analyticsData: DashboardAnalyticsData = {
    avgDaysToApproval,
    timeInStage,
    approvalRate,
    appsByStatus,
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-brand-navy">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          Overview of the onboarding pipeline
        </p>
      </div>

      {/* Stat summary row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 mb-8">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="hover:border-brand-navy/30 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-500">
                  {stat.label}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-brand-navy">
                  {stat.value}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Analytics KPI grid */}
      <div className="mb-8">
        <DashboardAnalytics data={analyticsData} />
      </div>

      {/* Activity + Quick Links */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-brand-navy">
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed entries={activityEntries} />
            </CardContent>
          </Card>
        </div>

        <div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base text-brand-navy">
                Quick Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { label: "All Applications", href: "/admin/applications" },
                { label: "Review Queue", href: "/admin/queue" },
                { label: "All Clients", href: "/admin/clients" },
                { label: "Service Templates", href: "/admin/settings/templates" },
                { label: "Verification Rules", href: "/admin/settings/rules" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-lg border border-gray-200 px-3 py-2 text-sm text-brand-navy hover:bg-gray-50 hover:border-brand-navy/30 transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
